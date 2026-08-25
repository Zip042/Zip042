import { addDays, type DateOnly } from "../lib/date.js";
import { log } from "../lib/logger.js";
import { adminClient } from "../lib/supabase.js";

/**
 * 공휴일 집합 로딩.
 *
 * 잔금일이 휴일이면 확정일자·전입신고를 당일 처리할 수 없어 무방비 구간이 며칠 늘어난다.
 * 일정 판정의 정확도가 이 데이터에 직접 걸려 있다.
 *
 * 음력 기반 공휴일(설날 · 추석 · 부처님오신날)과 대체공휴일 · 임시공휴일은 매년 고시되므로
 * DB(public_holidays)를 진실의 원천으로 삼고, 한국천문연구원 특일 정보 API로 동기화한다.
 * DB가 비어 있으면 코드에 하드코딩된 양력 고정 공휴일로 폴백한다(불완전함을 경고와 함께 알린다).
 */

/** 매년 날짜가 고정된 양력 공휴일 (월-일) */
const FIXED_SOLAR_HOLIDAYS = [
  "01-01", // 신정
  "03-01", // 삼일절
  "05-05", // 어린이날
  "06-06", // 현충일
  "08-15", // 광복절
  "10-03", // 개천절
  "10-09", // 한글날
  "12-25", // 성탄절
] as const;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6시간

interface HolidayCache {
  set: Set<DateOnly>;
  loadedAt: number;
  source: "database" | "fallback";
  syncedCount: number;
}

let cache: HolidayCache | null = null;

function fallbackHolidays(fromYear: number, toYear: number): Set<DateOnly> {
  const set = new Set<DateOnly>();
  for (let y = fromYear; y <= toYear; y += 1) {
    for (const md of FIXED_SOLAR_HOLIDAYS) set.add(`${y}-${md}`);
  }
  return set;
}

export interface HolidaySnapshot {
  holidays: ReadonlySet<DateOnly>;
  /** DB에 음력 공휴일이 동기화되어 있는지. false면 일정 판정이 불완전하다. */
  lunarHolidaysSynced: boolean;
  source: "database" | "fallback";
}

export async function loadHolidays(referenceYear = new Date().getUTCFullYear()): Promise<HolidaySnapshot> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return {
      holidays: cache.set,
      lunarHolidaysSynced: cache.syncedCount > 0,
      source: cache.source,
    };
  }

  const from = `${referenceYear - 1}-01-01`;
  const to = `${referenceYear + 3}-12-31`;

  try {
    const { data, error } = await adminClient()
      .from("public_holidays")
      .select("holiday_date, is_synced")
      .gte("holiday_date", from)
      .lte("holiday_date", to);

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as { holiday_date: string; is_synced: boolean }[];
    if (rows.length === 0) throw new Error("공휴일 데이터가 비어 있습니다.");

    cache = {
      set: new Set(rows.map((r) => r.holiday_date)),
      loadedAt: Date.now(),
      source: "database",
      syncedCount: rows.filter((r) => r.is_synced).length,
    };
  } catch (err) {
    log.warn("공휴일 DB 조회 실패 — 양력 고정 공휴일로 폴백", {
      error: err instanceof Error ? err.message : String(err),
    });
    cache = {
      set: fallbackHolidays(referenceYear - 1, referenceYear + 3),
      loadedAt: Date.now(),
      source: "fallback",
      syncedCount: 0,
    };
  }

  return {
    holidays: cache.set,
    lunarHolidaysSynced: cache.syncedCount > 0,
    source: cache.source,
  };
}

export function invalidateHolidayCache(): void {
  cache = null;
}

// ---------------------------------------------------------------------------
// 한국천문연구원 특일 정보 동기화
// ---------------------------------------------------------------------------

const KASI_URL =
  "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";

/**
 * 지정 연도의 공휴일을 특일 정보 API에서 받아 DB에 업서트한다.
 * 관리자 엔드포인트(`POST /v1/admin/holidays/sync`)에서 호출한다.
 */
export async function syncHolidaysFromKasi(
  serviceKey: string,
  year: number,
): Promise<{ inserted: number; dates: DateOnly[] }> {
  const dates: DateOnly[] = [];
  const names = new Map<DateOnly, string>();

  for (let month = 1; month <= 12; month += 1) {
    const url = new URL(KASI_URL);
    url.searchParams.set("serviceKey", serviceKey);
    url.searchParams.set("solYear", String(year));
    url.searchParams.set("solMonth", String(month).padStart(2, "0"));
    url.searchParams.set("numOfRows", "50");
    url.searchParams.set("_type", "json");

    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`특일 정보 API 오류 (${res.status})`);

    const text = await res.text();
    // 이 API는 오류 시 JSON 대신 XML 을 돌려준다. 방어적으로 처리한다.
    let items: { locdate?: number | string; dateName?: string; isHoliday?: string }[] = [];
    try {
      const json = JSON.parse(text) as {
        response?: { body?: { items?: { item?: unknown } } };
      };
      const raw = json.response?.body?.items?.item;
      items = Array.isArray(raw) ? (raw as typeof items) : raw ? [raw as (typeof items)[number]] : [];
    } catch {
      log.warn("특일 정보 응답을 JSON으로 읽지 못했습니다", { year, month });
      continue;
    }

    for (const item of items) {
      if (item.isHoliday && item.isHoliday !== "Y") continue;
      const raw = String(item.locdate ?? "");
      if (!/^\d{8}$/.test(raw)) continue;
      const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
      dates.push(iso);
      names.set(iso, item.dateName?.trim() || "공휴일");
    }
  }

  if (dates.length === 0) return { inserted: 0, dates: [] };

  const unique = [...new Set(dates)];
  const { error } = await adminClient()
    .from("public_holidays")
    .upsert(
      unique.map((d) => ({ holiday_date: d, name: names.get(d) ?? "공휴일", is_synced: true })),
      { onConflict: "holiday_date" },
    );
  if (error) throw new Error(`공휴일 저장 실패: ${error.message}`);

  invalidateHolidayCache();
  return { inserted: unique.length, dates: unique };
}

/** 연휴 길이 계산 — UI에서 "3일 연휴" 같은 안내를 하고 싶을 때. */
export function consecutiveNonBusinessDays(
  start: DateOnly,
  holidays: ReadonlySet<DateOnly>,
  maxLookahead = 10,
): number {
  let count = 0;
  let cursor = start;
  for (let i = 0; i < maxLookahead; i += 1) {
    const dow = new Date(`${cursor}T00:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6 && !holidays.has(cursor)) break;
    count += 1;
    cursor = addDays(cursor, 1);
  }
  return count;
}
