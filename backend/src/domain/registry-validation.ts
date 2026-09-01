import type { DateOnly } from "../lib/date.js";
import type { Finding, RegistryExtraction } from "./types.js";

/**
 * 판독 결과 검산 — **스키마는 형식만 보장한다**.
 *
 * 구조화 출력을 강제하면 필드가 빠지거나 타입이 깨지는 일은 없습니다. 그런데 **값이
 * 말이 되는지는 별개**입니다. 접수일자가 2099년일 수도, 채권최고액이 음수일 수도 있습니다.
 *
 * ## 왜 422 로 끊지 않는가
 *
 * 구현 가이드는 검산에 걸리면 422 "판독 불가"로 응답하라고 합니다. 의도(틀린 판정을
 * 내리느니 못 읽었다고 하는 편이 낫다)에는 전적으로 동의하지만, 이 서버는 그 의도를
 * **이미 다른 방식으로** 구현하고 있습니다.
 *
 *   `Finding.kind: "info_gap"` → 위험 점수에 더해지지 않음
 *   심각한 gap → `blockingGaps` → `contractable = false`
 *   그때 headline 은 "위험합니다"가 아니라 **"아직 판단할 수 없어요"**
 *
 * 422 로 끊으면 **읽어낸 나머지 정보까지 함께 버립니다.** "소재지와 소유자는 읽었는데
 * 3번 근저당 금액을 못 읽었다"는 상황에서, 사용자에게 아무것도 안 보여주는 것보다
 * 읽은 것을 보여주고 못 읽은 것을 정확히 짚어 주는 편이 낫습니다. 결론(계약하지 말 것)은
 * 어차피 같습니다.
 *
 * 그래서 검산 결과를 **info_gap finding 으로** 올립니다. 순수 함수입니다.
 */

/** 등기 접수일이 이보다 과거면 판독 오류로 본다. 부동산 등기부 전산화 이전. */
const EARLIEST_PLAUSIBLE_YEAR = 1960;

export interface RegistryValidationInput {
  registry: RegistryExtraction;
  /** 오늘(KST). 미래 날짜 판단 기준. */
  today: DateOnly;
}

function gap(
  code: string,
  severity: Finding["severity"],
  title: string,
  description: string,
  action: string,
  evidence?: Record<string, unknown>,
): Finding {
  return {
    code,
    category: "rights",
    // 판독 실패는 "위험"이 아니라 "확인 못 함"이다. 이걸 섞으면 흐린 사진이
    // 경매 진행과 같은 무게로 쌓인다 (설계 원칙 3).
    kind: "info_gap",
    severity,
    weight: severity === "danger" ? 10 : 5,
    title,
    description,
    action,
    ...(evidence ? { evidence } : {}),
  };
}

/**
 * 판독 결과를 검산해 확인하지 못한 항목을 찾는다.
 *
 * 여기서 걸리는 것은 **모델이 형식은 맞췄지만 값이 이상한** 경우다.
 * 이미 다른 규칙이 잡고 있는 항목(금액 미상 등)과 겹치지 않게, 이 함수는
 * "값 자체가 말이 안 되는" 경우만 본다.
 */
