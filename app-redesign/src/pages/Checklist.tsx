import { useState } from "react";
import { Check } from "lucide-react";
import { Card, PageHead } from "@/components/ui";
import { CHECKLIST } from "@/data/sample";

export default function Checklist() {
  const all = CHECKLIST.flatMap((g) => g.items.map((i) => i.text));
  const [done, setDone] = useState<string[]>([]);
  const toggle = (t: string) =>
    setDone((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const pct = Math.round((done.length / all.length) * 100);

  return (
    <div className="mx-auto max-w-2xl px-5 py-12 sm:py-16">
      <PageHead
        eyebrow="계약 전 · 계약 당일 · 잔금"
        title="빠뜨리기 쉬운 것들"
        lead="순서대로 확인하세요. 특히 잔금 직전 등기부 재확인은 가장 많이 놓치는 단계입니다."
      />

      {/* 진행률 */}
      <Card className="mb-8 p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-[13.5px] font-semibold">진행률</span>
          <span className="tnum text-[13.5px] font-semibold text-brand-700">
            {done.length} / {all.length}
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-mute-100">
          <div
            className="h-full rounded-full bg-brand-500 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </Card>

      <div className="space-y-8">
        {CHECKLIST.map((group) => (
          <section key={group.phase}>
            <h2 className="mb-3 flex items-center gap-2.5 text-[13px] font-bold text-ink-700">
              <span className="h-4 w-1 rounded-full bg-brand-400" />
              {group.phase}
            </h2>

            <ul className="space-y-2">
              {group.items.map((item) => {
                const on = done.includes(item.text);
                return (
                  <Card as="li" key={item.text} className={on ? "border-brand-200 bg-brand-50/40" : ""}>
                    <button
                      onClick={() => toggle(item.text)}
                      className="flex w-full items-start gap-3 p-4 text-left"
                    >
                      <span
                        className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors ${
                          on
                            ? "border-brand-500 bg-brand-500 text-white"
                            : "border-line bg-white"
                        }`}
                      >
                        {on && <Check className="size-3.5" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-[14px] leading-relaxed ${
                            on ? "text-ink-300 line-through" : "font-medium text-ink-900"
                          }`}
                        >
                          {item.text}
                        </span>
                        {item.hint && !on && (
                          <span className="mt-1 block text-[12.5px] text-warn-600">
                            {item.hint}
                          </span>
                        )}
                      </span>
                    </button>
                  </Card>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
