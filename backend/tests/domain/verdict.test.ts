import { describe, expect, it } from "vitest";
import { buildVerdict } from "../../src/domain/verdict.js";
import { collectTermTriggers, recommendSpecialTerms, SPECIAL_TERM_LIBRARY } from "../../src/domain/special-terms.js";
import { applyInterviewAnswers, nextQuestions, type InterviewContext } from "../../src/domain/interview.js";
import { evaluateRegionRisk } from "../../src/domain/region-risk.js";
import { buildSchedule } from "../../src/domain/schedule.js";
import { evaluateValuation } from "../../src/domain/valuation.js";
import type { Finding } from "../../src/domain/types.js";

const schedule = buildSchedule({
  contractDate: "2026-09-10",
  balanceDate: "2026-10-08",
  residentRegistrationDate: "2026-10-08",
  contractTermMonths: 24,
  holidays: new Set(),
  today: "2026-09-01",
});

const valuation = evaluateValuation({
  marketPriceKrw: 200_000_000,
  seniorMortgageKrw: 0,
  seniorDepositKrw: 0,
  otherSeniorClaimsKrw: 0,
  myDepositKrw: 100_000_000,
  convertedDepositKrw: 100_000_000,
  buildingKind: "multi_family",
  smallLesseeThreshold: null,
});

const finding = (o: Partial<Finding> = {}): Finding => ({
  code: "TEST",
  category: "rights",
  severity: "caution",
  weight: 10,
  title: "테스트",
  description: "설명",
  ...o,
});

const verdictOf = (findings: Finding[]) =>
  buildVerdict({ findings, valuation, schedule, recommendedTerms: [], depositKrw: 100_000_000 });

describe("종합 판정", () => {
  it("critical finding 이 하나라도 있으면 계약 불가", () => {
    const r = verdictOf([finding({ severity: "critical", weight: 45 })]);
    expect(r.verdict).toBe("critical");
    expect(r.contractable).toBe(false);
  });

  it("점수가 55 이상이면 critical 이 없어도 계약 불가", () => {
    const r = verdictOf([
      finding({ code: "A", category: "rights", severity: "danger", weight: 30 }),
      finding({ code: "B", category: "valuation", severity: "danger", weight: 30 }),
    ]);
    expect(r.score).toBe(60);
    expect(r.contractable).toBe(false);
    // 60점은 danger 구간. critical 은 치명적 항목이 있거나 85점 이상이어야 한다.
    expect(r.verdict).toBe("danger");
  });

  it("같은 카테고리에 문제가 겹치면 두 번째 이후는 기여도가 줄어든다", () => {
    const single = verdictOf([finding({ code: "A", category: "rights", weight: 30 })]);
    const doubled = verdictOf([
      finding({ code: "A", category: "rights", weight: 30 }),
      finding({ code: "B", category: "rights", weight: 30 }),
    ]);
    expect(single.score).toBe(30);
    // 단순 합산이면 60. 체감 계수로 30 + 15 = 45.
    expect(doubled.score).toBe(45);
  });

  it("작은 문제 여러 개가 치명적 문제 하나를 넘어서지 않는다", () => {
    const manySmall = verdictOf(
      Array.from({ length: 6 }, (_, i) =>
        finding({ code: `S${i}`, category: "document", severity: "caution", weight: 10 }),
      ),
    );
    const oneFatal = verdictOf([
      finding({ code: "FATAL", category: "rights", severity: "critical", weight: 50 }),
    ]);
    expect(manySmall.verdict).toBe("caution");
    expect(manySmall.contractable).toBe(true);
    expect(oneFatal.verdict).toBe("critical");
    expect(oneFatal.contractable).toBe(false);
  });

  it("경고 수준이면 계약 가능하되 조건을 붙인다", () => {
    const r = verdictOf([finding({ weight: 10 })]);
    expect(r.verdict).toBe("caution");
    expect(r.contractable).toBe(true);
  });

  it("점수는 100을 넘지 않는다", () => {
    const categories = ["rights", "valuation", "schedule", "document", "region", "contract"] as const;
    const many = categories.map((category, i) =>
      finding({ code: `F${i}`, category, severity: "critical", weight: 40 }),
    );
    expect(verdictOf(many).score).toBe(100);
  });

  it("safe finding 만 있으면 안전 판정", () => {
    const r = verdictOf([finding({ severity: "safe", weight: 0 })]);
    expect(r.verdict).toBe("safe");
    expect(r.contractable).toBe(true);
    expect(r.topFindings).toHaveLength(0); // safe 는 상위 목록에서 제외
  });

  it("상위 항목은 위험도 → 가중치 순으로 정렬된다", () => {
    const r = verdictOf([
      finding({ code: "LOW", severity: "caution", weight: 40 }),
      finding({ code: "HIGH", severity: "critical", weight: 5 }),
      finding({ code: "MID", severity: "danger", weight: 20 }),
    ]);
    expect(r.topFindings.map((f) => f.code)).toEqual(["HIGH", "MID", "LOW"]);
  });

  it("카테고리별 최고 위험도를 집계한다", () => {
    const r = verdictOf([
      finding({ code: "A", category: "rights", severity: "caution" }),
      finding({ code: "B", category: "rights", severity: "danger" }),
      finding({ code: "C", category: "schedule", severity: "safe" }),
    ]);
    expect(r.categoryLevels).toMatchObject({ rights: "danger", schedule: "safe" });
  });

  it("danger 이상 finding 의 action 을 필수 조치로 모은다", () => {
    const r = verdictOf([
      finding({ code: "A", severity: "danger", action: "등기부를 다시 확인하세요." }),
      finding({ code: "B", severity: "caution", action: "이건 필수 아님" }),
    ]);
    expect(r.requiredActions).toEqual(["등기부를 다시 확인하세요."]);
  });
});

