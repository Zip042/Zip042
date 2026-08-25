import { addDays, addMonths, type DateOnly } from "../lib/date.js";
import type {
  BrokerageStatementExtraction,
  LeaseDraftExtraction,
  RegistryExtraction,
  RegistryRight,
} from "../domain/types.js";

/**
 * 문서 판독 픅스처 (목 모드 전용).
 *
 * 프론트엔드가 **모든 위험 등급의 화면을 다 그려볼 수 있어야** 하므로,
 * 안전부터 매우 위험까지 대표 시나리오를 갖춰 둔다.
 *
 * 날짜는 `today` 기준 상대값으로 만든다 — 픅스처가 시간이 지나면서
 * "등기부가 2년 전 것"이 되어 엉뚱한 경고가 붙는 일을 막기 위해서다.
 *
 * ⚠️ 여기 적힌 이름 · 주소 · 금액은 모두 **가상**이다. 실제 인물·물건과 무관하다.
 */

export type ScenarioKey =
  | "clean"
  | "mortgage_moderate"
  | "underwater"
  | "trust"
  | "auction"
  | "multi_household"
  | "owner_mismatch"
  | "recent_owner_gap"
  | "document_mismatch"
  | "unreadable";

export interface ScenarioBundle {
  key: ScenarioKey;
  label: string;
  /** 이 시나리오가 무엇을 보여주려는 것인지 */
  description: string;
  /** 대략 어떤 판정이 나오는지 (문서화·프론트엔드 확인용. 실제 값은 규칙 엔진이 결정한다.) */
  expectedVerdict: "safe" | "caution" | "danger" | "critical";
  marketPriceKrw: number;
  depositKrw: number;
  monthlyRentKrw: number;
  buildingType: string;
  exclusiveAreaM2: number;
  registry: RegistryExtraction;
  brokerage: BrokerageStatementExtraction;
  lease: LeaseDraftExtraction;
}

const ADDRESS = "대전광역시 서구 둔산로 100";
const DETAIL = "301호";
const OWNER = "김소유";
const AREA = 29.75;

function right(overrides: Partial<RegistryRight> = {}): RegistryRight {
  return {
    section: "eul",
    rankNo: "1",
    type: "mortgage",
    holder: "가상은행 대전지점",
    maxClaimKrw: 60_000_000,
    registeredOn: null,
    isCancelled: false,
    note: "근저당권설정",
    ...overrides,
  };
}

function baseRegistry(today: DateOnly, overrides: Partial<RegistryExtraction> = {}): RegistryExtraction {
  return {
    address: `${ADDRESS} ${DETAIL}`,
    buildingName: "가상빌라",
    exclusiveAreaM2: AREA,
    landAreaM2: 18.2,
    ownerNames: [OWNER],
    // 3년 전 취득 → '최근 취득' 경고가 붙지 않는 정상 상태
    ownershipAcquiredOn: addMonths(today, -36),
    issuedOn: today,
    isTrustProperty: false,
    isSectionedBuilding: true,
    rights: [],
    unreadableSections: [],
    ...overrides,
  };
}

function baseBrokerage(
  today: DateOnly,
  overrides: Partial<BrokerageStatementExtraction> = {},
): BrokerageStatementExtraction {
  return {
    address: `${ADDRESS} ${DETAIL}`,
    ownerName: OWNER,
    exclusiveAreaM2: AREA,
    buildingUse: "다세대주택",
    isIllegalBuilding: false,
    declaredEncumbrances: [],
    priorTenantInfoDisclosed: null,
    priorTenantDepositKrw: null,
    agentName: "박중개",
    agencyName: "가상부동산중개",
    agentRegistrationNo: "30170-2026-00123",
    guaranteeInsurer: "한국공인중개사협회 공제",
    guaranteeAmountKrw: 200_000_000,
    guaranteeExpiresOn: addMonths(today, 9),
    issuedOn: addDays(today, -1),
    signedByAgent: true,
    signedByLessor: true,
    unreadableSections: [],
    ...overrides,
  };
}

function baseLease(
  today: DateOnly,
  depositKrw: number,
  monthlyRentKrw: number,
  overrides: Partial<LeaseDraftExtraction> = {},
): LeaseDraftExtraction {
  const contractDate = addDays(today, 14);
  const balanceDate = addDays(today, 42);
  const down = Math.round(depositKrw * 0.1);
  return {
    address: ADDRESS,
    detailAddress: DETAIL,
    exclusiveAreaM2: AREA,
    lessorName: OWNER,
    lessorAccountHolder: OWNER,
    lesseeName: "이임차",
    agentName: "박중개",
    depositKrw,
    downPaymentKrw: down,
    balanceKrw: depositKrw - down,
    monthlyRentKrw,
    maintenanceFeeKrw: 70_000,
    contractDate,
    balanceDate,
    termStart: balanceDate,
    termEnd: addDays(addMonths(balanceDate, 24), -1),
    specialTerms: ["임대인은 잔금 지급일 다음 날까지 근저당권을 설정하지 아니한다."],
    signedByLessor: false,
    unreadableSections: [],
    ...overrides,
  };
}

