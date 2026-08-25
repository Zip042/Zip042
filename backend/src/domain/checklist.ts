/**
 * 계약 단계별 체크리스트.
 *
 * 프론트엔드 `/checklist` 화면이 쓴다. 검사 건(case) 없이도 열 수 있는 독립 화면이므로
 * 이 목록은 **특정 매물에 의존하지 않는 일반 지침**이다.
 *
 * ## `schedule.ts` 의 체크리스트와 무엇이 다른가
 *
 * 헷갈리기 쉬우니 분명히 해 둔다. 두 개는 다른 것이다.
 *
 *  - `schedule.ts` 의 `ScheduleChecklistItem` : **날짜가 계산된 뒤** 특정 일정 이벤트에
 *    딸려 나오는 할 일이다. "10월 2일 잔금일에 할 일" 처럼 계약 조건이 있어야 만들어진다.
 *  - 이 파일 : 계약 조건도 서류도 없이 **처음부터 끝까지 훑는 일반 체크리스트**다.
 *    집을 보러 다니는 단계부터 입주 후까지 4단계로 나눈다.
 *
 * 둘을 합치지 않는 이유는 생애주기가 다르기 때문이다. 일정 체크리스트는 재분석하면
 * 다시 계산되지만, 이 체크리스트는 사용자가 직접 체크한 상태를 **계속 들고 가야 한다**.
 *
 * 순수 데이터 + 순수 함수만 둔다 (`src/domain/*` 규칙).
 */

/** 프론트엔드 좌측 스텝 네비와 1:1 대응한다. 순서가 곧 계약 진행 순서다. */
export const CHECKLIST_STAGES = [
  { code: "before_visit", label: "집 보러 가기 전", order: 1 },
  { code: "contract_day", label: "계약 당일", order: 2 },
  { code: "balance_move_in", label: "잔금 · 입주", order: 3 },
  { code: "after_move_in", label: "입주 후", order: 4 },
] as const;

export type ChecklistStageCode = (typeof CHECKLIST_STAGES)[number]["code"];

export interface ChecklistItem {
  /** 체크 상태 저장의 키. **한 번 정하면 바꾸지 않는다** — 바꾸면 사용자의 체크가 풀린다. */
  id: string;
  stage: ChecklistStageCode;
  label: string;
  /** 왜 필요한지. 체크되지 않은 항목에만 보여주면 화면이 덜 시끄럽다. */
  note: string | null;
  /**
   * 빠뜨리면 보증금을 잃을 수 있는 항목.
   * "있으면 좋은 것"과 "안 하면 돈을 잃는 것"을 같은 무게로 두면 아무도 구분하지 않는다.
   */
  required: boolean;
  /** 관련 용어 코드 (`glossary.ts`). 항목에서 용어 설명으로 보낼 때 쓴다. */
  relatedTerms: string[];
}

