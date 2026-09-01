import { randomUUID } from "node:crypto";

/**
 * in-memory 테이블 저장소 (목 모드 전용).
 *
 * DB 스키마의 **기본값과 제약 일부를 흉내낸다** — 컬럼 기본값, updated_at 갱신,
 * unique 충돌(upsert) 처리. 목적은 "프론트엔드가 실제 Supabase 를 붙였을 때와 같은 응답 모양을
 * 보는 것"이므로, 응답 형태를 맞추는 데 집중하고 참조 무결성 같은 것은 검사하지 않는다.
 *
 * 프로세스가 죽으면 데이터도 사라진다. 개발 중에는 그게 오히려 편하다
 * (`POST /v1/dev/reset` 으로도 초기화할 수 있다).
 */

export type Row = Record<string, unknown>;

/** 테이블별 삽입 시 채워줄 기본값. DB 의 DEFAULT 절과 1:1로 맞춘다. */
const DEFAULTS: Record<string, () => Row> = {
  cases: () => ({
    id: randomUUID(),
    title: null,
    status: "draft",
    road_address: null,
    jibun_address: null,
    detail_address: null,
    region_code: null,
    sigungu: null,
    lat: null,
    lng: null,
    building_type: null,
    exclusive_area_m2: null,
    floor: null,
    total_floors: null,
    built_year: null,
    household_count: null,
    business_registration_number: null,
    lease_type: "monthly",
    deposit_krw: 0,
    monthly_rent_krw: 0,
    maintenance_fee_krw: 0,
    contract_term_months: 24,
    contract_date: null,
    balance_date: null,
    move_in_date: null,
    resident_registration_date: null,
    confirmed_date_plan: null,
    user_market_price_krw: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }),
  documents: () => ({
    id: randomUUID(),
    original_name: null,
    page_count: null,
    status: "uploaded",
    error_message: null,
    uploaded_at: new Date().toISOString(),
    parsed_at: null,
  }),
  document_extractions: () => ({
    id: randomUUID(),
    confidence: null,
    warnings: [],
    usage: null,
    created_at: new Date().toISOString(),
  }),
  registry_rights: () => ({
    id: randomUUID(),
    rank_no: null,
    holder: null,
    max_claim_krw: null,
    registered_on: null,
    is_cancelled: false,
    note: null,
    created_at: new Date().toISOString(),
  }),
  market_prices: () => ({
    id: randomUUID(),
    low_krw: null,
    high_krw: null,
    sample_size: null,
    confidence: null,
    raw: null,
    created_at: new Date().toISOString(),
  }),
  analyses: () => ({ id: randomUUID(), created_at: new Date().toISOString() }),
  analysis_findings: () => ({
    id: randomUUID(),
    // 실제 테이블의 kind 기본값이 'risk' 다. 목이 비워 두면 두 모드의 응답이 달라진다.
    kind: "risk",
    weight: 0,
    action: null,
    evidence: {},
    sort_order: 0,
  }),
  special_terms: () => ({
    id: randomUUID(),
    priority: 0,
    required: false,
    triggered_by: [],
  }),
  schedule_events: () => ({
    id: randomUUID(),
    analysis_id: null,
    effective_at: null,
    severity: "safe",
    checklist: [],
    sort_order: 0,
  }),
  interview_sessions: () => ({
    id: randomUUID(),
    status: "in_progress",
    asked_codes: [],
    answers: {},
    created_at: new Date().toISOString(),
    completed_at: null,
  }),
  victim_properties: () => ({
    id: randomUUID(),
    road_address: null,
    jibun_address: null,
    building_name: null,
    sigungu: null,
    legal_dong: null,
    building_key: null,
    owner_key: null,
    lat: null,
    lng: null,
    reported_on: null,
    case_count: 1,
    damage_krw: null,
    raw: null,
    created_at: new Date().toISOString(),
  }),
  analysis_jobs: () => ({
    id: randomUUID(),
    status: "queued",
    progress: 0,
    step: null,
    options: {},
    analysis_version: null,
    error_code: null,
    error_message: null,
    created_at: new Date().toISOString(),
    started_at: null,
    finished_at: null,
  }),
  notification_outbox: () => ({
    id: randomUUID(),
    severity: "safe",
    deep_link: null,
    channel: "push",
    status: "pending",
    sent_at: null,
    error_message: null,
    created_at: new Date().toISOString(),
  }),
  public_holidays: () => ({ is_synced: false }),
  small_lessee_thresholds: () => ({ id: randomUUID(), note: null }),
  // 실제 테이블은 created_at · updated_at 이 `default now()` 다. 목이 이걸 비워 두면
  // "목에서는 updatedAt 이 null, 운영에서는 값이 있음" 이라는 차이가 생긴다.
  checklist_progress: () => ({
    checked_item_ids: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }),
  audit_logs: () => ({ id: randomUUID(), detail: {}, created_at: new Date().toISOString() }),
};

