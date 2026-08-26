import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { ZodError } from "zod";
import { corsOrigins, isDemoDeployment, loadEnv } from "./env.js";
import { buildOpenApiDocument } from "./openapi.js";
import { AppError } from "./lib/errors.js";
import { log, setLogLevel } from "./lib/logger.js";
import { todayKst } from "./lib/date.js";
import { requireAdminToken, requireAuth, type AppBindings } from "./middleware/auth.js";
import { RATE_LIMITS, rateLimit } from "./middleware/rate-limit.js";
import { adminRoute } from "./routes/admin.js";
import { devRoute } from "./routes/dev.js";
import { addressRoute } from "./routes/addresses.js";
import { homeRoute } from "./routes/home.js";
import { analysisRoute } from "./routes/analysis.js";
import { casesRoute } from "./routes/cases.js";
import { documentsRoute } from "./routes/documents.js";
import { interviewRoute } from "./routes/interview.js";
import { regionRoute } from "./routes/region.js";
import { scheduleRoute } from "./routes/schedule.js";
import { termsCatalogRoute, termsRoute } from "./routes/terms.js";
import { contractDraftRoute } from "./routes/contract-draft.js";
import { checklistCatalogRoute, checklistRoute } from "./routes/checklist.js";
import { glossaryRoute } from "./routes/glossary.js";
import { isExtractionAvailable } from "./services/extraction.service.js";
import { extractionProvider } from "./services/extraction.service.js";
import { isJusoConfigured } from "./services/public-data/juso.js";
import { isBuildingLedgerConfigured } from "./services/public-data/building-ledger.js";
import { isHousingPriceConfigured } from "./services/public-data/housing-price.js";
import { isBusinessStatusConfigured } from "./services/public-data/business-status.js";
import { isMarketPriceAvailable } from "./services/market-price.service.js";
import { loadHolidays } from "./services/holidays.service.js";
import { isOwnerMatchingEnabled } from "./services/region.service.js";
import { RULES_VERSION } from "./services/analysis.service.js";
import { seedReferenceData, seedSampleCases } from "./mock/bootstrap.js";
import { SCENARIO_KEYS } from "./mock/fixtures.js";
import { addressProviderName, isAddressSearchLive } from "./services/address.service.js";
import { reapStaleJobs } from "./services/job.service.js";
import { EXTRACTION_SCHEMA_VERSION } from "./services/extraction.service.js";

