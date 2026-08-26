import { loadEnv } from "../../env.js";
import { log } from "../../lib/logger.js";

/**
 * 공공데이터포털 공통 클라이언트.
 *
 * 국토교통부·국세청·한국부동산원 API 는 전부 같은 포털에서 나오고 **같은 함정**을 공유한다.
 * 그 함정을 한 곳에서 처리해 각 어댑터가 도메인 로직에만 집중하게 한다.
 *
 * ## 이 포털의 함정
 *
 * 1. **키 오류가 HTTP 200 으로 온다.** 본문에 `<resultCode>30</resultCode>` 같은 에러
 *    코드가 담겨 온다. `res.ok` 만 보면 실패를 성공으로 오해한다. — 가장 중요한 함정.
 * 2. **serviceKey 가 이미 URL 인코딩된 형태로 발급된다.** `URLSearchParams` 에 넣으면
 *    `%` 가 `%25` 로 이중 인코딩돼 인증이 깨진다. 그래서 쿼리 문자열을 직접 조립한다.
 * 3. 응답이 XML 이 기본이고, 같은 필드가 한글명·영문명 두 가지로 존재한다.
 * 4. 데이터가 없을 때와 오류일 때의 응답이 비슷하게 생겼다.
 *
 * ## 실패를 표현하는 방식
 *
 * 예외를 던지지 않고 `PublicDataResult` 로 돌려준다. 외부 조회 실패가 분석 전체를
 * 중단시키면 안 되기 때문이다 — 시세를 못 구해도 등기부 판정은 나와야 한다.
 * 실패는 `ok: false` 와 **사람이 읽을 수 있는 이유**로 표현한다.
 */

/** 외부 호출 상한. 이보다 오래 걸리면 분석 전체가 늦어진다. */
const DEFAULT_TIMEOUT_MS = 10_000;

export type PublicDataFailure =
  /** 키가 설정되지 않음 — 기능 미사용 상태. 오류가 아니다. */
  | "no_key"
  /** 키가 유효하지 않거나 해당 API 활용신청이 승인되지 않음. */
  | "unauthorized"
  /** 일일 트래픽 초과. */
  | "quota_exceeded"
  /** 요청은 성공했으나 해당 조건의 데이터가 없음. */
  | "no_data"
  /** 네트워크·타임아웃·5xx. */
  | "unavailable"
  /** 응답이 예상과 다름 (필드명 변경 등). */
  | "unexpected_format";

export interface PublicDataOk<T> {
  ok: true;
  data: T;
}

export interface PublicDataError {
  ok: false;
  failure: PublicDataFailure;
  /** 화면·로그에 그대로 쓸 수 있는 한국어 사유. */
  reason: string;
  /** 포털이 준 원래 코드. 문제 추적용. */
  upstreamCode?: string;
}

export type PublicDataResult<T> = PublicDataOk<T> | PublicDataError;

export const ok = <T>(data: T): PublicDataOk<T> => ({ ok: true, data });

export const fail = (
  failure: PublicDataFailure,
  reason: string,
  upstreamCode?: string,
): PublicDataError => ({ ok: false, failure, reason, ...(upstreamCode ? { upstreamCode } : {}) });

// ---------------------------------------------------------------------------
// 응답 파싱 도우미 — XML · JSON 양쪽을 다룬다
// ---------------------------------------------------------------------------

/**
 * XML 태그 또는 JSON 키에서 값을 하나 꺼낸다.
 *
 * 후보를 여러 개 받는 이유: 포털 응답은 같은 값을 `dealAmount` 로도 `거래금액` 으로도
 * 준다. 어느 쪽이 올지 문서만 보고는 알 수 없어 둘 다 시도한다.
 */
export function pickField(body: string, names: readonly string[]): string | null {
  for (const name of names) {
    const xml = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(body);
    if (xml?.[1] !== undefined) {
      const value = xml[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, "$1").trim();
      if (value.length > 0) return value;
    }
    const json = new RegExp(`"${name}"\\s*:\\s*"?([^",}\\]]+)"?`).exec(body);
    if (json?.[1]) {
      const value = json[1].trim();
      if (value.length > 0 && value !== "null") return value;
    }
  }
  return null;
}

/** `<item>…</item>` 블록을 전부 꺼낸다. */
export function pickItems(xml: string): string[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]!);
}

