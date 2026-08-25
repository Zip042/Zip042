import { todayKst, type DateOnly } from "../lib/date.js";
import { log } from "../lib/logger.js";
import { adminClient, type Db } from "../lib/supabase.js";
import { planNotifications, type PlannedNotification } from "../domain/notifications.js";
import type { ScheduleEvent } from "../domain/schedule.js";

/**
 * 알림 발송함 관리.
 *
 * 서버의 책임은 "무엇을 언제 보낼지 정해 쌓아두는 것"까지다. 실제 발송(푸시 · 알림톡)은
 * 채널이 정해진 뒤 붙인다. 이렇게 나눠두면 발송 채널을 바꿔도 산출 로직은 그대로다.
 *
 * 멱등성: `(case_id, event_code, rule_code)` 가 유일하므로 재분석해도 중복이 생기지 않는다.
 * 대신 **일정이 바뀌면 발송일도 바뀌어야** 하므로 upsert 로 갱신한다.
 */

export interface SyncResult {
  planned: number;
  upserted: number;
}

/** 분석 직후 호출한다. 일정 이벤트에서 알림 계획을 만들어 발송함을 갱신한다. */
export async function syncNotifications(
  caseId: string,
  userId: string,
  caseTitle: string | null,
  events: ScheduleEvent[],
  today: DateOnly = todayKst(),
): Promise<SyncResult> {
  const planned = planNotifications({ caseId, caseTitle, events, today });
  if (planned.length === 0) return { planned: 0, upserted: 0 };

  const admin = adminClient();

  // 아직 보내지 않은 알림만 갈아끼운다. 이미 보낸 것을 지우면 같은 알림이 다시 갈 수 있다.
  const { error: delError } = await admin
    .from("notification_outbox")
    .delete()
    .eq("case_id", caseId)
    .eq("status", "pending");
  if (delError) log.warn("기존 알림 정리 실패", { caseId, error: delError.message });

  const { error } = await admin.from("notification_outbox").upsert(
    planned.map((n) => ({
      case_id: caseId,
      user_id: userId,
      event_code: n.eventCode,
      rule_code: n.ruleCode,
      send_on: n.sendOn,
      event_date: n.eventDate,
      severity: n.severity,
      title: n.title,
      body: n.body,
      deep_link: n.deepLink,
      channel: "push",
      status: "pending",
    })),
    { onConflict: "case_id,event_code,rule_code" },
  );
  if (error) {
    log.warn("알림 발송함 갱신 실패", { caseId, error: error.message });
    return { planned: planned.length, upserted: 0 };
  }

  return { planned: planned.length, upserted: planned.length };
}

export interface DueNotification {
  id: string;
  caseId: string;
  userId: string;
  sendOn: DateOnly;
  eventCode: string;
  ruleCode: string;
  severity: string;
  title: string;
  body: string;
  deepLink: string | null;
}

/**
 * 오늘(또는 지정일) 보낼 알림을 가져온다. 발송 배치가 호출한다.
 *
 * `send_on <= date` 로 조회하는 이유: 배치가 하루 쉬어도 밀린 알림이 유실되지 않아야 한다.
 * 단, 일정이 이미 지난 알림은 보내지 않는다(`event_date >= date`).
 */
export async function findDueNotifications(
  date: DateOnly = todayKst(),
  limit = 500,
): Promise<DueNotification[]> {
  const { data, error } = await adminClient()
    .from("notification_outbox")
    .select("id,case_id,user_id,send_on,event_code,rule_code,severity,title,body,deep_link")
    .eq("status", "pending")
    .lte("send_on", date)
    .gte("event_date", date)
    .order("send_on", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`알림 조회: ${error.message}`);

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    caseId: r.case_id as string,
    userId: r.user_id as string,
    sendOn: r.send_on as DateOnly,
    eventCode: r.event_code as string,
    ruleCode: r.rule_code as string,
    severity: r.severity as string,
    title: r.title as string,
    body: r.body as string,
    deepLink: (r.deep_link as string | null) ?? null,
  }));
}

/** 발송 결과를 기록한다. 발송 채널 구현체가 호출한다. */
export async function markNotifications(
  ids: string[],
  status: "sent" | "skipped" | "failed",
  errorMessage?: string,
): Promise<number> {
  if (ids.length === 0) return 0;
  const { data, error } = await adminClient()
    .from("notification_outbox")
    .update({
      status,
      sent_at: status === "sent" ? new Date().toISOString() : null,
      error_message: errorMessage ?? null,
    })
    .in("id", ids)
    .select("id");
  if (error) throw new Error(`알림 상태 갱신: ${error.message}`);
  return (data ?? []).length;
}

/** 사용자별 알림 목록 (앱 내 알림함 화면용) */
export async function listNotifications(
  db: Db,
  userId: string,
  opts: { limit: number; includeSent: boolean },
): Promise<PlannedNotificationRow[]> {
  let query = db
    .from("notification_outbox")
    .select("id,case_id,event_code,rule_code,send_on,event_date,severity,title,body,deep_link,status,sent_at")
    // RLS 와 별개로 소유자를 명시적으로 확인한다 (이중 방어).
    .eq("user_id", userId)
    .order("send_on", { ascending: true })
    .limit(opts.limit);
  if (!opts.includeSent) query = query.eq("status", "pending");

  const { data, error } = await query;
  if (error) throw new Error(`알림 목록 조회: ${error.message}`);
  return (data ?? []) as unknown as PlannedNotificationRow[];
}

export interface PlannedNotificationRow {
  id: string;
  case_id: string;
  event_code: string;
  rule_code: string;
  send_on: string;
  event_date: string;
  severity: string;
  title: string;
  body: string;
  deep_link: string | null;
  status: string;
  sent_at: string | null;
}

export type { PlannedNotification };