describe("확인 못 한 항목(info_gap)은 위험과 분리된다", () => {
  it("info_gap 은 위험 점수에 더해지지 않는다", () => {
    const r = verdictOf([
      finding({ code: "GAP1", kind: "info_gap", severity: "caution", weight: 30 }),
      finding({ code: "GAP2", kind: "info_gap", severity: "caution", weight: 30 }),
    ]);
    expect(r.score).toBe(0);
    expect(r.informationGaps).toHaveLength(2);
    expect(r.checkedCompletely).toBe(false);
  });

  it("확인 못 한 항목이 있으면 '안전'이라고 말하지 않는다", () => {
    const r = verdictOf([finding({ code: "GAP", kind: "info_gap", severity: "caution", weight: 5 })]);
    expect(r.verdict).toBe("caution");
  });

  it("심각한 확인 불가 항목은 판정을 차단한다 (계약 가능 판단 보류)", () => {
    const r = verdictOf([
      finding({
        code: "VAL_MARKET_PRICE_UNKNOWN",
        kind: "info_gap",
        severity: "danger",
        weight: 10,
        action: "시세를 직접 입력해 주세요.",
      }),
    ]);
    expect(r.score).toBe(0);
    expect(r.blockingGaps.map((g) => g.code)).toEqual(["VAL_MARKET_PRICE_UNKNOWN"]);
    expect(r.contractable).toBe(false);
    // "위험하다"가 아니라 "아직 판단할 수 없다"로 말해야 한다.
    expect(r.headline).toContain("아직 판단할 수 없어요");
  });

  it("확인 불가 항목은 상위 위험 목록에 섞이지 않는다", () => {
    const r = verdictOf([
      finding({ code: "REAL", severity: "danger", weight: 20 }),
      finding({ code: "GAP", kind: "info_gap", severity: "danger", weight: 20 }),
    ]);
    expect(r.topFindings.map((f) => f.code)).toEqual(["REAL"]);
    expect(r.conditions.some((c) => c.startsWith("확인 필요"))).toBe(false);
  });

  it("모두 확인했으면 checkedCompletely 가 true", () => {
    const r = verdictOf([finding({ code: "REAL", severity: "caution", weight: 10 })]);
    expect(r.checkedCompletely).toBe(true);
    expect(r.blockingGaps).toHaveLength(0);
  });
});

