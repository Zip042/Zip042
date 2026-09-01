import { log } from "../lib/logger.js";
import { guessScenarioFromFileName, SCENARIO_KEYS, type ScenarioKey } from "./fixtures.js";
import { setDocumentScenario } from "./extraction.js";

/**
 * 문서 등록 시 판독 시나리오를 확정한다 (목 모드 전용).
 *
 * 우선순위: 요청의 mockScenario → 파일명 추측 → 지정 없음(판독 시 기본값 사용).
 * 알 수 없는 키가 오면 조용히 무시하지 않고 경고를 남긴다 — 프론트엔드의 오타를 잡기 위해서다.
 */
export function applyMockScenario(
  documentId: string,
  requested: string | null | undefined,
  originalName: string | null | undefined,
): ScenarioKey | null {
  if (requested) {
    if (SCENARIO_KEYS.includes(requested as ScenarioKey)) {
      setDocumentScenario(documentId, requested as ScenarioKey);
      return requested as ScenarioKey;
    }
    log.warn("알 수 없는 mockScenario", { requested, known: SCENARIO_KEYS });
  }

  const guessed = guessScenarioFromFileName(originalName);
  if (guessed) {
    setDocumentScenario(documentId, guessed);
    return guessed;
  }
  return null;
}