export const CHECKLIST_ITEMS: ChecklistItem[] = [
  // 1 · 집 보러 가기 전 -------------------------------------------------------
  {
    id: "issued_registry",
    stage: "before_visit",
    label: "등기부등본을 직접 발급받았다",
    note: "중개인이 보여주는 사본은 날짜가 오래됐을 수 있습니다. 인터넷등기소에서 직접 떼세요.",
    required: true,
    relatedTerms: ["G_MORTGAGE", "G_MAX_CLAIM"],
  },
  {
    id: "price_compared",
    stage: "before_visit",
    label: "시세와 보증금을 비교했다",
    note: "채권최고액까지 더한 비율이 80%를 넘으면 재검토하세요.",
    required: true,
    relatedTerms: ["G_JEONSE_RATIO"],
  },
  {
    id: "owner_matches",
    stage: "before_visit",
    label: "등기부 소유자와 계약하려는 사람이 같은지 확인했다",
    note: "다르면 위임장·인감증명서를 확인해야 합니다. 신탁등기라면 수탁자 동의가 필요합니다.",
    required: true,
    relatedTerms: ["G_TRUST"],
  },
  {
    id: "broker_registered",
    stage: "before_visit",
    label: "중개사무소 등록번호를 조회했다",
    note: "국가공간정보포털이나 시·군·구청에서 등록 여부와 공제 가입을 확인할 수 있습니다.",
    required: false,
    relatedTerms: ["G_BROKERAGE_STATEMENT"],
  },
  {
    id: "prior_tenants",
    stage: "before_visit",
    label: "다가구주택이면 선순위 보증금 현황을 요구했다",
    note: "전입세대 열람과 확정일자 부여 현황. 안 보여주면 그 자체가 위험 신호입니다.",
    required: true,
    relatedTerms: ["G_MULTI_HOUSEHOLD"],
  },
  {
    id: "condition_checked",
    stage: "before_visit",
    label: "채광 · 수압 · 곰팡이 · 방음을 확인했다",
    note: null,
    required: false,
    relatedTerms: [],
  },
  {
    id: "fees_asked",
    stage: "before_visit",
    label: "관리비 항목과 공과금 부담 주체를 물었다",
    note: "관리비에 무엇이 포함되는지 계약서에 적어 두지 않으면 나중에 다툼이 생깁니다.",
    required: false,
    relatedTerms: [],
  },

  // 2 · 계약 당일 -------------------------------------------------------------
  {
    id: "registry_rechecked_contract",
    stage: "contract_day",
    label: "계약 당일 등기부를 다시 열람했다",
    note: "집 보러 간 날 이후에 근저당이 새로 잡혔을 수 있습니다.",
    required: true,
    relatedTerms: ["G_MORTGAGE"],
  },
  {
    id: "brokerage_statement_received",
    stage: "contract_day",
    label: "중개대상물 확인·설명서를 받고 서명을 확인했다",
    note: "중개사 서명·날인과 공제증서가 있어야 나중에 책임을 물을 수 있습니다.",
    required: true,
    relatedTerms: ["G_BROKERAGE_STATEMENT"],
  },
  {
    id: "special_terms_written",
    stage: "contract_day",
    label: "필요한 특약을 계약서에 적어 넣었다",
    note: "구두 약속은 증명하기 어렵습니다. 특약란에 적고 서명받으세요.",
    required: true,
    relatedTerms: ["G_SPECIAL_TERMS"],
  },
  {
    id: "identity_verified",
    stage: "contract_day",
    label: "임대인 신분증과 등기부 소유자를 대조했다",
    note: "대리인이라면 위임장과 인감증명서(발급 3개월 이내)를 함께 확인합니다.",
    required: true,
    relatedTerms: [],
  },
  {
    id: "deposit_to_owner_account",
    stage: "contract_day",
    label: "계약금을 등기부 소유자 명의 계좌로 보냈다",
    note: "가족·법인·중개사무소 계좌로 보내라는 요구는 거절하세요.",
    required: true,
    relatedTerms: [],
  },

  // 3 · 잔금 · 입주 -----------------------------------------------------------
  {
    id: "registry_rechecked_balance",
    stage: "balance_move_in",
    label: "잔금 지급 **직전에** 등기부를 다시 열람했다",
    note: "계약일과 잔금일 사이에 근저당이 새로 설정되거나 소유자가 바뀔 수 있습니다.",
    required: true,
    relatedTerms: ["G_MORTGAGE"],
  },
  {
    id: "balance_to_owner_account",
    stage: "balance_move_in",
    label: "잔금을 등기부 소유자 명의 계좌로 보냈다",
    note: null,
    required: true,
    relatedTerms: [],
  },
  {
    id: "move_in_registered",
    stage: "balance_move_in",
    label: "잔금 당일에 전입신고를 했다",
    note: "대항력은 신고 다음 날 0시부터 생깁니다. 하루라도 미루면 그만큼 무방비입니다.",
    required: true,
    relatedTerms: ["G_OPPOSING_POWER"],
  },
  {
    id: "fixed_date_received",
    stage: "balance_move_in",
    label: "잔금 당일에 확정일자를 받았다",
    note: "전입신고와 함께 처리하세요. 우선변제권의 기준 날짜가 됩니다.",
    required: true,
    relatedTerms: ["G_FIXED_DATE"],
  },
  {
    id: "move_in_photos",
    stage: "balance_move_in",
    label: "입주 전 상태를 사진으로 남겼다",
    note: "퇴거할 때 원상복구 범위로 다투지 않으려면 증거가 필요합니다.",
    required: false,
    relatedTerms: [],
  },

  // 4 · 입주 후 ---------------------------------------------------------------
  {
    id: "guarantee_insurance",
    stage: "after_move_in",
    label: "보증금 반환보증에 가입했다",
    note: "HUG·HF·SGI. 가입 요건과 기한이 있으니 입주 직후에 확인하세요.",
    required: false,
    relatedTerms: [],
  },
  {
    id: "registry_after_protection",
    stage: "after_move_in",
    label: "대항력이 생긴 다음 날 등기부를 한 번 더 확인했다",
    note: "잔금일에 근저당이 잡혔다면 순위가 밀립니다. 이때 확인해야 대응할 시간이 있습니다.",
    required: true,
    relatedTerms: ["G_OPPOSING_POWER"],
  },
  {
    id: "contract_stored",
    stage: "after_move_in",
    label: "계약서 원본과 확정일자를 안전하게 보관했다",
    note: "분실하면 보증이행 청구와 소송에서 증명이 어려워집니다.",
    required: false,
    relatedTerms: [],
  },
  {
    id: "renewal_notice_planned",
    stage: "after_move_in",
    label: "계약 만료 6~2개월 전 통지 기한을 달력에 적어 두었다",
    note: "이 기간에 통지하지 않으면 같은 조건으로 자동 갱신됩니다.",
    required: false,
    relatedTerms: [],
  },
];

