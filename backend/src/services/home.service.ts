import { todayKst, type DateOnly } from "../lib/date.js";
import { log } from "../lib/logger.js";
import { adminClient, type Db } from "../lib/supabase.js";
import { upcomingEvents, type UpcomingEvent } from "../domain/notifications.js";
import { RISK_LABEL_KO, type RiskLevel } from "../domain/types.js";
import type { ScheduleEvent } from "../domain/schedule.js";

/**
 * 홈 화면 요약 (기획서 3-5 정보 구조).
 *
 * 기획서는 홈을 "업로드 → 위험 요약 → 지역 위험 지도 → 특약 추천" 순으로 배치하라고 정했다.
 * 프론트엔드가 그 화면을 그리려면 검사 건마다 분석 결과를 따로 조회해야 하는데,
 * 검사 건이 3개면 요청이 7번 나간다. 서버가 한 번에 조립해 주는 편이 맞다.
 */

export interface HomeCaseSummary {
  caseId: string;
  title: string | null;
  roadAddress: string | null;
  detailAddress: string | null;
  status: string;
  depositKrw: number;
  monthlyRentKrw: number;
  /** 분석을 아직 돌리지 않았으면 null */
  verdict: RiskLevel | null;
  verdictLabel: string | null;
  score: number | null;
  contractable: boolean | null;
  headline: string | null;
  /** 확인이 필요해 판정을 완료하지 못한 항목 수 */
  blockingGapCount: number;
  analysisVersion: number | null;
  analyzedAt: string | null;
  /** 다음에 해야 할 일 (없으면 null) */
  nextAction: string | null;
  updatedAt: string;
}

export interface HomeSummary {
  today: DateOnly;
  counts: {
    total: number;
    analyzed: number;
    needsAnalysis: number;
    byVerdict: Record<RiskLevel, number>;
    /** 계약을 권하지 않는 검사 건 수 */
    notContractable: number;
  };
  cases: HomeCaseSummary[];
  upcoming: UpcomingEvent[];
  notifications: {
    /** 오늘 기준 발송 시점이 된 알림 수. **배지에 쓸 값**은 이쪽이다. */
    due: number;
    /** 앞으로 보낼 예정인 알림 전체 수 (알림함 목록 길이) */
    pending: number;
  };
}

interface CaseRowLite {
  id: string;
  title: string | null;
  road_address: string | null;
  detail_address: string | null;
  status: string;
  deposit_krw: number;
  monthly_rent_krw: number;
  updated_at: string;
}

interface AnalysisRowLite {
  case_id: string;
  version: number;
  verdict: RiskLevel;
  score: number;
  contractable: boolean;
  headline: string;
  payload: Record<string, unknown>;
  created_at: string;
}

/**
 * 다음에 할 일 한 줄. 사용자가 홈에서 바로 무엇을 눌러야 하는지 알려준다.
 * 순서가 곧 우선순위다 — 분석 전이면 분석부터, 확인 항목이 있으면 그것부터.
 */
function nextActionFor(
  analysis: AnalysisRowLite | undefined,
  hasDocuments: boolean,
  blockingGapCount: number,
): string | null {
  if (!hasDocuments) return "등기부등본을 올려 점검을 시작하세요";
  if (!analysis) return "분석을 실행해 위험을 확인하세요";
  if (blockingGapCount > 0) return "확인이 필요한 항목이 있어요";
  if (!analysis.contractable) return "계약을 진행하기 전에 위험 항목을 해결하세요";
  return "추천 특약을 계약서에 반영하세요";
}

