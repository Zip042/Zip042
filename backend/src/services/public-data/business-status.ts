import { loadEnv } from "../../env.js";
import { fail, ok, type PublicDataResult } from "./client.js";

/**
 * 국세청 사업자등록정보 진위확인 및 상태조회 (포털 데이터셋 15081808).
 *
 * ## 왜 필요한가
 *
 * 임대인이 **법인**이거나 임대사업자일 때, 그 사업자가 실재하는지·휴폐업 상태인지
 * 확인한다. 전세사기에서 자주 나오는 형태가 있다.
 *
 *  · 폐업한 법인 명의로 계약해 보증금 반환 책임을 흐리는 경우
 *  · 존재하지 않는 사업자등록번호를 계약서에 적는 경우
 *
 * 등기부에는 법인명만 나오고 사업자 상태는 나오지 않으므로, 이 조회가 유일한 확인 수단이다.
 *
 * ## 다른 API 와 다른 점
 *
 * 이 API 는 **POST + JSON** 이다(다른 포털 API 는 대부분 GET + XML).
 * 그래서 공통 클라이언트를 쓰지 않고 여기서 직접 호출한다.
 */

const STATUS_ENDPOINT = "https://api.odcloud.kr/api/nts-businessman/v1/status";
const VALIDATE_ENDPOINT = "https://api.odcloud.kr/api/nts-businessman/v1/validate";
const TIMEOUT_MS = 10_000;

export interface BusinessStatus {
  /** 사업자등록번호 (하이픈 없이 10자리). */
  businessNumber: string;
  /**
   * 납세자 상태. "계속사업자" · "휴업자" · "폐업자" · null(등록되지 않음)
   */
  status: string | null;
  /** 과세 유형. 폐업 시 "폐업자"로 온다. */
  taxType: string | null;
  /** 폐업일 (YYYYMMDD). 폐업이 아니면 null. */
  closedOn: string | null;
  /** 국세청에 등록된 번호인지. false 면 계약서의 번호가 가짜일 수 있다. */
  registered: boolean;
  /** 지금 정상 영업 중인지. 휴·폐업이면 false. */
  active: boolean;
}

export function isBusinessStatusConfigured(): boolean {
  const env = loadEnv();
  return Boolean(env.NTS_BIZ_SERVICE_KEY ?? env.DATA_GO_KR_SERVICE_KEY);
}

/** 하이픈·공백을 지우고 10자리인지 확인한다. */
export function normalizeBusinessNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length === 10 ? digits : null;
}

async function post<T>(
  endpoint: string,
  serviceKey: string,
  body: unknown,
): Promise<PublicDataResult<T>> {
  // serviceKey 는 이미 인코딩된 형태로 발급되므로 그대로 붙인다.
  const url = `${endpoint}?serviceKey=${serviceKey}&returnType=JSON`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();

    if (res.status === 401 || res.status === 403) {
      return fail("unauthorized", "국세청 API 인증에 실패했습니다. 활용신청 승인 여부를 확인하세요.", String(res.status));
    }
    if (res.status === 429) {
      return fail("quota_exceeded", "국세청 API 호출 한도를 초과했습니다.", "429");
    }
    if (!res.ok) {
      return fail("unavailable", `국세청 API 오류입니다. (HTTP ${res.status})`, String(res.status));
    }
    if (!text.trimStart().startsWith("{")) {
      return fail("unexpected_format", "국세청 API 가 JSON 이 아닌 응답을 반환했습니다.");
    }
    return ok(JSON.parse(text) as T);
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    return fail(
      "unavailable",
      name === "TimeoutError" || name === "AbortError"
        ? "국세청 조회가 응답하지 않습니다."
        : "국세청 조회에 실패했습니다.",
    );
  }
}

interface StatusResponse {
  data?: {
    b_no?: string;
    b_stt?: string;
    tax_type?: string;
    end_dt?: string;
  }[];
}

/**
 * 사업자등록 상태를 조회한다.
 *
 * 등록되지 않은 번호도 **오류가 아니다** — "국세청에 없는 번호"라는 정보 자체가 결과다.
 * 그래서 `registered: false` 로 정상 반환한다.
 */
export async function fetchBusinessStatus(
  rawNumber: string,
): Promise<PublicDataResult<BusinessStatus>> {
  const env = loadEnv();
  const key = env.NTS_BIZ_SERVICE_KEY ?? env.DATA_GO_KR_SERVICE_KEY;
  if (!key) return fail("no_key", "국세청 API 키가 설정되지 않았습니다.");

  const number = normalizeBusinessNumber(rawNumber);
  if (!number) return fail("no_data", "사업자등록번호는 숫자 10자리여야 합니다.");

  const res = await post<StatusResponse>(STATUS_ENDPOINT, key, { b_no: [number] });
  if (!res.ok) return res;

  const row = res.data.data?.[0];
  // 국세청은 등록되지 않은 번호에 대해 b_stt 를 비워 보낸다.
  const status = row?.b_stt?.trim() || null;
  const taxType = row?.tax_type?.trim() || null;
  const registered = Boolean(status) || Boolean(taxType && !taxType.includes("등록되지"));

  return ok({
    businessNumber: number,
    status,
    taxType,
    closedOn: row?.end_dt?.trim() || null,
    registered,
    // "계속사업자" 만 정상으로 본다. 휴업·폐업은 보증금 반환 능력에 직결된다.
    active: status === "계속사업자",
  });
}

interface ValidateResponse {
  data?: { valid?: string; valid_msg?: string }[];
}

/**
 * 사업자등록번호 + 대표자명 + 개업일이 서로 맞는지 검증한다.
 *
 * 상태조회보다 강한 확인이다 — 번호만 맞고 대표자가 다르면 계약서가 위조됐을 수 있다.
 */
export async function validateBusiness(input: {
  businessNumber: string;
  /** 대표자 성명. */
  representativeName: string;
  /** 개업일자 YYYYMMDD. */
  openedOn: string;
}): Promise<PublicDataResult<{ valid: boolean; message: string | null }>> {
  const env = loadEnv();
  const key = env.NTS_BIZ_SERVICE_KEY ?? env.DATA_GO_KR_SERVICE_KEY;
  if (!key) return fail("no_key", "국세청 API 키가 설정되지 않았습니다.");

  const number = normalizeBusinessNumber(input.businessNumber);
  if (!number) return fail("no_data", "사업자등록번호는 숫자 10자리여야 합니다.");

  const res = await post<ValidateResponse>(VALIDATE_ENDPOINT, key, {
    businesses: [
      {
        b_no: number,
        start_dt: input.openedOn.replace(/\D/g, ""),
        p_nm: input.representativeName.trim(),
      },
    ],
  });
  if (!res.ok) return res;

  const row = res.data.data?.[0];
  return ok({
    valid: row?.valid === "01",
    message: row?.valid_msg?.trim() || null,
  });
}
