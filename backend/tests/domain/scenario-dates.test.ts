import { describe, expect, it } from "vitest";
import { scenarioDates, holidaySeed } from "../../src/mock/fixtures.js";
import { addDays, isWeekend, type DateOnly } from "../../src/lib/date.js";

/**
 * 시나리오 픽스처의 잔금일이 **어느 날 실행해도** 업무일이어야 한다.
 *
 * 왜 이 테스트가 있는가: 잔금일을 `today + 42` 로 고정해 두었더니, 그 날이
 * 주말·공휴일에 걸리는 날에만 CI 가 깨졌다. 2026-08-27 에는 통과하고
 * 2026-08-28 에는 실패했다 — today+42 가 2026-10-09(한글날)이 되는 날이었다.
 *
 * 판정은 옳았다. 잔금일이 공휴일이면 경고하는 것이 이 서비스의 기능이다.
 * 문제는 시나리오가 **등기부 위험**을 보려는 것인데 일정 경고가 섞여 등급이
 * 밀린다는 점이었다. 그래서 픽스처를 업무일로 맞춘다.
 *
 * 하루씩 돌려보며 400일치를 확인한다 — "오늘은 통과한다"로는 이 버그를 못 잡는다.
 */
describe("시나리오 픽스처 날짜", () => {
  const holidays = new Set(holidaySeed(2026, 2030).map((h) => h.holiday_date as DateOnly));

  it("어느 날 실행해도 잔금일이 주말·공휴일이 아니다", () => {
    const bad: string[] = [];
    let day = "2026-01-01" as DateOnly;
    for (let i = 0; i < 400; i += 1) {
      const { balanceDate } = scenarioDates(day);
      if (isWeekend(balanceDate) || holidays.has(balanceDate)) {
        bad.push(`${day} → 잔금일 ${balanceDate}`);
      }
      day = addDays(day, 1);
    }
    expect(bad).toEqual([]);
  });

  it("계약일은 잔금일보다 앞선다", () => {
    let day = "2026-01-01" as DateOnly;
    for (let i = 0; i < 400; i += 1) {
      const { contractDate, balanceDate } = scenarioDates(day);
      expect(contractDate < balanceDate).toBe(true);
      day = addDays(day, 1);
    }
  });
});
