import { GLOSSARY_TERMS } from "./glossary.js";
import type { Finding, RiskLevel } from "./types.js";
import type { VerdictResult } from "./verdict.js";

/**
 * B단계 판정 계약 — 화면이 그대로 쓸 수 있는 형태.
 *
 * ## 왜 별도 계층인가
 *
 * 규칙 엔진(`registry-risk` · `valuation` · `schedule` …)은 `Finding` 을 만들고,
 * `verdict.ts` 가 그것을 종합합니다. 그 구조는 점수·가중치를 다루기 때문에 내부용으로는
 * 정확하지만, **화면이 읽기에는 너무 많은 것을 알아야 합니다**(weight 가 뭔지, score 가
 * 뭔지, kind 가 뭔지).
 *
 * 이 파일은 그것을 구현 가이드가 정한 **네 등급 + 네 가지 정보**로 좁힙니다.
 * 화면은 이 형태만 알면 되고, 내부 점수 체계가 바뀌어도 화면은 바뀌지 않습니다.
 *
 * ## 등급 네 개
 *
 *   STOP     계약을 멈추고 확인해야 한다
 *   WARN     확인이 필요하다
 *   OK       이 항목은 문제가 없다
 *   UNKNOWN  판정에 필요한 정보가 없다  ← **OK 가 아니다**
 *
 * 종합 등급은 **개별 등급의 최댓값**입니다. 평균이 아닙니다. 신탁등기 하나가 걸리면
 * 나머지가 아무리 깨끗해도 STOP 입니다 — 사기 판정은 가중평균이 아니라 거부권입니다.
 *
 * 순수 함수만 둡니다. `verdict.ts` 의 결과를 변환할 뿐 새로 판정하지 않습니다.
 */

export const JUDGMENT_GRADES = ["OK", "UNKNOWN", "WARN", "STOP"] as const;
export type JudgmentGrade = (typeof JUDGMENT_GRADES)[number];

/** 서열. 종합 등급을 낼 때 최댓값을 고르는 기준. */
const GRADE_ORDER: Record<JudgmentGrade, number> = { OK: 0, UNKNOWN: 1, WARN: 2, STOP: 3 };

export interface Judgment {
  /** 안정적인 항목 코드. 규칙 엔진의 `Finding.code` 를 그대로 쓴다. */
  code: string;
  grade: JudgmentGrade;
  /** 화면에 크게 보여줄 제목. */
  title: string;
  /** 쉬운 말 설명. */
  description: string;
  /**
   * 등기부 어디를 보고 그렇게 판단했는지 (사람이 읽는 형태).
   * 예: "근저당권설정 (3번, 2024-03-15)"
   */
  basis: string[];
  /**
   * A단계에서 받아 둔 **원문 그대로의 문장**.
   * 근거를 못 대는 값은 못 믿는 값이다 — 사용자가 등기부와 직접 대조할 수 있어야 한다.
   */
  sourceQuotes: string[];
  /**
   * 다음에 무엇을 해야 하는지. **판정의 절반이 이것이다.**
   * 위험하다는 말만 하면 사용자는 얼어붙는다.
   */
  nextAction: string | null;
  /** 이 항목을 설명하는 용어사전 링크. 처음 듣는 말을 바로 찾아볼 수 있게. */
  glossaryHref: string | null;
}

export interface JudgmentResult {
  overallGrade: JudgmentGrade;
  judgments: Judgment[];
  calculation: {
    seniorClaimsKrw: number;
    depositKrw: number;
    /** 시세. 모르면 **null** 이다 — 0 이 아니다. */
    marketPriceKrw: number | null;
    /** (선순위 채권 + 보증금) / 시세. 시세를 모르면 null. */
    burdenRatio: number | null;
    /** 시세를 알아 비율을 계산할 수 있었는지. */
    computable: boolean;
  };
  /**
   * UNKNOWN 을 해소하려면 무엇을 떼 와야 하는지.
   * C단계(교차검증)의 입구가 된다.
   */
  documentsNeeded: string[];
}

// ---------------------------------------------------------------------------
// 변환
// ---------------------------------------------------------------------------

/**
 * `Finding` 하나를 네 등급 중 하나로 옮긴다.
 *
 *  - `kind: "info_gap"` → **무조건 UNKNOWN**. 심각도와 무관하다.
 *    "확인하지 못했다"는 "위험하다"가 아니고, 더더욱 "안전하다"가 아니다.
 *  - 실제 위험은 심각도에 따라 STOP / WARN / OK.
 */
export function gradeOf(finding: Finding): JudgmentGrade {
  if (finding.kind === "info_gap") return "UNKNOWN";
  switch (finding.severity) {
    case "critical":
    case "danger":
      return "STOP";
    case "caution":
      return "WARN";
    default:
      return "OK";
  }
}

/** 개별 등급의 **최댓값**. 평균이 아니다. */
export function overallGrade(grades: readonly JudgmentGrade[]): JudgmentGrade {
  return grades.reduce<JudgmentGrade>(
    (worst, g) => (GRADE_ORDER[g] > GRADE_ORDER[worst] ? g : worst),
    "OK",
  );
}

/**
 * 판정 항목 코드로 용어사전 링크를 만든다.
 *
 * `glossary.ts` 의 `relatedFindings` 를 역인덱스로 쓴다. 링크 표를 따로 두면
 * 용어가 늘어날 때 한쪽만 고쳐져 링크가 죽는다.
 */
