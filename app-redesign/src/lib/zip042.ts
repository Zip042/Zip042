import { api } from "./api";
import type { Grade } from "@/components/ui";
import type { Judgment, JudgmentResult, RegistryExtraction, ExtractedRight } from "@/data/sample";

/**
 * 백엔드 응답 → 화면이 쓰는 형태로 변환.
 *
 * ## 왜 변환 계층을 두는가
 *
 * 백엔드 분석 응답은 `verdict`(점수·가중치를 다루는 내부 구조)와 `judgment`(화면용
 * 네 등급 계약)를 함께 냅니다. 화면이 필요한 것은 `judgment` 지만, 제목·요약·계약가능
 * 여부는 `verdict` 쪽에 있습니다. 그 조립을 화면마다 하면 규칙이 흩어지므로 여기서 합칩니다.
 *
 * **판정을 새로 만들지 않습니다.** 백엔드가 낸 등급을 그대로 옮길 뿐입니다 —
 * 화면이 판정에 개입하면 "같은 서류가 같은 판정을 받는다"는 보장이 깨집니다.
 */

/* ── 백엔드 응답 형태 (필요한 부분만) ────────────────────────────────── */

interface BackendJudgment {
  code: string;
  grade: Grade;
  title: string;
  description: string;
  basis?: string[];
  sourceQuotes?: string[];
  nextAction?: string | null;
  glossaryHref?: string | null;
}

interface BackendAnalysis {
  verdict: {
    headline: string;
    summary: string;
    contractable: boolean;
    blockingGaps?: { title?: string }[] | string[];
  };
  judgment?: {
    overallGrade: Grade;
    judgments: BackendJudgment[];
    calculation: {
      seniorClaimsKrw: number;
      depositKrw: number;
      marketPriceKrw: number | null;
      burdenRatio: number | null;
      computable: boolean;
    };
  };
  specialTerms?: { title?: string; clause?: string; body?: string }[];
  caveats?: string[];
}

/* ── 검사 건 ─────────────────────────────────────────────────────────── */

/**
 * 시세 조회가 되는 건물 유형.
 *
 * **이 값을 안 보내면 시세 조회 자체가 안 됩니다.** 백엔드는 유형이 없으면
 * 등기부로 추정하는데, 집합건물(아파트·빌라·오피스텔)은 `other` 로 떨어지고
 * `other` 에는 실거래가 엔드포인트가 없어 조회를 건너뜁니다. 그러면 모든 판정이
 * "시세를 확인하지 못했어요"로 끝나 깡통전세 계산이 아예 돌지 않습니다.
 */
export type BuildingType =
  | "apartment"
  | "multi_family"
  | "officetel"
  | "multi_household"
  | "studio";

export interface CreateCaseInput {
  roadAddress: string;
  buildingType: BuildingType;
  /** 만원 단위. 백엔드가 amountUnit 으로 정규화합니다. */
  depositMan: number;
  monthlyRentMan?: number;
  leaseType?: "jeonse" | "monthly";
  balanceDate?: string;
  moveInDate?: string;
}

export async function createCase(input: CreateCaseInput): Promise<string> {
  const res = await api.post<{ case: { id: string } }>("/v1/cases", {
    title: input.roadAddress,
    roadAddress: input.roadAddress,
    buildingType: input.buildingType,
    deposit: input.depositMan,
    ...(input.monthlyRentMan ? { monthlyRent: input.monthlyRentMan } : {}),
    amountUnit: "man",
    leaseType: input.leaseType ?? "jeonse",
    ...(input.balanceDate ? { balanceDate: input.balanceDate } : {}),
    ...(input.moveInDate ? { moveInDate: input.moveInDate } : {}),
  });
  return res.case.id;
}

/* ── 문서 업로드 ─────────────────────────────────────────────────────── */

export type DocType = "registry" | "brokerage_statement" | "lease_draft" | "building_ledger" | "other";

/** 백엔드가 받는 MIME 는 네 가지뿐입니다. 브라우저가 빈 문자열을 줄 때가 있어 확장자로 보정합니다. */
const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function resolveMime(file: File): string {
  const allowed = new Set(Object.values(MIME_BY_EXT));
  if (allowed.has(file.type)) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const guessed = MIME_BY_EXT[ext];
  if (!guessed) {
    throw new Error("PDF · JPG · PNG · WEBP 만 올릴 수 있습니다.");
  }
  return guessed;
}

/**
 * 업로드 URL 이 **우리 백엔드 자신**을 가리키면 경로만 남겨 dev 프록시를 타게 합니다.
 *
 * 목 모드의 서명 URL 은 `http://localhost:8787/v1/dev/storage/...` 같은 절대주소입니다.
 * 그대로 부르면 프록시를 건너뛰어 다른 오리진이 되고 CORS 에 막힙니다
 * (실제로 이 문제로 업로드가 실패했습니다).
 *
 * 반면 운영에서는 이 URL 이 Supabase 스토리지를 가리키므로 **반드시 그대로** 불러야
 * 합니다. 그래서 `/v1/` 로 시작하는 우리 경로일 때만 상대경로로 바꿉니다.
 */
