import { formatKo, type DateOnly } from "../lib/date.js";
import { maxRisk, type Finding, type RiskLevel } from "./types.js";

/**
 * 지역 위험 레이어 판정 (기획서 2 ②).
 *
 * PostGIS RPC(`region_risk_summary`)가 계산한 집계값을 위험 등급과 설명으로 번역한다.
 * DB는 숫자만, 의미 부여는 여기서 한다 — 규칙이 바뀌어도 마이그레이션이 필요 없다.
 */

/**
 * 반경 내 피해 건수 구간.
 *
 * ⚠️ 기획서 1-1 기준 대전 전체 피해가 서구 1,178건 · 유성구 976건 규모다. 이 밀도에서
 *    반경 500m 내 몇 건은 흔한 편이므로, 임계값을 낮게 잡으면 거의 모든 매물이 경고를 받아
 *    경고가 무의미해진다. 아래 값은 그 점을 감안한 것이고, 실제 데이터를 적재한 뒤
 *    분포를 보고 다시 조정해야 한다.
 */
export const REGION_THRESHOLDS = {
  caution: 1,
  danger: 10,
  /** 이 이상은 '피해 밀집 지역'으로 문구를 강하게 쓴다 (등급은 danger 로 유지). */
  critical: 25,
} as const;

export interface RegionRiskSummary {
  radiusM: number;
  /** 반경 내 피해 건수 합계 */
  victimCaseCount: number;
  /** 반경 내 피해 주택 수 (건물 단위) */
  victimSiteCount: number;
  nearestDistanceM: number | null;
  latestReportedOn: DateOnly | null;
  /** 동일 건물에서 발생한 피해 건수 */
  sameBuildingCount: number;
  /** 동일 소유자 명의로 발생한 피해 건수 */
  sameOwnerCount: number;
}

export interface RegionRiskResult {
  level: RiskLevel;
  summary: RegionRiskSummary;
  findings: Finding[];
}

/**
 * 반경 내 피해 밀도 → 등급.
 *
 * **최고 등급을 danger 로 제한한다.** 동네에 사고가 많다는 것은 주의 신호이지
 * "이 계약이 위험하다"는 증거가 아니다. 등기부가 깨끗하고 서류가 맞는 계약을
 * 주변 통계만으로 '계약 불가'로 만들면 오판이 되고, 사용자는 판정을 신뢰하지 않게 된다.
 *
 * 반면 **동일 건물 · 동일 소유자** 피해는 이 물건·이 임대인에 대한 직접 증거이므로
 * 그쪽은 critical 을 유지한다.
 */
function levelFromCount(count: number): RiskLevel {
  if (count >= REGION_THRESHOLDS.danger) return "danger";
  if (count >= REGION_THRESHOLDS.caution) return "caution";
  return "safe";
}

/** 밀도가 아주 높은 구간인지 (문구를 강하게 쓰기 위한 구분) */
function isHotspot(count: number): boolean {
  return count >= REGION_THRESHOLDS.critical;
}

