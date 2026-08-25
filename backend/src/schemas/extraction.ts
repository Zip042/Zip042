import { z } from "zod";
import { isDateOnly } from "../lib/date.js";

/**
 * AI 문서 추출용 스키마.
 *
 * 설계 규칙
 *  - 모든 필드를 `.nullable()` 로 둔다. structured outputs 는 필드를 반드시 채우도록 강제하므로,
 *    "모르겠다"를 표현할 방법이 없으면 모델이 **값을 지어낸다**. null 을 허용하는 것이 안전장치다.
 *  - 날짜는 문자열로 받고 서버에서 형식을 검증한다. 형식이 깨진 값은 null 로 떨어뜨린다.
 *  - 금액은 숫자(원)로 받되, 판독 실패 시 null.
 *  - 위험 판정은 절대 모델에 맡기지 않는다. 이 스키마에는 "위험한가?" 류의 필드가 없다.
 */

const nullableDate = z
  .string()
  .nullable()
  .describe("YYYY-MM-DD 형식. 문서에서 확인할 수 없으면 null");

const nullableAmount = z
  .number()
  .nullable()
  .describe("원(KRW) 단위 정수. 문서에서 확인할 수 없으면 null");

export const rightTypeEnum = z.enum([
  "mortgage",
  "jeonse_right",
  "lease_registration",
  "provisional_attachment",
  "attachment",
  "provisional_registration",
  "trust",
  "auction",
  "injunction",
  "superficies",
  "ownership_transfer",
  "other",
]);

export const registryRightSchema = z.object({
  section: z.enum(["gap", "eul"]).describe("갑구(gap) 또는 을구(eul)"),
  rankNo: z.string().nullable().describe("순위번호. 예: '3', '3-1'"),
  type: rightTypeEnum,
  holder: z.string().nullable().describe("권리자(근저당권자·채권자) 이름 또는 기관명"),
  maxClaimKrw: nullableAmount.describe("채권최고액 등 금액. 원 단위 정수. 없으면 null"),
  registeredOn: nullableDate,
  isCancelled: z.boolean().describe("말소된 권리인지 (줄이 그어져 있거나 '말소' 표시가 있으면 true)"),
  note: z.string().nullable().describe("등기목적 원문 요약. 예: '근저당권설정'"),
});

export const registryExtractionSchema = z.object({
  address: z.string().nullable().describe("표제부의 소재지번 · 건물명 · 건물번호"),
  buildingName: z.string().nullable(),
  exclusiveAreaM2: z.number().nullable().describe("전용면적(㎡). 전유부분 면적"),
  landAreaM2: z.number().nullable(),
  ownerNames: z.array(z.string()).describe("갑구상 현재 소유자 이름 전부. 말소된 전 소유자는 제외"),
  ownershipAcquiredOn: nullableDate.describe("현재 소유자의 소유권 취득(등기) 일자"),
  issuedOn: nullableDate.describe("등기사항증명서 발급일 또는 열람일시의 날짜"),
  isTrustProperty: z
    .boolean()
    .describe("신탁등기가 되어 있는지. 갑구에 '신탁' 기재가 있고 말소되지 않았으면 true"),
  isSectionedBuilding: z
    .boolean()
    .describe("집합건물 등기(호수별 구분등기)인지. 단독·다가구 건물 전체 등기면 false"),
  rights: z.array(registryRightSchema).describe("갑구·을구의 모든 권리. 말소된 것도 포함하되 isCancelled=true"),
  unreadableSections: z
    .array(z.string())
    .describe("흐릿하거나 잘려서 판독할 수 없었던 부분. 예: '을구 2페이지', '표제부 면적'"),
  confidence: z.number().describe("전체 판독 신뢰도 0.0~1.0"),
});