function sameOriginIfOurs(url: string): string {
  try {
    const u = new URL(url, window.location.origin);
    if (u.pathname.startsWith("/v1/")) return u.pathname + u.search;
    return url;
  } catch {
    return url;
  }
}

/**
 * 서명 URL 을 받아 스토리지에 올린 뒤 문서로 등록합니다.
 *
 * 파일이 서버를 거치지 않고 스토리지로 바로 가는 구조라, 큰 PDF 도 서버 메모리를
 * 쓰지 않습니다. 목 모드에서는 서명 URL 이 백엔드 자신을 가리킵니다.
 *
 * ⚠️ 두 요청의 본문이 다릅니다. upload-url 은 `additionalProperties: false` 라
 *    sizeBytes 를 함께 보내면 검증에서 거부됩니다.
 */
export async function uploadDocument(caseId: string, file: File, docType: DocType): Promise<void> {
  const mimeType = resolveMime(file);

  const signed = await api.post<{ upload: { url: string; storagePath: string; method?: string } }>(
    `/v1/cases/${caseId}/documents/upload-url`,
    { docType, fileName: file.name, mimeType },
  );

  const put = await fetch(sameOriginIfOurs(signed.upload.url), {
    method: signed.upload.method ?? "PUT",
    headers: { "content-type": mimeType },
    body: file,
  });
  if (!put.ok) throw new Error(`파일 업로드에 실패했습니다. (HTTP ${put.status})`);

  await api.post(`/v1/cases/${caseId}/documents`, {
    docType,
    storagePath: signed.upload.storagePath,
    originalName: file.name,
    mimeType,
    sizeBytes: file.size,
  });
}

/* ── 분석 ────────────────────────────────────────────────────────────── */

/** 문서 판독이 포함되면 20~60초가 걸립니다. 타임아웃을 넉넉히 둡니다. */
export async function runAnalysis(caseId: string): Promise<JudgmentResult> {
  const res = await api.post<{ analysis: BackendAnalysis }>(
    `/v1/cases/${caseId}/analyze`,
    {},
    { timeoutMs: 120_000 },
  );
  return toJudgmentResult(res.analysis);
}

export async function getAnalysis(caseId: string): Promise<JudgmentResult> {
  const res = await api.get<{ analysis: BackendAnalysis }>(`/v1/cases/${caseId}/analysis`);
  return toJudgmentResult(res.analysis);
}

function toJudgmentResult(a: BackendAnalysis): JudgmentResult {
  const j = a.judgment;

  // judgment 가 없으면 화면이 표시할 등급 체계가 없습니다. 임의로 OK 를 만들지 않고
  // UNKNOWN 으로 둡니다 — 모르는 것을 괜찮다고 말하지 않는다는 원칙 그대로입니다.
  if (!j) {
    return {
      overallGrade: "UNKNOWN",
      headline: a.verdict.headline,
      summary: a.verdict.summary,
      contractable: a.verdict.contractable,
      judgments: [],
      calculation: {
        // **0 을 쓰면 안 됩니다.** 화면에 "선순위 채권 0만원"으로 나오고, 그건
        // "빚이 없는 안전한 집"으로 읽힙니다. 모르는 것은 null 로 두고 화면이
        // "확인 못 함"이라고 말하게 합니다. (백엔드 원칙 2 와 같은 규칙입니다.)
        seniorClaimsKrw: null,
        depositKrw: null,
        marketPriceKrw: null,
        burdenRatio: null,
        computable: false,
      },
      blockingGaps: normalizeGaps(a.verdict.blockingGaps),
      caveats: a.caveats ?? [],
    };
  }

  const judgments: Judgment[] = j.judgments.map((x) => ({
    code: x.code,
    grade: x.grade,
    title: x.title,
    description: x.description,
    basis: x.basis ?? [],
    sourceQuotes: x.sourceQuotes ?? [],
    nextAction: x.nextAction ?? null,
  }));

  return {
    overallGrade: j.overallGrade,
    headline: a.verdict.headline,
    summary: a.verdict.summary,
    contractable: a.verdict.contractable,
    judgments,
    calculation: j.calculation,
    blockingGaps: normalizeGaps(a.verdict.blockingGaps),
    caveats: a.caveats ?? [],
  };
}

function normalizeGaps(gaps: BackendAnalysis["verdict"]["blockingGaps"]): string[] {
  if (!gaps) return [];
  return gaps
    .map((g) => (typeof g === "string" ? g : (g.title ?? "")))
    .filter((s): s is string => s.length > 0);
}

/**
 * 특약 문구.
 *
 * 백엔드는 우선순위와 필수 여부를 함께 냅니다. 화면은 **필수를 먼저** 보여줘야
 * 하므로 여기서 정렬해 둡니다(계약서에 꼭 들어가야 할 문구가 아래로 밀리면 안 됩니다).
 */