/** upsert 시 충돌을 판단할 기본 키. onConflict 가 주어지면 그 값을 쓴다. */
const PRIMARY_KEYS: Record<string, string[]> = {
  cases: ["id"],
  documents: ["id"],
  document_extractions: ["document_id"],
  registry_rights: ["id"],
  market_prices: ["id"],
  analyses: ["id"],
  analysis_findings: ["id"],
  special_terms: ["id"],
  schedule_events: ["id"],
  interview_sessions: ["id"],
  analysis_jobs: ["id"],
  notification_outbox: ["case_id", "event_code", "rule_code"],
  victim_properties: ["source", "source_key"],
  public_holidays: ["holiday_date"],
  small_lessee_thresholds: ["effective_from", "region_class"],
  // 체크리스트는 사용자당 한 줄이므로 user_id 가 곧 기본키다.
  checklist_progress: ["user_id"],
};

/**
 * DB 의 unique 제약 중 **동작 차이를 만드는 것**만 흉내낸다.
 *
 * 흉내내지 않으면 목 모드에서만 통과하는 코드가 생긴다. 예를 들어 분석 작업 큐는
 * 부분 unique 인덱스(`status in ('queued','running')`)로 중복 실행을 막는데,
 * 이걸 강제하지 않으면 목 모드에서는 같은 검사 건이 두 번 분석되고 운영에서는 409 가 난다.
 */
interface UniqueConstraint {
  name: string;
  columns: string[];
  /** 부분 인덱스의 WHERE 절에 해당 */
  where?: (row: Row) => boolean;
}

const UNIQUE_CONSTRAINTS: Record<string, UniqueConstraint[]> = {
  analysis_jobs: [
    {
      name: "analysis_jobs_active_uniq",
      columns: ["case_id"],
      where: (row) => row.status === "queued" || row.status === "running",
    },
  ],
  victim_properties: [{ name: "victim_properties_source_key", columns: ["source", "source_key"] }],
  document_extractions: [{ name: "document_extractions_document_id", columns: ["document_id"] }],
  public_holidays: [{ name: "public_holidays_pkey", columns: ["holiday_date"] }],
  notification_outbox: [
    {
      name: "notification_outbox_uniq",
      columns: ["case_id", "event_code", "rule_code"],
    },
  ],
};

/** PostgreSQL unique 위반 오류 코드. 서비스 코드가 이 값으로 분기한다. */
export const UNIQUE_VIOLATION_CODE = "23505";

/** 삽입 시 updated_at 을 자동 갱신하는 테이블 (DB 트리거 대응) */
// 실제 DB 에서 touch_updated_at() 트리거가 붙은 테이블. 목도 같이 맞춘다.
const TOUCH_UPDATED_AT = new Set(["cases", "profiles", "checklist_progress"]);

export class MemoryStore {
  private tables = new Map<string, Row[]>();

  table(name: string): Row[] {
    let rows = this.tables.get(name);
    if (!rows) {
      rows = [];
      this.tables.set(name, rows);
    }
    return rows;
  }

  defaultsFor(name: string): Row {
    return DEFAULTS[name]?.() ?? { id: randomUUID() };
  }

  uniqueConstraints(name: string): UniqueConstraint[] {
    return UNIQUE_CONSTRAINTS[name] ?? [];
  }

  conflictKeys(name: string, onConflict?: string): string[] {
    if (onConflict) return onConflict.split(",").map((s) => s.trim());
    return PRIMARY_KEYS[name] ?? ["id"];
  }

  touchesUpdatedAt(name: string): boolean {
    return TOUCH_UPDATED_AT.has(name);
  }

  clear(): void {
    this.tables.clear();
  }

  stats(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [name, rows] of this.tables) out[name] = rows.length;
    return out;
  }
}

export const store = new MemoryStore();

// ---------------------------------------------------------------------------
// PostgREST 응답 형태
// ---------------------------------------------------------------------------

export interface PgError {
  message: string;
  code?: string;
  details?: string;
}

export interface PgResult<T = unknown> {
  data: T | null;
  error: PgError | null;
  count?: number | null;
  status: number;
}

