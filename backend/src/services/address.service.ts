import { loadEnv } from "../env.js";
import { badRequest, upstreamFailed } from "../lib/errors.js";
import { log } from "../lib/logger.js";
import { MOCK_ADDRESSES } from "../mock/addresses.js";

/**
 * 주소 검색 · 지오코딩.
 *
 * 왜 서버에 두는가: 이 서비스의 두 기능이 **좌표와 법정동코드에 전적으로 의존**한다.
 *   · 지역 위험 레이어 → 좌표 (반경 500m 집계)
 *   · 실거래가 시세    → 법정동코드 5자리 (시군구코드)
 * 프론트엔드가 이 값을 알아서 채우게 하면 결국 프론트엔드에 지오코딩을 또 붙이게 되고,
 * 두 곳의 정규화 규칙이 어긋나면 조회 결과가 달라진다. 서버가 단일 창구가 되어야 한다.
 *
 * ## 제공자 교체
 *
 * `AddressProvider` 인터페이스만 구현하면 된다. 지금은 목 제공자만 있고,
 * 실제 키가 생기면 `kakaoProvider` / `vworldProvider` 를 채워 `resolveProvider()` 에 등록한다.
 * 라우트와 도메인 코드는 바뀌지 않는다.
 */

export interface AddressResult {
  /** 도로명주소 (예: 대전광역시 서구 둔산로 100) */
  roadAddress: string;
  /** 지번주소 */
  jibunAddress: string | null;
  buildingName: string | null;
  /** 시군구 (소액임차인 기준 · 지역 분류에 사용) */
  sigungu: string;
  legalDong: string | null;
  /** 법정동코드 10자리. 앞 5자리가 실거래가 API 의 LAWD_CD */
  regionCode: string;
  postalCode: string | null;
  lat: number;
  lng: number;
  /** 이 결과를 어디서 얻었는지 — 프론트엔드가 신뢰도를 판단할 수 있게 노출한다. */
  source: AddressProviderName;
}

export type AddressProviderName = "mock" | "kakao" | "vworld";

export interface AddressProvider {
  readonly name: AddressProviderName;
  search(query: string, limit: number): Promise<AddressResult[]>;
}

// ---------------------------------------------------------------------------
// 목 제공자
// ---------------------------------------------------------------------------

/** 검색어 정규화: 공백·구분자 제거 후 비교한다. "둔산로100" 으로도 찾아지게. */
function normalizeQuery(q: string): string {
  return q.replace(/[\s,.-]/g, "").toLowerCase();
}

const mockProvider: AddressProvider = {
  name: "mock",
  async search(query, limit) {
    const q = normalizeQuery(query);
    if (q.length === 0) return [];

    const scored = MOCK_ADDRESSES.map((a) => {
      const haystack = normalizeQuery(
        [a.roadAddress, a.jibunAddress, a.buildingName, a.legalDong].filter(Boolean).join(""),
      );
      if (!haystack.includes(q)) return null;
      // 도로명주소 앞부분이 일치하면 더 위로 올린다.
      const rank = normalizeQuery(a.roadAddress).indexOf(q);
      return { address: a, rank: rank < 0 ? 999 : rank };
    }).filter((x): x is { address: (typeof MOCK_ADDRESSES)[number]; rank: number } => x !== null);

    return scored
      .sort((a, b) => a.rank - b.rank || a.address.roadAddress.localeCompare(b.address.roadAddress))
      .slice(0, limit)
      .map(({ address }) => ({ ...address, source: "mock" as const }));
  },
};

// ---------------------------------------------------------------------------
// 실제 제공자 (키 발급 후 채운다)
// ---------------------------------------------------------------------------

/**
 * 카카오 로컬 API 제공자.
 *
 * ⚠️ 아직 구현하지 않았다. 키가 생기면 아래를 채운다.
 *   · 엔드포인트: https://dapi.kakao.com/v2/local/search/address.json?query=...
 *   · 헤더: Authorization: KakaoAK {REST_API_KEY}
 *   · 응답의 `road_address.zone_no`(우편번호) · `x`(경도) · `y`(위도) 를 매핑한다.
 *
 * 주의: 카카오 응답에는 **법정동코드가 `b_code` 로** 들어 있다(행정동코드 `h_code` 와 다름).
 *       실거래가 API 는 법정동코드 기준이므로 `b_code` 를 써야 한다. 이걸 혼동하면
 *       시세 조회가 조용히 빈 결과를 돌려준다.
 */
