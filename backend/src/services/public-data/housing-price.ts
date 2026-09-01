import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fail, ok, type PublicDataResult } from "./client.js";
import {
  findHousingPriceGroup,
  type HousingPriceGroup,
} from "../../domain/housing-price-import.js";

/**
 * 국토교통부 공동주택가격정보 — **공시가격** (대전만, 반기 갱신 정적 데이터).
 *
 * ## 왜 API 가 아니라 파일인가
 *
 * 포털 데이터셋 15124003 "국토교통부_공동주택가격정보(WMS/WFS/속성정보)"는 REST API 가
 * **아니다.** 실제로 호출하면 `NO_OPENAPI_SERVICE_ERROR` 가 난다. 포털 페이지의
 * "API 유형: LINK" 가 그 증거였다 — data.go.kr 안에 스펙이 없다는 뜻이다.
 *
 * 진짜 데이터는 브이월드(vworld.kr)가 **로그인한 사용자에게만** 자치구별 zip 으로 준다.
 * 자동 스크립트가 대신 받을 수 없는 구조라, 사람이 반기(6개월)마다 한 번 받아
 * `npm run import:housing-price` 로 정적 JSON(`data/housing-price/daejeon.json`)으로
 * 바꿔 커밋해 둔다. 원본 파싱·집계 규칙은 `domain/housing-price-import.ts` 에 있다.
 *
 * ## 왜 대전만인가
 *
 * 이 서비스는 대전 기준으로 시작했다(REGION_THRESHOLDS · classifyRegion 등도 대전이
 * 정확하고 그 외 지역은 보수적 근사다). 전국을 받으면 원본만 수백MB 다. 다른 지역이
 * 필요해지면 같은 zip 을 추가로 받아 import 스크립트를 다시 돌리면 된다.
 *
 * ## 왜 시세가 아니라 공시가격이 따로 필요한가
 *
 * **HUG 전세보증금반환보증의 심사 기준이 공시가격이기 때문이다.** HUG 는 실거래
 * 시세가 아니라 공시가격에 일정 배율을 곱한 값을 주택가격으로 본다. 그래서
 * "실거래가로는 여유가 있는데 보증보험은 거절되는" 상황이 생긴다.
 *
 * ⚠️ **배율은 반드시 확인하고 쓸 것.**
 *    공동주택 126% 는 2026년 8월 기준으로 팀이 정리한 값이다. HUG 는 이 배율과
 *    담보인정비율(전세가율 상한)을 **수시로 바꾼다.** 아래 상수를 그대로 믿지 말고
 *    HUG 공지로 확인한 뒤 갱신하세요. 틀리면 "가입 가능"이라고 잘못 안내하게 된다.
 */

export const HUG_PRICE_MULTIPLIER = 1.26;
export const HUG_LTV_CAP = 0.9;

/** 대전 5개 자치구 법정동코드 앞5자리. 이 밖의 지역은 데이터가 없다. */
const DAEJEON_SIGUNGU_CODES = new Set(["30110", "30140", "30170", "30200", "30230"]);

interface HousingPriceFile {
  generatedAt: string;
  baseYear: string;
  groups: HousingPriceGroup[];
}

let cached: HousingPriceFile | null | undefined; // undefined = 아직 안 읽음, null = 읽었는데 없음/실패

/**
 * `data/housing-price/daejeon.json` 을 찾아 읽는다.
 *
 * 현재 실행 파일 위치에서 위로 올라가며 찾는다 — `tsx` 로 `src/` 에서 바로 돌 때와
 * `tsc` 빌드 후 `dist/src/` 에서 돌 때 상대 깊이가 다르기 때문이다(빌드는 non-TS
 * 자산을 dist 로 복사하지 않는다). 고정된 `../../..` 대신 실제로 존재하는 지점을
 * 찾을 때까지 올라가면 두 경우 모두에서 안전하다.
 *
 * 실패해도 예외를 던지지 않는다 — 이 데이터는 참고용 신호일 뿐이라, 못 찾았다고
 * 서버 전체가 죽으면 안 된다.
 */
