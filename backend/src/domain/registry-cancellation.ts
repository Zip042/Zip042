import type { RegistryRight } from "./types.js";

/**
 * 말소 등기 걸러내기 — **코드 이중 방어**.
 *
 * ## 왜 AI 판독만 믿으면 안 되는가
 *
 * 등기부에서 이미 갚아 없어진 근저당은 **취소선**으로 그어져 있습니다. 그런데 취소선은
 * 글자가 아닙니다. 판독기가 이걸 놓치면 **이미 갚은 3억을 살아 있는 빚으로 계산**합니다.
 * 멀쩡한 집이 "위험"으로 뜨고, 사용자는 계약을 접습니다.
 *
 * 반대 방향(살아 있는 빚을 말소로 보는 것)보다는 안전한 실수이지만, 어느 쪽이든
 * 판정이 통째로 뒤집힙니다.
 *
 * ## 두 겹으로 막는다
 *
 *  1. **AI 판독** — `isCancelled` (취소선·'말소' 표시를 보고 모델이 표시)
 *  2. **코드** — 말소는 취소선만 남지 않는다. `"3번 근저당권설정등기말소"` 같은
 *     **별도 항목으로 등기부에 글자로 남는다**. 이 글자를 찾아 대상 순위번호를 지운다.
 *
 * 2번이 이 파일의 존재 이유입니다. 규칙이 명확하고, 틀리면 판정이 뒤집히므로
 * 모델이 아니라 코드가 담당합니다 (설계 원칙 1).
 *
 * 순수 함수만 둡니다 — 같은 입력에 같은 결과, 외부 의존 없음.
 */

/**
 * 말소 등기의 등기목적에서 **대상 순위번호**를 뽑는다.
 *
 * 실제 등기부에 나타나는 형태들:
 *   "3번근저당권설정등기말소"
 *   "3번 근저당권설정 등기말소"
 *   "2번, 3번 근저당권설정등기말소"     ← 여러 건을 한 번에
 *   "3-1번 가압류등기말소"              ← 부기등기
 *   "1번소유권이전등기말소"
 *
 * 앞의 숫자만 잡으면 "3번 근저당권을 4번으로 이전" 같은 문장에서 오작동하므로,
 * **문자열에 '말소'가 있을 때만** 순위번호를 수집한다.
 */
export function extractCancelledRankNumbers(text: string | null | undefined): string[] {
  if (!text) return [];
  // '말소' 가 없는 등기목적은 말소 등기가 아니다.
  if (!text.includes("말소")) return [];

  const found = new Set<string>();
  // "3번", "3-1번" 형태를 모두 잡는다. 여러 건이 나열된 경우도 전부.
  for (const m of text.matchAll(/(\d+(?:-\d+)?)\s*번/g)) {
    found.add(m[1]!);
  }
  return [...found];
}

/** 이 항목 자체가 "말소 등기"인지 (다른 권리를 지우기 위한 등기). */
export function isCancellationEntry(right: RegistryRight): boolean {
  const note = right.note ?? "";
  // "…등기말소", "…말소" 로 끝나거나 '말소' 를 포함하면서 대상 순위번호를 가리키는 경우.
  return note.includes("말소");
}

export interface CancellationResult {
  /** 판정에 써도 되는 살아 있는 권리. */
  active: RegistryRight[];
  /** 말소된 것으로 판단한 권리. 화면에 "정리된 권리"로 보여줄 수 있다. */
  cancelled: RegistryRight[];
  /**
   * 등기부에 말소 기재가 섞여 있었는지.
   *
   * true 면 사용자에게 알려야 한다 — 조용히 처리하면 안 된다. "현재 유효사항만"으로
   * 다시 발급받는 편이 정확하고, 그렇게 안내할 근거가 이 값이다.
   */
  includesCancelledEntries: boolean;
  /**
   * **AI 는 살아 있다고 했는데 코드가 말소로 판단한** 순위번호.
   *
   * 이중 방어가 실제로 작동한 지점이다. 프롬프트를 고칠 단서가 되므로 따로 남긴다.
   */
  rescuedByCode: string[];
}

/**
 * 말소된 권리를 걸러낸다.
 *
 * 판단 순서
 *   1. 이 항목이 말소 등기 자체인가 → 제외 (그리고 대상 순위번호를 수집)
 *   2. 다른 말소 등기가 이 순위번호를 지목했는가 → 제외
 *   3. AI 가 말소로 표시했는가 → 제외
 */
export function separateCancelledRights(rights: readonly RegistryRight[]): CancellationResult {
  // 1) 말소 등기들이 지목한 순위번호를 모은다.
  const cancelledRanks = new Set<string>();
  for (const right of rights) {
    for (const rank of extractCancelledRankNumbers(right.note)) {
      cancelledRanks.add(rank);
    }
  }

  const active: RegistryRight[] = [];
  const cancelled: RegistryRight[] = [];
  const rescuedByCode: string[] = [];
  let sawCancellation = false;

  for (const right of rights) {
    const isEntry = isCancellationEntry(right);
    if (isEntry) sawCancellation = true;

    // 말소 등기 자체는 권리가 아니다. 판정 대상에서 뺀다.
    if (isEntry) {
      cancelled.push(right);
      continue;
    }

    const rank = right.rankNo ?? null;
    const targetedByCode = rank !== null && cancelledRanks.has(rank);
    if (targetedByCode || right.isCancelled) {
      if (targetedByCode && !right.isCancelled && rank !== null) {
        // AI 가 놓친 것을 코드가 잡았다. 이 파일이 존재하는 이유가 여기서 증명된다.
        rescuedByCode.push(rank);
      }
      if (right.isCancelled) sawCancellation = true;
      cancelled.push(right);
      continue;
    }

    active.push(right);
  }

  return {
    active,
    cancelled,
    includesCancelledEntries: sawCancellation || cancelledRanks.size > 0,
    rescuedByCode,
  };
}
