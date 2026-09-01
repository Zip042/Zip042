import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { badRequest } from "../lib/errors.js";
import { todayKst } from "../lib/date.js";
import type { AppBindings } from "../middleware/auth.js";
import {
  blobStats,
  MOCK_DEFAULT_USER_ID,
  mockUserIdFromToken,
  putBlob,
  resolveUploadToken,
} from "../mock/client.js";
import { resetAll, seedReferenceData, seedSampleCases } from "../mock/bootstrap.js";
import { buildScenario, SCENARIO_KEYS, type ScenarioKey } from "../mock/fixtures.js";
import { store } from "../mock/store.js";

/**
 * 개발용 엔드포인트 (목 모드에서만 마운트된다).
 *
 * 목적: 프론트엔드가 API 키 · Supabase 없이 곧바로 붙어 개발할 수 있게 하는 것.
 * live 모드에서는 app.ts 가 이 라우터를 등록하지 않으므로 존재하지 않는 경로가 된다.
 *
 * 인증도 걸지 않는다 — 목 모드 자체가 인증을 흉내내지 않기 때문이다.
 * (운영 환경에서 목 모드로 부팅하는 것은 env 검증 단계에서 차단된다.)
 */

export const devRoute = new Hono<AppBindings>();

const scenarioKeySchema = z.enum(SCENARIO_KEYS as [ScenarioKey, ...ScenarioKey[]]);

/** 목 모드 사용 안내. 프론트엔드가 여기부터 읽으면 된다. */
devRoute.get("/dev", (c) => {
  return c.json({
    mode: "mock",
    description:
      "외부 API 없이 동작하는 개발 모드입니다. 모든 판독 결과와 시세는 고정 픅스처이며, " +
      "데이터는 메모리에만 있으므로 서버를 재시작하면 사라집니다.",
    auth: {
      how: "Authorization 헤더에 아무 문자열이나 보내면 됩니다. 토큰이 곧 사용자 식별자입니다.",
      example: "Authorization: Bearer dev",
      note: "`dev` → 기본 사용자, `dev:<uuid>` → 지정 사용자. 같은 토큰은 항상 같은 사용자입니다.",
      defaultUserId: MOCK_DEFAULT_USER_ID,
    },
    endpoints: {
      "GET /v1/dev/scenarios": "문서 판독 시나리오 목록",
      "POST /v1/dev/seed": "시나리오별 샘플 검사 건 생성 + 분석 실행",
      "POST /v1/dev/reset": "모든 목 데이터 초기화",
      "GET /v1/dev/state": "현재 메모리 저장소 상태",
      "PUT /v1/dev/storage/:token": "서명 업로드 URL 이 가리키는 파일 수신 엔드포인트",
    },
    quickStart: [
      "1. POST /v1/dev/seed  → 샘플 검사 건 10건이 만들어집니다.",
      "2. GET /v1/cases (Authorization: Bearer dev) → 목록 확인",
      "3. GET /v1/cases/{caseId}/analysis → 분석 결과 확인",
    ],
    limitations: [
      "RLS 를 흉내내지 않습니다. 사용자 격리 검증은 실제 Postgres 에서 하세요.",
      "문서 내용은 읽지 않습니다. 어떤 파일을 올려도 시나리오 픅스처가 반환됩니다.",
      "시세는 건물 유형 · 지역코드로 계산한 고정값입니다.",
    ],
  });
});

/** 시나리오 목록 — 프론트엔드가 "어떤 화면을 볼 수 있는지" 파악하는 데 쓴다. */
devRoute.get("/dev/scenarios", (c) => {
  const today = todayKst();
  return c.json({
    scenarios: SCENARIO_KEYS.map((key) => {
      const b = buildScenario(key, today);
      return {
        key,
        label: b.label,
        description: b.description,
        expectedVerdict: b.expectedVerdict,
        depositKrw: b.depositKrw,
        monthlyRentKrw: b.monthlyRentKrw,
        marketPriceKrw: b.marketPriceKrw,
        buildingType: b.buildingType,
      };
    }),
    usage: {
      onDocumentRegister:
        "POST /v1/cases/{caseId}/documents 의 body 에 mockScenario: '<key>' 를 넣으면 해당 시나리오로 판독됩니다.",
      byFileName: "파일명에 키가 포함되어 있으면(예: 등기부_trust.pdf) 자동으로 그 시나리오가 적용됩니다.",
      fallback: "둘 다 없으면 mortgage_moderate 시나리오가 쓰입니다.",
    },
  });
});

/** 샘플 검사 건 생성. 기본은 전체 시나리오. */
devRoute.post(
  "/dev/seed",
  zValidator(
    "json",
    z
      .object({
        scenarios: z.array(scenarioKeySchema).min(1).max(20).optional(),
        /** 어떤 사용자 소유로 만들지. 비우면 기본 개발 사용자. */
        userToken: z.string().max(200).optional(),
        /** true 면 기존 데이터를 먼저 비운다. */
        reset: z.boolean().default(false),
      })
      .default({ reset: false }),
  ),
  async (c) => {
    const body = c.req.valid("json");
    if (body.reset) resetAll();
    else seedReferenceData();

    const userId = body.userToken ? mockUserIdFromToken(body.userToken) : MOCK_DEFAULT_USER_ID;
    const cases = await seedSampleCases(body.scenarios ?? SCENARIO_KEYS, userId);

    return c.json({
      seeded: cases.length,
      userId,
      authHeader: `Bearer ${body.userToken ?? "dev"}`,
      cases,
    });
  },
);

devRoute.post("/dev/reset", (c) => {
  resetAll();
  return c.json({ ok: true, state: store.stats() });
});

devRoute.get("/dev/state", (c) => {
  return c.json({
    tables: store.stats(),
    uploads: blobStats(),
    today: todayKst(),
  });
});

/**
 * 서명 업로드 URL 수신 엔드포인트.
 *
 * 목 모드의 `createSignedUploadUrl` 이 이 경로를 가리키므로, 프론트엔드는 실제 Supabase 를
 * 붙였을 때와 **똑같은 3단계 업로드 코드**를 그대로 쓸 수 있다.
 */
devRoute.put(
  "/dev/storage/:token",
  zValidator("param", z.object({ token: z.string().min(1) })),
  async (c) => {
    const { token } = c.req.valid("param");
    const path = resolveUploadToken(token);
    if (!path) throw badRequest("업로드 토큰이 유효하지 않습니다. upload-url 을 다시 발급받으세요.");

    const bytes = Buffer.from(await c.req.arrayBuffer());
    if (bytes.byteLength === 0) throw badRequest("빈 파일은 업로드할 수 없습니다.");

    putBlob(path, bytes, c.req.header("content-type") ?? "application/octet-stream");
    return c.json({ ok: true, path, sizeBytes: bytes.byteLength });
  },
);

/** 업로드된 파일 열람 (목 모드의 createSignedUrl 이 가리키는 경로). */
devRoute.get(
  "/dev/storage/:path",
  zValidator("param", z.object({ path: z.string().min(1) })),
  (c) => {
    const { path } = c.req.valid("param");
    // 파일 내용을 그대로 돌려줄 필요는 없다. 프론트엔드는 URL 이 존재하는지만 확인한다.
    return c.json({
      path: decodeURIComponent(path),
      note: "목 모드에서는 파일 내용을 돌려주지 않습니다. 실제 Supabase 에서는 서명 URL 로 원본이 내려갑니다.",
    });
  },
);
