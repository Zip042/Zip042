import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { ZodType } from "zod";
import { loadEnv } from "../env.js";
import { mockExtraction } from "../mock/extraction.js";
import { badRequest, internal, upstreamFailed } from "../lib/errors.js";
import { log } from "../lib/logger.js";
import {
  brokerageStatementExtractionSchema,
  clampConfidence,
  leaseDraftExtractionSchema,
  registryExtractionSchema,
  sanitizeAmount,
  sanitizeArea,
  sanitizeDate,
  type BrokerageExtractionRaw,
  type LeaseExtractionRaw,
  type RegistryExtractionRaw,
} from "../schemas/extraction.js";
import type {
  BrokerageStatementExtraction,
  LeaseDraftExtraction,
  RegistryExtraction,
  RegistryRight,
} from "../domain/types.js";

/**
 * 문서 → 구조화 데이터 추출.
 *
 * 역할 분리가 이 서비스의 핵심 설계다.
 *   AI  : 문서에 **적혀 있는 것**을 읽어 구조화한다. 해석·판단·추측을 하지 않는다.
 *   서버: 그 값으로 위험을 판정한다 (domain/*).
 *
 * 이렇게 나누는 이유
 *  1) 재현성 — 같은 문서에 같은 판정. 규칙이 바뀌면 저장된 payload로 재분석만 하면 된다.
 *  2) 설명 가능성 — "왜 위험한가"를 조문과 숫자로 설명할 수 있다.
 *  3) 안전 — 모델이 "안전해 보입니다"라고 말하는 사고를 구조적으로 막는다.
 */

export const EXTRACTION_SCHEMA_VERSION = "2026-08-20";

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  if (client) return client;
  const env = loadEnv();
  // apiKey 를 넘기지 않으면 SDK가 ANTHROPIC_API_KEY / ant 프로필을 순서대로 찾는다.
  client = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : new Anthropic();
  return client;
}

export function isExtractionAvailable(): boolean {
  // 목 모드에서는 API 키 없이도 픅스처로 판독이 "가능"하다.
  if (loadEnv().mode === "mock") return true;
  return Boolean(loadEnv().ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY);
}

/** 문서 판독 호출에 함께 넘기는 메타 정보. 목 모드에서 시나리오를 고르는 데 쓴다. */
export interface ExtractionContext {
  documentId?: string;
  originalName?: string | null;
}

const BASE_SYSTEM_PROMPT = `당신은 대한민국 부동산 서류를 읽어 구조화된 데이터로 옮기는 추출기입니다.

절대 규칙:
1. 문서에 **적혀 있는 것만** 추출합니다. 추론하거나 일반적인 관행으로 빈칸을 채우지 마세요.
2. 확인할 수 없는 값은 반드시 null 로 둡니다. 그럴듯한 값을 만들어 넣는 것이 가장 큰 오류입니다.
3. 흐릿하거나 잘려서 읽을 수 없는 부분은 unreadableSections 에 어느 부분인지 적습니다.
4. 위험 여부를 판단하지 마세요. 판단은 서버가 합니다. 당신은 판독만 합니다.
5. 금액은 원(KRW) 단위 정수로 변환합니다. "금150,000,000원" → 150000000, "2억 5천만원" → 250000000.
6. 날짜는 YYYY-MM-DD 로 변환합니다. "2026년 10월 8일", "2026.10.08" 모두 "2026-10-08".
7. 문서에 여러 페이지가 있으면 전 페이지를 모두 확인합니다.`;

