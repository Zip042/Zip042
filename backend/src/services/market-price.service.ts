import { loadEnv } from "../env.js";
import { mockMarketPrice } from "../mock/extraction.js";
import { log } from "../lib/logger.js";
import { MAN } from "../domain/money.js";
import type { MarketPriceEstimate } from "../domain/types.js";
import type { BuildingKind } from "../domain/valuation.js";

/**
 * 실거래가 기반 시세 산정 (기획서 2 ③).
 *
 * 방법: 같은 법정동 · 같은 건물 유형의 최근 매매 실거래에서 **㎡당 단가의 중위값**을 구하고,
 *       대상 매물의 전용면적을 곱한다. 평균 대신 중위값을 쓰는 이유는 원룸 시장에
 *       특이 거래(가족 간 거래, 급매)가 섞이기 때문이다.
 *
 * ⚠️ 운영 전 확인 사항
 *   1) 아래 오퍼레이션 경로는 공공데이터포털의 국토교통부 실거래가 API 기준으로 작성했다.
 *      포털에서 실제 신청한 API의 오퍼레이션명을 확인해 ENDPOINTS 를 맞출 것.
 *   2) 응답은 XML 이 기본이며 필드명이 한글/영문 두 가지로 존재한다. 둘 다 처리한다.
 *   3) 이 값은 **참고용 추정치**다. UI에 "추정 시세"임을 반드시 표시할 것.
 */

/**
 * 매매 실거래가 — 시세(집값) 산정용.
 *
 * 팀이 확정한 공공데이터포털 신청 목록(집톡 필요 API 요약, 2026-08)과 1:1로 맞춘다.
 * 괄호 안은 포털 데이터셋 번호이며, 신청 화면에서 이 번호로 찾으면 된다.
 */
const ENDPOINTS: Record<string, string> = {
  // 아파트 매매 (15126469)
  // ⚠️ `...AptTradeDev` 가 아니다. Dev 는 별도 서비스이고 이 키로는 403 이 온다.
  //    포털이 **경로가 틀려도 "등록되지 않은 서비스키"** 로 답하기 때문에, 오랫동안
  //    "활용신청이 안 됐다"고 오해하고 있었다. 실측으로 확인한 경로다.
  apartment: "/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade",
  // 오피스텔 매매 (15126475 계열)
  officetel: "/1613000/RTMSDataSvcOffiTrade/getRTMSDataSvcOffiTrade",
  // 연립·다세대 매매 (15126467) — 빌라 시세의 최핵심
  multi_family: "/1613000/RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade",
  row_house: "/1613000/RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade",
  studio: "/1613000/RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade",
  // 단독·다가구 매매 (15126472 계열)
  multi_household: "/1613000/RTMSDataSvcSHTrade/getRTMSDataSvcSHTrade",
  detached: "/1613000/RTMSDataSvcSHTrade/getRTMSDataSvcSHTrade",
};

/**
 * 전월세 실거래가 — **전세가율 비교용**.
 *
 * 매매가만으로는 "이 동네 전세가 보통 얼마인지"를 알 수 없다. 주변 전세 실거래를 함께
 * 보면 내 보증금이 시장에서 튀는 값인지 판단할 수 있다 — 깡통전세는 대개 시세 대비
 * 전세가가 비정상적으로 높다.
 *
 * ⚠️ 아직 조회 함수가 이 표를 쓰지 않는다. 키를 받아 응답 형식을 확인한 뒤 붙인다
 *    (`npm run preflight -- --only molit`). 지금 붙이면 검증 못 한 경로가 판정에 들어간다.
 */
export const RENT_ENDPOINTS: Record<string, string> = {
  // 아파트 전월세 (15126474)
  apartment: "/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent",
  // 오피스텔 전월세 (15126475)
  officetel: "/1613000/RTMSDataSvcOffiRent/getRTMSDataSvcOffiRent",
  // 연립·다세대 전월세 (15126473)
  multi_family: "/1613000/RTMSDataSvcRHRent/getRTMSDataSvcRHRent",
  row_house: "/1613000/RTMSDataSvcRHRent/getRTMSDataSvcRHRent",
  studio: "/1613000/RTMSDataSvcRHRent/getRTMSDataSvcRHRent",
  // 단독·다가구 전월세 (15126472) — 다가구 선순위보증금 참고
  multi_household: "/1613000/RTMSDataSvcSHRent/getRTMSDataSvcSHRent",
  detached: "/1613000/RTMSDataSvcSHRent/getRTMSDataSvcSHRent",
};