export async function getSpecialTerms(
  caseId: string,
): Promise<{ title: string; body: string; required: boolean }[]> {
  const res = await api.get<{
    specialTerms?: {
      title?: string;
      clauseText?: string;
      required?: boolean;
      priority?: number;
    }[];
  }>(`/v1/cases/${caseId}/special-terms`);

  return (res.specialTerms ?? [])
    .map((t) => ({
      title: t.title ?? "특약",
      body: t.clauseText ?? "",
      required: t.required ?? false,
      priority: t.priority ?? 999,
    }))
    .filter((t) => t.body.length > 0)
    .sort((a, b) => Number(b.required) - Number(a.required) || a.priority - b.priority)
    .map(({ title, body, required }) => ({ title, body, required }));
}

/* ── 판독 확인 ───────────────────────────────────────────────────────── */

interface BackendExtraction {
  registry: {
    address: string | null;
    buildingName: string | null;
    exclusiveAreaM2: number | null;
    ownerNames: string[];
    ownershipAcquiredOn: string | null;
    isTrustProperty: boolean;
    isSectionedBuilding: boolean;
    unreadableSections: string[];
    rights: {
      section: "gap" | "eul";
      rankNo: string | null;
      type: string;
      holder: string | null;
      maxClaimKrw: number | null;
      registeredOn: string | null;
      isCancelled: boolean;
      note: string | null;
      sourceQuote: string | null;
    }[];
  } | null;
  confidence: number | null;
  model: string | null;
  extractedAt: string | null;
}

/** 등기 목적을 화면 표기로. 없으면 note 를 그대로 씁니다. */
const RIGHT_LABEL: Record<string, string> = {
  mortgage: "근저당권설정",
  jeonse_right: "전세권설정",
  lease_registration: "임차권등기",
  provisional_attachment: "가압류",
  attachment: "압류",
  provisional_registration: "가등기",
  trust: "신탁",
  auction: "경매개시결정",
  injunction: "가처분",
  ownership_transfer: "소유권이전",
  other: "기타",
};

export async function getExtraction(caseId: string): Promise<RegistryExtraction | null> {
  const res = await api.get<BackendExtraction>(`/v1/cases/${caseId}/extraction`);
  const r = res.registry;
  if (!r) return null;

  const rights: ExtractedRight[] = r.rights.map((x) => ({
    section: x.section,
    rankNo: x.rankNo ?? "-",
    // 화면이 아는 종류만 좁혀 받고, 나머지는 other 로 둡니다.
    type: (["mortgage", "jeonse_right", "seizure", "trust"] as const).includes(
      x.type as "mortgage",
    )
      ? (x.type as ExtractedRight["type"])
      : "other",
    label: RIGHT_LABEL[x.type] ?? x.note ?? "등기",
    holder: x.holder,
    amountKrw: x.maxClaimKrw,
    registeredOn: x.registeredOn,
    isCancelled: x.isCancelled,
    sourceQuote: x.sourceQuote,
  }));

  return {
    // 백엔드는 소재지를 한 필드로 냅니다. 지번/도로명을 나눠 갖고 있지 않으므로
    // 없는 값을 지어내지 않고 지번은 null 로 둡니다.
    roadAddress: r.address,
    jibunAddress: null,
    buildingName: r.buildingName,
    exclusiveAreaM2: r.exclusiveAreaM2,
    ownerNames: r.ownerNames ?? [],
    ownershipAcquiredOn: r.ownershipAcquiredOn,
    isTrustProperty: r.isTrustProperty,
    isSectionedBuilding: r.isSectionedBuilding,
    unreadableSections: r.unreadableSections ?? [],
    rights,
  };
}

/* ── 공개 콘텐츠 (로그인 없이 볼 수 있는 것들) ───────────────────────── */

export interface ChecklistStage {
  code: string;
  label: string;
  items: { id: string; label: string; note: string | null; required: boolean }[];
}

export async function getChecklist(): Promise<ChecklistStage[]> {
  const res = await api.get<{
    stages?: {
      code: string;
      label: string;
      items?: { id: string; label: string; note?: string | null; required?: boolean }[];
    }[];
  }>("/v1/checklist");

  return (res.stages ?? []).map((s) => ({
    code: s.code,
    label: s.label,
    items: (s.items ?? []).map((i) => ({
      id: i.id,
      label: i.label,
      note: i.note ?? null,
      required: i.required ?? false,
    })),
  }));
}

export interface GlossaryTerm {
  code: string;
  term: string;
  summary: string;
  description: string;
}

export async function getGlossary(): Promise<GlossaryTerm[]> {
  const res = await api.get<{
    terms?: { code: string; term: string; summary?: string; description?: string }[];
  }>("/v1/glossary");

  return (res.terms ?? []).map((t) => ({
    code: t.code,
    term: t.term,
    summary: t.summary ?? "",
    description: t.description ?? "",
  }));
}