export function glossaryHrefFor(findingCode: string): string | null {
  const term = GLOSSARY_TERMS.find((t) => t.relatedFindings.includes(findingCode));
  return term ? `/glossary#${encodeURIComponent(term.term)}` : null;
}

/** evidence 안에 흩어져 있는 원문인용을 모은다. */
function collectSourceQuotes(finding: Finding): string[] {
  const evidence = finding.evidence as Record<string, unknown> | undefined;
  if (!evidence) return [];

  const quotes: string[] = [];
  const direct = evidence.sourceQuote;
  if (typeof direct === "string" && direct.trim()) quotes.push(direct.trim());

  // 권리 목록처럼 배열 안에 들어 있는 경우.
  const entries = evidence.entries;
  if (Array.isArray(entries)) {
    for (const e of entries) {
      const q = (e as Record<string, unknown> | null)?.sourceQuote;
      if (typeof q === "string" && q.trim()) quotes.push(q.trim());
    }
  }
  return [...new Set(quotes)];
}

/** evidence 에서 사람이 읽을 근거 문장을 만든다. */
function collectBasis(finding: Finding): string[] {
  const evidence = finding.evidence as Record<string, unknown> | undefined;
  if (!evidence) return [];

  const entries = evidence.entries;
  if (Array.isArray(entries)) {
    return entries
      .map((e) => {
        const r = e as Record<string, unknown>;
        const parts = [
          typeof r.rankNo === "string" ? `${r.rankNo}번` : null,
          typeof r.holder === "string" ? r.holder : null,
          typeof r.registeredOn === "string" ? r.registeredOn : null,
        ].filter(Boolean);
        return parts.length > 0 ? parts.join(" · ") : null;
      })
      .filter((s): s is string => s !== null);
  }
  return [];
}

export function toJudgment(finding: Finding): Judgment {
  return {
    code: finding.code,
    grade: gradeOf(finding),
    title: finding.title,
    description: finding.description,
    basis: collectBasis(finding),
    sourceQuotes: collectSourceQuotes(finding),
    nextAction: finding.action ?? null,
    glossaryHref: glossaryHrefFor(finding.code),
  };
}

export interface BuildJudgmentInput {
  verdict: VerdictResult;
  findings: readonly Finding[];
  seniorClaimsKrw: number;
  depositKrw: number;
  /** 시세를 못 구했으면 null 을 넘긴다. **0 을 넘기지 말 것.** */
  marketPriceKrw: number | null;
}

/**
 * 규칙 엔진 결과를 화면용 판정 계약으로 옮긴다.
 *
 * 여기서 새로 판정하지 않는다 — 그러면 같은 규칙이 두 곳에 생겨 언젠가 어긋난다.
 * 이 함수는 **형태만** 바꾼다.
 */
export function buildJudgmentResult({
  verdict,
  findings,
  seniorClaimsKrw,
  depositKrw,
  marketPriceKrw,
}: BuildJudgmentInput): JudgmentResult {
  const judgments = findings.map(toJudgment);

  // 아무 문제도 안 걸렸으면 침묵하지 말고 "확인했다"고 말해 준다.
  // 빈 화면은 "검사가 안 됐나?" 로 읽힌다.
  if (judgments.length === 0 || judgments.every((j) => j.grade === "OK")) {
    judgments.push({
      code: "CLEAR",
      grade: "OK",
      title: "등기부에서 눈에 띄는 위험 신호는 없습니다",
      description:
        "다만 등기부는 열람한 시점의 기록입니다. 계약 후 잔금일까지 새로 근저당이 설정될 수 있습니다.",
      basis: [],
      sourceQuotes: [],
      nextAction: "잔금 치르는 날 아침에 등기부를 한 번 더 떼어 보세요.",
      glossaryHref: null,
    });
  }

  const computable = marketPriceKrw !== null && marketPriceKrw > 0;

  return {
    overallGrade: overallGrade(judgments.map((j) => j.grade)),
    // 심각한 것부터. 같은 등급이면 입력 순서를 유지한다.
    judgments: [...judgments].sort((a, b) => GRADE_ORDER[b.grade] - GRADE_ORDER[a.grade]),
    calculation: {
      seniorClaimsKrw,
      depositKrw,
      marketPriceKrw: computable ? marketPriceKrw : null,
      // 시세를 모르면 비율도 모른다. 0 으로 채우면 화면에 "0% · 안전"으로 뜬다.
      burdenRatio: computable ? (seniorClaimsKrw + depositKrw) / marketPriceKrw! : null,
      computable,
    },
    // UNKNOWN 을 해소할 방법이 곧 "떼 와야 할 서류"다.
    documentsNeeded: [
      ...new Set(
        judgments
          .filter((j) => j.grade === "UNKNOWN" && j.nextAction)
          .map((j) => j.nextAction!),
      ),
    ],
  };
}

/** 내부 RiskLevel 을 네 등급으로. 화면이 두 체계를 동시에 알 필요가 없게. */
export function riskLevelToGrade(level: RiskLevel): JudgmentGrade {
  switch (level) {
    case "critical":
    case "danger":
      return "STOP";
    case "caution":
      return "WARN";
    default:
      return "OK";
  }
}