/** 시나리오 정의. `today` 를 받아 날짜를 상대값으로 만든다. */
export function buildScenario(key: ScenarioKey, today: DateOnly): ScenarioBundle {
  const common = {
    buildingType: "multi_family",
    exclusiveAreaM2: AREA,
    monthlyRentKrw: 0,
  };

  switch (key) {
    case "clean":
      return {
        key,
        label: "깨끗한 등기부",
        description: "선순위 권리가 없고 서류가 모두 일치하는 정상 매물. 기본 특약만 안내된다.",
        expectedVerdict: "caution",
        marketPriceKrw: 220_000_000,
        depositKrw: 90_000_000,
        ...common,
        registry: baseRegistry(today),
        brokerage: baseBrokerage(today),
        lease: baseLease(today, 90_000_000, 0),
      };

    case "mortgage_moderate":
      return {
        key,
        label: "근저당 있음 (부담률 68%)",
        description: "근저당 6천만원 + 보증금 9천만원 = 시세의 68%. 주의 등급과 담보 관련 특약이 붙는다.",
        expectedVerdict: "caution",
        marketPriceKrw: 220_000_000,
        depositKrw: 90_000_000,
        ...common,
        registry: baseRegistry(today, {
          rights: [right({ registeredOn: addMonths(today, -20) })],
        }),
        brokerage: baseBrokerage(today, {
          declaredEncumbrances: ["근저당권 채권최고액 60,000,000원 (가상은행)"],
        }),
        lease: baseLease(today, 90_000_000, 0),
      };

    case "underwater":
      return {
        key,
        label: "깡통전세 (부담률 109%)",
        description:
          "근저당 1억8천 + 보증금 6천 = 시세의 109%. 경매 시 미회수액이 발생하고 계약 불가 판정이 난다.",
        expectedVerdict: "critical",
        marketPriceKrw: 220_000_000,
        depositKrw: 60_000_000,
        ...common,
        registry: baseRegistry(today, {
          rights: [
            right({ maxClaimKrw: 120_000_000, registeredOn: addMonths(today, -30) }),
            right({
              rankNo: "2",
              maxClaimKrw: 60_000_000,
              holder: "가상캐피탈",
              registeredOn: addMonths(today, -8),
            }),
          ],
        }),
        brokerage: baseBrokerage(today, {
          declaredEncumbrances: [
            "근저당권 채권최고액 120,000,000원 (가상은행)",
            "근저당권 채권최고액 60,000,000원 (가상캐피탈)",
          ],
        }),
        lease: baseLease(today, 60_000_000, 0),
      };

    case "trust":
      return {
        key,
        label: "신탁등기",
        description:
          "신탁회사가 실제 소유자인 물건. 동의서 없이는 계약이 무효가 될 수 있어 최고 위험으로 판정된다.",
        expectedVerdict: "critical",
        marketPriceKrw: 220_000_000,
        depositKrw: 80_000_000,
        ...common,
        registry: baseRegistry(today, {
          isTrustProperty: true,
          rights: [
            right({
              section: "gap",
              rankNo: "4",
              type: "trust",
              holder: "가상부동산신탁",
              maxClaimKrw: null,
              registeredOn: addMonths(today, -14),
              note: "신탁",
            }),
          ],
        }),
        brokerage: baseBrokerage(today, { declaredEncumbrances: ["신탁 (가상부동산신탁)"] }),
        lease: baseLease(today, 80_000_000, 0),
      };

    case "auction":
      return {
        key,
        label: "경매개시결정",
        description: "이미 경매가 진행 중인 물건. 계약하면 보증금을 잃고 퇴거해야 한다.",
        expectedVerdict: "critical",
        marketPriceKrw: 220_000_000,
        depositKrw: 80_000_000,
        ...common,
        registry: baseRegistry(today, {
          rights: [
            right({ maxClaimKrw: 150_000_000, registeredOn: addMonths(today, -40) }),
            right({
              section: "gap",
              rankNo: "6",
              type: "auction",
              holder: "대전지방법원",
              maxClaimKrw: null,
              registeredOn: addDays(today, -35),
              note: "임의경매개시결정",
            }),
          ],
        }),
        brokerage: baseBrokerage(today, {
          declaredEncumbrances: ["근저당권 채권최고액 150,000,000원 (가상은행)"],
        }),
        lease: baseLease(today, 80_000_000, 0),
      };

    case "multi_household":
      return {
        key,
        label: "다가구 · 선순위 보증금 미상",
        description:
          "호수별 구분등기가 없어 앞선 세입자들의 보증금을 알 수 없다. 확정일자 부여현황 요구 특약이 붙는다.",
        expectedVerdict: "danger",
        marketPriceKrw: 650_000_000,
        depositKrw: 50_000_000,
        buildingType: "multi_household",
        exclusiveAreaM2: 23.1,
        monthlyRentKrw: 300_000,
        registry: baseRegistry(today, {
          address: "대전광역시 유성구 가상대로 55",
          buildingName: "가상하우스",
          isSectionedBuilding: false,
          exclusiveAreaM2: 23.1,
          rights: [right({ maxClaimKrw: 200_000_000, registeredOn: addMonths(today, -26) })],
        }),
        brokerage: baseBrokerage(today, {
          address: "대전광역시 유성구 가상대로 55 201호",
          exclusiveAreaM2: 23.1,
          buildingUse: "단독주택(다가구)",
          declaredEncumbrances: ["근저당권 채권최고액 200,000,000원 (가상은행)"],
          priorTenantInfoDisclosed: false,
        }),
        lease: baseLease(today, 50_000_000, 300_000, {
          address: "대전광역시 유성구 가상대로 55",
          detailAddress: "201호",
          exclusiveAreaM2: 23.1,
        }),
      };

    case "owner_mismatch":
      return {
        key,
        label: "임대인 ≠ 등기부 소유자",
        description:
          "계약서 임대인이 등기부 소유자와 다르고 입금 계좌 명의도 제3자다. 전세사기의 대표적 형태.",
        expectedVerdict: "critical",
        marketPriceKrw: 220_000_000,
        depositKrw: 85_000_000,
        ...common,
        registry: baseRegistry(today),
        brokerage: baseBrokerage(today, { ownerName: "김소유" }),
        lease: baseLease(today, 85_000_000, 0, {
          lessorName: "박대리",
          lessorAccountHolder: "최타인",
          signedByLessor: false,
        }),
      };

    case "recent_owner_gap":
      return {
        key,
        label: "최근 소유권 취득 (갭투자 의심)",
        description: "45일 전에 집을 산 임대인 + 높은 부담률. 보증금으로 집값을 치르는 구조일 수 있다.",
        expectedVerdict: "danger",
        marketPriceKrw: 220_000_000,
        depositKrw: 100_000_000,
        ...common,
        registry: baseRegistry(today, {
          ownershipAcquiredOn: addDays(today, -45),
          rights: [
            right({ maxClaimKrw: 80_000_000, registeredOn: addDays(today, -45) }),
          ],
        }),
        brokerage: baseBrokerage(today, {
          declaredEncumbrances: ["근저당권 채권최고액 80,000,000원 (가상은행)"],
        }),
        lease: baseLease(today, 100_000_000, 0),
      };

    case "document_mismatch":
      return {
        key,
        label: "서류 간 불일치",
        description:
          "주소 · 면적 · 보증금이 서류마다 다르고, 등기부의 근저당이 확인·설명서에 빠져 있다. 교차검증 화면 확인용.",
        expectedVerdict: "critical",
        marketPriceKrw: 220_000_000,
        depositKrw: 90_000_000,
        ...common,
        registry: baseRegistry(today, {
          rights: [right({ maxClaimKrw: 70_000_000, registeredOn: addMonths(today, -12) })],
        }),
        brokerage: baseBrokerage(today, {
          // 건물번호가 다르다 → 주소 불일치 (critical)
          address: "대전광역시 서구 둔산로 200 301호",
          exclusiveAreaM2: 42.1,
          // 등기부에는 근저당이 있는데 여기에는 없다 → 중개사 설명의무 위반 신호
          declaredEncumbrances: [],
          signedByAgent: false,
        }),
        lease: baseLease(today, 95_000_000, 0, {
          // 계약금 + 잔금 ≠ 보증금
          downPaymentKrw: 9_000_000,
          balanceKrw: 80_000_000,
          specialTerms: [],
        }),
      };

    case "unreadable":
    default:
      return {
        key: "unreadable",
        label: "일부 판독 실패",
        description:
          "흐릿한 사진을 올린 상황. 판독 신뢰도가 낮고 금액을 읽지 못한 권리가 있어 '재촬영' 안내가 나온다.",
        expectedVerdict: "danger",
        marketPriceKrw: 220_000_000,
        depositKrw: 90_000_000,
        ...common,
        registry: baseRegistry(today, {
          issuedOn: null,
          rights: [right({ maxClaimKrw: null, registeredOn: null })],
          unreadableSections: ["을구 2페이지", "표제부 전용면적"],
        }),
        brokerage: baseBrokerage(today, {
          isIllegalBuilding: null,
          unreadableSections: ["권리관계란"],
        }),
        lease: baseLease(today, 90_000_000, 0, {
          depositKrw: null,
          downPaymentKrw: null,
          balanceKrw: null,
          unreadableSections: ["보증금 금액란"],
        }),
      };
  }
}

