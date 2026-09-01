import { loadEnv } from "../../env.js";
import { callPublicData, fail, ok, pickField, pickItems, toFloat, type PublicDataResult } from "./client.js";

/**
 * 국토교통부 건축HUB — 건축물대장 (포털 데이터셋 15134735).
 *
 * ## 왜 필요한가
 *
 * **위반건축물 여부**를 주소만으로 알 수 있다. 사용자가 서류를 하나도 올리지 않아도
 * 서버가 자동으로 조회할 수 있다는 뜻이다 — C단계 교차검증이 "공짜로" 생기는 지점.
 *
 * 위반건축물은 전세사기에서 중요하다.
 *  · 보증보험 가입이 거절된다 (가장 직접적인 피해)
 *  · 시정명령·이행강제금이 임대인에게 계속 부과된다
 *  · 근린생활시설을 주택으로 불법 개조한 경우, 주택임대차보호법 적용이 다퉈질 수 있다
 *
 * ## 주소로 조회하려면
 *
 * 이 API 는 **법정동코드 + 번지(본번·부번)** 를 받는다. 도로명주소로는 직접 못 부른다.
 * `juso.ts` 로 지번주소를 얻어 본번·부번을 분리해야 한다.
 *
 * 오퍼레이션: `/1613000/BldRgstHubService/getBrTitleInfo` (표제부)
 */

const ENDPOINT = "/1613000/BldRgstHubService/getBrTitleInfo";

export interface BuildingLedgerInfo {
  /** 건물명. */
  buildingName: string | null;
  /** 주용도. 예: "공동주택", "제2종근린생활시설" */
  mainUse: string | null;
  /**
   * 위반건축물 여부.
   *
   * `null` 은 "위반이 아니다"가 아니라 **"확인하지 못했다"** 이다.
   * 이 둘을 섞으면 확인 못 한 집을 안전하다고 말하게 된다.
   */
  isIllegal: boolean | null;
  /** 연면적(㎡). */
  totalFloorAreaM2: number | null;
  /** 세대수. 다가구 판단에 쓴다. */
  householdCount: number | null;
  /** 사용승인일 (YYYYMMDD). */
  approvedOn: string | null;
  /** 지상·지하 층수. */
  groundFloors: number | null;
  undergroundFloors: number | null;
}

/** 지번주소에서 본번·부번을 뽑는다. "둔산동 100-5" → { bun: "0100", ji: "0005" } */
export function parseBunji(jibunAddress: string): { bun: string; ji: string } | null {
  // 마지막에 나오는 "숫자" 또는 "숫자-숫자" 를 번지로 본다.
  const m = /(\d+)(?:-(\d+))?\s*$/.exec(jibunAddress.trim());
  if (!m) return null;
  return {
    // 이 API 는 4자리 zero-padding 을 요구한다.
    bun: m[1]!.padStart(4, "0"),
    ji: (m[2] ?? "0").padStart(4, "0"),
  };
}

export function isBuildingLedgerConfigured(): boolean {
  const env = loadEnv();
  return Boolean(env.MOLIT_BUILDING_LEDGER_KEY ?? env.DATA_GO_KR_SERVICE_KEY);
}

export interface BuildingLedgerQuery {
  /** 법정동코드 10자리. 앞 5자리가 시군구, 뒤 5자리가 법정동. */
  regionCode: string;
  /** 지번주소 (본번·부번을 뽑는다). */
  jibunAddress: string;
}

export async function fetchBuildingLedger({
  regionCode,
  jibunAddress,
}: BuildingLedgerQuery): Promise<PublicDataResult<BuildingLedgerInfo>> {
  const digits = regionCode.replace(/\D/g, "");
  if (digits.length < 10) {
    return fail("no_data", "건축물대장 조회에는 법정동코드 10자리가 필요합니다.");
  }
  const bunji = parseBunji(jibunAddress);
  if (!bunji) {
    return fail("no_data", "지번주소에서 번지를 읽지 못해 건축물대장을 조회할 수 없습니다.");
  }

  const res = await callPublicData({
    label: "건축물대장",
    path: ENDPOINT,
    serviceKey: loadEnv().MOLIT_BUILDING_LEDGER_KEY,
    params: {
      sigunguCd: digits.slice(0, 5),
      bjdongCd: digits.slice(5, 10),
      bun: bunji.bun,
      ji: bunji.ji,
      numOfRows: 10,
      pageNo: 1,
      _type: "xml",
    },
  });
  if (!res.ok) return res;

  const items = pickItems(res.data);
  if (items.length === 0) {
    return fail("no_data", "해당 주소의 건축물대장을 찾지 못했습니다.");
  }

  // 여러 동이 나오면 연면적이 가장 큰 것을 주 건물로 본다.
  const parsed = items.map((item) => ({
    item,
    area: toFloat(pickField(item, ["totArea", "연면적"])) ?? 0,
  }));
  const main = parsed.sort((a, b) => b.area - a.area)[0]!.item;

  const violationFlag = pickField(main, ["violYn", "위반건축물여부"]);

  return ok({
    buildingName: pickField(main, ["bldNm", "건물명"]),
    mainUse: pickField(main, ["mainPurpsCdNm", "주용도코드명"]),
    /**
     * "1" 이면 위반, "0" 이면 적법. 값이 없으면 **확인 못 함(null)** 이다.
     * 없는 것을 false 로 두면 "위반건축물 아님"이라고 잘못 말하게 된다.
     */
    isIllegal: violationFlag === null ? null : violationFlag === "1" || violationFlag === "Y",
    totalFloorAreaM2: toFloat(pickField(main, ["totArea", "연면적"])),
    householdCount:
      toFloat(pickField(main, ["hhldCnt", "세대수"])) ??
      toFloat(pickField(main, ["fmlyCnt", "가구수"])),
    approvedOn: pickField(main, ["useAprDay", "사용승인일"]),
    groundFloors: toFloat(pickField(main, ["grndFlrCnt", "지상층수"])),
    undergroundFloors: toFloat(pickField(main, ["ugrndFlrCnt", "지하층수"])),
  });
}
