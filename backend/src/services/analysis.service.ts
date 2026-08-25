import { loadEnv } from "../env.js";
import { todayKst, type DateOnly } from "../lib/date.js";
import { log } from "../lib/logger.js";
import { adminClient, type Db } from "../lib/supabase.js";
import { crossCheck } from "../domain/cross-check.js";
import { applyInterviewAnswers, type AnswerValue } from "../domain/interview.js";
import { convertedDeposit, toPercent } from "../domain/money.js";
import { evaluateRegistry } from "../domain/registry-risk.js";
import { buildSchedule } from "../domain/schedule.js";
import {
  collectTermTriggers,
  recommendSpecialTerms,
  type RecommendedTerm,
} from "../domain/special-terms.js";
import type { Finding, MarketPriceEstimate } from "../domain/types.js";
import {
  estimateGuaranteeEligibility,
  evaluateValuation,
  type BuildingKind,
  type ValuationResult,
} from "../domain/valuation.js";
import { buildVerdict, burdenGauge, verdictBadge } from "../domain/verdict.js";
import { getCase, setCaseStatus, type CaseRow } from "./case.service.js";
import { ensureExtractions, type CaseExtractions } from "./document.service.js";
import { loadHolidays } from "./holidays.service.js";
import { estimateMarketPrice, userProvidedPrice } from "./market-price.service.js";
import { lookupRegionRisk } from "./region.service.js";
import { findSmallLesseeThreshold } from "./small-lessee.service.js";
import { syncNotifications } from "./notification.service.js";

/**
 * 분석 오케스트레이터.
 *
 * 순서가 중요하다 — 등기부에서 뽑은 선순위 채권이 시세 판정의 입력이고,
 * 그 둘의 결과가 일정·특약 판단에 다시 들어간다.
 *
 *   문서 파싱 → 등기부 위험 → 시세 산정 → 깡통전세 판정
 *                                    ↘ 일정 가공 ↘
 *                                       교차검증  → 종합 판정 → 특약 추천
 *                                       지역 위험 ↗
 *
 * 실패 정책: 외부 의존(시세 API · 지역 RPC · AI)이 죽어도 분석을 끝낸다.
 *            빠진 정보는 "확인하지 못했다"는 finding 으로 사용자에게 그대로 알린다.
 *            조용히 0으로 채우는 것이 이 서비스에서 가장 위험한 실패다.
 */

export const RULES_VERSION = "2026-08-20.1";

function toBuildingKind(row: CaseRow, extractions: CaseExtractions): BuildingKind {
  const declared = row.building_type as BuildingKind | null;
  if (declared) return declared;
  // 사용자가 유형을 고르지 않았으면 등기부로 추정한다.
  // 집합건물이 아니라는 것은 다가구·단독이라는 뜻이고, 이 구분이 회수 시뮬레이션에 크게 작용한다.
  if (extractions.registry && !extractions.registry.isSectionedBuilding) return "multi_household";
  return "other";
}

function isMultiHousehold(kind: BuildingKind, extractions: CaseExtractions): boolean {
  if (kind === "multi_household" || kind === "detached") return true;
  return extractions.registry ? !extractions.registry.isSectionedBuilding : false;
}

async function resolveMarketPrice(
  row: CaseRow,
  extractions: CaseExtractions,
  buildingKind: BuildingKind,
  opts: { refresh: boolean },
): Promise<MarketPriceEstimate> {
  // 사용자가 직접 입력한 시세가 최우선 — 본인이 확인한 값이 API 추정보다 정확한 경우가 많다.
  if (row.user_market_price_krw && row.user_market_price_krw > 0) {
    return userProvidedPrice(row.user_market_price_krw);
  }

  const admin = adminClient();
  if (!opts.refresh) {
    const { data } = await admin
      .from("market_prices")
      .select("estimated_krw,low_krw,high_krw,source,method,sample_size,confidence")
      .eq("case_id", row.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      return {
        estimatedKrw: data.estimated_krw as number,
        lowKrw: data.low_krw as number | null,
        highKrw: data.high_krw as number | null,
        source: data.source as MarketPriceEstimate["source"],
        method: data.method as string,
        sampleSize: data.sample_size as number | null,
        confidence: Number(data.confidence ?? 0.5),
      };
    }
  }

  const area = row.exclusive_area_m2 ?? extractions.registry?.exclusiveAreaM2 ?? null;
  if (!row.region_code || !area) {
    return {
      estimatedKrw: 0,
      lowKrw: null,
      highKrw: null,
      source: "unavailable",
      method: !row.region_code ? "법정동코드가 없어 조회할 수 없습니다." : "전용면적이 없어 조회할 수 없습니다.",
      sampleSize: 0,
      confidence: 0,
    };
  }

  const estimate = await estimateMarketPrice({
    regionCode: row.region_code,
    buildingKind,
    exclusiveAreaM2: area,
    buildingName: extractions.registry?.buildingName ?? null,
  });

  if (estimate.source !== "unavailable") {
    const { error } = await admin.from("market_prices").insert({
      case_id: row.id,
      source: estimate.source,
      method: estimate.method,
      estimated_krw: estimate.estimatedKrw,
      low_krw: estimate.lowKrw,
      high_krw: estimate.highKrw,
      sample_size: estimate.sampleSize,
      confidence: estimate.confidence,
    });
    if (error) log.warn("시세 저장 실패", { caseId: row.id, error: error.message });
  }

  return estimate;
}

