import { describe, expect, it } from "vitest";
import {
  AUCTION_RECOVERY_RATE,
  estimateGuaranteeEligibility,
  evaluateValuation,
  type ValuationInput,
} from "../../src/domain/valuation.js";
import { convertedDeposit, formatKrw, parseKoreanAmount } from "../../src/domain/money.js";

const EOK = 100_000_000;

// 대전광역시 기준 소액임차인 최우선변제
const DAEJEON_THRESHOLD = {
  regionClass: "metropolitan",
  regionLabel: "광역시",
  maxDepositKrw: 85_000_000,
  priorityKrw: 28_000_000,
};

function input(overrides: Partial<ValuationInput> = {}): ValuationInput {
  return {
    marketPriceKrw: 2 * EOK,
    seniorMortgageKrw: 0,
    seniorDepositKrw: 0,
    otherSeniorClaimsKrw: 0,
    myDepositKrw: 100_000_000,
    convertedDepositKrw: 100_000_000,
    buildingKind: "multi_family",
    smallLesseeThreshold: DAEJEON_THRESHOLD,
    ...overrides,
  };
}

describe("부담률 구간", () => {
  it("빚 없고 보증금이 집값의 50%면 안전", () => {
    const r = evaluateValuation(input());
    expect(r.burdenRatioPercent).toBe(50);
    expect(r.level).toBe("safe");
  });

  it("60% 이상이면 주의", () => {
    const r = evaluateValuation(input({ seniorMortgageKrw: 30_000_000 }));
    expect(r.burdenRatioPercent).toBe(65);
    expect(r.level).toBe("caution");
    expect(r.findings.map((f) => f.code)).toContain("VAL_MODERATE_BURDEN");
  });

  it("80% 이상이면 위험", () => {
    const r = evaluateValuation(input({ seniorMortgageKrw: 70_000_000 }));
    expect(r.burdenRatioPercent).toBe(85);
    expect(r.level).toBe("danger");
    expect(r.findings.map((f) => f.code)).toContain("VAL_HIGH_BURDEN");
  });

  it("100% 이상이면 깡통전세 (critical)", () => {
    const r = evaluateValuation(input({ seniorMortgageKrw: 120_000_000 }));
    expect(r.burdenRatioPercent).toBe(110);
    expect(r.level).toBe("critical");
    expect(r.findings.map((f) => f.code)).toContain("VAL_UNDERWATER");
  });
});

describe("배당 순서 시뮬레이션", () => {
  it("소액임차인 최우선변제는 선순위 근저당보다 먼저 배당된다", () => {
    // 시세 1억, 보증금 5천만(소액 대상), 근저당 1억
    const r = evaluateValuation(
      input({
        marketPriceKrw: EOK,
        seniorMortgageKrw: EOK,
        myDepositKrw: 50_000_000,
        convertedDepositKrw: 50_000_000,
      }),
    );
    const sim = r.simulation!;
    // 낙찰가 1억 × 0.72 = 7,200만 - 경매비용 300만 = 6,900만
    expect(sim.expectedAuctionProceedsKrw).toBe(72_000_000);
    expect(sim.auctionCostKrw).toBe(3_000_000);
    // 최우선변제 2,800만이 먼저 나가고
    expect(sim.smallLesseeEligible).toBe(true);
    expect(sim.smallLesseePriorityKrw).toBe(28_000_000);
    // 남은 4,100만은 전부 근저당으로
    expect(sim.seniorPayoutKrw).toBe(41_000_000);
    // 결국 내가 받는 건 최우선변제분만
    expect(sim.expectedRecoveryKrw).toBe(28_000_000);
    expect(sim.expectedShortfallKrw).toBe(22_000_000);
  });

  it("보증금이 소액임차인 한도를 넘으면 최우선변제를 받지 못한다", () => {
    const r = evaluateValuation(
      input({ marketPriceKrw: EOK, seniorMortgageKrw: EOK, myDepositKrw: 90_000_000 }),
    );
    expect(r.simulation!.smallLesseeEligible).toBe(false);
    expect(r.simulation!.smallLesseePriorityKrw).toBe(0);
    expect(r.simulation!.expectedRecoveryKrw).toBe(0);
  });

  it("빚이 없으면 보증금을 전액 회수한다", () => {
    const r = evaluateValuation(input());
    expect(r.simulation!.expectedShortfallKrw).toBe(0);
    expect(r.simulation!.recoveryRatio).toBe(1);
  });

  it("건물 유형에 따라 낙찰가율이 달라진다", () => {
    const apt = evaluateValuation(input({ buildingKind: "apartment" }));
    const multi = evaluateValuation(input({ buildingKind: "multi_household" }));
    expect(apt.simulation!.auctionRecoveryRate).toBe(AUCTION_RECOVERY_RATE.apartment);
    expect(multi.simulation!.auctionRecoveryRate).toBeLessThan(apt.simulation!.auctionRecoveryRate);
  });

  it("부담률이 낮아도 낙찰가율 때문에 손실이 나면 알려준다", () => {
    // 시세 2억, 근저당 5천만, 보증금 9천만 → 부담률 70% (caution)
    const r = evaluateValuation(
      input({ seniorMortgageKrw: 50_000_000, myDepositKrw: 90_000_000, convertedDepositKrw: 90_000_000 }),
    );
    expect(r.burdenRatioPercent).toBe(70);
    // 2억×0.72=1.44억 - 600만 = 1.38억, 최우선변제 0(9천만>8500만), 근저당 5천만 → 8,800만
    expect(r.simulation!.expectedShortfallKrw).toBe(2_000_000);
    expect(r.findings.map((f) => f.code)).toContain("VAL_AUCTION_GAP");
  });
});

