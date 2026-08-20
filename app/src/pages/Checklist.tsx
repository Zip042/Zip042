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
      note: "중개인이 보여주는 사본은 날짜가 오래됐을 수 있습니다.",
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
    <div className="mx-auto grid max-w-4xl grid-cols-1 gap-0 px-6 py-10 md:grid-cols-[180px_1fr]">
      <aside className="flex flex-col gap-1.5 border-b border-border pb-6 md:border-b-0 md:border-r md:pr-4 md:pb-0">
        <p className="mb-1 text-sm font-bold">진행 단계</p>
        {STAGES.map((stage) => (
          <button
            key={stage}
            type="button"
            onClick={() => setActiveStage(stage)}
            className={
              stage === activeStage
                ? "rounded-md bg-foreground px-3 py-2 text-left text-sm text-background"
                : "rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted"
            }
          >
            {stage}
          </button>
        ))}
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            전체 진행률 {doneCount}/{allItems.length}
          </p>
          <Progress
            value={(doneCount / allItems.length) * 100}
            className="mt-2"
            indicatorClassName="bg-brand-secondary"
          />
        </div>
      </aside>

      <div className="flex flex-col gap-3 md:pl-6">
        <h1 className="font-display text-lg font-bold">{activeStage}</h1>
        <p className="text-sm text-muted-foreground">체크한 내용은 저장되고, PDF로 뽑아 갈 수 있습니다.</p>

        {items.map((item) => {
          const isChecked = !!checked[item.id];
          return (
            <label
              key={item.id}
              className={
                isChecked
                  ? "flex items-start gap-3 rounded-lg border border-brand-secondary-light bg-brand-secondary-light p-3"
                  : item.required
                    ? "flex items-start gap-3 rounded-lg border border-brand-primary-light bg-brand-primary-light p-3"
                    : "flex items-start gap-3 rounded-lg border border-border p-3"
              }
            >
              <Checkbox
                checked={isChecked}
                onCheckedChange={(value) =>
                  setChecked((prev) => ({ ...prev, [item.id]: value === true }))
                }
                className="mt-0.5 data-[state=checked]:border-brand-secondary data-[state=checked]:bg-brand-secondary"
              />
              <div>
                <p className={isChecked ? "text-sm text-muted-foreground line-through" : "text-sm font-bold"}>
                  {item.label} {item.required && <span className="text-brand-primary">필수</span>}
                </p>
                {item.note && <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>}
              </div>
            </label>
          );
        })}

        <div className="mt-auto flex gap-3 pt-4">
          <Button className="bg-brand-secondary hover:bg-brand-secondary-hover">다음 단계로</Button>
          <Button variant="outline">체크리스트 인쇄</Button>
        </div>
      </div>
    </div>
  );
}
