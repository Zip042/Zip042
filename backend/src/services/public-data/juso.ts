import { loadEnv } from "../../env.js";
import { fail, ok, type PublicDataResult } from "./client.js";

/**
 * 행정안전부 도로명주소 개발자센터 — 주소 검색 · 법정동코드.
 *
 * ## 왜 이게 가장 먼저인가
 *
 * 실거래가 API 는 전부 **법정동코드 앞 5자리(LAWD_CD)** 를 필수로 요구한다.
 * 이 코드를 얻는 길이 여기다. 이 키가 없으면 시세 조회가 아예 돌지 않는다.
 *
 * ## 카카오와 무엇이 다른가
 *
 * 카카오 로컬 API 도 `b_code` 로 법정동코드를 주지만, 도로명주소 개발자센터는
 * **행안부가 직접 운영하는 원본**이다. 주소 정규화(도로명·지번 표기 통일)까지 해 주므로
 * 서류 대조에도 유리하다. 대신 **좌표를 주지 않는다** — 좌표가 필요하면 카카오를 함께 쓴다.
 *
 * ⚠️ `confmKey` 는 신청한 **사용 URL(도메인)에서만** 동작한다. 로컬에서 테스트하려면
 *    신청 시 `http://localhost` 를 포함시켜야 한다. 이걸 몰라 "키가 틀렸다"고 오해하기 쉽다.
 *
 * 엔드포인트: https://business.juso.go.kr/addrlink/addrLinkApi.do
 */

const ENDPOINT = "https://business.juso.go.kr/addrlink/addrLinkApi.do";
const TIMEOUT_MS = 10_000;

export interface JusoAddress {
  /** 도로명주소 전체. 예: "대전광역시 서구 둔산로 100" */
  roadAddress: string;
  /** 지번주소 전체. */
  jibunAddress: string;
  /** 건물명. 없으면 빈 문자열. */
  buildingName: string;
  /** 시군구. 소액임차인 기준·지역 분류에 쓴다. */
  sigungu: string;
  /** 법정동명. */
  legalDong: string;
  /**
   * 법정동코드 10자리.
   * **앞 5자리가 실거래가 API 의 LAWD_CD** 다.
   */
  regionCode: string;
  postalCode: string;
  /** 공동주택 여부 (1: 공동주택, 0: 비공동주택). 건물 유형 추정에 쓴다. */
  isApartment: boolean;
}

interface JusoRawItem {
  roadAddr?: string;
  jibunAddr?: string;
  bdNm?: string;
  siNm?: string;
  sggNm?: string;
  emdNm?: string;
  admCd?: string;
  zipNo?: string;
  apartYn?: string;
}

interface JusoRawResponse {
  results?: {
    common?: { errorCode?: string; errorMessage?: string; totalCount?: string };
    juso?: JusoRawItem[] | null;
  };
}

/** 도로명주소 API 의 오류 코드를 사람이 읽을 수 있는 사유로. */
function reasonFor(code: string, message: string | undefined): PublicDataResult<never> {
  switch (code) {
    case "E0001":
      return fail("unauthorized", "승인되지 않은 키입니다. 도로명주소 개발자센터에서 신청 상태를 확인하세요.", code);
    case "E0005":
      return fail(
        "unauthorized",
        "이 키에 등록되지 않은 주소에서 호출했습니다. 신청 시 등록한 '사용 URL' 에 현재 도메인(로컬이면 http://localhost)을 추가하세요.",
        code,
      );
    case "E0006":
      return fail("quota_exceeded", "일일 호출 한도를 초과했습니다.", code);
    case "E0008":
      return fail("no_data", "검색 결과가 없습니다.", code);
    default:
      return fail("unexpected_format", message ?? `도로명주소 API 오류 (코드 ${code})`, code);
  }
}

export function isJusoConfigured(): boolean {
  return Boolean(loadEnv().JUSO_CONFM_KEY);
}

/**
 * 주소를 검색해 정규화된 주소 + 법정동코드를 얻는다.
 *
 * 키가 없으면 `no_key` 로 돌려주고 **예외를 던지지 않는다**. 주소 검색이 안 된다고
 * 검사 건 생성을 막을 이유가 없다 — 좌표·코드가 없으면 그 사실이 finding 으로 올라간다.
 */
export async function searchJuso(
  keyword: string,
  limit = 10,
): Promise<PublicDataResult<JusoAddress[]>> {
  const key = loadEnv().JUSO_CONFM_KEY;
  if (!key) return fail("no_key", "도로명주소 API 키(JUSO_CONFM_KEY)가 설정되지 않았습니다.");

  const trimmed = keyword.trim();
  if (trimmed.length < 2) {
    return fail("no_data", "검색어를 2자 이상 입력해 주세요.");
  }

  const url =
    `${ENDPOINT}?confmKey=${encodeURIComponent(key)}` +
    `&currentPage=1&countPerPage=${Math.min(Math.max(limit, 1), 100)}` +
    `&keyword=${encodeURIComponent(trimmed)}&resultType=json`;

  let parsed: JusoRawResponse;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return fail("unavailable", `도로명주소 서버 오류입니다. (HTTP ${res.status})`);
    const text = await res.text();
    // resultType=json 이어도 오류 시 XML 이 오는 경우가 있다.
    if (!text.trimStart().startsWith("{")) {
      return fail("unexpected_format", "도로명주소 API 가 JSON 이 아닌 응답을 반환했습니다.");
    }
    parsed = JSON.parse(text) as JusoRawResponse;
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    return fail(
      "unavailable",
      name === "TimeoutError" || name === "AbortError"
        ? "도로명주소 조회가 응답하지 않습니다."
        : "도로명주소 조회에 실패했습니다.",
    );
  }

  const common = parsed.results?.common;
  const code = common?.errorCode ?? "";
  if (code && code !== "0") return reasonFor(code, common?.errorMessage);

  const items = parsed.results?.juso ?? [];
  return ok(
    items.map((it) => ({
      roadAddress: it.roadAddr ?? "",
      jibunAddress: it.jibunAddr ?? "",
      buildingName: it.bdNm ?? "",
      sigungu: [it.siNm, it.sggNm].filter(Boolean).join(" "),
      legalDong: it.emdNm ?? "",
      // admCd 가 법정동코드 10자리다. 앞 5자리가 LAWD_CD.
      regionCode: it.admCd ?? "",
      postalCode: it.zipNo ?? "",
      isApartment: it.apartYn === "1",
    })),
  );
}

/**
 * 법정동코드에서 실거래가 API 가 요구하는 시군구코드(5자리)를 뽑는다.
 *
 * 이 변환을 각 호출부에서 하면 어딘가는 10자리를 그대로 넘긴다. 한 곳에 둔다.
 */
export function toLawdCd(regionCode: string | null | undefined): string | null {
  if (!regionCode) return null;
  const digits = regionCode.replace(/\D/g, "");
  return /^\d{5,}$/.test(digits) ? digits.slice(0, 5) : null;
}
