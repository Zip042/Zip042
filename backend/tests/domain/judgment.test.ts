import { describe, expect, it } from "vitest";
import {
  buildJudgmentResult,
  glossaryHrefFor,
  gradeOf,
  overallGrade,
  toJudgment,
} from "../../src/domain/judgment.js";
import { buildVerdict } from "../../src/domain/verdict.js";
import { buildSchedule } from "../../src/domain/schedule.js";
import { evaluateValuation } from "../../src/domain/valuation.js";
import type { Finding } from "../../src/domain/types.js";

/**
 * 구현 가이드 8단계가 "최소한 이 세 가지는 꼭 넣으세요"라고 한 것들.
 *
 *   1. STOP 하나가 전체를 STOP 으로 만드는가 — 평균 내기 버그
 *   2. UNKNOWN 이 OK 로 새지 않는가 — 가장 위험한 버그
 *   3. 말소 필터를 거친 값이 들어오는가 — A·B 연결 지점
 */

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

function finding(o: Partial<Finding> = {}): Finding {
  return {
    code: "TEST",
    category: "rights",
    severity: "safe",
    weight: 0,
    title: "제목",
    description: "설명",
    ...o,
  };
}

function judge(findings: Finding[]) {
  const verdict = buildVerdict({
    findings,
    valuation,
    schedule,
    recommendedTerms: [],
    depositKrw: 100_000_000,
  });
  return buildJudgmentResult({
    verdict,
    findings,
    seniorClaimsKrw: 0,
    depositKrw: 100_000_000,
    marketPriceKrw: 200_000_000,
  });
}

describe("등급 변환", () => {
  it("info_gap 은 심각도와 무관하게 UNKNOWN 이다", () => {
    // 여기가 무너지면 "확인 못 함"이 "위험"이나 "안전"으로 새어 나간다.
    for (const severity of ["safe", "caution", "danger", "critical"] as const) {
      expect(gradeOf(finding({ kind: "info_gap", severity }))).toBe("UNKNOWN");
    }
  });

  it("실제 위험은 심각도에 따라 STOP · WARN · OK", () => {
    expect(gradeOf(finding({ severity: "critical" }))).toBe("STOP");
    expect(gradeOf(finding({ severity: "danger" }))).toBe("STOP");
    expect(gradeOf(finding({ severity: "caution" }))).toBe("WARN");
    expect(gradeOf(finding({ severity: "safe" }))).toBe("OK");
  });
});

describe("종합 등급은 최댓값이다 (평균이 아니다)", () => {
  it("STOP 하나가 나머지가 전부 OK 여도 전체를 STOP 으로 만든다", () => {
    // 신탁등기는 그 자체로 계약이 무효가 될 수 있다. 다른 게 깨끗해도 상쇄되지 않는다.
    expect(
      overallGrade(["OK", "OK", "OK", "OK", "STOP"]),
    ).toBe("STOP");
  });

  it("판정 결과 전체에서도 같다", () => {
    const r = judge([
      finding({ code: "RIGHTS_TRUST_REGISTERED", severity: "critical", title: "신탁등기" }),
      finding({ code: "A", severity: "safe" }),
      finding({ code: "B", severity: "safe" }),
      finding({ code: "C", severity: "safe" }),
      finding({ code: "D", severity: "safe" }),
    ]);
    expect(r.overallGrade).toBe("STOP");
  });

  it("WARN 여러 개가 STOP 하나를 이기지 못한다", () => {
    expect(overallGrade(["WARN", "WARN", "WARN", "WARN", "STOP"])).toBe("STOP");
  });

  it("아무것도 없으면 OK", () => {
    expect(overallGrade([])).toBe("OK");
  });
});

describe("UNKNOWN 이 OK 로 새지 않는다", () => {
  it("UNKNOWN 하나가 있으면 전체가 OK 일 수 없다", () => {
    expect(overallGrade(["OK", "OK", "UNKNOWN"])).toBe("UNKNOWN");
  });

  it("판정 결과에서도 UNKNOWN 이 살아남는다", () => {
    const r = judge([
      finding({ code: "VAL_MARKET_PRICE_UNKNOWN", kind: "info_gap", severity: "danger" }),
      finding({ code: "OKAY", severity: "safe" }),
    ]);
    expect(r.overallGrade).toBe("UNKNOWN");
    expect(r.judgments.find((j) => j.code === "VAL_MARKET_PRICE_UNKNOWN")?.grade).toBe("UNKNOWN");
  });

  it("STOP 이 있으면 UNKNOWN 보다 STOP 이 이긴다", () => {
    expect(overallGrade(["UNKNOWN", "STOP"])).toBe("STOP");
  });
});

