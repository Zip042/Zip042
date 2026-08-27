import { useState } from "react";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { Button, Card, PageHead, Steps } from "@/components/ui";

type Lease = "jeonse" | "monthly";

export default function AnalyzeDetails() {
  const [lease, setLease] = useState<Lease>("jeonse");
  const [balanceDate, setBalanceDate] = useState("2026-09-14");
  const [moveInDate, setMoveInDate] = useState("2026-09-18");

  // 잔금일과 전입신고일 사이가 벌어지면 대항력이 비는 구간이 생깁니다.
  // 이 경고는 규칙 엔진(schedule.ts)이 내는 판정과 같은 취지를 화면에서 미리 보여주는 것입니다.
  const gapDays =
    balanceDate && moveInDate
      ? Math.round(
          (new Date(moveInDate).getTime() - new Date(balanceDate).getTime()) / 86_400_000,
        )
      : 0;

  return (
    <div className="mx-auto max-w-2xl px-5 py-12 sm:py-16">
      <Steps current={2} />
      <PageHead
        title="계약 조건을 알려주세요"
        lead="보증금과 날짜가 있어야 '보증금을 돌려받을 수 있는가'를 계산할 수 있습니다."
      />

      <div className="space-y-6">
        <Field label="계약 형태">
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["jeonse", "전세"],
                ["monthly", "월세 · 반전세"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setLease(value)}
                className={`h-11 rounded-xl border text-[14px] font-semibold transition-colors ${
                  lease === value
                    ? "border-brand-400 bg-brand-50 text-brand-700"
                    : "border-line bg-white text-ink-500 hover:bg-surface"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="보증금" hint="만원 단위로 입력하세요">
          <MoneyInput defaultValue="15,000" suffix="만원" />
        </Field>

        {lease === "monthly" && (
          <Field label="월세">
            <MoneyInput defaultValue="50" suffix="만원" />
          </Field>
        )}

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="잔금일">
            <DateInput value={balanceDate} onChange={setBalanceDate} />
          </Field>
          <Field label="전입신고 예정일">
            <DateInput value={moveInDate} onChange={setMoveInDate} />
          </Field>
        </div>

        {gapDays > 0 && (
          <Card className="border-warn-200 bg-warn-50 p-4">
            <div className="flex gap-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn-600" />
              <div>
                <p className="text-[13.5px] font-semibold text-warn-600">
                  잔금일과 전입신고일 사이 {gapDays}일은 대항력이 없는 상태입니다
                </p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-warn-600/85">
                  대항력은 전입신고 <strong className="font-semibold">다음 날 0시</strong>부터
                  생깁니다. 이 사이에 집주인이 대출을 받으면 보증금이 후순위로 밀립니다.
                  가능하면 잔금일 당일에 전입신고를 하세요.
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>

      <div className="mt-8">
        <Button to="/analyze/review" size="lg" full>
          분석하기
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <label className="text-[13.5px] font-semibold">{label}</label>
        {hint && <span className="text-[12px] text-ink-300">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function MoneyInput({ defaultValue, suffix }: { defaultValue: string; suffix: string }) {
  return (
    <div className="flex h-12 items-center rounded-xl border border-line bg-white px-4 focus-within:border-brand-400">
      <input
        defaultValue={defaultValue}
        inputMode="numeric"
        className="tnum w-full bg-transparent text-right text-[16px] font-semibold outline-none"
      />
      <span className="ml-2 shrink-0 text-[13.5px] text-ink-500">{suffix}</span>
    </div>
  );
}

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="tnum h-12 w-full rounded-xl border border-line bg-white px-4 text-[15px] outline-none focus:border-brand-400"
    />
  );
}
