import type { Grade } from "@/components/ui";

/**
 * 화면 확인용 표본 데이터.
 *
 * 모양은 백엔드 `domain/judgment.ts` 의 `JudgmentResult` 를 그대로 따릅니다.
 * 나중에 붙일 때 이 파일을 API 응답으로 바꾸기만 하면 화면은 그대로 돕니다.
 */

export interface Judgment {
  code: string;
  grade: Grade;
  title: string;
  description: string;
  basis: string[];
  sourceQuotes: string[];
  nextAction: string | null;
}

export interface JudgmentResult {
  overallGrade: Grade;
  headline: string;
  summary: string;
  contractable: boolean;
  judgments: Judgment[];
  calculation: {
    seniorClaimsKrw: number;
    depositKrw: number;
    marketPriceKrw: number | null;
    burdenRatio: number | null;
    computable: boolean;
  };
  blockingGaps: string[];
  caveats: string[];
}

export const SAMPLE: JudgmentResult = {
  overallGrade: "WARN",
  headline: "계약 전에 확인할 것이 있습니다",
  summary:
    "등기부에 살아 있는 근저당이 있고, 잔금일과 전입신고일 사이에 대항력이 비는 구간이 있습니다. 두 가지를 특약으로 막을 수 있습니다.",
  contractable: true,
  calculation: {
    seniorClaimsKrw: 240_000_000,
    depositKrw: 150_000_000,
    marketPriceKrw: 520_000_000,
    burdenRatio: 0.75,
    computable: true,
  },
  blockingGaps: [],
  caveats: [
    "채권최고액은 실제 대출 잔액이 아니라 담보 한도입니다. 보통 실제 대출의 110~120%로 잡힙니다.",
    "시세는 국토교통부 실거래가 기준이며, 실제 경매 낙찰가는 이보다 낮을 수 있습니다.",
    "특약 문구는 참고용 예시입니다. 법률 자문이 아닙니다.",
  ],
  judgments: [
    {
      code: "REGISTRY_SENIOR_MORTGAGE",
      grade: "WARN",
      title: "선순위 근저당이 남아 있습니다",
      description:
        "이 집이 경매로 넘어가면 은행이 먼저 2억 4천만원을 가져갑니다. 보증금은 그 다음 순서입니다.",
      basis: ["근저당권설정 (을구 2번, 2022-07-14)", "채권최고액 240,000,000원"],
      sourceQuotes: ["채권최고액 금240,000,000원 채무자 이○○ 근저당권자 ○○저축은행"],
      nextAction: "특약에 '잔금일까지 근저당권 말소' 조건을 넣고, 말소 확인 후 잔금을 치르세요.",
    },
    {
      code: "SCHEDULE_COUNTERFORCE_GAP",
      grade: "WARN",
      title: "잔금일과 전입신고 사이 4일이 비어 있습니다",
      description:
        "대항력은 전입신고 다음 날 0시부터 생깁니다. 그 전에 집주인이 대출을 받으면 보증금이 후순위로 밀립니다.",
      basis: ["잔금일 2026-09-14", "전입신고 예정일 2026-09-18"],
      sourceQuotes: [],
      nextAction: "잔금일 당일에 전입신고와 확정일자를 함께 받으세요.",
    },
    {
      code: "VALUATION_BURDEN_RATIO",
      grade: "OK",
      title: "보증금 회수 여력은 있습니다",
      description:
        "선순위 채권과 보증금을 합쳐도 시세의 75%입니다. 통상 위험선으로 보는 80%보다 낮습니다.",
      basis: ["시세 52,000만원 (실거래가 기준)", "선순위 24,000만원 + 보증금 15,000만원"],
      sourceQuotes: [],
      nextAction: null,
    },
    {
      code: "REGISTRY_TRUST",
      grade: "OK",
      title: "신탁 등기가 없습니다",
      description:
        "신탁된 집은 등기부상 소유자와 실제 처분 권한자가 다릅니다. 이 집은 해당되지 않습니다.",
      basis: ["갑구에 신탁 기재 없음"],
      sourceQuotes: [],
      nextAction: null,
    },
    {
      code: "BUILDING_ILLEGAL",
      grade: "UNKNOWN",
      title: "위반건축물 여부를 확인하지 못했습니다",
      description:
        "건축물대장에서 이 번지를 찾지 못했습니다. 위반건축물이면 보증보험 가입이 거절될 수 있습니다.",
      basis: ["건축물대장 조회 결과 없음"],
      sourceQuotes: [],
      nextAction: "정부24에서 건축물대장을 발급받아 '위반건축물' 표시를 확인하세요.",
    },
  ],
};