export function createApp() {
  const env = loadEnv();
  setLogLevel(env.LOG_LEVEL);

  const app = new Hono<AppBindings>();

  if (env.mode === "mock") {
    // 참조 데이터(공휴일 · 소액임차인 기준 · 피해주택 더미)를 미리 채워
    // 첫 요청부터 실제와 같은 응답이 나오게 한다.
    seedReferenceData();
    log.warn("목 모드로 실행 중 — 외부 API를 호출하지 않고 픅스처로 응답합니다.", {
      guide: "GET /v1/dev 에서 사용법을 확인하세요.",
    });
  }

  if (isDemoDeployment()) {
    // 목 데이터가 공개 주소로 나가는 상태다. 로그에서 이 사실이 묻히면 안 된다.
    log.warn("⚠️ 데모 배포로 실행 중 — 모든 응답이 가짜 데이터입니다 (ZIP042_DEMO=true)", {
      note: "실서비스에서는 이 플래그를 끄고 Supabase 설정을 채우세요.",
    });

    // 서버리스에서는 **인스턴스마다 인메모리 저장소가 따로** 있고, 콜드 스타트마다 비어 있다.
    // 시연용 검사 건을 부팅 때 채워 두면 어느 인스턴스로 요청이 가도 볼 것이 있다.
    // (사용자가 새로 만든 검사 건은 그 인스턴스에서만 살아 있다 — 데모의 한계다.)
    void seedSampleCases(SCENARIO_KEYS).then(
      (cases) => log.info("데모용 샘플 검사 건을 채웠습니다", { count: cases.length }),
      (err: unknown) =>
        log.warn("데모 시드 실패", { error: err instanceof Error ? err.message : String(err) }),
    );
  }

  // 서버 재시작으로 중단된 분석 작업을 정리한다 (in-process 러너가 사라졌으므로).
  void reapStaleJobs();

  app.use("*", requestId());

  app.use(
    "*",
    cors({
      origin: corsOrigins(env),
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Admin-Token"],
      maxAge: 86_400,
      credentials: true,
    }),
  );

  // 접근 로그. 응답 시간은 느린 AI 호출을 추적하는 데 필요하다.
  app.use("*", async (c, next) => {
    const started = Date.now();
    await next();
    log.info("request", {
      requestId: c.get("requestId"),
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Date.now() - started,
    });
  });

  // ---------------------------------------------------------------------
  // 공개 엔드포인트
  // ---------------------------------------------------------------------

  app.get("/health", (c) => c.json({ ok: true, service: "zip042-backend" }));

  /**
   * 기능 가용성 확인. 프론트엔드가 "시세 조회 불가" 같은 상태를 미리 알 수 있게 한다.
   * 비밀 값은 절대 노출하지 않고 boolean 만 돌려준다.
   */
  app.get("/v1/meta", async (c) => {
    const holidays = await loadHolidays();
    return c.json({
      service: "ZIP 042",
      today: todayKst(),
      rulesVersion: RULES_VERSION,
      extractionSchemaVersion: EXTRACTION_SCHEMA_VERSION,
      capabilities: {
        documentExtraction: isExtractionAvailable(),
        marketPriceLookup: isMarketPriceAvailable(),
        ownerMatching: isOwnerMatchingEnabled(),
        lunarHolidaysSynced: holidays.lunarHolidaysSynced,
        addressSearch: isAddressSearchLive(),
        /** 법정동코드 조회 — 이게 없으면 실거래가 API 가 전부 동작하지 않는다. */
        legalDongLookup: isJusoConfigured(),
        /** 위반건축물 자동 조회 (주소만으로 가능). */
        buildingLedger: isBuildingLedgerConfigured(),
        /** HUG 보증 가능 여부 판정 (공시가격 기준). */
        guaranteeAssessment: isHousingPriceConfigured(),
        /** 법인 임대인 실재·휴폐업 확인. */
        businessVerification: isBusinessStatusConfigured(),
        /**
         * 비동기 분석 사용 가능 여부.
         * 서버리스에서는 응답 후 백그라운드 실행이 보장되지 않으므로, 그 환경에서는
         * 프론트엔드가 동기 경로를 쓰도록 false 로 알린다.
         */
        asyncAnalysis: !process.env.VERCEL,
        notificationDelivery: false,
      },
      addressProvider: addressProviderName(),
      /** 어떤 모델로 판독하는지. 키를 노출하지 않고 이름과 사유만 알린다. */
      extractionProvider: (() => {
        const p = extractionProvider();
        return { active: p.active, reason: p.reason };
      })(),
      mode: env.mode,
      /**
       * 목 데이터를 공개 배포한 상태. 프론트엔드는 이 값이 true 면
       * "데모 데이터" 배너를 반드시 띄워야 한다.
       */
      demo: isDemoDeployment(),
      regionRiskDefaultRadiusM: env.REGION_RISK_RADIUS_M,
      disclaimer: isDemoDeployment()
        ? "⚠️ 데모 배포입니다. 실제 서류를 판독하지 않고 미리 만들어 둔 가짜 데이터로 응답합니다. " +
          "실제 계약 판단에 절대 사용하지 마세요."
        : "ZIP 042의 판정은 참고용 점검이며 법률 자문이 아닙니다. 최종 판단 전 전문가와 상담하세요.",
    });
  });

  // 교육용 콘텐츠는 로그인 없이 볼 수 있게 둔다.
  // 계약 전에 알아야 할 정보에 가입을 요구하면 정작 필요한 사람이 못 본다.
  app.route("/v1", termsCatalogRoute);
  app.route("/v1", checklistCatalogRoute);
  app.route("/v1", glossaryRoute);

  /**
   * OpenAPI 문서. 프론트엔드는 이걸로 타입 클라이언트를 생성할 수 있다:
   *   npx openapi-typescript http://localhost:8787/v1/openapi.json -o src/lib/api.d.ts
   */
  app.get("/v1/openapi.json", (c) => {
    const url = new URL(c.req.url);
    return c.json(buildOpenApiDocument(`${url.protocol}//${url.host}`));
  });

  /** 브라우저에서 읽는 API 문서. */
  app.get("/v1/docs", (c) =>
    c.html(`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ZIP 042 API</title>
</head>
<body>
  <div id="app"></div>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  <script>
    // CDN 을 못 쓰는 환경(사내망·오프라인)에서는 /v1/openapi.json 을 직접 열어 보세요.
    Scalar.createApiReference('#app', { url: '/v1/openapi.json', theme: 'default' });
  </script>
</body>
</html>`),
  );

  // ---------------------------------------------------------------------
  // 미들웨어 적용 범위
  //
  // 하위 앱에 `use("*")` 로 붙이면 상위 프리픽스 전체(/v1/*)에 걸려 관리자 경로까지
  // 사용자 인증을 요구하게 된다. 그래서 인증이 필요한 경로를 **명시적으로 열거**한다.
  // (Hono 의 `/x/*` 패턴은 `/x` 자체를 포함하지 않으므로 두 형태를 모두 등록한다.)
  // ---------------------------------------------------------------------

  const AUTH_PATHS = [
    "/v1/cases",
    "/v1/cases/*",
    "/v1/region",
    "/v1/region/*",
    "/v1/schedule/*",
    "/v1/addresses/*",
    "/v1/home",
    "/v1/timeline/*",
    "/v1/notifications",
    // 목록(`GET /v1/checklist`)은 공개, 체크 상태만 인증이 필요하다.
    "/v1/checklist/progress",
  ] as const;
  for (const path of AUTH_PATHS) app.use(path, requireAuth);

  // 요청 제한은 인증 **뒤에** 붙인다. 그래야 IP 가 아니라 사용자 단위로 센다.
  // 분석은 AI 호출이 발생하므로 가장 촘촘하게 잡는다 (비용 사고 방지).
  app.use("/v1/cases/:caseId/analyze", rateLimit(RATE_LIMITS.analyze));
  app.use("/v1/cases/:caseId/analyze/jobs", rateLimit(RATE_LIMITS.analyze));
  // 계약서 초안도 캐시 미스 시 ensureExtractions 를 거쳐 AI 호출로 이어질 수 있다.
  app.use("/v1/cases/:caseId/contract-draft", rateLimit(RATE_LIMITS.analyze));
  app.use("/v1/cases/:caseId/documents/upload-url", rateLimit(RATE_LIMITS.upload));
  app.use("/v1/addresses/*", rateLimit(RATE_LIMITS.address));
  app.use("/v1/cases", rateLimit(RATE_LIMITS.write));

  app.use("/v1/admin/*", requireAdminToken);

  // ---------------------------------------------------------------------
  // 라우터 마운트
  // ---------------------------------------------------------------------

  app.route("/v1/cases", casesRoute);
  // documents · analysis · interview 는 /cases/:caseId 하위 경로를 직접 선언한다.
  app.route("/v1/cases", documentsRoute);
  app.route("/v1/cases", analysisRoute);
  app.route("/v1/cases", interviewRoute);
  app.route("/v1/region", regionRoute);
  app.route("/v1", scheduleRoute);
  app.route("/v1", addressRoute);
  app.route("/v1", homeRoute);
  app.route("/v1", checklistRoute);
  // termsRoute 는 /cases/:caseId/... 경로를 직접 선언하므로 /v1 에 붙인다.
  app.route("/v1", termsRoute);
  app.route("/v1/cases", contractDraftRoute);
  app.route("/v1/admin", adminRoute);

  // 개발용 라우터는 목 모드에서만 존재한다. live 모드에서는 404 가 난다.
  if (env.mode === "mock") app.route("/v1", devRoute);

  // ---------------------------------------------------------------------
  // 오류 처리
  // ---------------------------------------------------------------------

  app.notFound((c) =>
    c.json({ error: { code: "NOT_FOUND", message: "해당 엔드포인트가 없습니다." } }, 404),
  );

  app.onError((err, c) => {
    const requestIdValue = c.get("requestId");

    if (err instanceof AppError) {
      // 4xx 는 사용자 입력 문제이므로 warn, 5xx 는 error.
      const level = err.status >= 500 ? "error" : "warn";
      log[level]("app error", {
        requestId: requestIdValue,
        code: err.code,
        message: err.message,
        detail: err.detail,
      });
      return c.json(
        { error: { code: err.code, message: err.message, detail: err.detail, requestId: requestIdValue } },
        err.status,
      );
    }

    if (err instanceof ZodError) {
      return c.json(
        {
          error: {
            code: "VALIDATION_FAILED",
            message: "입력값을 확인해 주세요.",
            issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
            requestId: requestIdValue,
          },
        },
        400,
      );
    }

    if (err instanceof HTTPException) {
      return c.json(
        { error: { code: "HTTP_ERROR", message: err.message, requestId: requestIdValue } },
        err.status,
      );
    }

    // 예상하지 못한 오류는 내부 메시지를 그대로 노출하지 않는다.
    log.error("unhandled error", {
      requestId: requestIdValue,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return c.json(
      {
        error: {
          code: "INTERNAL",
          message: "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
          requestId: requestIdValue,
        },
      },
      500,
    );
  });

  return app;
}
