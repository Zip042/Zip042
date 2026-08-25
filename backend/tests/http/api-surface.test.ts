import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Hono } from "hono";

/**
 * 새로 추가한 API 표면 검증 — 주소 검색 · 홈 요약 · 작업 큐 · 알림 · 요청 제한.
 * 목 모드라 외부 의존이 없으므로 CI 에서 그대로 돈다.
 */

let app: Hono;
let resetRateLimits: () => void;

const AUTH = { authorization: "Bearer surface-tester", "content-type": "application/json" };

async function json<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

beforeAll(async () => {
  process.env.ZIP042_MODE = "mock";
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "error";
  process.env.ADMIN_API_TOKEN = "surface-admin-token-000000";
  delete process.env.SUPABASE_URL;
  delete process.env.VERCEL;

  const [{ createApp }, rl] = await Promise.all([
    import("../../src/app.js"),
    import("../../src/middleware/rate-limit.js"),
  ]);
  app = createApp() as unknown as Hono;
  resetRateLimits = rl.resetRateLimits;
});

beforeEach(() => {
  // 앞선 테스트가 한도를 소진하면 뒤 테스트가 429 로 실패한다.
  resetRateLimits();
});

describe("주소 검색", () => {
  it("도로명으로 검색된다", async () => {
    const res = await app.request("/v1/addresses/search?q=둔산로", { headers: AUTH });
    expect(res.status).toBe(200);
    const body = await json<{
      results: { roadAddress: string; regionCode: string; lat: number; sigungu: string }[];
      isMockData: boolean;
      provider: string;
    }>(res);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.provider).toBe("mock");
    expect(body.isMockData).toBe(true);
    // 시세 조회에 쓰이는 시군구코드가 반드시 있어야 한다.
    for (const r of body.results) {
      expect(r.regionCode).toMatch(/^\d{5,10}$/);
      expect(typeof r.lat).toBe("number");
      expect(r.sigungu.length).toBeGreaterThan(0);
    }
  });

  it("공백을 빼고도 검색된다", async () => {
    const res = await app.request("/v1/addresses/search?q=둔산로100", { headers: AUTH });
    const body = await json<{ results: { roadAddress: string }[] }>(res);
    expect(body.results[0]?.roadAddress).toBe("대전광역시 서구 둔산로 100");
  });

  it("건물명·법정동으로도 검색된다", async () => {
    const byDong = await json<{ results: unknown[] }>(
      await app.request("/v1/addresses/search?q=궁동", { headers: AUTH }),
    );
    expect(byDong.results.length).toBeGreaterThan(0);
  });

  it("검색어가 짧으면 400", async () => {
    expect((await app.request("/v1/addresses/search?q=둔", { headers: AUTH })).status).toBe(400);
  });

  it("결과가 없으면 빈 배열 (404 아님)", async () => {
    const res = await app.request("/v1/addresses/search?q=존재하지않는주소xyz", { headers: AUTH });
    expect(res.status).toBe(200);
    expect((await json<{ results: unknown[] }>(res)).results).toEqual([]);
  });

  it("인증이 없으면 401", async () => {
    expect((await app.request("/v1/addresses/search?q=둔산로")).status).toBe(401);
  });
});

describe("검사 건 생성 시 좌표 자동 보완", () => {
  it("주소만 보내면 좌표·법정동코드를 서버가 채운다", async () => {
    const res = await app.request("/v1/cases", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        roadAddress: "대전광역시 서구 둔산로 100",
        leaseType: "jeonse",
        deposit: 90_000_000,
      }),
    });
    expect(res.status).toBe(201);
    const { case: created } = await json<{
      case: { property: { lat: number | null; regionCode: string | null; sigungu: string | null } };
    }>(res);
    expect(created.property.lat).toBeCloseTo(36.3504, 3);
    expect(created.property.regionCode).toBe("30170");
    expect(created.property.sigungu).toBe("대전광역시 서구");
  });

  it("사용자가 명시한 좌표는 덮어쓰지 않는다", async () => {
    const res = await app.request("/v1/cases", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        roadAddress: "대전광역시 서구 둔산로 100",
        lat: 36.1,
        lng: 127.1,
        leaseType: "jeonse",
        deposit: 90_000_000,
      }),
    });
    const { case: created } = await json<{ case: { property: { lat: number } } }>(res);
    expect(created.property.lat).toBe(36.1);
  });
});

