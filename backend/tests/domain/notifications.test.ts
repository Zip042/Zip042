import { describe, expect, it } from "vitest";
import { buildSchedule } from "../../src/domain/schedule.js";
import { dueOn, planNotifications, upcomingEvents } from "../../src/domain/notifications.js";

const TODAY = "2026-09-01";

const schedule = buildSchedule({
  contractDate: "2026-09-10",
  balanceDate: "2026-10-08",
  residentRegistrationDate: "2026-10-08",
  contractTermMonths: 24,
  holidays: new Set(),
  today: TODAY,
});

const plan = (overrides: Partial<Parameters<typeof planNotifications>[0]> = {}) =>
  planNotifications({
    caseId: "case-1",
    caseTitle: "둔산동 원룸",
    events: schedule.events,
    today: TODAY,
    ...overrides,
  });

describe("알림 산출", () => {
  it("잔금일에는 3일 전 · 하루 전 · 당일 알림을 만든다", () => {
    const balanceNotifs = plan().filter((n) => n.eventCode === "BALANCE_DAY");
    expect(balanceNotifs.map((n) => n.ruleCode)).toEqual(["D_MINUS_3", "D_MINUS_1", "D_DAY"]);
    expect(balanceNotifs.map((n) => n.sendOn)).toEqual([
      "2026-10-05",
      "2026-10-07",
      "2026-10-08",
    ]);
  });

  it("대항력 발생은 사용자가 할 일이 없으므로 알림하지 않는다", () => {
    expect(plan().map((n) => n.eventCode)).not.toContain("PROTECTION_EFFECTIVE");
  });

  it("모든 일정에 알림을 보내지 않는다 (알림 피로 방지)", () => {
    const eventCodes = new Set(schedule.events.map((e) => e.code));
    const notified = new Set(plan().map((n) => n.eventCode));
    // 일정 수보다 알림 대상 일정 수가 적어야 한다.
    expect(notified.size).toBeLessThan(eventCodes.size);
    // 놓치면 되돌릴 수 없는 일정은 반드시 포함
    expect(notified).toContain("BALANCE_DAY");
    expect(notified).toContain("REGISTRY_RECHECK_AFTER_PROTECTION");
    expect(notified).toContain("RENEWAL_NOTICE_WINDOW_CLOSE");
  });

  it("이미 지난 날짜에 보낼 알림은 만들지 않는다", () => {
    const late = plan({ today: "2026-10-20" });
    expect(late.every((n) => n.sendOn >= "2026-10-20")).toBe(true);
    // 계약일·잔금일 알림은 모두 과거이므로 사라진다.
    expect(late.map((n) => n.eventCode)).not.toContain("BALANCE_DAY");
    // 만료 관련 알림은 남는다.
    expect(late.map((n) => n.eventCode)).toContain("TERM_END");
  });

  it("includePast 로 과거 알림도 계산할 수 있다 (백필용)", () => {
    const withPast = plan({ today: "2026-10-20", includePast: true });
    expect(withPast.map((n) => n.eventCode)).toContain("BALANCE_DAY");
  });

  it("알림 본문에 반드시 해야 할 항목이 최대 2개 들어간다", () => {
    const dDay = plan().find((n) => n.eventCode === "BALANCE_DAY" && n.ruleCode === "D_DAY")!;
    const bullets = dDay.body.split("\n").filter((l) => l.startsWith("·"));
    expect(bullets.length).toBeGreaterThan(0);
    expect(bullets.length).toBeLessThanOrEqual(2);
  });

  it("제목에 검사 건 이름과 시점이 들어간다", () => {
    const dDay = plan().find((n) => n.ruleCode === "D_DAY" && n.eventCode === "BALANCE_DAY")!;
    expect(dDay.title).toContain("둔산동 원룸");
    expect(dDay.title).toContain("오늘");
  });

  it("검사 건 이름이 없으면 접두어를 붙이지 않는다", () => {
    const n = plan({ caseTitle: null })[0]!;
    expect(n.title.startsWith("[")).toBe(false);
  });

  it("딥링크가 해당 일정을 가리킨다", () => {
    const n = plan().find((x) => x.eventCode === "BALANCE_DAY")!;
    expect(n.deepLink).toBe("zip042://cases/case-1/timeline?event=BALANCE_DAY");
  });

  it("일정의 위험도를 알림 위험도로 이어받는다", () => {
    // 잔금일이 토요일이면 일정 자체가 danger 이므로 알림도 danger 여야 한다.
    const weekend = buildSchedule({
      contractDate: "2026-09-10",
      balanceDate: "2026-10-10",
      residentRegistrationDate: "2026-10-10",
      contractTermMonths: 24,
      holidays: new Set(),
      today: TODAY,
    });
    const n = planNotifications({
      caseId: "c",
      caseTitle: null,
      events: weekend.events,
      today: TODAY,
    }).find((x) => x.eventCode === "BALANCE_DAY");
    expect(n?.severity).toBe("danger");
  });

  it("같은 날 같은 일정에 규칙이 겹치면 하나만 남는다", () => {
    const notifs = plan();
    const keys = notifs.map((n) => `${n.eventCode}|${n.sendOn}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("발송일 순으로 정렬된다", () => {
    const dates = plan().map((n) => n.sendOn);
    expect([...dates]).toEqual([...dates].sort());
  });

  it("특정 날짜에 보낼 알림만 골라낼 수 있다", () => {
    const due = dueOn(plan(), "2026-10-08");
    expect(due.length).toBeGreaterThan(0);
    expect(due.every((n) => n.sendOn === "2026-10-08")).toBe(true);
  });

  it("일정이 없으면 알림도 없다", () => {
    expect(planNotifications({ caseId: "c", caseTitle: null, events: [], today: TODAY })).toEqual([]);
  });
});

describe("다가오는 일정 (홈 화면)", () => {
  it("지난 일정은 제외하고 D-day 순으로 정렬한다", () => {
    const result = upcomingEvents(
      [{ caseId: "case-1", caseTitle: "둔산동", events: schedule.events }],
      TODAY,
      5,
    );
    expect(result).toHaveLength(5);
    expect(result.every((e) => e.dDay >= 0)).toBe(true);
    expect(result.map((e) => e.dDay)).toEqual([...result.map((e) => e.dDay)].sort((a, b) => a - b));
    expect(result[0]?.code).toBe("CONTRACT_DAY");
    expect(result[0]?.dDay).toBe(9);
  });

  it("여러 검사 건을 섞어 가장 임박한 것부터 준다", () => {
    const other = buildSchedule({
      contractDate: "2026-09-03",
      balanceDate: "2026-09-20",
      contractTermMonths: 24,
      holidays: new Set(),
      today: TODAY,
    });
    const result = upcomingEvents(
      [
        { caseId: "case-1", caseTitle: "둔산동", events: schedule.events },
        { caseId: "case-2", caseTitle: "유성구", events: other.events },
      ],
      TODAY,
      3,
    );
    expect(result[0]?.caseId).toBe("case-2");
    expect(result[0]?.dDay).toBe(2);
  });

  it("반드시 해야 할 체크리스트만 추려 준다", () => {
    const result = upcomingEvents(
      [{ caseId: "c", caseTitle: null, events: schedule.events }],
      TODAY,
      1,
    );
    expect(result[0]?.criticalChecklist.length).toBeGreaterThan(0);
  });

  it("모든 일정이 지났으면 빈 배열", () => {
    expect(upcomingEvents([{ caseId: "c", caseTitle: null, events: schedule.events }], "2030-01-01")).toEqual([]);
  });
});