describe("시세 미확인 · 선순위 미확인", () => {
  it("시세가 없으면 판정 불가로 표시하고 계산을 멈춘다", () => {
    const r = evaluateValuation(input({ marketPriceKrw: null }));
    expect(r.evaluable).toBe(false);
    expect(r.simulation).toBeNull();
    expect(r.findings.map((f) => f.code)).toEqual(["VAL_MARKET_PRICE_UNKNOWN"]);
  });

  it("다가구인데 선순위 보증금을 모르면 danger", () => {
    const r = evaluateValuation(
      input({ buildingKind: "multi_household", seniorDepositKrw: null }),
    );
    expect(r.seniorDepositUnknown).toBe(true);
    const f = r.findings.find((x) => x.code === "VAL_SENIOR_DEPOSIT_UNKNOWN");
    expect(f?.severity).toBe("danger");
  });

  it("선순위 보증금을 모르는 값은 0으로 취급하지 않고 unknown 플래그로 남긴다", () => {
    const known = evaluateValuation(input({ seniorDepositKrw: 0 }));
    expect(known.seniorDepositUnknown).toBe(false);
  });
});

describe("보증보험 가입 가능성", () => {
  it("선순위 + 보증금이 집값의 90% 이하면 가능성 있음", () => {
    expect(estimateGuaranteeEligibility(2 * EOK, 50_000_000, 100_000_000).likely).toBe(true);
  });

  it("90%를 넘으면 어려움", () => {
    expect(estimateGuaranteeEligibility(2 * EOK, 100_000_000, 100_000_000).likely).toBe(false);
  });

  it("시세를 모르면 판단하지 않는다 (null)", () => {
    expect(estimateGuaranteeEligibility(null, 0, 100_000_000).likely).toBeNull();
  });
});

describe("금액 유틸", () => {
  it("한국식 금액 표기", () => {
    expect(formatKrw(235_000_000)).toBe("2억 3,500만원");
    expect(formatKrw(200_000_000)).toBe("2억원");
    expect(formatKrw(5_000_000)).toBe("500만원");
    expect(formatKrw(0)).toBe("0원");
  });

  it("등기부 원문 금액 문자열 파싱", () => {
    expect(parseKoreanAmount("금150,000,000원")).toBe(150_000_000);
    expect(parseKoreanAmount("2억5천만원")).toBe(250_000_000);
    expect(parseKoreanAmount("1억2,000만")).toBe(120_000_000);
    expect(parseKoreanAmount(84_000_000)).toBe(84_000_000);
  });

  it("해석할 수 없는 금액은 0이 아니라 null", () => {
    expect(parseKoreanAmount("미상")).toBeNull();
    expect(parseKoreanAmount("")).toBeNull();
    expect(parseKoreanAmount(null)).toBeNull();
  });

  it("환산보증금은 월세를 자본화해 더한다", () => {
    // 보증금 1천만 + 월세 50만 → 1천만 + (50만×12/0.055) = 약 1억 1,909만
    expect(convertedDeposit(10_000_000, 500_000, 0.055)).toBe(119_090_909);
    expect(convertedDeposit(10_000_000, 0)).toBe(10_000_000);
  });
});
