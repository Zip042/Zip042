import type { ReactNode } from "react";
import { Link } from "react-router";

export type Grade = "OK" | "UNKNOWN" | "WARN" | "STOP";

/**
 * 등급별 표기. 백엔드 `judgment.ts` 의 네 등급을 그대로 씁니다.
 * UNKNOWN 이 회청색인 것은 의도입니다 — 모르는 것은 위험한 것이 아닙니다.
 */
export const GRADE: Record<
  Grade,
  { label: string; dot: string; chipBg: string; chipText: string; chipRing: string; bar: string }
> = {
  STOP: {
    label: "멈춤",
    dot: "bg-stop-500",
    chipBg: "bg-stop-50",
    chipText: "text-stop-700",
    chipRing: "ring-stop-200",
    bar: "bg-stop-500",
  },
  WARN: {
    label: "확인 필요",
    dot: "bg-warn-500",
    chipBg: "bg-warn-50",
    chipText: "text-warn-600",
    chipRing: "ring-warn-200",
    bar: "bg-warn-500",
  },
  UNKNOWN: {
    label: "판단 불가",
    dot: "bg-mute-500",
    chipBg: "bg-mute-50",
    chipText: "text-mute-600",
    chipRing: "ring-mute-200",
    bar: "bg-mute-400",
  },
  OK: {
    label: "이상 없음",
    dot: "bg-brand-500",
    chipBg: "bg-brand-50",
    chipText: "text-brand-700",
    chipRing: "ring-brand-200",
    bar: "bg-brand-500",
  },
};

export function GradeChip({ grade, className = "" }: { grade: Grade; className?: string }) {
  const g = GRADE[grade];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset ${g.chipBg} ${g.chipText} ${g.chipRing} ${className}`}
    >
      <span className={`size-1.5 rounded-full ${g.dot}`} />
      {g.label}
    </span>
  );
}

export function Card({
  children,
  className = "",
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  return (
    <As className={`rounded-2xl border border-line bg-white ${className}`}>{children}</As>
  );
}

type ButtonProps = {
  children: ReactNode;
  to?: string;
  variant?: "primary" | "ghost" | "quiet";
  size?: "md" | "lg";
  className?: string;
  full?: boolean;
  onClick?: () => void;
  disabled?: boolean;
};

export function Button({
  children,
  to,
  variant = "primary",
  size = "md",
  className = "",
  full,
  onClick,
  disabled,
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-45 disabled:pointer-events-none";
  const sizes = { md: "h-11 px-4 text-[14px]", lg: "h-13 px-6 text-[15px]" };
  const variants = {
    primary: "bg-brand-500 text-white hover:bg-brand-600",
    ghost: "border border-line bg-white text-ink-700 hover:bg-surface",
    quiet: "text-ink-500 hover:text-ink-900 hover:bg-surface",
  };
  const cls = `${base} ${sizes[size]} ${variants[variant]} ${full ? "w-full" : ""} ${className}`;
  if (to) return <Link to={to} className={cls}>{children}</Link>;
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

/** 화면 상단 제목 블록. 페이지마다 같은 리듬을 유지합니다. */
export function PageHead({
  eyebrow,
  title,
  lead,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
}) {
  return (
    <header className="mb-8">
      {eyebrow && (
        <p className="mb-2 text-[13px] font-semibold text-brand-600">{eyebrow}</p>
      )}
      <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] sm:text-[30px]">
        {title}
      </h1>
      {lead && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-500">{lead}</p>}
    </header>
  );
}

/** 진행 단계 표시. 분석 흐름 3단계에서 공통으로 씁니다. */
export function Steps({ current }: { current: 1 | 2 | 3 | 4 }) {
  const steps = ["서류", "계약 조건", "판독 확인", "판정"];
  return (
    <ol className="mb-8 flex items-center gap-2">
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3 | 4;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                  active
                    ? "bg-brand-500 text-white"
                    : done
                      ? "bg-brand-100 text-brand-700"
                      : "bg-mute-100 text-ink-300"
                }`}
              >
                {n}
              </span>
              <span
                className={`hidden text-[13px] font-medium sm:inline ${active ? "text-ink-900" : "text-ink-300"}`}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span className={`h-px flex-1 ${done ? "bg-brand-200" : "bg-line"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * 법적 고지. 모든 판정 화면에 **반드시** 보여야 합니다.
 * 백엔드가 caveats/disclaimer 를 내려주는 이유가 이것입니다.
 */
export function Disclaimer({ items }: { items: string[] }) {
  return (
    <div className="rounded-xl bg-surface px-5 py-4">
      <p className="mb-2 text-[12px] font-semibold text-ink-700">참고하세요</p>
      <ul className="space-y-1.5">
        {items.map((t) => (
          <li key={t} className="flex gap-2 text-[12.5px] leading-relaxed text-ink-500">
            <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-300" />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function formatMan(krw: number): string {
  return `${Math.round(krw / 10_000).toLocaleString("ko-KR")}만원`;
}
