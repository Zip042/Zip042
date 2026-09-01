/**
 * 프론트엔드용 응답 타입.
 *
 * 이 파일을 프론트엔드 저장소로 **복사해 쓰거나**, 심볼릭 링크로 참조하세요.
 * 서버가 실제로 쓰는 타입을 그대로 재수출하므로 **응답과 어긋날 수 없습니다** —
 * 손으로 옮겨 적은 타입은 반드시 언젠가 실제 응답과 달라집니다.
 *
 * 요청 타입은 `GET /v1/openapi.json` 에서 생성하는 편이 낫습니다:
 *   npx openapi-typescript http://localhost:8787/v1/openapi.json -o src/lib/api.d.ts
 */

// ── 도메인 기본 타입 ───────────────────────────────────────────────────────
export type {
  RiskLevel,
  FindingCategory,
  Finding,
  RightType,
  RegistryRight,
  RegistryExtraction,
  BrokerageStatementExtraction,
  LeaseDraftExtraction,
  MarketPriceEstimate,
} from "./domain/types.js";

export { RISK_LABEL_KO, RIGHT_LABEL_KO } from "./domain/types.js";

// ── 판정 ──────────────────────────────────────────────────────────────────
export type { VerdictResult } from "./domain/verdict.js";
export type {
  ValuationResult,
  RecoverySimulation,
  BuildingKind,
  SmallLesseeThreshold,
} from "./domain/valuation.js";

// ── 일정 ──────────────────────────────────────────────────────────────────
export type {
  ScheduleResult,
  ScheduleEvent,
  ScheduleChecklistItem,
} from "./domain/schedule.js";

// ── 교차검증 · 지역 · 특약 · 인터뷰 ────────────────────────────────────────
export type {
  CrossCheckResult,
  FieldComparison,
  MatchStatus,
} from "./domain/cross-check.js";
export type { RegionRiskResult, RegionRiskSummary } from "./domain/region-risk.js";
export type {
  RecommendedTerm,
  SpecialTermDefinition,
  TermCategory,
} from "./domain/special-terms.js";
export type {
  InterviewQuestion,
  InterviewOption,
  InterviewContext,
  AnswerValue,
} from "./domain/interview.js";

// ── 알림 ──────────────────────────────────────────────────────────────────
export type {
  PlannedNotification,
  NotificationRuleCode,
  UpcomingEvent,
} from "./domain/notifications.js";

// ── 서비스 응답 ────────────────────────────────────────────────────────────
export type { AnalysisResultPayload } from "./services/analysis.service.js";
export type { AnalysisJob, JobStatus } from "./services/job.service.js";
export type { HomeSummary, HomeCaseSummary } from "./services/home.service.js";
export type {
  AddressResult,
  AddressProviderName,
  AddressSearchOutcome,
} from "./services/address.service.js";
export type { InterviewState } from "./services/interview.service.js";

// ── 엔드포인트 응답 봉투 ───────────────────────────────────────────────────

import type { AnalysisResultPayload } from "./services/analysis.service.js";
import type { AnalysisJob } from "./services/job.service.js";
import type { HomeSummary } from "./services/home.service.js";
import type { AddressResult, AddressProviderName } from "./services/address.service.js";
import type { InterviewState } from "./services/interview.service.js";
import type { RecommendedTerm } from "./domain/special-terms.js";
import type { RegionRiskResult } from "./domain/region-risk.js";
import type { ScheduleResult } from "./domain/schedule.js";
import type { UpcomingEvent } from "./domain/notifications.js";

