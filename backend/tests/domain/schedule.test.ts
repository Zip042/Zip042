import { describe, expect, it } from "vitest";
import { buildSchedule } from "../../src/domain/schedule.js";

const NO_HOLIDAYS = new Set<string>();
const TODAY = "2026-09-01";

function base(overrides: Partial<Parameters<typeof buildSchedule>[0]> = {}) {
  return buildSchedule({
    // 2026-09-10 = 목요일, 2026-10-08 = 목요일
    contractDate: "2026-09-10",
    balanceDate: "2026-10-08",
    residentRegistrationDate: "2026-10-08",
    contractTermMonths: 24,
    holidays: NO_HOLIDAYS,
    today: TODAY,
    ...overrides,
  });
}

describe("대항력 · 우선변제권 시점", () => {
  it("전입신고 다음 날 0시(KST)에 대항력이 생긴다", () => {
    const r = base();
    // 2026-10-09 00:00 KST = 2026-10-08 15:00 UTC
    expect(r.opposingPowerEffectiveAt).toBe("2026-10-08T15:00:00.000Z");
  });

  it("확정일자를 계약일에 미리 받으면 우선변제권은 대항력과 동시에 생긴다", () => {
    const r = base({ confirmedDatePlan: "2026-09-10" });
    expect(r.priorityRightEffectiveAt).toBe(r.opposingPowerEffectiveAt);
  });

  it("확정일자를 늦게 받으면 우선변제권도 그만큼 밀린다", () => {
    const r = base({ confirmedDatePlan: "2026-10-20" });
    expect(r.priorityRightEffectiveAt).toBe("2026-10-19T15:00:00.000Z");
    expect(r.findings.map((f) => f.code)).toContain("SCH_CONFIRMED_DATE_LATE");
  });

  it("입주일이 전입신고일보다 늦으면 늦은 쪽을 기준으로 계산한다", () => {
    const r = base({ moveInDate: "2026-10-12", residentRegistrationDate: "2026-10-08" });
    // 인도(10-12)와 주민등록(10-08) 중 늦은 10-12 기준 → 10-13 0시
    expect(r.opposingPowerEffectiveAt).toBe("2026-10-12T15:00:00.000Z");
  });
});

describe("무방비 구간", () => {
  it("전입신고를 잔금일에 해도 최소 1일은 보호받지 못한다", () => {
    const r = base();
    expect(r.unprotectedWindow).toEqual({
      fromDate: "2026-10-08",
      toDate: "2026-10-08",
      days: 1,
    });
    expect(r.findings.map((f) => f.code)).toContain("SCH_SAME_DAY_MORTGAGE_GAP");
  });

  it("전입신고가 늦어지면 무방비 구간이 그만큼 길어지고 위험도가 올라간다", () => {
    const r = base({ residentRegistrationDate: "2026-10-13" });
    expect(r.unprotectedWindow?.days).toBe(6);
    const delayed = r.findings.find((f) => f.code === "SCH_REGISTRATION_DELAYED");
    expect(delayed?.severity).toBe("critical");
    expect(delayed?.evidence).toMatchObject({ registrationGap: 5 });
  });

  it("전입신고 1일 지연은 danger 미만(caution)으로 본다", () => {
    const r = base({ residentRegistrationDate: "2026-10-09" });
    expect(r.findings.find((f) => f.code === "SCH_REGISTRATION_DELAYED")?.severity).toBe("caution");
  });
});

describe("휴일 판정", () => {
  it("잔금일이 토요일이면 경고한다", () => {
    // 2026-10-10 = 토요일
    const r = base({ balanceDate: "2026-10-10", residentRegistrationDate: "2026-10-10" });
    const f = r.findings.find((x) => x.code === "SCH_BALANCE_ON_NON_BUSINESS_DAY");
    expect(f?.severity).toBe("danger");
    expect(f?.evidence).toMatchObject({ reason: "주말", nextBusinessDay: "2026-10-12" });
  });

  it("잔금일이 공휴일이면 경고하고 다음 업무일을 알려준다", () => {
    const holidays = new Set(["2026-10-09"]); // 한글날 (금)
    const r = base({ balanceDate: "2026-10-09", residentRegistrationDate: "2026-10-09", holidays });
    const f = r.findings.find((x) => x.code === "SCH_BALANCE_ON_NON_BUSINESS_DAY");
    expect(f?.evidence).toMatchObject({ reason: "공휴일", nextBusinessDay: "2026-10-12" });
  });

  it("계약일이 휴일이면 확정일자 권장일을 다음 업무일로 미룬다", () => {
    const r = base({ contractDate: "2026-09-12" }); // 토요일
    expect(r.recommended.confirmedDateOn).toBe("2026-09-14"); // 월요일
  });
});

