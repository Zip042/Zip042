import { EOK, formatKrw, safeRatio, toPercent } from "./money.js";
import type { Finding, RiskLevel } from "./types.js";

/**
 * 깡통전세 판정 & 보증금 회수 시뮬레이션.
 *
 * 이 모듈은 "보증금을 돌려받을 수 있는가"라는 단 하나의 질문에 답한다.
 * 판단 근거를 전부 evidence로 내보내기 때문에, 프론트엔드는 숫자를 다시 계산하지 않는다.
 */

export type BuildingKind =
  | "apartment"
  | "officetel"
  | "multi_family"
  | "multi_household"
  | "row_house"
  | "detached"
  | "studio"
  | "other";

/**
 * 경매 낙찰가율 — 경매로 넘어갔을 때 감정가(≒시세) 대비 실제 낙찰 금액 비율.
 *
 * ⚠️ 아래 값은 "아파트가 비교적 잘 팔리고, 다가구·단독이 가장 안 팔린다"는 시장 통념을 반영한
 *    보수적 기본값이다. 운영 전에 법원경매정보 · 지지옥션 등의 **대전 지역 최근 12개월 낙찰가율**로
 *    교체할 것. 이 값이 회수 시뮬레이션 결과를 그대로 좌우한다.
 */
export const AUCTION_RECOVERY_RATE: Record<BuildingKind, number> = {
  apartment: 0.82,
  officetel: 0.7,
  multi_family: 0.72,
  row_house: 0.72,
  studio: 0.7,
  multi_household: 0.65,
  detached: 0.68,
  other: 0.7,
};

/** 경매 진행 비용(감정·집행·매각 수수료 등)의 시세 대비 근사치. */
export const AUCTION_COST_RATE = 0.03;

/** 부담률 구간. 정부·보증기관이 통용하는 80% 룰을 기준으로 삼는다. */
export const BURDEN_THRESHOLDS = {
  safe: 0.6,
  caution: 0.8,
  danger: 1.0,
} as const;

/** 주택임대차보호법 시행령상 소액임차인 최우선변제 기준 (지역 구분 1건) */
export interface SmallLesseeThreshold {
  regionClass: string;
  regionLabel: string;
  maxDepositKrw: number;
  priorityKrw: number;
}

export interface ValuationInput {
  /** 산정된 시세(원). 없으면 판정 불가 */
  marketPriceKrw: number | null;
  /** 나보다 앞선 근저당권 채권최고액 합계 */
  seniorMortgageKrw: number;
  /** 나보다 앞선 임차보증금 합계 (다가구에서 특히 중요, 확인 불가면 null) */
  seniorDepositKrw: number | null;
  /** 앞선 전세권 · 가압류 등 기타 담보 · 청구 금액 합계 */
  otherSeniorClaimsKrw: number;
  /** 내 보증금 */
  myDepositKrw: number;
  /** 월세를 자본화해 합산한 값 (비교 지표용) */
  convertedDepositKrw: number;
  buildingKind: BuildingKind;
  smallLesseeThreshold: SmallLesseeThreshold | null;
}

export interface RecoverySimulation {
  auctionRecoveryRate: number;
  /** 예상 낙찰가 */
  expectedAuctionProceedsKrw: number;
  auctionCostKrw: number;
  /** 소액임차인 최우선변제로 먼저 받는 금액 */
  smallLesseePriorityKrw: number;
  smallLesseeEligible: boolean;
  /** 선순위 권리자가 가져가는 금액 */
  seniorPayoutKrw: number;
  /** 내가 회수할 것으로 예상되는 총액 */
  expectedRecoveryKrw: number;
  /** 못 받을 것으로 예상되는 금액 */
  expectedShortfallKrw: number;
  recoveryRatio: number;
}

export interface ValuationResult {
  evaluable: boolean;
  marketPriceKrw: number | null;
  seniorClaimsKrw: number;
  /** 선순위 부채 / 시세 — 내 보증금을 넣기 전에 이미 얼마나 잡혀 있는가 */
  debtRatio: number | null;
  debtRatioPercent: number | null;
  /** (선순위 부채 + 내 보증금) / 시세 — 깡통전세 지표 */
  burdenRatio: number | null;
  burdenRatioPercent: number | null;
  /** 환산보증금 기준 부담률 (월세 매물 비교용) */
  convertedBurdenRatio: number | null;
  level: RiskLevel;
  simulation: RecoverySimulation | null;
  /** 선순위 임차보증금을 확인할 수 없는 상태인지 (다가구 등) */
  seniorDepositUnknown: boolean;
  findings: Finding[];
}

