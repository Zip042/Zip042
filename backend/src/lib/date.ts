/**
 * 날짜 유틸 — 전부 `YYYY-MM-DD` 문자열 기반.
 *
 * 왜 Date 객체를 쓰지 않는가:
 *  이 서비스의 일정 계산은 "전입신고 다음날 0시" 같은 **한국 시간대 기준 날짜 경계**가 핵심이다.
 *  서버가 어느 타임존에서 돌든 결과가 같아야 하므로, 달력 계산은 문자열/정수로만 하고
 *  타임존은 `kstInstant()` 로 tzdb 없이 고정 오프셋(+09:00)으로 변환한다.
 *  (대한민국은 1988년 이후 DST가 없으므로 고정 오프셋이 안전하다.)
 */

export type DateOnly = string; // 'YYYY-MM-DD'

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;
export const KST_OFFSET = "+09:00";

export function isDateOnly(value: unknown): value is DateOnly {
  if (typeof value !== "string") return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  // 2026-02-31 처럼 존재하지 않는 날짜를 걸러낸다.
  return (
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(mo) - 1 &&
    date.getUTCDate() === Number(d)
  );
}

function assertDateOnly(value: string, label = "날짜"): DateOnly {
  if (!isDateOnly(value)) {
    throw new TypeError(`${label} 형식이 올바르지 않습니다: ${value} (YYYY-MM-DD)`);
  }
  return value;
}

/** 날짜 문자열을 UTC 자정 기준 epoch ms 로. 달력 산술에만 쓴다. */
function toUtcMidnight(value: DateOnly): number {
  const [y, m, d] = assertDateOnly(value).split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

function fromUtcMidnight(ms: number): DateOnly {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(value: DateOnly, days: number): DateOnly {
  return fromUtcMidnight(toUtcMidnight(value) + days * MS_PER_DAY);
}

export function addMonths(value: DateOnly, months: number): DateOnly {
  const [y, m, d] = assertDateOnly(value).split("-").map(Number) as [number, number, number];
  const targetMonthIndex = m - 1 + months;
  const year = y + Math.floor(targetMonthIndex / 12);
  const month = ((targetMonthIndex % 12) + 12) % 12;
  // 1월 31일 + 1개월 → 2월 28/29일 (말일로 clamp). 계약 만료일 계산에서 필요.
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return fromUtcMidnight(Date.UTC(year, month, Math.min(d, lastDay)));
}

/** b - a (일수). 같은 날이면 0. */
export function diffDays(a: DateOnly, b: DateOnly): number {
  return Math.round((toUtcMidnight(b) - toUtcMidnight(a)) / MS_PER_DAY);
}

export function minDate(...values: DateOnly[]): DateOnly {
  return values.reduce((acc, cur) => (toUtcMidnight(cur) < toUtcMidnight(acc) ? cur : acc));
}

export function maxDate(...values: DateOnly[]): DateOnly {
  return values.reduce((acc, cur) => (toUtcMidnight(cur) > toUtcMidnight(acc) ? cur : acc));
}

export function isBefore(a: DateOnly, b: DateOnly): boolean {
  return toUtcMidnight(a) < toUtcMidnight(b);
}

export function isAfter(a: DateOnly, b: DateOnly): boolean {
  return toUtcMidnight(a) > toUtcMidnight(b);
}

/** 0=일요일 … 6=토요일 */
export function dayOfWeek(value: DateOnly): number {
  return new Date(toUtcMidnight(value)).getUTCDay();
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

export function weekdayKo(value: DateOnly): string {
  return WEEKDAY_KO[dayOfWeek(value)]!;
}

export function isWeekend(value: DateOnly): boolean {
  const dow = dayOfWeek(value);
  return dow === 0 || dow === 6;
}

/**
 * 관공서 업무일 여부. 주민센터(전입신고) · 등기소/법원(확정일자)가 문을 여는 날.
 * 인터넷등기소 · 정부24는 야간에도 접수 가능하지만 처리일 기준은 업무일이므로 업무일로 판단한다.
 */
export function isBusinessDay(value: DateOnly, holidays: ReadonlySet<DateOnly>): boolean {
  return !isWeekend(value) && !holidays.has(value);
}

/** value 가 업무일이면 그대로, 아니면 다음 업무일. */
export function nextBusinessDay(value: DateOnly, holidays: ReadonlySet<DateOnly>): DateOnly {
  let cursor = assertDateOnly(value);
  // 연휴가 아무리 길어도 14일을 넘지 않는다. 무한 루프 방지.
  for (let i = 0; i < 14; i += 1) {
    if (isBusinessDay(cursor, holidays)) return cursor;
    cursor = addDays(cursor, 1);
  }
  return cursor;
}

/** value 이전(또는 당일)의 가장 가까운 업무일. */
export function previousBusinessDay(value: DateOnly, holidays: ReadonlySet<DateOnly>): DateOnly {
  let cursor = assertDateOnly(value);
  for (let i = 0; i < 14; i += 1) {
    if (isBusinessDay(cursor, holidays)) return cursor;
    cursor = addDays(cursor, -1);
  }
  return cursor;
}

/**
 * 한국 시간 기준 특정 시각의 절대 시점(Date).
 * 대항력 발생 시점("전입신고 다음날 0시")을 timestamptz 로 저장할 때 사용한다.
 */
export function kstInstant(value: DateOnly, time = "00:00:00"): Date {
  return new Date(`${assertDateOnly(value)}T${time}${KST_OFFSET}`);
}

/** 오늘(한국 시간). */
export function todayKst(now: Date = new Date()): DateOnly {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function formatKo(value: DateOnly): string {
  const [y, m, d] = assertDateOnly(value).split("-") as [string, string, string];
  return `${y}년 ${Number(m)}월 ${Number(d)}일(${weekdayKo(value)})`;
}
