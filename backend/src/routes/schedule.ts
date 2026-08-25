import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { todayKst, type DateOnly } from "../lib/date.js";
import type { AppBindings } from "../middleware/auth.js";
import { buildSchedule, suggestBusinessDayAlternatives } from "../domain/schedule.js";
import { loadHolidays } from "../services/holidays.service.js";

export const scheduleRoute = new Hono<AppBindings>();

/**
 * 일정만 계산한다 (문서 · AI 없이).
 *
 * 프론트엔드에서 사용자가 날짜 피커를 만질 때마다 즉시 "대항력이 언제 생기는지"를
 * 보여주기 위한 경량 엔드포인트다. DB에 저장하지 않는다.
 */
const scheduleProbeSchema = z.object({
  contractDate: z.string().nullish(),
  balanceDate: z.string().nullish(),
  moveInDate: z.string().nullish(),
  residentRegistrationDate: z.string().nullish(),
  confirmedDatePlan: z.string().nullish(),
  contractTermMonths: z.number().int().min(1).max(120).default(24),
});

scheduleRoute.post("/schedule/preview", zValidator("json", scheduleProbeSchema), async (c) => {
  const body = c.req.valid("json");
  const { holidays, lunarHolidaysSynced } = await loadHolidays();
  const today = todayKst();

  const schedule = buildSchedule({
    contractDate: (body.contractDate ?? null) as DateOnly | null,
    balanceDate: (body.balanceDate ?? null) as DateOnly | null,
    moveInDate: (body.moveInDate ?? null) as DateOnly | null,
    residentRegistrationDate: (body.residentRegistrationDate ?? null) as DateOnly | null,
    confirmedDatePlan: (body.confirmedDatePlan ?? null) as DateOnly | null,
    contractTermMonths: body.contractTermMonths,
    holidays,
    today,
  });

  return c.json({
    schedule,
    alternatives:
      schedule.normalized.balanceDate
        ? suggestBusinessDayAlternatives(schedule.normalized.balanceDate, holidays)
        : null,
    caveats: lunarHolidaysSynced
      ? []
      : ["공휴일 데이터에 음력 연휴가 반영되지 않았습니다. 잔금일이 연휴와 겹치는지 직접 확인하세요."],
  });
});