function levelFromBurden(ratio: number): RiskLevel {
  if (ratio < BURDEN_THRESHOLDS.safe) return "safe";
  if (ratio < BURDEN_THRESHOLDS.caution) return "caution";
  if (ratio < BURDEN_THRESHOLDS.danger) return "danger";
  return "critical";
}

function simulate(input: ValuationInput, marketPriceKrw: number, seniorClaimsKrw: number): RecoverySimulation {
  const rate = AUCTION_RECOVERY_RATE[input.buildingKind];
  const proceeds = Math.round(marketPriceKrw * rate);
  const cost = Math.round(marketPriceKrw * AUCTION_COST_RATE);

  // 1순위: 경매비용
  let pool = Math.max(0, proceeds - cost);

  // 2순위: 소액임차인 최우선변제 (선순위 근저당보다 앞선다)
  const threshold = input.smallLesseeThreshold;
  const smallLesseeEligible =
    threshold !== null && input.myDepositKrw > 0 && input.myDepositKrw <= threshold.maxDepositKrw;
  const priorityKrw = smallLesseeEligible
    ? Math.min(threshold!.priorityKrw, input.myDepositKrw, pool)
    : 0;
  pool -= priorityKrw;

  // 3순위: 선순위 권리자 (확정일자보다 앞선 근저당 · 전세권 등)
  const seniorPayout = Math.min(seniorClaimsKrw, pool);
  pool -= seniorPayout;

  // 4순위: 내 보증금 잔액
  const remainingMyDeposit = Math.max(0, input.myDepositKrw - priorityKrw);
  const recoveredRest = Math.min(remainingMyDeposit, pool);

  const expectedRecovery = priorityKrw + recoveredRest;

  return {
    auctionRecoveryRate: rate,
    expectedAuctionProceedsKrw: proceeds,
    auctionCostKrw: cost,
    smallLesseePriorityKrw: priorityKrw,
    smallLesseeEligible,
    seniorPayoutKrw: seniorPayout,
    expectedRecoveryKrw: expectedRecovery,
    expectedShortfallKrw: Math.max(0, input.myDepositKrw - expectedRecovery),
    recoveryRatio: input.myDepositKrw > 0 ? expectedRecovery / input.myDepositKrw : 1,
  };
}

