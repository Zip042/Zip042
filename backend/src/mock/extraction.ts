import { todayKst } from "../lib/date.js";
import type { MarketPriceEstimate } from "../domain/types.js";
import type { MarketPriceQuery } from "../services/market-price.service.js";
import type { ExtractableDocType, ExtractionResult } from "../services/extraction.service.js";
import {
  buildScenario,
  guessScenarioFromFileName,
  scenarioConfidence,
  type ScenarioKey,
} from "./fixtures.js";

/**
 * 문서 판독 · 시세 조회 대역 (목 모드 전용).
 *
 * 실제 서비스와 **같은 반환 타입**을 돌려준다. 그래서 나중에 API 키를 넣으면
 * 이 파일만 우회되고 나머지 코드 경로는 그대로 동작한다.
 */

/** 문서 ID → 시나리오. 라우트에서 등록 시 지정한다. */
const documentScenarios = new Map<string, ScenarioKey>();

export const DEFAULT_SCENARIO: ScenarioKey = "mortgage_moderate";

export function setDocumentScenario(documentId: string, key: ScenarioKey): void {
  documentScenarios.set(documentId, key);
}

export function getDocumentScenario(documentId: string | undefined): ScenarioKey | null {
  if (!documentId) return null;
  return documentScenarios.get(documentId) ?? null;
}

export function clearDocumentScenarios(): void {
  documentScenarios.clear();
}

/**
 * 시나리오 결정 우선순위
 *   1. 문서 등록 시 명시한 `mockScenario`
 *   2. 파일명에 포함된 시나리오 키 (예: `등기부_trust.pdf`)
 *   3. 기본값
 */
function resolveScenario(ctx: { documentId?: string; originalName?: string | null }): ScenarioKey {
  return (
    getDocumentScenario(ctx.documentId) ??
    guessScenarioFromFileName(ctx.originalName) ??
    DEFAULT_SCENARIO
  );
}

export function mockExtraction(
  docType: ExtractableDocType,
  ctx: { documentId?: string; originalName?: string | null },
): ExtractionResult<unknown> {
  const key = resolveScenario(ctx);
  const bundle = buildScenario(key, todayKst());

  const payload =
    docType === "registry"
      ? bundle.registry
      : docType === "brokerage_statement"
        ? bundle.brokerage
        : bundle.lease;

  return {
    payload,
    // 실제 모델명 대신 픅스처임을 분명히 밝힌다. DB에 그대로 저장되어 추적에 쓰인다.
    model: `mock-fixture:${key}`,
    schemaVersion: "2026-08-20",
    confidence: scenarioConfidence(key),
    usage: null,
  };
}

/**
 * 시세 대역.
 *
 * 결정론적으로 계산한다 — 같은 매물은 항상 같은 시세가 나와야 프론트엔드가 화면을 비교할 수 있다.
 * 건물 유형별 ㎡당 단가에 지역코드로 약간의 변화를 준다.
 */
const UNIT_PRICE_PER_M2: Record<string, number> = {
  apartment: 9_500_000,
  officetel: 6_200_000,
  multi_family: 7_400_000,
  row_house: 7_000_000,
  studio: 6_500_000,
  multi_household: 5_600_000,
  detached: 5_200_000,
  other: 6_800_000,
};

export function mockMarketPrice(query: MarketPriceQuery): MarketPriceEstimate {
  const base = UNIT_PRICE_PER_M2[query.buildingKind] ?? UNIT_PRICE_PER_M2.other!;

  // 지역코드에서 -4% ~ +4% 범위의 결정론적 보정치를 만든다.
  const digits = query.regionCode.replace(/\D/g, "").slice(0, 5) || "00000";
  const variance = ((Number(digits) % 9) - 4) / 100;
  const unitPrice = Math.round(base * (1 + variance));

  const estimated = Math.round(unitPrice * query.exclusiveAreaM2);

  return {
    estimatedKrw: estimated,
    lowKrw: Math.round(estimated * 0.92),
    highKrw: Math.round(estimated * 1.08),
    // source 는 실제 값(molit_rtms)을 쓰지 않는다 — 픅스처임을 프론트엔드가 구분할 수 있어야 한다.
    source: "manual",
    method: `목 모드 픅스처 — ${query.buildingKind} ㎡당 ${unitPrice.toLocaleString("ko-KR")}원 × ${query.exclusiveAreaM2}㎡`,
    sampleSize: 12,
    confidence: 0.5,
  };
}

/**
 * 시나리오가 지정한 시세를 쓰고 싶을 때 (개발용 시드에서 사용).
 * 시나리오별 기대 판정을 재현하려면 시세도 시나리오 값과 맞아야 한다.
 */
export function scenarioMarketPrice(key: ScenarioKey): number {
  return buildScenario(key, todayKst()).marketPriceKrw;
}
