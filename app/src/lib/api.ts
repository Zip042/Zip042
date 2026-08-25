import type { paths } from "./api-types";

/**
 * ZIP 042 백엔드 API 클라이언트.
 *
 * ## 현재 상태
 *
 * **화면은 아직 이 클라이언트를 쓰지 않습니다.** 각 페이지는 여전히 하드코딩된 목업
 * 데이터로 그려집니다. 기능이 양쪽 다 완성되면 그때 화면을 하나씩 갈아끼웁니다.
 * 지금 이 파일이 있는 이유는 **연결 통로와 타입을 미리 확정**해 두기 위해서입니다.
 *
 * ## 타입은 어디서 오는가
 *
 * `api-types.d.ts` 는 백엔드의 `openapi.json` 에서 **생성**된 파일입니다. 손으로 고치지 마세요.
 *
 *   npm run api:types
 *
 * 백엔드가 응답 형태를 바꾸면 이 명령을 다시 돌립니다. 백엔드 CI 는 `openapi.json` 이
 * 코드와 어긋나면 실패하므로, 생성된 타입은 실제 서버와 항상 일치합니다.
 *
 * ## 개발 중 서버 주소
 *
 * 기본값은 `/v1` 상대경로이고, `vite.config.ts` 의 프록시가 백엔드로 넘깁니다.
 * 이렇게 하면 브라우저 입장에서 같은 오리진이라 **CORS 를 신경 쓸 필요가 없습니다**.
 * 배포처럼 다른 오리진을 직접 부르려면 `.env` 에 `VITE_API_BASE_URL` 을 넣으세요.
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

/** 서버가 내려주는 오류 형태. 백엔드 `AppError` 와 1:1 대응합니다. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    detail?: unknown;
    issues?: { path: string; message: string }[];
    requestId?: string;
  };
}

/**
 * API 오류.
 *
 * `message` 는 **서버가 준 한국어 문구를 그대로** 담습니다. 백엔드가 사용자에게 그대로
 * 보여줄 수 있는 문장을 내려주도록 만들어져 있으므로, 화면에서 다시 쓰지 마세요.
 * (문구를 양쪽에서 따로 관리하면 서버가 이유를 바꿔도 화면은 옛말을 계속합니다.)
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: unknown;
  readonly issues: { path: string; message: string }[];
  readonly requestId: string | null;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.error.code;
    this.detail = body.error.detail;
    this.issues = body.error.issues ?? [];
    this.requestId = body.error.requestId ?? null;
  }

  /** 로그인이 필요한 상태인지. 화면에서 로그인 유도로 분기할 때 씁니다. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** 요청 제한. 서버가 `Retry-After` 도 함께 보냅니다. */
  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

/**
 * 액세스 토큰 공급자.
 *
 * 아직 로그인 화면이 없으므로 기본값은 없습니다. Supabase Auth 를 붙이면
 * `setAuthTokenProvider(() => session?.access_token ?? null)` 로 연결하세요.
 *
 * 목 모드 백엔드는 토큰을 검증하지 않고 **토큰 문자열 자체를 사용자 식별자로** 씁니다.
 * 그래서 로그인 없이 `"dev"` 를 넣으면 바로 개발할 수 있습니다.
 */
type TokenProvider = () => string | null | Promise<string | null>;

let tokenProvider: TokenProvider = () => null;