// ---------------------------------------------------------------------------
// 조회 · 진행률 (순수 함수)
// ---------------------------------------------------------------------------

export interface ChecklistStageView {
  code: ChecklistStageCode;
  label: string;
  order: number;
  items: ChecklistItem[];
}

/** 단계별로 묶어서 돌려준다. 프론트엔드 좌측 네비 + 우측 목록 구조에 그대로 맞는다. */
export function buildChecklistTemplate(): ChecklistStageView[] {
  return CHECKLIST_STAGES.map((stage) => ({
    code: stage.code,
    label: stage.label,
    order: stage.order,
    items: CHECKLIST_ITEMS.filter((item) => item.stage === stage.code),
  }));
}

export interface ChecklistProgress {
  total: number;
  done: number;
  /** 필수 항목만 따로 센다. 전체 진행률만 보여주면 필수를 빠뜨린 채 90%가 될 수 있다. */
  requiredTotal: number;
  requiredDone: number;
  /** 아직 체크되지 않은 필수 항목. 사용자에게 무엇이 남았는지 정확히 알려준다. */
  missingRequired: { id: string; stage: ChecklistStageCode; label: string }[];
  byStage: { code: ChecklistStageCode; label: string; total: number; done: number }[];
}

/**
 * 체크 상태로 진행률을 계산한다.
 *
 * 알 수 없는 id(옛 버전에서 저장된 항목 등)는 **조용히 무시한다**. 항목이 지워졌다고
 * 사용자의 진행률이 100%를 넘거나 오류가 나면 안 되기 때문이다.
 */
export function computeChecklistProgress(checkedIds: readonly string[]): ChecklistProgress {
  const known = new Set(CHECKLIST_ITEMS.map((i) => i.id));
  const checked = new Set(checkedIds.filter((id) => known.has(id)));

  const required = CHECKLIST_ITEMS.filter((i) => i.required);

  return {
    total: CHECKLIST_ITEMS.length,
    done: CHECKLIST_ITEMS.filter((i) => checked.has(i.id)).length,
    requiredTotal: required.length,
    requiredDone: required.filter((i) => checked.has(i.id)).length,
    missingRequired: required
      .filter((i) => !checked.has(i.id))
      .map((i) => ({ id: i.id, stage: i.stage, label: i.label })),
    byStage: CHECKLIST_STAGES.map((stage) => {
      const items = CHECKLIST_ITEMS.filter((i) => i.stage === stage.code);
      return {
        code: stage.code,
        label: stage.label,
        total: items.length,
        done: items.filter((i) => checked.has(i.id)).length,
      };
    }),
  };
}

/** 저장 전에 알 수 없는 id 를 걸러낸다. 클라이언트가 보낸 값을 그대로 믿지 않는다. */
export function sanitizeCheckedIds(ids: readonly string[]): string[] {
  const known = new Set(CHECKLIST_ITEMS.map((i) => i.id));
  // 중복도 함께 제거한다 — 저장은 집합이지 목록이 아니다.
  return [...new Set(ids.filter((id) => known.has(id)))].sort();
}