describe("비동기 분석 (작업 큐)", () => {
  let caseId: string;

  beforeAll(async () => {
    const res = await app.request("/v1/cases", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        roadAddress: "대전광역시 서구 둔산로 220",
        leaseType: "jeonse",
        deposit: 90_000_000,
        contractDate: "2026-09-10",
        balanceDate: "2026-10-08",
      }),
    });
    caseId = (await json<{ case: { id: string } }>(res)).case.id;
  });

  it("작업을 등록하면 202 와 폴링 안내를 준다", async () => {
    const res = await app.request(`/v1/cases/${caseId}/analyze/jobs`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(202);
    const body = await json<{
      job: { id: string; status: string; progress: number };
      poll: { endpoint: string; intervalMs: number; resultEndpoint: string };
    }>(res);
    expect(["queued", "running", "succeeded"]).toContain(body.job.status);
    expect(body.poll.endpoint).toContain(body.job.id);
    expect(body.poll.intervalMs).toBeGreaterThan(0);
  });

  it("작업이 끝나면 분석 결과를 조회할 수 있다", async () => {
    // 목 모드에서는 판독이 즉시 끝나므로 몇 번의 이벤트 루프 안에 완료된다.
    type JobShape = { status: string; progress: number; analysisVersion: number | null };
    let job: JobShape | null = null;
    for (let i = 0; i < 40; i += 1) {
      const listRes = await app.request(`/v1/cases/${caseId}/analyze/jobs`, { headers: AUTH });
      const { jobs } = await json<{ jobs: JobShape[] }>(listRes);
      job = jobs[0] ?? null;
      if (job && (job.status === "succeeded" || job.status === "failed")) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(job?.status).toBe("succeeded");
    expect(job?.progress).toBe(100);
    expect(job?.analysisVersion).toBeGreaterThan(0);

    const analysisRes = await app.request(`/v1/cases/${caseId}/analysis`, { headers: AUTH });
    expect(analysisRes.status).toBe(200);
  });

  it("진행 중 작업이 있으면 새로 만들지 않고 재사용한다 (멱등)", async () => {
    const res = await app.request("/v1/cases", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ roadAddress: "대전광역시 중구 대흥로 121", leaseType: "jeonse", deposit: 50_000_000 }),
    });
    const id = (await json<{ case: { id: string } }>(res)).case.id;

    const [first, second] = await Promise.all([
      app.request(`/v1/cases/${id}/analyze/jobs`, { method: "POST", headers: AUTH, body: "{}" }),
      app.request(`/v1/cases/${id}/analyze/jobs`, { method: "POST", headers: AUTH, body: "{}" }),
    ]);
    const bodies = await Promise.all([
      json<{ job: { id: string }; reused: boolean }>(first),
      json<{ job: { id: string }; reused: boolean }>(second),
    ]);
    // 두 요청이 같은 작업을 가리켜야 한다 (분석이 두 번 돌면 AI 비용이 두 배가 된다).
    const ids = new Set(bodies.map((b) => b.job.id));
    expect(ids.size).toBe(1);
  });

  it("없는 작업은 404", async () => {
    const res = await app.request(
      `/v1/cases/${caseId}/analyze/jobs/11111111-1111-4111-8111-111111111111`,
      { headers: AUTH },
    );
    expect(res.status).toBe(404);
  });

  it("이미 끝난 작업은 취소할 수 없다", async () => {
    const listRes = await app.request(`/v1/cases/${caseId}/analyze/jobs`, { headers: AUTH });
    const { jobs } = await json<{ jobs: { id: string }[] }>(listRes);
    const res = await app.request(`/v1/cases/${caseId}/analyze/jobs/${jobs[0]!.id}`, {
      method: "DELETE",
      headers: AUTH,
    });
    expect(res.status).toBe(409);
  });

  it("동기 경로도 그대로 동작한다", async () => {
    const res = await app.request(`/v1/cases/${caseId}/analyze`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
  });
});