/** 행이 없을 때 `.single()` 이 내는 PostgREST 오류 코드. 서비스 코드가 이 값을 분기한다. */
export const NO_ROWS_CODE = "PGRST116";

type Op = "select" | "insert" | "update" | "upsert" | "delete";

interface Filter {
  column: string;
  op: "eq" | "neq" | "gte" | "lte" | "gt" | "lt" | "in";
  value: unknown;
}

function compare(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const value = row[f.column];
    switch (f.op) {
      case "eq":
        // null 비교는 PostgREST 의 `is` 와 다르지만, 이 코드베이스는 eq(null)을 쓰지 않는다.
        return value === f.value || String(value) === String(f.value);
      case "neq":
        return String(value) !== String(f.value);
      case "gte":
        return compare(value, f.value) >= 0;
      case "lte":
        return compare(value, f.value) <= 0;
      case "gt":
        return compare(value, f.value) > 0;
      case "lt":
        return compare(value, f.value) < 0;
      case "in":
        return Array.isArray(f.value) && f.value.some((v) => String(v) === String(value));
      default:
        return true;
    }
  });
}

/**
 * `.select("a,b,c")` 를 흉내내 컬럼을 골라낸다.
 *
 * 실제 PostgREST 는 지정하지 않은 컬럼을 응답에서 빼므로, 여기서도 같게 동작시켜
 * "로컬에서는 되는데 실제 Supabase 에서는 필드가 없다" 류의 사고를 막는다.
 */
function project(row: Row, columns: string | undefined): Row {
  if (!columns || columns === "*") return { ...row };
  const wanted = columns
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length > 0 && c !== "*");
  if (wanted.length === 0) return { ...row };
  const out: Row = {};
  for (const col of wanted) out[col] = row[col] ?? null;
  return out;
}

export class MockQuery<T = unknown> implements PromiseLike<PgResult<T>> {
  private filters: Filter[] = [];
  private columns: string | undefined;
  private wantCount = false;
  private orderBy: { column: string; ascending: boolean }[] = [];
  private limitCount: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private singleMode: "single" | "maybe" | null = null;

  constructor(
    private readonly tableName: string,
    private readonly op: Op,
    private readonly payload?: Row | Row[],
    private readonly onConflict?: string,
  ) {}

