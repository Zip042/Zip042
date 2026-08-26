import { loadEnv } from "../../env.js";
import { callPublicData, fail, ok, pickField, pickItems, toInt, type PublicDataResult } from "./client.js";

/**
 * 국토교통부 공동주택가격정보 (포털 데이터셋 15124003) — **공시가격**.
 *
 * ## 왜 시세가 아니라 공시가격이 따로 필요한가
 *
 * **HUG 전세보증금반환보증의 심사 기준이 공시가격이기 때문이다.**
 *
 * HUG 는 실거래 시세가 아니라 공시가격에 일정 배율을 곱한 값을 주택가격으로 본다.
 * 그래서 "실거래가로는 여유가 있는데 보증보험은 거절되는" 상황이 생긴다. 사용자에게
 * 가장 실질적인 정보는 "이 조건으로 보증보험에 들 수 있는가"이므로, 시세와 별개로
 * 공시가격을 알아야 한다.
 *
 * ⚠️ **배율은 반드시 확인하고 쓸 것.**
 *    공동주택 126% 는 2026년 8월 기준으로 팀이 정리한 값이다. HUG 는 이 배율과
 *    담보인정비율(전세가율 상한)을 **수시로 바꾼다.** 아래 상수를 그대로 믿지 말고
 *    HUG 공지로 확인한 뒤 갱신하세요. 틀리면 "가입 가능"이라고 잘못 안내하게 된다.
 *
 * ⚠️ **아래 ENDPOINT 는 미검증 — 실제 키로 호출하면 `NO_OPENAPI_SERVICE_ERROR`(코드 12) 가
 *    난다.** 포털 페이지의 "API 유형"이 `LINK` 로 표시되는데, 이는 data.go.kr 안에 스펙이
 *    없고 국가공간정보센터(관리부서)가 별도로 문서를 낸다는 뜻이다. 이름 그대로
 *    "WMS/WFS/속성정보" 이므로 RTMS 류의 단순 REST 가 아니라 OGC 지도 서비스(WMS/WFS)
 *    + 별도 속성 조회 API 조합일 가능성이 높다. 포털 "상세설명" 문서(로그인 후 열람)나
 *    관리부서(국가공간정보센터, 02-1661-0115)에 문의해 실제 오퍼레이션을 확인하고 나서
 *    이 상수를 고칠 것. 그때까지 이 기능(HUG 참고 판정)은 조용히 `unexpected_format` 으로
 *    빠진다 — 판정 전체를 막지는 않는다(HUG 판정은 참고용 신호일 뿐이다).
 */

const ENDPOINT = "/1613000/AptListService2/getLegaldongAptList";

/**
 * 공시가격 → 주택가격 인정 배율.
 *
 * 근거: 팀 정리 문서 "집톡 필요 API 요약"(2026-08) — 공동주택 공시가 × 126%.
 * 운영 전 HUG 공지로 재확인이 필요한 값이다.
 */
export const HUG_PRICE_MULTIPLIER = 1.26;

/**
 * 담보인정비율 — (선순위 채권 + 보증금)이 인정 주택가격의 이 비율을 넘으면 거절된다.
 * 신축·비아파트에 따라 달라지므로 보수적으로 90% 를 쓴다.
 */
export const HUG_LTV_CAP = 0.9;

export interface HousingPriceInfo {
  /** 공시가격(원). */
  officialPriceKrw: number;
  /** 기준 연도. */
  baseYear: string | null;
  /** 단지·동·호 식별에 쓴 이름. 조회가 맞았는지 사용자가 확인할 수 있게. */
  matchedName: string | null;
}

export function isHousingPriceConfigured(): boolean {
  const env = loadEnv();
  return Boolean(env.MOLIT_HOUSING_PRICE_KEY ?? env.DATA_GO_KR_SERVICE_KEY);
}

export interface HousingPriceQuery {
  /** 법정동코드 10자리. */
  regionCode: string;
  /** 단지명. 여러 건이 나올 때 고르는 데 쓴다. */
  buildingName?: string | null;
}

/** 이름 비교용 정규화. 공백·괄호를 지운다. */
function normalize(name: string): string {
  return name.replace(/\s|\(.*?\)/g, "").trim();
}

export async function fetchHousingPrice({
  regionCode,
  buildingName,
}: HousingPriceQuery): Promise<PublicDataResult<HousingPriceInfo>> {
  const digits = regionCode.replace(/\D/g, "");
  if (digits.length < 10) {
    return fail("no_data", "공시가격 조회에는 법정동코드 10자리가 필요합니다.");
  }

  const res = await callPublicData({
    label: "공동주택가격",
    path: ENDPOINT,
    serviceKey: loadEnv().MOLIT_HOUSING_PRICE_KEY,
    params: { bjdCode: digits, numOfRows: 100, pageNo: 1, _type: "xml" },
  });
  if (!res.ok) return res;

  const items = pickItems(res.data);
  if (items.length === 0) {
    return fail("no_data", "해당 지역의 공동주택가격 정보를 찾지 못했습니다.");
  }

  // 단지명이 있으면 그것과 맞는 항목을 고른다.
  const wanted = buildingName ? normalize(buildingName) : null;
  const matched = wanted
    ? items.find((it) => {
        const name = pickField(it, ["kaptName", "complexName", "단지명"]);
        return name ? normalize(name).includes(wanted) || wanted.includes(normalize(name)) : false;
      })
    : null;

  const target = matched ?? items[0]!;
  const price = toInt(pickField(target, ["pblntfPc", "공시가격", "price"]));

  if (price === null || price <= 0) {
    // 값을 못 읽었으면 0 으로 채우지 않는다. 모르는 것은 모르는 것이다.
    return fail("unexpected_format", "공시가격 값을 응답에서 찾지 못했습니다. 필드명이 바뀌었을 수 있습니다.");
  }

  return ok({
    officialPriceKrw: price,
    baseYear: pickField(target, ["pblntfYear", "기준연도", "baseYear"]),
    matchedName: pickField(target, ["kaptName", "complexName", "단지명"]),
  });
}

export interface GuaranteeAssessment {
  /** 공시가격 × 배율 = HUG 가 보는 주택가격. */
  recognizedPriceKrw: number;
  /** (선순위 채권 + 보증금) / 인정 주택가격. */
  ratio: number;
  /** 이 조건으로 보증보험 가입이 가능해 보이는지. */
  eligible: boolean;
  /** 화면에 그대로 쓸 수 있는 설명. 기준을 밝히지 않으면 사용자가 납득하지 못한다. */
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