export const brokerageStatementExtractionSchema = z.object({
  address: z.string().nullable().describe("대상물건의 소재지"),
  ownerName: z.string().nullable().describe("소유자(임대인) 성명"),
  exclusiveAreaM2: z.number().nullable(),
  buildingUse: z.string().nullable().describe("건축물 용도. 예: '다세대주택', '제2종근린생활시설'"),
  isIllegalBuilding: z
    .boolean()
    .nullable()
    .describe("'위반건축물' 표시가 있으면 true, 없다고 명시되면 false, 확인 불가면 null"),
  declaredEncumbrances: z
    .array(z.string())
    .describe("권리관계란(등기부 기재사항)에 적힌 소유권 외의 권리 항목 원문. 없으면 빈 배열"),
  priorTenantInfoDisclosed: z
    .boolean()
    .nullable()
    .describe("다가구주택 확인서류(선순위 확정일자 현황 등)에 실제 내용이 기재되어 있으면 true"),
  priorTenantDepositKrw: nullableAmount.describe("기재된 선순위 임차보증금 총액"),
  agentName: z.string().nullable().describe("개업공인중개사 성명"),
  agencyName: z.string().nullable().describe("중개사무소 명칭"),
  agentRegistrationNo: z.string().nullable().describe("등록번호"),
  guaranteeInsurer: z.string().nullable().describe("손해배상책임 보장 기관 (공제 · 보증보험)"),
  guaranteeAmountKrw: nullableAmount,
  guaranteeExpiresOn: nullableDate.describe("보장 기간 종료일"),
  issuedOn: nullableDate.describe("확인·설명서 작성일 또는 교부일"),
  signedByAgent: z
    .boolean()
    .nullable()
    .describe("개업공인중개사의 서명 또는 날인이 보이면 true"),
  signedByLessor: z.boolean().nullable().describe("임대인(매도인) 서명 또는 날인이 보이면 true"),
  unreadableSections: z.array(z.string()),
  confidence: z.number(),
});

export const leaseDraftExtractionSchema = z.object({
  address: z.string().nullable().describe("임차할 부동산의 소재지"),
  detailAddress: z.string().nullable().describe("동 · 호수 등 상세주소. 계약서에 없으면 null"),
  exclusiveAreaM2: z.number().nullable(),
  lessorName: z.string().nullable().describe("임대인 성명"),
  lessorAccountHolder: z
    .string()
    .nullable()
    .describe("보증금 입금 계좌의 예금주 이름. 계약서에 계좌가 없으면 null"),
  lesseeName: z.string().nullable(),
  agentName: z.string().nullable(),
  depositKrw: nullableAmount.describe("보증금 총액"),
  downPaymentKrw: nullableAmount.describe("계약금"),
  balanceKrw: nullableAmount.describe("잔금"),
  monthlyRentKrw: nullableAmount.describe("월 차임. 전세면 0 또는 null"),
  maintenanceFeeKrw: nullableAmount.describe("관리비"),
  contractDate: nullableDate.describe("계약 체결일"),
  balanceDate: nullableDate.describe("잔금 지급일"),
  termStart: nullableDate.describe("임대차 기간 시작일"),
  termEnd: nullableDate.describe("임대차 기간 종료일"),
  specialTerms: z.array(z.string()).describe("특약사항란의 각 조항 원문. 없으면 빈 배열"),
  signedByLessor: z.boolean().nullable().describe("임대인 서명 또는 인감이 보이면 true"),
  unreadableSections: z.array(z.string()),
  confidence: z.number(),
});

export type RegistryExtractionRaw = z.infer<typeof registryExtractionSchema>;
export type BrokerageExtractionRaw = z.infer<typeof brokerageStatementExtractionSchema>;
export type LeaseExtractionRaw = z.infer<typeof leaseDraftExtractionSchema>;

/** 모델이 형식을 어긴 날짜를 조용히 통과시키지 않는다. */
export function sanitizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (isDateOnly(trimmed)) return trimmed;
  // '2026.10.08' / '2026년 10월 8일' 같은 표기를 한 번 구제한다.
  const m = /(\d{4})\D{1,2}(\d{1,2})\D{1,2}(\d{1,2})/.exec(trimmed);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  return isDateOnly(iso) ? iso : null;
}

/** 음수·비정수·비현실적으로 큰 금액을 걸러낸다. */
export function sanitizeAmount(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0) return null;
  // 1조 원을 넘는 원룸 계약은 없다. 자릿수 판독 오류로 본다.
  if (value > 1_000_000_000_000) return null;
  return Math.round(value);
}

export function sanitizeArea(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value <= 0 || value > 10_000) return null;
  return Math.round(value * 10_000) / 10_000;
}

export function clampConfidence(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, Math.round(value * 1000) / 1000));
}
