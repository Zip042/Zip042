import { computeChecklistProgress, sanitizeCheckedIds, type ChecklistProgress } from "../domain/checklist.js";
import type { Db } from "../lib/supabase.js";

/**
 * 계약 체크리스트 진행 상태 저장.
 *
 * 항목 정의는 `domain/checklist.ts` 에 있고 여기서는 **체크된 id 집합만** 다룬다.
 * 사용자당 한 줄이므로 `user_id` 가 곧 기본키다.
 *
 * `adminClient()` 를 쓰지 않는다 — 사용자 본인 데이터이므로 RLS 가 적용되는
 * `userClient(token)` 으로 충분하고, 그게 기본 원칙이다. 그럼에도 조회·저장 모두
 * `user_id` 를 코드에서 명시적으로 지정한다(이중 방어).
 */

export interface ChecklistState {
  checkedItemIds: string[];
  progress: ChecklistProgress;
  updatedAt: string | null;
}

interface ProgressRow {
  user_id: string;
  checked_item_ids: string[] | null;
  updated_at: string | null;
}

const COLUMNS = "user_id,checked_item_ids,updated_at";

function toState(row: ProgressRow | null): ChecklistState {
  // 저장된 값에도 sanitize 를 건다. 항목이 지워진 뒤 남은 옛 id 가 진행률을 부풀리면 안 된다.
  const checked = sanitizeCheckedIds(row?.checked_item_ids ?? []);
  return {
    checkedItemIds: checked,
    progress: computeChecklistProgress(checked),
    updatedAt: row?.updated_at ?? null,
  };
}

/** 아직 한 번도 저장하지 않은 사용자는 빈 상태를 돌려준다 (404 가 아니다). */
export async function getChecklistState(db: Db, userId: string): Promise<ChecklistState> {
  const { data, error } = await db
    .from("checklist_progress")
    .select(COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`체크리스트 조회: ${error.message}`);
  return toState((data as unknown as ProgressRow) ?? null);
}

/**
 * 체크 상태를 통째로 덮어쓴다.
 *
 * 항목 단위 PATCH 가 아니라 전체 교체인 이유: 체크박스를 빠르게 여러 개 누르면
 * 부분 갱신은 순서가 뒤바뀌어 마지막 요청이 이전 상태를 되살릴 수 있다.
 * 화면이 가진 전체 상태를 그대로 보내는 편이 결과가 예측 가능하다.
 */
export async function saveChecklistState(
  db: Db,
  userId: string,
  checkedItemIds: readonly string[],
): Promise<ChecklistState> {
  const checked = sanitizeCheckedIds(checkedItemIds);

  const { data, error } = await db
    .from("checklist_progress")
    .upsert({ user_id: userId, checked_item_ids: checked }, { onConflict: "user_id" })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`체크리스트 저장: ${error.message}`);

  return toState(data as unknown as ProgressRow);
}

/** 체크를 전부 지운다. 새 계약을 시작할 때 쓴다. */
export async function resetChecklistState(db: Db, userId: string): Promise<ChecklistState> {
  const { error } = await db.from("checklist_progress").delete().eq("user_id", userId);
  if (error) throw new Error(`체크리스트 초기화: ${error.message}`);
  return toState(null);
}
