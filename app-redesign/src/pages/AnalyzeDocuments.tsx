import { useState } from "react";
import { ArrowRight, Plus, Search, Check } from "lucide-react";
import { Button, Card, PageHead, Steps } from "@/components/ui";

const OPTIONAL_DOCS = [
  {
    id: "brokerage",
    title: "중개대상물 확인·설명서",
    why: "등기부와 내용이 어긋나는지 대조합니다",
  },
  {
    id: "lease",
    title: "계약서 초안",
    why: "특약이 실제로 들어갔는지 확인합니다",
  },
  {
    id: "ledger",
    title: "건축물대장",
    why: "위반건축물이면 보증보험이 거절될 수 있습니다",
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
        title="더 올릴 서류가 있나요?"
        lead="없어도 판정은 나옵니다. 다만 서류가 많을수록 '확인하지 못했습니다'가 줄어듭니다."
      />

      <ul className="space-y-3">
        {OPTIONAL_DOCS.map((doc) => {
          const on = added.includes(doc.id);
          return (
            <Card as="li" key={doc.id} className={on ? "ring-1 ring-brand-200" : ""}>
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
                </span>
              </button>
            </Card>
          );
        })}
      </ul>

      {/* 주소로 대체 — 백엔드 address.service 가 이걸 위해 존재합니다 */}
      <Card className="mt-6 bg-surface p-5">
        <div className="flex gap-3">
          <Search className="mt-0.5 size-4 shrink-0 text-ink-300" />
          <div className="flex-1">
            <p className="text-[13.5px] font-semibold">서류가 없으면 주소로 조회할 수 있습니다</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">
              주소만 알려주시면 시세와 위반건축물 여부를 대신 확인합니다.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                placeholder="예) 대전광역시 서구 둔산로 89"
                className="h-10 flex-1 rounded-lg border border-line bg-white px-3 text-[13.5px] outline-none placeholder:text-ink-300 focus:border-brand-400"
              />
              <Button variant="ghost" className="h-10">
                조회
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <div className="mt-8 flex gap-3">
        <Button to="/analyze/details" variant="ghost" size="lg">
          건너뛰기
        </Button>
        <Button to="/analyze/details" size="lg" className="flex-1">
          다음
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
