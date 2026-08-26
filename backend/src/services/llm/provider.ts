import { loadEnv } from "../../env.js";

/**
 * 판독 모델 제공자 선택.
 *
 * ## 왜 두 개를 다 지원하는가
 *
 * A단계 구현 가이드는 Claude(`messages.parse` + document 블록)로 쓰여 있고,
 * 팀이 확정한 API 목록에는 Gemini 가 올라 있습니다. 둘 중 하나를 코드에 박으면
 * 나머지 문서가 즉시 틀린 문서가 됩니다.
 *
 * 그래서 **키가 있는 쪽을 쓴다**로 정했습니다. 둘 다 있으면 `LLM_PROVIDER` 로 고릅니다.
 * 어느 쪽이든 판독 결과는 **같은 zod 스키마로 정규화**되므로 규칙 엔진은 차이를 모릅니다.
 *
 * 두 모델의 공통점이 이 설계를 가능하게 합니다.
 *   · PDF 를 그대로 입력받는다 (별도 OCR 불필요)
 *   · 구조화 출력을 스키마로 **강제**할 수 있다 ("JSON 으로 답해줘"라고 부탁하지 않는다)
 */

export type LlmProviderName = "anthropic" | "gemini";

export interface LlmAvailability {
  /** 실제로 쓸 제공자. 키가 하나도 없으면 null. */
  active: LlmProviderName | null;
  anthropic: boolean;
  gemini: boolean;
  /** 왜 이 제공자가 선택됐는지. `/v1/meta` 와 preflight 에 그대로 노출한다. */
  reason: string;
}

/**
 * 지금 쓸 수 있는 판독 제공자를 정한다.
 *
 * 목 모드에서는 키 없이도 픽스처로 판독이 "가능"하므로 이 함수를 쓰지 않는다.
 */
export function resolveLlmProvider(): LlmAvailability {
  const env = loadEnv();
  const anthropic = Boolean(env.ANTHROPIC_API_KEY);
  const gemini = Boolean(env.GEMINI_API_KEY);

  if (env.LLM_PROVIDER === "anthropic") {
    return {
      active: anthropic ? "anthropic" : null,
      anthropic,
      gemini,
      reason: anthropic
        ? "LLM_PROVIDER=anthropic 으로 지정됨"
        : "LLM_PROVIDER=anthropic 인데 ANTHROPIC_API_KEY 가 없습니다.",
    };
  }

  if (env.LLM_PROVIDER === "gemini") {
    return {
      active: gemini ? "gemini" : null,
      anthropic,
      gemini,
      reason: gemini
        ? "LLM_PROVIDER=gemini 로 지정됨"
        : "LLM_PROVIDER=gemini 인데 GEMINI_API_KEY 가 없습니다.",
    };
  }

  // auto — 키가 있는 쪽. 둘 다 있으면 Anthropic 을 먼저 쓴다(A단계 가이드 기준이고,
  // 프롬프트가 그쪽에 맞춰 튜닝돼 있다). 바꾸려면 LLM_PROVIDER 를 명시하면 된다.
  if (anthropic) {
    return {
      active: "anthropic",
      anthropic,
      gemini,
      reason: gemini
        ? "두 키가 모두 있어 Anthropic 을 씁니다. 바꾸려면 LLM_PROVIDER=gemini 로 지정하세요."
        : "ANTHROPIC_API_KEY 가 설정되어 있습니다.",
    };
  }
  if (gemini) {
    return { active: "gemini", anthropic, gemini, reason: "GEMINI_API_KEY 가 설정되어 있습니다." };
  }

  return {
    active: null,
    anthropic: false,
    gemini: false,
    reason: "판독 모델 키가 없습니다. ANTHROPIC_API_KEY 또는 GEMINI_API_KEY 를 설정하세요.",
  };
}
