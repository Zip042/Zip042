import { useState } from "react";
import { useNavigate } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAnalysis, getCase } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import { useAnalysisFlow } from "@/state/AnalysisFlow";

/**
 * 판정 결과 리포트.
 *
 * ## 위험과 "확인 못 함"을 섞지 않는다
 *
 * 백엔드가 `kind: "risk" | "info_gap"` 으로 두 축을 나눠 내려줍니다. 화면도 그대로
 * 나눠야 합니다 — "사진이 흐리다"를 "경매가 진행 중이다"와 같은 붉은 배지로 보여주면
 * 사용자는 판정을 신뢰하지 않게 됩니다. `info_gap` 은 별도 배지로 표시합니다.
 *
 * 판정 문구(headline · summary · action)는 **전부 서버가 만든 문장**을 그대로 씁니다.
 * 화면에서 다시 쓰면 규칙이 바뀌어도 옛말을 계속하게 됩니다.
 */

type Level = "safe" | "caution" | "danger" | "critical";

/** 검사 건 응답의 중첩 구조. 서버가 property / terms / schedule 로 나눠 내려준다. */
interface CaseRow {
  title?: string | null;
  property?: { roadAddress?: string | null; detailAddress?: string | null };
}

interface Finding {
  code: string;
  category: string;
  kind?: "risk" | "info_gap";
  severity: Level;
  title: string;
  description: string;
  action?: string;
  evidence?: Record<string, unknown>;
}

interface Verdict {
  verdict: Level;
  verdictLabel: string;
  score: number;
  contractable: boolean;
  headline: string;
  summary: string;
  informationGaps: Finding[];
  requiredActions: string[];
  counts: Record<Level, number>;
}