export function evaluateValuation(input: ValuationInput): ValuationResult {
  const seniorDepositUnknown = input.seniorDepositKrw === null;
  const seniorClaimsKrw =
    input.seniorMortgageKrw + (input.seniorDepositKrw ?? 0) + input.otherSeniorClaimsKrw;

  const findings: Finding[] = [];

  if (input.marketPriceKrw === null || input.marketPriceKrw <= 0) {
    findings.push({
      code: "VAL_MARKET_PRICE_UNKNOWN",
      category: "valuation",
      kind: "info_gap",
      // 시세를 모르면 이 서비스의 핵심 질문("보증금을 돌려받을 수 있나")에 답할 수 없다 → 판정 차단.
      severity: "danger",
      weight: 10,
      title: "시세를 확인하지 못했어요",
      description:
        "실거래가 데이터가 없어 이 집의 값을 계산할 수 없었어요. 값을 모르면 보증금이 집값보다 큰 '깡통전세'인지 판단할 수 없습니다.",
      action:
        "네이버부동산·KB시세로 같은 건물 같은 면적의 최근 거래가를 직접 확인해 입력하거나, 중개사에게 최근 실거래 사례를 요청하세요.",
      evidence: { seniorClaimsKrw },
      suggestTerms: ["TERM_PRICE_DISCLOSURE"],
    });
    return {
      evaluable: false,
      marketPriceKrw: null,
      seniorClaimsKrw,
      debtRatio: null,
      debtRatioPercent: null,
      burdenRatio: null,
      burdenRatioPercent: null,
      convertedBurdenRatio: null,
      level: "danger",
      simulation: null,
      seniorDepositUnknown,
      findings,
    };
  }

  const marketPriceKrw = input.marketPriceKrw;
  const debtRatio = safeRatio(seniorClaimsKrw, marketPriceKrw);
  const burdenRatio = safeRatio(seniorClaimsKrw + input.myDepositKrw, marketPriceKrw)!;
  const convertedBurdenRatio = safeRatio(
    seniorClaimsKrw + input.convertedDepositKrw,
    marketPriceKrw,
  );
  const level = levelFromBurden(burdenRatio);
  const simulation = simulate(input, marketPriceKrw, seniorClaimsKrw);

  const evidence = {
    marketPriceKrw,
    marketPriceLabel: formatKrw(marketPriceKrw),
    seniorClaimsKrw,
    seniorClaimsLabel: formatKrw(seniorClaimsKrw),
    myDepositKrw: input.myDepositKrw,
    burdenRatioPercent: toPercent(burdenRatio),
    debtRatioPercent: toPercent(debtRatio),
    expectedShortfallKrw: simulation.expectedShortfallKrw,
  };

  if (burdenRatio >= BURDEN_THRESHOLDS.danger) {
    findings.push({
      code: "VAL_UNDERWATER",
      category: "valuation",
      severity: "critical",
      weight: 40,
      title: "집값보다 빚과 보증금이 더 많아요 (깡통전세)",
      description:
        `이 집의 값은 약 ${formatKrw(marketPriceKrw)}인데, 먼저 잡혀 있는 빚 ${formatKrw(seniorClaimsKrw)}과 ` +
        `내 보증금 ${formatKrw(input.myDepositKrw)}을 합치면 집값의 ${toPercent(burdenRatio)}%예요. ` +
        `집이 경매로 넘어가면 ${formatKrw(simulation.expectedShortfallKrw)}을 돌려받지 못할 것으로 보입니다.`,
      action:
        "이 조건으로는 계약을 권하지 않습니다. 계약하려면 임대인이 잔금일 전에 근저당을 말소(빚을 상환)하는 것을 조건으로 하고, 말소 확인 후 잔금을 지급하세요.",
      evidence,
      suggestTerms: ["TERM_MORTGAGE_RELEASE_BEFORE_BALANCE", "TERM_CONTRACT_VOID_ON_RIGHTS_CHANGE"],
    });
  } else if (burdenRatio >= BURDEN_THRESHOLDS.caution) {
    findings.push({
      code: "VAL_HIGH_BURDEN",
      category: "valuation",
      severity: "danger",
      weight: 25,
      title: "빚 + 보증금이 집값의 80%를 넘어요",
      description:
        `빚과 보증금 합계가 집값의 ${toPercent(burdenRatio)}%입니다. 집값이 조금만 떨어지거나 경매로 ` +
        `싸게 낙찰되면 보증금 일부를 못 받을 수 있어요. (경매 시 예상 미회수액 ${formatKrw(simulation.expectedShortfallKrw)})`,
      action:
        "전세보증금 반환보증(HUG·HF·SGI) 가입이 가능한지 먼저 확인하고, 가입 불가라면 다른 집을 보는 편이 안전합니다.",
      evidence,
      suggestTerms: ["TERM_GUARANTEE_COOPERATION", "TERM_NO_NEW_ENCUMBRANCE"],
    });
  } else if (burdenRatio >= BURDEN_THRESHOLDS.safe) {
    findings.push({
      code: "VAL_MODERATE_BURDEN",
      category: "valuation",
      severity: "caution",
      weight: 10,
      title: "빚 + 보증금이 집값의 60%를 넘어요",
      description:
        `빚과 보증금 합계가 집값의 ${toPercent(burdenRatio)}%입니다. 아주 위험한 수준은 아니지만, ` +
        "계약 기간 중에 임대인이 빚을 더 늘리면 순식간에 위험해질 수 있어요.",
      action: "계약 기간 중 새로운 담보 설정을 금지하는 특약을 반드시 넣으세요.",
      evidence,
      suggestTerms: ["TERM_NO_NEW_ENCUMBRANCE"],
    });
  }

  if (seniorDepositUnknown && input.buildingKind === "multi_household") {
    findings.push({
      code: "VAL_SENIOR_DEPOSIT_UNKNOWN",
      category: "valuation",
      kind: "info_gap",
      severity: "danger",
      weight: 22,
      title: "다가구주택인데 앞선 세입자들의 보증금을 모릅니다",
      description:
        "다가구주택은 호수별로 등기가 나뉘어 있지 않아, 등기부만으로는 나보다 먼저 들어온 세입자들의 " +
        "보증금 총액을 알 수 없습니다. 그 금액이 내 순위보다 앞서므로, 사실상 회수 가능 금액을 계산할 수 없는 상태예요.",
      action:
        "임대인에게 '확정일자 부여현황'(등기소 발급)과 '전입세대확인서'를 요구해 앞선 보증금 총액을 확인하세요. 임대인 동의가 없으면 발급이 어려우니, 계약 전 제출을 조건으로 거세요.",
      evidence: { buildingKind: input.buildingKind },
      suggestTerms: ["TERM_PRIOR_TENANT_DISCLOSURE", "TERM_CONTRACT_VOID_ON_MISDISCLOSURE"],
    });
  }

  if (simulation.smallLesseeEligible && input.smallLesseeThreshold) {
    findings.push({
      code: "VAL_SMALL_LESSEE_PROTECTED",
      category: "valuation",
      severity: "safe",
      weight: 0,
      title: `소액임차인 최우선변제 대상이에요 (최대 ${formatKrw(input.smallLesseeThreshold.priorityKrw)})`,
      description:
        `보증금이 ${input.smallLesseeThreshold.regionLabel} 기준 ` +
        `${formatKrw(input.smallLesseeThreshold.maxDepositKrw)} 이하이므로, 집이 경매로 넘어가도 ` +
        `${formatKrw(simulation.smallLesseePriorityKrw)}은 은행보다 먼저 받을 수 있습니다. ` +
        "단, 이 보호를 받으려면 경매 개시 전까지 전입신고와 실제 거주(점유)를 유지해야 해요.",
      action: "잔금일에 바로 전입신고를 하고, 계약 기간 중 주민등록을 다른 곳으로 옮기지 마세요.",
      evidence: {
        regionClass: input.smallLesseeThreshold.regionClass,
        maxDepositKrw: input.smallLesseeThreshold.maxDepositKrw,
        priorityKrw: simulation.smallLesseePriorityKrw,
      },
    });
  }

  if (simulation.expectedShortfallKrw > 0 && burdenRatio < BURDEN_THRESHOLDS.caution) {
    // 부담률은 낮지만 낙찰가율 때문에 손실이 나는 경우 — 사용자가 놓치기 쉬운 구간이다.
    findings.push({
      code: "VAL_AUCTION_GAP",
      category: "valuation",
      severity: "caution",
      weight: 8,
      title: "경매로 넘어가면 일부는 못 받을 수 있어요",
      description:
        `빚 비율 자체는 높지 않지만, 경매에서는 보통 시세의 ${Math.round(simulation.auctionRecoveryRate * 100)}% 정도에 ` +
        `낙찰됩니다. 이 기준으로 계산하면 약 ${formatKrw(simulation.expectedShortfallKrw)}이 부족해요.`,
      action: "전세보증금 반환보증에 가입하면 이 위험을 없앨 수 있습니다.",
      evidence,
      suggestTerms: ["TERM_GUARANTEE_COOPERATION"],
    });
  }

  return {
    evaluable: true,
    marketPriceKrw,
    seniorClaimsKrw,
    debtRatio,
    debtRatioPercent: toPercent(debtRatio),
    burdenRatio,
    burdenRatioPercent: toPercent(burdenRatio),
    convertedBurdenRatio,
    level,
    simulation,
    seniorDepositUnknown,
    findings,
  };
}

