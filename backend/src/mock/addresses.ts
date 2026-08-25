/**
 * 주소 검색 목 데이터 (개발용).
 *
 * ⚠️ 주의사항
 *  1) 건물명은 전부 **가상**이다. 실제 건물과 무관하다.
 *  2) 좌표는 해당 구의 대략적인 위치일 뿐 정확한 지번 좌표가 아니다.
 *  3) `regionCode` 는 **시군구코드 5자리**만 넣었다. 실거래가 API 가 쓰는 값이 이 5자리이고,
 *     법정동 하위 5자리를 임의로 지어내면 나중에 실제 데이터로 바꿀 때 틀린 값이 남는다.
 *     실제 제공자(카카오 `b_code` 등)를 붙이면 10자리 법정동코드가 들어온다.
 *
 * 대전 시군구코드: 동구 30110 · 중구 30140 · 서구 30170 · 유성구 30200 · 대덕구 30230
 */

export interface MockAddress {
  roadAddress: string;
  jibunAddress: string | null;
  buildingName: string | null;
  sigungu: string;
  legalDong: string | null;
  regionCode: string;
  postalCode: string | null;
  lat: number;
  lng: number;
}

export const MOCK_ADDRESSES: MockAddress[] = [
  // --- 서구 (기획서 1-1: 피해 최다 자치구) ---
  {
    roadAddress: "대전광역시 서구 둔산로 100",
    jibunAddress: "대전광역시 서구 둔산동 100",
    buildingName: "(가상) 둔산리버뷰",
    sigungu: "대전광역시 서구",
    legalDong: "둔산동",
    regionCode: "30170",
    postalCode: "35229",
    lat: 36.3504,
    lng: 127.3845,
  },
  {
    roadAddress: "대전광역시 서구 둔산로 220",
    jibunAddress: "대전광역시 서구 둔산동 220",
    buildingName: "(가상) 둔산스카이",
    sigungu: "대전광역시 서구",
    legalDong: "둔산동",
    regionCode: "30170",
    postalCode: "35233",
    lat: 36.3547,
    lng: 127.3798,
  },
  {
    roadAddress: "대전광역시 서구 계룡로 314",
    jibunAddress: "대전광역시 서구 탄방동 314",
    buildingName: "(가상) 탄방원룸텔",
    sigungu: "대전광역시 서구",
    legalDong: "탄방동",
    regionCode: "30170",
    postalCode: "35240",
    lat: 36.3462,
    lng: 127.3921,
  },
  {
    roadAddress: "대전광역시 서구 갈마로 55",
    jibunAddress: "대전광역시 서구 갈마동 55",
    buildingName: "(가상) 갈마하우스",
    sigungu: "대전광역시 서구",
    legalDong: "갈마동",
    regionCode: "30170",
    postalCode: "35262",
    lat: 36.3413,
    lng: 127.3684,
  },

  // --- 유성구 (기획서 1-1: 피해 2위 자치구, 대학가) ---
  {
    roadAddress: "대전광역시 유성구 대학로 99",
    jibunAddress: "대전광역시 유성구 궁동 99",
    buildingName: "(가상) 궁동스튜디오",
    sigungu: "대전광역시 유성구",
    legalDong: "궁동",
    regionCode: "30200",
    postalCode: "34134",
    lat: 36.362,
    lng: 127.356,
  },
  {
    roadAddress: "대전광역시 유성구 온천북로 33",
    jibunAddress: "대전광역시 유성구 봉명동 33",
    buildingName: "(가상) 봉명다가구",
    sigungu: "대전광역시 유성구",
    legalDong: "봉명동",
    regionCode: "30200",
    postalCode: "34125",
    lat: 36.3548,
    lng: 127.3402,
  },
  {
    roadAddress: "대전광역시 유성구 가정로 218",
    jibunAddress: "대전광역시 유성구 어은동 218",
    buildingName: "(가상) 어은빌라",
    sigungu: "대전광역시 유성구",
    legalDong: "어은동",
    regionCode: "30200",
    postalCode: "34141",
    lat: 36.3651,
    lng: 127.3577,
  },
  {
    roadAddress: "대전광역시 유성구 노은동로 12",
    jibunAddress: "대전광역시 유성구 지족동 12",
    buildingName: "(가상) 노은스테이",
    sigungu: "대전광역시 유성구",
    legalDong: "지족동",
    regionCode: "30200",
    postalCode: "34059",
    lat: 36.3897,
    lng: 127.3213,
  },

  // --- 중구 ---
  {
    roadAddress: "대전광역시 중구 대흥로 121",
    jibunAddress: "대전광역시 중구 대흥동 121",
    buildingName: "(가상) 대흥원룸",
    sigungu: "대전광역시 중구",
    legalDong: "대흥동",
    regionCode: "30140",
    postalCode: "34940",
    lat: 36.3268,
    lng: 127.4229,
  },
  {
    roadAddress: "대전광역시 중구 중앙로 76",
    jibunAddress: "대전광역시 중구 은행동 76",
    buildingName: "(가상) 은행동리빙",
    sigungu: "대전광역시 중구",
    legalDong: "은행동",
    regionCode: "30140",
    postalCode: "34918",
    lat: 36.3288,
    lng: 127.4135,
  },

  // --- 동구 ---
  {
    roadAddress: "대전광역시 동구 중앙로 215",
    jibunAddress: "대전광역시 동구 정동 215",
    buildingName: "(가상) 역전하우스",
    sigungu: "대전광역시 동구",
    legalDong: "정동",
    regionCode: "30110",
    postalCode: "34618",
    lat: 36.3324,
    lng: 127.4344,
  },
  {
    roadAddress: "대전광역시 동구 판암로 45",
    jibunAddress: "대전광역시 동구 판암동 45",
    buildingName: "(가상) 판암빌",
    sigungu: "대전광역시 동구",
    legalDong: "판암동",
    regionCode: "30110",
    postalCode: "34647",
    lat: 36.3125,
    lng: 127.4551,
  },

  // --- 대덕구 ---
  {
    roadAddress: "대전광역시 대덕구 한밭대로 1000",
    jibunAddress: "대전광역시 대덕구 오정동 1000",
    buildingName: "(가상) 오정스테이",
    sigungu: "대전광역시 대덕구",
    legalDong: "오정동",
    regionCode: "30230",
    postalCode: "34324",
    lat: 36.3573,
    lng: 127.4172,
  },
  {
    roadAddress: "대전광역시 대덕구 계족로 677",
    jibunAddress: "대전광역시 대덕구 법동 677",
    buildingName: "(가상) 법동원룸",
    sigungu: "대전광역시 대덕구",
    legalDong: "법동",
    regionCode: "30230",
    postalCode: "34405",
    lat: 36.3661,
    lng: 127.4269,
  },

  // --- 지역 분류 검증용: 대전 외 지역 ---
  {
    roadAddress: "서울특별시 관악구 관악로 1",
    jibunAddress: "서울특별시 관악구 신림동 1",
    buildingName: "(가상) 신림리빙",
    sigungu: "서울특별시 관악구",
    legalDong: "신림동",
    regionCode: "11620",
    postalCode: "08826",
    lat: 37.4692,
    lng: 126.9526,
  },
  {
    roadAddress: "세종특별자치시 한누리대로 2130",
    jibunAddress: "세종특별자치시 보람동 2130",
    buildingName: "(가상) 보람하우스",
    sigungu: "세종특별자치시",
    legalDong: "보람동",
    regionCode: "36110",
    postalCode: "30151",
    lat: 36.4801,
    lng: 127.2889,
  },
];
