import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

const STAGES = ["집 보러 가기 전", "계약 당일", "잔금 · 입주", "입주 후"];

type ChecklistItem = { id: string; label: string; note?: string; required?: boolean };

const STAGE_ITEMS: Record<string, ChecklistItem[]> = {
  "집 보러 가기 전": [
    {
      id: "issued",
      label: "등기부등본을 직접 발급받았다",
      note: "중개인이 보여주는 사본은 날짜가 오래됐을 수 있습니다. 계약 당일에 다시 확인하세요.",
      required: true,
    },
    {
      id: "priceCompared",
      label: "시세와 보증금을 비교했다",
      note: "전세가율 80% 이상이면 재검토하세요.",
      required: true,
    },
    { id: "brokerChecked", label: "중개사무소 등록번호를 조회했다" },
    { id: "condition", label: "채광 · 수압 · 곰팡이 · 방음을 확인했다" },
    { id: "fees", label: "관리비 항목과 공과금 부담 주체를 물었다" },
  ],
  "계약 당일": [{ id: "contract-1", label: "계약서 특약사항을 확인했다" }],
  "잔금 · 입주": [{ id: "balance-1", label: "잔금 지급 전 등기부를 재열람했다" }],
  "입주 후": [{ id: "after-1", label: "전입신고와 확정일자를 받았다" }],
};

export default function Checklist() {
  const [activeStage, setActiveStage] = useState(STAGES[0]);
  const [checked, setChecked] = useState<Record<string, boolean>>({ brokerChecked: true });

  const allItems = Object.values(STAGE_ITEMS).flat();
  const doneCount = allItems.filter((item) => checked[item.id]).length;
  const items = STAGE_ITEMS[activeStage];

  return (
    <div className="border-b border-border bg-background-alt">
      <div className="mx-auto max-w-6xl px-8 py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[30px] font-black tracking-tight">계약 단계별 체크리스트</h1>
            <p className="mt-2 text-sm text-muted-foreground-light">
              체크한 내용은 저장되고, PDF로 뽑아서 계약장에 가져갈 수 있습니다.
            </p>
          </div>
          <Button variant="outline" className="rounded-[11px] border-border-strong bg-white">
            체크리스트 인쇄
          </Button>
        </div>

        <div className="mt-7 grid grid-cols-1 items-start gap-7 md:grid-cols-[240px_1fr]">
          <aside className="rounded-2xl border border-border bg-white p-4.5">
            <div className="flex flex-col gap-1.5">
              {STAGES.map((stage, i) => (
                <button
                  key={stage}
                  type="button"
                  onClick={() => setActiveStage(stage)}
                  className={
                    stage === activeStage
                      ? "rounded-[10px] bg-brand-primary px-3.5 py-3 text-left text-sm font-bold text-white"
                      : "rounded-[10px] px-3.5 py-3 text-left text-sm text-muted-foreground hover:bg-background-alt"
                  }
                >
                  {i + 1} · {stage}
                </button>
              ))}
            </div>
            <div className="mt-4.5 border-t border-border pt-4">
              <div className="flex justify-between text-[13px]">
                <span className="text-muted-foreground-light">전체 진행률</span>
                <span className="font-bold text-brand-primary">
                  {doneCount} / {allItems.length}
                </span>
              </div>
              <Progress value={(doneCount / allItems.length) * 100} className="mt-2.5 bg-border" />
            </div>
          </aside>

          <div className="flex flex-col gap-3">
            {items.map((item) => {
              const isChecked = !!checked[item.id];
              return (
                <label
                  key={item.id}
                  className={
                    isChecked
                      ? "flex items-center gap-3.5 rounded-2xl border border-border bg-white p-5"
                      : item.required
                        ? "flex gap-3.5 rounded-2xl border border-danger-border bg-white p-5"
                        : "flex items-center gap-3.5 rounded-2xl border border-border bg-white p-5"
                  }
                >
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={(value) => setChecked((prev) => ({ ...prev, [item.id]: value === true }))}
                    className={
                      item.required && !isChecked
                        ? "size-5.5 rounded-[6px] border-2 border-danger data-[state=checked]:border-brand-primary data-[state=checked]:bg-brand-primary"
                        : "size-5.5 rounded-[6px] data-[state=checked]:border-brand-primary data-[state=checked]:bg-brand-primary"
                    }
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className={isChecked ? "text-base font-medium text-placeholder line-through" : "text-base font-bold"}>
                        {item.label}
                      </p>
                      {item.required && (
                        <span className="rounded-md bg-danger px-2 py-0.5 text-[11px] font-bold text-white">
                          필수
                        </span>
                      )}
                    </div>
                    {item.note && !isChecked && (
                      <p className="mt-1 text-[13px] text-muted-foreground">{item.note}</p>
                    )}
                  </div>
                </label>
              );
            })}

            <div className="mt-1.5 flex justify-end">
              <Button className="rounded-[11px] bg-brand-primary px-6 hover:bg-brand-primary-hover">다음 단계로</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
