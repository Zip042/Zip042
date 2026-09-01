import { log } from "../lib/logger.js";
import { adminClient } from "../lib/supabase.js";
import type { SmallLesseeThreshold } from "../domain/valuation.js";

/**
 * 소액임차인 최우선변제 기준 조회 (주택임대차보호법 시행령 제10조 · 제11조).
 *
 * 지역 구분과 금액은 개정되므로 DB(small_lessee_thresholds)를 진실의 원천으로 둔다.
 * ⚠️ 지역 분류 로직은 완전하지 않다. '수도권 과밀억제권역'은 수도권정비계획법 시행령의
 *    시·군·구 목록으로 정의되어 있어, 정확한 판정에는 그 목록 전체가 필요하다.
 *    현재 구현은 ZIP 042의 1차 대상 지역(대전광역시)을 정확히 처리하고,
 *    그 외 지역은 보수적으로(보호 범위가 좁은 쪽으로) 분류한다.
 */

export type RegionClass = "seoul" | "overconcentration" | "metropolitan" | "other";

const METROPOLITAN_CITIES = ["부산", "대구", "대전", "광주", "울산"] as const;
/** 시행령이 광역시와 같은 기준으로 묶어 놓은 시 */
const METROPOLITAN_EQUIVALENT = ["안산", "파주", "이천", "평택"] as const;

export function classifyRegion(sigungu: string | null | undefined): RegionClass {
  const text = (sigungu ?? "").replace(/\s/g, "");
  if (!text) return "other";

  if (text.includes("서울")) return "seoul";
  if (text.includes("세종") || text.includes("용인") || text.includes("화성") || text.includes("김포")) {
    return "overconcentration";
  }
  // 광역시의 '군' 지역은 광역시 기준에서 제외된다 (예: 부산 기장군, 대구 달성군).
  if (METROPOLITAN_CITIES.some((c) => text.includes(c))) {
    return text.includes("군") ? "other" : "metropolitan";
  }
  if (METROPOLITAN_EQUIVALENT.some((c) => text.includes(c))) return "metropolitan";
  return "other";
}

interface ThresholdRow {
  region_class: string;
  region_label: string;
  max_deposit_krw: number;
  priority_krw: number;
  effective_from: string;
}

/**
 * 계약일 기준으로 적용되는 기준을 찾는다.
 * (임차인의 보호 범위는 계약 시점이 아니라 '담보물권 설정 시점'을 기준으로 판단하는 것이
 *  대법원 입장이나, 사전 안내 목적에서는 계약일 기준이 실용적이다. UI에 참고용임을 표시할 것.)
 */
export async function findSmallLesseeThreshold(
  sigungu: string | null | undefined,
  referenceDate: string,
): Promise<SmallLesseeThreshold | null> {
  const regionClass = classifyRegion(sigungu);

  const { data, error } = await adminClient()
    .from("small_lessee_thresholds")
    .select("region_class,region_label,max_deposit_krw,priority_krw,effective_from")
    .eq("region_class", regionClass)
    .lte("effective_from", referenceDate)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    log.warn("소액임차인 기준 조회 실패", { error: error.message, regionClass });
    return null;
  }
  if (!data) {
    log.warn("소액임차인 기준 데이터 없음", { regionClass, referenceDate });
    return null;
  }

  const row = data as unknown as ThresholdRow;
  return {
    regionClass: row.region_class,
    regionLabel: row.region_label,
    maxDepositKrw: row.max_deposit_krw,
    priorityKrw: row.priority_krw,
  };
}
