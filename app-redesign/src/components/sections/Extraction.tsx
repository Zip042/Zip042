import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import Stage from "./Stage";
import { useInView } from "@/components/motion";

/* ══════════════════════════════════════════════════════════════════════
   1. 판독 — 등기부를 훑어 숫자를 꺼내는 장면
   ══════════════════════════════════════════════════════════════════ */

const PULLED = [
  { label: "채권최고액", value: "2.4억", tone: "dark" },
  { label: "소유자", value: "이○○", tone: "plain" },
  { label: "전세권", value: "1.5억", tone: "plain" },
  { label: "전용면적", value: "84.97㎡", tone: "plain" },
] as const;

export function ScanSection() {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [n, setN] = useState(0);

  // 훑는 선이 지나갈 때마다 값이 하나씩 튀어나오게
  useEffect(() => {
    if (!inView) return;
    const timers = PULLED.map((_, i) =>
      window.setTimeout(() => setN((v) => Math.max(v, i + 1)), 500 + i * 340),
    );
    return () => timers.forEach(clearTimeout);
  }, [inView]);

  return (
    <Stage
      eyebrow="1. 읽기"
      title={
        <>
          서류를 대신 읽습니다
        </>
      }
    >
      <div ref={ref} className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
        {/* 등기부 모형 */}
        <div className="relative mx-auto w-full max-w-sm">
          <div className="relative overflow-hidden rounded-2xl border border-line bg-white p-6 shadow-[0_20px_60px_-24px_rgba(16,24,21,.25)]">
            <p className="text-[11px] font-bold text-ink-300">등기사항전부증명서</p>
            <div className="mt-4 space-y-2.5">
              {[92, 76, 88, 60, 84, 70, 90, 54].map((w, i) => (
                <div
                  key={i}
                  className={`h-2 rounded-full ${i === 3 || i === 6 ? "bg-ink-700/70" : "bg-mute-200"}`}
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>

            {/* 훑는 선 */}
            {inView && (
              <div
                aria-hidden
                className="scanline pointer-events-none absolute inset-x-0 h-24"
                style={{
                  background:
                    "linear-gradient(180deg, transparent, color-mix(in srgb, var(--color-brand-400) 22%, transparent), transparent)",
                  borderTop: "2px solid var(--color-brand-500)",
                }}
              />
            )}
          </div>
        </div>

        {/* 꺼낸 값들 */}
        <ul className="grid grid-cols-2 gap-3">
          {PULLED.map((p, i) => (
            <li
              key={p.label}
              className={`rounded-2xl border p-5 transition-all duration-500 ${
                i < n
                  ? "rollin border-line bg-white opacity-100"
                  : "border-dashed border-mute-200 bg-transparent opacity-0"
              } ${p.tone === "dark" ? "ring-1 ring-brand-200" : ""}`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <p className="text-[11.5px] text-ink-300">{p.label}</p>
              <p className="tnum mt-1 text-[22px] font-bold tracking-[-0.02em]">{p.value}</p>
            </li>
          ))}
        </ul>
      </div>
    </Stage>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   2. 말소선 함정 — 이 서비스에서 가장 위험한 오독
   ══════════════════════════════════════════════════════════════════ */

export function CancelTrap() {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <Stage
      tone="surface"
      eyebrow="가장 흔한 실수"
      title={
        <>
          이미 갚은 빚을
          <br />
          <span className="text-ink-300">빚으로 세면 안 됩니다</span>
        </>
      }
      caption="등기부에서 말소된 근저당은 취소선으로만 표시됩니다. 취소선은 글자가 아닙니다."
    >
      <div ref={ref} className="mx-auto grid max-w-4xl gap-5 sm:grid-cols-2">
        {/* 틀린 계산 */}
        <div className="rounded-3xl border border-stop-200 bg-white p-7">
          <div className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-full bg-stop-500">
              <X className="size-3.5 text-white" strokeWidth={3} />
            </span>
            <span className="text-[13px] font-bold text-stop-600">놓쳤을 때</span>
          </div>

          <div className="mt-6 space-y-3">
            <DebtRow amount="3.6억" struck={inView} />
            <DebtRow amount="2.4억" />
          </div>

          <div className="mt-6 border-t border-line pt-5">
            <p className="text-[12px] text-ink-300">빚 합계</p>
            <p className="tnum mt-1 text-[34px] font-bold leading-none text-stop-600">6.0억</p>
            <p className="mt-3 text-[13px] font-semibold text-stop-600">
              멀쩡한 집이 위험으로 뜹니다
            </p>
          </div>
        </div>

        {/* 맞는 계산 */}
        <div className="rounded-3xl border border-brand-200 bg-white p-7">
          <div className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-full bg-brand-500">
              <Check className="size-3.5 text-white" strokeWidth={3} />
            </span>
            <span className="text-[13px] font-bold text-brand-700">Zip042</span>
          </div>

          <div className="mt-6 space-y-3">
            <DebtRow amount="3.6억" struck={inView} excluded />
            <DebtRow amount="2.4억" />
          </div>

          <div className="mt-6 border-t border-line pt-5">
            <p className="text-[12px] text-ink-300">빚 합계</p>
            <p className="tnum mt-1 text-[34px] font-bold leading-none text-brand-600">2.4억</p>
            <p className="mt-3 text-[13px] font-semibold text-brand-700">
              말소된 것은 빼고 셉니다
            </p>
          </div>
        </div>
      </div>
    </Stage>
  );
}

function DebtRow({
  amount,
  struck,
  excluded,
}: {
  amount: string;
  struck?: boolean;
  excluded?: boolean;
}) {
  return (
    <div
      className={`relative flex items-center justify-between rounded-xl px-4 py-3.5 ${
        excluded ? "bg-mute-50" : "bg-surface"
      }`}
    >
      <span className={`text-[12.5px] ${excluded ? "text-mute-500" : "text-ink-500"}`}>
        근저당권설정
      </span>
      <span className="relative">
        <span
          className={`tnum text-[17px] font-bold ${excluded ? "text-mute-400" : "text-ink-900"}`}
        >
          {amount}
        </span>
        {struck && (
          <span
            aria-hidden
            className="strike absolute inset-x-0 top-1/2 h-[2px] bg-ink-900"
            style={{ animationDelay: "300ms" }}
          />
        )}
      </span>
      {excluded && (
        <span className="absolute -right-2 -top-2 rounded-full bg-mute-200 px-2 py-0.5 text-[10px] font-bold text-mute-600">
          제외
        </span>
      )}
    </div>
  );
}