export const SCENARIO_KEYS: ScenarioKey[] = [
  "clean",
  "mortgage_moderate",
  "underwater",
  "trust",
  "auction",
  "multi_household",
  "owner_mismatch",
  "recent_owner_gap",
  "document_mismatch",
  "unreadable",
];

/** 판독 신뢰도. `unreadable` 만 낮게 준다. */
export function scenarioConfidence(key: ScenarioKey): number {
  return key === "unreadable" ? 0.42 : 0.93;
}

/**
 * 파일명에서 시나리오를 추측한다.
 *
 * 프론트엔드가 `mockScenario` 를 명시하지 않아도, `등기부_trust.pdf` 처럼 올리면
 * 해당 시나리오가 적용되어 개발이 편해진다.
 */
export function guessScenarioFromFileName(fileName: string | null | undefined): ScenarioKey | null {
  if (!fileName) return null;
  const lower = fileName.toLowerCase();
  return SCENARIO_KEYS.find((key) => lower.includes(key)) ?? null;
}

// ---------------------------------------------------------------------------
// 참조 데이터 시드
// ---------------------------------------------------------------------------

/** 양력 고정 공휴일. 마이그레이션의 시드와 동일한 목록. */
const FIXED_SOLAR = ["01-01", "03-01", "05-05", "06-06", "08-15", "10-03", "10-09", "12-25"];

