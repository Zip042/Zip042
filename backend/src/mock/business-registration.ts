import type {
  BusinessRegistrationInput,
  BusinessRegistrationResult,
} from "../domain/types.js";

/**
 * 목 모드 사업자등록 진위확인.
 * 대표자 이름에 "가짜"가 들어 있으면 불일치로 응답한다 (위험 시나리오 개발용 트리거).
 */
export function mockBusinessRegistration(
  input: BusinessRegistrationInput,
): BusinessRegistrationResult {
  const valid = !input.representativeName.includes("가짜");
  return {
    source: "nts",
    valid,
    status: valid ? "확인됨" : "확인할 수 없습니다",
  };
}