export function evaluateRegionRisk(summary: RegionRiskSummary): RegionRiskResult {
  const findings: Finding[] = [];

  // 동일 건물 — 가장 강한 신호. 같은 건물에서 이미 사고가 났다는 뜻.
  if (summary.sameBuildingCount > 0) {
    findings.push({
      code: "REGION_SAME_BUILDING_VICTIM",
      category: "region",
      severity: "critical",
      weight: 45,
      title: `같은 건물에서 전세사기 피해가 ${summary.sameBuildingCount}건 있었어요`,
      description:
        "이 건물의 다른 호수에서 이미 전세사기 피해가 신고된 기록이 있습니다. 같은 임대인이 여러 호수를 " +
        "동일한 방식으로 계약했을 가능성이 높고, 건물 전체가 경매로 넘어가는 상황일 수 있습니다.",
      action:
        "이 건물은 피하는 것이 안전합니다. 계약을 검토한다면 해당 건물의 등기부와 선순위 임차 내역을 " +
        "전 호수 기준으로 확인하고, 전세보증금 반환보증 가입 가능 여부를 먼저 확인하세요.",
      evidence: { sameBuildingCount: summary.sameBuildingCount },
      suggestTerms: ["TERM_PRIOR_TENANT_DISCLOSURE", "TERM_GUARANTEE_COOPERATION"],
    });
  }

  // 동일 소유자
  if (summary.sameOwnerCount > 0) {
    findings.push({
      code: "REGION_SAME_OWNER_VICTIM",
      category: "region",
      severity: "critical",
      weight: 48,
      title: `이 집주인 명의의 다른 집에서 피해가 ${summary.sameOwnerCount}건 있었어요`,
      description:
        "같은 소유자 명의의 주택에서 전세사기 피해가 신고된 기록이 있습니다. 여러 채를 보유하고 " +
        "보증금으로 자금을 돌리다 반환하지 못하는 이른바 '깡통 임대인' 패턴에 해당할 수 있습니다.",
      action: "이 임대인과는 계약하지 마세요. 계약금을 이미 지급했다면 즉시 반환을 요구하세요.",
      evidence: { sameOwnerCount: summary.sameOwnerCount },
    });
  }

  // 반경 내 밀도
  const densityLevel = levelFromCount(summary.victimCaseCount);
  const hotspot = isHotspot(summary.victimCaseCount);
  if (densityLevel !== "safe") {
    findings.push({
      code: "REGION_NEARBY_VICTIMS",
      category: "region",
      severity: densityLevel,
      weight: hotspot ? 18 : densityLevel === "danger" ? 12 : 6,
      title: `반경 ${summary.radiusM}m 안에 전세사기 피해가 ${summary.victimCaseCount}건 있어요`,
      description:
        `주변 ${summary.radiusM}m 이내에서 신고된 피해가 ${summary.victimCaseCount}건(주택 ` +
        `${summary.victimSiteCount}곳)입니다.` +
        (summary.nearestDistanceM !== null
          ? ` 가장 가까운 피해 주택은 약 ${Math.round(summary.nearestDistanceM)}m 거리예요.`
          : "") +
        (summary.latestReportedOn ? ` 가장 최근 신고는 ${formatKo(summary.latestReportedOn)}입니다.` : "") +
        (hotspot
          ? " 이 동네는 피해가 특히 몰려 있는 곳입니다. 같은 수법이 반복되는 경우가 많으니 서류 확인을 특히 꼼꼼히 하세요."
          : " 같은 지역에서 유사한 수법이 반복되는 경우가 있으니 서류 확인을 꼼꼼히 하세요.") +
        " (주변 통계는 참고 정보입니다 — 이 집 자체의 위험은 등기부와 서류로 판단합니다.)",
      action:
        "등기부등본을 잔금일 당일에 반드시 재확인하고, 전세보증금 반환보증 가입을 강하게 권합니다. " +
        "주변 시세보다 눈에 띄게 조건이 좋은 매물은 특히 의심하세요.",
      evidence: {
        radiusM: summary.radiusM,
        victimCaseCount: summary.victimCaseCount,
        victimSiteCount: summary.victimSiteCount,
        nearestDistanceM: summary.nearestDistanceM,
        latestReportedOn: summary.latestReportedOn,
      },
      suggestTerms: ["TERM_GUARANTEE_COOPERATION", "TERM_REGISTRY_STATE_AT_BALANCE"],
    });
  } else {
    findings.push({
      code: "REGION_NO_NEARBY_VICTIMS",
      category: "region",
      severity: "safe",
      weight: 0,
      title: `반경 ${summary.radiusM}m 안에 신고된 피해가 없어요`,
      description:
        "주변에 신고된 전세사기 피해 기록이 없습니다. 다만 이는 '신고·공개된 건'만 반영한 결과이므로, " +
        "피해가 없다는 보장은 아닙니다. 서류 확인은 그대로 해야 합니다.",
      evidence: { radiusM: summary.radiusM },
    });
  }

  return {
    level: maxRisk(...findings.map((f) => f.severity)),
    summary,
    findings,
  };
}

/** 좌표가 없어 지역 분석을 못 했을 때. */
export function regionRiskUnavailable(radiusM: number): RegionRiskResult {
  return {
    level: "caution",
    summary: {
      radiusM,
      victimCaseCount: 0,
      victimSiteCount: 0,
      nearestDistanceM: null,
      latestReportedOn: null,
      sameBuildingCount: 0,
      sameOwnerCount: 0,
    },
    findings: [
      {
        code: "REGION_LOCATION_UNKNOWN",
        category: "region",
        kind: "info_gap",
        severity: "caution",
        weight: 3,
        title: "매물 위치를 몰라서 지역 위험을 확인하지 못했어요",
        description:
          "주소의 좌표를 확인할 수 없어 주변 피해 이력을 조회하지 못했습니다.",
        action: "도로명주소를 정확히 입력해 주세요.",
      },
    ],
  };
}