describe("시세를 모를 때", () => {
  it("부채비율은 null 이다 — 0 이 아니다", () => {
    // 0 으로 채우면 화면에 "부채비율 0% · 안전"으로 뜬다. 가장 위험한 종류의 버그다.
    const verdict = buildVerdict({
      findings: [],
      valuation,
      schedule,
      recommendedTerms: [],
      depositKrw: 100_000_000,
    });
    const r = buildJudgmentResult({
      verdict,
      findings: [],
      seniorClaimsKrw: 50_000_000,
      depositKrw: 100_000_000,
      marketPriceKrw: null,
    });
    expect(r.calculation.burdenRatio).toBeNull();
    expect(r.calculation.marketPriceKrw).toBeNull();
    expect(r.calculation.computable).toBe(false);
  });

  it("시세가 0 으로 들어와도 계산하지 않는다", () => {
    // 시세 조회 실패를 0 으로 표현하는 코드가 어딘가 남아 있어도 여기서 막힌다.
    const verdict = buildVerdict({
      findings: [],
      valuation,
      schedule,
      recommendedTerms: [],
      depositKrw: 100_000_000,
    });
    const r = buildJudgmentResult({
      verdict,
      findings: [],
      seniorClaimsKrw: 50_000_000,
      depositKrw: 100_000_000,
      marketPriceKrw: 0,
    });
    expect(r.calculation.burdenRatio).toBeNull();
    expect(r.calculation.computable).toBe(false);
  });

  it("시세를 알면 비율을 계산한다", () => {
    const verdict = buildVerdict({
      findings: [],
      valuation,
      schedule,
      recommendedTerms: [],
      depositKrw: 100_000_000,
    });
    const r = buildJudgmentResult({
      verdict,
      findings: [],
      seniorClaimsKrw: 60_000_000,
      depositKrw: 100_000_000,
      marketPriceKrw: 200_000_000,
    });
    expect(r.calculation.burdenRatio).toBeCloseTo(0.8, 5);
    expect(r.calculation.computable).toBe(true);
  });
});

describe("근거 · 다음 행동 · 용어 링크", () => {
  it("원문인용을 evidence 에서 끌어온다", () => {
    const j = toJudgment(
      finding({
        code: "RIGHTS_MORTGAGE_PRESENT",
        evidence: {
          entries: [
            { rankNo: "1", holder: "○○은행", registeredOn: "2024-03-01", sourceQuote: "근저당권설정 채권최고액 금1억원" },
          ],
        },
      }),
    );
    expect(j.sourceQuotes).toEqual(["근저당권설정 채권최고액 금1억원"]);
    expect(j.basis).toEqual(["1번 · ○○은행 · 2024-03-01"]);
  });

  it("용어사전 링크가 실제 용어를 가리킨다", () => {
    // 링크 표를 따로 두지 않고 glossary 의 relatedFindings 를 역인덱스로 쓴다.
    expect(glossaryHrefFor("RIGHTS_TRUST_REGISTERED")).toContain("/glossary#");
    expect(glossaryHrefFor("존재하지_않는_코드")).toBeNull();
  });

  it("UNKNOWN 의 다음 행동이 '떼 와야 할 서류' 목록이 된다", () => {
    const r = judge([
      finding({
        code: "VAL_SENIOR_DEPOSIT_UNKNOWN",
        kind: "info_gap",
        severity: "danger",
        action: "확정일자 부여현황과 전입세대 열람내역을 요구하세요.",
      }),
    ]);
    expect(r.documentsNeeded).toContain("확정일자 부여현황과 전입세대 열람내역을 요구하세요.");
  });
});

describe("아무 문제도 없을 때", () => {
  it("침묵하지 않고 '확인했다'고 말한다", () => {
    // 빈 화면은 "검사가 안 됐나?" 로 읽힌다.
    const r = judge([]);
    const clear = r.judgments.find((j) => j.code === "CLEAR");
    expect(clear).toBeDefined();
    expect(clear?.grade).toBe("OK");
    expect(clear?.nextAction).toContain("잔금");
  });
});
