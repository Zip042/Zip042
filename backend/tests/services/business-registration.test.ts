import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "../../src/env.js";
import {
  isBusinessRegistrationAvailable,
  verifyBusinessRegistration,
} from "../../src/services/business-registration.service.js";

/** live 모드 + 서비스 키가 있는 상태로 만들어, 실제 `fetch` 분기에 도달하게 한다. */
function enableLiveModeWithServiceKey(): void {
  process.env.ZIP042_MODE = "live";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "a".repeat(20);
  process.env.SUPABASE_SERVICE_ROLE_KEY = "b".repeat(20);
  process.env.DATA_GO_KR_SERVICE_KEY = "test-service-key";
  resetEnvCache();
}

describe("business-registration.service", () => {
  beforeEach(() => {
    process.env.ZIP042_MODE = "mock";
    delete process.env.DATA_GO_KR_SERVICE_KEY;
    resetEnvCache();
  });

  afterEach(() => {
    delete process.env.ZIP042_MODE;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.DATA_GO_KR_SERVICE_KEY;
    vi.unstubAllGlobals();
    resetEnvCache();
  });

  it("목 모드에서는 항상 사용 가능하다", () => {
    expect(isBusinessRegistrationAvailable()).toBe(true);
  });

  it("목 모드에서 정상 대표자명은 valid=true", async () => {
    const result = await verifyBusinessRegistration({
      businessNumber: "123-45-67890",
      representativeName: "김대표",
      openingDate: "2020-01-01",
    });
    expect(result.source).toBe("nts");
    expect(result.valid).toBe(true);
  });

  it("목 모드에서 대표자명에 '가짜'가 있으면 valid=false", async () => {
    const result = await verifyBusinessRegistration({
      businessNumber: "123-45-67890",
      representativeName: "가짜대표",
      openingDate: "2020-01-01",
    });
    expect(result.valid).toBe(false);
  });

  it("live 모드인데 서비스 키가 없으면 unavailable", async () => {
    process.env.ZIP042_MODE = "live";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "a".repeat(20);
    process.env.SUPABASE_SERVICE_ROLE_KEY = "b".repeat(20);
    resetEnvCache();

    const result = await verifyBusinessRegistration({
      businessNumber: "123-45-67890",
      representativeName: "김대표",
      openingDate: "2020-01-01",
    });
    expect(result.source).toBe("unavailable");
    expect(result.valid).toBeNull();
  });

  it("live 모드에서 국세청 API가 오류 응답을 주면 unavailable로 폴백한다", async () => {
    enableLiveModeWithServiceKey();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyBusinessRegistration({
      businessNumber: "123-45-67890",
      representativeName: "김대표",
      openingDate: "2020-01-01",
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(result.source).toBe("unavailable");
    expect(result.valid).toBeNull();
  });

  it("live 모드에서 응답 본문에 valid 필드가 없으면 unavailable로 폴백한다", async () => {
    enableLiveModeWithServiceKey();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{}] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyBusinessRegistration({
      businessNumber: "123-45-67890",
      representativeName: "김대표",
      openingDate: "2020-01-01",
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(result.source).toBe("unavailable");
    expect(result.valid).toBeNull();
  });
});