/** 조회할 최근 개월 수. 원룸·빌라는 거래가 드물어 12개월은 확보해야 표본이 모인다. */
const LOOKBACK_MONTHS = 12;
/** 면적 비교 허용 범위. 같은 건물 안에서도 타입별로 면적이 다르다. */
const AREA_TOLERANCE_RATIO = 0.2;
/** 이 표본 수 미만이면 신뢰도를 낮춰 보고한다. */
const MIN_RELIABLE_SAMPLES = 5;

export interface MarketPriceQuery {
  /** 법정동코드 10자리 중 앞 5자리(시군구코드). 예: 대전 서구 30170 */
  regionCode: string;
  buildingKind: BuildingKind;
  exclusiveAreaM2: number;
  /** 동일 건물 비교를 위한 건물명 (있으면 우선 사용) */
  buildingName?: string | null;
  /** 기준 시점. 테스트를 위해 주입 가능 */
  referenceDate?: Date;
}

interface DealRecord {
  amountKrw: number;
  areaM2: number;
  dealYearMonth: string;
  buildingName: string | null;
  legalDong: string | null;
}

// ---------------------------------------------------------------------------
// XML 파싱 — 의존성을 늘리지 않기 위해 <item> 단위로 최소 파싱만 한다.
// ---------------------------------------------------------------------------

function extractTag(xml: string, names: string[]): string | null {
  for (const name of names) {
    const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
    if (m?.[1] !== undefined) {
      const value = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, "$1").trim();
      if (value.length > 0) return value;
    }
  }
  return null;
}

function parseItems(xml: string): string[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]!);
}

/** 실거래가 API의 거래금액은 "만원" 단위 문자열(콤마 포함)이다. */
function parseDealAmountToKrw(raw: string | null): number | null {
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const man = Number(digits);
  if (!Number.isFinite(man) || man <= 0) return null;
  return man * MAN;
}

function parseDeal(itemXml: string): DealRecord | null {
  const amountKrw = parseDealAmountToKrw(extractTag(itemXml, ["dealAmount", "거래금액"]));
  const areaRaw = extractTag(itemXml, ["excluUseAr", "전용면적", "totalFloorAr", "연면적"]);
  const areaM2 = areaRaw ? Number(areaRaw.replace(/[^0-9.]/g, "")) : NaN;
  const year = extractTag(itemXml, ["dealYear", "년"]);
  const month = extractTag(itemXml, ["dealMonth", "월"]);

  if (!amountKrw || !Number.isFinite(areaM2) || areaM2 <= 0) return null;

  return {
    amountKrw,
    areaM2,
    dealYearMonth: year && month ? `${year}-${month.padStart(2, "0")}` : "",
    buildingName: extractTag(itemXml, [
      "aptNm",
      "offiNm",
      "mhouseNm",
      "houseType",
      "아파트",
      "연립다세대",
      "단지",
    ]),
    legalDong: extractTag(itemXml, ["umdNm", "법정동"]),
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx]!;
}

