import { addDays, formatKo } from "../lib/date.js";
import { formatKrw, toPercent } from "./money.js";
import { RISK_LABEL_KO, RISK_ORDER, maxRisk, type Finding, type RiskLevel } from "./types.js";
import type { RecommendedTerm } from "./special-terms.js";
import type { ValuationResult } from "./valuation.js";
import type { ScheduleResult } from "./schedule.js";

/**
 * 종합 판정 — 기획서 2 ①의 세 가지 질문에 답을 만든다.
 *   ① 계약해도 되는지        → contractable + conditions
 *   ② 서류상 문제가 없는지    → verdict + topFindings
 *   ③ 무엇을 요구해야 하는지  → requiredActions (특약 · 서류 요구)
 */

/** 점수 구간 → 등급. severity 기반 등급과 max 를 취해 최종 결정한다. */
const SCORE_THRESHOLDS = {
  caution: 15,
  danger: 40,
  // 치명적 finding 이 하나도 없는데 '매우 위험'을 붙이려면 문제가 아주 많이 겹쳐야 한다.
  critical: 85,
} as const;

/** 이 점수 이상이면 critical 이 없어도 계약을 권하지 않는다. */
const NOT_CONTRACTABLE_SCORE = 55;

/**
 * 같은 카테고리 안에서 두 번째 이후 항목의 가중치를 체감시킨다.
 *
 * 왜 필요한가: 점수를 단순 합산하면 "작은 문제 다섯 개"가 "경매 진행 중" 하나보다 높게 나온다.
 * 실제로 서류 문제 두 번째 항목은 첫 번째만큼 새로운 정보를 주지 않으므로,
 * 순위에 따라 기여도를 줄여야 점수가 해석 가능한 값이 된다.
 */
function diminishingFactor(rankWithinCategory: number): number {
  return rankWithinCategory === 0 ? 1 : 0.5 / rankWithinCategory;
}

/** 위험 점수 계산. `info_gap`(확인 못 한 항목)은 위험 점수에 넣지 않는다. */
export function computeRiskScore(findings: Finding[]): number {
  const byCategory = new Map<string, number[]>();
  for (const f of findings) {
    if (f.kind === "info_gap") continue;
    if (f.weight <= 0) continue;
    const list = byCategory.get(f.category) ?? [];
    list.push(f.weight);
    byCategory.set(f.category, list);
  }

  let total = 0;
  for (const weights of byCategory.values()) {
    weights.sort((a, b) => b - a);
    weights.forEach((w, i) => {
      total += w * diminishingFactor(i);
    });
  }
  return Math.min(100, Math.max(0, Math.round(total)));
}

export interface VerdictInput {
  findings: Finding[];
  valuation: ValuationResult;
  schedule: ScheduleResult;
  recommendedTerms: RecommendedTerm[];
  depositKrw: number;
}

export interface VerdictResult {
  verdict: RiskLevel;
  verdictLabel: string;
  /** 위험 점수 (0~100). `info_gap` 항목은 제외한 값이다. */
  score: number;
  /**
   * 확인하지 못한 항목들. "위험하다"가 아니라 "모른다"에 해당한다.
   * 하나라도 있으면 판정은 최소 '주의' 이상이 되고, 프론트엔드는 별도 섹션으로 보여줘야 한다.
   */
  informationGaps: Finding[];
  /**
   * 이것을 확인하지 못하면 판정 자체를 완료할 수 없는 항목.
   * 예: 시세 미확인 → 보증금 회수 가능성 계산 불가 / 다가구 선순위 보증금 미상.
   * 하나라도 있으면 `contractable` 은 false 가 된다 — "모르는데 괜찮다"고 말할 수는 없다.
   */
  blockingGaps: Finding[];
  /** 필요한 정보를 모두 확인했는지 */
  checkedCompletely: boolean;
  contractable: boolean;
  /** 계약을 진행하려면 반드시 충족해야 하는 조건 */
  conditions: string[];
  headline: string;
  summary: string;
  /** 위험도 · 가중치 순으로 정렬된 상위 항목 */
  topFindings: Finding[];
  /** 카테고리별 최고 위험도 — 프론트엔드의 섹션 배지에 사용 */
  categoryLevels: Record<string, RiskLevel>;
  requiredActions: string[];
  counts: Record<RiskLevel, number>;
}

function scoreToLevel(score: number): RiskLevel {
  if (score >= SCORE_THRESHOLDS.critical) return "critical";
  if (score >= SCORE_THRESHOLDS.danger) return "danger";
  if (score >= SCORE_THRESHOLDS.caution) return "caution";
  return "safe";
}

