import {
  addDays,
  addMonths,
  diffDays,
  formatKo,
  isAfter,
  isBusinessDay,
  isWeekend,
  kstInstant,
  maxDate,
  nextBusinessDay,
  previousBusinessDay,
  type DateOnly,
} from "../lib/date.js";
import { maxRisk, type Finding, type RiskLevel } from "./types.js";

/**
 * 일정 가공 엔진 — 프론트엔드가 받은 날짜 3개(계약일 · 잔금 예정일 · 전입신고 예정일)를
 * **법적 효력이 언제 생기는지**로 변환한다. 서비스의 핵심 가공 로직.
 *
 * 근거 법령
 *  · 주택임대차보호법 제3조 ①  : 주택의 인도 + 주민등록을 마치면 **그 다음 날부터** 제3자에 대해 효력(대항력)
 *  · 주택임대차보호법 제3조의2 ②: 대항력 요건 + 계약증서상 확정일자 → 우선변제권
 *  · 주택임대차보호법 제6조     : 만료 6개월 ~ 2개월 전 사이에 갱신거절 통지가 없으면 묵시적 갱신
 *  · 주택임대차보호법 제6조의3  : 임차인의 계약갱신요구권도 만료 6개월 ~ 2개월 전
 *  · 주택임대차보호법 제4조 ①  : 기간을 정하지 않거나 2년 미만으로 정한 임대차는 2년으로 봄
 *  · 주민등록법 제11조         : 전입한 날부터 14일 이내 신고 의무
 *
 * ⚠️ 법 조문은 개정될 수 있다. 아래 상수는 한 곳에 모아두었으니 개정 시 여기만 고친다.
 */

/** 대항력 발생까지 걸리는 일수. 주택임대차보호법 제3조 ① "그 다음 날". */
const OPPOSING_POWER_DELAY_DAYS = 1;
/** 주민등록법상 전입신고 기한 */
const RESIDENT_REGISTRATION_DEADLINE_DAYS = 14;
/** 갱신거절 통지 기간 (만료 전 개월 수) */
const RENEWAL_NOTICE_MONTHS = { open: 6, close: 2 } as const;
/** 주택임대차보호법 제4조 ① 최소 보장 기간 */
const MINIMUM_PROTECTED_TERM_MONTHS = 24;

export interface ScheduleInput {
  contractDate: DateOnly | null;
  balanceDate: DateOnly | null;
  /** 실제 입주(점유 개시)일. 비우면 잔금일과 동일하게 본다. */
  moveInDate?: DateOnly | null;
  residentRegistrationDate?: DateOnly | null;
  /** 확정일자 신청 예정일. 비우면 계약일 당일에 받는 것으로 본다. */
  confirmedDatePlan?: DateOnly | null;
  contractTermMonths: number;
  holidays: ReadonlySet<DateOnly>;
  today: DateOnly;
}

export interface ScheduleChecklistItem {
  label: string;
  /** 이 항목을 빠뜨리면 어떤 일이 생기는지 */
  why?: string;
  critical: boolean;
}

export interface ScheduleEvent {
  code: string;
  date: DateOnly;
  /** 법적 효력이 특정 시각에 발생하는 경우 (대항력: 다음날 0시) */
  effectiveAt?: string | null;
  severity: RiskLevel;
  title: string;
  description: string;
  checklist: ScheduleChecklistItem[];
  /** 오늘 기준 D-day. 음수면 이미 지난 일정. */
  dDay: number | null;
  sortOrder: number;
}

