/**
 * 공동주택가격정보 원본 파일(CO_AP_PRC_*.TXT) 파싱·집계 — 순수 함수.
 *
 * ## 왜 API 가 아니라 파일인가
 *
 * data.go.kr 의 "국토교통부_공동주택가격정보(WMS/WFS/속성정보)"(15124003)는 REST API 가
 * 아니다. 포털 페이지의 "API 유형: LINK" 가 그 증거다 — 실제로 호출하면
 * `NO_OPENAPI_SERVICE_ERROR` 가 난다. 진짜 데이터는 브이월드(vworld.kr)가 **로그인한
 * 사용자에게만** 지역별 zip 파일로 내려준다. 그래서 이 서비스는 반기(6개월)마다
 * 사람이 한 번 내려받아 `npm run import:housing-price` 로 이 형태로 바꿔 커밋해 둔다.
 *
 * ## 원본 파일 형식
 *
 *   · 인코딩: CP949(EUC-KR). UTF-8 이 아니다.
 *   · 구분자: `|`. 필드 25개 고정.
 *   · 앞쪽 필드는 위치가 고정이지만, 동(棟) 표기가 있는 단지와 없는 단지에서
 *     중간 필드 개수가 달라진다. 그래서 **뒤에서부터** 안전하게 자른다
 *     (면적·가격·유효여부·고유ID 는 항상 마지막 4개).
 *
 * 실제 한 줄 예시(디코딩 후):
 *   2026|01|20395837|1|6|3014010200|대전광역시 중구 우암로 18|대전광역시|중구|선화동
 *     ||1|0|77|1||다온아파트||4|2|402|29.9023|96300000|Y|10721100218639
 *
 * ## 집계 단위를 왜 (법정동코드, 단지명) 으로 잡았나
 *
 * 원본은 세대(호) 단위라 대전 5개 구만 합쳐도 44만 행이 넘는다. 이 서비스가 실제로
 * 묻는 질문은 "이 단지의 ㎡당 공시가가 보통 얼마인가"이지 "정확히 이 동·호수가
 * 얼마인가"가 아니다(사용자가 동·호수까지 등기부에서 넘겨주지 않는다). 그래서 단지
 * 단위로 **㎡당 가격의 중위값**을 낸다 — 평균이 아니라 중위값을 쓰는 이유는
 * market-price.service.ts 와 같다: 특이 거래(복층·펜트하우스 등)에 덜 흔들린다.
 */

export interface HousingPriceRow {
  regionCode: string;
  roadAddress: string;
  sigungu: string;
  legalDong: string;
  buildingName: string;
  areaM2: number;
  priceKrw: number;
}

/**
 * 원본 텍스트(디코딩 후) 한 줄을 파싱한다.
 *
 * 형식이 어긋난 줄(필드 수 부족, 유효여부 'N', 단지명 없음)은 `null` 을 돌려주고
 * 조용히 건너뛴다 — 값을 지어내는 것보다 그 줄을 버리는 편이 안전하다.
 */
export function parseHousingPriceLine(line: string): HousingPriceRow | null {
  if (!line.trim()) return null;
  const f = line.split("|");
  if (f.length < 10) return null;

  const flag = f[f.length - 2];
  if (flag !== "Y") return null; // "N" 은 미공시·제외 대상으로 추정된다.

  const areaM2 = Number(f[f.length - 4]);
  const priceKrw = Number(f[f.length - 3]);
  if (!Number.isFinite(areaM2) || areaM2 <= 0) return null;
  if (!Number.isFinite(priceKrw) || priceKrw <= 0) return null;

  const regionCode = f[5]?.trim() ?? "";
  const buildingName = f[16]?.trim() ?? "";
  if (!/^\d{10}$/.test(regionCode) || buildingName.length === 0) return null;

  return {
    regionCode,
    roadAddress: f[6]?.trim() ?? "",
    sigungu: f[8]?.trim() ?? "",
    legalDong: f[9]?.trim() ?? "",
    buildingName,
    areaM2,
    priceKrw,
  };
}

/** 단지명 비교용 정규화. 공백·괄호를 지운다 (market-price.service.ts 와 같은 규칙). */
export function normalizeBuildingName(name: string): string {
  return name.replace(/\s|\(.*?\)/g, "").trim();
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export interface HousingPriceGroup {
  regionCode: string;
  /** 원본 표기 그대로. 화면·매칭 결과 설명에 쓴다. */
  buildingName: string;
  sigungu: string;
  legalDong: string;
  /** ㎡당 공시가격 중위값 (원). 조회 시점의 exclusiveAreaM2 를 곱해 쓴다. */
  medianPricePerM2Krw: number;
  /** 이 단지에서 집계에 쓴 세대 수. 표본이 적으면 신뢰도가 낮다. */
  sampleSize: number;
}

/**
 * 세대별 원본 행을 (법정동코드, 정규화한 단지명) 단위로 묶어 ㎡당 중위가를 낸다.
 *
 * 정규화한 이름이 같아도 표기가 다른 경우(예: "다온아파트" vs "다온 아파트")가
 * 있을 수 있어 **가장 흔한 원본 표기**를 대표 이름으로 남긴다.
 */
export function aggregateHousingPrices(rows: readonly HousingPriceRow[]): HousingPriceGroup[] {
  const groups = new Map<
    string,
    { regionCode: string; sigungu: string; legalDong: string; pricePerM2: number[]; nameCounts: Map<string, number> }
  >();

  for (const row of rows) {
    const key = `${row.regionCode}::${normalizeBuildingName(row.buildingName)}`;
    let g = groups.get(key);
    if (!g) {
      g = { regionCode: row.regionCode, sigungu: row.sigungu, legalDong: row.legalDong, pricePerM2: [], nameCounts: new Map() };
      groups.set(key, g);
    }
    g.pricePerM2.push(row.priceKrw / row.areaM2);
    g.nameCounts.set(row.buildingName, (g.nameCounts.get(row.buildingName) ?? 0) + 1);
  }

  const out: HousingPriceGroup[] = [];
  for (const g of groups.values()) {
    const representativeName = [...g.nameCounts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    out.push({
      regionCode: g.regionCode,
      buildingName: representativeName,
      sigungu: g.sigungu,
      legalDong: g.legalDong,
      medianPricePerM2Krw: Math.round(median(g.pricePerM2)),
      sampleSize: g.pricePerM2.length,
    });
  }
  // 조회 시 예측 가능하도록 정렬해 둔다(지역코드 → 단지명).
  return out.sort((a, b) => a.regionCode.localeCompare(b.regionCode) || a.buildingName.localeCompare(b.buildingName, "ko"));
}

/**
 * 집계 결과에서 단지를 찾는다.
 *
 * 정확히 일치하는 이름이 없으면 부분 일치("래미안" 으로 "래미안둔산" 을 찾는 식)를
 * 허용하되, 여러 건이 걸리면 표본이 가장 많은(=가장 신뢰할 수 있는) 것을 고른다.
 */
export function findHousingPriceGroup(
  groups: readonly HousingPriceGroup[],
  regionCode: string,
  buildingName: string,
): HousingPriceGroup | null {
  const wantedRegion = regionCode.slice(0, 10);
  const wantedName = normalizeBuildingName(buildingName);
  if (wantedName.length === 0) return null;

  const candidates = groups.filter(
    (g) =>
      g.regionCode === wantedRegion &&
      (normalizeBuildingName(g.buildingName).includes(wantedName) ||
        wantedName.includes(normalizeBuildingName(g.buildingName))),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, cur) => (cur.sampleSize > best.sampleSize ? cur : best));
}
