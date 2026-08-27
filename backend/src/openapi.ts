import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodType } from "zod";
import { RULES_VERSION } from "./services/analysis.service.js";
import { EXTRACTION_SCHEMA_VERSION } from "./services/extraction.service.js";
import { RATE_LIMITS } from "./middleware/rate-limit.js";
import { GLOSSARY_CATEGORIES } from "./domain/glossary.js";
import {
  analyzeSchema,
  createCaseSchema,
  interviewAnswerSchema,
  marketPriceOverrideSchema,
  registerDocumentSchema,
  updateScheduleSchema,
  uploadUrlSchema,
} from "./schemas/case.js";

/**
 * OpenAPI 3.1 문서.
 *
 * ## 왜 손으로 쓰는가
 *
 * `@hono/zod-openapi` 로 바꾸면 라우트 전체를 다시 써야 하고, 그 이득이 지금 시점에는
 * 크지 않다. 대신 **요청 스키마는 실제 검증에 쓰는 zod 스키마에서 생성**하므로
 * 요청 형식은 코드와 어긋날 수 없다. 응답은 핵심 객체만 명시하고, 전체 형태는
 * `src/api-types.ts`(프론트엔드가 그대로 복사해 쓰는 타입)에서 제공한다.
 *
 * 프론트엔드는 이 문서로 타입 클라이언트를 생성할 수 있다:
 *   npx openapi-typescript http://localhost:8787/v1/openapi.json -o src/lib/api.d.ts
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function schema(zod: ZodType<any>, name: string): Record<string, unknown> {
  const generated = zodToJsonSchema(zod, {
    target: "openApi3",
    name,
    $refStrategy: "none",
  }) as Record<string, unknown>;
  // name 을 주면 { definitions: { [name]: {...} } } 형태로 감싸서 나온다. 본문만 꺼낸다.
  const definitions = generated.definitions as Record<string, unknown> | undefined;
  return (definitions?.[name] as Record<string, unknown>) ?? generated;
}

const RISK_LEVEL = {
  type: "string",
  enum: ["safe", "caution", "danger", "critical"],
  description: "안전 / 주의 / 위험 / 매우 위험",
} as const;

const ERROR_RESPONSE = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: {
          type: "string",
          enum: [
            "BAD_REQUEST",
            "UNAUTHORIZED",
            "FORBIDDEN",
            "NOT_FOUND",
            "CONFLICT",
            "UNPROCESSABLE",
            "VALIDATION_FAILED",
            "RATE_LIMITED",
            "UPSTREAM_FAILED",
            "INTERNAL",
          ],
        },
        message: { type: "string", description: "사용자에게 그대로 보여줄 수 있는 한국어 메시지" },
        issues: {
          type: "array",
          items: {
            type: "object",
            properties: { path: { type: "string" }, message: { type: "string" } },
          },
        },
        requestId: { type: "string" },
      },
    },
  },
} as const;

const FINDING = {
  type: "object",
  required: ["code", "category", "severity", "weight", "title", "description"],
  properties: {
    code: { type: "string", example: "RIGHTS_TRUST_REGISTERED" },
    category: {
      type: "string",
      enum: ["rights", "valuation", "schedule", "document", "region", "contract"],
    },
    kind: {
      type: "string",
      enum: ["risk", "info_gap"],
      description:
        "risk = 실제로 존재하는 위험 / info_gap = 확인하지 못한 항목. " +
        "info_gap 은 위험 점수에 더해지지 않고 informationGaps 로 따로 나간다.",
    },
    severity: RISK_LEVEL,
    weight: { type: "integer", description: "위험 점수 기여도" },
    title: { type: "string", description: "쉬운 말 제목" },
    description: { type: "string", description: "왜 위험한지" },
    action: { type: "string", nullable: true, description: "무엇을 요구/확인해야 하는지" },
    evidence: { type: "object", additionalProperties: true, description: "판정 근거 (숫자·문서 위치)" },
  },
} as const;

const SPECIAL_TERM = {
  type: "object",
  required: ["code", "category", "title", "priority", "required", "reason", "clauseText"],
  properties: {
    code: { type: "string", example: "TERM_NO_NEW_ENCUMBRANCE" },
    category: { type: "string", example: "권리관계" },
    title: { type: "string" },
    priority: { type: "integer", description: "낮을수록 먼저 보여준다" },
    required: { type: "boolean", description: "true 면 이 특약 없이는 계약을 권하지 않음" },
    reason: { type: "string" },
    clauseText: {
      type: "string",
      description: "계약서 특약사항란에 그대로 옮겨 적을 수 있는 완성 문장 (날짜·금액이 채워져 있음)",
    },
    triggeredBy: { type: "array", items: { type: "string" }, description: "이 특약을 유발한 finding 코드" },
  },
} as const;

const CHECKLIST_ITEM = {
  type: "object",
  required: ["id", "stage", "label", "note", "required", "relatedTerms"],
  properties: {
    id: {
      type: "string",
      example: "issued_registry",
      description: "체크 상태 저장의 키. 서버가 이 값을 바꾸지 않는다.",
    },
    stage: {
      type: "string",
      enum: ["before_visit", "contract_day", "balance_move_in", "after_move_in"],
    },
    label: { type: "string" },
    note: { type: "string", nullable: true, description: "왜 필요한지. 체크되지 않은 항목에만 보여주면 화면이 덜 시끄럽다." },
    required: { type: "boolean", description: "true 면 빠뜨렸을 때 보증금을 잃을 수 있는 항목" },
    relatedTerms: {
      type: "array",
      items: { type: "string" },
      description: "관련 용어 코드 (GET /v1/glossary 의 code)",
    },
  },
} as const;

const CHECKLIST_STAGE = {
  type: "object",
  required: ["code", "label", "order", "items"],
  properties: {
    code: { type: "string", example: "before_visit" },
    label: { type: "string", example: "집 보러 가기 전" },
    order: { type: "integer" },
    items: { type: "array", items: { $ref: "#/components/schemas/ChecklistItem" } },
  },
} as const;

const CHECKLIST_PROGRESS = {
  type: "object",
  required: ["total", "done", "requiredTotal", "requiredDone", "missingRequired", "byStage"],
  properties: {
    total: { type: "integer" },
    done: { type: "integer" },
    requiredTotal: { type: "integer" },
    requiredDone: {
      type: "integer",
      description: "필수만 따로 센다. 전체 진행률만 보면 필수를 빠뜨린 채 90%가 될 수 있다.",
    },
    missingRequired: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          stage: { type: "string" },
          label: { type: "string" },
        },
      },
    },
    byStage: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string" },
          label: { type: "string" },
          total: { type: "integer" },
          done: { type: "integer" },
        },
      },
    },
  },
} as const;

const CHECKLIST_STATE = {
  type: "object",
  required: ["checkedItemIds", "progress", "updatedAt"],
  properties: {
    checkedItemIds: { type: "array", items: { type: "string" } },
    progress: { $ref: "#/components/schemas/ChecklistProgress" },
    updatedAt: { type: "string", format: "date-time", nullable: true },
  },
} as const;

const GLOSSARY_TERM = {
  type: "object",
  required: ["code", "term", "aliases", "category", "tag", "summary", "description", "relatedFindings", "legalBasis"],
  properties: {
    code: { type: "string", example: "G_MAX_CLAIM" },
    term: { type: "string", example: "채권최고액" },
    aliases: { type: "array", items: { type: "string" }, description: "검색 전용. 화면에 노출하지 않는다." },
    category: { type: "string", enum: ["등기부", "보증금", "계약서", "절차"] },
    tag: {
      type: "string",
      nullable: true,
      enum: ["risk", "must_do"],
      description: "risk = 위험 신호, must_do = 꼭 챙기기. 중립 용어는 null.",
    },
    summary: { type: "string", description: "접혀 있을 때 보여줄 한 줄" },
    description: { type: "string", description: "펼쳤을 때의 설명. **강조**는 마크다운 볼드." },
    relatedFindings: {
      type: "array",
      items: { type: "string" },
      description: "이 용어가 설명하는 판정 항목 코드 (Finding.code 와 일치)",
    },
    legalBasis: { type: "array", items: { type: "string" }, example: ["주택임대차보호법 제3조"] },
  },
} as const;

const FRAUD_CASE = {
  type: "object",
  required: ["code", "title", "how", "signals", "prevention"],
  properties: {
    code: { type: "string", example: "F_FORGED_DELEGATION" },
    title: { type: "string" },
    how: { type: "string", description: "어떻게 당하는가" },
    signals: { type: "array", items: { type: "string" }, description: "계약 전에 알아챌 수 있는 신호" },
    prevention: { type: "string", description: "무엇을 하면 막을 수 있는가" },
  },
} as const;

const RELIEF_STEP = {
  type: "object",
  required: ["order", "title", "detail", "warning"],
  properties: {
    order: { type: "integer", description: "순서가 중요하다. 배열 순서를 바꿔 보여주지 말 것." },
    title: { type: "string" },
    detail: { type: "string" },
    warning: {
      type: "string",
      nullable: true,
      description: "순서를 지키지 않으면 생기는 손해. 있으면 눈에 띄게 보여줄 것.",
    },
  },
} as const;

const SCHEDULE_EVENT = {
  type: "object",
  required: ["code", "date", "severity", "title", "description", "checklist"],
  properties: {
    code: { type: "string", example: "BALANCE_DAY" },
    date: { type: "string", format: "date" },
    effectiveAt: {
      type: "string",
      format: "date-time",
      nullable: true,
      description: "법적 효력 발생 시점 (대항력은 전입신고 다음 날 0시 KST)",
    },
    severity: RISK_LEVEL,
    title: { type: "string" },
    description: { type: "string" },
    dDay: { type: "integer", nullable: true },
    checklist: {
      type: "array",
      items: {
        type: "object",
        required: ["label", "critical"],
        properties: {
          label: { type: "string" },
          why: { type: "string", nullable: true },
          critical: { type: "boolean", description: "빠뜨리면 되돌릴 수 없는 항목" },
        },
      },
    },
  },
} as const;

const CASE = {
  type: "object",
  required: ["id", "status", "property", "terms", "schedule"],
  properties: {
    id: { type: "string", format: "uuid" },
    title: { type: "string", nullable: true },
    status: { type: "string", enum: ["draft", "ready", "analyzing", "analyzed", "failed"] },
    property: {
      type: "object",
      properties: {
        roadAddress: { type: "string", nullable: true },
        jibunAddress: { type: "string", nullable: true },
        detailAddress: { type: "string", nullable: true },
        regionCode: { type: "string", nullable: true, description: "법정동코드. 앞 5자리가 시군구코드" },
        sigungu: { type: "string", nullable: true },
        lat: { type: "number", nullable: true },
        lng: { type: "number", nullable: true },
        buildingType: { type: "string", nullable: true },
        exclusiveAreaM2: { type: "number", nullable: true },
        floor: { type: "integer", nullable: true },
        totalFloors: { type: "integer", nullable: true },
        builtYear: { type: "integer", nullable: true },
        householdCount: { type: "integer", nullable: true },
      },
    },
    lessor: {
      type: "object",
      properties: {
        businessRegistrationNumber: { type: "string", nullable: true },
      },
    },
    terms: {
      type: "object",
      properties: {
        leaseType: { type: "string", enum: ["jeonse", "monthly", "semi_jeonse"] },
        depositKrw: { type: "integer", description: "원 단위" },
        monthlyRentKrw: { type: "integer" },
        maintenanceFeeKrw: { type: "integer" },
        contractTermMonths: { type: "integer" },
        userMarketPriceKrw: { type: "integer", nullable: true },
      },
    },
    schedule: {
      type: "object",
      properties: {
        contractDate: { type: "string", format: "date", nullable: true },
        balanceDate: { type: "string", format: "date", nullable: true },
        moveInDate: { type: "string", format: "date", nullable: true },
        residentRegistrationDate: { type: "string", format: "date", nullable: true },
        confirmedDatePlan: { type: "string", format: "date", nullable: true },
      },
    },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
} as const;

const VERDICT = {
  type: "object",
  required: ["verdict", "verdictLabel", "score", "contractable", "headline", "summary"],
  properties: {
    verdict: RISK_LEVEL,
    verdictLabel: { type: "string", example: "주의" },
    score: {
      type: "integer",
      minimum: 0,
      maximum: 100,
      description: "위험 점수. info_gap(확인 못 한 항목)은 포함되지 않는다.",
    },
    contractable: {
      type: "boolean",
      description:
        "계약을 진행해도 되는지. 치명적 위험이 없고 점수 55 미만이며 blockingGaps 가 비어야 true.",
    },
    conditions: { type: "array", items: { type: "string" }, description: "계약 전 충족해야 할 조건" },
    headline: { type: "string", description: "한 줄 요약 (쉬운 말)" },
    summary: { type: "string", description: "본문 요약" },
    topFindings: { type: "array", items: FINDING, description: "실제 위험 상위 항목 (info_gap 제외)" },
    informationGaps: {
      type: "array",
      items: FINDING,
      description: "확인하지 못한 항목. '위험하다'가 아니라 '모른다'에 해당한다.",
    },
    blockingGaps: {
      type: "array",
      items: FINDING,
      description: "이것을 확인하지 못하면 판정을 완료할 수 없는 항목. 하나라도 있으면 contractable=false.",
    },
    checkedCompletely: { type: "boolean" },
    categoryLevels: { type: "object", additionalProperties: RISK_LEVEL },
    requiredActions: { type: "array", items: { type: "string" } },
    counts: { type: "object", additionalProperties: { type: "integer" } },
  },
} as const;

const ANALYSIS = {
  type: "object",
  required: ["verdict", "findings", "specialTerms", "valuation", "schedule", "caveats"],
  properties: {
    verdict: { $ref: "#/components/schemas/Verdict" },
    score: { type: "integer" },
    contractable: { type: "boolean" },
    headline: { type: "string" },
    summary: { type: "string" },
    findings: { type: "array", items: { $ref: "#/components/schemas/Finding" } },
    specialTerms: { type: "array", items: { $ref: "#/components/schemas/SpecialTerm" } },
    valuation: {
      type: "object",
      properties: {
        evaluable: { type: "boolean" },
        level: RISK_LEVEL,
        burdenRatio: { type: "number", nullable: true, description: "(선순위 채권 + 내 보증금) / 시세" },
        burdenRatioPercent: { type: "number", nullable: true },
        seniorClaimsKrw: { type: "integer", nullable: true },
        seniorDepositUnknown: {
          type: "boolean",
          description: "다가구 선순위 보증금을 모르는 상태. true 면 실제 위험이 더 클 수 있다.",
        },
        marketPriceKrw: { type: "integer", nullable: true },
        marketPrice: {
          type: "object",
          properties: {
            estimatedKrw: { type: "integer" },
            source: {
              type: "string",
              enum: ["molit_rtms", "user_input", "unavailable"],
              description: "unavailable 이면 시세를 못 구한 것이다. estimatedKrw 를 믿지 말 것.",
            },
            method: { type: "string" },
            confidence: { type: "number" },
          },
        },
        simulation: { type: "object", additionalProperties: true },
        guarantee: { type: "object", additionalProperties: true },
      },
    },
    schedule: {
      type: "object",
      properties: {
        evaluable: { type: "boolean" },
        level: RISK_LEVEL,
        opposingPowerEffectiveAt: { type: "string", nullable: true, format: "date-time" },
        priorityRightEffectiveAt: { type: "string", nullable: true, format: "date-time" },
        unprotectedWindow: {
          type: "object",
          nullable: true,
          properties: { days: { type: "integer" }, from: { type: "string" }, to: { type: "string" } },
          description: "잔금일과 대항력 발생일 사이의 무방비 구간.",
        },
        events: { type: "array", items: { $ref: "#/components/schemas/ScheduleEvent" } },
      },
    },
    region: { type: "object", additionalProperties: true },
    crossCheck: { type: "object", additionalProperties: true },
    documents: { type: "object", additionalProperties: true },
    caveats: {
      type: "array",
      items: { type: "string" },
      description: "UI 에 반드시 노출해야 하는 주의 문구.",
    },
    rulesVersion: { type: "string" },
    version: { type: "integer" },
    createdAt: { type: "string", format: "date-time" },
  },
} as const;

const ANALYSIS_JOB = {
  type: "object",
  required: ["id", "caseId", "status", "progress"],
  properties: {
    id: { type: "string", format: "uuid" },
    caseId: { type: "string", format: "uuid" },
    status: {
      type: "string",
      enum: ["queued", "running", "succeeded", "failed", "canceled"],
    },
    progress: { type: "integer", minimum: 0, maximum: 100 },
    step: { type: "string", nullable: true, description: "사용자에게 보여줄 진행 단계 문구" },
    analysisVersion: { type: "integer", nullable: true },
    errorCode: { type: "string", nullable: true },
    errorMessage: { type: "string", nullable: true },
    createdAt: { type: "string", format: "date-time" },
    startedAt: { type: "string", format: "date-time", nullable: true },
    finishedAt: { type: "string", format: "date-time", nullable: true },
  },
} as const;

const ADDRESS_RESULT = {
  type: "object",
  required: ["roadAddress", "sigungu", "regionCode", "lat", "lng", "source"],
  properties: {
    roadAddress: { type: "string" },
    jibunAddress: { type: "string", nullable: true },
    buildingName: { type: "string", nullable: true },
    sigungu: { type: "string" },
    legalDong: { type: "string", nullable: true },
    regionCode: { type: "string", description: "법정동코드. 앞 5자리가 실거래가 API 의 LAWD_CD" },
    postalCode: { type: "string", nullable: true },
    lat: { type: "number" },
    lng: { type: "number" },
    source: { type: "string", enum: ["mock", "kakao", "vworld"] },
  },
} as const;

// ---------------------------------------------------------------------------

const jsonBody = (schemaRef: unknown, description?: string) => ({
  description,
  required: true,
  content: { "application/json": { schema: schemaRef } },
});

const jsonResponse = (description: string, schemaRef: unknown) => ({
  description,
  content: { "application/json": { schema: schemaRef } },
});

const errorResponses = {
  "400": jsonResponse("입력값 오류", { $ref: "#/components/schemas/Error" }),
  "401": jsonResponse("인증 필요", { $ref: "#/components/schemas/Error" }),
  "404": jsonResponse("대상 없음", { $ref: "#/components/schemas/Error" }),
  "429": jsonResponse("요청 제한 초과", { $ref: "#/components/schemas/Error" }),
};

const caseIdParam = {
  name: "caseId",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};

export function buildOpenApiDocument(serverUrl = "http://localhost:8787"): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "ZIP 042 API",
      version: `rules-${RULES_VERSION} / extraction-${EXTRACTION_SCHEMA_VERSION}`,
      description: [
        "사회초년생을 위한 원룸 계약 안전 검사 서비스 백엔드.",
        "",
        "## 인증",
        "`Authorization: Bearer <Supabase access token>`",
        "목 모드(`ZIP042_MODE=mock`)에서는 아무 문자열이나 보내면 되고, 토큰이 곧 사용자 식별자입니다.",
        "",
        "## 시작하기",
        "1. `GET /v1/meta` — 기능 가용성 확인 (시세 조회 가능 여부 등)",
        "2. `GET /v1/addresses/search` — 주소를 골라 좌표·법정동코드를 얻습니다 (**필수**)",
        "3. `POST /v1/cases` — 검사 건 생성",
        "4. `POST /v1/cases/{caseId}/documents/upload-url` → PUT → `POST .../documents`",
        "5. `POST /v1/cases/{caseId}/analyze/jobs` — 비동기 분석 (권장) 또는 `POST .../analyze` (동기)",
        "",
        "## 판정의 두 축",
        "`verdict.score` 는 **실제 위험**만 반영합니다. 확인하지 못한 항목은 `informationGaps` 로",
        "따로 나가고, 그중 판정을 완료할 수 없게 만드는 것은 `blockingGaps` 입니다.",
        "`blockingGaps` 가 비어 있지 않으면 `contractable` 은 false 이며, 이때 UI 는",
        '"위험합니다"가 아니라 **"아직 판단할 수 없습니다"** 로 표현해야 합니다.',
        "",
        "## 주의",
        "모든 판정 응답에는 `caveats` / `disclaimer` 가 포함됩니다. **법률 자문이 아니라는 고지를**",
        "**UI 에 반드시 노출해야 합니다.**",
      ].join("\n"),
    },
    servers: [{ url: serverUrl }],
    tags: [
      { name: "meta", description: "기능 가용성 · 스펙" },
      { name: "addresses", description: "주소 검색 · 지오코딩" },
      { name: "cases", description: "검사 건" },
      { name: "documents", description: "서류 업로드" },
      { name: "analysis", description: "분석 실행 · 결과" },
      { name: "schedule", description: "일정 가공 · 타임라인" },
      { name: "interview", description: "대화형 후속 질문" },
      { name: "special-terms", description: "특약 추천" },
      { name: "contract-draft", description: "계약서 초안" },
      { name: "region", description: "지역 위험 레이어" },
      { name: "home", description: "홈 요약 · 알림" },
      { name: "checklist", description: "계약 단계별 체크리스트" },
      { name: "glossary", description: "용어사전 · 사기 수법 · 피해 대응" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        adminToken: { type: "apiKey", in: "header", name: "X-Admin-Token" },
      },
      schemas: {
        Error: ERROR_RESPONSE,
        RiskLevel: RISK_LEVEL,
        Finding: FINDING,
        SpecialTerm: SPECIAL_TERM,
        ScheduleEvent: SCHEDULE_EVENT,
        Case: CASE,
        Verdict: VERDICT,
        Analysis: ANALYSIS,
        AnalysisJob: ANALYSIS_JOB,
        AddressResult: ADDRESS_RESULT,
        ChecklistItem: CHECKLIST_ITEM,
        ChecklistStage: CHECKLIST_STAGE,
        ChecklistProgress: CHECKLIST_PROGRESS,
        ChecklistState: CHECKLIST_STATE,
        GlossaryTerm: GLOSSARY_TERM,
        FraudCase: FRAUD_CASE,
        ReliefStep: RELIEF_STEP,
        CreateCaseRequest: schema(createCaseSchema, "CreateCaseRequest"),
        UpdateScheduleRequest: schema(updateScheduleSchema, "UpdateScheduleRequest"),
        UploadUrlRequest: schema(uploadUrlSchema, "UploadUrlRequest"),
        RegisterDocumentRequest: schema(registerDocumentSchema, "RegisterDocumentRequest"),
        AnalyzeRequest: schema(analyzeSchema, "AnalyzeRequest"),
        InterviewAnswerRequest: schema(interviewAnswerSchema, "InterviewAnswerRequest"),
        MarketPriceOverrideRequest: schema(marketPriceOverrideSchema, "MarketPriceOverrideRequest"),
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      "/health": {
        get: {
          tags: ["meta"],
          summary: "헬스체크",
          security: [],
          responses: { "200": jsonResponse("정상", { type: "object" }) },
        },
      },
      "/v1/auth/signup": {
        post: {
          tags: ["auth"],
          summary: "회원가입",
          security: [],
          description:
            "가입과 동시에 서버가 이메일 확인을 처리하고 로그인까지 시켜 access token 을 " +
            "돌려줍니다. Supabase 기본 가입은 확인 메일을 보내고 확인 전엔 로그인이 안 되는데, " +
            "그 흐름을 팀 내부 도구에 맞게 생략한 것입니다.",
          requestBody: jsonBody({
            type: "object",
            required: ["email", "password"],
            properties: {
              email: { type: "string", format: "email" },
              password: { type: "string", minLength: 6 },
            },
          }),
          responses: {
            "201": jsonResponse("가입 및 로그인 완료", {
              type: "object",
              properties: {
                accessToken: { type: "string" },
                userId: { type: "string", format: "uuid" },
                email: { type: "string" },
              },
            }),
            "400": errorResponses["400"],
          },
        },
      },
      "/v1/auth/login": {
        post: {
          tags: ["auth"],
          summary: "로그인",
          security: [],
          requestBody: jsonBody({
            type: "object",
            required: ["email", "password"],
            properties: {
              email: { type: "string", format: "email" },
              password: { type: "string" },
            },
          }),
          responses: {
            "200": jsonResponse("로그인 완료", {
              type: "object",
              properties: {
                accessToken: { type: "string" },
                userId: { type: "string", format: "uuid" },
                email: { type: "string" },
              },
            }),
            "400": errorResponses["400"],
          },
        },
      },
      "/v1/meta": {
        get: {
          tags: ["meta"],
          summary: "기능 가용성",
          description:
            "프론트엔드는 시작 시 이 값을 읽어 '시세 조회 불가' 같은 상태를 미리 안내할 수 있습니다.",
          security: [],
          responses: {
            "200": jsonResponse("가용성 정보", {
              type: "object",
              properties: {
                mode: { type: "string", enum: ["live", "mock"] },
                today: { type: "string", format: "date" },
                rulesVersion: { type: "string" },
                addressProvider: { type: "string", enum: ["mock", "kakao", "vworld"] },
                capabilities: {
                  type: "object",
                  properties: {
                    documentExtraction: { type: "boolean" },
                    marketPriceLookup: { type: "boolean" },
                    ownerMatching: { type: "boolean" },
                    lunarHolidaysSynced: { type: "boolean" },
                    addressSearch: { type: "boolean" },
                    asyncAnalysis: {
                      type: "boolean",
                      description: "false 면 동기 경로(POST /analyze)를 쓰세요 (서버리스 환경)",
                    },
                    notificationDelivery: { type: "boolean" },
                  },
                },
                disclaimer: { type: "string" },
              },
            }),
          },
        },
      },
      "/v1/openapi.json": {
        get: {
          tags: ["meta"],
          summary: "이 문서",
          security: [],
          responses: { "200": jsonResponse("OpenAPI 문서", { type: "object" }) },
        },
      },
      "/v1/addresses/search": {
        get: {
          tags: ["addresses"],
          summary: "주소 검색",
          description:
            "**검사 건을 만들기 전에 반드시 호출하세요.** 결과의 lat · lng · regionCode · sigungu 를 " +
            "그대로 넘겨야 지역 위험과 시세 조회가 동작합니다. " +
            `한도: ${RATE_LIMITS.address.limit}회/분.`,
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string", minLength: 2 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 10, maximum: 30 } },
          ],
          responses: {
            "200": jsonResponse("검색 결과", {
              type: "object",
              properties: {
                results: { type: "array", items: { $ref: "#/components/schemas/AddressResult" } },
                provider: { type: "string" },
                isMockData: { type: "boolean", description: "true 면 개발용 목 데이터" },
              },
            }),
            ...errorResponses,
          },
        },
      },
      "/v1/cases": {
        get: {
          tags: ["cases"],
          summary: "검사 건 목록",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", default: 20, maximum: 50 } },
            { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
          ],
          responses: {
            "200": jsonResponse("목록", {
              type: "object",
              properties: {
                cases: { type: "array", items: { $ref: "#/components/schemas/Case" } },
                pagination: { type: "object" },
              },
            }),
            ...errorResponses,
          },
        },
        post: {
          tags: ["cases"],
          summary: "검사 건 생성",
          description:
            "금액은 `amountUnit` 으로 단위를 명시합니다(`krw` 또는 `man`). " +
            "좌표·법정동코드를 비워두면 서버가 주소로 보완을 시도합니다.",
          requestBody: jsonBody({ $ref: "#/components/schemas/CreateCaseRequest" }),
          responses: {
            "201": jsonResponse("생성됨", {
              type: "object",
              properties: { case: { $ref: "#/components/schemas/Case" } },
            }),
            ...errorResponses,
          },
        },
      },
      "/v1/cases/{caseId}": {
        get: {
          tags: ["cases"],
          summary: "검사 건 상세",
          parameters: [caseIdParam],
          responses: {
            "200": jsonResponse("상세", {
              type: "object",
              properties: { case: { $ref: "#/components/schemas/Case" } },
            }),
            ...errorResponses,
          },
        },
        put: {
          tags: ["cases"],
          summary: "검사 건 수정",
          parameters: [caseIdParam],
          requestBody: jsonBody({ $ref: "#/components/schemas/CreateCaseRequest" }),
          responses: {
            "200": jsonResponse("수정됨", { type: "object" }),
            ...errorResponses,
          },
        },
        delete: {
          tags: ["cases"],
          summary: "검사 건 삭제",
          parameters: [caseIdParam],
          responses: { "204": { description: "삭제됨" }, ...errorResponses },
        },
      },
      "/v1/cases/{caseId}/schedule": {
        patch: {
          tags: ["schedule"],
          summary: "일정만 수정",
          description: "일정이 바뀌면 대항력 발생 시점이 바뀌므로 재분석이 필요합니다.",
          parameters: [caseIdParam],
          requestBody: jsonBody({ $ref: "#/components/schemas/UpdateScheduleRequest" }),
          responses: { "200": jsonResponse("수정됨", { type: "object" }), ...errorResponses },
        },
      },
      "/v1/cases/{caseId}/market-price": {
        put: {
          tags: ["cases"],
          summary: "시세 직접 입력",
          description: "공공 API 조회가 실패했을 때의 폴백 경로입니다.",
          parameters: [caseIdParam],
          requestBody: jsonBody({ $ref: "#/components/schemas/MarketPriceOverrideRequest" }),
          responses: { "200": jsonResponse("저장됨", { type: "object" }), ...errorResponses },
        },
      },
      "/v1/cases/{caseId}/documents/upload-url": {
        post: {
          tags: ["documents"],
          summary: "서명 업로드 URL 발급 (1/3단계)",
          description:
            "파일을 API 서버로 통과시키지 않기 위해 클라이언트가 Storage 로 직접 PUT 합니다(10MB 한도). " +
            `한도: ${RATE_LIMITS.upload.limit}회/시간.`,
          parameters: [caseIdParam],
          requestBody: jsonBody({ $ref: "#/components/schemas/UploadUrlRequest" }),
          responses: {
            "200": jsonResponse("발급됨", {
              type: "object",
              properties: {
                upload: {
                  type: "object",
                  properties: {
                    url: { type: "string", description: "이 URL 로 파일 본문을 PUT 하세요" },
                    storagePath: { type: "string", description: "3단계에서 그대로 넘깁니다" },
                    method: { type: "string" },
                  },
                },
              },
            }),
            ...errorResponses,
          },
        },
      },
      "/v1/cases/{caseId}/documents": {
        get: {
          tags: ["documents"],
          summary: "문서 목록",
          parameters: [caseIdParam],
          responses: { "200": jsonResponse("목록", { type: "object" }), ...errorResponses },
        },
        post: {
          tags: ["documents"],
          summary: "문서 등록 (3/3단계)",
          description: "같은 docType 을 여러 번 올리면 가장 최근 것만 분석에 사용합니다.",
          parameters: [caseIdParam],
          requestBody: jsonBody({ $ref: "#/components/schemas/RegisterDocumentRequest" }),
          responses: { "201": jsonResponse("등록됨", { type: "object" }), ...errorResponses },
        },
      },
      "/v1/cases/{caseId}/documents/{documentId}": {
        delete: {
          tags: ["documents"],
          summary: "문서 삭제",
          parameters: [caseIdParam, { ...caseIdParam, name: "documentId" }],
          responses: { "204": { description: "삭제됨" }, ...errorResponses },
        },
      },
      "/v1/cases/{caseId}/analyze": {
        post: {
          tags: ["analysis"],
          summary: "분석 실행 (동기)",
          description:
            "문서 판독이 포함되면 **20~60초**가 걸릴 수 있습니다. 타임아웃을 90초 이상 두세요. " +
            `한도: ${RATE_LIMITS.analyze.limit}회/시간. 서버리스 환경에서는 이 경로를 쓰세요.`,
          parameters: [caseIdParam],
          requestBody: jsonBody({ $ref: "#/components/schemas/AnalyzeRequest" }),
          responses: {
            "200": jsonResponse("분석 결과", {
              type: "object",
              properties: {
                analysis: {
                  type: "object",
                  properties: {
                    version: { type: "integer" },
                    verdict: { $ref: "#/components/schemas/Verdict" },
                    findings: { type: "array", items: { $ref: "#/components/schemas/Finding" } },
                    specialTerms: {
                      type: "array",
                      items: { $ref: "#/components/schemas/SpecialTerm" },
                    },
                    schedule: {
                      type: "object",
                      properties: {
                        evaluable: { type: "boolean" },
                        opposingPowerEffectiveAt: {
                          type: "string",
                          format: "date-time",
                          nullable: true,
                          description: "대항력 발생 시점 (전입신고 다음 날 0시 KST)",
                        },
                        priorityRightEffectiveAt: {
                          type: "string",
                          format: "date-time",
                          nullable: true,
                        },
                        unprotectedWindow: {
                          type: "object",
                          nullable: true,
                          description: "잔금 지급 후 법적 보호를 받지 못하는 구간",
                          properties: {
                            fromDate: { type: "string", format: "date" },
                            toDate: { type: "string", format: "date" },
                            days: { type: "integer" },
                          },
                        },
                        events: {
                          type: "array",
                          items: { $ref: "#/components/schemas/ScheduleEvent" },
                        },
                      },
                    },
                    valuation: { type: "object", description: "시세 · 부담률 · 경매 회수 시뮬레이션" },
                    region: { type: "object", description: "지역 위험" },
                    crossCheck: { type: "object", description: "서류 교차검증" },
                    caveats: {
                      type: "array",
                      items: { type: "string" },
                      description: "판정의 한계. UI 에 반드시 노출하세요.",
                    },
                  },
                },
              },
            }),
            ...errorResponses,
          },
        },
      },
      "/v1/cases/{caseId}/analyze/jobs": {
        post: {
          tags: ["analysis"],
          summary: "분석 실행 (비동기, 권장)",
          description:
            "202 를 즉시 반환하고 백그라운드에서 분석합니다. 모바일 네트워크가 끊겨도 결과를 잃지 않습니다.\n\n" +
            "1. `POST` → `{ job: { id, status } }`\n" +
            "2. `GET .../jobs/{jobId}` 로 2.5초 간격 폴링\n" +
            "3. `status === \"succeeded\"` → `GET .../analysis`\n\n" +
            "진행 중 작업이 있으면 새로 만들지 않고 그 작업을 돌려줍니다(멱등, 200 + `reused: true`).",
          parameters: [caseIdParam],
          requestBody: jsonBody({ $ref: "#/components/schemas/AnalyzeRequest" }),
          responses: {
            "202": jsonResponse("작업 등록됨", {
              type: "object",
              properties: {
                job: { $ref: "#/components/schemas/AnalysisJob" },
                reused: { type: "boolean" },
                poll: { type: "object" },
              },
            }),
            "200": jsonResponse("진행 중 작업 재사용", { type: "object" }),
            ...errorResponses,
          },
        },
        get: {
          tags: ["analysis"],
          summary: "작업 목록",
          parameters: [caseIdParam],
          responses: { "200": jsonResponse("목록", { type: "object" }), ...errorResponses },
        },
      },
      "/v1/cases/{caseId}/analyze/jobs/{jobId}": {
        get: {
          tags: ["analysis"],
          summary: "작업 상태 폴링",
          parameters: [caseIdParam, { ...caseIdParam, name: "jobId" }],
          responses: {
            "200": jsonResponse("작업 상태", {
              type: "object",
              properties: { job: { $ref: "#/components/schemas/AnalysisJob" } },
            }),
            ...errorResponses,
          },
        },
        delete: {
          tags: ["analysis"],
          summary: "작업 취소",
          parameters: [caseIdParam, { ...caseIdParam, name: "jobId" }],
          responses: {
            "200": jsonResponse("취소됨", { type: "object" }),
            "409": jsonResponse("이미 끝난 작업", { $ref: "#/components/schemas/Error" }),
            ...errorResponses,
          },
        },
      },
      "/v1/cases/{caseId}/analysis": {
        get: {
          tags: ["analysis"],
          summary: "저장된 최신 분석 결과",
          description: "재계산하지 않습니다. 화면 재진입 시 이 경로를 쓰세요.",
          parameters: [caseIdParam],
          responses: {
            "200": jsonResponse("결과", {
              type: "object",
              properties: { analysis: { $ref: "#/components/schemas/Analysis" } },
            }),
            ...errorResponses,
          },
        },
      },
      "/v1/cases/{caseId}/extraction": {
        get: {
          tags: ["analysis"],
          summary: "AI 판독 결과 (사용자가 원본과 대조하기 위한 것)",
          description:
            "판정이 아니라 **무엇을 어떻게 읽었는지**를 냅니다. 각 권리마다 " +
            "`sourceQuote`(등기부 원문 문장)가 붙어 있어, 사용자가 실제 서류와 한 줄씩 " +
            "대조할 수 있습니다. AI 가 채권최고액을 한 자리 잘못 읽으면 판정 전체가 " +
            "틀리므로, 판정을 보여주기 전에 이 화면을 거치게 하세요. " +
            "아직 판독 전이면 `registry` 가 null 입니다 — 빈 객체로 뭉개지 않습니다. " +
            "`confidence` 는 **모델 자기보고값이며 정확도 보장이 아닙니다.**",
          parameters: [caseIdParam],
          responses: {
            "200": jsonResponse("판독 결과", {
              type: "object",
              properties: {
                registry: {
                  description: "등기부 판독 원문. 판독 전이면 null.",
                  nullable: true,
                  type: "object",
                },
                confidence: { type: "number", nullable: true },
                model: { type: "string", nullable: true },
                schemaVersion: { type: "string", nullable: true },
                extractedAt: { type: "string", format: "date-time", nullable: true },
              },
            }),
            ...errorResponses,
          },
        },
      },
      "/v1/cases/{caseId}/analyses": {
        get: {
          tags: ["analysis"],
          summary: "분석 이력",
          parameters: [caseIdParam],
          responses: { "200": jsonResponse("이력", { type: "object" }), ...errorResponses },
        },
      },
      "/v1/cases/{caseId}/timeline": {
        get: {
          tags: ["schedule"],
          summary: "일정 타임라인 (D-day)",
          parameters: [caseIdParam],
          responses: { "200": jsonResponse("타임라인", { type: "object" }), ...errorResponses },
        },
      },
      "/v1/schedule/preview": {
        post: {
          tags: ["schedule"],
          summary: "일정 미리보기 (문서·AI 없이)",
          description:
            "사용자가 날짜 피커를 만질 때마다 호출하기 위한 경량 엔드포인트입니다. " +
            "대항력 발생 시점과 무방비 구간을 즉시 계산하고 저장하지 않습니다.",
          requestBody: jsonBody({
            type: "object",
            properties: {
              contractDate: { type: "string", format: "date", nullable: true },
              balanceDate: { type: "string", format: "date", nullable: true },
              moveInDate: { type: "string", format: "date", nullable: true },
              residentRegistrationDate: { type: "string", format: "date", nullable: true },
              confirmedDatePlan: { type: "string", format: "date", nullable: true },
              contractTermMonths: { type: "integer", default: 24 },
            },
          }),
          responses: {
            "200": jsonResponse("일정 계산 결과", {
              type: "object",
              properties: {
                schedule: { type: "object" },
                alternatives: {
                  type: "object",
                  nullable: true,
                  description: "잔금일이 휴일일 때 제안하는 대안 업무일",
                },
              },
            }),
            ...errorResponses,
          },
        },
      },
      "/v1/cases/{caseId}/interview": {
        get: {
          tags: ["interview"],
          summary: "다음 질문 (최대 3개)",
          description:
            "질문은 분석 결과에 따라 조건부로 노출됩니다. 신탁이 아닌 집에 신탁 동의서를 묻지 않습니다.",
          parameters: [caseIdParam],
          responses: { "200": jsonResponse("질문", { type: "object" }), ...errorResponses },
        },
        delete: {
          tags: ["interview"],
          summary: "세션 초기화",
          parameters: [caseIdParam],
          responses: { "204": { description: "초기화됨" }, ...errorResponses },
        },
      },
      "/v1/cases/{caseId}/interview/answers": {
        post: {
          tags: ["interview"],
          summary: "답변 제출",
          description:
            "답변은 특약 또는 위험 신호로 변환됩니다. 최종 반영은 `POST /analyze` 를 다시 호출할 때입니다.",
          parameters: [caseIdParam],
          requestBody: jsonBody({ $ref: "#/components/schemas/InterviewAnswerRequest" }),
          responses: { "200": jsonResponse("다음 질문", { type: "object" }), ...errorResponses },
        },
      },
      "/v1/special-terms/catalog": {
        get: {
          tags: ["special-terms"],
          summary: "특약 카탈로그 (공개)",
          security: [],
          responses: {
            "200": jsonResponse("카탈로그", {
              type: "object",
              properties: {
                specialTerms: { type: "array", items: { $ref: "#/components/schemas/SpecialTerm" } },
                categories: { type: "array", items: { type: "string" } },
                disclaimer: { type: "string" },
              },
            }),
          },
        },
      },
      "/v1/checklist": {
        get: {
          tags: ["checklist"],
          summary: "계약 단계별 체크리스트 항목 (공개)",
          description:
            "4단계(집 보러 가기 전 · 계약 당일 · 잔금·입주 · 입주 후)로 묶인 항목 목록입니다. " +
            "체크 상태는 별도 엔드포인트에서 관리합니다.",
          security: [],
          responses: {
            "200": jsonResponse("체크리스트 항목", {
              type: "object",
              properties: {
                stages: { type: "array", items: { $ref: "#/components/schemas/ChecklistStage" } },
                progress: { $ref: "#/components/schemas/ChecklistProgress" },
                disclaimer: { type: "string" },
              },
            }),
          },
        },
      },
      "/v1/checklist/progress": {
        get: {
          tags: ["checklist"],
          summary: "내 체크 상태",
          description: "한 번도 저장하지 않았으면 빈 상태를 돌려줍니다 (404 아님).",
          responses: {
            "200": jsonResponse("체크 상태", {
              type: "object",
              properties: { checklist: { $ref: "#/components/schemas/ChecklistState" } },
            }),
            ...errorResponses,
          },
        },
        put: {
          tags: ["checklist"],
          summary: "체크 상태 저장 (전체 교체)",
          description:
            "부분 갱신이 아니라 전체 교체입니다. 화면이 가진 체크 목록 전체를 보내세요. " +
            "알 수 없는 항목 id 는 서버가 조용히 걸러냅니다.",
          requestBody: jsonBody({
            type: "object",
            required: ["checkedItemIds"],
            properties: {
              checkedItemIds: { type: "array", items: { type: "string" }, maxItems: 200 },
            },
          }),
          responses: {
            "200": jsonResponse("저장된 상태", {
              type: "object",
              properties: { checklist: { $ref: "#/components/schemas/ChecklistState" } },
            }),
            ...errorResponses,
          },
        },
        delete: {
          tags: ["checklist"],
          summary: "체크 전체 해제",
          responses: {
            "200": jsonResponse("초기화된 상태", {
              type: "object",
              properties: { checklist: { $ref: "#/components/schemas/ChecklistState" } },
            }),
            ...errorResponses,
          },
        },
      },
      "/v1/glossary": {
        get: {
          tags: ["glossary"],
          summary: "용어사전 검색 (공개)",
          security: [],
          parameters: [
            {
              name: "q",
              in: "query",
              required: false,
              schema: { type: "string", maxLength: 100 },
              description: "검색어. 용어명 · 별칭 · 본문을 훑고 용어명 일치를 위로 올립니다.",
            },
            {
              name: "category",
              in: "query",
              required: false,
              schema: { type: "string", enum: [...GLOSSARY_CATEGORIES] },
            },
          ],
          responses: {
            "200": jsonResponse("용어 목록", {
              type: "object",
              properties: {
                terms: { type: "array", items: { $ref: "#/components/schemas/GlossaryTerm" } },
                categories: { type: "array", items: { type: "string" } },
                total: { type: "integer" },
              },
            }),
          },
        },
      },
      "/v1/glossary/fraud-cases": {
        get: {
          tags: ["glossary"],
          summary: "실제 사기 수법 (공개)",
          security: [],
          responses: {
            "200": jsonResponse("사기 수법", {
              type: "object",
              properties: {
                fraudCases: { type: "array", items: { $ref: "#/components/schemas/FraudCase" } },
              },
            }),
          },
        },
      },
      "/v1/glossary/relief-steps": {
        get: {
          tags: ["glossary"],
          summary: "피해 대응 절차 (공개)",
          description: "순서가 중요합니다. 배열 순서를 그대로 보여주세요.",
          security: [],
          responses: {
            "200": jsonResponse("대응 절차", {
              type: "object",
              properties: {
                reliefSteps: { type: "array", items: { $ref: "#/components/schemas/ReliefStep" } },
                disclaimer: { type: "string" },
              },
            }),
          },
        },
      },
      "/v1/glossary/by-finding/{code}": {
        get: {
          tags: ["glossary"],
          summary: "판정 항목 코드로 용어 찾기 (공개)",
          description: '결과 화면의 "이게 무슨 말이죠?" 링크가 씁니다.',
          security: [],
          parameters: [
            { name: "code", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": jsonResponse("연결된 용어", {
              type: "object",
              properties: {
                findingCode: { type: "string" },
                terms: { type: "array", items: { $ref: "#/components/schemas/GlossaryTerm" } },
              },
            }),
            ...errorResponses,
          },
        },
      },
      "/v1/cases/{caseId}/special-terms": {
        get: {
          tags: ["special-terms"],
          summary: "이 집에 맞춘 추천 특약",
          parameters: [caseIdParam],
          responses: { "200": jsonResponse("추천 특약", { type: "object" }), ...errorResponses },
        },
      },
      "/v1/cases/{caseId}/special-terms/compose": {
        post: {
          tags: ["special-terms"],
          summary: "선택한 특약을 붙여넣기용 텍스트로 조립",
          parameters: [caseIdParam],
          requestBody: jsonBody({
            type: "object",
            required: ["codes"],
            properties: { codes: { type: "array", items: { type: "string" }, maxItems: 30 } },
          }),
          responses: { "200": jsonResponse("조립된 문구", { type: "object" }), ...errorResponses },
        },
      },
      "/v1/cases/{caseId}/contract-draft": {
        get: {
          tags: ["contract-draft"],
          summary: "표준임대차계약서 자동완성 초안",
          description:
            "이미 수집된 등기부·확인설명서 데이터와 추천 특약으로 국토교통부 표준계약서 " +
            "항목을 채운 초안입니다. 법률 자문이 아닙니다.",
          parameters: [caseIdParam],
          responses: { "200": jsonResponse("계약서 초안", { type: "object" }), ...errorResponses },
        },
      },
      "/v1/region/risk": {
        get: {
          tags: ["region"],
          summary: "좌표 기준 지역 위험",
          description:
            "피해주택의 **개별 주소는 응답에 포함되지 않습니다** — 집계값만 나갑니다. " +
            "반경 내 밀도는 최대 '위험'까지만 올라갑니다(동네 통계는 이 집의 증거가 아니므로).",
          parameters: [
            { name: "lat", in: "query", required: true, schema: { type: "number" } },
            { name: "lng", in: "query", required: true, schema: { type: "number" } },
            { name: "radiusM", in: "query", schema: { type: "integer", default: 500 } },
          ],
          responses: { "200": jsonResponse("지역 위험", { type: "object" }), ...errorResponses },
        },
      },
      "/v1/region/grid": {
        get: {
          tags: ["region"],
          summary: "히트맵 격자 (약 100m 셀)",
          parameters: [
            { name: "lat", in: "query", required: true, schema: { type: "number" } },
            { name: "lng", in: "query", required: true, schema: { type: "number" } },
            { name: "radiusM", in: "query", schema: { type: "integer", default: 2000 } },
          ],
          responses: { "200": jsonResponse("격자", { type: "object" }), ...errorResponses },
        },
      },
      "/v1/home": {
        get: {
          tags: ["home"],
          summary: "홈 화면 요약",
          description:
            "검사 건 목록 · 최신 판정 · 다가오는 일정 · 알림 배지를 한 번에 줍니다. " +
            "각 검사 건에는 `nextAction`(다음에 할 일 한 줄)이 포함됩니다.",
          parameters: [
            { name: "caseLimit", in: "query", schema: { type: "integer", default: 20 } },
            { name: "upcomingLimit", in: "query", schema: { type: "integer", default: 5 } },
          ],
          responses: { "200": jsonResponse("홈 요약", { type: "object" }), ...errorResponses },
        },
      },
      "/v1/timeline/upcoming": {
        get: {
          tags: ["home"],
          summary: "전체 검사 건의 다가오는 일정",
          parameters: [{ name: "limit", in: "query", schema: { type: "integer", default: 10 } }],
          responses: { "200": jsonResponse("일정", { type: "object" }), ...errorResponses },
        },
      },
      "/v1/notifications": {
        get: {
          tags: ["home"],
          summary: "앱 내 알림함",
          description: "발송 채널이 붙기 전에도 서버가 계산해 둔 예정 알림 목록을 볼 수 있습니다.",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", default: 30 } },
            { name: "includeSent", in: "query", schema: { type: "string", enum: ["true", "false"] } },
          ],
          responses: { "200": jsonResponse("알림 목록", { type: "object" }), ...errorResponses },
        },
      },
    },
  };
}
