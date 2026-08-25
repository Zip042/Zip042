import { describe, expect, it } from "vitest";
import { looksCorporate } from "../../src/services/contract-draft.service.js";

/**
 * `buildContractDraft` 의 사업자등록번호 진위확인 3분기(not_applicable/unavailable/nts)는
 * 모두 `looksCorporate()` 가 true 를 반환해야 진입한다. 여기서는 그 게이트 로직만
 * 순수 단위 테스트로 검증한다 — HTTP · DB 를 통한 3분기 자체는
 * tests/http/mock-flow.test.ts 의 "계약서 초안" 스위트가 e2e 로 커버한다.
 */
describe("contract-draft.service — looksCorporate", () => {
  it("괄호형 '(주)' 표기를 법인으로 인식한다", () => {
    expect(looksCorporate("(주)테스트")).toBe(true);
  });

  it("'주식회사'를 법인으로 인식한다", () => {
    expect(looksCorporate("주식회사 대한")).toBe(true);
  });

  it("'유한회사'를 법인으로 인식한다", () => {
    expect(looksCorporate("유한회사 테스트")).toBe(true);
  });

  it("개인 이름은 법인이 아니다", () => {
    expect(looksCorporate("홍길동")).toBe(false);
  });

  it("이름이 없으면 법인이 아니다", () => {
    expect(looksCorporate(null)).toBe(false);
  });
});