export function holidaySeed(fromYear: number, toYear: number): { holiday_date: string; name: string; is_synced: boolean }[] {
  const names: Record<string, string> = {
    "01-01": "신정",
    "03-01": "삼일절",
    "05-05": "어린이날",
    "06-06": "현충일",
    "08-15": "광복절",
    "10-03": "개천절",
    "10-09": "한글날",
    "12-25": "성탄절",
  };
  const out: { holiday_date: string; name: string; is_synced: boolean }[] = [];
  for (let y = fromYear; y <= toYear; y += 1) {
    for (const md of FIXED_SOLAR) {
      out.push({ holiday_date: `${y}-${md}`, name: names[md] ?? "공휴일", is_synced: false });
    }
  }
  return out;
}

/** 소액임차인 최우선변제 기준. 마이그레이션 시드와 동일. */
export const SMALL_LESSEE_SEED = [
  {
    effective_from: "2023-02-21",
    region_class: "seoul",
    region_label: "서울특별시",
    max_deposit_krw: 165_000_000,
    priority_krw: 55_000_000,
  },
  {
    effective_from: "2023-02-21",
    region_class: "overconcentration",
    region_label: "수도권 과밀억제권역 · 세종 · 용인 · 화성 · 김포",
    max_deposit_krw: 145_000_000,
    priority_krw: 48_000_000,
  },
  {
    effective_from: "2023-02-21",
    region_class: "metropolitan",
    region_label: "광역시(과밀억제권역·군 제외) · 안산 · 광주 · 파주 · 이천 · 평택",
    max_deposit_krw: 85_000_000,
    priority_krw: 28_000_000,
  },
  {
    effective_from: "2023-02-21",
    region_class: "other",
    region_label: "그 외 지역",
    max_deposit_krw: 75_000_000,
    priority_krw: 25_000_000,
  },
];

/**
 * 피해주택 더미 좌표.
 *
 * 전부 **가상 데이터**다. 실제 피해주택 주소는 개인·재산 정보이므로 저장소에 넣지 않는다.
 * 대전 서구 · 유성구 범위에 흩뿌려, 반경 500m 집계와 히트맵이 의미 있게 보이도록 배치한다.
 */
export function victimSeed(count = 120): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (let i = 1; i <= count; i += 1) {
    const isSeogu = i % 2 === 0;
    out.push({
      source: "mock_fixture",
      source_key: `mock-${i}`,
      road_address: `(가상) 대전광역시 ${isSeogu ? "서구" : "유성구"} 가상로 ${i}`,
      building_name: `가상빌라 ${i}`,
      sigungu: `대전광역시 ${isSeogu ? "서구" : "유성구"}`,
      building_key: `MOCKBLDG${i % 20}`,
      owner_key: `MOCKOWNER${i % 8}`,
      lat: (isSeogu ? 36.3504 : 36.362) + (i % 17) * 0.0009,
      lng: (isSeogu ? 127.3845 : 127.356) + (i % 13) * 0.0011,
      reported_on: addDays("2024-01-01", i * 5),
      case_count: 1 + (i % 3),
    });
  }
  return out;
}
