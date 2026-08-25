import { beforeAll, describe, expect, it } from "vitest";
import type { Hono } from "hono";

/**
 * 앱 부팅 · 라우팅 · 오류 처리 스모크 테스트.
 *
 * Supabase / Anthropic 을 호출하지 않는 경로만 검증한다. 외부 의존이 필요한 경로는
 * 401(인증 없음)이 나오는지까지만 확인한다 — 인증 미들웨어가 실제로 걸려 있는지가
 * 여기서 검증하려는 핵심이다.
 */

let app: Hono;

beforeAll(async () => {
  // env 검증은 부팅 시 1회 수행되므로 import 전에 값을 채워야 한다.
  process.env.NODE_ENV = "test";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "test-anon-key-0123456789abcdef";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key-0123456789abcdef";
  process.env.ADMIN_API_TOKEN = "test-admin-token-0123456789";
  process.env.LOG_LEVEL = "error";
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.DATA_GO_KR_SERVICE_KEY;
  delete process.env.MATCH_KEY_PEPPER;

  const { createApp } = await import("../../src/app.js");
  app = createApp() as unknown as Hono;
});

describe("공개 엔드포인트", () => {
  it("GET /health", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: "zip042-backend" });
  });

  it("GET /v1/special-terms/catalog — 로그인 없이 특약 카탈로그를 볼 수 있다", async () => {
    const res = await app.request("/v1/special-terms/catalog");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      specialTerms: { code: string; clauseTemplate: string; baseline: boolean }[];
      categories: string[];
      disclaimer: string;
    };
    expect(body.specialTerms.length).toBeGreaterThan(10);
    expect(body.categories.length).toBeGreaterThan(3);
    // 법률 자문이 아니라는 고지가 반드시 붙어야 한다.
    expect(body.disclaimer).toContain("법률 자문이 아니");
    // 필수 기본 특약이 카탈로그에 있어야 한다.
    expect(body.specialTerms.map((t) => t.code)).toContain("TERM_NO_NEW_ENCUMBRANCE");
    // 문구가 비어 있거나 템플릿 구멍이 남아 있으면 안 된다.
    for (const term of body.specialTerms) {
      expect(term.clauseTemplate.length).toBeGreaterThan(20);
      expect(term.clauseTemplate).not.toContain("undefined");
    }
  });

  it("GET /v1/checklist — 로그인 없이 체크리스트 항목을 볼 수 있다", async () => {
    const res = await app.request("/v1/checklist");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      stages: { code: string; label: string; items: { id: string; required: boolean }[] }[];
      progress: { total: number; done: number; requiredTotal: number };
      disclaimer: string;
    };
    // 프론트엔드 좌측 네비가 기대하는 4단계.
    expect(body.stages.map((s) => s.code)).toEqual([
      "before_visit",
      "contract_day",
      "balance_move_in",
      "after_move_in",
    ]);
    expect(body.progress.done).toBe(0);
    expect(body.progress.total).toBeGreaterThan(0);
    expect(body.progress.requiredTotal).toBeGreaterThan(0);
    expect(body.disclaimer).toContain("참고");
  });

  it("GET /v1/glossary — 로그인 없이 용어를 검색할 수 있다", async () => {
    const res = await app.request("/v1/glossary?q=" + encodeURIComponent("근저당"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      terms: { code: string; term: string; description: string }[];
      total: number;
    };
    expect(body.total).toBeGreaterThan(0);
    // 용어명 일치가 맨 위에 와야 한다.
    expect(body.terms[0]?.code).toBe("G_MORTGAGE");
  });

  it("GET /v1/glossary — 잘못된 카테고리는 400", async () => {
    const res = await app.request("/v1/glossary?category=없는분류");
    expect(res.status).toBe(400);
  });

  it("GET /v1/glossary/fraud-cases · relief-steps — 공개", async () => {
    const fraud = await app.request("/v1/glossary/fraud-cases");
    expect(fraud.status).toBe(200);
    expect(((await fraud.json()) as { fraudCases: unknown[] }).fraudCases.length).toBeGreaterThan(0);

    const relief = await app.request("/v1/glossary/relief-steps");
    expect(relief.status).toBe(200);
    const body = (await relief.json()) as { reliefSteps: { order: number }[]; disclaimer: string };
    expect(body.reliefSteps[0]?.order).toBe(1);
    expect(body.disclaimer).toContain("법률 자문이 아닙니다");
  });

  it("GET /v1/glossary/by-finding/{code} — 판정 코드로 용어를 찾는다", async () => {
    const hit = await app.request("/v1/glossary/by-finding/VAL_HIGH_BURDEN");
    expect(hit.status).toBe(200);
    const body = (await hit.json()) as { terms: { code: string }[] };
    expect(body.terms.map((t) => t.code)).toContain("G_JEONSE_RATIO");

    // 연결된 용어가 없으면 404.
    const miss = await app.request("/v1/glossary/by-finding/NO_SUCH_FINDING");
    expect(miss.status).toBe(404);
  });
});

