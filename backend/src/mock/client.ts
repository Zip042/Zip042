import { randomUUID } from "node:crypto";
import { loadEnv } from "../env.js";
import { MockQuery, store, type PgResult, type Row } from "./store.js";

/**
 * Supabase 클라이언트 대역 (목 모드 전용).
 *
 * 서비스 코드를 한 줄도 고치지 않기 위해, `adminClient()` / `userClient()` 가 돌려주는
 * 객체의 **모양만** 맞춘다. 이 코드베이스가 실제로 쓰는 표면만 구현한다:
 *   from().select/insert/update/upsert/delete + eq/gte/lte/order/limit/range/single/maybeSingle
 *   rpc(region_risk_summary | region_risk_grid)
 *   storage.from().createSignedUploadUrl/createSignedUrl/download/remove
 *   auth.getUser()
 *
 * RLS 는 흉내내지 않는다. 목 모드에는 사용자 격리가 없다는 뜻이므로,
 * **RLS 검증은 반드시 실제 Postgres 에서** `supabase/tests/verify_rls.sql` 로 해야 한다.
 */

// ---------------------------------------------------------------------------
// 업로드된 파일 (in-memory)
// ---------------------------------------------------------------------------

interface StoredBlob {
  path: string;
  bytes: Buffer;
  contentType: string;
  uploadedAt: string;
}

const blobs = new Map<string, StoredBlob>();
/** 서명 업로드 토큰 → 저장 경로 */
const uploadTokens = new Map<string, string>();

export function putBlob(path: string, bytes: Buffer, contentType: string): void {
  blobs.set(path, { path, bytes, contentType, uploadedAt: new Date().toISOString() });
}

export function resolveUploadToken(token: string): string | undefined {
  return uploadTokens.get(token);
}

export function blobStats(): { count: number; totalBytes: number } {
  let totalBytes = 0;
  for (const b of blobs.values()) totalBytes += b.bytes.byteLength;
  return { count: blobs.size, totalBytes };
}

export function clearBlobs(): void {
  blobs.clear();
  uploadTokens.clear();
}

/**
 * 프론트엔드가 업로드 PUT 을 생략했을 때 쓰는 더미 바이트.
 * 목 모드의 문서 판독은 파일 내용을 보지 않으므로(픅스처 반환), 흐름만 이어주면 된다.
 */
const PLACEHOLDER_PDF = Buffer.from(
  "%PDF-1.4\n% ZIP 042 목 모드 자리표시자 — 실제 문서가 업로드되지 않았습니다.\n",
  "utf8",
);

// ---------------------------------------------------------------------------
// 지리 계산 — PostGIS ST_DWithin / ST_Distance 대응
// ---------------------------------------------------------------------------

const EARTH_RADIUS_M = 6_371_008.8;

