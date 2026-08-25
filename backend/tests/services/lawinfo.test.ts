import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCache } from "../../src/env.js";
import {
  fetchLawArticle,
  fetchStandardLeaseForm,
  isLawInfoAvailable,
} from "../../src/services/lawinfo.service.js";

describe("lawinfo.service", () => {
  beforeEach(() => {
    process.env.ZIP042_MODE = "mock";
    delete process.env.LAW_GO_KR_OC;
    resetEnvCache();
  });

  afterEach(() => {
    delete process.env.ZIP042_MODE;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    resetEnvCache();
  });

  it("목 모드에서는 항상 사용 가능하다고 보고한다", () => {
    expect(isLawInfoAvailable()).toBe(true);
  });

  it("목 모드에서 조문 원문을 돌려준다", async () => {
    const result = await fetchLawArticle("주택임대차보호법", "000300");
    expect(result.source).toBe("law_go_kr");
    expect(result.text).toContain("그 다음 날부터 제삼자에 대하여 효력이 생긴다");
  });

  it("목 모드에서 표준계약서 서식 링크를 돌려준다", async () => {
    const result = await fetchStandardLeaseForm();
    expect(result.source).toBe("law_go_kr");
    expect(result.pdfUrl).not.toBeNull();
  });

  it("live 모드인데 OC 키가 없으면 unavailable을 반환한다", async () => {
    process.env.ZIP042_MODE = "live";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "a".repeat(20);
    process.env.SUPABASE_SERVICE_ROLE_KEY = "b".repeat(20);
    resetEnvCache();

    const result = await fetchLawArticle("주택임대차보호법", "000300");
    expect(result.source).toBe("unavailable");
    expect(result.text).toBeNull();
    expect(result.url).toContain("law.go.kr");
  });
});