function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const bySeverity = RISK_ORDER[b.severity] - RISK_ORDER[a.severity];
    if (bySeverity !== 0) return bySeverity;
    return b.weight - a.weight;
  });
}

export function buildVerdict(input: VerdictInput): VerdictResult {
  const { findings, valuation, schedule, recommendedTerms, depositKrw } = input;

  const counts: Record<RiskLevel, number> = { safe: 0, caution: 0, danger: 0, critical: 0 };
  for (const f of findings) counts[f.severity] += 1;

  const informationGaps = findings.filter((f) => f.kind === "info_gap");
  const riskFindings = findings.filter((f) => f.kind !== "info_gap");
  const score = computeRiskScore(findings);

  // 등급은 **실제 위험** 항목의 최고 심각도와 위험 점수로 정한다.
  const severityLevel = maxRisk(...riskFindings.map((f) => f.severity));
  let verdict = maxRisk(severityLevel, scoreToLevel(score));

  // 확인하지 못한 항목이 있으면 '안전'이라고 말할 수 없다.
  // 검증하지 않은 것을 검증했다고 하는 것이 이 서비스에서 가장 위험한 거짓말이다.
  if (informationGaps.length > 0) verdict = maxRisk(verdict, "caution");

  const hasCritical = riskFindings.some((f) => f.severity === "critical");
  // 확인하지 못한 항목 중 심각한 것들 — 이게 남아 있으면 판정을 완료할 수 없다.
  const blockingGaps = informationGaps.filter(
    (g) => g.severity === "danger" || g.severity === "critical",
  );
  const contractable =
    !hasCritical && score < NOT_CONTRACTABLE_SCORE && blockingGaps.length === 0;

  const sorted = sortFindings(findings.filter((f) => f.severity !== "safe"));
  // 상단 요약에는 실제 위험만 올린다. 확인 못 한 항목은 informationGaps 로 따로 나간다.
  const topFindings = sorted.filter((f) => f.kind !== "info_gap").slice(0, 8);

  const categoryLevels: Record<string, RiskLevel> = {};
  for (const f of findings) {
    categoryLevels[f.category] = maxRisk(categoryLevels[f.category] ?? "safe", f.severity);
  }

  // 계약 조건: 필수 특약 + critical finding 의 action + 확인 못 한 항목 해결
  const conditions: string[] = [];
  for (const gap of informationGaps.filter((g) => g.severity !== "safe")) {
    if (gap.action) conditions.push(`확인 필요: ${gap.title}`);
  }
  for (const term of recommendedTerms.filter((t) => t.required)) {
    conditions.push(`특약 반영: ${term.title}`);
  }
  for (const f of sorted.filter((f) => f.severity === "critical")) {
    if (f.action) conditions.push(f.action.split(". ")[0]!.trim());
  }

  const requiredActions = [
    ...new Set(
      sorted
        .filter((f) => f.severity === "critical" || f.severity === "danger")
        .map((f) => f.action)
        .filter((a): a is string => Boolean(a)),
    ),
  ];

  return {
    verdict,
    verdictLabel: RISK_LABEL_KO[verdict],
    score,
    informationGaps,
    blockingGaps,
    checkedCompletely: informationGaps.length === 0,
    contractable,
    conditions: [...new Set(conditions)],
    headline:
      blockingGaps.length > 0 && !hasCritical
        ? `아직 판단할 수 없어요 — ${blockingGaps[0]!.title}`
        : buildHeadline(verdict, contractable, topFindings, valuation),
    summary: buildSummary({ verdict, contractable, sorted, valuation, schedule, depositKrw, score }),
    topFindings,
    categoryLevels,
    requiredActions,
    counts,
  };
}

function buildHeadline(
  verdict: RiskLevel,
  contractable: boolean,
  sorted: Finding[],
  valuation: ValuationResult,
): string {
  const lead = sorted[0];
  switch (verdict) {
    case "critical":
      return lead
        ? `계약을 권하지 않아요 — ${lead.title}`
        : "계약을 권하지 않아요 — 심각한 위험 신호가 발견됐어요";
    case "danger":
      return lead
        ? `조건을 고치지 않으면 위험해요 — ${lead.title}`
        : "위험 신호가 있어요. 조건을 고쳐야 합니다";
    case "caution":
      return valuation.burdenRatioPercent !== null
        ? `대체로 괜찮지만 확인할 게 있어요 (빚+보증금 = 집값의 ${valuation.burdenRatioPercent}%)`
        : "대체로 괜찮지만 확인할 게 있어요";
    case "safe":
    default:
      return contractable
        ? "큰 위험 신호는 없어요. 아래 특약만 챙기세요"
        : "큰 위험 신호는 없어요";
  }
}

