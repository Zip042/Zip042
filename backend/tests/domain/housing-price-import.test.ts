import { describe, expect, it } from "vitest";
import {
  aggregateHousingPrices,
  findHousingPriceGroup,
  normalizeBuildingName,
  parseHousingPriceLine,
  type HousingPriceRow,
} from "../../src/domain/housing-price-import.js";

/**
 * 실제 브이월드 원본 파일(CO_AP_PRC_대전_중구.zip, 2026-05-18 갱신분)에서 그대로 옮긴
 * 표본 줄들이다. 동(棟) 표기가 있는 줄과 없는 줄을 섞어 뒤에서부터 자르는 로직을 검증한다.
 */
const SAMPLE_LINES = [
  // 동 표기 없음 (단일 건물 단지)
  "2026|01|20395837|1|6|3014010200|대전광역시 중구 우암로 18|대전광역시|중구|선화동||1|0|77|1||다온아파트||4|2|402|29.9023|96300000|Y|10721100218639",
  "2026|01|20395837|1|7|3014010200|대전광역시 중구 우암로 18|대전광역시|중구|선화동||1|0|77|1||다온아파트||5|1|501|29.6365|106000000|Y|10721100218640",
  "2026|01|20395837|1|8|3014010200|대전광역시 중구 우암로 18|대전광역시|중구|선화동||1|0|77|1||다온아파트||5|2|502|29.9023|99200000|Y|10721100218641",
  // 동 표기 있음 (여러 동 단지)
  "2026|01|20452806|2|32|3014011200|대전광역시 중구 동서대로1327번길 102|대전광역시|중구|용두동||1|0|723|0||대전하늘채엘센트로|102|10|1|1001|84.9913|316000000|Y|1000000000000005500168",
  // 유효여부 N — 제외돼야 한다
  "2026|01|10963|7|13|3014011600|대전광역시 중구 산성로 108-23|대전광역시|중구|문화동||1|0|757|0||주공3|307|1|3|103|39.87|46200000|N|1072190734",
];

describe("원본 줄 파싱", () => {
  it("동 표기가 없는 줄을 파싱한다", () => {
    const row = parseHousingPriceLine(SAMPLE_LINES[0]!);
    expect(row).toEqual({
      regionCode: "3014010200",
      roadAddress: "대전광역시 중구 우암로 18",
      sigungu: "중구",
      legalDong: "선화동",
      buildingName: "다온아파트",
      areaM2: 29.9023,
      priceKrw: 96_300_000,
    });
  });

  it("동 표기가 있어 필드 개수가 다른 줄도 뒤에서부터 잘라 파싱한다", () => {
    const row = parseHousingPriceLine(SAMPLE_LINES[3]!);
    expect(row?.buildingName).toBe("대전하늘채엘센트로");
    expect(row?.areaM2).toBeCloseTo(84.9913, 4);
    expect(row?.priceKrw).toBe(316_000_000);
  });

  it("유효여부가 N 인 줄은 버린다", () => {
    expect(parseHousingPriceLine(SAMPLE_LINES[4]!)).toBeNull();
  });

  it("빈 줄 · 필드 부족은 null", () => {
    expect(parseHousingPriceLine("")).toBeNull();
    expect(parseHousingPriceLine("   ")).toBeNull();
    expect(parseHousingPriceLine("2026|01|3")).toBeNull();
  });

  it("가격·면적이 0 이하면 버린다", () => {
    const zeroed = SAMPLE_LINES[0]!.replace("96300000", "0");
    expect(parseHousingPriceLine(zeroed)).toBeNull();
  });

  it("법정동코드가 10자리가 아니면 버린다", () => {
    const bad = SAMPLE_LINES[0]!.replace("3014010200", "301401");
    expect(parseHousingPriceLine(bad)).toBeNull();
  });
});

describe("단지명 정규화", () => {
  it("공백과 괄호를 지운다", () => {
    expect(normalizeBuildingName("다온 아파트")).toBe("다온아파트");
    expect(normalizeBuildingName("래미안(2단지)")).toBe("래미안");
  });
});

describe("집계", () => {
  const rows = SAMPLE_LINES.map(parseHousingPriceLine).filter((r): r is HousingPriceRow => r !== null);

  it("같은 (법정동코드, 정규화 이름) 은 한 그룹으로 묶인다", () => {
    const groups = aggregateHousingPrices(rows);
    // 다온아파트 3세대 + 대전하늘채엘센트로 1세대 = 2그룹 (N 은 이미 걸러짐)
    expect(groups).toHaveLength(2);
  });

  it("㎡당 가격은 평균이 아니라 중위값이다", () => {
    // 다온아파트 세 세대의 ㎡당 단가: 96300000/29.9023, 106000000/29.6365, 99200000/29.9023
    const groups = aggregateHousingPrices(rows);
    const daon = groups.find((g) => g.buildingName === "다온아파트")!;
    const perM2 = [96_300_000 / 29.9023, 106_000_000 / 29.6365, 99_200_000 / 29.9023].sort((a, b) => a - b);
    expect(daon.medianPricePerM2Krw).toBe(Math.round(perM2[1]!));
    expect(daon.sampleSize).toBe(3);
  });

  it("표본이 1건뿐인 단지도 그룹으로 남는다", () => {
    const groups = aggregateHousingPrices(rows);
    const centro = groups.find((g) => g.buildingName === "대전하늘채엘센트로");
    expect(centro?.sampleSize).toBe(1);
  });

  it("빈 입력은 빈 배열", () => {
    expect(aggregateHousingPrices([])).toEqual([]);
  });
});

describe("단지 찾기", () => {
  const rows = SAMPLE_LINES.map(parseHousingPriceLine).filter((r): r is HousingPriceRow => r !== null);
  const groups = aggregateHousingPrices(rows);

  it("정확한 이름으로 찾는다", () => {
    const g = findHousingPriceGroup(groups, "3014010200", "다온아파트");
    expect(g?.buildingName).toBe("다온아파트");
  });

  it("공백이 섞인 이름도 찾는다", () => {
    const g = findHousingPriceGroup(groups, "3014010200", "다온 아파트");
    expect(g?.buildingName).toBe("다온아파트");
  });

  it("부분 일치로도 찾는다", () => {
    const g = findHousingPriceGroup(groups, "3014011200", "하늘채엘센트로");
    expect(g?.buildingName).toBe("대전하늘채엘센트로");
  });

  it("다른 법정동코드면 찾지 못한다", () => {
    expect(findHousingPriceGroup(groups, "3014011600", "다온아파트")).toBeNull();
  });

  it("일치하는 이름이 없으면 null", () => {
    expect(findHousingPriceGroup(groups, "3014010200", "존재하지않는단지")).toBeNull();
  });

  it("빈 이름이면 null", () => {
    expect(findHousingPriceGroup(groups, "3014010200", "")).toBeNull();
  });
});