describe("특약 추천", () => {
  it("조건이 없어도 기본 특약은 항상 포함된다", () => {
    const terms = recommendSpecialTerms(new Map(), { depositKrw: 100_000_000 });
    const codes = terms.map((t) => t.code);
    expect(codes).toContain("TERM_NO_NEW_ENCUMBRANCE");
    expect(codes).toContain("TERM_PAYMENT_TO_OWNER_ACCOUNT");
  });

  it("finding 의 suggestTerms 가 특약을 유발하고 유발 원인을 기록한다", () => {
    const findings = [
      finding({ code: "RIGHTS_TRUST_REGISTERED", suggestTerms: ["TERM_TRUST_CONSENT_REQUIRED"] }),
    ];
    const terms = recommendSpecialTerms(collectTermTriggers(findings), { depositKrw: 100_000_000 });
    const trust = terms.find((t) => t.code === "TERM_TRUST_CONSENT_REQUIRED");
    expect(trust?.triggeredBy).toEqual(["RIGHTS_TRUST_REGISTERED"]);
    expect(trust?.required).toBe(true);
  });

  it("priority 순으로 정렬된다", () => {
    const terms = recommendSpecialTerms(
      collectTermTriggers([finding({ suggestTerms: ["TERM_TRUST_CONSENT_REQUIRED"] })]),
      { depositKrw: 100_000_000 },
    );
    expect(terms[0]?.code).toBe("TERM_TRUST_CONSENT_REQUIRED"); // priority 1
    expect(terms.map((t) => t.priority)).toEqual([...terms.map((t) => t.priority)].sort((a, b) => a - b));
  });

  it("모든 특약 문구에 날짜·금액이 채워진다", () => {
    const terms = recommendSpecialTerms(
      new Map(Object.keys(SPECIAL_TERM_LIBRARY).map((c) => [c, []])),
      {
        depositKrw: 100_000_000,
        balanceDate: "2026-10-08",
        contractDate: "2026-09-10",
        protectionDate: "2026-10-09",
        lessorName: "김소유",
        address: "대전광역시 서구 둔산로 100",
        detailAddress: "301호",
      },
    );
    expect(terms).toHaveLength(Object.keys(SPECIAL_TERM_LIBRARY).length);
    for (const t of terms) {
      expect(t.clauseText.length).toBeGreaterThan(20);
      expect(t.clauseText).not.toContain("undefined");
      expect(t.clauseText).not.toContain("null");
    }
  });

  it("알 수 없는 특약 코드는 무시한다", () => {
    const terms = recommendSpecialTerms(new Map([["TERM_NOPE", ["X"]]]), { depositKrw: 0 });
    expect(terms.map((t) => t.code)).not.toContain("TERM_NOPE");
  });
});

describe("대화형 후속 질문", () => {
  const ctx: InterviewContext = {
    isMultiHousehold: false,
    burdenRatio: 0.5,
    hasMortgage: false,
    hasTrust: false,
    monthlyRentKrw: 500_000,
    maintenanceFeeKrw: 70_000,
    depositKrw: 10_000_000,
  };

  it("조건에 맞는 질문만 노출한다", () => {
    const codes = nextQuestions(ctx, new Set(), 99).map((q) => q.code);
    expect(codes).not.toContain("Q_PRIOR_TENANT_DISCLOSED"); // 다가구 아님
    expect(codes).not.toContain("Q_TRUST_CONSENT_RECEIVED"); // 신탁 아님
    expect(codes).toContain("Q_RESIDENT_REGISTRATION_OBJECTION");
  });

  it("다가구·신탁이면 해당 질문이 추가된다", () => {
    const codes = nextQuestions(
      { ...ctx, isMultiHousehold: true, hasTrust: true },
      new Set(),
      99,
    ).map((q) => q.code);
    expect(codes).toContain("Q_PRIOR_TENANT_DISCLOSED");
    expect(codes).toContain("Q_TRUST_CONSENT_RECEIVED");
  });

  it("이미 답한 질문은 다시 묻지 않고 순서대로 limit 만큼 준다", () => {
    const asked = new Set(["Q_RESIDENT_REGISTRATION_OBJECTION"]);
    const next = nextQuestions(ctx, asked, 2);
    expect(next).toHaveLength(2);
    expect(next[0]?.code).toBe("Q_DEPOSIT_TO_OTHER_ACCOUNT");
  });

  it("전입신고를 막는다는 답변은 critical", () => {
    const out = applyInterviewAnswers({ Q_RESIDENT_REGISTRATION_OBJECTION: true });
    expect(out.findings[0]?.severity).toBe("critical");
    expect(out.findings[0]?.code).toBe("INT_REGISTRATION_OBJECTION");
  });

  it("제3자 계좌 요구는 critical + 특약 추가", () => {
    const out = applyInterviewAnswers({ Q_DEPOSIT_TO_OTHER_ACCOUNT: true });
    expect(out.findings[0]?.severity).toBe("critical");
    expect(out.extraTermCodes).toContain("TERM_PAYMENT_TO_OWNER_ACCOUNT");
  });

  it("직거래 · 앱 거래는 위험도가 다르다", () => {
    expect(
      applyInterviewAnswers({ Q_CONTRACT_CHANNEL: "direct" }).findings[0]?.severity,
    ).toBe("caution");
    expect(
      applyInterviewAnswers({ Q_CONTRACT_CHANNEL: "platform_only" }).findings[0]?.severity,
    ).toBe("danger");
    expect(applyInterviewAnswers({ Q_CONTRACT_CHANNEL: "licensed_agent" }).findings).toHaveLength(0);
  });

  it("구두 약속은 특약으로 변환된다", () => {
    const out = applyInterviewAnswers({ Q_VERBAL_PROMISES: ["cleaning", "pet"] });
    expect(out.extraTermCodes).toContain("TERM_PRE_MOVE_IN_CLEANING");
    expect(out.extraTermCodes).toContain("TERM_PET_ALLOWED");
    expect(out.findings.map((f) => f.code)).toContain("INT_VERBAL_PROMISES");
  });

  it("약속이 없으면 finding 을 만들지 않는다", () => {
    const out = applyInterviewAnswers({ Q_VERBAL_PROMISES: ["none"] });
    expect(out.findings).toHaveLength(0);
    expect(out.extraTermCodes).toHaveLength(0);
  });

  it("답변이 없으면 아무 것도 만들지 않는다", () => {
    const out = applyInterviewAnswers({});
    expect(out.findings).toHaveLength(0);
    expect(out.extraTermCodes).toHaveLength(0);
  });
});