export interface ScheduleResult {
  evaluable: boolean;
  level: RiskLevel;
  normalized: {
    contractDate: DateOnly | null;
    balanceDate: DateOnly | null;
    moveInDate: DateOnly | null;
    residentRegistrationDate: DateOnly | null;
    confirmedDate: DateOnly | null;
    termStart: DateOnly | null;
    termEnd: DateOnly | null;
    /** 주임법 제4조에 따라 임차인이 주장할 수 있는 최소 만료일 */
    protectedTermEnd: DateOnly | null;
  };
  /** 대항력 발생 시점 (ISO 8601, KST 기준 다음날 0시) */
  opposingPowerEffectiveAt: string | null;
  /** 우선변제권 발생 시점 */
  priorityRightEffectiveAt: string | null;
  /**
   * 잔금을 냈지만 아직 법적 보호를 못 받는 구간.
   * 이 구간에 임대인이 대출을 받아 근저당을 설정하면 그 은행이 내 보증금보다 앞선다.
   */
  unprotectedWindow: { fromDate: DateOnly; toDate: DateOnly; days: number } | null;
  recommended: {
    /** 확정일자는 계약서 작성 당일(업무일) 받는 것이 가장 안전 */
    confirmedDateOn: DateOnly | null;
    /** 전입신고는 늦어도 잔금일 당일 */
    residentRegistrationOn: DateOnly | null;
    /** 등기부등본을 다시 떼어봐야 하는 날짜들 */
    registryRecheckOn: DateOnly[];
    residentRegistrationDeadline: DateOnly | null;
  };
  renewalNoticeWindow: { from: DateOnly; to: DateOnly } | null;
  events: ScheduleEvent[];
  findings: Finding[];
}

function dDayOf(target: DateOnly, today: DateOnly): number {
  return diffDays(today, target);
}

function emptyResult(findings: Finding[]): ScheduleResult {
  return {
    evaluable: false,
    level: findings.length ? maxRisk(...findings.map((f) => f.severity)) : "caution",
    normalized: {
      contractDate: null,
      balanceDate: null,
      moveInDate: null,
      residentRegistrationDate: null,
      confirmedDate: null,
      termStart: null,
      termEnd: null,
      protectedTermEnd: null,
    },
    opposingPowerEffectiveAt: null,
    priorityRightEffectiveAt: null,
    unprotectedWindow: null,
    recommended: {
      confirmedDateOn: null,
      residentRegistrationOn: null,
      registryRecheckOn: [],
      residentRegistrationDeadline: null,
    },
    renewalNoticeWindow: null,
    events: [],
    findings,
  };
}