/** 두 좌표 사이 거리(m). PostGIS geography 의 측지 거리와 수 m 이내로 일치한다. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

interface RegionSummaryArgs {
  p_lat: number;
  p_lng: number;
  p_radius_m?: number;
  p_building_key?: string | null;
  p_owner_key?: string | null;
}

function regionRiskSummary(args: RegionSummaryArgs): PgResult<Row[]> {
  const radius = args.p_radius_m ?? 500;
  const victims = store.table("victim_properties");

  const nearby = victims.filter((v) => {
    if (typeof v.lat !== "number" || typeof v.lng !== "number") return false;
    return haversineMeters(args.p_lat, args.p_lng, v.lat, v.lng) <= radius;
  });

  const distances = nearby.map((v) =>
    haversineMeters(args.p_lat, args.p_lng, v.lat as number, v.lng as number),
  );

  const sumCases = (rows: Row[]) =>
    rows.reduce((sum, r) => sum + (typeof r.case_count === "number" ? r.case_count : 1), 0);

  const reportedDates = nearby
    .map((v) => v.reported_on)
    .filter((d): d is string => typeof d === "string" && d.length > 0)
    .sort();

  return {
    data: [
      {
        radius_m: radius,
        victim_case_count: sumCases(nearby),
        victim_site_count: nearby.length,
        nearest_distance_m: distances.length > 0 ? Math.min(...distances) : null,
        latest_reported_on: reportedDates.at(-1) ?? null,
        same_building_count: args.p_building_key
          ? sumCases(victims.filter((v) => v.building_key === args.p_building_key))
          : 0,
        same_owner_count: args.p_owner_key
          ? sumCases(victims.filter((v) => v.owner_key === args.p_owner_key))
          : 0,
      },
    ],
    error: null,
    status: 200,
  };
}

interface RegionGridArgs {
  p_lat: number;
  p_lng: number;
  p_radius_m?: number;
  p_cell_deg?: number;
}

function regionRiskGrid(args: RegionGridArgs): PgResult<Row[]> {
  const radius = args.p_radius_m ?? 2000;
  const cell = args.p_cell_deg ?? 0.001;
  const cells = new Map<string, { lat: number; lng: number; count: number }>();

  for (const v of store.table("victim_properties")) {
    if (typeof v.lat !== "number" || typeof v.lng !== "number") continue;
    if (haversineMeters(args.p_lat, args.p_lng, v.lat, v.lng) > radius) continue;
    const cellLat = Math.round(v.lat / cell) * cell;
    const cellLng = Math.round(v.lng / cell) * cell;
    const key = `${cellLat.toFixed(6)}|${cellLng.toFixed(6)}`;
    const entry = cells.get(key) ?? { lat: cellLat, lng: cellLng, count: 0 };
    entry.count += typeof v.case_count === "number" ? v.case_count : 1;
    cells.set(key, entry);
  }

  return {
    data: [...cells.values()].map((c) => ({
      cell_lat: c.lat,
      cell_lng: c.lng,
      case_count: c.count,
    })),
    error: null,
    status: 200,
  };
}

// ---------------------------------------------------------------------------
// 클라이언트
// ---------------------------------------------------------------------------

function publicBaseUrl(): string {
  const env = loadEnv();
  return env.PUBLIC_BASE_URL?.replace(/\/$/, "") ?? `http://localhost:${env.PORT}`;
}

const storageBucket = () => ({
  createSignedUploadUrl(path: string) {
    const token = randomUUID();
    uploadTokens.set(token, path);
    // 프론트엔드가 실제 Supabase 와 동일하게 "받은 URL 로 PUT" 하면 되도록,
    // 우리 서버의 개발용 업로드 엔드포인트를 가리킨다.
    return Promise.resolve({
      data: { path, token, signedUrl: `${publicBaseUrl()}/v1/dev/storage/${token}` },
      error: null,
    });
  },

  createSignedUrl(path: string, expiresIn: number) {
    return Promise.resolve({
      data: {
        signedUrl: `${publicBaseUrl()}/v1/dev/storage/${encodeURIComponent(path)}?expires=${expiresIn}`,
      },
      error: null,
    });
  },

  download(path: string) {
    const blob = blobs.get(path);
    const bytes = blob?.bytes ?? PLACEHOLDER_PDF;
    return Promise.resolve({
      data: {
        arrayBuffer: async () =>
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      },
      error: null,
    });
  },

  remove(paths: string[]) {
    for (const p of paths) blobs.delete(p);
    return Promise.resolve({ data: [], error: null });
  },
});

const MOCK_USER_EMAIL_DOMAIN = "mock.zip042.local";

export function createMockClient() {
  return {
    from(table: string) {
      return {
        select: (columns?: string, opts?: { count?: "exact" }) =>
          new MockQuery(table, "select").select(columns, opts),
        insert: (payload: Row | Row[]) => new MockQuery(table, "insert", payload),
        upsert: (payload: Row | Row[], opts?: { onConflict?: string; count?: "exact" }) => {
          const q = new MockQuery(table, "upsert", payload, opts?.onConflict);
          if (opts?.count === "exact") q.select(undefined, { count: "exact" });
          return q;
        },
        update: (payload: Row) => new MockQuery(table, "update", payload),
        delete: (opts?: { count?: "exact" }) => {
          const q = new MockQuery(table, "delete");
          if (opts?.count === "exact") q.select(undefined, { count: "exact" });
          return q;
        },
      };
    },

    rpc(fn: string, args: Record<string, unknown>) {
      switch (fn) {
        case "region_risk_summary":
          return Promise.resolve(regionRiskSummary(args as unknown as RegionSummaryArgs));
        case "region_risk_grid":
          return Promise.resolve(regionRiskGrid(args as unknown as RegionGridArgs));
        default:
          return Promise.resolve({
            data: null,
            error: { message: `목 모드에 구현되지 않은 RPC: ${fn}` },
            status: 400,
          });
      }
    },

    storage: { from: (_bucket: string) => storageBucket() },

    auth: {
      getUser(token: string) {
        // 목 모드에서는 토큰을 검증하지 않는다. 형식만 맞으면 그 토큰이 곧 사용자다.
        const id = mockUserIdFromToken(token);
        return Promise.resolve({
          data: {
            user: { id, email: `${id.slice(0, 8)}@${MOCK_USER_EMAIL_DOMAIN}`, role: "authenticated" },
          },
          error: null,
        });
      },
    },
  };
}

/**
 * 목 모드 토큰 → 사용자 ID.
 *
 * 규칙
 *   `dev`                                  → 기본 개발 사용자
 *   `dev:<uuid>`                           → 지정한 사용자 (다중 사용자 시나리오 테스트용)
 *   그 외 문자열                            → 문자열에서 결정론적으로 만든 사용자
 *
 * 같은 토큰은 항상 같은 사용자로 매핑되므로, 프론트엔드가 로그인 없이도
 * "내 검사 건 목록"을 안정적으로 볼 수 있다.
 */
export const MOCK_DEFAULT_USER_ID = "00000000-0000-4000-8000-000000000001";

export function mockUserIdFromToken(token: string): string {
  const trimmed = token.trim();
  if (trimmed === "" || trimmed === "dev") return MOCK_DEFAULT_USER_ID;

  const prefixed = /^dev:(.+)$/.exec(trimmed);
  const candidate = prefixed?.[1]?.trim() ?? trimmed;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)) {
    return candidate.toLowerCase();
  }

  // UUID 가 아니면 문자열을 해시해 UUID v4 형태로 만든다 (결정론적).
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < candidate.length; i += 1) {
    h1 = (h1 ^ candidate.charCodeAt(i)) * 0x01000193;
    h2 = (h2 + candidate.charCodeAt(i) * (i + 7)) * 0x85ebca6b;
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  const a = hex(h1);
  const b = hex(h2);
  const c = hex(h1 ^ h2);
  const d = hex((h1 + h2) * 2654435761);
  return `${a}-${b.slice(0, 4)}-4${b.slice(5, 8)}-8${c.slice(1, 4)}-${c.slice(4)}${d.slice(0, 4)}`;
}

export function resetMockData(): void {
  store.clear();
  clearBlobs();
}