/** 설명 본문의 `**강조**` 를 굵게. 서버가 쓰는 마크다운 문법은 이것 하나뿐이다. */
function renderEmphasis(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-bold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

const KRW = new Intl.NumberFormat("ko-KR");

function manWon(krw: number | null | undefined): string {
  if (krw === null || krw === undefined) return "—";
  return `${KRW.format(Math.round(krw / 10_000))}만원`;
}

/** 위험도에 따라 원형 배지·강조 색을 고른다. 안전/주의는 붉게 칠하지 않는다. */
function toneOf(level: Level) {
  return level === "critical" || level === "danger"
    ? {
        ring: "border-danger text-danger",
        title: "text-danger",
        text: "text-danger-text",
        cta: "bg-danger hover:bg-danger/90",
      }
    : {
        ring: "border-brand-primary text-brand-primary",
        title: "text-foreground",
        text: "text-muted-foreground",
        cta: "bg-brand-primary hover:bg-brand-primary-hover",
      };
}

export default function AnalyzeResult() {
  const navigate = useNavigate();
  const flow = useAnalysisFlow();
  const caseId = flow.caseId;

  const analysis = useAsync(
    () => (caseId ? getAnalysis(caseId) : Promise.reject(new Error("검사 건이 없습니다."))),
    [caseId],
  );
  const caseData = useAsync(
    () => (caseId ? getCase(caseId) : Promise.resolve(null)),
    [caseId],
  );

  const [expanded, setExpanded] = useState<string | null>(null);

  if (!caseId) {
    return (
      <EmptyState
        title="아직 분석한 집이 없습니다"
        body="등기부등본을 올리면 판정 결과를 볼 수 있습니다."
        onGo={() => navigate("/analyze")}
      />
    );
  }

  if (analysis.loading) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-20">
        <p className="text-sm text-muted-foreground-light">판정 결과를 불러오는 중입니다…</p>
      </div>
    );
  }

  /**
   * 서버에서 못 읽으면 **이번 세션에서 실제로 받은 판정**으로 보여준다.
   *
   * 데모 배포는 서버리스라 인스턴스마다 인메모리 저장소가 따로 있고, 방금 만든 검사 건이
   * 다음 요청에서 404 가 될 수 있다. 지어낸 값이 아니라 조금 전 이 화면이 받은 결과이므로
   * 보여주는 것이 맞다 — 대신 서버가 살아 있으면 언제나 서버 값이 우선이다.
   */
  const serverAnalysis = (analysis.data as unknown as { analysis?: Record<string, unknown> } | null)
    ?.analysis;
  const a = serverAnalysis ?? flow.lastAnalysis;

  if (!a) {
    return (
      <EmptyState
        title="판정 결과를 불러오지 못했습니다"
        body={analysis.error ?? "아직 분석이 끝나지 않았을 수 있습니다."}
        onGo={() => navigate("/analyze")}
      />
    );
  }
  const verdict = a.verdict as Verdict;
  const findings = (a.findings ?? []) as Finding[];
  const valuation = a.valuation as {
    burdenRatioPercent?: number;
    marketPrice?: { estimatedKrw: number; source: string };
    seniorClaimsKrw?: number | null;
  };
  const caveats = (a.caveats ?? []) as string[];
  const caseRow = (caseData.data as unknown as { case?: CaseRow } | null)?.case;

  // 위험과 확인 못 함을 나눈다 (설계 원칙 3).
  const risks = findings.filter((f) => f.kind !== "info_gap");
  const gaps = verdict.informationGaps ?? [];
  const dangerCount = risks.filter((f) => f.severity === "danger" || f.severity === "critical").length;
  const tone = toneOf(verdict.verdict);

  const analyzedOn = a.createdAt ? String(a.createdAt).slice(0, 10).replace(/-/g, ".") : "";
  const address =
    [caseRow?.property?.roadAddress, caseRow?.property?.detailAddress].filter(Boolean).join(" ") ||
    caseRow?.title ||
    "주소 미입력";

  return (
    <div className="border-b border-border">
      <div className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-7 px-8 py-10">
          <div
            className={`flex h-[132px] w-[132px] shrink-0 flex-col items-center justify-center rounded-full border-[5px] ${tone.ring}`}
          >
            <span className="font-display text-3xl font-black leading-none">
              {verdict.verdictLabel}
            </span>
            <span className="mt-1 text-sm font-bold">
              {risks.length}개 중 {dangerCount}개 항목
            </span>
          </div>
          <div className="min-w-[280px] flex-1">
            <p className={`text-sm font-bold ${tone.text}`}>
              {address}
              {analyzedOn && ` · ${analyzedOn} 분석`}
            </p>
            <h1 className={`mt-2 font-display text-[34px] font-black leading-tight tracking-tight ${tone.title}`}>
              {verdict.headline}
            </h1>
            <p className={`mt-2.5 max-w-xl text-[15px] leading-relaxed ${tone.text}`}>
              {renderEmphasis(verdict.summary)}
            </p>
            <div className="mt-5 flex gap-3">
              <Button
                className={`rounded-[11px] px-6 ${tone.cta}`}
                onClick={() => {
                  document.getElementById("todo")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                대처 방법 보기
              </Button>
              <Button
                variant="outline"
                className="rounded-[11px] border-border-strong bg-white"
                onClick={() => window.print()}
              >
                PDF로 저장
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-8 px-8 py-9 md:grid-cols-[1fr_300px]">
        <div>
          <h2 className="font-display text-xl font-extrabold">항목별 판정</h2>
          <div className="mt-4 flex flex-col gap-3">
            {risks.length === 0 && (
              <div className="flex items-center gap-2.5 rounded-2xl border border-border p-4.5">
                <Badge variant="brand-outline">정상</Badge>
                <p className="text-base font-medium text-muted-foreground">
                  등기부에서 위험 신호가 발견되지 않았습니다.
                </p>
              </div>
            )}

            {risks.map((item) => (
              <FindingCard
                key={item.code + item.title}
                finding={item}
                expanded={expanded === item.code + item.title}
                onToggle={() =>
                  setExpanded((prev) => (prev === item.code + item.title ? null : item.code + item.title))
                }
                valuation={valuation}
              />
            ))}
          </div>

          {gaps.length > 0 && (
            <>
              <h2 className="mt-9 font-display text-xl font-extrabold">아직 확인하지 못한 것</h2>
              <p className="mt-1.5 text-sm text-muted-foreground-light">
                "문제가 있다"가 아니라 "아직 못 봤다"는 뜻입니다. 위험 점수에는 더해지지 않습니다.
              </p>
              <div className="mt-4 flex flex-col gap-3">
                {gaps.map((gap) => (
                  <div
                    key={gap.code + gap.title}
                    className="rounded-2xl border border-border bg-white p-5"
                  >
                    <div className="flex items-center gap-2.5">
                      <Badge variant="outline">확인 필요</Badge>
                      <p className="text-base font-bold">{gap.title}</p>
                    </div>
                    <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                      {renderEmphasis(gap.description)}
                    </p>
                    {gap.action && (
                      <p className="mt-2 text-sm leading-relaxed text-brand-primary">{gap.action}</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-3.5">
          <div id="todo" className="rounded-2xl bg-background-alt p-5">
            <p className="text-sm font-bold">지금 할 일</p>
            <div className="mt-3.5 flex flex-col gap-3 text-sm text-muted-foreground">
              {verdict.requiredActions.length === 0 && (
                <p>지금 당장 해야 할 조치는 없습니다. 계약 단계별 체크리스트를 확인해 보세요.</p>
              )}
              {verdict.requiredActions.map((action, i) => (
                <div key={action} className="flex gap-2.5">
                  <span className="font-display font-black text-brand-primary">{i + 1}</span>
                  <p className="leading-relaxed">{action}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border p-5">
            <p className="text-sm font-bold">넣어야 할 특약</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              이 집의 판정에 맞춰 고른 특약 문구를 계약서에 그대로 옮겨 적을 수 있습니다.
            </p>
            <Button
              variant="outline"
              className="mt-3.5 w-full rounded-[10px] border-border-strong"
              onClick={() => navigate("/checklist")}
            >
              계약 체크리스트 보기
            </Button>
          </div>

          <div className="rounded-2xl border border-border p-5">
            <p className="text-sm font-bold">모르는 용어가 있나요</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              근저당·확정일자·대항력을 사회초년생 기준으로 풀어 두었습니다.
            </p>
            <Button
              variant="outline"
              className="mt-3.5 w-full rounded-[10px] border-border-strong"
              onClick={() => navigate("/glossary")}
            >
              용어사전 열기
            </Button>
          </div>

          {caveats.map((c) => (
            <p key={c} className="text-xs leading-relaxed text-muted-foreground-light">
              {c}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

function FindingCard({
  finding,
  expanded,
  onToggle,
  valuation,
}: {
  finding: Finding;
  expanded: boolean;
  onToggle: () => void;
  valuation: { burdenRatioPercent?: number; marketPrice?: { estimatedKrw: number } };
}) {
  const isDanger = finding.severity === "danger" || finding.severity === "critical";
  const isSafe = finding.severity === "safe";

  // 전세가율 항목에만 막대를 그린다. 다른 항목에는 의미가 없다.
  const showBar = finding.category === "valuation" && valuation.burdenRatioPercent !== undefined;

  return (
    <div
      className={
        isDanger
          ? "rounded-2xl border border-danger-border bg-white p-5"
          : "rounded-2xl border border-border bg-white p-5"
      }
    >
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-2.5 text-left">
        {isSafe ? (
          <Badge variant="brand-outline">정상</Badge>
        ) : isDanger ? (
          <Badge className="bg-danger">위험</Badge>
        ) : (
          <Badge variant="danger-outline">주의</Badge>
        )}
        <p className={isSafe ? "text-base font-medium text-muted-foreground" : "text-base font-bold"}>
          {finding.title}
        </p>
        <span className={`ml-auto shrink-0 text-sm font-bold ${isDanger ? "text-danger" : "text-brand-primary"}`}>
          {expanded ? "접기" : "펼치기"}
        </span>
      </button>

      {expanded && (
        <>
          <p
            className={`mt-2.5 text-sm leading-relaxed ${isDanger ? "text-danger-text" : "text-muted-foreground"}`}
          >
            {renderEmphasis(finding.description)}
          </p>

          {showBar && (
            <>
              <div className="mt-3.5 flex h-2.5 overflow-hidden rounded-full border border-border bg-background-alt">
                <div
                  className={isDanger ? "bg-danger" : "bg-brand-primary"}
                  style={{ width: `${Math.min(100, valuation.burdenRatioPercent ?? 0)}%` }}
                />
              </div>
              <div className={`mt-2 flex gap-4.5 text-xs ${isDanger ? "text-danger-text" : "text-muted-foreground"}`}>
                <span>빚 + 보증금 {valuation.burdenRatioPercent}%</span>
                {valuation.marketPrice && <span>시세 {manWon(valuation.marketPrice.estimatedKrw)}</span>}
                <span className="ml-auto font-bold">안전 기준 80% 이하</span>
              </div>
            </>
          )}

          {finding.action && (
            <p className="mt-3 text-sm leading-relaxed text-brand-primary">{finding.action}</p>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState({
  title,
  body,
  onGo,
}: {
  title: string;
  body: string;
  onGo: () => void;
}) {
  return (
    <div className="border-b border-border">
      <div className="mx-auto max-w-6xl px-8 py-20">
        <h1 className="font-display text-2xl font-black tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground-light">{body}</p>
        <Button
          className="mt-5 rounded-xl bg-brand-primary px-6 hover:bg-brand-primary-hover"
          onClick={onGo}
        >
          등기부등본 분석하러 가기
        </Button>
      </div>
    </div>
  );
}
