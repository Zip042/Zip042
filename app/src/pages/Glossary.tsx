import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { getFraudCases, getReliefSteps, searchGlossary } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";

/**
 * 용어사전 · 사기 사례 · 피해 대응.
 *
 * 검색과 필터는 **서버가** 합니다. 정렬 규칙("근저당"을 치면 `근저당권`이 맨 위)이
 * 화면마다 달라지면 안 되기 때문입니다.
 */

type Tag = "risk" | "must_do" | null;

interface Term {
  code: string;
  term: string;
  tag: Tag;
  summary: string;
  description: string;
  legalBasis: string[];
}

interface FraudCase {
  code: string;
  title: string;
  how: string;
  signals: string[];
  prevention: string;
}

interface ReliefStep {
  order: number;
  title: string;
  detail: string;
  warning: string | null;
}

const FILTERS = ["전체", "등기부", "보증금", "계약서", "절차"] as const;

/**
 * 설명 본문의 `**강조**` 를 굵게 렌더한다.
 * 마크다운 라이브러리를 넣을 만한 일이 아니고, 서버가 쓰는 문법은 이것 하나뿐이다.
 */
function renderEmphasis(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-bold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export default function Glossary() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("전체");
  const [showRelief, setShowRelief] = useState(false);

  // 글자를 칠 때마다 요청하지 않는다.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const glossary = useAsync(
    () => searchGlossary({ q: debounced || undefined, category: filter === "전체" ? undefined : filter }),
    [debounced, filter],
  );
  const fraud = useAsync(getFraudCases, []);
  const relief = useAsync(getReliefSteps, []);

  const terms = (glossary.data?.terms ?? []) as Term[];
  const fraudCases = (fraud.data?.fraudCases ?? []) as FraudCase[];
  const reliefSteps = (relief.data?.reliefSteps ?? []) as ReliefStep[];

  return (
    <div>
      <div className="mx-auto max-w-6xl px-8 py-14">
        <h1 className="font-display text-[30px] font-black tracking-tight">모르는 말은 계약 전에 물어보세요</h1>
        <p className="mt-2 text-sm text-muted-foreground-light">
          등기부와 계약서에 나오는 용어를 사회초년생 기준으로 풀어 씁니다.
        </p>

        <div className="mt-5.5 flex flex-wrap items-center gap-3">
          <Input
            placeholder="궁금한 용어 검색 (예: 근저당, 확정일자)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-[520px] rounded-xl border-border-strong py-3"
          />
          <div className="flex flex-wrap gap-2 text-sm">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={
                  f === filter
                    ? "rounded-full bg-foreground px-4 py-2 font-bold text-white"
                    : "rounded-full border border-border px-4 py-2 text-muted-foreground hover:border-border-strong"
                }
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6.5 grid grid-cols-1 gap-8 md:grid-cols-[1fr_320px]">
          <div>
            {glossary.loading && (
              <p className="text-sm text-muted-foreground-light">용어를 불러오는 중입니다…</p>
            )}
            {glossary.error && (
              <div className="rounded-2xl border border-danger-border bg-white p-5">
                <p className="text-sm font-bold text-danger">용어를 불러오지 못했습니다</p>
                <p className="mt-1 text-sm text-danger-text">{glossary.error}</p>
              </div>
            )}
            {!glossary.loading && !glossary.error && terms.length === 0 && (
              <p className="text-sm text-muted-foreground-light">
                "{debounced}" 에 해당하는 용어가 없습니다. 다른 말로 찾아보세요.
              </p>
            )}

            <Accordion type="single" collapsible>
              {terms.map((t) => (
                <AccordionItem key={t.code} value={t.code} className="rounded-2xl border border-border px-1.5 mb-2.5">
                  <AccordionTrigger className="px-4">
                    <span className="flex items-center gap-2.5">
                      <span className="text-lg font-bold">{t.term}</span>
                      {t.tag === "risk" && <Badge variant="danger-outline">위험 신호</Badge>}
                      {t.tag === "must_do" && (
                        <span className="text-[13px] font-bold text-brand-primary">꼭 챙기기</span>
                      )}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="px-4">
                    <p className="max-w-xl text-sm leading-[1.8] text-muted-foreground">
                      {renderEmphasis(t.description)}
                    </p>
                    {t.legalBasis.length > 0 && (
                      <p className="mt-2.5 text-[13px] text-muted-foreground-light">
                        근거 · {t.legalBasis.join(" / ")}
                      </p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          <div className="flex flex-col gap-3.5">
            <div className="rounded-2xl border border-danger-border bg-white p-5">
              <p className="text-sm font-bold text-danger">실제 사기 사례</p>
              <div className="mt-2.5 flex flex-col gap-2.5 text-[13px] text-danger-text">
                {fraud.loading && <p className="text-muted-foreground-light">불러오는 중…</p>}
                {fraud.error && <p>{fraud.error}</p>}
                {fraudCases.map((c) => (
                  <details key={c.code}>
                    <summary className="cursor-pointer font-medium">{c.title}</summary>
                    <p className="mt-1.5 leading-[1.7] text-muted-foreground">{c.how}</p>
                    <p className="mt-1.5 font-bold">이런 신호가 보이면</p>
                    <ul className="mt-1 list-disc pl-4 leading-[1.7] text-muted-foreground">
                      {c.signals.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                    <p className="mt-1.5 leading-[1.7] text-brand-primary">{c.prevention}</p>
                  </details>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-white p-5">
              <p className="text-sm font-bold">피해를 당했다면</p>
              <p className="mt-2.5 text-[13px] leading-[1.8] text-muted-foreground">
                전세피해지원센터 안내 · 임차권등기명령 절차 · 보증이행 청구 방법을 순서대로 정리했습니다.
              </p>

              {showRelief && (
                <div className="mt-3.5 flex flex-col gap-3 border-t border-border pt-3.5">
                  {relief.loading && (
                    <p className="text-[13px] text-muted-foreground-light">불러오는 중…</p>
                  )}
                  {relief.error && <p className="text-[13px] text-danger">{relief.error}</p>}
                  {reliefSteps.map((step) => (
                    <div key={step.order} className="flex gap-2.5">
                      <span className="font-display font-black text-brand-primary">{step.order}</span>
                      <div>
                        <p className="text-[13px] font-bold">{step.title}</p>
                        <p className="mt-1 text-[13px] leading-[1.7] text-muted-foreground">
                          {renderEmphasis(step.detail)}
                        </p>
                        {step.warning && (
                          <p className="mt-1 text-[13px] leading-[1.7] text-danger">
                            {renderEmphasis(step.warning)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  {relief.data?.disclaimer && (
                    <p className="text-[11px] leading-[1.7] text-muted-foreground-light">
                      {relief.data.disclaimer}
                    </p>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowRelief((v) => !v)}
                className="mt-3 text-[13px] font-bold text-brand-primary"
              >
                {showRelief ? "접기" : "대응 절차 보기"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