async function loadInterviewAnswers(caseId: string): Promise<Record<string, AnswerValue>> {
  const { data, error } = await adminClient()
    .from("interview_sessions")
    .select("answers")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    log.warn("인터뷰 답변 조회 실패", { caseId, error: error.message });
    return {};
  }
  return (data?.answers ?? {}) as Record<string, AnswerValue>;
}

/** 문서 파싱 실패를 사용자에게 보이는 finding 으로 바꾼다. */
function extractionFailureFindings(extractions: CaseExtractions): Finding[] {
  const label: Record<string, string> = {
    registry: "등기부등본",
    brokerage_statement: "중개대상물 확인·설명서",
    lease_draft: "임대차 계약서",
  };
  return extractions.failures.map((f) => ({
    code: "DOC_PARSE_FAILED",
    category: "document" as const,
    kind: "info_gap" as const,
    severity: "caution" as const,
    weight: 8,
    title: `${label[f.docType] ?? f.docType}을 읽지 못했어요`,
    description:
      "업로드한 파일에서 정보를 추출하지 못했습니다. 이 문서 없이 나머지 정보로만 판정했으므로, " +
      "실제 위험은 표시된 것보다 클 수 있습니다.",
    action: "파일이 선명한지, 전체 페이지가 포함됐는지 확인해 다시 올려주세요.",
    evidence: { docType: f.docType, reason: f.message.slice(0, 200) },
  }));
}

/** 판독 신뢰도가 낮으면 결과를 그대로 신뢰하지 말라고 알린다. */
function lowConfidenceFindings(extractions: CaseExtractions): Finding[] {
  const out: Finding[] = [];
  for (const [docType, confidence] of Object.entries(extractions.confidences)) {
    if (confidence !== undefined && confidence < 0.6) {
      out.push({
        code: "DOC_LOW_CONFIDENCE",
        category: "document",
        kind: "info_gap",
        severity: "caution",
        weight: 5,
        title: "문서 판독 정확도가 낮아요",
        description:
          `업로드한 문서(${docType})의 판독 신뢰도가 ${toPercent(confidence)}%입니다. ` +
          "흐릿한 사진이나 일부만 찍힌 문서일 가능성이 높습니다.",
        action: "밝은 곳에서 문서 전체가 들어가도록 다시 촬영하거나, PDF 원본을 올려주세요.",
        evidence: { docType, confidence },
      });
    }
  }
  return out;
}

export interface AnalysisResultPayload {
  caseId: string;
  version: number;
  rulesVersion: string;
  verdict: ReturnType<typeof buildVerdict>;
  badge: ReturnType<typeof verdictBadge>;
  burdenGauge: number | null;
  valuation: ValuationResult & {
    marketPrice: MarketPriceEstimate;
    guarantee: ReturnType<typeof estimateGuaranteeEligibility>;
  };
  schedule: ReturnType<typeof buildSchedule>;
  region: Awaited<ReturnType<typeof lookupRegionRisk>>;
  crossCheck: ReturnType<typeof crossCheck>;
  documents: {
    submitted: { registry: boolean; brokerage: boolean; lease: boolean };
    failures: CaseExtractions["failures"];
    confidences: CaseExtractions["confidences"];
  };
  specialTerms: RecommendedTerm[];
  findings: Finding[];
  /** 판정의 한계를 사용자에게 알리기 위한 메타 정보 */
  caveats: string[];
  generatedAt: string;
}