function yearMonths(reference: Date, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

async function fetchMonth(
  endpoint: string,
  serviceKey: string,
  lawdCd: string,
  dealYmd: string,
): Promise<DealRecord[]> {
  const env = loadEnv();
  // ⚠️ serviceKey 는 URLSearchParams 에 넣지 않는다. 공공데이터포털의 "Encoding" 키는
  // 이미 URL 인코딩된 문자열이라, searchParams.set() 을 거치면 `%2B` 가 `%252B` 로
  // 이중 인코딩되어 인증이 조용히 실패한다(HTTP 403, 본문 없이). 그래서 쿼리 문자열에
  // serviceKey 만 직접 붙이고, 나머지 파라미터만 URLSearchParams 로 구성한다.
  const rest = new URLSearchParams({
    LAWD_CD: lawdCd,
    DEAL_YMD: dealYmd,
    numOfRows: "1000",
    pageNo: "1",
  });
  const base = new URL(endpoint, env.DATA_GO_KR_BASE_URL);
  const url = `${base.origin}${base.pathname}?serviceKey=${serviceKey}&${rest.toString()}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`실거래가 API 오류 (${res.status})`);
  const xml = await res.text();

  // 서비스 키 오류 등은 200 + 에러 XML 로 온다.
  const resultCode = extractTag(xml, ["resultCode", "returnReasonCode"]);
  if (resultCode && !["00", "000", "0000"].includes(resultCode)) {
    const msg = extractTag(xml, ["resultMsg", "returnAuthMsg"]) ?? resultCode;
    throw new Error(`실거래가 API 응답 오류: ${msg}`);
  }

  return parseItems(xml)
    .map(parseDeal)
    .filter((d): d is DealRecord => d !== null);
}

export function isMarketPriceAvailable(): boolean {
  if (loadEnv().mode === "mock") return true;
  return Boolean(loadEnv().DATA_GO_KR_SERVICE_KEY);
}

/**
 * 실거래가로 시세를 추정한다. 조회 실패나 표본 부족은 예외가 아니라
 * `source: "unavailable"` 로 표현한다 — 분석 전체를 중단시키지 않기 위해서다.
 */
export async function estimateMarketPrice(query: MarketPriceQuery): Promise<MarketPriceEstimate> {
  const env = loadEnv();
  if (env.mode === "mock") return mockMarketPrice(query);

  const serviceKey = env.DATA_GO_KR_SERVICE_KEY;
  const endpoint = ENDPOINTS[query.buildingKind];

  if (!serviceKey) {
    return unavailable("공공데이터포털 서비스 키가 설정되지 않았습니다.");
  }
  if (!endpoint) {
    return unavailable(`${query.buildingKind} 유형은 실거래가 조회를 지원하지 않습니다.`);
  }

  const lawdCd = query.regionCode.slice(0, 5);
  if (!/^\d{5}$/.test(lawdCd)) {
    return unavailable("법정동코드(시군구코드 5자리)가 올바르지 않습니다.");
  }

  const months = yearMonths(query.referenceDate ?? new Date(), LOOKBACK_MONTHS);
  const settled = await Promise.allSettled(
    months.map((ym) => fetchMonth(endpoint, serviceKey, lawdCd, ym)),
  );

  const deals: DealRecord[] = [];
  let failures = 0;
  for (const r of settled) {
    if (r.status === "fulfilled") deals.push(...r.value);
    else failures += 1;
  }

  if (failures === months.length) {
    log.warn("실거래가 조회 전부 실패", { lawdCd, buildingKind: query.buildingKind });
    return unavailable("실거래가 조회에 실패했습니다.");
  }

  // 1차: 같은 건물명 + 비슷한 면적
  const byName = query.buildingName
    ? deals.filter((d) => d.buildingName && normalizeBuildingName(d.buildingName) === normalizeBuildingName(query.buildingName!))
    : [];

  const areaFiltered = (pool: DealRecord[]) =>
    pool.filter(
      (d) => Math.abs(d.areaM2 - query.exclusiveAreaM2) / query.exclusiveAreaM2 <= AREA_TOLERANCE_RATIO,
    );

  let pool = areaFiltered(byName);
  let method = "동일 건물 · 유사 면적 매매 실거래 단가 중위값";

  if (pool.length < 2) {
    pool = areaFiltered(deals);
    method = "동일 시군구 · 유사 면적 매매 실거래 단가 중위값";
  }
  if (pool.length < 2) {
    pool = deals;
    method = "동일 시군구 전체 매매 실거래 단가 중위값";
  }
  if (pool.length === 0) {
    return unavailable("최근 12개월 내 비교할 실거래가 없습니다.");
  }

  const unitPrices = pool.map((d) => d.amountKrw / d.areaM2);
  const estimated = Math.round(median(unitPrices) * query.exclusiveAreaM2);
  const low = Math.round(percentile(unitPrices, 0.25) * query.exclusiveAreaM2);
  const high = Math.round(percentile(unitPrices, 0.75) * query.exclusiveAreaM2);

  // 표본이 적고 필터가 느슨할수록 신뢰도를 낮춘다.
  const sampleFactor = Math.min(1, pool.length / MIN_RELIABLE_SAMPLES);
  const methodFactor = method.startsWith("동일 건물") ? 1 : method.includes("유사 면적") ? 0.8 : 0.55;
  const confidence = Math.round(Math.min(0.95, 0.4 + 0.55 * sampleFactor * methodFactor) * 1000) / 1000;

  return {
    estimatedKrw: estimated,
    lowKrw: low,
    highKrw: high,
    source: "molit_rtms",
    method: `${method} × 전용면적 ${query.exclusiveAreaM2}㎡`,
    sampleSize: pool.length,
    confidence,
  };
}

function normalizeBuildingName(name: string): string {
  return name.replace(/\s|\(.*?\)/g, "").trim();
}

function unavailable(reason: string): MarketPriceEstimate {
  return {
    estimatedKrw: 0,
    lowKrw: null,
    highKrw: null,
    source: "unavailable",
    method: reason,
    sampleSize: 0,
    confidence: 0,
  };
}

/** 사용자가 직접 입력한 시세를 그대로 쓴다. 신뢰도는 중간으로 둔다. */
export function userProvidedPrice(estimatedKrw: number): MarketPriceEstimate {
  return {
    estimatedKrw,
    lowKrw: null,
    highKrw: null,
    source: "user_input",
    method: "사용자 직접 입력",
    sampleSize: null,
    confidence: 0.6,
  };
}
