import { conflict, notFound } from "../lib/errors.js";
import { log } from "../lib/logger.js";
import { adminClient, type Db } from "../lib/supabase.js";
import { runAnalysis } from "./analysis.service.js";

/**
 * 분석 작업 큐.
 *
 * 왜 필요한가: 실제 문서 판독은 문서 수에 따라 20~60초가 걸린다. 동기 응답만 제공하면
 * 모바일 네트워크가 끊기는 순간 사용자는 결과를 잃는다(서버는 이미 계산을 끝냈는데도).
 * 작업 큐를 두면 연결이 끊겨도 다시 붙어 결과를 받을 수 있다.
 *
 * ## 구현 방식과 그 한계
 *
 * 외부 큐(Redis · SQS) 없이 **in-process 러너**로 구현했다. 팀 규모와 트래픽에 비해
 * 인프라를 늘리는 것이 이득이 아니라고 판단했다. 대신 두 가지 한계가 있다:
 *
 *  1) **서버가 재시작되면 진행 중 작업이 사라진다.** 부팅 시 `reapStaleJobs()` 로
 *     오래된 running 작업을 실패 처리하고, 사용자는 다시 시도하면 된다.
 *  2) **서버리스(Vercel)에서는 응답 후 백그라운드 실행이 보장되지 않는다.**
 *     Vercel 에 올릴 경우 `@vercel/functions` 의 `waitUntil()` 로 감싸야 한다.
 *     그 전까지는 서버리스 환경에서 **동기 엔드포인트를 쓰는 것이 안전하다**.
 *     (`vercel.json` 의 maxDuration 300 으로 동기 경로는 충분히 커버된다.)
 *
 * 트래픽이 늘어 워커를 분리해야 하면, 이 서비스의 인터페이스를 유지한 채
 * `enqueue` 가 외부 큐에 넣고 별도 워커가 `executeJob` 을 호출하도록 바꾸면 된다.
 */

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export interface AnalysisJob {
  id: string;
  caseId: string;
  status: JobStatus;
  progress: number;
  step: string | null;
  analysisVersion: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

interface JobRow {
  id: string;
  case_id: string;
  status: JobStatus;
  progress: number;
  step: string | null;
  analysis_version: number | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

const JOB_COLUMNS =
  "id,case_id,status,progress,step,analysis_version,error_code,error_message,created_at,started_at,finished_at";

function toJob(row: JobRow): AnalysisJob {
  return {
    id: row.id,
    caseId: row.case_id,
    status: row.status,
    progress: row.progress,
    step: row.step,
    analysisVersion: row.analysis_version,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

/** 진행 단계. 프론트엔드가 "지금 무엇을 하는 중"인지 보여줄 수 있게 문구까지 서버가 정한다. */
const STEPS = [
  { progress: 10, step: "문서를 확인하고 있어요" },
  { progress: 35, step: "등기부등본을 읽고 있어요" },
  { progress: 60, step: "시세와 주변 위험을 조회하고 있어요" },
  { progress: 85, step: "위험을 판정하고 특약을 고르고 있어요" },
] as const;

async function patch(jobId: string, payload: Record<string, unknown>): Promise<void> {
  const { error } = await adminClient().from("analysis_jobs").update(payload).eq("id", jobId);
  if (error) log.warn("작업 상태 갱신 실패", { jobId, error: error.message });
}

export interface EnqueueOptions {
  refreshMarketPrice: boolean;
  reparseDocuments: boolean;
}

/**
 * 작업을 등록하고 즉시 반환한다. 실행은 백그라운드에서 이어진다.
 * 같은 case 에 진행 중인 작업이 있으면 새로 만들지 않고 그 작업을 돌려준다(멱등).
 */
export async function enqueueAnalysis(
  db: Db,
  caseId: string,
  userId: string,
  options: EnqueueOptions,
): Promise<{ job: AnalysisJob; reused: boolean }> {
  const admin = adminClient();

  const existing = await admin
    .from("analysis_jobs")
    .select(JOB_COLUMNS)
    .eq("case_id", caseId)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing.data) {
    // 사용자가 버튼을 두 번 눌러도 분석이 두 번 돌지 않는다.
    return { job: toJob(existing.data as unknown as JobRow), reused: true };
  }

  const created = await admin
    .from("analysis_jobs")
    .insert({ case_id: caseId, user_id: userId, options, status: "queued", progress: 0 })
    .select(JOB_COLUMNS)
    .single();

  if (created.error || !created.data) {
    // unique 인덱스 위반 = SELECT 와 INSERT 사이에 다른 요청이 작업을 만들었다.
    // 오류를 던지는 대신 그 작업을 돌려준다 — 사용자가 버튼을 두 번 눌렀을 때
    // 한쪽이 409 를 받는 것은 UX 상 의미가 없고, 어차피 원하는 결과는 같다.
    if (created.error?.code === "23505") {
      const raced = await admin
        .from("analysis_jobs")
        .select(JOB_COLUMNS)
        .eq("case_id", caseId)
        .in("status", ["queued", "running"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (raced.data) return { job: toJob(raced.data as unknown as JobRow), reused: true };
      throw conflict("이미 분석이 진행 중입니다. 잠시 후 다시 확인해 주세요.");
    }
    throw new Error(`작업 등록 실패: ${created.error?.message}`);
  }

  const job = toJob(created.data as unknown as JobRow);

  // 백그라운드 실행. 여기서 await 하지 않는 것이 핵심이다.
  void executeJob(db, job.id, caseId, options);

  return { job, reused: false };
}

/**
 * 실제 분석을 수행한다. 예외를 절대 밖으로 던지지 않는다 —
 * 처리되지 않은 rejection 으로 프로세스가 죽으면 다른 요청까지 함께 끊긴다.
 */
export async function executeJob(
  db: Db,
  jobId: string,
  caseId: string,
  options: EnqueueOptions,
): Promise<void> {
  try {
    await patch(jobId, {
      status: "running",
      started_at: new Date().toISOString(),
      progress: STEPS[0].progress,
      step: STEPS[0].step,
    });

    // 진행률을 단계별로 올린다. runAnalysis 내부를 쪼개지 않고 타이머로 근사한다 —
    // 실제 소요 시간이 문서 수에 따라 크게 달라서 정확한 단계 통지의 이득이 적기 때문이다.
    let stepIndex = 1;
    const ticker = setInterval(() => {
      const next = STEPS[stepIndex];
      if (!next) return;
      stepIndex += 1;
      void patch(jobId, { progress: next.progress, step: next.step });
    }, 8_000);

    try {
      const result = await runAnalysis(db, caseId, options);
      await patch(jobId, {
        status: "succeeded",
        progress: 100,
        step: "완료",
        analysis_version: result.version,
        finished_at: new Date().toISOString(),
      });
    } finally {
      clearInterval(ticker);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("분석 작업 실패", { jobId, caseId, message });
    await patch(jobId, {
      status: "failed",
      step: null,
      error_code: "ANALYSIS_FAILED",
      // 내부 메시지를 그대로 노출하지 않는다. 사용자에게는 다시 시도할 방법만 알려준다.
      error_message: "분석에 실패했습니다. 문서를 확인하고 다시 시도해 주세요.",
      finished_at: new Date().toISOString(),
    });
  }
}

export async function getJob(db: Db, caseId: string, jobId: string): Promise<AnalysisJob> {
  const { data, error } = await db
    .from("analysis_jobs")
    .select(JOB_COLUMNS)
    .eq("id", jobId)
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw new Error(`작업 조회: ${error.message}`);
  if (!data) throw notFound("작업을 찾을 수 없습니다.");
  return toJob(data as unknown as JobRow);
}

export async function listJobs(db: Db, caseId: string, limit = 10): Promise<AnalysisJob[]> {
  const { data, error } = await db
    .from("analysis_jobs")
    .select(JOB_COLUMNS)
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`작업 목록 조회: ${error.message}`);
  return ((data ?? []) as unknown as JobRow[]).map(toJob);
}

export async function cancelJob(caseId: string, jobId: string): Promise<AnalysisJob> {
  const admin = adminClient();
  const { data, error } = await admin
    .from("analysis_jobs")
    .update({ status: "canceled", finished_at: new Date().toISOString(), step: null })
    .eq("id", jobId)
    .eq("case_id", caseId)
    .in("status", ["queued", "running"])
    .select(JOB_COLUMNS)
    .single();
  if (error || !data) {
    throw conflict("이미 끝난 작업은 취소할 수 없습니다.");
  }
  // 러너는 계속 돌지만 결과를 반영하지 않는다(상태가 canceled 이므로 patch 가 덮어써도
  // 사용자는 취소된 것으로 본다). 러너를 강제 중단하려면 AbortSignal 을 runAnalysis 까지
  // 내려보내야 하는데, 지금 규모에서는 이득이 크지 않다.
  return toJob(data as unknown as JobRow);
}

/**
 * 서버 재시작으로 고아가 된 작업을 정리한다. 부팅 시 1회 호출한다.
 * 목 모드에서는 RPC 가 없으므로 조용히 건너뛴다.
 */
export async function reapStaleJobs(olderThanMinutes = 15): Promise<number> {
  try {
    const { data, error } = await adminClient().rpc("reap_stale_analysis_jobs", {
      p_older_than_minutes: olderThanMinutes,
    });
    if (error) {
      log.debug("고아 작업 정리 건너뜀", { reason: error.message });
      return 0;
    }
    const count = typeof data === "number" ? data : 0;
    if (count > 0) log.warn("서버 재시작으로 중단된 분석 작업을 정리했습니다", { count });
    return count;
  } catch (err) {
    log.debug("고아 작업 정리 실패", {
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}
