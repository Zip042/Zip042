import type { MiddlewareHandler } from "hono";
import { AppError } from "../lib/errors.js";
import { log } from "../lib/logger.js";
import type { AppBindings } from "./auth.js";

/**
 * 요청 제한 (rate limiting).
 *
 * 왜 필요한가: 분석 엔드포인트는 요청 한 번에 **AI 호출이 문서 수만큼** 발생한다.
 * 제한이 없으면 실수로 만든 루프 하나가 비용을 폭주시킨다. 사용자 보호가 아니라
 * **비용 사고 방지**가 주 목적이다.
 *
 * ## 구현 방식과 한계
 *
 * in-memory 슬라이딩 윈도우다. 인스턴스마다 카운터가 따로 있으므로
 * **서버리스나 다중 인스턴스에서는 실제 한도가 인스턴스 수만큼 커진다.**
 * 정확한 제한이 필요해지면 `RateLimitStore` 를 Redis(Upstash 등) 구현으로 갈아끼운다 —
 * 미들웨어와 라우트는 바뀌지 않는다.
 */

export interface RateLimitStore {
  /** 윈도우 내 요청 수를 1 늘리고 현재 값을 돌려준다. */
  hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
}

class MemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, number[]>();
  private lastSweep = 0;

  async hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const now = Date.now();
    this.sweep(now, windowMs);

    const timestamps = (this.buckets.get(key) ?? []).filter((t) => now - t < windowMs);
    timestamps.push(now);
    this.buckets.set(key, timestamps);

    return { count: timestamps.length, resetAt: (timestamps[0] ?? now) + windowMs };
  }

  /** 오래된 버킷을 주기적으로 비운다. 안 하면 키가 무한히 쌓인다. */
  private sweep(now: number, windowMs: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [key, timestamps] of this.buckets) {
      const alive = timestamps.filter((t) => now - t < windowMs);
      if (alive.length === 0) this.buckets.delete(key);
      else this.buckets.set(key, alive);
    }
  }

  reset(): void {
    this.buckets.clear();
    this.lastSweep = 0;
  }
}

const memoryStore = new MemoryRateLimitStore();
let store: RateLimitStore = memoryStore;

/** 분산 환경에서 Redis 구현으로 교체할 때 사용한다. */
export function setRateLimitStore(next: RateLimitStore): void {
  store = next;
}

export function resetRateLimits(): void {
  memoryStore.reset();
  store = memoryStore;
}

export interface RateLimitOptions {
  /** 버킷 이름. 엔드포인트 그룹별로 다른 한도를 주기 위해 쓴다. */
  bucket: string;
  limit: number;
  windowMs: number;
}

/**
 * 한도 프리셋.
 *
 * 분석은 비싸므로 촘촘하게, 조회는 넉넉하게 잡는다.
 * 사용자 한 명이 정상적으로 쓰는 속도를 막지 않는 선에서 사고만 걸러내는 값이다.
 */
export const RATE_LIMITS = {
  /** 분석 실행 — AI 호출이 발생한다 */
  analyze: { bucket: "analyze", limit: 10, windowMs: 60 * 60 * 1000 },
  /** 문서 업로드 URL 발급 */
  upload: { bucket: "upload", limit: 30, windowMs: 60 * 60 * 1000 },
  /** 주소 검색 — 외부 API 호출 */
  address: { bucket: "address", limit: 60, windowMs: 60 * 1000 },
  /** 일반 조회 */
  read: { bucket: "read", limit: 300, windowMs: 60 * 1000 },
  /** 쓰기 (검사 건 생성·수정) */
  write: { bucket: "write", limit: 60, windowMs: 60 * 1000 },
  /** 로그인·회원가입 — 무차별 대입 방지. IP 단위로 세므로 사용자 수 제한이 아니다. */
  auth: { bucket: "auth", limit: 20, windowMs: 15 * 60 * 1000 },
} as const satisfies Record<string, RateLimitOptions>;

/**
 * 클라이언트 식별.
 *
 * 인증된 사용자는 사용자 ID 로, 아니면 IP 로 센다. IP 는 프록시 헤더에서 읽는데
 * **클라이언트가 위조할 수 있는 값**이므로, 신뢰할 수 있는 프록시 뒤에서만 유효하다.
 * (Vercel 은 `x-forwarded-for` 를 자신이 덮어쓰므로 신뢰 가능하다.)
 */
function clientKey(c: Parameters<MiddlewareHandler<AppBindings>>[0]): string {
  const user = c.get("user");
  if (user?.id) return `u:${user.id}`;

  const forwarded = c.req.header("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "unknown";
  return `ip:${ip}`;
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const key = `${options.bucket}:${clientKey(c)}`;
    const { count, resetAt } = await store.hit(key, options.windowMs);

    const remaining = Math.max(0, options.limit - count);
    c.header("RateLimit-Limit", String(options.limit));
    c.header("RateLimit-Remaining", String(remaining));
    c.header("RateLimit-Reset", String(Math.ceil((resetAt - Date.now()) / 1000)));

    if (count > options.limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
      c.header("Retry-After", String(retryAfterSeconds));
      log.warn("요청 제한 초과", { bucket: options.bucket, key, count, limit: options.limit });
      throw new AppError(
        429,
        "RATE_LIMITED",
        options.bucket === "analyze"
          ? `분석 요청이 너무 많습니다. ${Math.ceil(retryAfterSeconds / 60)}분 후 다시 시도해 주세요.`
          : "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        { retryAfterSeconds, limit: options.limit },
      );
    }

    await next();
  };
}