export function setAuthTokenProvider(provider: TokenProvider): void {
  tokenProvider = provider;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** JSON 으로 직렬화해 보낼 본문. */
  body?: unknown;
  /** 쿼리 파라미터. `undefined` · `null` 값은 자동으로 빠집니다. */
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
  /** 인증 헤더를 붙이지 않습니다. 공개 엔드포인트에 씁니다. */
  anonymous?: boolean;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = `${BASE_URL}${path}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * 공통 요청 함수.
 *
 * 204(본문 없음)를 `null` 로 돌려주므로, 삭제 응답을 `.json()` 하다 터지는 일이 없습니다.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, signal, anonymous = false } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";

  if (!anonymous) {
    const token = await tokenProvider();
    if (token) headers.authorization = `Bearer ${token}`;
  }

  const res = await fetch(buildUrl(path, query), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  if (res.status === 204) return null as T;

  const text = await res.text();
  // 서버가 JSON 이 아닌 것을 내려주는 경우(프록시 오류·502 HTML 등)도 있다.
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      if (!res.ok) {
        throw new ApiError(res.status, {
          error: {
            code: "UNEXPECTED_RESPONSE",
            message: `서버에서 예상하지 못한 응답이 왔습니다. (HTTP ${res.status})`,
          },
        });
      }
    }
  }

  if (!res.ok) {
    const isApiError =
      typeof parsed === "object" && parsed !== null && "error" in (parsed as Record<string, unknown>);
    throw new ApiError(
      res.status,
      isApiError
        ? (parsed as ApiErrorBody)
        : { error: { code: "UNKNOWN", message: `요청에 실패했습니다. (HTTP ${res.status})` } },
    );
  }

  return parsed as T;
}

// ---------------------------------------------------------------------------
// 엔드포인트별 래퍼
//
// 경로 문자열과 응답 타입을 한 곳에 모아 둡니다. 화면에서 경로를 직접 쓰면
// 오타가 런타임까지 살아남고, 백엔드가 경로를 바꿨을 때 어디를 고쳐야 할지 알 수 없습니다.
// ---------------------------------------------------------------------------

type Json<T> = T extends { content: { "application/json": infer U } } ? U : never;
type Ok<P> = P extends { responses: { 200: infer R } } ? Json<R> : never;

/** 기능 가용성 · 규칙 버전. 화면이 "시세 조회 불가" 같은 상태를 미리 알 수 있습니다. */
export const getMeta = () =>
  apiRequest<Ok<paths["/v1/meta"]["get"]>>("/v1/meta", { anonymous: true });

/** 계약 단계별 체크리스트 항목 (공개). */
export const getChecklist = () =>
  apiRequest<Ok<paths["/v1/checklist"]["get"]>>("/v1/checklist", { anonymous: true });

/** 내 체크 상태 (로그인 필요). 저장한 적이 없어도 빈 상태를 돌려줍니다. */
export const getChecklistProgress = () =>
  apiRequest<Ok<paths["/v1/checklist/progress"]["get"]>>("/v1/checklist/progress");

/**
 * 체크 상태 저장 (로그인 필요).
 * 부분 갱신이 아니라 **전체 교체**입니다. 화면이 가진 체크 목록 전체를 보내세요.
 */
export const saveChecklistProgress = (checkedItemIds: string[]) =>
  apiRequest<Ok<paths["/v1/checklist/progress"]["put"]>>("/v1/checklist/progress", {
    method: "PUT",
    body: { checkedItemIds },
  });

export const resetChecklistProgress = () =>
  apiRequest<Ok<paths["/v1/checklist/progress"]["delete"]>>("/v1/checklist/progress", {
    method: "DELETE",
  });

/** 용어 검색 (공개). 검색·정렬은 서버가 합니다. */
export const searchGlossary = (params: { q?: string; category?: string } = {}) =>
  apiRequest<Ok<paths["/v1/glossary"]["get"]>>("/v1/glossary", {
    anonymous: true,
    query: params,
  });

/** 실제 사기 수법 (공개). */
export const getFraudCases = () =>
  apiRequest<Ok<paths["/v1/glossary/fraud-cases"]["get"]>>("/v1/glossary/fraud-cases", {
    anonymous: true,
  });

/** 피해 대응 절차 (공개). 배열 순서를 그대로 보여주세요 — 순서가 중요합니다. */
export const getReliefSteps = () =>
  apiRequest<Ok<paths["/v1/glossary/relief-steps"]["get"]>>("/v1/glossary/relief-steps", {
    anonymous: true,
  });

/** 특약 카탈로그 (공개). */
export const getSpecialTermsCatalog = () =>
  apiRequest<Ok<paths["/v1/special-terms/catalog"]["get"]>>("/v1/special-terms/catalog", {
    anonymous: true,
  });

/** 내 검사 건 목록 (로그인 필요). */
export const listCases = () => apiRequest<Ok<paths["/v1/cases"]["get"]>>("/v1/cases");

/** 검사 건 상세 (로그인 필요). */
export const getCase = (caseId: string) =>
  apiRequest<Ok<paths["/v1/cases/{caseId}"]["get"]>>(`/v1/cases/${caseId}`);

/** 최신 분석 결과 (로그인 필요). */
export const getAnalysis = (caseId: string) =>
  apiRequest<Ok<paths["/v1/cases/{caseId}/analysis"]["get"]>>(`/v1/cases/${caseId}/analysis`);

/** 검사 건 생성. 금액은 `amountUnit: "man"` 으로 보내면 서버가 원 단위로 정규화합니다. */
export const createCase = (body: Record<string, unknown>) =>
  apiRequest<Ok<paths["/v1/cases"]["post"]>>("/v1/cases", { method: "POST", body });

/** 검사 건 수정 (계약 조건 · 일정). */
export const updateCase = (caseId: string, body: Record<string, unknown>) =>
  apiRequest<Ok<paths["/v1/cases/{caseId}"]["put"]>>(`/v1/cases/${caseId}`, {
    method: "PUT",
    body,
  });

/** 서명 업로드 URL 발급. 받은 URL 로 파일을 직접 PUT 합니다. */
export const createUploadUrl = (
  caseId: string,
  body: { fileName: string; docType: string; mimeType: string },
) =>
  apiRequest<Ok<paths["/v1/cases/{caseId}/documents/upload-url"]["post"]>>(
    `/v1/cases/${caseId}/documents/upload-url`,
    { method: "POST", body },
  );

/**
 * 발급받은 서명 URL 로 파일을 올립니다.
 *
 * 목 모드의 서명 URL 은 백엔드 자신(`/v1/dev/storage/{token}`)을 가리킵니다. 절대 URL 로
 * 그대로 PUT 하면 개발 서버(5188)에서 백엔드(8787)로 **교차 출처 요청**이 되어 CORS 에
 * 걸립니다. 그 경로만 상대경로로 바꿔 dev 프록시를 타게 합니다.
 * 실제 Supabase 의 URL 은 다른 호스트이므로 그대로 씁니다.
 */
export async function uploadToSignedUrl(signedUrl: string, file: File): Promise<void> {
  let target = signedUrl;
  try {
    const parsed = new URL(signedUrl, window.location.origin);
    if (parsed.pathname.startsWith("/v1/dev/storage/")) target = parsed.pathname + parsed.search;
  } catch {
    /* 파싱할 수 없으면 받은 값을 그대로 쓴다 */
  }

  const res = await fetch(target, {
    method: "PUT",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) {
    throw new ApiError(res.status, {
      error: { code: "UPLOAD_FAILED", message: `파일 업로드에 실패했습니다. (HTTP ${res.status})` },
    });
  }
}

/** 업로드한 파일을 검사 건에 등록합니다. */
export const registerDocument = (
  caseId: string,
  body: {
    docType: string;
    storagePath: string;
    mimeType: string;
    sizeBytes: number;
    originalName?: string;
    mockScenario?: string;
  },
) =>
  apiRequest<Ok<paths["/v1/cases/{caseId}/documents"]["post"]>>(`/v1/cases/${caseId}/documents`, {
    method: "POST",
    body,
  });

export const listDocuments = (caseId: string) =>
  apiRequest<Ok<paths["/v1/cases/{caseId}/documents"]["get"]>>(`/v1/cases/${caseId}/documents`);

/** 분석을 백그라운드 작업으로 등록합니다. 진행률은 작업 조회로 확인합니다. */
export const startAnalysisJob = (caseId: string, body: Record<string, unknown> = {}) =>
  apiRequest<Ok<paths["/v1/cases/{caseId}/analyze/jobs"]["post"]>>(
    `/v1/cases/${caseId}/analyze/jobs`,
    { method: "POST", body },
  );

export const getAnalysisJob = (caseId: string, jobId: string) =>
  apiRequest<Ok<paths["/v1/cases/{caseId}/analyze/jobs/{jobId}"]["get"]>>(
    `/v1/cases/${caseId}/analyze/jobs/${jobId}`,
  );

/** 동기 분석. 서버리스처럼 백그라운드 실행이 보장되지 않는 환경에서 씁니다. */
export const analyzeNow = (caseId: string, body: Record<string, unknown> = {}) =>
  apiRequest<Ok<paths["/v1/cases/{caseId}/analyze"]["post"]>>(`/v1/cases/${caseId}/analyze`, {
    method: "POST",
    body,
  });

/** 이 집에 맞춘 추천 특약. */
export const getCaseSpecialTerms = (caseId: string) =>
  apiRequest<Ok<paths["/v1/cases/{caseId}/special-terms"]["get"]>>(
    `/v1/cases/${caseId}/special-terms`,
  );

/** 일정 미리보기 — 검사 건을 만들지 않고 날짜만으로 위험을 계산합니다. */
export const previewSchedule = (body: Record<string, unknown>) =>
  apiRequest<Ok<paths["/v1/schedule/preview"]["post"]>>("/v1/schedule/preview", {
    method: "POST",
    body,
  });

/** 판정 항목 코드로 용어 찾기 — 결과 화면의 "이게 무슨 말이죠?" (공개). */
export const getTermsByFinding = (findingCode: string) =>
  apiRequest<Ok<paths["/v1/glossary/by-finding/{code}"]["get"]>>(
    `/v1/glossary/by-finding/${encodeURIComponent(findingCode)}`,
    { anonymous: true },
  );

export type { paths };
