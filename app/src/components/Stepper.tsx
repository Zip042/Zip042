type StepState = "done" | "current" | "upcoming" | "skipped";

const DEFAULT_LABELS = ["업로드", "추가 서류", "조건 입력", "결과"];

function stepClassName(state: StepState) {
  switch (state) {
    case "done":
      return "rounded-full border border-brand-primary-border px-3 py-1.5 text-brand-primary";
    case "current":
      return "rounded-full bg-brand-primary px-3 py-1.5 text-white";
    case "skipped":
      return "rounded-full border border-border px-3 py-1.5 text-placeholder";
    default:
      return "rounded-full border border-border px-3 py-1.5";
  }
}

export default function Stepper({
  current,
  labels = DEFAULT_LABELS,
  skipped = [],
}: {
  current: number;
  labels?: string[];
  skipped?: number[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 text-sm font-bold text-muted-foreground-light">
      {labels.map((label, i) => {
        const state: StepState = skipped.includes(i)
          ? "skipped"
          : i < current
            ? "done"
            : i === current
              ? "current"
              : "upcoming";
        const suffix = state === "done" ? " ✓" : state === "skipped" ? " · 건너뜀" : "";
        return (
          <span key={label} className="flex items-center gap-2.5">
            <span className={stepClassName(state)}>
              {i + 1} {label}
              {suffix}
            </span>
            {i < labels.length - 1 && <span className="text-border-strong">──</span>}
          </span>
        );
      })}
    </div>
  );
}
