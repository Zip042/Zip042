import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { loadEnv } from "../env.js";
import { badRequest } from "../lib/errors.js";
import { dateOnly } from "../schemas/case.js";
import type { AppBindings } from "../middleware/auth.js";
import { todayKst } from "../lib/date.js";
import { invalidateHolidayCache, syncHolidaysFromKasi } from "../services/holidays.service.js";
import { findDueNotifications, markNotifications } from "../services/notification.service.js";
import { reapStaleJobs } from "../services/job.service.js";
import { isOwnerMatchingEnabled, upsertVictimProperties } from "../services/region.service.js";

export const adminRoute = new Hono<AppBindings>();

/**
 * 관리자 배치 엔드포인트.
 *
 * 사용자 JWT가 아니라 별도의 공유 시크릿(x-admin-token)으로 보호한다 — app.ts 에서
 * requireAdminToken 미들웨어를 붙인다. 프론트엔드에는 절대 노출하지 않는다.
 */

/**
 * 공휴일 동기화.
 * 운영 투입 전 반드시 1회 실행할 것 — 음력 연휴가 반영되지 않으면
 * "잔금일이 설 연휴다" 같은 위험을 서버가 감지하지 못한다.
 */
adminRoute.post(
  "/holidays/sync",
  zValidator(
    "json",
    z.object({
      years: z.array(z.number().int().min(2020).max(2100)).min(1).max(5),
    }),
  ),
  async (c) => {
    const env = loadEnv();
    if (!env.KASI_SERVICE_KEY) {
      throw badRequest("KASI_SERVICE_KEY 가 설정되지 않았습니다. (한국천문연구원 특일 정보 API 키)");
    }
    const { years } = c.req.valid("json");
    const results: { year: number; inserted: number }[] = [];
    for (const year of years) {
      const { inserted } = await syncHolidaysFromKasi(env.KASI_SERVICE_KEY, year);
      results.push({ year, inserted });
    }
    return c.json({ synced: results });
  },
);

adminRoute.post("/holidays/cache/invalidate", (c) => {
  invalidateHolidayCache();
  return c.json({ ok: true });
});

/**
 * 전세사기 피해주택 데이터 적재.
 *
 * 소유자 이름은 저장하지 않는다 — HMAC 키로 변환해 매칭에만 쓴다.
 * MATCH_KEY_PEPPER 가 없으면 동일 소유자 탐지가 비활성화되므로 응답으로 알려준다.
 */
const victimRowSchema = z.object({
  sourceKey: z.string().min(1).max(200),
  roadAddress: z.string().max(300).nullish(),
  jibunAddress: z.string().max(300).nullish(),
  buildingName: z.string().max(200).nullish(),
  sigungu: z.string().max(60).nullish(),
  legalDong: z.string().max(60).nullish(),
  ownerName: z.string().max(100).nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  reportedOn: dateOnly.nullish(),
  caseCount: z.number().int().min(1).max(1000).default(1),
  damageKrw: z.number().int().min(0).nullish(),
});

adminRoute.post(
  "/victim-properties",
  zValidator(
    "json",
    z.object({
      source: z.string().min(1).max(60),
      rows: z.array(victimRowSchema).min(1).max(2000),
    }),
  ),
  async (c) => {
    const { source, rows } = c.req.valid("json");
    if (source === "dev_fixture" && loadEnv().NODE_ENV === "production") {
      throw badRequest("운영 환경에 개발용 더미 데이터를 넣을 수 없습니다.");
    }
    const result = await upsertVictimProperties(source, rows);
    return c.json({
      ...result,
      ownerMatchingEnabled: isOwnerMatchingEnabled(),
      note: isOwnerMatchingEnabled()
        ? undefined
        : "MATCH_KEY_PEPPER 가 없어 동일 소유자 탐지가 비활성화되었습니다.",
    });
  },
);

/** 개발용 더미 데이터 삭제. 운영 DB 정리에 쓴다. */
adminRoute.delete("/victim-properties/dev-fixtures", async (c) => {
  const { adminClient } = await import("../lib/supabase.js");
  const { error, count } = await adminClient()
    .from("victim_properties")
    .delete({ count: "exact" })
    .eq("source", "dev_fixture");
  if (error) throw new Error(`더미 데이터 삭제 실패: ${error.message}`);
  return c.json({ deleted: count ?? 0 });
});

// ---------------------------------------------------------------------------
// 알림 발송 배치
// ---------------------------------------------------------------------------

/**
 * 오늘 보낼 알림 목록.
 *
 * 발송 채널(푸시 · 알림톡)이 붙기 전까지는 이 엔드포인트가 곧 "발송 대상"이다.
 * 채널이 정해지면 배치가 여기서 목록을 받아 보내고 `PATCH .../mark` 로 결과를 기록한다.
 */
adminRoute.get(
  "/notifications/due",
  zValidator(
    "query",
    z.object({
      date: dateOnly.optional(),
      limit: z.coerce.number().int().min(1).max(1000).default(500),
    }),
  ),
  async (c) => {
    const { date, limit } = c.req.valid("query");
    const target = date ?? todayKst();
    const notifications = await findDueNotifications(target, limit);
    return c.json({
      date: target,
      count: notifications.length,
      notifications,
      note: "발송 후 PATCH /v1/admin/notifications/mark 로 상태를 기록하세요.",
    });
  },
);

adminRoute.patch(
  "/notifications/mark",
  zValidator(
    "json",
    z.object({
      ids: z.array(z.string().uuid()).min(1).max(1000),
      status: z.enum(["sent", "skipped", "failed"]),
      errorMessage: z.string().max(500).optional(),
    }),
  ),
  async (c) => {
    const { ids, status, errorMessage } = c.req.valid("json");
    const updated = await markNotifications(ids, status, errorMessage);
    return c.json({ updated, status });
  },
);

/** 서버 재시작으로 고아가 된 분석 작업 정리 */
adminRoute.post(
  "/jobs/reap",
  zValidator(
    "json",
    z.object({ olderThanMinutes: z.number().int().min(1).max(1440).default(15) }).default({
      olderThanMinutes: 15,
    }),
  ),
  async (c) => {
    const { olderThanMinutes } = c.req.valid("json");
    return c.json({ reaped: await reapStaleJobs(olderThanMinutes) });
  },
);
