import { beforeEach, describe, expect, it } from "vitest";
import {
  assessGuarantee,
  fetchHousingPrice,
  isHousingPriceConfigured,
  resetHousingPriceCache,
} from "../../../src/services/public-data/housing-price.js";

/**
 * 실제로 커밋된 data/housing-price/daejeon.json 을 그대로 읽어 검증한다(목이 아니다).
 * 이 파일이 반기 갱신 때 형식이 바뀌거나 사라지면 여기서 잡힌다.
 */
describe("공동주택가격 서비스 (번들 데이터)", () => {
  beforeEach(() => {
    resetHousingPriceCache();
  });

  it("번들 데이터가 로드된다", () => {
    expect(isHousingPriceConfigured()).toBe(true);
  });

  it("실제 대전 단지를 지역코드·단지명으로 찾아 공시가격을 계산한다", async () => {
    const res = await fetchHousingPrice({
      regionCode: "3011010100",
      buildingName: "뜰안채주상복합",
      exclusiveAreaM2: 59.9,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.matchedName).toBe("뜰안채주상복합");
    expect(res.data.sampleSize).toBeGreaterThan(0);
    expect(res.data.officialPriceKrw).toBeGreaterThan(0);
  });

  it("대전 밖 지역코드는 no_data", async () => {
    const res = await fetchHousingPrice({
      regionCode: "1111010100", // 서울 종로
      buildingName: "아무단지",
      exclusiveAreaM2: 59.9,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failure).toBe("no_data");
  });

  it("존재하지 않는 단지명은 no_data", async () => {
    const res = await fetchHousingPrice({
      regionCode: "3011010100",
      buildingName: "이런단지는없다",
      exclusiveAreaM2: 59.9,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failure).toBe("no_data");
  });

  it("단지명이 없으면 no_data", async () => {
    const res = await fetchHousingPrice({
      regionCode: "3011010100",
      buildingName: null,
      exclusiveAreaM2: 59.9,
    });
    expect(res.ok).toBe(false);
  });

  it("전용면적이 0 이하면 no_data", async () => {
    const res = await fetchHousingPrice({
      regionCode: "3011010100",
      buildingName: "뜰안채주상복합",
      exclusiveAreaM2: 0,
    });
    expect(res.ok).toBe(false);
  });
});

describe("HUG 보증 가능 여부 판정", () => {
  it("선순위+보증금이 인정가의 90% 이하면 가능", () => {
    const result = assessGuarantee(100_000_000, 0, 80_000_000);
    // 인정가 = 100,000,000 * 1.26 = 126,000,000. 80,000,000 / 126,000,000 ≈ 63.5%
    expect(result.eligible).toBe(true);
    expect(result.recognizedPriceKrw).toBe(126_000_000);
  });

  it("선순위+보증금이 인정가의 90% 를 넘으면 불가", () => {
    const result = assessGuarantee(100_000_000, 50_000_000, 80_000_000);
    // (50,000,000 + 80,000,000) / 126,000,000 ≈ 103%
    expect(result.eligible).toBe(false);
  });
});