/** 숫자만 남겨 정수로. 콤마·단위 문자가 섞인 값을 다룬다. */
export function toInt(raw: string | null): number | null {
  if (!raw) return null;
  const digits = raw.replace(/[^0-9-]/g, "");
  if (!digits || digits === "-") return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/** 소수점을 허용하는 숫자 변환. 면적 등에 쓴다. */
export function toFloat(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// 호출
// ---------------------------------------------------------------------------

/** 포털 공통 오류 코드 → 우리 실패 종류. */
function classify(code: string, message: string | null): PublicDataError {
  switch (code) {
    case "30":
    case "31":
      return fail(
        "unauthorized",
        "등록되지 않았거나 활용신청이 승인되지 않은 키입니다. 포털에서 이 API 의 신청 상태를 확인하세요.",
        code,
      );
    case "22":
      return fail("quota_exceeded", "일일 트래픽 한도를 초과했습니다. 키 자체는 유효합니다.", code);
    case "03":
      return fail("no_data", "해당 조건의 데이터가 없습니다.", code);
    case "12":
      return fail(
        "unexpected_format",
        "이 오퍼레이션 경로 자체가 존재하지 않거나 폐기됐습니다(NO_OPENAPI_SERVICE_ERROR). " +
          "포털에서 이 API의 '상세설명' 문서를 열어 실제 오퍼레이션명·경로를 확인하세요.",
        code,
      );
    default:
      return fail("unexpected_format", message ?? `포털 응답 오류 (코드 ${code})`, code);
  }
}

export interface PublicDataRequest {
  /** `https://apis.data.go.kr` 뒤에 붙는 경로. */
  path: string;
  /** serviceKey 를 제외한 쿼리 파라미터. */
  params: Record<string, string | number | undefined>;
  /** 호출 이름. 로그에 남는다. */
  label: string;
  timeoutMs?: number;
  /** 기본 base URL 대신 다른 호스트를 쓸 때 (국세청 등). */
  baseUrl?: string;
  /** 이 API 전용 키. 비우면 공통 `DATA_GO_KR_SERVICE_KEY` 를 쓴다. */
  serviceKey?: string | undefined;
}

/**
 * 공공데이터포털을 호출하고 **본문까지 검사한** 결과를 돌려준다.
 *
 * `res.ok` 만 보고 성공으로 넘기지 않는다 — 이 포털의 가장 큰 함정이다.
 */
export async function callPublicData(
  req: PublicDataRequest,
): Promise<PublicDataResult<string>> {
  const env = loadEnv();
  const serviceKey = req.serviceKey ?? env.DATA_GO_KR_SERVICE_KEY;

  if (!serviceKey) {
    return fail("no_key", "공공데이터포털 서비스 키가 설정되지 않았습니다.");
  }

  const base = req.baseUrl ?? env.DATA_GO_KR_BASE_URL;

  // serviceKey 는 발급 시 이미 URL 인코딩되어 있다. URLSearchParams 에 넣으면
  // `%2B` 가 `%252B` 로 이중 인코딩돼 인증이 깨진다. 그래서 직접 붙인다.
  const query = Object.entries(req.params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");

  const url = `${base}${req.path}?serviceKey=${serviceKey}${query ? `&${query}` : ""}`;

  let res: Response;
  let body: string;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(req.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      headers: { accept: "application/json, application/xml;q=0.9, */*;q=0.8" },
    });
    body = await res.text();
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const timedOut = name === "TimeoutError" || name === "AbortError";
    log.warn("공공데이터 호출 실패", {
      label: req.label,
      error: err instanceof Error ? err.message : String(err),
    });
    return fail(
      "unavailable",
      timedOut ? "응답이 너무 늦어 조회를 중단했습니다." : "외부 조회에 실패했습니다.",
    );
  }

  if (res.status === 401 || res.status === 403) {
    return fail("unauthorized", "인증에 실패했습니다. 서비스 키를 확인하세요.", String(res.status));
  }

  /**
   * ⚠️ 여기가 핵심 — 오류 본문을 **HTTP 상태와 무관하게** 먼저 확인한다.
   *
   * 이 포털은 키 오류를 200 으로도 주지만(가장 흔한 함정), 어떤 오퍼레이션은
   * 존재하지 않는 오퍼레이션명·폐기된 API 를 부르면 **400 + 이 구조의 XML** 로도 준다
   * (`NO_OPENAPI_SERVICE_ERROR` 등). 상태가 400이라고 본문을 안 보면, 진짜 원인
   * ("이 오퍼레이션 자체가 없다")을 버리고 "외부 서버 오류"라는 뭉뚱그린 메시지만 남는다.
   */
  const code = pickField(body, ["resultCode", "returnReasonCode", "errMsg"]);
  const message = pickField(body, ["resultMsg", "returnAuthMsg", "errMsg"]);
  if (code && !["00", "000", "0000", "0"].includes(code)) {
    const classified = classify(code, message);
    log.warn("공공데이터 응답 오류", { label: req.label, code, message });
    return classified;
  }

  if (!res.ok) {
    return fail("unavailable", `외부 서버 오류입니다. (HTTP ${res.status})`, String(res.status));
  }

  // HTML 이 왔다면 대개 포털 점검 페이지다.
  if (/^\s*<!DOCTYPE html/i.test(body) || /<html[\s>]/i.test(body)) {
    return fail("unavailable", "포털이 데이터 대신 안내 페이지를 반환했습니다. 잠시 후 다시 시도하세요.");
  }

  return ok(body);
}