const DOC_PROMPTS = {
  registry: `등기사항전부증명서(등기부등본)입니다. 다음을 정확히 판독하세요.

**표제부** — 소재지번, 건물명칭, 전유부분 전용면적.
  · 집합건물(호수별 구분등기) 등기면 isSectionedBuilding=true.
  · 단독·다가구 건물 전체 등기(표제부에 "1동의 건물의 표시"만 있고 전유부분이 없음)면 false.

**갑구(소유권에 관한 사항)**
  · 말소되지 않은 최종 소유자 전원을 ownerNames 에 넣습니다. 공유면 전부.
  · 그 소유자의 소유권 이전 등기일을 ownershipAcquiredOn 에.
  · 신탁 등기가 있고 말소되지 않았으면 isTrustProperty=true.
  · 가압류 · 압류 · 가등기 · 가처분 · 경매개시결정 · 신탁을 모두 rights 에 section="gap" 으로 넣습니다.

**을구(소유권 이외의 권리에 관한 사항)**
  · 근저당권 · 전세권 · 주택임차권 · 지상권을 rights 에 section="eul" 로 넣습니다.
  · 근저당권은 "채권최고액"을 maxClaimKrw 에 넣습니다. 채권액·피담보채권액이 아니라 **채권최고액**입니다.
  · 권리자(근저당권자)를 holder 에 넣습니다.

**말소 판단** — 등기목적에 "말소"가 있거나, 해당 순위번호에 취소선/밑줄이 그어져 있으면 isCancelled=true.
  말소된 권리도 rights 에 포함시키되 isCancelled=true 로 표시하세요. 빼먹지 마세요.

**발급일** — 문서 하단·상단의 "열람일시" 또는 "발급일"의 날짜를 issuedOn 에.`,

  brokerage_statement: `중개대상물 확인·설명서입니다. 다음을 정확히 판독하세요.

  · 대상물건의 소재지, 소유자 성명, 전용면적.
  · "건축물" 항목의 위반건축물 여부: '위반' 에 체크되어 있으면 isIllegalBuilding=true,
    '적법' 이면 false, 아무 표시가 없으면 null.
  · "등기부 기재사항" 의 소유권 외의 권리사항(근저당권 등)에 적힌 내용을 declaredEncumbrances 에
    원문 그대로 배열로 넣습니다. "해당없음" 또는 빈칸이면 빈 배열.
  · 다가구주택 확인서류 제출 여부와 선순위 확정일자 현황:
    실제 내용(세대수 · 보증금액 등)이 기재되어 있으면 priorTenantInfoDisclosed=true,
    "미제출" 이거나 빈칸이면 false, 항목 자체가 없으면 null.
  · 개업공인중개사 정보: 성명, 사무소 명칭, 등록번호(예: 30170-2024-00123).
  · 손해배상책임의 보장: 보장금액, 보장기간(종료일), 보장기관.
  · 서명·날인: 개업공인중개사 · 임대인 각각의 서명 또는 도장이 실제로 보이는지.
  · 작성일자를 issuedOn 에.`,

  lease_draft: `주택임대차계약서(초안일 수 있음)입니다. 다음을 정확히 판독하세요.

  · 부동산의 표시: 소재지와 동 · 호수. 호수가 적혀 있지 않으면 detailAddress=null.
  · 보증금 · 계약금 · 중도금 · 잔금 · 월 차임 · 관리비를 각각 원 단위로.
    한글 표기와 숫자 표기가 다르면 **숫자 표기**를 쓰고 unreadableSections 에 불일치를 적습니다.
  · 임대인 · 임차인 성명, 개업공인중개사 성명.
  · 보증금을 입금할 계좌의 예금주 이름이 적혀 있으면 lessorAccountHolder 에.
    (임대인 이름과 다를 수 있습니다. 적힌 그대로 넣으세요.)
  · 계약일, 잔금 지급일, 임대차 기간(시작일 · 종료일).
  · 특약사항란의 각 조항을 원문 그대로 specialTerms 배열에 넣습니다. 빈칸이면 빈 배열.
  · 임대인의 서명 또는 인감이 실제로 보이는지.`,
} as const;

export type ExtractableDocType = keyof typeof DOC_PROMPTS;

export interface ExtractionResult<T> {
  payload: T;
  model: string;
  schemaVersion: string;
  confidence: number;
  usage: { inputTokens: number; outputTokens: number } | null;
}

interface CallArgs<T> {
  docType: ExtractableDocType;
  fileBuffer: Buffer;
  mimeType: string;
  schema: ZodType<T>;
}

