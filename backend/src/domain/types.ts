import type { DateOnly } from "../lib/date.js";

export type RiskLevel = "safe" | "caution" | "danger" | "critical";

export const RISK_ORDER: Record<RiskLevel, number> = {
  safe: 0,
  caution: 1,
  danger: 2,
  critical: 3,
};

export function maxRisk(...levels: RiskLevel[]): RiskLevel {
  return levels.reduce<RiskLevel>(
    (acc, cur) => (RISK_ORDER[cur] > RISK_ORDER[acc] ? cur : acc),
    "safe",
  );
}

export const RISK_LABEL_KO: Record<RiskLevel, string> = {
  safe: "안전",
  caution: "주의",
  danger: "위험",
  critical: "매우 위험",
};

export type FindingCategory =
  | "rights"
  | "valuation"
  | "schedule"
  | "document"
  | "region"
  | "contract";

/**
 * 규칙 엔진이 내놓는 단위 결과.
 * 기획서 2 ①의 3가지 질문("계약해도 되나 / 서류에 문제없나 / 무엇을 요구할까")에
 * 대응하도록 severity(위험도) · description(왜) · action(무엇을 요구) 을 항상 함께 담는다.
 */
export interface Finding {
  /** 안정적인 기계 판독용 코드. 프론트엔드가 아이콘/링크를 매핑할 때 쓴다. */
  code: string;
  category: FindingCategory;
  /**
   * 이 항목이 "위험"인지 "확인 못 함"인지.
   *
   *   risk     — 이 집/계약에 실제로 존재하는 위험 (기본값)
   *   info_gap — 서류가 없거나 판독이 안 돼서 **확인하지 못한** 항목
   *
   * 둘을 섞으면 "사진이 흐리다"가 "경매가 진행 중이다"와 같은 무게로 쌓여
   * 판정이 무의미해진다. UI 도 두 축을 나눠 보여줘야 한다.
   */
  kind?: "risk" | "info_gap";
  severity: RiskLevel;
  /** 종합 점수 기여도(0~100). severity와 별개로 룰마다 가중치를 준다. */
  weight: number;
  title: string;
  description: string;
  action?: string;
  evidence?: Record<string, unknown>;
  /** 이 finding이 유발하는 특약 코드 */
  suggestTerms?: string[];
}

export type RightType =
  | "mortgage"
  | "jeonse_right"
  | "lease_registration"
  | "provisional_attachment"
  | "attachment"
  | "provisional_registration"
  | "trust"
  | "auction"
  | "injunction"
  | "superficies"
  | "ownership_transfer"
  | "other";

export const RIGHT_LABEL_KO: Record<RightType, string> = {
  mortgage: "근저당권",
  jeonse_right: "전세권",
  lease_registration: "주택임차권등기",
  provisional_attachment: "가압류",
  attachment: "압류",
  provisional_registration: "가등기",
  trust: "신탁등기",
  auction: "경매개시결정",
  injunction: "처분금지가처분",
  superficies: "지상권",
  ownership_transfer: "소유권이전",
  other: "기타",
};

export interface RegistryRight {
  section: "gap" | "eul";
  rankNo?: string | null;
  type: RightType;
  holder?: string | null;
  /** 근저당권의 채권최고액. 실제 잔존 채무가 아니라 담보 한도이므로 보수적으로 이 값을 쓴다. */
  maxClaimKrw?: number | null;
  registeredOn?: DateOnly | null;
  isCancelled: boolean;
  note?: string | null;
}

/** 등기부등본 AI 추출 결과 */
export interface RegistryExtraction {
  /** 표제부 */
  address?: string | null;
  buildingName?: string | null;
  exclusiveAreaM2?: number | null;
  landAreaM2?: number | null;
  /** 갑구 — 현재 소유자 */
  ownerNames: string[];
  ownershipAcquiredOn?: DateOnly | null;
  /** 등기부 발급/열람 시점. 오래된 등기부는 그 자체가 위험 신호다. */
  issuedOn?: DateOnly | null;
  isTrustProperty: boolean;
  /** 집합건물 여부. false면 다가구(단독) → 선순위 임차보증금 확인 불가 리스크. */
  isSectionedBuilding: boolean;
  rights: RegistryRight[];
  /** AI가 판독하지 못한 부분 */
  unreadableSections: string[];
}

/** 중개대상물 확인·설명서 AI 추출 결과 */
export interface BrokerageStatementExtraction {
  address?: string | null;
  ownerName?: string | null;
  exclusiveAreaM2?: number | null;
  buildingUse?: string | null;
  /** 위반건축물 표기 여부 */
  isIllegalBuilding?: boolean | null;
  /** 권리관계란에 기재된 근저당 등 */
  declaredEncumbrances: string[];
  /** 선순위 확정일자·임차 내역 기재 여부 (다가구에서 특히 중요) */
  priorTenantInfoDisclosed?: boolean | null;
  priorTenantDepositKrw?: number | null;
  /** 개업공인중개사 */
  agentName?: string | null;
  agencyName?: string | null;
  agentRegistrationNo?: string | null;
  /** 공제(보증) 정보 */
  guaranteeInsurer?: string | null;
  guaranteeAmountKrw?: number | null;
  guaranteeExpiresOn?: DateOnly | null;
  issuedOn?: DateOnly | null;
  /** 서명·날인 누락 여부 */
  signedByAgent?: boolean | null;
  signedByLessor?: boolean | null;
  unreadableSections: string[];
}

/** 임대차 계약서 초안 AI 추출 결과 */
export interface LeaseDraftExtraction {
  address?: string | null;
  detailAddress?: string | null;
  exclusiveAreaM2?: number | null;
  lessorName?: string | null;
  lessorAccountHolder?: string | null;
  lesseeName?: string | null;
  agentName?: string | null;
  depositKrw?: number | null;
  downPaymentKrw?: number | null;
  balanceKrw?: number | null;
  monthlyRentKrw?: number | null;
  maintenanceFeeKrw?: number | null;
  contractDate?: DateOnly | null;
  balanceDate?: DateOnly | null;
  termStart?: DateOnly | null;
  termEnd?: DateOnly | null;
  /** 특약사항 조항 원문 */
  specialTerms: string[];
  /** 계약서에 임대인 인감/서명이 있는지 */
  signedByLessor?: boolean | null;
  unreadableSections: string[];
}

export interface MarketPriceEstimate {
  estimatedKrw: number;
  lowKrw?: number | null;
  highKrw?: number | null;
  source: "molit_rtms" | "public_notice_price" | "user_input" | "manual" | "unavailable";
  method: string;
  sampleSize?: number | null;
  confidence: number;
}

export interface LawArticleResult {
  source: "law_go_kr" | "unavailable";
  text: string | null;
  url: string;
}

export interface StandardLeaseFormResult {
  source: "law_go_kr" | "unavailable";
  pdfUrl: string | null;
  fallbackUrl: string;
}