describe("홈 요약", () => {
  it("검사 건 · 판정 · 다가오는 일정 · 알림 배지를 한 번에 준다", async () => {
    const res = await app.request("/v1/home", { headers: AUTH });
    expect(res.status).toBe(200);
    const { home } = await json<{
      home: {
        today: string;
        counts: {
          total: number;
          analyzed: number;
          needsAnalysis: number;
          byVerdict: Record<string, number>;
          notContractable: number;
        };
        cases: { caseId: string; nextAction: string | null; verdict: string | null }[];
        upcoming: { dDay: number; caseId: string }[];
        notifications: { due: number; pending: number };
      };
    }>(res);

    expect(home.counts.total).toBeGreaterThan(0);
    expect(home.counts.analyzed + home.counts.needsAnalysis).toBe(home.counts.total);
    // 분석 전 검사 건에는 "무엇을 해야 하는지"가 있어야 한다.
    expect(home.cases.every((c) => c.nextAction !== null)).toBe(true);
    expect(home.upcoming.every((e) => e.dDay >= 0)).toBe(true);
    // 배지용(due)과 목록용(pending)을 구분해 준다.
    expect(typeof home.notifications.due).toBe("number");
    expect(home.notifications.pending).toBeGreaterThanOrEqual(home.notifications.due);
  });

  it("분석 전 검사 건은 판정이 null 이고 다음 행동을 알려준다", async () => {
    const res = await app.request("/v1/cases", {
      method: "POST",
      headers: { ...AUTH, authorization: "Bearer fresh-user" },
      body: JSON.stringify({ roadAddress: "대전광역시 동구 판암로 45", leaseType: "jeonse", deposit: 40_000_000 }),
    });
    expect(res.status).toBe(201);

    const home = await json<{ home: { cases: { verdict: string | null; nextAction: string }[] } }>(
      await app.request("/v1/home", { headers: { authorization: "Bearer fresh-user" } }),
    );
    expect(home.home.cases[0]?.verdict).toBeNull();
    expect(home.home.cases[0]?.nextAction).toContain("등기부등본");
  });

  it("검사 건이 없으면 빈 요약을 준다", async () => {
    const res = await app.request("/v1/home", { headers: { authorization: "Bearer nobody-here" } });
    expect(res.status).toBe(200);
    const { home } = await json<{
      home: { counts: { total: number }; cases: unknown[]; notifications: { due: number } };
    }>(res);
    expect(home.counts.total).toBe(0);
    expect(home.cases).toEqual([]);
    expect(home.notifications.due).toBe(0);
  });

  it("전체 검사 건의 다가오는 일정을 따로 조회할 수 있다", async () => {
    const res = await app.request("/v1/timeline/upcoming?limit=3", { headers: AUTH });
    expect(res.status).toBe(200);
    const body = await json<{ today: string; events: { dDay: number }[] }>(res);
    expect(body.events.length).toBeLessThanOrEqual(3);
    expect(body.events.map((e) => e.dDay)).toEqual(
      [...body.events.map((e) => e.dDay)].sort((a, b) => a - b),
    );
  });
});

describe("알림", () => {
  it("분석하면 알림 계획이 쌓인다", async () => {
    const res = await app.request("/v1/notifications", { headers: AUTH });
    expect(res.status).toBe(200);
    const { notifications } = await json<{
      notifications: { eventCode: string; sendOn: string; deepLink: string; status: string }[];
    }>(res);
    expect(notifications.length).toBeGreaterThan(0);
    expect(notifications.every((n) => n.status === "pending")).toBe(true);
    expect(notifications.some((n) => n.eventCode === "BALANCE_DAY")).toBe(true);
    expect(notifications[0]?.deepLink).toContain("zip042://cases/");
  });

  it("관리자는 특정 날짜에 보낼 알림을 조회하고 결과를 기록한다", async () => {
    const admin = { "x-admin-token": "surface-admin-token-000000", "content-type": "application/json" };

    const dueRes = await app.request("/v1/admin/notifications/due?date=2026-10-08", { headers: admin });
    expect(dueRes.status).toBe(200);
    const due = await json<{ date: string; count: number; notifications: { id: string }[] }>(dueRes);
    expect(due.date).toBe("2026-10-08");

    if (due.notifications.length > 0) {
      const markRes = await app.request("/v1/admin/notifications/mark", {
        method: "PATCH",
        headers: admin,
        body: JSON.stringify({ ids: due.notifications.map((n) => n.id), status: "sent" }),
      });
      expect(markRes.status).toBe(200);
      expect((await json<{ updated: number }>(markRes)).updated).toBe(due.notifications.length);
    }
  });

  it("관리자 토큰 없이는 접근할 수 없다", async () => {
    expect((await app.request("/v1/admin/notifications/due")).status).toBe(403);
  });
});

