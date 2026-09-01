import { addDays, diffDays, formatKo, isAfter, type DateOnly } from "../lib/date.js";
import type { RiskLevel } from "./types.js";
import type { ScheduleEvent } from "./schedule.js";

/**
 * 일정 알림 산출.
 *
 * 이 서비스에서 알림은 부가 기능이 아니다. 보증금을 지키는 행동(전입신고 · 확정일자 ·
 * 등기부 재열람)은 **특정 날짜에 하지 않으면 의미가 없기** 때문에, 제때 알려주는 것이
 * 판정만큼 중요하다.
 *
 * 설계
 *  - 순수 함수다. "무엇을 언제 보낼지"만 계산하고 발송은 하지 않는다.
 *  - 결과는 발송함(notification_outbox)에 쌓이고, 발송 채널은 나중에 붙인다.
 *  - `(case, event_code, rule_code)` 가 고유하므로 재분석해도 중복 생성되지 않는다.
 */

export type NotificationRuleCode =
  | "D_MINUS_7"
  | "D_MINUS_3"
  | "D_MINUS_1"
  | "D_DAY"
  | "D_PLUS_1"
  | "OVERDUE";

interface RuleDefinition {
  code: NotificationRuleCode;
  /** 이벤트 날짜 기준 오프셋 (일). -1 이면 하루 전 */
  offsetDays: number;
  label: string;
}

/**
 * 이벤트 코드별 알림 규칙.
 *
 * 모든 일정에 D-7부터 알림을 보내면 사용자는 알림을 끈다. 그러면 정작 중요한
 * 잔금일 알림도 못 받는다. 그래서 **놓치면 되돌릴 수 없는 일정에만** 촘촘히 보낸다.
 */
const RULES_BY_EVENT: Record<string, RuleDefinition[]> = {
  // 계약 당일 — 확정일자를 이날 받아야 가장 안전하다.
  CONTRACT_DAY: [
    { code: "D_MINUS_1", offsetDays: -1, label: "내일" },
    { code: "D_DAY", offsetDays: 0, label: "오늘" },
  ],
  CONFIRMED_DATE: [{ code: "D_DAY", offsetDays: 0, label: "오늘" }],

  // 잔금일 — 이 서비스에서 가장 중요한 날. 놓치면 되돌릴 수 없다.
  REGISTRY_RECHECK_BEFORE_BALANCE: [{ code: "D_DAY", offsetDays: 0, label: "오늘" }],
  BALANCE_DAY: [
    { code: "D_MINUS_3", offsetDays: -3, label: "3일 뒤" },
    { code: "D_MINUS_1", offsetDays: -1, label: "내일" },
    { code: "D_DAY", offsetDays: 0, label: "오늘" },
  ],

  // 전입신고를 늦게 잡은 경우에만 생성되는 이벤트
  RESIDENT_REGISTRATION: [
    { code: "D_MINUS_1", offsetDays: -1, label: "내일" },
    { code: "D_DAY", offsetDays: 0, label: "오늘" },
  ],

  // 보호 시작 직후 등기부 최종 확인 — 여기서 문제를 발견하면 특약으로 구제받을 수 있다.
  REGISTRY_RECHECK_AFTER_PROTECTION: [{ code: "D_DAY", offsetDays: 0, label: "오늘" }],

  RESIDENT_REGISTRATION_DEADLINE: [{ code: "D_MINUS_3", offsetDays: -3, label: "3일 뒤" }],

  // 계약 만료 관련 — 통지 기한을 놓치면 보증금을 제때 못 받는다.
  RENEWAL_NOTICE_WINDOW_OPEN: [{ code: "D_DAY", offsetDays: 0, label: "오늘" }],
  RENEWAL_NOTICE_WINDOW_CLOSE: [
    { code: "D_MINUS_7", offsetDays: -7, label: "일주일 뒤" },
    { code: "D_MINUS_1", offsetDays: -1, label: "내일" },
  ],
  TERM_END: [{ code: "D_MINUS_7", offsetDays: -7, label: "일주일 뒤" }],
};

/** 대항력 발생은 사용자가 할 일이 없으므로 알림하지 않는다 (안심 알림 1건만). */
const INFORMATIONAL_EVENTS = new Set(["PROTECTION_EFFECTIVE"]);

export interface PlannedNotification {
  eventCode: string;
  ruleCode: NotificationRuleCode;
  /** 이 날짜에 발송한다 (KST) */
  sendOn: DateOnly;
  eventDate: DateOnly;
  severity: RiskLevel;
  title: string;
  body: string;
  deepLink: string;
}