export const SPECIAL_TERMS = [
  {
    title: "근저당 말소 조건",
    body: "임대인은 잔금일까지 등기부상 을구 2번 근저당권(채권최고액 240,000,000원)을 말소하며, 말소 확인 전 임차인은 잔금 지급을 거절할 수 있다.",
  },
  {
    title: "권리관계 변동 금지",
    body: "임대인은 계약일부터 임차인의 전입신고 및 확정일자 효력 발생일까지 목적물에 관하여 새로운 담보권을 설정하지 아니한다.",
  },
];

export const CHECKLIST = [
  {
    phase: "계약 전",
    items: [
      { text: "등기부등본을 계약 당일 발급받아 확인했다", hint: "3일 전 것도 늦습니다" },
      { text: "임대인 신분증과 등기부상 소유자가 같은지 확인했다", hint: null },
      { text: "대리인이면 위임장과 인감증명서를 받았다", hint: null },
      { text: "선순위 채권과 보증금 합계가 시세의 80% 아래인지 확인했다", hint: null },
    ],
  },
  {
    phase: "계약 당일",
    items: [
      { text: "특약에 근저당 말소 조건을 넣었다", hint: null },
      { text: "계약금은 등기부상 소유자 명의 계좌로 보냈다", hint: null },
    ],
  },
  {
    phase: "잔금 · 입주",
    items: [
      { text: "잔금 전에 등기부를 다시 떼어 변동이 없는지 확인했다", hint: "가장 많이 놓치는 단계입니다" },
      { text: "잔금일 당일에 전입신고를 했다", hint: null },
      { text: "확정일자를 받았다", hint: null },
      { text: "전세보증금 반환보증에 가입했다", hint: null },
    ],
  },
];

export const GLOSSARY = [
  {
    term: "채권최고액",
    short: "은행이 담보로 잡아둔 한도",
    body: "등기부에 적힌 근저당 금액입니다. 실제 빌린 돈이 아니라 한도라서, 보통 실제 대출의 110~120%로 잡힙니다. Zip042는 안전하게 이 금액을 기준으로 계산합니다.",
  },
  {
    term: "대항력",
    short: "집이 팔려도 계속 살 권리",
    body: "주택을 인도받고 전입신고를 마치면 그 다음 날 0시부터 생깁니다. '다음 날'이라는 점이 중요합니다 — 잔금일과 전입신고일 사이가 비면 그 사이에 권리관계가 바뀔 수 있습니다.",
  },
  {
    term: "확정일자",
    short: "보증금 받을 순서표",
    body: "대항력이 '계속 살 권리'라면, 확정일자는 '돈 받을 순서'입니다. 둘 다 있어야 경매에서 배당을 받을 수 있습니다.",
  },
  {
    term: "신탁등기",
    short: "등기부상 주인과 진짜 주인이 다름",
    body: "소유권이 신탁회사로 넘어간 상태입니다. 등기부의 소유자와 계약하면 무효가 될 수 있어, 반드시 신탁회사의 동의를 받아야 합니다.",
  },
  {
    term: "선순위 보증금",
    short: "나보다 먼저 받아갈 사람들의 돈",
    body: "다가구주택에서 나보다 먼저 들어온 세입자들의 보증금입니다. 등기부에 나오지 않아 임대인에게 직접 확인해야 합니다.",
  },
  {
    term: "깡통전세",
    short: "집을 팔아도 보증금이 안 나오는 상태",
    body: "집값보다 빚과 보증금 합계가 큰 경우입니다. 경매로 넘어가면 보증금 전액을 돌려받지 못합니다.",
  },
];

