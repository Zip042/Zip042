import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "../../src/env.js";
import { adminClient } from "../../src/lib/supabase.js";
import { store } from "../../src/mock/store.js";
import { buildContractDraft, looksCorporate } from "../../src/services/contract-draft.service.js";

/**
 * `looksCorporate()` 는 더 이상 `buildContractDraft` 의 사업자등록 진위확인 분기를
 * 게이팅하지 않는다 (Finding 4 — 사업자등록번호 유무만으로 결정한다). 다만 향후 확장
 * (예: 등기부·계약서에서 실제로 법인/개인을 구분해야 하는 다른 로직)을 위해 함수 자체는
 * 남겨두고 여기서 순수 단위 테스트로 검증한다. `buildContractDraft` 의 진위확인 2분기
 * (not_applicable/unavailable) 자체는 tests/http/mock-flow.test.ts 의 "계약서 초안"
 * 스위트와 tests/http/api-surface.test.ts 가 e2e 로 커버한다.
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

/**
 * Finding 3: ensureExtractions 가 실패해도(예: DB 오류로 인한 "문서 조회: ..." throw)
 * buildContractDraft 전체가 500 으로 죽어서는 안 된다 — case 행 · 표준계약서 · 기본
 * 특약만으로도 초안은 낼 수 있기 때문이다. document.service.js 를 목으로 바꿔 실제로
 * reject 하는 상황을 재현해, `.catch(() => null)` 로 흡수되는지 직접 검증한다.
 */
vi.mock("../../src/services/document.service.js", () => ({
  ensureExtractions: vi.fn().mockRejectedValue(new Error("문서 조회: 목 DB 오류")),
}));

describe("buildContractDraft — 문서 추출 실패 방어(Finding 3)", () => {
  beforeEach(() => {
    process.env.ZIP042_MODE = "mock";
    resetEnvCache();
  });

  afterEach(() => {
    delete process.env.ZIP042_MODE;
    resetEnvCache();
  });

  it("ensureExtractions 가 reject 해도 초안을 200 상당으로 만들어낸다", async () => {
    const db = adminClient();
    const defaults = store.defaultsFor("cases");
    const caseId = defaults.id as string;
    const row = {
      ...defaults,
      user_id: "test-user",
      road_address: "대전광역시 서구 둔산로 100",
      detail_address: "301호",
      lease_type: "jeonse",
      deposit_krw: 90_000_000,
      business_registration_number: "123-45-67890",
    };
    store.table("cases").push(row);

    const draft = await buildContractDraft(db, caseId);

    expect(draft.propertyDescription).toBe("대전광역시 서구 둔산로 100 301호");
    // 추출 실패로 임대인 이름은 알 수 없지만(null), 사업자등록번호는 case 행에서 바로
    // 나오므로 진위확인 분기는 정상 동작한다 (Finding 1 — 실제 API는 호출하지 않는다).
    const lessor = draft.parties.find((p) => p.role === "임대인");
    expect(lessor?.name).toBeNull();
    expect(lessor?.businessVerification?.source).toBe("unavailable");
  });
});