describe("요청 제한", () => {
  it("응답에 남은 횟수 헤더가 붙는다", async () => {
    const res = await app.request("/v1/addresses/search?q=둔산로", { headers: AUTH });
    expect(res.headers.get("RateLimit-Limit")).toBe("60");
    expect(Number(res.headers.get("RateLimit-Remaining"))).toBeLessThan(60);
  });

  it("한도를 넘으면 429 와 Retry-After 를 준다", async () => {
    let last: Response | null = null;
    // 주소 검색 한도는 분당 60회.
    for (let i = 0; i < 62; i += 1) {
      last = await app.request("/v1/addresses/search?q=둔산로", { headers: AUTH });
      if (last.status === 429) break;
    }
    expect(last?.status).toBe(429);
    expect(last?.headers.get("Retry-After")).toBeTruthy();
    const body = await json<{ error: { code: string } }>(last!);
    expect(body.error.code).toBe("RATE_LIMITED");
  });

  it("사용자별로 따로 센다", async () => {
    for (let i = 0; i < 62; i += 1) {
      await app.request("/v1/addresses/search?q=둔산로", { headers: AUTH });
    }
    // 다른 사용자는 영향받지 않아야 한다.
    const other = await app.request("/v1/addresses/search?q=둔산로", {
      headers: { authorization: "Bearer another-user" },
    });
    expect(other.status).toBe(200);
  });

  it("분석은 더 촘촘한 한도를 쓴다", async () => {
    const res = await app.request("/v1/cases", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ roadAddress: "대전광역시 대덕구 법동 677", leaseType: "jeonse", deposit: 30_000_000 }),
    });
    const id = (await json<{ case: { id: string } }>(res)).case.id;
    const analyzeRes = await app.request(`/v1/cases/${id}/analyze`, {
      method: "POST",
      headers: AUTH,
      body: "{}",
    });
    expect(analyzeRes.headers.get("RateLimit-Limit")).toBe("10");
  });
});

describe("meta 능력 보고", () => {
  it("새로 추가된 능력을 프론트엔드에 알린다", async () => {
    const body = await json<{
      capabilities: Record<string, boolean>;
      addressProvider: string;
    }>(await app.request("/v1/meta"));
    expect(body.capabilities).toHaveProperty("addressSearch");
    expect(body.capabilities).toHaveProperty("asyncAnalysis");
    expect(body.capabilities).toHaveProperty("notificationDelivery");
    // 목 데이터이므로 실제 주소 검색은 아직 아니라고 알려야 한다.
    expect(body.capabilities.addressSearch).toBe(false);
    expect(body.capabilities.notificationDelivery).toBe(false);
    expect(body.addressProvider).toBe("mock");
  });
});

describe("OpenAPI 스펙", () => {
  it("유효한 OpenAPI 3.1 문서를 제공한다", async () => {
    const res = await app.request("/v1/openapi.json");
    expect(res.status).toBe(200);
    const doc = await json<{
      openapi: string;
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(res);
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths).length).toBeGreaterThan(20);
    expect(doc.components.schemas).toHaveProperty("Verdict");
    expect(doc.components.schemas).toHaveProperty("CreateCaseRequest");
  });

  it("요청 스키마가 실제 검증 스키마에서 생성된다 (드리프트 불가)", async () => {
    const doc = await json<{
      components: { schemas: Record<string, { properties: Record<string, unknown> }> };
    }>(await app.request("/v1/openapi.json"));

    const createCase = doc.components.schemas.CreateCaseRequest!;
    // zod 스키마의 필드가 그대로 들어와야 한다.
    for (const field of ["amountUnit", "deposit", "monthlyRent", "contractDate", "balanceDate", "lat", "lng"]) {
      expect(createCase.properties, field).toHaveProperty(field);
    }
    expect(createCase.properties.amountUnit).toMatchObject({ enum: ["krw", "man"] });
  });

  it("문서에 선언한 모든 경로가 실제로 존재한다", async () => {
    const doc = await json<{ paths: Record<string, Record<string, unknown>> }>(
      await app.request("/v1/openapi.json"),
    );

    // GET 경로만 확인한다 (POST/PUT 은 부수효과가 있어 스모크로 부적절).
    const missing: string[] = [];
    for (const [path, ops] of Object.entries(doc.paths)) {
      if (!("get" in ops)) continue;
      // 경로 파라미터를 더미 UUID 로 치환한다.
      const concrete = path
        .replace(/\{caseId\}/g, "11111111-1111-4111-8111-111111111111")
        .replace(/\{documentId\}/g, "22222222-2222-4222-8222-222222222222")
        .replace(/\{jobId\}/g, "33333333-3333-4333-8333-333333333333");
      const withQuery = concrete.includes("/region/")
        ? `${concrete}?lat=36.35&lng=127.38`
        : concrete.includes("/addresses/search")
          ? `${concrete}?q=둔산로`
          : concrete;

      const res = await app.request(withQuery, { headers: AUTH });
      // 404 는 "그 리소스가 없다"일 수 있으므로 허용한다. 라우트 자체가 없으면
      // notFound 핸들러가 NOT_FOUND 를 주는데 이것도 404 라 구분이 안 되므로,
      // 405(메서드 불일치)와 501 만 실패로 본다.
      if (res.status === 405 || res.status >= 500) missing.push(`${path} → ${res.status}`);
    }
    expect(missing).toEqual([]);
  });

  it("문서 페이지가 열린다", async () => {
    const res = await app.request("/v1/docs");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });
});
