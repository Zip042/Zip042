import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { notFound } from "../lib/errors.js";
import { todayKst, type DateOnly } from "../lib/date.js";
import { userClient } from "../lib/supabase.js";
import type { AppBindings } from "../middleware/auth.js";
import { analyzeSchema } from "../schemas/case.js";
import { getLatestAnalysis, runAnalysis } from "../services/analysis.service.js";
import { cancelJob, enqueueAnalysis, getJob, listJobs } from "../services/job.service.js";
import { getCase } from "../services/case.service.js";
import { assertOwnership } from "./cases.js";

const caseParam = z.object({ caseId: z.string().uuid() });

export const analysisRoute = new Hono<AppBindings>();

/**
 * 전체 분석 실행.
 *
 * 동기 응답이다. 문서 판독(AI 호출)이 포함되면 문서 수에 따라 20~60초가 걸릴 수 있다.
 * 프론트엔드는 넉넉한 타임아웃(90초 이상)을 두고, 진행 표시를 보여줄 것.
 * (문서가 이미 판독된 상태라면 규칙 엔진만 돌아 1초 이내에 끝난다.)
 */
analysisRoute.post(
  "/:caseId/analyze",
  zValidator("param", caseParam),
  zValidator("json", analyzeSchema),
  async (c) => {
    const { caseId } = c.req.valid("param");
    const { refreshMarketPrice, reparseDocuments } = c.req.valid("json");
    const db = await assertOwnership(c.get("accessToken"), caseId);

    const result = await runAnalysis(db, caseId, { refreshMarketPrice, reparseDocuments });
    return c.json({ analysis: result });
  },
);

/**
 * 비동기 분석 — 작업을 등록하고 즉시 202 로 반환한다.
 *
 * 문서 판독이 20~60초 걸리는 경우, 동기 호출은 모바일 네트워크가 끊기면 결과를 잃는다.
 * 이 경로는 연결이 끊겨도 다시 붙어 결과를 받을 수 있다.
 *
 * 사용법
 *   1. POST /analyze/jobs         → 202 { job: { id, status: "queued" } }
 *   2. GET  /analyze/jobs/{jobId} → 진행률 폴링 (2~3초 간격 권장)
 *   3. status === "succeeded"     → GET /analysis 로 결과 조회
 *
 * 같은 검사 건에 이미 진행 중인 작업이 있으면 새로 만들지 않고 그 작업을 돌려준다(멱등).
 *
 * ⚠️ 서버리스(Vercel)에서는 응답 후 백그라운드 실행이 보장되지 않는다.
 *    그 환경에서는 동기 경로(POST /analyze)를 쓰거나 waitUntil() 연동이 필요하다.
 *    `GET /v1/meta` 의 `capabilities.asyncAnalysis` 로 확인할 수 있다.
 */
analysisRoute.post(
  "/:caseId/analyze/jobs",
  zValidator("param", caseParam),
  zValidator("json", analyzeSchema),
  async (c) => {
    const { caseId } = c.req.valid("param");
    const options = c.req.valid("json");
    const db = await assertOwnership(c.get("accessToken"), caseId);

    const { job, reused } = await enqueueAnalysis(db, caseId, c.get("user").id, options);
    return c.json(
      {
        job,
        reused,
        poll: {
          endpoint: `GET /v1/cases/${caseId}/analyze/jobs/${job.id}`,
          intervalMs: 2500,
          resultEndpoint: `GET /v1/cases/${caseId}/analysis`,
        },
      },
      reused ? 200 : 202,
    );
  },
);

analysisRoute.get(
  "/:caseId/analyze/jobs/:jobId",
  zValidator("param", caseParam.extend({ jobId: z.string().uuid() })),
  async (c) => {
    const { caseId, jobId } = c.req.valid("param");
    const db = await assertOwnership(c.get("accessToken"), caseId);
    const job = await getJob(db, caseId, jobId);
    return c.json({
      job,
      resultEndpoint:
        job.status === "succeeded" ? `GET /v1/cases/${caseId}/analysis` : undefined,
    });
  },
);

analysisRoute.get("/:caseId/analyze/jobs", zValidator("param", caseParam), async (c) => {
  const { caseId } = c.req.valid("param");
  const db = await assertOwnership(c.get("accessToken"), caseId);
  return c.json({ jobs: await listJobs(db, caseId) });
});

analysisRoute.delete(
  "/:caseId/analyze/jobs/:jobId",
  zValidator("param", caseParam.extend({ jobId: z.string().uuid() })),
  async (c) => {
    const { caseId, jobId } = c.req.valid("param");
    await assertOwnership(c.get("accessToken"), caseId);
    return c.json({ job: await cancelJob(caseId, jobId) });
  },
);

/** 저장된 최신 결과 조회. 재계산하지 않으므로 화면 재진입 시 이 쪽을 쓴다. */
analysisRoute.get("/:caseId/analysis", zValidator("param", caseParam), async (c) => {
  const { caseId } = c.req.valid("param");
  const db = await assertOwnership(c.get("accessToken"), caseId);
  const analysis = await getLatestAnalysis(db, caseId);
  if (!analysis) {
    throw notFound("아직 분석 결과가 없습니다. POST /v1/cases/{caseId}/analyze 를 먼저 호출하세요.");
  }
  return c.json({ analysis });
});

/** 분석 이력 목록 (규칙 버전 비교 · 변경 추적용) */
analysisRoute.get("/:caseId/analyses", zValidator("param", caseParam), async (c) => {
  const { caseId } = c.req.valid("param");
  const db = await assertOwnership(c.get("accessToken"), caseId);
  const { data, error } = await db
    .from("analyses")
    .select("version,rules_version,verdict,score,contractable,headline,created_at")
    .eq("case_id", caseId)
    .order("version", { ascending: false });
  if (error) throw new Error(`분석 이력 조회: ${error.message}`);
  return c.json({ analyses: data ?? [] });
});

/** 저장된 일정 타임라인 (D-day 알림 · 캘린더 화면용) */
analysisRoute.get("/:caseId/timeline", zValidator("param", caseParam), async (c) => {
  const { caseId } = c.req.valid("param");
  const db = userClient(c.get("accessToken"));
  const row = await getCase(db, caseId);
  const today = todayKst();

  const { data, error } = await db
    .from("schedule_events")
    .select("code,event_date,effective_at,severity,title,description,checklist,sort_order")
    .eq("case_id", caseId)
    .order("event_date", { ascending: true });
  if (error) throw new Error(`타임라인 조회: ${error.message}`);

  const events = (data ?? []).map((e) => {
    const eventDate = e.event_date as DateOnly;
    return {
      code: e.code,
      date: eventDate,
      effectiveAt: e.effective_at,
      severity: e.severity,
      title: e.title,
      description: e.description,
      checklist: e.checklist,
      dDay: Math.round(
        (Date.parse(`${eventDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
      ),
    };
  });

  return c.json({
    caseId: row.id,
    today,
    events,
    upcoming: events.filter((e) => e.dDay >= 0).slice(0, 3),
  });
});