  select(columns?: string, opts?: { count?: "exact" }): this {
    this.columns = columns;
    if (opts?.count === "exact") this.wantCount = true;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, op: "eq", value });
    return this;
  }
  neq(column: string, value: unknown): this {
    this.filters.push({ column, op: "neq", value });
    return this;
  }
  gte(column: string, value: unknown): this {
    this.filters.push({ column, op: "gte", value });
    return this;
  }
  lte(column: string, value: unknown): this {
    this.filters.push({ column, op: "lte", value });
    return this;
  }
  gt(column: string, value: unknown): this {
    this.filters.push({ column, op: "gt", value });
    return this;
  }
  lt(column: string, value: unknown): this {
    this.filters.push({ column, op: "lt", value });
    return this;
  }
  in(column: string, values: unknown[]): this {
    this.filters.push({ column, op: "in", value: values });
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    this.orderBy.push({ column, ascending: opts?.ascending ?? true });
    return this;
  }

  limit(n: number): this {
    this.limitCount = n;
    return this;
  }

  range(from: number, to: number): this {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  single(): this {
    this.singleMode = "single";
    return this;
  }

  maybeSingle(): this {
    this.singleMode = "maybe";
    return this;
  }

  then<R1 = PgResult<T>, R2 = never>(
    onFulfilled?: ((value: PgResult<T>) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    try {
      return Promise.resolve(this.execute()).then(onFulfilled, onRejected);
    } catch (err) {
      return Promise.reject(err).then(onFulfilled, onRejected);
    }
  }

  private execute(): PgResult<T> {
    const rows = store.table(this.tableName);

    try {
      return this.run(rows);
    } catch (err) {
      // PostgREST 는 제약 위반을 예외가 아니라 error 필드로 돌려준다. 형태를 맞춘다.
      if (err instanceof UniqueViolationError) {
        return {
          data: null,
          error: {
            message: `duplicate key value violates unique constraint "${err.constraint}"`,
            code: UNIQUE_VIOLATION_CODE,
            details: `Key already exists in ${err.table}`,
          },
          count: null,
          status: 409,
        };
      }
      throw err;
    }
  }

  private run(rows: Row[]): PgResult<T> {
    switch (this.op) {
      case "insert":
        return this.finish(this.doInsert(rows));
      case "upsert":
        return this.finish(this.doUpsert(rows));
      case "update":
        return this.finish(this.doUpdate(rows));
      case "delete":
        return this.doDelete(rows);
      case "select":
      default:
        return this.finish(this.doSelect(rows), rows.filter((r) => matches(r, this.filters)).length);
    }
  }

  private doInsert(rows: Row[]): Row[] {
    const incoming = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
    const inserted: Row[] = [];
    for (const item of incoming) {
      const row: Row = { ...store.defaultsFor(this.tableName), ...item };
      if (store.touchesUpdatedAt(this.tableName)) row.updated_at = new Date().toISOString();

      const violated = this.findUniqueViolation(rows, row);
      if (violated) {
        throw new UniqueViolationError(this.tableName, violated);
      }

      rows.push(row);
      inserted.push(row);
    }
    return inserted;
  }

  private findUniqueViolation(rows: Row[], candidate: Row): string | null {
    for (const constraint of store.uniqueConstraints(this.tableName)) {
      if (constraint.where && !constraint.where(candidate)) continue;
      const clash = rows.some(
        (existing) =>
          (!constraint.where || constraint.where(existing)) &&
          constraint.columns.every((col) => String(existing[col]) === String(candidate[col])),
      );
      if (clash) return constraint.name;
    }
    return null;
  }

  private doUpsert(rows: Row[]): Row[] {
    const incoming = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
    const keys = store.conflictKeys(this.tableName, this.onConflict);
    const out: Row[] = [];
    for (const item of incoming) {
      const existing = rows.find((r) => keys.every((k) => String(r[k]) === String(item[k])));
      if (existing) {
        Object.assign(existing, item);
        if (store.touchesUpdatedAt(this.tableName)) existing.updated_at = new Date().toISOString();
        out.push(existing);
      } else {
        const row: Row = { ...store.defaultsFor(this.tableName), ...item };
        rows.push(row);
        out.push(row);
      }
    }
    return out;
  }

  private doUpdate(rows: Row[]): Row[] {
    const target = rows.filter((r) => matches(r, this.filters));
    for (const row of target) {
      Object.assign(row, this.payload ?? {});
      if (store.touchesUpdatedAt(this.tableName)) row.updated_at = new Date().toISOString();
    }
    return target;
  }

  private doDelete(rows: Row[]): PgResult<T> {
    const keep: Row[] = [];
    let removed = 0;
    for (const row of rows) {
      if (matches(row, this.filters)) removed += 1;
      else keep.push(row);
    }
    rows.length = 0;
    rows.push(...keep);
    return { data: null, error: null, count: this.wantCount ? removed : null, status: 204 };
  }

  private doSelect(rows: Row[]): Row[] {
    let result = rows.filter((r) => matches(r, this.filters));

    for (const { column, ascending } of [...this.orderBy].reverse()) {
      result = [...result].sort((a, b) => {
        const c = compare(a[column], b[column]);
        return ascending ? c : -c;
      });
    }

    if (this.rangeFrom !== null && this.rangeTo !== null) {
      result = result.slice(this.rangeFrom, this.rangeTo + 1);
    }
    if (this.limitCount !== null) result = result.slice(0, this.limitCount);
    return result;
  }

  private finish(rows: Row[], totalCount?: number): PgResult<T> {
    // insert/update/upsert 에서 .select() 를 호출하지 않았으면 데이터를 돌려주지 않는다 (PostgREST 동작).
    const returning =
      this.op === "select" || this.columns !== undefined
        ? rows.map((r) => project(r, this.columns))
        : null;

    if (this.singleMode) {
      if (rows.length === 0) {
        if (this.singleMode === "maybe") {
          return { data: null, error: null, count: 0, status: 200 };
        }
        return {
          data: null,
          error: {
            message: "JSON object requested, multiple (or no) rows returned",
            code: NO_ROWS_CODE,
            details: "The result contains 0 rows",
          },
          count: 0,
          status: 406,
        };
      }
      return {
        data: (returning?.[0] ?? null) as T,
        error: null,
        count: this.wantCount ? (totalCount ?? rows.length) : null,
        status: 200,
      };
    }

    return {
      data: (returning ?? null) as T,
      error: null,
      count: this.wantCount ? (totalCount ?? rows.length) : null,
      status: 200,
    };
  }
}

class UniqueViolationError extends Error {
  constructor(
    readonly table: string,
    readonly constraint: string,
  ) {
    super(`unique violation on ${table}.${constraint}`);
    this.name = "UniqueViolationError";
  }
}