describe("전입신고 법정 기한", () => {
  it("입주 후 14일을 넘기면 경고한다", () => {
    const r = base({ residentRegistrationDate: "2026-10-25" }); // 잔금 10-08 + 17일
    expect(r.recommended.residentRegistrationDeadline).toBe("2026-10-22");
    expect(r.findings.map((f) => f.code)).toContain("SCH_REGISTRATION_PAST_LEGAL_DEADLINE");
  });

  it("14일 이내면 법정 기한 경고는 없다", () => {
    const r = base({ residentRegistrationDate: "2026-10-20" });
    expect(r.findings.map((f) => f.code)).not.toContain("SCH_REGISTRATION_PAST_LEGAL_DEADLINE");
  });
});

describe("계약 기간", () => {
  it("24개월 계약의 만료일은 시작일 + 24개월 - 1일", () => {
    const r = base();
    expect(r.normalized.termStart).toBe("2026-10-08");
    expect(r.normalized.termEnd).toBe("2028-10-07");
  });

  it("갱신 통지 기간은 만료 6개월 전 ~ 2개월 전", () => {
    const r = base();
    expect(r.renewalNoticeWindow).toEqual({ from: "2028-04-07", to: "2028-08-07" });
  });

  it("2년 미만 계약이면 주임법상 2년까지 보장된다는 안내가 붙는다", () => {
    const r = base({ contractTermMonths: 12 });
    expect(r.normalized.protectedTermEnd).toBe("2028-10-07");
    expect(r.findings.map((f) => f.code)).toContain("SCH_TERM_UNDER_TWO_YEARS");
  });
});

describe("입력 검증", () => {
  it("날짜가 없으면 계산하지 않고 안내만 낸다", () => {
    const r = buildSchedule({
      contractDate: null,
      balanceDate: null,
      contractTermMonths: 24,
      holidays: NO_HOLIDAYS,
      today: TODAY,
    });
    expect(r.evaluable).toBe(false);
    expect(r.events).toHaveLength(0);
    expect(r.findings.map((f) => f.code)).toEqual(["SCH_DATES_MISSING"]);
  });

  it("잔금일이 계약일보다 빠르면 critical", () => {
    const r = base({ contractDate: "2026-10-20" });
    expect(r.findings.find((f) => f.code === "SCH_ORDER_INVALID")?.severity).toBe("critical");
  });
});

describe("타임라인", () => {
  it("이벤트가 날짜 순으로 정렬되고 D-day가 계산된다", () => {
    const r = base();
    const dates = r.events.map((e) => e.date);
    expect([...dates]).toEqual([...dates].sort());

    const contractDay = r.events.find((e) => e.code === "CONTRACT_DAY");
    expect(contractDay?.dDay).toBe(9); // 2026-09-01 → 2026-09-10
  });

  it("핵심 이벤트가 모두 포함된다", () => {
    const codes = base().events.map((e) => e.code);
    for (const expected of [
      "CONTRACT_DAY",
      "CONFIRMED_DATE",
      "REGISTRY_RECHECK_BEFORE_BALANCE",
      "BALANCE_DAY",
      "PROTECTION_EFFECTIVE",
      "REGISTRY_RECHECK_AFTER_PROTECTION",
      "TERM_END",
    ]) {
      expect(codes).toContain(expected);
    }
  });

  it("등기부 재확인 권장일은 계약일 · 잔금일 · 보호 시작 다음날", () => {
    expect(base().recommended.registryRecheckOn).toEqual([
      "2026-09-10",
      "2026-10-08",
      "2026-10-10",
    ]);
  });
});