export function buildSchedule(input: ScheduleInput): ScheduleResult {
  const { holidays, today } = input;
  const findings: Finding[] = [];

  if (!input.contractDate || !input.balanceDate) {
    findings.push({
      code: "SCH_DATES_MISSING",
      category: "schedule",
      kind: "info_gap",
      severity: "caution",
      weight: 8,
      title: "계약일과 잔금일을 입력해 주세요",
      description:
        "보증금을 지키는 핵심은 '언제 전입신고와 확정일자를 하느냐'입니다. 날짜가 없으면 " +
        "언제부터 법적으로 보호받는지 계산할 수 없어요.",
      action: "계약 예정일과 잔금 예정일을 입력하면 날짜별 체크리스트를 만들어 드립니다.",
    });
    return emptyResult(findings);
  }

  const contractDate = input.contractDate;
  const balanceDate = input.balanceDate;
  // 입주일을 비워두면 잔금일에 들어가는 것으로 본다 (원룸 계약의 일반적 형태).
  const moveInDate = input.moveInDate ?? balanceDate;
  // 전입신고 예정일을 비워두면 "잔금일 당일"을 기본값으로 잡는다 — 권장 시나리오.
  const residentRegistrationDate = input.residentRegistrationDate ?? balanceDate;
  const confirmedDate = input.confirmedDatePlan ?? contractDate;

  if (isAfter(contractDate, balanceDate)) {
    findings.push({
      code: "SCH_ORDER_INVALID",
      category: "schedule",
      severity: "critical",
      weight: 15,
      title: "잔금일이 계약일보다 빨라요",
      description: `계약일(${formatKo(contractDate)})이 잔금일(${formatKo(balanceDate)})보다 늦게 입력되어 있습니다.`,
      action: "날짜를 다시 확인해 주세요.",
      evidence: { contractDate, balanceDate },
    });
  }

  // --- 법적 효력 시점 계산 -------------------------------------------------
  // 대항력: 인도(점유)와 주민등록을 **둘 다** 마친 날의 다음 날 0시.
  const opposingPowerBaseDate = maxDate(moveInDate, residentRegistrationDate);
  const opposingPowerDate = addDays(opposingPowerBaseDate, OPPOSING_POWER_DELAY_DAYS);
  const opposingPowerEffectiveAt = kstInstant(opposingPowerDate).toISOString();

  // 우선변제권: 대항력 요건 + 확정일자. 둘 중 늦은 시점에 발생한다.
  // 확정일자를 계약일에 미리 받아두면 대항력 발생과 동시에 우선변제권도 생긴다.
  const priorityRightDate = maxDate(opposingPowerDate, confirmedDate);
  const priorityRightEffectiveAt = kstInstant(priorityRightDate).toISOString();

  // 무방비 구간: 잔금을 낸 시점 ~ 대항력 발생 전.
  const unprotectedDays = Math.max(0, diffDays(balanceDate, opposingPowerDate));
  const unprotectedWindow =
    unprotectedDays > 0
      ? { fromDate: balanceDate, toDate: addDays(opposingPowerDate, -1), days: unprotectedDays }
      : null;

  // --- 권장 일정 ----------------------------------------------------------
  // 확정일자는 등기소·주민센터 업무일에만 처리되므로 계약일이 휴일이면 다음 업무일.
  const recommendedConfirmedDate = nextBusinessDay(contractDate, holidays);
  // 전입신고는 늦어도 잔금일. 잔금일이 휴일이면 그 이전 업무일에는 아직 점유가 없으니
  // 잔금일 이후 첫 업무일이 현실적인 최선이다.
  const recommendedRegistrationDate = isBusinessDay(balanceDate, holidays)
    ? balanceDate
    : nextBusinessDay(balanceDate, holidays);
  const registrationDeadline = addDays(moveInDate, RESIDENT_REGISTRATION_DEADLINE_DAYS);

  const registryRecheckOn = [
    // 계약일에 한 번 (계약금 송금 직전)
    contractDate,
    // 잔금일 당일 아침에 한 번 — 계약 후 새 근저당이 붙었는지 확인
    balanceDate,
    // 대항력 발생 다음 날 한 번 — 잔금일에 몰래 설정된 근저당이 있는지 확인
    addDays(opposingPowerDate, 1),
  ].filter((d, i, arr) => arr.indexOf(d) === i);

  // --- 계약 기간 ----------------------------------------------------------
  const termStart = moveInDate;
  const termEnd = addDays(addMonths(termStart, input.contractTermMonths), -1);
  const protectedTermEnd = addDays(addMonths(termStart, MINIMUM_PROTECTED_TERM_MONTHS), -1);
  const renewalNoticeWindow = {
    from: addMonths(termEnd, -RENEWAL_NOTICE_MONTHS.open),
    to: addMonths(termEnd, -RENEWAL_NOTICE_MONTHS.close),
  };

  // --- 위험 판정 ----------------------------------------------------------

  // (1) 구조적 위험: 잔금일 당일에는 반드시 무방비 구간이 최소 1일 생긴다.
  //     은행 근저당은 접수 당일 0시로 소급하는 반면, 임차인 대항력은 다음날 0시에 생기기 때문.
  findings.push({
    code: "SCH_SAME_DAY_MORTGAGE_GAP",
    category: "schedule",
    severity: unprotectedDays > 1 ? "danger" : "caution",
    weight: unprotectedDays > 1 ? 18 : 4,
    title:
      unprotectedDays <= 1
        ? "잔금 낸 날 하루는 법적으로 보호받지 못해요"
        : `잔금 낸 뒤 ${unprotectedDays}일 동안 법적으로 보호받지 못해요`,
    description:
      `전입신고를 해도 보호(대항력)는 그 **다음 날 0시**부터 시작됩니다. 반면 은행 근저당은 ` +
      `접수한 날 바로 효력이 생겨요. 그래서 ${formatKo(balanceDate)}부터 ` +
      `${formatKo(addDays(opposingPowerDate, -1))}까지 ${unprotectedDays}일은, 임대인이 이 집을 담보로 ` +
      "대출을 받으면 은행이 내 보증금보다 앞서게 됩니다.",
    action:
      "① 잔금일 다음 날 이후에 새로 설정된 담보는 임대인 책임이라는 특약을 넣으세요. " +
      "② 잔금일 당일 오전에 등기부등본을 다시 떼어 확인한 뒤 잔금을 보내세요. " +
      "③ 전입신고는 잔금 보내는 날 바로 하세요.",
    evidence: {
      balanceDate,
      opposingPowerDate,
      unprotectedDays,
      opposingPowerEffectiveAt,
    },
    suggestTerms: [
      "TERM_NO_NEW_ENCUMBRANCE",
      "TERM_REGISTRY_STATE_AT_BALANCE",
      "TERM_CONTRACT_VOID_ON_RIGHTS_CHANGE",
    ],
  });

  // (2) 전입신고를 잔금일보다 늦게 잡은 경우
  const registrationGap = diffDays(balanceDate, residentRegistrationDate);
  if (registrationGap > 0) {
    const severity: RiskLevel = registrationGap >= 4 ? "critical" : registrationGap >= 2 ? "danger" : "caution";
    findings.push({
      code: "SCH_REGISTRATION_DELAYED",
      category: "schedule",
      severity,
      weight: registrationGap >= 4 ? 30 : registrationGap >= 2 ? 20 : 10,
      title: `전입신고가 잔금일보다 ${registrationGap}일 늦어요`,
      description:
        `${formatKo(balanceDate)}에 잔금을 다 내는데 전입신고는 ${formatKo(residentRegistrationDate)}에 ` +
        `하기로 되어 있습니다. 그 사이 ${registrationGap + 1}일 동안은 보증금을 지킬 법적 근거가 전혀 없어요. ` +
        "실제 전세사기 상당수가 바로 이 틈에서 발생합니다.",
      action: "전입신고를 잔금 보내는 날로 옮기세요. 하루라도 미루면 안 됩니다.",
      evidence: { balanceDate, residentRegistrationDate, registrationGap },
      suggestTerms: ["TERM_NO_NEW_ENCUMBRANCE"],
    });
  }

  // (3) 주민등록법상 14일 기한 초과
  if (isAfter(residentRegistrationDate, registrationDeadline)) {
    findings.push({
      code: "SCH_REGISTRATION_PAST_LEGAL_DEADLINE",
      category: "schedule",
      severity: "danger",
      weight: 12,
      title: "전입신고 법정 기한(14일)을 넘겼어요",
      description:
        `주민등록법에 따라 이사한 날(${formatKo(moveInDate)})부터 14일 안에 전입신고를 해야 합니다. ` +
        `입력한 날짜(${formatKo(residentRegistrationDate)})는 기한(${formatKo(registrationDeadline)})을 넘겨 ` +
        "과태료 대상이고, 그동안 보증금도 보호받지 못합니다.",
      action: `늦어도 ${formatKo(registrationDeadline)}까지, 가능하면 잔금일 당일에 신고하세요.`,
      evidence: { moveInDate, residentRegistrationDate, registrationDeadline },
    });
  }

  // (4) 잔금일이 휴일 → 전입신고·확정일자 당일 처리 불가
  if (!isBusinessDay(balanceDate, holidays)) {
    const reason = isWeekend(balanceDate) ? "주말" : "공휴일";
    const nextOpen = nextBusinessDay(balanceDate, holidays);
    findings.push({
      code: "SCH_BALANCE_ON_NON_BUSINESS_DAY",
      category: "schedule",
      severity: "danger",
      weight: 18,
      title: `잔금일이 ${reason}이에요`,
      description:
        `${formatKo(balanceDate)}은 ${reason}이라 주민센터와 등기소가 문을 닫습니다. 잔금은 계좌이체로 ` +
        `보낼 수 있지만 전입신고·확정일자는 ${formatKo(nextOpen)}에야 처리되고, 보호는 그 다음 날부터 ` +
        "시작돼요. 그 사이 며칠이 무방비 상태가 됩니다.",
      action:
        `잔금일을 업무일로 옮기는 것이 가장 안전합니다. 옮길 수 없다면 정부24 온라인 전입신고를 ` +
        `${formatKo(balanceDate)}에 미리 접수하고, 확정일자는 계약일에 이미 받아두세요.`,
      evidence: { balanceDate, reason, nextBusinessDay: nextOpen },
      suggestTerms: ["TERM_NO_NEW_ENCUMBRANCE", "TERM_REGISTRY_STATE_AT_BALANCE"],
    });
  }

  // (5) 확정일자를 잔금일 이후로 미룬 경우
  if (isAfter(confirmedDate, balanceDate)) {
    findings.push({
      code: "SCH_CONFIRMED_DATE_LATE",
      category: "schedule",
      severity: "danger",
      weight: 15,
      title: "확정일자를 너무 늦게 받으려 해요",
      description:
        `확정일자 예정일(${formatKo(confirmedDate)})이 잔금일(${formatKo(balanceDate)})보다 늦습니다. ` +
        "확정일자는 계약서만 있으면 계약 당일에도 받을 수 있고, 미리 받아두면 대항력이 생기는 순간 " +
        "우선변제권도 함께 생깁니다. 늦게 받으면 그만큼 순위가 밀려요.",
      action: `계약서에 서명한 당일(${formatKo(recommendedConfirmedDate)})에 확정일자를 받으세요. 인터넷등기소에서도 가능합니다.`,
      evidence: { confirmedDate, balanceDate, recommendedConfirmedDate },
    });
  }

  // (6) 입주가 잔금보다 빠른 경우 — 잔금 전 점유는 분쟁 소지
  if (isAfter(balanceDate, moveInDate)) {
    findings.push({
      code: "SCH_MOVE_IN_BEFORE_BALANCE",
      category: "schedule",
      severity: "caution",
      weight: 5,
      title: "잔금을 내기 전에 먼저 입주해요",
      description:
        `입주일(${formatKo(moveInDate)})이 잔금일(${formatKo(balanceDate)})보다 빠릅니다. 잔금 전 점유는 ` +
        "임대인과 분쟁이 생겼을 때 불리하게 작용할 수 있어요.",
      action: "미리 입주해야 한다면 '잔금 지급 전 인도'를 계약서 특약으로 명시하세요.",
      evidence: { moveInDate, balanceDate },
    });
  }

  // (7) 계약 기간이 2년 미만
  if (input.contractTermMonths < MINIMUM_PROTECTED_TERM_MONTHS) {
    findings.push({
      code: "SCH_TERM_UNDER_TWO_YEARS",
      category: "schedule",
      severity: "safe",
      weight: 0,
      title: `계약 기간이 ${input.contractTermMonths}개월이지만 2년까지 살 수 있어요`,
      description:
        "주택임대차보호법은 2년 미만으로 계약해도 임차인이 2년을 주장할 수 있게 정하고 있습니다. " +
        `즉 ${formatKo(protectedTermEnd)}까지는 임차인이 원하면 거주할 수 있어요. (임대인은 주장 불가)`,
      action: "짧은 기간으로 계약하더라도 불리하지 않으니 안심하세요.",
      evidence: { contractTermMonths: input.contractTermMonths, protectedTermEnd },
    });
  }

  // (8) 이미 지나간 일정
  if (isAfter(today, balanceDate)) {
    findings.push({
      code: "SCH_BALANCE_DATE_PASSED",
      category: "schedule",
      severity: "caution",
      weight: 0,
      title: "잔금일이 이미 지났어요",
      description:
        `입력된 잔금일(${formatKo(balanceDate)})이 오늘(${formatKo(today)})보다 과거입니다. ` +
        "이미 계약을 마친 뒤 점검하는 경우라면, 지금 등기부등본을 다시 떼어 새로 생긴 권리가 없는지 확인하세요.",
      action: "지금 바로 등기부등본을 재열람하고, 전입신고·확정일자가 실제로 처리됐는지 확인하세요.",
      evidence: { balanceDate, today },
    });
  }

  // --- 타임라인 이벤트 ----------------------------------------------------
  const events: ScheduleEvent[] = [];
  let order = 0;
  const push = (e: Omit<ScheduleEvent, "dDay" | "sortOrder">) => {
    events.push({ ...e, dDay: dDayOf(e.date, today), sortOrder: order++ });
  };

  push({
    code: "CONTRACT_DAY",
    date: contractDate,
    severity: "safe",
    title: "계약서 작성 · 계약금 지급",
    description: "계약서에 서명하고 계약금을 보내는 날입니다. 이날 확인한 것이 이후 모든 판단의 기준이 됩니다.",
    checklist: [
      {
        label: "등기부등본을 당일 발급해 소유자 이름과 계약서 임대인 이름이 같은지 확인",
        why: "소유자가 아닌 사람과 계약하면 계약 자체가 무효가 될 수 있어요.",
        critical: true,
      },
      {
        label: "임대인 신분증 원본과 등기부 소유자 이름·생년월일 대조",
        why: "대리인이라면 인감증명서가 첨부된 위임장을 반드시 확인해야 합니다.",
        critical: true,
      },
      {
        label: "계약금은 반드시 등기부상 소유자 본인 계좌로 이체",
        why: "중개사나 제3자 계좌로 보내면 돌려받기 어려워집니다.",
        critical: true,
      },
      { label: "중개대상물 확인·설명서를 받고 중개사 서명·날인 확인", critical: true },
      { label: "특약사항을 계약서에 직접 적어 넣고 양쪽 서명", critical: true },
    ],
  });

  push({
    code: "CONFIRMED_DATE",
    date: recommendedConfirmedDate,
    severity: isAfter(confirmedDate, balanceDate) ? "danger" : "safe",
    title: "확정일자 받기",
    description:
      "계약서에 확정일자 도장을 받는 날입니다. 계약 당일에 바로 받는 것이 가장 안전하고, " +
      "인터넷등기소에서도 신청할 수 있어요. (수수료 600원 수준)",
    checklist: [
      { label: "주민센터 또는 인터넷등기소에서 확정일자 신청", critical: true },
      { label: "확정일자가 찍힌 계약서를 사진으로 백업", critical: false },
      {
        label: "전세보증금 반환보증에 가입할 계획이면 필요 서류를 미리 확인",
        why: "보증 가입은 보통 잔금일로부터 일정 기간 안에만 가능합니다.",
        critical: false,
      },
    ],
  });

  push({
    code: "REGISTRY_RECHECK_BEFORE_BALANCE",
    date: balanceDate,
    severity: "caution",
    title: "잔금 보내기 직전 등기부등본 재확인",
    description:
      "계약일과 잔금일 사이에 임대인이 대출을 받거나 소유권이 넘어갔을 수 있습니다. " +
      "잔금을 보내기 **전에** 반드시 당일 발급본으로 다시 확인하세요.",
    checklist: [
      { label: "잔금 송금 전 등기부등본 당일 발급 (인터넷등기소, 700원)", critical: true },
      { label: "계약일 대비 새로 생긴 근저당·가압류·소유권 변동이 없는지 대조", critical: true },
      {
        label: "변동이 있으면 잔금을 보내지 말고 즉시 중개사·임대인에게 확인",
        why: "잔금을 보낸 뒤에는 되돌리기 어렵습니다.",
        critical: true,
      },
    ],
  });

  push({
    code: "BALANCE_DAY",
    date: balanceDate,
    severity: isBusinessDay(balanceDate, holidays) ? "safe" : "danger",
    title: "잔금 지급 · 입주 · 전입신고",
    description:
      "하루 안에 잔금 지급 → 열쇠 수령(점유) → 전입신고를 모두 끝내야 합니다. " +
      "이 세 가지가 같은 날 끝나야 다음 날 0시부터 보호가 시작됩니다.",
    checklist: [
      { label: "잔금은 등기부상 소유자 본인 계좌로 이체하고 이체 확인증 보관", critical: true },
      { label: "열쇠·현관 비밀번호를 받아 실제 점유 시작", critical: true },
      { label: "주민센터 방문 또는 정부24로 전입신고 (당일!)", critical: true },
      { label: "관리비·공과금 정산 내역 확인", critical: false },
      { label: "집 상태(누수·곰팡이·설비)를 사진·영상으로 기록", why: "퇴거 시 원상복구 분쟁을 막습니다.", critical: false },
    ],
  });

  if (registrationGap > 0) {
    push({
      code: "RESIDENT_REGISTRATION",
      date: residentRegistrationDate,
      severity: registrationGap >= 2 ? "critical" : "danger",
      title: "전입신고 (권장일보다 늦음)",
      description:
        `입력된 전입신고 예정일입니다. 잔금일보다 ${registrationGap}일 늦어 그동안 보증금이 보호되지 않습니다.`,
      checklist: [{ label: "가능하면 잔금일로 앞당기기", critical: true }],
    });
  }

  push({
    code: "PROTECTION_EFFECTIVE",
    date: opposingPowerDate,
    effectiveAt: opposingPowerEffectiveAt,
    severity: "safe",
    title: "대항력 발생 (이 날 0시부터 보호 시작)",
    description:
      `${formatKo(opposingPowerBaseDate)}에 점유와 전입신고를 마쳤으므로, ` +
      `${formatKo(opposingPowerDate)} 0시부터 집이 팔리거나 경매로 넘어가도 계약 기간 동안 살 권리가 생깁니다. ` +
      (diffDays(priorityRightDate, opposingPowerDate) === 0
        ? "확정일자도 미리 받아두었다면 같은 시점에 우선변제권(보증금을 먼저 받을 권리)도 생깁니다."
        : `우선변제권은 확정일자를 받은 ${formatKo(priorityRightDate)}에 생깁니다.`),
    checklist: [
      { label: "전입신고가 실제 처리됐는지 주민등록초본으로 확인", critical: true },
      { label: "확정일자가 계약서에 찍혔는지 확인", critical: true },
    ],
  });

  push({
    code: "REGISTRY_RECHECK_AFTER_PROTECTION",
    date: addDays(opposingPowerDate, 1),
    severity: "caution",
    title: "보호 시작 후 등기부등본 최종 확인",
    description:
      "잔금일에 임대인이 몰래 대출을 받았다면 이때 등기부에 나타납니다. " +
      "여기서 문제가 발견되면 특약을 근거로 계약 해제·손해배상을 요구할 수 있으므로 반드시 확인하세요.",
    checklist: [
      { label: "등기부등본 발급 후 잔금일 이후 새로 설정된 권리 확인", critical: true },
      { label: "문제 발견 시 즉시 내용증명 발송 및 중개사 통보", critical: true },
    ],
  });

  push({
    code: "RESIDENT_REGISTRATION_DEADLINE",
    date: registrationDeadline,
    severity: "safe",
    title: "전입신고 법정 기한",
    description: `주민등록법상 이사한 날부터 14일 이내(${formatKo(registrationDeadline)})에 전입신고를 해야 합니다. 이 기한을 넘기면 과태료가 부과됩니다.`,
    checklist: [{ label: "아직 신고하지 않았다면 즉시 신고", critical: true }],
  });

  push({
    code: "RENEWAL_NOTICE_WINDOW_OPEN",
    date: renewalNoticeWindow.from,
    severity: "safe",
    title: "계약 갱신 · 이사 결정 시작 시점",
    description:
      `계약 만료 6개월 전입니다. 이 날부터 만료 2개월 전(${formatKo(renewalNoticeWindow.to)})까지가 ` +
      "갱신 요구 또는 갱신 거절을 통지하는 법정 기간이에요.",
    checklist: [
      { label: "계속 살 거라면 계약갱신요구권 행사 (문자·내용증명으로 기록 남기기)", critical: false },
      { label: "나갈 거라면 임대인에게 갱신 거절 의사를 명확히 통지", critical: true },
      { label: "등기부등본을 다시 떼어 그동안 권리 변동이 없었는지 확인", critical: false },
    ],
  });

  push({
    code: "RENEWAL_NOTICE_WINDOW_CLOSE",
    date: renewalNoticeWindow.to,
    severity: "caution",
    title: "갱신 통지 마감",
    description:
      "만료 2개월 전까지 아무 통지가 없으면 같은 조건으로 계약이 자동 연장(묵시적 갱신)됩니다. " +
      "이사 계획이 있으면 이 날까지 반드시 통지해야 보증금을 제때 돌려받을 수 있어요.",
    checklist: [{ label: "통지 여부와 통지 방법(증거) 확인", critical: true }],
  });

  push({
    code: "TERM_END",
    date: termEnd,
    severity: "safe",
    title: "계약 만료 · 보증금 반환",
    description:
      `계약 만료일입니다. 보증금을 돌려받지 못하면 임차권등기명령을 신청한 뒤 이사해야 대항력이 유지됩니다. ` +
      (input.contractTermMonths < MINIMUM_PROTECTED_TERM_MONTHS
        ? `참고로 임차인은 ${formatKo(protectedTermEnd)}까지 거주를 주장할 수 있습니다.`
        : ""),
    checklist: [
      { label: "만료 1개월 전 보증금 반환 계좌·일정 확정", critical: false },
      {
        label: "보증금을 못 받으면 이사 전에 임차권등기명령 신청",
        why: "먼저 이사해서 전출하면 대항력과 우선변제권을 잃습니다.",
        critical: true,
      },
    ],
  });

  const level = maxRisk(...findings.map((f) => f.severity));

  return {
    evaluable: true,
    level,
    normalized: {
      contractDate,
      balanceDate,
      moveInDate,
      residentRegistrationDate,
      confirmedDate,
      termStart,
      termEnd,
      protectedTermEnd,
    },
    opposingPowerEffectiveAt,
    priorityRightEffectiveAt,
    unprotectedWindow,
    recommended: {
      confirmedDateOn: recommendedConfirmedDate,
      residentRegistrationOn: recommendedRegistrationDate,
      registryRecheckOn: registryRecheckOn,
      residentRegistrationDeadline: registrationDeadline,
    },
    renewalNoticeWindow,
    events: events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.sortOrder - b.sortOrder)),
    findings,
  };
}

/** 잔금일을 업무일로 옮기고 싶을 때 제안할 대안 날짜. */
export function suggestBusinessDayAlternatives(
  balanceDate: DateOnly,
  holidays: ReadonlySet<DateOnly>,
): { earlier: DateOnly; later: DateOnly } {
  return {
    earlier: previousBusinessDay(balanceDate, holidays),
    later: nextBusinessDay(balanceDate, holidays),
  };
}