export async function runAnalysis(
  db: Db,
  caseId: string,
  opts: { refreshMarketPrice: boolean; reparseDocuments: boolean },
): Promise<AnalysisResultPayload> {
  const env = loadEnv();
  const row = await getCase(db, caseId);
  const today = todayKst();

  await setCaseStatus(db, caseId, "analyzing");

  try {
    // 1) 문서 파싱 + 공휴일 로딩 (서로 독립이므로 병렬)
    const [extractions, holidaySnapshot] = await Promise.all([
      ensureExtractions(caseId, { reparse: opts.reparseDocuments }),
      loadHolidays(),
    ]);

    const buildingKind = toBuildingKind(row, extractions);
    const multiHousehold = isMultiHousehold(buildingKind, extractions);

    // 2) 등기부 위험 판정 — 시세 판정의 입력(선순위 채권)을 만든다.
    const registryResult = extractions.registry
      ? evaluateRegistry({
          registry: extractions.registry,
          contractLessorName: extractions.lease?.lessorName ?? null,
          myDepositKrw: row.deposit_krw,
          today,
        })
      : null;

    // 3) 시세 · 지역 위험 · 소액임차인 기준 (서로 독립이므로 병렬)
    const [marketPrice, region, smallLesseeThreshold] = await Promise.all([
      resolveMarketPrice(row, extractions, buildingKind, { refresh: opts.refreshMarketPrice }),
      lookupRegionRisk({
        lat: row.lat,
        lng: row.lng,
        radiusM: env.REGION_RISK_RADIUS_M,
        roadAddress: row.road_address,
        ownerNames: extractions.registry?.ownerNames ?? [],
      }),
      findSmallLesseeThreshold(row.sigungu, row.contract_date ?? today),
    ]);

    // 4) 깡통전세 판정
    const convertedDepositKrw = convertedDeposit(row.deposit_krw, row.monthly_rent_krw);
    const valuation = evaluateValuation({
      marketPriceKrw: marketPrice.source === "unavailable" ? null : marketPrice.estimatedKrw,
      seniorMortgageKrw: registryResult?.seniorMortgageKrw ?? 0,
      // 다가구는 선순위 임차보증금을 알 수 없다. 0이 아니라 null 로 넘겨야 '모른다'가 판정에 반영된다.
      seniorDepositKrw: multiHousehold
        ? (extractions.brokerage?.priorTenantDepositKrw ?? null)
        : 0,
      otherSeniorClaimsKrw: registryResult?.otherSeniorClaimsKrw ?? 0,
      myDepositKrw: row.deposit_krw,
      convertedDepositKrw,
      buildingKind,
      smallLesseeThreshold,
    });

    // 5) 일정 가공
    const schedule = buildSchedule({
      contractDate: row.contract_date as DateOnly | null,
      balanceDate: row.balance_date as DateOnly | null,
      moveInDate: row.move_in_date as DateOnly | null,
      residentRegistrationDate: row.resident_registration_date as DateOnly | null,
      confirmedDatePlan: row.confirmed_date_plan as DateOnly | null,
      contractTermMonths: row.contract_term_months,
      holidays: holidaySnapshot.holidays,
      today,
    });

    // 6) 서류 교차검증
    const cross = crossCheck({
      facts: {
        roadAddress: row.road_address,
        detailAddress: row.detail_address,
        exclusiveAreaM2: row.exclusive_area_m2,
        depositKrw: row.deposit_krw,
        monthlyRentKrw: row.monthly_rent_krw,
        maintenanceFeeKrw: row.maintenance_fee_krw,
        contractDate: row.contract_date as DateOnly | null,
        balanceDate: row.balance_date as DateOnly | null,
        isMultiHousehold: multiHousehold,
        today,
      },
      registry: extractions.registry,
      brokerage: extractions.brokerage,
      lease: extractions.lease,
    });

    // 7) 대화형 후속 질문 결과
    const interview = applyInterviewAnswers(await loadInterviewAnswers(caseId));

    // 8) finding 합산
    const findings: Finding[] = [
      ...(registryResult?.findings ?? []),
      ...valuation.findings,
      ...schedule.findings,
      ...cross.findings,
      ...region.findings,
      ...interview.findings,
      ...extractionFailureFindings(extractions),
      ...lowConfidenceFindings(extractions),
    ];

    // 9) 특약 추천
    const specialTerms = recommendSpecialTerms(
      collectTermTriggers(findings),
      {
        depositKrw: row.deposit_krw,
        contractDate: row.contract_date as DateOnly | null,
        balanceDate: row.balance_date as DateOnly | null,
        residentRegistrationDate: row.resident_registration_date as DateOnly | null,
        protectionDate: schedule.unprotectedWindow
          ? (schedule.normalized.residentRegistrationDate as DateOnly | null)
          : null,
        lessorName: extractions.registry?.ownerNames[0] ?? extractions.lease?.lessorName ?? null,
        address: extractions.registry?.address ?? row.road_address,
        detailAddress: row.detail_address ?? extractions.lease?.detailAddress ?? null,
        maintenanceFeeKrw: row.maintenance_fee_krw,
      },
      interview.extraTermCodes,
    );

    // 10) 종합 판정
    const verdict = buildVerdict({
      findings,
      valuation,
      schedule,
      recommendedTerms: specialTerms,
      depositKrw: row.deposit_krw,
    });

    const caveats = buildCaveats({
      marketPrice,
      extractions,
      holidaySynced: holidaySnapshot.lunarHolidaysSynced,
      regionAvailable: region.findings.every((f) => f.code !== "REGION_LOCATION_UNKNOWN"),
    });

    const payload: AnalysisResultPayload = {
      caseId,
      version: 0, // 저장 시 확정
      rulesVersion: RULES_VERSION,
      verdict,
      badge: verdictBadge(verdict.verdict),
      burdenGauge: burdenGauge(valuation),
      valuation: {
        ...valuation,
        marketPrice,
        guarantee: estimateGuaranteeEligibility(
          marketPrice.source === "unavailable" ? null : marketPrice.estimatedKrw,
          valuation.seniorClaimsKrw,
          row.deposit_krw,
        ),
      },
      schedule,
      region,
      crossCheck: cross,
      documents: {
        submitted: cross.submitted,
        failures: extractions.failures,
        confidences: extractions.confidences,
      },
      specialTerms,
      findings,
      caveats,
      generatedAt: new Date().toISOString(),
    };

    const version = await persistAnalysis(caseId, payload);
    payload.version = version;

    // 일정이 확정됐으므로 알림 계획을 갱신한다. 실패해도 분석 결과를 버리지 않는다 —
    // 알림은 부가 기능이고, 판정은 이미 완성됐다.
    try {
      await syncNotifications(caseId, row.user_id, row.title, schedule.events, today);
    } catch (err) {
      log.warn("알림 계획 갱신 실패", {
        caseId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await setCaseStatus(db, caseId, "analyzed");
    return payload;
  } catch (err) {
    await setCaseStatus(db, caseId, "failed").catch(() => undefined);
    throw err;
  }
}

function buildCaveats(args: {
  marketPrice: MarketPriceEstimate;
  extractions: CaseExtractions;
  holidaySynced: boolean;
  regionAvailable: boolean;
}): string[] {
  const caveats: string[] = [
    "이 결과는 참고용 점검이며 법률 자문이 아닙니다. 최종 판단 전 공인중개사·법률 전문가와 상담하세요.",
  ];
  if (args.marketPrice.source === "unavailable") {
    caveats.push("시세를 확인하지 못해 보증금 회수 가능성은 계산하지 못했습니다.");
  } else if (args.marketPrice.source === "molit_rtms" && (args.marketPrice.sampleSize ?? 0) < 5) {
    caveats.push(
      `시세 추정에 사용한 실거래 표본이 ${args.marketPrice.sampleSize}건뿐이라 오차가 클 수 있습니다.`,
    );
  }
  if (!args.extractions.registry) {
    caveats.push("등기부등본이 없어 권리관계 점검을 하지 못했습니다.");
  }
  if (!args.holidaySynced) {
    caveats.push(
      "공휴일 데이터에 설날·추석 등 음력 연휴가 반영되지 않았습니다. 잔금일이 연휴와 겹치는지 직접 확인하세요.",
    );
  }
  if (!args.regionAvailable) {
    caveats.push("매물 좌표가 없어 주변 전세사기 피해 이력을 조회하지 못했습니다.");
  }
  return caveats;
}

async function persistAnalysis(caseId: string, payload: AnalysisResultPayload): Promise<number> {
  const admin = adminClient();

  const { data: last } = await admin
    .from("analyses")
    .select("version")
    .eq("case_id", caseId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = ((last?.version as number | undefined) ?? 0) + 1;

  const { data: inserted, error } = await admin
    .from("analyses")
    .insert({
      case_id: caseId,
      version,
      rules_version: payload.rulesVersion,
      verdict: payload.verdict.verdict,
      score: payload.verdict.score,
      contractable: payload.verdict.contractable,
      headline: payload.verdict.headline,
      summary: payload.verdict.summary,
      payload: {
        verdict: payload.verdict,
        valuation: payload.valuation,
        schedule: payload.schedule,
        region: payload.region,
        crossCheck: payload.crossCheck,
        documents: payload.documents,
        caveats: payload.caveats,
      },
    })
    .select("id")
    .single();
  if (error || !inserted) throw new Error(`분석 결과 저장 실패: ${error?.message}`);

  const analysisId = inserted.id as string;

  if (payload.findings.length > 0) {
    const { error: fErr } = await admin.from("analysis_findings").insert(
      payload.findings.map((f, i) => ({
        analysis_id: analysisId,
        code: f.code,
        category: f.category,
        severity: f.severity,
        weight: f.weight,
        title: f.title,
        description: f.description,
        action: f.action ?? null,
        evidence: f.evidence ?? {},
        sort_order: i,
      })),
    );
    if (fErr) log.warn("finding 저장 실패", { caseId, error: fErr.message });
  }

  if (payload.specialTerms.length > 0) {
    const { error: tErr } = await admin.from("special_terms").insert(
      payload.specialTerms.map((t) => ({
        analysis_id: analysisId,
        code: t.code,
        category: t.category,
        priority: t.priority,
        required: t.required,
        title: t.title,
        clause_text: t.clauseText,
        reason: t.reason,
        triggered_by: t.triggeredBy,
      })),
    );
    if (tErr) log.warn("특약 저장 실패", { caseId, error: tErr.message });
  }

  // 일정 이벤트는 최신 분석 기준으로 갈아끼운다 (D-day 알림 발송의 원천 데이터).
  await admin.from("schedule_events").delete().eq("case_id", caseId);
  if (payload.schedule.events.length > 0) {
    const { error: sErr } = await admin.from("schedule_events").insert(
      payload.schedule.events.map((e) => ({
        case_id: caseId,
        analysis_id: analysisId,
        code: e.code,
        event_date: e.date,
        effective_at: e.effectiveAt ?? null,
        severity: e.severity,
        title: e.title,
        description: e.description,
        checklist: e.checklist,
        sort_order: e.sortOrder,
      })),
    );
    if (sErr) log.warn("일정 이벤트 저장 실패", { caseId, error: sErr.message });
  }

  return version;
}

/** 저장된 최신 분석 결과를 읽는다. 재계산 없이 화면을 다시 그릴 때 사용. */
export async function getLatestAnalysis(db: Db, caseId: string) {
  const { data, error } = await db
    .from("analyses")
    .select("id,version,rules_version,verdict,score,contractable,headline,summary,payload,created_at")
    .eq("case_id", caseId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`분석 결과 조회: ${error.message}`);
  if (!data) return null;

  const analysisId = data.id as string;
  const [findings, terms] = await Promise.all([
    db
      .from("analysis_findings")
      .select("code,category,severity,weight,title,description,action,evidence")
      .eq("analysis_id", analysisId)
      .order("sort_order", { ascending: true }),
    db
      .from("special_terms")
      .select("code,category,priority,required,title,clause_text,reason,triggered_by")
      .eq("analysis_id", analysisId)
      .order("priority", { ascending: true }),
  ]);

  return {
    version: data.version,
    rulesVersion: data.rules_version,
    verdict: data.verdict,
    score: data.score,
    contractable: data.contractable,
    headline: data.headline,
    summary: data.summary,
    ...(data.payload as Record<string, unknown>),
    findings: findings.data ?? [],
    specialTerms: (terms.data ?? []).map((t) => ({
      code: t.code,
      category: t.category,
      priority: t.priority,
      required: t.required,
      title: t.title,
      clauseText: t.clause_text,
      reason: t.reason,
      triggeredBy: t.triggered_by,
    })),
    createdAt: data.created_at,
  };
}