export async function buildHomeSummary(
  db: Db,
  userId: string,
  opts: { caseLimit: number; upcomingLimit: number } = { caseLimit: 20, upcomingLimit: 5 },
): Promise<HomeSummary> {
  const today = todayKst();

  const { data: caseData, error: caseError } = await db
    .from("cases")
    .select("id,title,road_address,detail_address,status,deposit_krw,monthly_rent_krw,updated_at")
    // RLS 에만 의존하지 않는다 — 이 경로에 service_role 이 전달되면 전체 사용자 데이터가 새어나간다.
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(opts.caseLimit);
  if (caseError) throw new Error(`홈 요약 - 검사 건 조회: ${caseError.message}`);

  const cases = (caseData ?? []) as unknown as CaseRowLite[];
  if (cases.length === 0) {
    return {
      today,
      counts: {
        total: 0,
        analyzed: 0,
        needsAnalysis: 0,
        byVerdict: { safe: 0, caution: 0, danger: 0, critical: 0 },
        notContractable: 0,
      },
      cases: [],
      upcoming: [],
      notifications: { due: 0, pending: 0 },
    };
  }

  const caseIds = cases.map((c) => c.id);

  // 최신 분석 · 일정 · 문서 · 알림을 한 번에 긁어온다 (검사 건마다 왕복하지 않는다).
  const [analysesRes, eventsRes, docsRes, notifRes] = await Promise.all([
    db
      .from("analyses")
      .select("case_id,version,verdict,score,contractable,headline,payload,created_at")
      .in("case_id", caseIds)
      .order("version", { ascending: false }),
    db
      .from("schedule_events")
      .select("case_id,code,event_date,effective_at,severity,title,description,checklist,sort_order")
      .in("case_id", caseIds)
      .gte("event_date", today)
      .order("event_date", { ascending: true }),
    db.from("documents").select("case_id").in("case_id", caseIds),
    db
      .from("notification_outbox")
      .select("id,send_on")
      .in("case_id", caseIds)
      .eq("status", "pending"),
  ]);

  if (analysesRes.error) log.warn("홈 요약 - 분석 조회 실패", { error: analysesRes.error.message });

  // 같은 case 의 여러 버전 중 최신만 남긴다 (version 내림차순으로 정렬돼 있다).
  const latestByCase = new Map<string, AnalysisRowLite>();
  for (const row of (analysesRes.data ?? []) as unknown as AnalysisRowLite[]) {
    if (!latestByCase.has(row.case_id)) latestByCase.set(row.case_id, row);
  }

  const eventsByCase = new Map<string, ScheduleEvent[]>();
  for (const row of (eventsRes.data ?? []) as unknown as Record<string, unknown>[]) {
    const caseId = row.case_id as string;
    const list = eventsByCase.get(caseId) ?? [];
    list.push({
      code: row.code as string,
      date: row.event_date as DateOnly,
      effectiveAt: (row.effective_at as string | null) ?? null,
      severity: row.severity as RiskLevel,
      title: row.title as string,
      description: row.description as string,
      checklist: (row.checklist as ScheduleEvent["checklist"]) ?? [],
      dDay: null,
      sortOrder: (row.sort_order as number) ?? 0,
    });
    eventsByCase.set(caseId, list);
  }

  const docCounts = new Set(
    ((docsRes.data ?? []) as unknown as { case_id: string }[]).map((d) => d.case_id),
  );

  const byVerdict: Record<RiskLevel, number> = { safe: 0, caution: 0, danger: 0, critical: 0 };
  let notContractable = 0;

  const summaries: HomeCaseSummary[] = cases.map((c) => {
    const analysis = latestByCase.get(c.id);
    const blockingGapCount = countBlockingGaps(analysis);

    if (analysis) {
      byVerdict[analysis.verdict] += 1;
      if (!analysis.contractable) notContractable += 1;
    }

    return {
      caseId: c.id,
      title: c.title,
      roadAddress: c.road_address,
      detailAddress: c.detail_address,
      status: c.status,
      depositKrw: c.deposit_krw,
      monthlyRentKrw: c.monthly_rent_krw,
      verdict: analysis?.verdict ?? null,
      verdictLabel: analysis ? RISK_LABEL_KO[analysis.verdict] : null,
      score: analysis?.score ?? null,
      contractable: analysis?.contractable ?? null,
      headline: analysis?.headline ?? null,
      blockingGapCount,
      analysisVersion: analysis?.version ?? null,
      analyzedAt: analysis?.created_at ?? null,
      nextAction: nextActionFor(analysis, docCounts.has(c.id), blockingGapCount),
      updatedAt: c.updated_at,
    };
  });

  const upcoming = upcomingEvents(
    cases.map((c) => ({
      caseId: c.id,
      caseTitle: c.title,
      events: eventsByCase.get(c.id) ?? [],
    })),
    today,
    opts.upcomingLimit,
  );

  return {
    today,
    counts: {
      total: cases.length,
      analyzed: latestByCase.size,
      needsAnalysis: cases.length - latestByCase.size,
      byVerdict,
      notContractable,
    },
    cases: summaries,
    upcoming,
    notifications: countNotifications(notifRes.data, today),
  };
}