describe("인증", () => {
  const protectedRoutes: [string, string][] = [
    ["GET", "/v1/cases"],
    ["POST", "/v1/cases"],
    ["GET", "/v1/cases/11111111-1111-1111-1111-111111111111"],
    ["POST", "/v1/cases/11111111-1111-1111-1111-111111111111/analyze"],
    ["GET", "/v1/cases/11111111-1111-1111-1111-111111111111/interview"],
    ["GET", "/v1/cases/11111111-1111-1111-1111-111111111111/special-terms"],
    ["GET", "/v1/region/risk?lat=36.35&lng=127.38"],
    ["POST", "/v1/schedule/preview"],
    // 체크리스트 **목록**은 공개지만 체크 **상태**는 사용자 데이터다.
    ["GET", "/v1/checklist/progress"],
    ["PUT", "/v1/checklist/progress"],
    ["DELETE", "/v1/checklist/progress"],
  ];

  it.each(protectedRoutes)("%s %s → 토큰이 없으면 401", async (method, path) => {
    const res = await app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: method === "POST" || method === "PUT" ? "{}" : undefined,
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("잘못된 형식의 Authorization 헤더도 401", async () => {
    const res = await app.request("/v1/cases", { headers: { authorization: "Basic abc" } });
    expect(res.status).toBe(401);
  });
});

describe("관리자 엔드포인트", () => {
  it("x-admin-token 이 없으면 403", async () => {
    const res = await app.request("/v1/admin/holidays/cache/invalidate", { method: "POST" });
    expect(res.status).toBe(403);
  });

  it("토큰이 틀리면 403", async () => {
    const res = await app.request("/v1/admin/holidays/cache/invalidate", {
      method: "POST",
      headers: { "x-admin-token": "wrong-token-value-here" },
    });
    expect(res.status).toBe(403);
  });

  it("토큰이 맞으면 통과한다", async () => {
    const res = await app.request("/v1/admin/holidays/cache/invalidate", {
      method: "POST",
      headers: { "x-admin-token": "test-admin-token-0123456789" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("오류 처리", () => {
  it("없는 경로는 404 JSON", async () => {
    const res = await app.request("/v1/nope");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("스키마 검증 실패는 400 (인증 통과 후에만 도달하므로 관리자 경로로 확인)", async () => {
    const res = await app.request("/v1/admin/victim-properties", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-token": "test-admin-token-0123456789",
      },
      body: JSON.stringify({ source: "", rows: [] }),
    });
    expect(res.status).toBe(400);
  });

  it("내부 메시지를 응답에 노출하지 않는다", async () => {
    // ADMIN_API_TOKEN 은 설정되어 있으나 KASI 키가 없으므로 badRequest 가 나야 한다.
    const res = await app.request("/v1/admin/holidays/sync", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-token": "test-admin-token-0123456789",
      },
      body: JSON.stringify({ years: [2026] }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.error.message).toContain("KASI_SERVICE_KEY");
  });
});

describe("CORS", () => {
  it("허용된 오리진에 CORS 헤더를 붙인다", async () => {
    const res = await app.request("/health", { headers: { origin: "http://localhost:3000" } });
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
  });

  it("preflight 요청을 처리한다", async () => {
    const res = await app.request("/v1/cases", {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type",
      },
    });
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get("access-control-allow-headers")).toContain("Authorization");
  });
});
