import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnv } from "../env.js";
import { createMockClient } from "../mock/client.js";

/**
 * DB 타입 별칭.
 *
 * Supabase 생성 타입(`supabase gen types typescript`)을 아직 붙이지 않았으므로 스키마를 `any` 로 둔다.
 * 이렇게 하면 PostgREST 빌더가 행 타입을 GenericStringError 로 추론하는 문제를 피할 수 있다.
 * → 스키마가 안정화되면 `supabase gen types typescript --local > src/lib/database.types.ts` 로
 *   생성해 `SupabaseClient<Database>` 로 교체할 것. 그 시점에 각 서비스의 수동 Row 타입도 제거한다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any, "public", any>;

/**
 * Supabase 클라이언트 두 종류를 명확히 구분한다.
 *
 *  - adminClient : service_role 키. RLS를 우회한다. **서버 내부 로직에만** 쓴다.
 *  - userClient  : 요청의 액세스 토큰을 그대로 물려준다. RLS가 그대로 적용된다.
 *
 * 기본은 userClient 다. 사용자가 볼 수 없는 데이터(피해주택 원본 등)를 다룰 때만 adminClient 를
 * 쓰고, 그때는 case 소유권을 코드에서 직접 검증해야 한다.
 *
 * ## 목 모드
 *
 * 두 함수 모두 in-memory 대역(`src/mock/client.ts`)을 돌려준다. 서비스 코드는 차이를 모른다.
 * 단, 대역은 **RLS 를 흉내내지 않는다** — 목 모드에는 사용자 격리가 없다.
 * 그래서 RLS 검증은 실제 Postgres 에서 `supabase/tests/verify_rls.sql` 로 해야 한다.
 */

let admin: Db | null = null;
let mock: Db | null = null;

function mockClient(): Db {
  // 대역은 상태를 store 모듈에 두므로 인스턴스를 재사용해도 무방하다.
  if (!mock) mock = createMockClient() as unknown as Db;
  return mock;
}

export function adminClient(): Db {
  const env = loadEnv();
  if (env.mode === "mock") return mockClient();
  if (admin) return admin;
  admin = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

export function userClient(accessToken: string): Db {
  const env = loadEnv();
  if (env.mode === "mock") return mockClient();
  return createClient(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** PostgREST 오류를 그대로 던지지 않고 로그 가능한 형태로 정리한다. */
export function unwrap<T>(
  result: { data: T | null; error: { message: string; code?: string; details?: string } | null },
  context: string,
): T {
  if (result.error) {
    const err = new Error(`${context}: ${result.error.message}`);
    (err as Error & { pgCode?: string }).pgCode = result.error.code;
    throw err;
  }
  if (result.data === null) {
    throw new Error(`${context}: 데이터가 없습니다.`);
  }
  return result.data;
}

/** 테스트에서 클라이언트 캐시를 비우기 위한 훅. */
export function resetClientCache(): void {
  admin = null;
  mock = null;
}