/** 검사 건 (serializeCase 의 반환 형태) */
export interface CaseDto {
  id: string;
  title: string | null;
  status: "draft" | "ready" | "analyzing" | "analyzed" | "failed";
  property: {
    roadAddress: string | null;
    jibunAddress: string | null;
    detailAddress: string | null;
    regionCode: string | null;
    sigungu: string | null;
    lat: number | null;
    lng: number | null;
    buildingType: string | null;
    exclusiveAreaM2: number | null;
    floor: number | null;
    totalFloors: number | null;
    builtYear: number | null;
    householdCount: number | null;
  };
  terms: {
    leaseType: "jeonse" | "monthly" | "semi_jeonse";
    depositKrw: number;
    monthlyRentKrw: number;
    maintenanceFeeKrw: number;
    contractTermMonths: number;
    userMarketPriceKrw: number | null;
  };
  schedule: {
    contractDate: string | null;
    balanceDate: string | null;
    moveInDate: string | null;
    residentRegistrationDate: string | null;
    confirmedDatePlan: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ApiError {
  error: {
    code:
      | "BAD_REQUEST"
      | "UNAUTHORIZED"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "CONFLICT"
      | "UNPROCESSABLE"
      | "VALIDATION_FAILED"
      | "RATE_LIMITED"
      | "UPSTREAM_FAILED"
      | "INTERNAL"
      | "HTTP_ERROR";
    message: string;
    issues?: { path: string; message: string }[];
    detail?: unknown;
    requestId?: string;
  };
}

export interface MetaResponse {
  service: string;
  mode: "live" | "mock";
  today: string;
  rulesVersion: string;
  extractionSchemaVersion: string;
  addressProvider: AddressProviderName;
  capabilities: {
    documentExtraction: boolean;
    marketPriceLookup: boolean;
    ownerMatching: boolean;
    lunarHolidaysSynced: boolean;
    addressSearch: boolean;
    /** false 면 동기 경로(POST /analyze)를 쓰세요 */
    asyncAnalysis: boolean;
    notificationDelivery: boolean;
  };
  regionRiskDefaultRadiusM: number;
  disclaimer: string;
}

export interface CaseListResponse {
  cases: CaseDto[];
  pagination: { limit: number; offset: number; total: number };
}

export interface CaseResponse {
  case: CaseDto;
}

export interface AnalysisResponse {
  analysis: AnalysisResultPayload;
}

export interface AnalysisJobResponse {
  job: AnalysisJob;
  reused?: boolean;
  poll?: { endpoint: string; intervalMs: number; resultEndpoint: string };
  resultEndpoint?: string;
}

export interface AddressSearchResponse {
  results: AddressResult[];
  provider: AddressProviderName;
  isMockData: boolean;
  hint?: string;
  usage: string;
}

export interface HomeResponse {
  home: HomeSummary;
}

export interface UpcomingTimelineResponse {
  today: string;
  events: UpcomingEvent[];
}

export interface SchedulePreviewResponse {
  schedule: ScheduleResult;
  alternatives: { earlier: string; later: string } | null;
  caveats: string[];
}

export interface InterviewResponse {
  interview: InterviewState;
  hint?: string;
}

export interface SpecialTermsResponse {
  specialTerms: RecommendedTerm[];
  source?: "analysis" | "baseline";
  analysisVersion?: number;
  hint?: string;
  disclaimer: string;
}

export interface RegionRiskResponse {
  region: RegionRiskResult;
  thresholds?: { caution: number; danger: number; critical: number };
  ownerMatchingEnabled: boolean;
}

export interface NotificationDto {
  id: string;
  caseId: string;
  eventCode: string;
  ruleCode: string;
  sendOn: string;
  eventDate: string;
  severity: string;
  title: string;
  body: string;
  deepLink: string | null;
  status: "pending" | "sent" | "skipped" | "failed";
  sentAt: string | null;
}

export interface NotificationListResponse {
  notifications: NotificationDto[];
  note: string;
}

export interface DocumentDto {
  id: string;
  docType: "registry" | "brokerage_statement" | "lease_draft" | "building_ledger" | "other";
  status: "uploaded" | "processing" | "parsed" | "failed";
  originalName: string | null;
  mimeType: string;
  sizeBytes: number;
  errorMessage: string | null;
  uploadedAt: string;
  parsedAt: string | null;
}

export interface UploadUrlResponse {
  upload: {
    url: string;
    token: string;
    storagePath: string;
    method: "PUT";
    headers: Record<string, string>;
  };
  next: { description: string; endpoint: string; body: Record<string, unknown> };
}