const kakaoProvider: AddressProvider = {
  name: "kakao",
  async search() {
    throw upstreamFailed(
      "카카오 주소 검색이 아직 연동되지 않았습니다. KAKAO_REST_API_KEY 설정 후 구현이 필요합니다.",
    );
  },
};

/**
 * 국토교통부 VWorld 제공자.
 *
 * ⚠️ 아직 구현하지 않았다.
 *   · 엔드포인트: https://api.vworld.kr/req/address?service=address&request=getcoord&...
 *   · 법정동코드는 별도 조회가 필요할 수 있다(주소 → 법정동코드 매핑 API).
 */
const vworldProvider: AddressProvider = {
  name: "vworld",
  async search() {
    throw upstreamFailed(
      "VWorld 주소 검색이 아직 연동되지 않았습니다. VWORLD_API_KEY 설정 후 구현이 필요합니다.",
    );
  },
};

function resolveProvider(): AddressProvider {
  const env = loadEnv();
  if (env.mode === "mock") return mockProvider;
  if (env.KAKAO_REST_API_KEY) return kakaoProvider;
  if (env.VWORLD_API_KEY) return vworldProvider;
  // live 모드인데 키가 없으면 목 데이터로 폴백한다.
  // 조용히 빈 결과를 주면 프론트엔드는 "검색 결과 없음"으로 오해하므로, 로그와 source 로 알린다.
  log.warn("주소 검색 제공자 키가 없어 목 데이터로 폴백합니다", {
    hint: "KAKAO_REST_API_KEY 또는 VWORLD_API_KEY 를 설정하세요.",
  });
  return mockProvider;
}

export function addressProviderName(): AddressProviderName {
  return resolveProvider().name;
}

export function isAddressSearchLive(): boolean {
  return resolveProvider().name !== "mock";
}

export interface AddressSearchOutcome {
  results: AddressResult[];
  provider: AddressProviderName;
  /** 목 데이터로 응답했는지 — 프론트엔드가 "개발용 데이터" 배지를 띄울 수 있게 한다. */
  isMockData: boolean;
}

export async function searchAddress(query: string, limit = 10): Promise<AddressSearchOutcome> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    throw badRequest("검색어를 2자 이상 입력해 주세요.");
  }

  const provider = resolveProvider();
  const results = await provider.search(trimmed, limit);

  return {
    results,
    provider: provider.name,
    isMockData: provider.name === "mock",
  };
}

/**
 * 검사 건 생성·수정 시 좌표가 비어 있으면 주소로 보완한다.
 *
 * 실패해도 예외를 던지지 않는다 — 주소 검색이 안 된다고 검사 건 생성을 막을 이유는 없고,
 * 좌표가 없으면 분석이 `REGION_LOCATION_UNKNOWN` 으로 사용자에게 알린다.
 */
export interface ResolvedLocation {
  lat: number | null;
  lng: number | null;
  regionCode: string | null;
  sigungu: string | null;
  resolvedFrom: AddressProviderName | null;
}

export async function resolveLocation(input: {
  roadAddress: string | null;
  lat: number | null;
  lng: number | null;
  regionCode: string | null;
  sigungu: string | null;
}): Promise<ResolvedLocation> {
  const alreadyComplete =
    input.lat !== null && input.lng !== null && input.regionCode !== null && input.sigungu !== null;
  if (alreadyComplete || !input.roadAddress) {
    return {
      lat: input.lat,
      lng: input.lng,
      regionCode: input.regionCode,
      sigungu: input.sigungu,
      resolvedFrom: null,
    };
  }

  try {
    const { results, provider } = await searchAddress(input.roadAddress, 1);
    const top = results[0];
    if (!top) {
      return {
        lat: input.lat,
        lng: input.lng,
        regionCode: input.regionCode,
        sigungu: input.sigungu,
        resolvedFrom: null,
      };
    }
    // 사용자가 명시한 값은 덮어쓰지 않는다. 빈 칸만 채운다.
    return {
      lat: input.lat ?? top.lat,
      lng: input.lng ?? top.lng,
      regionCode: input.regionCode ?? top.regionCode,
      sigungu: input.sigungu ?? top.sigungu,
      resolvedFrom: provider,
    };
  } catch (err) {
    log.warn("주소 자동 보완 실패", {
      roadAddress: input.roadAddress,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      lat: input.lat,
      lng: input.lng,
      regionCode: input.regionCode,
      sigungu: input.sigungu,
      resolvedFrom: null,
    };
  }
}
