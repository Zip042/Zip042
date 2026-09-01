import { useEffect, useMemo, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { getChecklist, getChecklistProgress, saveChecklistProgress } from "@/lib/api";
import { toMessage, useAsync } from "@/lib/useAsync";

/**
 * 계약 단계별 체크리스트.
 *
 * 항목과 체크 상태 모두 서버에서 옵니다(`GET /v1/checklist`, `/v1/checklist/progress`).
 * 체크하면 서버에 저장되므로 다시 들어와도 그대로 남습니다.
 *
 * 저장은 **전체 교체**입니다(PUT). 체크박스를 빠르게 여러 개 누르면 부분 갱신은
 * 순서가 뒤바뀌어 마지막 응답이 이전 상태를 되살릴 수 있기 때문입니다.
 */

interface ChecklistItem {
  id: string;
  label: string;
  note: string | null;
  required: boolean;
}
interface Stage {
  code: string;
  label: string;
  items: ChecklistItem[];
}

export default function Checklist() {
  const template = useAsync(getChecklist, []);
  const progress = useAsync(getChecklistProgress, []);

  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const stages = useMemo<Stage[]>(
    () => ((template.data?.stages ?? []) as Stage[]),
    [template.data],
  );

  // 서버에 저장된 체크 상태를 화면에 반영한다 (최초 1회).
  useEffect(() => {
    const ids = progress.data?.checklist?.checkedItemIds;
    if (!ids) return;
    setChecked(Object.fromEntries(ids.map((id: string) => [id, true])));
  }, [progress.data]);

  useEffect(() => {
    if (!activeStage && stages.length > 0) setActiveStage(stages[0]!.code);
  }, [stages, activeStage]);

  const allItems = stages.flatMap((s) => s.items);
  const doneCount = allItems.filter((item) => checked[item.id]).length;
  const items = stages.find((s) => s.code === activeStage)?.items ?? [];
  const stageIndex = stages.findIndex((s) => s.code === activeStage);

  /**
   * 저장 요청이 겹치면 마지막 것만 반영한다.
   * 체크를 빠르게 여러 번 누르면 응답 순서가 뒤바뀔 수 있어, 요청마다 번호를 매겨
   * 최신 요청의 결과만 오류로 취급한다.
   */
  const saveSeq = useRef(0);

  async function persist(next: Record<string, boolean>) {
    const seq = ++saveSeq.current;
    const ids = Object.keys(next).filter((id) => next[id]);
    setSaving(true);
    try {
      await saveChecklistProgress(ids);
      if (seq === saveSeq.current) setSaveError(null);
    } catch (err) {
      if (seq === saveSeq.current) setSaveError(toMessage(err));
    } finally {
      if (seq === saveSeq.current) setSaving(false);
    }
  }

  function toggle(id: string, value: boolean) {
    // 낙관적 갱신 — 체크는 즉시 반영하고 저장은 뒤따라간다.
    setChecked((prev) => {
      const next = { ...prev, [id]: value };
      void persist(next);
      return next;
    });
  }

  function goNextStage() {
    const next = stages[stageIndex + 1];
    if (next) setActiveStage(next.code);
  }

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
          <Button
            variant="outline"
            className="rounded-[11px] border-border-strong bg-white"
            onClick={() => window.print()}
          >
            체크리스트 인쇄
          </Button>
        </div>

        {template.loading && (
          <p className="mt-7 text-sm text-muted-foreground-light">체크리스트를 불러오는 중입니다…</p>
        )}

        {template.error && (
          <div className="mt-7 rounded-2xl border border-danger-border bg-white px-5 py-4">
            <p className="text-sm font-bold text-danger">체크리스트를 불러오지 못했습니다</p>
            <p className="mt-1 text-sm text-danger-text">{template.error}</p>
            <Button
              variant="outline"
              className="mt-3 rounded-[10px] border-border-strong"
              onClick={template.reload}
            >
              다시 시도
            </Button>
          </div>
        )}

        {!template.loading && !template.error && (
          <div className="mt-7 grid grid-cols-1 items-start gap-7 md:grid-cols-[240px_1fr]">
            <aside className="rounded-2xl border border-border bg-white p-4.5">
              <div className="flex flex-col gap-1.5">
                {stages.map((stage, i) => (
                  <button
                    key={stage.code}
                    type="button"
                    onClick={() => setActiveStage(stage.code)}
                    className={
                      stage.code === activeStage
                        ? "rounded-[10px] bg-brand-primary px-3.5 py-3 text-left text-sm font-bold text-white"
                        : "rounded-[10px] px-3.5 py-3 text-left text-sm text-muted-foreground hover:bg-background-alt"
                    }
                  >
                    {i + 1} · {stage.label}
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
                <Progress
                  value={allItems.length === 0 ? 0 : (doneCount / allItems.length) * 100}
                  className="mt-2.5 bg-border"
                />
                {saving && <p className="mt-2 text-[11px] text-muted-foreground-light">저장 중…</p>}
                {saveError && <p className="mt-2 text-[11px] text-danger">{saveError}</p>}
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
                      onCheckedChange={(value) => toggle(item.id, value === true)}
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
                <Button
                  className="rounded-[11px] bg-brand-primary px-6 hover:bg-brand-primary-hover"
                  onClick={goNextStage}
                  disabled={stageIndex >= stages.length - 1}
                >
                  다음 단계로
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
