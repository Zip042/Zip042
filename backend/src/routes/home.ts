import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { userClient } from "../lib/supabase.js";
import type { AppBindings } from "../middleware/auth.js";
import { buildHomeSummary, buildUpcomingTimeline } from "../services/home.service.js";
import { listNotifications } from "../services/notification.service.js";

export const homeRoute = new Hono<AppBindings>();

/**
 * 홈 화면 요약 (기획서 3-5 정보 구조).
 * 검사 건 목록 · 최신 판정 · 다가오는 일정 · 알림 배지를 한 번에 준다.
 */
homeRoute.get(
  "/home",
  zValidator(
    "query",
    z.object({
      caseLimit: z.coerce.number().int().min(1).max(50).default(20),
      upcomingLimit: z.coerce.number().int().min(1).max(20).default(5),
    }),
  ),
  async (c) => {
    const { caseLimit, upcomingLimit } = c.req.valid("query");
    const db = userClient(c.get("accessToken"));
    const summary = await buildHomeSummary(db, c.get("user").id, { caseLimit, upcomingLimit });
    return c.json({ home: summary });
  },
);

/** 전체 검사 건의 다가오는 일정 (캘린더 · D-day 화면용) */
homeRoute.get(
  "/timeline/upcoming",
  zValidator("query", z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) })),
  async (c) => {
    const { limit } = c.req.valid("query");
    const db = userClient(c.get("accessToken"));
    return c.json(await buildUpcomingTimeline(db, c.get("user").id, limit));
  },
);

/** 앱 내 알림함. 발송 채널이 붙기 전에도 프론트엔드가 목록을 그릴 수 있다. */
homeRoute.get(
  "/notifications",
  zValidator(
    "query",
    z.object({
      limit: z.coerce.number().int().min(1).max(100).default(30),
      includeSent: z
        .enum(["true", "false"])
        .default("false")
        .transform((v) => v === "true"),
    }),
  ),
  async (c) => {
    const { limit, includeSent } = c.req.valid("query");
    const db = userClient(c.get("accessToken"));
    const rows = await listNotifications(db, c.get("user").id, { limit, includeSent });
    return c.json({
      notifications: rows.map((r) => ({
        id: r.id,
        caseId: r.case_id,
        eventCode: r.event_code,
        ruleCode: r.rule_code,
        sendOn: r.send_on,
        eventDate: r.event_date,
        severity: r.severity,
        title: r.title,
        body: r.body,
        deepLink: r.deep_link,
        status: r.status,
        sentAt: r.sent_at,
      })),
      note: "발송 채널(푸시·알림톡)은 아직 연동되지 않았습니다. 목록은 서버가 계산해 둔 예정 알림입니다.",
    });
  },
);