/**
 * AI 판독 결과 — 백엔드 `RegistryExtraction` 과 같은 모양입니다.
 *
 * 이 화면이 필요한 이유: AI가 채권최고액을 잘못 읽으면 판정 전체가 틀립니다.
 * 특히 **말소된 근저당을 살아 있는 것으로 읽는 것**이 가장 위험한 오독입니다.
 * 그래서 판정을 보여주기 전에 사람이 원본과 대조할 수 있게 합니다.
 */
export interface ExtractedRight {
  section: "gap" | "eul";
  rankNo: string;
  type: "mortgage" | "jeonse_right" | "seizure" | "trust" | "other";
  label: string;
  holder: string | null;
  amountKrw: number | null;
  registeredOn: string | null;
  isCancelled: boolean;
  /** 이 값을 읽어낸 등기부 문장 그대로. 근거를 못 대는 값은 못 믿는 값입니다. */
  sourceQuote: string | null;
}

export interface RegistryExtraction {
  roadAddress: string | null;
  jibunAddress: string | null;
  buildingName: string | null;
  exclusiveAreaM2: number | null;
  ownerNames: string[];
  ownershipAcquiredOn: string | null;
  isTrustProperty: boolean;
  isSectionedBuilding: boolean;
  rights: ExtractedRight[];
  /** 읽지 못한 부분. 비어 있다고 정확하다는 뜻은 아닙니다. */
  unreadableSections: string[];
  /** 판독에 걸린 시간(초)과 모델. 재현성 확인용. */
  meta: { model: string; elapsedSec: number };
}

export const EXTRACTION: RegistryExtraction = {
  roadAddress: "대전광역시 서구 둔산로 89",
  jibunAddress: "대전광역시 서구 둔산동 1294",
  buildingName: "○○아파트 제3층 제302호",
  exclusiveAreaM2: 84.97,
  ownerNames: ["이○○"],
  ownershipAcquiredOn: "2022-07-14",
  isTrustProperty: false,
  isSectionedBuilding: true,
  meta: { model: "claude-sonnet-5", elapsedSec: 31.5 },
  unreadableSections: [],
  rights: [
    {
      section: "gap",
      rankNo: "2",
      type: "other",
      label: "소유권이전",
      holder: "이○○",
      amountKrw: null,
      registeredOn: "2022-07-14",
      isCancelled: false,
      sourceQuote: "2022년7월14일 제45678호 매매 소유자 이○○",
    },
    {
      section: "eul",
      rankNo: "1",
      type: "mortgage",
      label: "근저당권설정",
      holder: "○○은행",
      amountKrw: 360_000_000,
      registeredOn: "2020-03-05",
      isCancelled: true,
      sourceQuote: "채권최고액 금360,000,000원 채무자 김○○ 근저당권자 ○○은행",
    },
    {
      section: "eul",
      rankNo: "2",
      type: "mortgage",
      label: "근저당권설정",
      holder: "○○저축은행",
      amountKrw: 240_000_000,
      registeredOn: "2022-07-14",
      isCancelled: false,
      sourceQuote: "채권최고액 금240,000,000원 채무자 이○○ 근저당권자 ○○저축은행",
    },
    {
      section: "eul",
      rankNo: "4",
      type: "jeonse_right",
      label: "전세권설정",
      holder: "박○○",
      amountKrw: 150_000_000,
      registeredOn: "2023-01-09",
      isCancelled: false,
      sourceQuote: "전세금 금150,000,000원 전세권자 박○○",
    },
  ],
};