function loadDataFile(): HousingPriceFile | null {
  if (cached !== undefined) return cached;

  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    const candidate = join(dir, "data", "housing-price", "daejeon.json");
    if (existsSync(candidate)) {
      try {
        cached = JSON.parse(readFileSync(candidate, "utf8")) as HousingPriceFile;
        return cached;
      } catch {
        break; // 손상된 파일 — 아래에서 null 로 확정
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break; // 파일시스템 루트
    dir = parent;
  }
  cached = null;
  return cached;
}

/** 테스트에서 캐시를 비우기 위한 훅. */
export function resetHousingPriceCache(): void {
  cached = undefined;
}

export function isHousingPriceConfigured(): boolean {
  return loadDataFile() !== null;
}

export interface HousingPriceInfo {
  /** 공시가격(원). 단지 ㎡당 중위가 × 조회한 전용면적. */
  officialPriceKrw: number;
  baseYear: string | null;
  /** 매칭된 단지의 원본 표기 이름. 조회가 맞았는지 사용자가 확인할 수 있게. */
  matchedName: string | null;
  /** 이 단지 집계에 쓰인 세대 수. 적을수록 대표성이 낮다. */
  sampleSize: number;
}

export interface HousingPriceQuery {
  /** 법정동코드 10자리. */
  regionCode: string;
  /** 단지명. 없으면 매칭할 수 없다. */
  buildingName?: string | null;
  /** 전용면적(㎡). 단지 ㎡당 중위가에 곱해 이 세대의 공시가격을 추정한다. */
  exclusiveAreaM2: number;
}

export async function fetchHousingPrice({
  regionCode,
  buildingName,
  exclusiveAreaM2,
}: HousingPriceQuery): Promise<PublicDataResult<HousingPriceInfo>> {
  const digits = regionCode.replace(/\D/g, "");
  if (digits.length < 10) {
    return fail("no_data", "공시가격 조회에는 법정동코드 10자리가 필요합니다.");
  }
  if (!DAEJEON_SIGUNGU_CODES.has(digits.slice(0, 5))) {
    return fail("no_data", "지금은 대전 지역 공동주택만 공시가격 데이터가 있습니다.");
  }
  if (!buildingName || buildingName.trim().length === 0) {
    return fail("no_data", "단지명이 없어 공시가격을 찾을 수 없습니다.");
  }
  if (!Number.isFinite(exclusiveAreaM2) || exclusiveAreaM2 <= 0) {
    return fail("no_data", "전용면적을 알 수 없어 공시가격을 계산할 수 없습니다.");
  }

  const file = loadDataFile();
  if (!file) {
    return fail("no_key", "공동주택가격 데이터가 준비되지 않았습니다. (data/housing-price/daejeon.json 없음)");
  }

  const group = findHousingPriceGroup(file.groups, digits, buildingName);
  if (!group) {
    return fail("no_data", `"${buildingName}" 단지의 공시가격을 찾지 못했습니다.`);
  }

  return ok({
    officialPriceKrw: Math.round(group.medianPricePerM2Krw * exclusiveAreaM2),
    baseYear: file.baseYear,
    matchedName: group.buildingName,
    sampleSize: group.sampleSize,
  });
}

export interface GuaranteeAssessment {
  recognizedPriceKrw: number;
  ratio: number;
  eligible: boolean;
  explanation: string;
}

/**
 * 공시가격으로 보증보험 가입 가능성을 가늠한다.
 *
 * **참고용 신호다.** HUG 실제 심사는 주택 유형·신축 여부·임대인 신용까지 본다.
 * 여기서 "가능"이 나와도 거절될 수 있고 그 반대도 있다. 그래서 문구에 기준을 함께 넣는다.
 */
export function assessGuarantee(
  officialPriceKrw: number,
  seniorClaimsKrw: number,
  depositKrw: number,
): GuaranteeAssessment {
  const recognized = Math.round(officialPriceKrw * HUG_PRICE_MULTIPLIER);
  const ratio = recognized > 0 ? (seniorClaimsKrw + depositKrw) / recognized : Number.POSITIVE_INFINITY;
  const eligible = ratio <= HUG_LTV_CAP;

  const man = (v: number) => `${Math.round(v / 10_000).toLocaleString("ko-KR")}만원`;

  return {
    recognizedPriceKrw: recognized,
    ratio,
    eligible,
    explanation:
      `공시가격 ${man(officialPriceKrw)} × ${Math.round(HUG_PRICE_MULTIPLIER * 100)}% = ${man(recognized)} 를 ` +
      `주택가격으로 봅니다. 선순위 채권과 보증금 합계는 ${man(seniorClaimsKrw + depositKrw)} 로 ` +
      `그 ${Math.round(ratio * 100)}% 입니다. ` +
      (eligible
        ? `기준(${Math.round(HUG_LTV_CAP * 100)}% 이하)을 만족하지만, 실제 심사는 주택 유형과 임대인 사정까지 봅니다.`
        : `기준(${Math.round(HUG_LTV_CAP * 100)}% 이하)을 넘어 가입이 거절될 수 있습니다. 계약 전에 HUG 에 직접 확인하세요.`),
  };
}
