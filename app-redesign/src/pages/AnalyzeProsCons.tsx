import { ArrowRight, CircleCheck, Quote, TriangleAlert } from "lucide-react";
import { Button, Card, GRADE, GradeChip, PageHead, Steps } from "@/components/ui";
import { SAMPLE } from "@/data/sample";

/**
 * 계약서의 장단점 — 판정 항목을 좋은 점과 확인이 필요한 점으로 나눠 보여줍니다.
 * OK 등급은 장점, 그 외(WARN·STOP·UNKNOWN)는 확인이 필요한 점입니다.
 */
export default function AnalyzeProsCons() {
  const pros = SAMPLE.judgments.filter((j) => j.grade === "OK");
  const cons = SAMPLE.judgments.filter((j) => j.grade !== "OK");

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
      <Steps current={4} />

      <PageHead
        eyebrow="장단점"
        title="계약서의 장단점을 확인하세요"
        lead="판정 항목을 좋은 점과 확인이 필요한 점으로 나눠봤습니다."
      />

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-brand-700">
          <CircleCheck className="size-4.5" />
          좋은 점 {pros.length}가지
        </h2>
        <ul className="space-y-2.5">
          {pros.map((j) => (
            <Card key={j.code} as="li" className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14.5px] font-bold">{j.title}</span>
                <GradeChip grade={j.grade} />
              </div>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-500">{j.description}</p>
            </Card>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-warn-600">
          <TriangleAlert className="size-4.5" />
          확인이 필요한 점 {cons.length}가지
        </h2>
        <ul className="space-y-2.5">
          {cons.map((j) => (
            <Card
              key={j.code}
              as="li"
              className={`border-l-4 p-5 ${
                j.grade === "STOP"
                  ? "border-l-stop-500"
                  : j.grade === "WARN"
                    ? "border-l-warn-500"
                    : "border-l-mute-400"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14.5px] font-bold">{j.title}</span>
                <GradeChip grade={j.grade} />
              </div>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-500">{j.description}</p>

              {j.basis.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {j.basis.map((b) => (
                    <li key={b} className="flex gap-2 text-[12.5px] text-ink-500">
                      <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-300" />
                      {b}
                    </li>
                  ))}
                </ul>
              )}

              {j.sourceQuotes.map((q) => (
                <p
                  key={q}
                  className="mt-2 flex gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-700"
                >
                  <Quote className="mt-0.5 size-3 shrink-0 text-ink-300" />
                  {q}
                </p>
              ))}

              {j.nextAction && (
                <div className="mt-3 rounded-lg bg-brand-50 px-4 py-3">
                  <p className="text-[12px] font-semibold text-brand-700">이렇게 하세요</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-brand-700/90">
                    {j.nextAction}
                  </p>
                </div>
              )}
            </Card>
          ))}
        </ul>
      </section>

      <p className="mt-6 text-[12.5px] leading-relaxed text-ink-300">
        종합 등급은 이 중 가장 나쁜 항목을 따릅니다.{" "}
        <span className={GRADE[SAMPLE.overallGrade].chipText}>
          현재 {GRADE[SAMPLE.overallGrade].label}
        </span>
        입니다.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button to="/checklist" size="lg" className="flex-1">
          다음 할 일 확인하기
          <ArrowRight className="size-4" />
        </Button>
        <Button to="/analyze/result" variant="ghost" size="lg">
          판정 다시 보기
        </Button>
      </div>
    </div>
  );
}