function buildSummary(args: {
  verdict: RiskLevel;
  contractable: boolean;
  sorted: Finding[];
  valuation: ValuationResult;
  schedule: ScheduleResult;
  depositKrw: number;
  score: number;
}): string {
  const { verdict, contractable, sorted, valuation, schedule, depositKrw } = args;
  const parts: string[] = [];

  // 1) 결론
  parts.push(
    contractable
      ? `점검 결과는 '${RISK_LABEL_KO[verdict]}'입니다. 아래 조건을 지키면 계약을 진행해도 괜찮아요.`
      : `점검 결과는 '${RISK_LABEL_KO[verdict]}'입니다. 지금 조건 그대로는 계약을 권하지 않습니다.`,
  );

  // 2) 돈 이야기 — 사용자가 가장 궁금해하는 부분
  if (valuation.evaluable && valuation.simulation) {
    const s = valuation.simulation;
    if (s.expectedShortfallKrw > 0) {
      parts.push(
        `이 집의 값은 약 ${formatKrw(valuation.marketPriceKrw!)}이고, 먼저 잡힌 빚과 내 보증금을 합치면 ` +
          `집값의 ${valuation.burdenRatioPercent}%예요. 집이 경매로 넘어간다면 보증금 ` +
          `${formatKrw(depositKrw)} 중 약 ${formatKrw(s.expectedShortfallKrw)}을 돌려받지 못할 수 있습니다.`,
      );
    } else {
      parts.push(
        `이 집의 값은 약 ${formatKrw(valuation.marketPriceKrw!)}이고, 빚과 보증금을 합쳐도 집값의 ` +
          `${valuation.burdenRatioPercent}% 수준이라 경매로 넘어가도 보증금을 회수할 수 있는 구조입니다.`,
      );
    }
  } else {
    parts.push(
      "시세를 확인하지 못해 '보증금을 돌려받을 수 있는지'는 계산하지 못했습니다. 시세를 입력하면 다시 계산해 드려요.",
    );
  }

  // 3) 일정 이야기
  if (schedule.evaluable && schedule.unprotectedWindow) {
    const w = schedule.unprotectedWindow;
    parts.push(
      `일정상 잔금을 낸 뒤 ${w.days}일 동안은 법적 보호를 받지 못합니다. ` +
        `전입신고와 확정일자를 예정대로 마치면 보호는 ` +
        `${formatKo(addDays(w.toDate, 1))} 0시부터 시작돼요.`,
    );
  }

  // 4) 확인하지 못한 항목
  const gaps = sorted.filter((f) => f.kind === "info_gap");
  if (gaps.length > 0) {
    parts.push(
      `다만 ${gaps.length}가지는 확인하지 못했습니다(${gaps.slice(0, 2).map((f) => f.title).join(", ")}). ` +
        "이건 '문제가 있다'는 뜻이 아니라 '아직 못 봤다'는 뜻이에요.",
    );
  }

  // 5) 가장 급한 항목 (확인 못 한 항목은 제외 — 성격이 다르다)
  const urgent = sorted
    .filter((f) => f.kind !== "info_gap")
    .filter((f) => f.severity === "critical" || f.severity === "danger")
    .slice(0, 2);
  if (urgent.length > 0) {
    parts.push(`가장 먼저 해결할 것: ${urgent.map((f) => f.title).join(" / ")}.`);
  }

  return parts.join(" ");
}

/** 판정 결과를 프론트엔드 배지 색상 키로. 기획서 3-4 §7 "상태 표현"과 대응. */
export function verdictBadge(level: RiskLevel): { key: RiskLevel; label: string; tone: string } {
  const tone: Record<RiskLevel, string> = {
    safe: "positive",
    caution: "warning",
    danger: "negative",
    critical: "critical",
  };
  return { key: level, label: RISK_LABEL_KO[level], tone: tone[level] };
}

/** 사용자에게 보여줄 부담률 게이지 값 (0~100, 100 초과는 100으로 clamp). */
export function burdenGauge(valuation: ValuationResult): number | null {
  if (valuation.burdenRatio === null) return null;
  return Math.min(100, Math.max(0, toPercent(valuation.burdenRatio, 0) ?? 0));
}
