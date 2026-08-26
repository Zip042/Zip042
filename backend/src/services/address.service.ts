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

const KAKAO_ADDRESS_URL = "https://dapi.kakao.com/v2/local/search/address.json";

/** 카카오 주소 검색 응답에서 실제로 쓰는 필드만 추린 형태. */
interface KakaoAddressDocument {
  address_name?: string;
  address_type?: string;
  /** 지번(법정동) 정보. **법정동코드 `b_code` 가 여기에만 있다.** */
  address?: {
    address_name?: string;
    b_code?: string;
    region_2depth_name?: string;
    region_3depth_name?: string;
  } | null;
  road_address?: {
    address_name?: string;
    building_name?: string;
    region_2depth_name?: string;
    region_3depth_name?: string;
    zone_no?: string;
  } | null;
  x?: string;
  y?: string;
}

/** 빈 문자열을 null 로. 카카오는 없는 값을 `""` 로 준다. */
function orNull(v: string | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/**
 * 카카오 로컬 API 제공자.
 *
 * 주의 1 — **법정동코드는 `b_code`** 다(행정동코드 `h_code` 와 다르다). 실거래가 API 는
 *   법정동코드 기준이라 `h_code` 를 쓰면 시세 조회가 조용히 빈 결과를 돌려준다.
 *
 * 주의 2 — **번지 없는 도로명만 검색하면 `address` 가 null 로 온다**(`address_type: "ROAD"`).
 *   그런 항목에는 법정동코드가 아예 없다. 예: "둔산로" → 10건 모두 b_code 없음,
 *   "둔산로 89" → b_code 3017011200. 코드를 지어내면 엉뚱한 동네 시세를 붙이게 되므로
 *   (설계 원칙 2) 그런 항목은 **결과에서 제외**한다. 사용자는 번지까지 입력하면 찾는다.
 */
const kakaoProvider: AddressProvider = {
  name: "kakao",
  async search(query, limit) {
    const url = new URL(KAKAO_ADDRESS_URL);
    url.searchParams.set("query", query);
    // 법정동코드가 없는 항목을 걸러내므로 여유 있게 받아 온다 (카카오 상한 30).
    url.searchParams.set("size", String(Math.min(30, Math.max(limit * 3, limit))));

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `KakaoAK ${loadEnv().KAKAO_REST_API_KEY ?? ""}` },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw upstreamFailed(
        `카카오 주소 검색에 실패했습니다: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      if (res.status === 401) {
        throw upstreamFailed("카카오 인증에 실패했습니다. REST API 키인지 확인하세요.");
      }
      throw upstreamFailed(`카카오 주소 검색 오류 (HTTP ${res.status}) ${body}`);
    }

    const body = (await res.json()) as { documents?: KakaoAddressDocument[] };
    const documents = body.documents ?? [];

    const results: AddressResult[] = [];
    let droppedNoRegionCode = 0;

    for (const doc of documents) {
      const regionCode = doc.address?.b_code?.trim();
      const lat = Number(doc.y);
      const lng = Number(doc.x);

      // 법정동코드나 좌표가 없으면 이 서비스에서 쓸 수 없는 결과다. 채워 넣지 않고 버린다.
      if (!regionCode || regionCode.length !== 10) {
        droppedNoRegionCode += 1;
        continue;
      }
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        droppedNoRegionCode += 1;
        continue;
      }

      const road = doc.road_address;
      results.push({
        roadAddress: orNull(road?.address_name) ?? doc.address_name ?? "",
        jibunAddress: orNull(doc.address?.address_name),
        buildingName: orNull(road?.building_name),
        sigungu: orNull(doc.address?.region_2depth_name) ?? orNull(road?.region_2depth_name) ?? "",
        legalDong: orNull(doc.address?.region_3depth_name),
        regionCode,
        postalCode: orNull(road?.zone_no),
        lat,
        lng,
        source: "kakao",
      });
      if (results.length >= limit) break;
    }

    // 전부 걸러졌다면 "결과 없음"과 구별되어야 한다 — 번지를 붙이면 찾아지기 때문이다.
    if (results.length === 0 && droppedNoRegionCode > 0) {
      log.info("카카오 검색 결과에 법정동코드가 없어 전부 제외했습니다", {
        query,
        dropped: droppedNoRegionCode,
        hint: "도로명만 입력한 경우입니다. 건물번호(번지)까지 입력하면 법정동코드가 옵니다.",
      });
    }

    return results;
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