export interface PlanNotificationsInput {
  caseId: string;
  caseTitle: string | null;
  events: ScheduleEvent[];
  today: DateOnly;
  /** 과거 일정에 대한 알림은 만들지 않는다. 테스트를 위해 주입 가능. */
  includePast?: boolean;
}

function bodyFor(event: ScheduleEvent, rule: RuleDefinition): string {
  const critical = event.checklist.filter((c) => c.critical);
  const head =
    rule.offsetDays === 0
      ? `오늘은 ${event.title} 입니다.`
      : `${formatKo(addDays(event.date, rule.offsetDays))} 기준 ${rule.label}이 ${event.title} 입니다.`;

  if (critical.length === 0) return head;
  // 알림에 체크리스트를 다 넣으면 읽지 않는다. 반드시 해야 할 것 2개까지만.
  const items = critical.slice(0, 2).map((c) => `· ${c.label}`);
  return `${head}\n${items.join("\n")}`;
}

export function planNotifications(input: PlanNotificationsInput): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  const prefix = input.caseTitle ? `[${input.caseTitle}] ` : "";

  for (const event of input.events) {
    if (INFORMATIONAL_EVENTS.has(event.code)) continue;
    const rules = RULES_BY_EVENT[event.code];
    if (!rules) continue;

    for (const rule of rules) {
      const sendOn = addDays(event.date, rule.offsetDays);
      // 이미 지난 날짜에 보낼 알림은 만들지 않는다.
      if (!input.includePast && isAfter(input.today, sendOn)) continue;

      out.push({
        eventCode: event.code,
        ruleCode: rule.code,
        sendOn,
        eventDate: event.date,
        // 일정 자체의 위험도를 그대로 쓴다 (휴일 잔금일 등은 severity 가 높다).
        severity: event.severity,
        title: `${prefix}${rule.offsetDays === 0 ? "오늘" : rule.label}: ${event.title}`,
        body: bodyFor(event, rule),
        deepLink: `zip042://cases/${input.caseId}/timeline?event=${event.code}`,
      });
    }
  }

  // 같은 날 같은 이벤트에 규칙이 겹치면(짧은 일정) 가장 임박한 것만 남긴다.
  const seen = new Map<string, PlannedNotification>();
  for (const n of out) {
    const key = `${n.eventCode}|${n.sendOn}`;
    const existing = seen.get(key);
    if (!existing || Math.abs(diffDays(n.sendOn, n.eventDate)) < Math.abs(diffDays(existing.sendOn, existing.eventDate))) {
      seen.set(key, n);
    }
  }

  return [...seen.values()].sort((a, b) => (a.sendOn < b.sendOn ? -1 : a.sendOn > b.sendOn ? 1 : 0));
}

/** 특정 날짜에 발송할 알림만 골라낸다 (배치 실행용). */
export function dueOn(notifications: PlannedNotification[], date: DateOnly): PlannedNotification[] {
  return notifications.filter((n) => n.sendOn === date);
}

/**
 * 사용자 홈 화면용 "다가오는 일정" 요약.
 * 알림과 달리 규칙에 걸리지 않은 일정도 포함하고, 지난 일정은 제외한다.
 */
export interface UpcomingEvent {
  caseId: string;
  caseTitle: string | null;
  code: string;
  date: DateOnly;
  dDay: number;
  /** 같은 날짜 안에서의 순서 (일정 엔진이 정한 순서) */
  sortOrder: number;
  severity: RiskLevel;
  title: string;
  /** 반드시 해야 할 항목만 추린 목록 */
  criticalChecklist: string[];
}

export function upcomingEvents(
  cases: { caseId: string; caseTitle: string | null; events: ScheduleEvent[] }[],
  today: DateOnly,
  limit = 5,
): UpcomingEvent[] {
  const out: UpcomingEvent[] = [];
  for (const c of cases) {
    for (const event of c.events) {
      const dDay = diffDays(today, event.date);
      if (dDay < 0) continue;
      out.push({
        caseId: c.caseId,
        caseTitle: c.caseTitle,
        code: event.code,
        date: event.date,
        dDay,
        sortOrder: event.sortOrder,
        severity: event.severity,
        title: event.title,
        criticalChecklist: event.checklist.filter((i) => i.critical).map((i) => i.label),
      });
    }
  }
  // 같은 날짜면 일정 자체의 순서를 따른다 (계약 → 확정일자 → 잔금 → 보호 시작).
  // 알파벳 순으로 두면 홈 화면에서 순서가 뒤바뀐다.
  return out.sort((a, b) => a.dDay - b.dDay || a.sortOrder - b.sortOrder).slice(0, limit);
}