export function validateRegistryExtraction({
  registry,
  today,
}: RegistryValidationInput): Finding[] {
  const findings: Finding[] = [];

  // ── 소재지 ────────────────────────────────────────────────────────────
  if (!registry.address || registry.address.trim().length === 0) {
    findings.push(
      gap(
        "RIGHTS_ADDRESS_UNREADABLE",
        "danger",
        "등기부에서 소재지를 읽지 못했어요",
        "표제부의 소재지번을 판독하지 못했습니다. 어느 집의 등기부인지 확인할 수 없으면 " +
          "계약서·확인설명서와 대조할 수가 없습니다.",
        "표제부(첫 장)가 잘리지 않게 다시 촬영하거나 PDF 원본을 올려주세요.",
      ),
    );
  }

  // ── 갑구가 통째로 비어 있다 ────────────────────────────────────────────
  // 소유권 기재가 없는 등기부는 존재하지 않는다. 원래는 파싱 실패로 봤다.
  //
  // ⚠️ 실제 판독으로 확인된 함정: 같은 문서를 다시 넣어도 모델이 매번 같은 구조로
  // 뽑지 않는다. ownerNames(최상위 필드)는 채웠는데 rights 의 gap 항목은 하나도
  // 안 만드는 경우가 실제로 나왔다 — "소유자는 읽었지만 그걸 권리 목록으로
  // 나열하지 않은" 상태다. rights 배열만 보면 이걸 "못 읽음"으로 오판해 STOP 을
  // 낸다. 같은 문서를 두 번 올렸을 때 판정이 갈리는 원인이었다.
  //
  // 그래서 ownerNames 가 채워져 있으면 "소유권 자체는 읽었다"고 인정한다.
  // rights 목록이 비어도 이 경우엔 gap finding 을 올리지 않는다 — 소유자 정보는
  // 이미 있으므로 정말로 못 읽은 것은 아니다.
  const gapSection = registry.rights.filter((r) => r.section === "gap");
  const ownerReadable = registry.ownerNames.length > 0;
  if (gapSection.length === 0 && !ownerReadable) {
    findings.push(
      gap(
        "RIGHTS_GAP_SECTION_EMPTY",
        "danger",
        "갑구(소유권)를 읽지 못했어요",
        "모든 등기부에는 소유권 기재가 있습니다. 갑구가 비어 있다는 것은 판독에 실패했다는 뜻입니다. " +
          "이 상태로는 소유자가 누구인지조차 확인할 수 없습니다.",
        "전체 페이지가 들어가도록 다시 올려주세요. 인터넷등기소에서 받은 PDF 원본이 가장 정확합니다.",
      ),
    );
  }

  // ── 값이 말이 되는지 ──────────────────────────────────────────────────
  const badAmounts: string[] = [];
  const badDates: string[] = [];
  const missingQuotes: string[] = [];

  for (const right of registry.rights) {
    const label = right.rankNo ? `${right.rankNo}번` : (right.note ?? "순위번호 미상");

    // 금액이 0 이하 — 채권최고액은 양수여야 한다.
    const amount = right.maxClaimKrw ?? null;
    if (amount !== null && amount <= 0) {
      badAmounts.push(label);
    }

    // 접수일자가 미래이거나 터무니없이 과거.
    if (right.registeredOn) {
      const year = Number(right.registeredOn.slice(0, 4));
      if (right.registeredOn > today || !Number.isFinite(year) || year < EARLIEST_PLAUSIBLE_YEAR) {
        badDates.push(`${label}(${right.registeredOn})`);
      }
    }

    // 근거(원문인용)가 없다 — 값을 어디서 읽었는지 댈 수 없다.
    // 근거를 못 대는 값은 못 믿는 값이다.
    if (!right.sourceQuote || right.sourceQuote.trim().length === 0) {
      missingQuotes.push(label);
    }
  }

  if (badAmounts.length > 0) {
    findings.push(
      gap(
        "RIGHTS_AMOUNT_IMPLAUSIBLE",
        "danger",
        "금액이 이상하게 읽힌 권리가 있어요",
        `${badAmounts.join(", ")}의 금액이 0 이하로 판독됐습니다. 채권최고액은 양수여야 하므로 ` +
          "판독 오류입니다. 이 금액을 빼고 계산했기 때문에 실제 위험은 표시된 것보다 클 수 있습니다.",
        "해당 부분이 선명하게 나오도록 다시 올려주세요.",
        { ranks: badAmounts },
      ),
    );
  }

  if (badDates.length > 0) {
    findings.push(
      gap(
        "RIGHTS_DATE_IMPLAUSIBLE",
        "caution",
        "접수일자가 이상하게 읽힌 권리가 있어요",
        `${badDates.join(", ")}의 접수일자가 미래이거나 있을 수 없는 날짜입니다. ` +
          "권리의 순위는 날짜로 정해지므로, 이 값이 틀리면 누가 먼저인지 판단할 수 없습니다.",
        "해당 부분을 다시 확인해 주세요.",
        { entries: badDates },
      ),
    );
  }

  if (missingQuotes.length > 0 && registry.rights.length > 0) {
    findings.push(
      gap(
        "RIGHTS_SOURCE_QUOTE_MISSING",
        "caution",
        "근거를 확인하지 못한 항목이 있어요",
        `${missingQuotes.length}건은 등기부의 어느 문장에서 읽었는지 확인하지 못했습니다. ` +
          "근거를 댈 수 없는 값은 그대로 믿기 어렵습니다.",
        "판정 결과의 해당 항목은 등기부 원본과 직접 대조해 주세요.",
        { count: missingQuotes.length, ranks: missingQuotes.slice(0, 10) },
      ),
    );
  }

  return findings;
}

/**
 * 말소사항이 포함된 등기부를 올렸을 때의 안내.
 *
 * 조용히 처리하면 안 된다 — 코드가 걸러냈다고 해도 사용자는 그 사실을 알아야 하고,
 * "현재 유효사항만"으로 다시 받는 편이 정확하다.
 */
export function cancelledEntriesNotice(rescuedByCode: string[]): Finding {
  const rescued = rescuedByCode.length > 0;
  return {
    code: "RIGHTS_INCLUDES_CANCELLED",
    category: "rights",
    kind: "info_gap",
    severity: "caution",
    // 이미 정리된 권리이므로 위험이 아니다. 점수에 넣지 않는다.
    weight: 0,
    title: "말소사항이 포함된 등기부예요",
    description:
      "이미 정리된(말소된) 권리가 함께 적힌 등기부입니다. 그 권리들을 빼고 계산했습니다." +
      (rescued
        ? ` 다만 ${rescuedByCode.join(", ")}번은 표시가 흐려 판독으로는 놓칠 뻔했고, 등기목적 문구를 보고 걸러냈습니다.`
        : ""),
    action:
      "정확도를 위해 인터넷등기소에서 **'현재 유효사항만'** 으로 다시 발급받아 올리는 것을 권합니다.",
    evidence: { rescuedByCode },
  };
}