async function callModel<T>({ docType, fileBuffer, mimeType, schema }: CallArgs<T>): Promise<{
  parsed: T;
  model: string;
  usage: { inputTokens: number; outputTokens: number } | null;
}> {
  const env = loadEnv();
  const base64 = fileBuffer.toString("base64");

  const contentBlock =
    mimeType === "application/pdf"
      ? ({
          type: "document" as const,
          source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 },
        })
      : ({
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: mimeType as "image/jpeg" | "image/png" | "image/webp",
            data: base64,
          },
        });

  try {
    const message = await anthropic().beta.messages.parse({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 16_000,
      // thinking 을 지정하지 않는다 → Claude Opus 5 에서는 adaptive thinking 이 기본으로 동작한다.
      // (budget_tokens 방식은 이 모델에서 거부된다.)
      output_config: { effort: env.ANTHROPIC_EFFORT },
      output_format: betaZodOutputFormat(schema),
      system: [
        {
          type: "text",
          text: BASE_SYSTEM_PROMPT,
          // 시스템 프롬프트는 요청마다 동일하므로 캐시한다. 문서(가변 부분)는 뒤에 온다.
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [contentBlock, { type: "text", text: DOC_PROMPTS[docType] }],
        },
      ],
    });

    if (message.stop_reason === "refusal") {
      // 안전 분류기가 요청을 거절한 경우. 이 SDK 버전의 타입에는 stop_details 가 없어
      // 구조화된 사유를 읽을 수 없으므로, 원인 추적을 위해 로그만 남긴다.
      log.warn("anthropic refusal", { docType, messageId: message.id });
      throw upstreamFailed(
        "문서 분석이 거부되었습니다. 개인정보가 과도하게 포함되지 않았는지 확인하고 다시 시도해 주세요.",
      );
    }
    if (message.stop_reason === "max_tokens") {
      throw upstreamFailed(
        "문서가 너무 길어 분석을 끝내지 못했습니다. 필요한 페이지만 남겨 다시 올려주세요.",
      );
    }
    if (!message.parsed_output) {
      throw upstreamFailed("문서에서 구조화된 정보를 얻지 못했습니다. 더 선명한 파일로 다시 시도해 주세요.");
    }

    return {
      parsed: message.parsed_output,
      model: message.model,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      },
    };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw upstreamFailed("분석 요청이 많아 잠시 대기가 필요합니다. 1~2분 후 다시 시도해 주세요.");
    }
    if (error instanceof Anthropic.AuthenticationError) {
      throw internal("문서 분석 서비스 인증에 실패했습니다. 서버 설정을 확인해 주세요.");
    }
    if (error instanceof Anthropic.BadRequestError) {
      log.error("anthropic bad request", { docType, message: error.message });
      throw badRequest("문서 형식을 처리할 수 없습니다. PDF 또는 이미지 파일인지 확인해 주세요.");
    }
    if (error instanceof Anthropic.APIError) {
      throw upstreamFailed(`문서 분석에 실패했습니다. (${error.status})`);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 정규화 — 모델 출력을 도메인 타입으로 좁힌다
// ---------------------------------------------------------------------------

function normalizeRegistry(raw: RegistryExtractionRaw): RegistryExtraction {
  const rights: RegistryRight[] = raw.rights.map((r) => ({
    section: r.section,
    rankNo: r.rankNo,
    type: r.type,
    holder: r.holder,
    maxClaimKrw: sanitizeAmount(r.maxClaimKrw),
    registeredOn: sanitizeDate(r.registeredOn),
    isCancelled: r.isCancelled,
    note: r.note,
  }));

  return {
    address: raw.address,
    buildingName: raw.buildingName,
    exclusiveAreaM2: sanitizeArea(raw.exclusiveAreaM2),
    landAreaM2: sanitizeArea(raw.landAreaM2),
    // 빈 문자열이 소유자로 들어오는 경우를 막는다.
    ownerNames: raw.ownerNames.map((n) => n.trim()).filter((n) => n.length > 0),
    ownershipAcquiredOn: sanitizeDate(raw.ownershipAcquiredOn),
    issuedOn: sanitizeDate(raw.issuedOn),
    isTrustProperty: raw.isTrustProperty || rights.some((r) => r.type === "trust" && !r.isCancelled),
    isSectionedBuilding: raw.isSectionedBuilding,
    rights,
    unreadableSections: raw.unreadableSections.filter((s) => s.trim().length > 0),
  };
}

function normalizeBrokerage(raw: BrokerageExtractionRaw): BrokerageStatementExtraction {
  return {
    address: raw.address,
    ownerName: raw.ownerName,
    exclusiveAreaM2: sanitizeArea(raw.exclusiveAreaM2),
    buildingUse: raw.buildingUse,
    isIllegalBuilding: raw.isIllegalBuilding,
    declaredEncumbrances: raw.declaredEncumbrances
      .map((s) => s.trim())
      // "해당없음" 을 '기재됨'으로 세면 미기재 경고가 사라진다. 명시적으로 걸러낸다.
      .filter((s) => s.length > 0 && !/^(해당\s*없음|없음|없다|-)$/.test(s)),
    priorTenantInfoDisclosed: raw.priorTenantInfoDisclosed,
    priorTenantDepositKrw: sanitizeAmount(raw.priorTenantDepositKrw),
    agentName: raw.agentName,
    agencyName: raw.agencyName,
    agentRegistrationNo: raw.agentRegistrationNo,
    guaranteeInsurer: raw.guaranteeInsurer,
    guaranteeAmountKrw: sanitizeAmount(raw.guaranteeAmountKrw),
    guaranteeExpiresOn: sanitizeDate(raw.guaranteeExpiresOn),
    issuedOn: sanitizeDate(raw.issuedOn),
    signedByAgent: raw.signedByAgent,
    signedByLessor: raw.signedByLessor,
    unreadableSections: raw.unreadableSections.filter((s) => s.trim().length > 0),
  };
}

function normalizeLease(raw: LeaseExtractionRaw): LeaseDraftExtraction {
  return {
    address: raw.address,
    detailAddress: raw.detailAddress,
    exclusiveAreaM2: sanitizeArea(raw.exclusiveAreaM2),
    lessorName: raw.lessorName,
    lessorAccountHolder: raw.lessorAccountHolder,
    lesseeName: raw.lesseeName,
    agentName: raw.agentName,
    depositKrw: sanitizeAmount(raw.depositKrw),
    downPaymentKrw: sanitizeAmount(raw.downPaymentKrw),
    balanceKrw: sanitizeAmount(raw.balanceKrw),
    monthlyRentKrw: sanitizeAmount(raw.monthlyRentKrw),
    maintenanceFeeKrw: sanitizeAmount(raw.maintenanceFeeKrw),
    contractDate: sanitizeDate(raw.contractDate),
    balanceDate: sanitizeDate(raw.balanceDate),
    termStart: sanitizeDate(raw.termStart),
    termEnd: sanitizeDate(raw.termEnd),
    specialTerms: raw.specialTerms.map((s) => s.trim()).filter((s) => s.length > 0),
    signedByLessor: raw.signedByLessor,
    unreadableSections: raw.unreadableSections.filter((s) => s.trim().length > 0),
  };
}

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

export async function extractRegistry(
  fileBuffer: Buffer,
  mimeType: string,
  ctx: ExtractionContext = {},
): Promise<ExtractionResult<RegistryExtraction>> {
  if (loadEnv().mode === "mock") {
    return mockExtraction("registry", ctx) as ExtractionResult<RegistryExtraction>;
  }
  const { parsed, model, usage } = await callModel({
    docType: "registry",
    fileBuffer,
    mimeType,
    schema: registryExtractionSchema,
  });
  return {
    payload: normalizeRegistry(parsed),
    model,
    schemaVersion: EXTRACTION_SCHEMA_VERSION,
    confidence: clampConfidence(parsed.confidence),
    usage,
  };
}

export async function extractBrokerageStatement(
  fileBuffer: Buffer,
  mimeType: string,
  ctx: ExtractionContext = {},
): Promise<ExtractionResult<BrokerageStatementExtraction>> {
  if (loadEnv().mode === "mock") {
    return mockExtraction("brokerage_statement", ctx) as ExtractionResult<BrokerageStatementExtraction>;
  }
  const { parsed, model, usage } = await callModel({
    docType: "brokerage_statement",
    fileBuffer,
    mimeType,
    schema: brokerageStatementExtractionSchema,
  });
  return {
    payload: normalizeBrokerage(parsed),
    model,
    schemaVersion: EXTRACTION_SCHEMA_VERSION,
    confidence: clampConfidence(parsed.confidence),
    usage,
  };
}

export async function extractLeaseDraft(
  fileBuffer: Buffer,
  mimeType: string,
  ctx: ExtractionContext = {},
): Promise<ExtractionResult<LeaseDraftExtraction>> {
  if (loadEnv().mode === "mock") {
    return mockExtraction("lease_draft", ctx) as ExtractionResult<LeaseDraftExtraction>;
  }
  const { parsed, model, usage } = await callModel({
    docType: "lease_draft",
    fileBuffer,
    mimeType,
    schema: leaseDraftExtractionSchema,
  });
  return {
    payload: normalizeLease(parsed),
    model,
    schemaVersion: EXTRACTION_SCHEMA_VERSION,
    confidence: clampConfidence(parsed.confidence),
    usage,
  };
}