describe("지역 위험", () => {
  const summary = {
    radiusM: 500,
    victimCaseCount: 0,
    victimSiteCount: 0,
    nearestDistanceM: null,
    latestReportedOn: null,
    sameBuildingCount: 0,
    sameOwnerCount: 0,
  };

  it("반경 내 피해가 없으면 safe", () => {
    const r = evaluateRegionRisk(summary);
    expect(r.level).toBe("safe");
    expect(r.findings.map((f) => f.code)).toContain("REGION_NO_NEARBY_VICTIMS");
  });

  it("지역 통계는 건수와 무관하게 caution 을 넘지 않는다", () => {
    // 팀이 확정한 API 목록(2026-08)의 결정: 대전 피해주택 데이터는 자치구 단위 집계뿐이고
    // 좌표가 0건이라 반경 계산이 성립하지 않는다 → 맥락으로만 쓰고 점수에 넣지 않는다.
    for (const count of [2, 12, 40]) {
      expect(evaluateRegionRisk({ ...summary, victimCaseCount: count }).level).toBe("caution");
    }
  });

  it("지역 통계는 위험 점수에 기여하지 않는다", () => {
    // weight 가 0 이 아니면 '동네가 나쁘다'는 이유로 이 집의 점수가 올라간다.
    for (const count of [2, 12, 40]) {
      const f = evaluateRegionRisk({ ...summary, victimCaseCount: count }).findings.find(
        (x) => x.code === "REGION_NEARBY_VICTIMS",
      );
      expect(f?.weight, `${count}건일 때`).toBe(0);
    }
  });

  it("밀집 지역은 등급은 그대로 두고 문구만 강해진다", () => {
    const hotspot = evaluateRegionRisk({ ...summary, victimCaseCount: 40 });
    const f = hotspot.findings.find((x) => x.code === "REGION_NEARBY_VICTIMS");
    expect(f?.severity).toBe("caution");
    expect(f?.description).toContain("피해가 특히 몰려 있는");
    expect(f?.description).toContain("참고 정보");
  });

  it("동일 건물 피해는 critical", () => {
    const r = evaluateRegionRisk({ ...summary, sameBuildingCount: 1 });
    expect(r.level).toBe("critical");
    expect(r.findings.map((f) => f.code)).toContain("REGION_SAME_BUILDING_VICTIM");
  });

  it("동일 소유자 피해는 가장 높은 가중치를 가진다", () => {
    const r = evaluateRegionRisk({ ...summary, sameOwnerCount: 2 });
    const f = r.findings.find((x) => x.code === "REGION_SAME_OWNER_VICTIM");
    expect(f?.severity).toBe("critical");
    expect(f?.weight).toBeGreaterThanOrEqual(45);
  });
});
