import { useEffect, useState } from "react";
import { Copy, ArrowRight, Check } from "lucide-react";
import { Button, Card, Disclaimer, GRADE, GradeChip, Steps, formatMan } from "@/components/ui";
import { Failed, Loading, NoCase } from "@/components/AsyncState";
import { useFlow } from "@/state/flow";
import { getAnalysis, getSpecialTerms } from "@/lib/zip042";

export default function AnalyzeResult() {
  const { caseId, result, setResult, specialTerms, setSpecialTerms } = useFlow();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 흐름 중이면 result 가 이미 있습니다. 새로고침 등으로 비어 있으면 서버에서 다시 받습니다.
  useEffect(() => {
    if (!caseId || result) return;
    let alive = true;
    setLoading(true);
    Promise.all([getAnalysis(caseId), getSpecialTerms(caseId).catch(() => [])])
      .then(([r, t]) => {
        if (!alive) return;
        setResult(r);
        setSpecialTerms(t);
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [caseId, result, setResult, setSpecialTerms]);

  if (!caseId) return <NoCase />;
  if (error) return <Failed message={error} onRetry={() => setError(null)} />;
  if (loading || !result) return <Loading label="판정을 불러오는 중…" />;

  const r = result;

  // 종합 등급은 최댓값입니다. 평균이 아닙니다 — 하나가 STOP 이면 전체가 STOP 입니다.
  const counts = {
    STOP: r.judgments.filter((j) => j.grade === "STOP").length,
    WARN: r.judgments.filter((j) => j.grade === "WARN").length,
    UNKNOWN: r.judgments.filter((j) => j.grade === "UNKNOWN").length,
    OK: r.judgments.filter((j) => j.grade === "OK").length,
  };

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
      <Steps current={3} />

      {/* 종합 판정 */}
      <Card className="overflow-hidden">
        <div className="px-6 pt-6 pb-5 sm:px-8 sm:pt-8">
          <GradeChip grade={r.overallGrade} />
          <h1 className="mt-4 text-[24px] font-bold leading-snug tracking-[-0.02em] sm:text-[30px]">
            {r.headline}
          </h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-ink-500">{r.summary}</p>
        </div>

        {/* 항목 요약 막대 */}
        <div className="px-6 pb-6 sm:px-8">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-mute-100">
            {(["STOP", "WARN", "UNKNOWN", "OK"] as const).map((k) =>
              counts[k] ? (
                <span
                  key={k}
                  className={GRADE[k].bar}
                  style={{ width: `${(counts[k] / r.judgments.length) * 100}%` }}
                />
              ) : null,
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {(["STOP", "WARN", "UNKNOWN", "OK"] as const).map((k) =>
              counts[k] ? (
                <span key={k} className="flex items-center gap-1.5 text-[12.5px] text-ink-500">
                  <span className={`size-1.5 rounded-full ${GRADE[k].dot}`} />
                  {GRADE[k].label} {counts[k]}
                </span>
              ) : null,
            )}
          </div>
        </div>
      </Card>

      {/* 계산 근거 */}
      <Card className="mt-4 p-6 sm:p-8">
        <h2 className="text-[15px] font-bold">보증금을 돌려받을 수 있을까요</h2>

        <dl className="mt-5 space-y-3">
          <CalcRow label="선순위 채권 (채권최고액)" value={formatMan(r.calculation.seniorClaimsKrw)} />
          <CalcRow label="내 보증금" value={formatMan(r.calculation.depositKrw)} />
          <CalcRow
            label="시세"
            value={
              r.calculation.marketPriceKrw === null
                ? "확인 못 함"
                : formatMan(r.calculation.marketPriceKrw)
            }
            muted={r.calculation.marketPriceKrw === null}
          />
        </dl>

        {r.calculation.computable && r.calculation.burdenRatio !== null ? (
          <div className="mt-5 border-t border-line pt-5">
            <div className="flex items-baseline justify-between">
              <span className="text-[13.5px] font-semibold">시세 대비 부담 비율</span>
              <span className="tnum text-[22px] font-bold text-ink-900">
                {Math.round(r.calculation.burdenRatio * 100)}%
              </span>
            </div>

            {/* 80% 위험선을 눈금으로 보여줍니다 — 숫자만으로는 감이 안 옵니다 */}
            <div className="relative mt-3 h-2 rounded-full bg-mute-100">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-brand-500"
                style={{ width: `${Math.min(r.calculation.burdenRatio * 100, 100)}%` }}
              />
              <div className="absolute inset-y-[-4px] left-[80%] w-px bg-stop-500" />
            </div>
            <div className="mt-2 flex justify-between text-[11.5px] text-ink-300">
              <span>0%</span>
              <span className="text-stop-600">위험선 80%</span>
              <span>100%</span>
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-xl bg-mute-50 px-4 py-3.5 text-[13px] leading-relaxed text-mute-600">
            시세를 확인하지 못해 비율을 계산할 수 없습니다.{" "}
            <strong className="font-semibold">안전하다는 뜻이 아닙니다.</strong>
          </div>
        )}
      </Card>

      {/* 항목별 판정 — 간단 요약. 자세한 장단점은 다음 페이지에서 다룹니다 */}
      <section className="mt-8">
        <h2 className="mb-3 text-[15px] font-bold">항목별로 살펴보기</h2>
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {r.judgments.map((j) => (
            <li key={j.code} className="flex items-center gap-3 px-5 py-3.5">
              <span className={`size-2 shrink-0 rounded-full ${GRADE[j.grade].dot}`} />
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                {j.title}
              </span>
              <GradeChip grade={j.grade} />
            </li>
          ))}
        </ul>
      </section>

      {/* 특약 문구 */}
      <section className="mt-8">
        <h2 className="text-[15px] font-bold">계약서에 넣을 특약</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">
          위 위험을 막는 문구입니다. 그대로 복사해 계약서 특약사항에 넣으세요.
        </p>
        {specialTerms.length === 0 ? (
          <p className="mt-4 rounded-xl bg-surface px-5 py-4 text-[13px] text-ink-500">
            이 계약에 넣을 특약이 아직 없습니다.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {specialTerms.map((t) => (
              <SpecialTerm key={t.title} title={t.title} body={t.body} />
            ))}
          </ul>
        )}
      </section>

      <div className="mt-8">
        <Disclaimer items={r.caveats} />
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button to="/analyze/pros-cons" size="lg" className="flex-1">
          장단점 자세히 보기
          <ArrowRight className="size-4" />
        </Button>
        <Button to="/analyze/review" variant="ghost" size="lg">
          판독 내용 다시 보기
        </Button>
      </div>
    </div>
  );
}

function CalcRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[13.5px] text-ink-500">{label}</dt>
      <dd className={`tnum text-[15px] font-semibold ${muted ? "text-mute-500" : "text-ink-900"}`}>
        {value}
      </dd>
    </div>
  );
}


function SpecialTerm({ title, body }: { title: string; body: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Card as="li" className="p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13.5px] font-bold">{title}</p>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(body);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12px] font-semibold text-ink-500 hover:bg-surface"
        >
          {copied ? (
            <>
              <Check className="size-3.5 text-brand-600" />
              <span className="text-brand-700">복사됨</span>
            </>
          ) : (
            <>
              <Copy className="size-3.5" />
              복사
            </>
          )}
        </button>
      </div>
      <p className="mt-2.5 rounded-lg bg-surface px-4 py-3 text-[13px] leading-relaxed text-ink-700">
        {body}
      </p>
    </Card>
  );
}
