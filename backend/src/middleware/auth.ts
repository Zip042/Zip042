import type { MiddlewareHandler } from "hono";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { loadEnv } from "../env.js";
import { mockUserIdFromToken } from "../mock/client.js";
import { forbidden, unauthorized } from "../lib/errors.js";
import { adminClient } from "../lib/supabase.js";

export interface AuthUser {
  id: string;
  email?: string;
  role?: string;
}

export type AppBindings = {
  Variables: {
    user: AuthUser;
    accessToken: string;
    requestId: string;
  };
};

/**
 * Supabase 액세스 토큰 검증.
 *
 * 검증 경로가 두 가지다.
 *  1) 비대칭 키(ES256/RS256, Supabase의 현재 기본): 프로젝트 JWKS 엔드포인트로 로컬 검증.
 *  2) 대칭 키(HS256, 레거시 JWT 시크릿): SUPABASE_JWT_SECRET 으로 로컬 검증.
 * 둘 다 실패하면 마지막 수단으로 auth.getUser() 원격 호출로 폴백한다.
 *
 * 로컬 검증을 먼저 시도하는 이유: 요청마다 Supabase Auth를 왕복하면 지연과 rate limit이 문제가 된다.
 */

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!jwks) {
    const env = loadEnv();
    jwks = createRemoteJWKSet(new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
  }
  return jwks;
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

function toUser(payload: JWTPayload): AuthUser {
  const id = typeof payload.sub === "string" ? payload.sub : null;
  if (!id) throw unauthorized("토큰에 사용자 정보가 없습니다.");
  return {
    id,
    email: typeof payload.email === "string" ? payload.email : undefined,
    role: typeof payload.role === "string" ? payload.role : undefined,
  };
}

async function verifyToken(token: string): Promise<AuthUser> {
  const env = loadEnv();

  // 목 모드: 토큰을 검증하지 않고 토큰 자체를 사용자 식별자로 쓴다.
  // 같은 토큰은 항상 같은 사용자로 매핑되므로 프론트엔드가 로그인 없이 개발할 수 있다.
  // (`dev` → 기본 사용자, `dev:<uuid>` → 지정 사용자)
  if (env.mode === "mock") {
    const id = mockUserIdFromToken(token);
    return { id, email: `${id.slice(0, 8)}@mock.zip042.local`, role: "authenticated" };
  }

  // (1) 비대칭 키
  try {
    const { payload } = await jwtVerify(token, getJwks(), { audience: "authenticated" });
    return toUser(payload);
  } catch {
    // 다음 경로로
  }

  // (2) 대칭 키
  if (env.SUPABASE_JWT_SECRET) {
    try {
      const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
      const { payload } = await jwtVerify(token, secret, { audience: "authenticated" });
      return toUser(payload);
    } catch {
      // 다음 경로로
    }
  }

  // (3) 원격 검증 폴백
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) {
    throw unauthorized("로그인 정보가 유효하지 않습니다. 다시 로그인해 주세요.");
  }
  return { id: data.user.id, email: data.user.email ?? undefined, role: data.user.role ?? undefined };
}

/** 인증 필수 라우트에 적용. */
export const requireAuth: MiddlewareHandler<AppBindings> = async (c, next) => {
  const token = extractBearer(c.req.header("authorization"));
  if (!token) throw unauthorized();
  const user = await verifyToken(token);
  c.set("user", user);
  c.set("accessToken", token);
  await next();
};

/**
 * 관리자 배치용. ADMIN_API_TOKEN 공유 시크릿을 확인한다.
 * 사용자 JWT와 별개의 채널이므로 절대 프론트엔드에 노출하지 않는다.
 */
export const requireAdminToken: MiddlewareHandler<AppBindings> = async (c, next) => {
  const env = loadEnv();
  if (!env.ADMIN_API_TOKEN) throw forbidden("관리자 API가 비활성화되어 있습니다.");
  const provided = c.req.header("x-admin-token");
  // 길이가 다르면 즉시 실패. 같으면 상수 시간 비교.
  if (!provided || provided.length !== env.ADMIN_API_TOKEN.length) throw forbidden();
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ env.ADMIN_API_TOKEN.charCodeAt(i);
  }
  if (diff !== 0) throw forbidden();
  await next();
};
