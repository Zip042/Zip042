import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowRight, Plus, Check, Loader2, X } from "lucide-react";
import { Button, Card, PageHead, Steps } from "@/components/ui";
import { WhatWeCheck } from "@/components/WhatWeCheck";
import { OPTIONAL_CHECKS, UPLOAD_NOTICE } from "@/data/document-checks";
import { useFlow } from "@/state/flow";
import { runAnalysis, uploadDocument, getExtraction, getSpecialTerms } from "@/lib/zip042";
import { ApiError } from "@/lib/api";

export default function AnalyzeDocuments() {
  const nav = useNavigate();
  const { caseId, setResult, setExtraction, setSpecialTerms } = useFlow();

  const [picked, setPicked] = useState<Record<string, File>>({});
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const pickedCount = Object.keys(picked).length;

  async function analyze() {
    if (!caseId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const entries = Object.entries(picked);
      for (const [id, file] of entries) {
        const doc = OPTIONAL_CHECKS.find((d) => d.id === id);
        if (!doc) continue;
        setStep(`${doc.title} 올리는 중…`);
        await uploadDocument(caseId, file, doc.docType);
      }

      setStep("등기부를 판독하는 중…");
      const result = await runAnalysis(caseId);
      setResult(result);

      // 판독 원문과 특약은 화면 전환 후 다시 부르지 않도록 여기서 함께 받아 둡니다.
      // 실패해도 판정은 이미 나왔으므로 흐름을 막지 않습니다.
      setStep("판독 결과를 정리하는 중…");
      const [ex, terms] = await Promise.allSettled([
        getExtraction(caseId),
        getSpecialTerms(caseId),
      ]);
      if (ex.status === "fulfilled") setExtraction(ex.value);
      if (terms.status === "fulfilled") setSpecialTerms(terms.value);

      nav("/analyze/review");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "분석에 실패했습니다.",
      );
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  if (!caseId) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 text-center">
        <p className="text-[15px] text-ink-500">검사 건이 없습니다. 서류부터 올려주세요.</p>
        <Button to="/analyze" className="mt-6">
          등기부등본 올리러 가기
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-12 sm:py-16">
      <Steps current={1} />
      <PageHead
        eyebrow="등기부등본 접수 완료"
        title="안전을 위해 필요한 서류가 있어요!"
        lead="아래 서류들의 교차 검증이 필요합니다. 부동산에 요청하시거나 각 항목의 발급 링크를 참조하세요."
      />

      {/*
        서류를 왜 더 내야 하는지를 먼저 말합니다. 이 문단이 없으면 "귀찮은 추가 단계"로
        읽히고, 그러면 그냥 건너뜁니다 — 정작 다가구 선순위처럼 등기부만으로는
        절대 알 수 없는 위험이 여기서 걸립니다.
      */}
      <Card className="mb-6 bg-surface p-4">
        <p className="text-[13.5px] leading-relaxed text-ink-700">
          등기부등본 한 장으로는 <strong className="font-semibold">등기부에 안 적히는 빚</strong>
          을 볼 수 없습니다. 서류끼리 맞춰봐야 드러나는 것들이 있어요.
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-500">
          없이도 분석은 됩니다. 다만 그만큼 &lsquo;확인하지 못했습니다&rsquo;로 남습니다.
        </p>
      </Card>

      <ul className="space-y-3">
        {OPTIONAL_CHECKS.map((doc) => {
          const file = picked[doc.id];
          const emphasized = doc.id === "fixed-date";
          return (
            <Card
              as="li"
              key={doc.id}
              className={
                file
                  ? "ring-1 ring-brand-200"
                  : emphasized
                    ? "bg-stop-50 ring-1 ring-stop-200"
                    : ""
              }
            >
              <div className="flex items-center gap-3 p-4">
                <input
                  ref={(el) => {
                    inputs.current[doc.id] = el;
                  }}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setPicked((p) => ({ ...p, [doc.id]: f }));
                  }}
                />
                <button
                  onClick={() => inputs.current[doc.id]?.click()}
                  disabled={busy}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-60"
                >
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-xl transition-colors ${
                      file ? "bg-brand-500 text-white" : "bg-surface text-ink-300"
                    }`}
                  >
                    {file ? (
                      <Check className="size-4.5" strokeWidth={2.5} />
                    ) : (
                      <Plus className="size-4.5" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold">{doc.title}</span>
                    <span className="mt-0.5 block truncate text-[12.5px] leading-relaxed text-ink-500">
                      {file ? file.name : doc.why}
                    </span>
                    {emphasized && !file && (
                      <span className="mt-0.5 block text-[12.5px] leading-relaxed text-stop-600">
                        임대인(집주인) 동의가 필요합니다
                      </span>
                    )}
                  </span>
                </button>

                {file && (
                  <button
                    onClick={() =>
                      setPicked((p) => {
                        const next = { ...p };
                        delete next[doc.id];
                        return next;
                      })
                    }
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-300 hover:bg-surface hover:text-ink-700"
                    aria-label={`${doc.title} 제거`}
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>

              <WhatWeCheck doc={doc} />
            </Card>
          );
        })}
      </ul>

      {error && (
        <Card className="mt-6 border-stop-200 bg-stop-50 p-4">
          <p className="text-[13.5px] font-semibold text-stop-700">{error}</p>
        </Card>
      )}

      <div className="mt-8">
        <Button size="lg" full onClick={analyze} disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {step || "분석 중…"}
            </>
          ) : (
            <>
              {pickedCount === 0 ? "추가 서류 없이 분석 시작" : "분석 시작"}
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>

      <div className="mt-5 space-y-1 text-center text-[12.5px] leading-relaxed text-ink-300">
        <p>
          {busy
            ? "판독 중입니다. 창을 닫지 마세요."
            : "서류 판독에는 20~60초가 걸릴 수 있습니다."}
        </p>
        {UPLOAD_NOTICE.map((t) => (
          <p key={t}>{t}</p>
        ))}
      </div>
    </div>
  );
}
