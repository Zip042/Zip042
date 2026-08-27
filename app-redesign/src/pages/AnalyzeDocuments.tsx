import { useState } from "react";
import { ArrowRight, Plus, Check } from "lucide-react";
import { Button, Card, PageHead, Steps } from "@/components/ui";

const OPTIONAL_DOCS = [
  {
    id: "fixed-date",
    title: "확정일자 부여현황",
    why: "등기부에 없는 선순위 세입자가 있는지 확인합니다",
  },
  {
    id: "brokerage",
    title: "중개대상물 확인·설명서",
    why: "등기부와 내용이 어긋나는지 대조합니다",
  },
  {
    id: "ledger",
    title: "건축물대장",
    why: "위반건축물이면 보증보험이 거절될 수 있습니다",
  },
  {
    id: "lease",
    title: "계약서 초안",
    why: "특약이 실제로 들어갔는지 확인합니다",
  },
];

export default function AnalyzeDocuments() {
  const [added, setAdded] = useState<string[]>([]);
  const toggle = (id: string) =>
    setAdded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="mx-auto max-w-2xl px-5 py-12 sm:py-16">
      <Steps current={1} />
      <PageHead
        title="서류를 올려주세요"
        lead="필요한 서류들을 올릴수록 '확인하지 못했습니다'가 더 줄어듭니다."
      />

      <ul className="space-y-3">
        {OPTIONAL_DOCS.map((doc) => {
          const on = added.includes(doc.id);
          const emphasized = doc.id === "fixed-date";
          return (
            <Card
              as="li"
              key={doc.id}
              className={
                emphasized
                  ? "bg-stop-50 ring-1 ring-stop-200"
                  : on
                    ? "ring-1 ring-brand-200"
                    : ""
              }
            >
              <button
                onClick={() => toggle(doc.id)}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-xl transition-colors ${
                    on ? "bg-brand-500 text-white" : "bg-surface text-ink-300"
                  }`}
                >
                  {on ? <Check className="size-4.5" strokeWidth={2.5} /> : <Plus className="size-4.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold">{doc.title}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-500">
                    {doc.why}
                  </span>
                  {emphasized && (
                    <span className="mt-0.5 block text-[12.5px] leading-relaxed text-stop-600">
                      임대인(집주인) 동의가 필요합니다
                    </span>
                  )}
                </span>
              </button>
            </Card>
          );
        })}
      </ul>

      <div className="mt-8 flex gap-3">
        <Button to="/analyze/review" variant="ghost" size="lg">
          건너뛰기
        </Button>
        <Button to="/analyze/review" size="lg" className="flex-1">
          다음
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