/**
 * 알림 수를 두 가지로 센다.
 *
 * `due` 는 "오늘 보낼 것", `pending` 은 "앞으로 보낼 것 전체"다. 둘을 하나로 합치면
 * 배지에 13이 떠 있는데 정작 오늘 할 일은 없는 상황이 생기고, 사용자는 배지를 무시하게 된다.
 */
function countNotifications(
  rows: unknown,
  today: DateOnly,
): { due: number; pending: number } {
  const list = (rows ?? []) as { send_on: string }[];
  return {
    due: list.filter((r) => r.send_on <= today).length,
    pending: list.length,
  };
}

/** 저장된 payload 에서 판정 차단 항목 수를 읽는다. 구버전 payload 에는 없을 수 있다. */
function countBlockingGaps(analysis: AnalysisRowLite | undefined): number {
  if (!analysis) return 0;
  const verdict = analysis.payload?.verdict as { blockingGaps?: unknown[] } | undefined;
  if (Array.isArray(verdict?.blockingGaps)) return verdict.blockingGaps.length;
  return 0;
}

/** 전체 검사 건의 다가오는 일정만 따로 (캘린더 화면용) */
export async function buildUpcomingTimeline(
  db: Db,
  userId: string,
  limit: number,
): Promise<{ today: DateOnly; events: UpcomingEvent[] }> {
  const today = todayKst();
  const { data: caseData, error } = await db.from("cases").select("id,title").eq("user_id", userId);
  if (error) throw new Error(`일정 조회 - 검사 건: ${error.message}`);

  const cases = (caseData ?? []) as unknown as { id: string; title: string | null }[];
  if (cases.length === 0) return { today, events: [] };

  const { data: eventData, error: eventError } = await db
    .from("schedule_events")
    .select("case_id,code,event_date,effective_at,severity,title,description,checklist,sort_order")
    .in("case_id", cases.map((c) => c.id))
    .gte("event_date", today)
    .order("event_date", { ascending: true });
  if (eventError) throw new Error(`일정 조회: ${eventError.message}`);

  const byCase = new Map<string, ScheduleEvent[]>();
  for (const row of (eventData ?? []) as unknown as Record<string, unknown>[]) {
    const caseId = row.case_id as string;
    const list = byCase.get(caseId) ?? [];
    list.push({
      code: row.code as string,
      date: row.event_date as DateOnly,
      effectiveAt: (row.effective_at as string | null) ?? null,
      severity: row.severity as RiskLevel,
      title: row.title as string,
      description: row.description as string,
      checklist: (row.checklist as ScheduleEvent["checklist"]) ?? [],
      dDay: null,
      sortOrder: (row.sort_order as number) ?? 0,
    });
    byCase.set(caseId, list);
  }

  return {
    today,
    events: upcomingEvents(
      cases.map((c) => ({ caseId: c.id, caseTitle: c.title, events: byCase.get(c.id) ?? [] })),
      today,
      limit,
    ),
  };
}