/**
 * 전세보증금 반환보증 가입 가능성 추정.
 *
 * ⚠️ HUG/HF/SGI의 실제 심사 기준(주택가격 산정 방식, 담보인정비율, 부채비율 한도)은
 *    수시로 바뀌고 기관마다 다르다. 여기서는 "선순위 채권 + 보증금 ≤ 주택가격의 90%"라는
 *    널리 쓰이는 기준 하나만 적용해 **참고용 신호**를 준다. 결과를 확정 정보로 표시하지 말 것.
 */
export const GUARANTEE_LTV_CAP = 0.9;

export function estimateGuaranteeEligibility(
  marketPriceKrw: number | null,
  seniorClaimsKrw: number,
  depositKrw: number,
): { likely: boolean | null; ratio: number | null; capRatio: number } {
  if (!marketPriceKrw || marketPriceKrw <= 0) {
    return { likely: null, ratio: null, capRatio: GUARANTEE_LTV_CAP };
  }
  const ratio = (seniorClaimsKrw + depositKrw) / marketPriceKrw;
  return { likely: ratio <= GUARANTEE_LTV_CAP, ratio, capRatio: GUARANTEE_LTV_CAP };
}

/** 보증금이 억 단위인지 등 UI 표시에 필요한 보조 정보. */
export function depositTier(depositKrw: number): "under_50m" | "under_1eok" | "over_1eok" {
  if (depositKrw < 50_000_000) return "under_50m";
  if (depositKrw < EOK) return "under_1eok";
  return "over_1eok";
}
