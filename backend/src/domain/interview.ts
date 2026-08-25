import type { Finding } from "./types.js";

/**
 * 대화형 후속 질문 (기획서 2 ④).
 *
 * 서류만으로는 알 수 없는 것들이 있다 — 임대인을 직접 만났는지, 전입신고를 하지 말라고 했는지,
 * 관리비 설명을 들었는지. 전세사기의 결정적 신호는 오히려 이런 대화에서 드러난다.
 *
 * 구조
 *  - 질문은 `when` 조건이 참일 때만 노출한다 (전부 물어보면 사용자가 이탈한다).
 *  - 답변은 (a) 추가 특약 코드 또는 (b) 추가 finding 으로 변환된다.
 *  - 질문 · 조건 · 변환이 모두 순수 함수여서 테스트 가능하다.
 */

export interface InterviewContext {
  isMultiHousehold: boolean;
  burdenRatio: number | null;
  hasMortgage: boolean;
  hasTrust: boolean;
  monthlyRentKrw: number;
  maintenanceFeeKrw: number;
  depositKrw: number;
}

export type AnswerValue = boolean | string | number | string[];

export interface InterviewOption {
  value: string;
  label: string;
}

export interface InterviewQuestion {
  code: string;
  /** 질문 순서 (낮을수록 먼저) */
  order: number;
  question: string;
  helpText?: string;
  type: "boolean" | "single" | "multi" | "number";
  options?: InterviewOption[];
  when: (ctx: InterviewContext) => boolean;
}

const always = () => true;

export const INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  {
    code: "Q_RESIDENT_REGISTRATION_OBJECTION",
    order: 1,
    question: "집주인이 전입신고를 미뤄 달라거나, 하지 말라고 한 적이 있나요?",
    helpText:
      "전입신고를 막는 것은 임차인의 법적 보호를 없애는 행위입니다. 전세사기에서 가장 뚜렷한 신호예요.",
    type: "boolean",
    when: always,
  },
  {
    code: "Q_DEPOSIT_TO_OTHER_ACCOUNT",
    order: 2,
    question: "보증금을 집주인 본인 계좌가 아닌 다른 곳으로 보내라고 했나요?",
    helpText: "가족·법인·중개사무소 계좌, 현금 요구 등이 모두 해당합니다.",
    type: "boolean",
    when: always,
  },
  {
    code: "Q_MET_LESSOR_IN_PERSON",
    order: 3,
    question: "집주인 본인을 직접 만나 신분증을 확인했나요?",
    helpText: "대리인만 만났거나, 전화·메신저로만 소통했다면 '아니오'를 선택하세요.",
    type: "boolean",
    when: always,
  },
  {
    code: "Q_CONTRACT_CHANNEL",
    order: 4,
    question: "어떤 방식으로 계약하나요?",
    type: "single",
    options: [
      { value: "licensed_agent", label: "공인중개사를 통해서" },
      { value: "direct", label: "집주인과 직거래" },
      { value: "platform_only", label: "앱·카페에서 만난 사람과 (중개사 없음)" },
      { value: "unknown", label: "아직 모르겠어요" },
    ],
    when: always,
  },
  {
    code: "Q_PRIOR_TENANT_DISCLOSED",
    order: 5,
    question: "나보다 먼저 들어온 세입자들의 보증금 총액을 안내받았나요?",
    helpText: "다가구주택은 이 금액이 내 보증금보다 앞섭니다. 모르면 회수 가능 금액을 계산할 수 없어요.",
    type: "boolean",
    when: (ctx) => ctx.isMultiHousehold,
  },
  {
    code: "Q_GUARANTEE_PLAN",
    order: 6,
    question: "전세보증금 반환보증(HUG·HF·SGI)에 가입할 계획이 있나요?",
    helpText: "가입하면 집주인이 보증금을 못 돌려줘도 보증기관이 대신 지급합니다.",
    type: "single",
    options: [
      { value: "yes", label: "가입할 계획이에요" },
      { value: "no", label: "가입하지 않을 거예요" },
      { value: "unknown", label: "잘 모르겠어요" },
    ],
    when: (ctx) => ctx.burdenRatio === null || ctx.burdenRatio >= 0.5 || ctx.hasMortgage,
  },
  {
    code: "Q_PRICE_TOO_GOOD",
    order: 7,
    question: "주변 비슷한 집보다 조건(보증금·월세)이 눈에 띄게 좋은가요?",
    helpText: "시세보다 유난히 싼 매물은 급하게 세입자를 구해야 하는 사정이 있을 수 있습니다.",
    type: "boolean",
    when: always,
  },
  {
    code: "Q_EARLY_MOVE_RISK",
    order: 8,
    question: "계약 기간 중에 이사해야 할 가능성이 있나요? (취업·학교·군입대 등)",
    type: "boolean",
    when: always,
  },
  {
    code: "Q_MAINTENANCE_EXPLAINED",
    order: 9,
    question: "관리비에 어떤 항목이 포함되는지 구체적으로 안내받았나요?",
    helpText: "수도·전기·인터넷·청소비 등 항목이 불명확하면 입주 후 분쟁이 잦습니다.",
    type: "boolean",
    when: (ctx) => ctx.maintenanceFeeKrw > 0 || ctx.monthlyRentKrw > 0,
  },
  {
    code: "Q_OPTIONS_PROVIDED",
    order: 10,
    question: "에어컨·세탁기 같은 옵션 가전이 제공되나요?",
    type: "boolean",
    when: always,
  },
  {
    code: "Q_VERBAL_PROMISES",
    order: 11,
    question: "말로만 약속받은 것이 있나요?",
    helpText: "계약서에 없는 구두 약속은 나중에 증명하기 어렵습니다. 해당하는 것을 모두 골라주세요.",
    type: "multi",
    options: [
      { value: "cleaning", label: "도배·장판·청소를 해준다" },
      { value: "repair", label: "고장난 것을 고쳐준다" },
      { value: "parking", label: "주차를 쓸 수 있다" },
      { value: "pet", label: "반려동물을 키워도 된다" },
      { value: "none", label: "없어요" },
    ],
    when: always,
  },
  {
    code: "Q_TRUST_CONSENT_RECEIVED",
    order: 12,
    question: "신탁회사의 임대차 동의서를 받았나요?",
    helpText: "이 집은 신탁등기가 되어 있어, 동의서가 없으면 계약이 무효가 될 수 있습니다.",
    type: "boolean",
    when: (ctx) => ctx.hasTrust,
  },
];

export function nextQuestions(
  ctx: InterviewContext,
  answered: ReadonlySet<string>,
  limit = 3,
): InterviewQuestion[] {
  return INTERVIEW_QUESTIONS.filter((q) => q.when(ctx) && !answered.has(q.code))
    .sort((a, b) => a.order - b.order)
    .slice(0, limit);
}

export function totalApplicableQuestions(ctx: InterviewContext): number {
  return INTERVIEW_QUESTIONS.filter((q) => q.when(ctx)).length;
}

export interface InterviewOutcome {
  findings: Finding[];
  extraTermCodes: string[];
}

const isNo = (v: AnswerValue | undefined) => v === false || v === "no";
const isYes = (v: AnswerValue | undefined) => v === true || v === "yes";

/** 답변을 finding · 특약으로 변환한다. */
export function applyInterviewAnswers(answers: Record<string, AnswerValue>): InterviewOutcome {
  const findings: Finding[] = [];
  const extraTermCodes: string[] = [];

  if (isYes(answers.Q_RESIDENT_REGISTRATION_OBJECTION)) {
    findings.push({
      code: "INT_REGISTRATION_OBJECTION",
      category: "contract",
      severity: "critical",
      weight: 50,
      title: "집주인이 전입신고를 막고 있어요 — 계약하지 마세요",
      description:
        "전입신고를 하지 못하면 대항력도 우선변제권도 생기지 않습니다. 즉 보증금을 지킬 법적 근거가 " +
        "0인 상태가 됩니다. 임대인이 이를 요구하는 이유는 대출 심사나 다른 세입자와의 관계를 숨기려는 " +
        "경우가 대부분이고, 전세사기의 전형적인 수법입니다.",
      action:
        "이 조건으로는 절대 계약하지 마세요. '전입신고와 확정일자를 방해하지 않는다'는 특약에 응하지 " +
        "않는다면 그 자체가 계약을 그만둘 이유입니다.",
      suggestTerms: ["TERM_NO_NEW_ENCUMBRANCE", "TERM_CONTRACT_VOID_ON_MISDISCLOSURE"],
    });
  }

  if (isYes(answers.Q_DEPOSIT_TO_OTHER_ACCOUNT)) {
    findings.push({
      code: "INT_THIRD_PARTY_ACCOUNT",
      category: "contract",
      severity: "critical",
      weight: 45,
      title: "보증금을 집주인 아닌 계좌로 보내라고 했어요",
      description:
        "제3자 계좌로 보증금을 보내면 '누구에게 준 돈인지'가 불분명해져 반환 청구가 매우 어려워집니다. " +
        "임대인이 아닌 사람이 돈을 가져가면 사실상 회수가 불가능합니다.",
      action:
        "등기부상 소유자 본인 명의 계좌로만 송금하세요. 다른 계좌를 계속 요구하면 계약을 중단하세요.",
      suggestTerms: ["TERM_PAYMENT_TO_OWNER_ACCOUNT"],
    });
    extraTermCodes.push("TERM_PAYMENT_TO_OWNER_ACCOUNT");
  }

  if (isNo(answers.Q_MET_LESSOR_IN_PERSON)) {
    findings.push({
      code: "INT_LESSOR_NOT_MET",
      category: "contract",
      severity: "danger",
      weight: 22,
      title: "집주인 본인을 직접 확인하지 않았어요",
      description:
        "소유자가 아닌 사람이 임대인 행세를 하는 사례가 실제로 있습니다. 신분증 원본과 등기부 소유자 " +
        "이름·생년월일을 대조하지 않으면 계약 자체가 무효가 될 수 있습니다.",
      action:
        "계약 자리에서 집주인 신분증 원본을 확인하세요. 대리인이라면 인감증명서가 첨부된 위임장 원본을 " +
        "확인하고, 소유자 본인과 직접 통화해 위임 사실을 확인하세요.",
      suggestTerms: ["TERM_LESSOR_IDENTITY"],
    });
    extraTermCodes.push("TERM_LESSOR_IDENTITY");
  }

  const channel = answers.Q_CONTRACT_CHANNEL;
  if (channel === "direct" || channel === "platform_only") {
    findings.push({
      code: "INT_NO_LICENSED_AGENT",
      category: "contract",
      severity: channel === "platform_only" ? "danger" : "caution",
      weight: channel === "platform_only" ? 20 : 10,
      title: "공인중개사를 거치지 않는 계약이에요",
      description:
        "중개사를 통하면 확인·설명서가 작성되고, 사고가 났을 때 중개사 공제(손해배상 보증)로 일부라도 " +
        "배상받을 수 있습니다. 직거래는 이 안전망이 전혀 없습니다." +
        (channel === "platform_only"
          ? " 특히 앱·카페에서 만난 상대는 신원 확인 자체가 어렵습니다."
          : ""),
      action:
        "가능하면 공인중개사를 통해 계약하세요. 직거래를 한다면 등기부등본 · 신분증 · 납세증명서를 " +
        "직접 모두 확인하고, 특약을 반드시 서면으로 남기세요.",
      suggestTerms: ["TERM_LESSOR_IDENTITY", "TERM_TAX_CERTIFICATE"],
    });
  }

  if (isNo(answers.Q_PRIOR_TENANT_DISCLOSED)) {
    findings.push({
      code: "INT_PRIOR_TENANT_UNDISCLOSED",
      category: "contract",
      severity: "danger",
      weight: 20,
      title: "앞선 세입자들의 보증금을 안내받지 못했어요",
      description:
        "다가구주택에서 이 정보 없이 계약하면, 경매 시 내 앞에 얼마가 있는지 모른 채 순위를 받는 " +
        "것과 같습니다. 임대인·중개사는 이 내용을 고지할 의무가 있습니다.",
      action: "확정일자 부여현황과 전입세대확인서를 요구하세요. 거부하면 계약을 보류하세요.",
      suggestTerms: ["TERM_PRIOR_TENANT_DISCLOSURE", "TERM_CONTRACT_VOID_ON_MISDISCLOSURE"],
    });
    extraTermCodes.push("TERM_PRIOR_TENANT_DISCLOSURE");
  }

  if (isYes(answers.Q_GUARANTEE_PLAN)) {
    extraTermCodes.push("TERM_GUARANTEE_COOPERATION");
  } else if (answers.Q_GUARANTEE_PLAN === "no") {
    findings.push({
      code: "INT_NO_GUARANTEE_PLAN",
      category: "contract",
      severity: "caution",
      weight: 8,
      title: "보증보험 가입 계획이 없어요",
      description:
        "전세보증금 반환보증은 보증금을 지키는 가장 확실한 수단입니다. 보증료는 보통 보증금의 " +
        "연 0.1~0.2% 수준으로, 보증금 규모에 비하면 매우 저렴합니다.",
      action:
        "HUG(주택도시보증공사) 앱이나 은행에서 가입 가능 여부와 보증료를 먼저 확인해 보세요. " +
        "가입이 거절된다면 그 사유가 바로 이 집의 위험 요인입니다.",
      suggestTerms: ["TERM_GUARANTEE_COOPERATION"],
    });
    extraTermCodes.push("TERM_GUARANTEE_COOPERATION");
  }

  if (isYes(answers.Q_PRICE_TOO_GOOD)) {
    findings.push({
      code: "INT_PRICE_TOO_GOOD",
      category: "contract",
      severity: "caution",
      weight: 10,
      title: "조건이 시세보다 유난히 좋아요",
      description:
        "시세보다 크게 싼 매물은 (1) 하자가 있거나 (2) 임대인이 급하게 자금이 필요하거나 " +
        "(3) 권리관계에 문제가 있는 경우가 많습니다. 세 경우 모두 확인이 필요합니다.",
      action:
        "같은 건물·같은 면적의 최근 실거래가를 직접 확인하고, 왜 조건이 좋은지 중개사에게 물어 " +
        "답변을 기록해 두세요.",
      suggestTerms: ["TERM_PRICE_DISCLOSURE"],
    });
    extraTermCodes.push("TERM_PRICE_DISCLOSURE");
  }

  if (isYes(answers.Q_EARLY_MOVE_RISK)) extraTermCodes.push("TERM_EARLY_TERMINATION");
  if (isNo(answers.Q_MAINTENANCE_EXPLAINED)) extraTermCodes.push("TERM_MAINTENANCE_FEE_ITEMIZED");
  if (isYes(answers.Q_OPTIONS_PROVIDED)) extraTermCodes.push("TERM_APPLIANCE_REPAIR");

  const promises = answers.Q_VERBAL_PROMISES;
  if (Array.isArray(promises)) {
    const set = new Set(promises);
    if (set.has("cleaning")) extraTermCodes.push("TERM_PRE_MOVE_IN_CLEANING");
    if (set.has("repair")) extraTermCodes.push("TERM_DEFECT_REPAIR");
    if (set.has("parking")) extraTermCodes.push("TERM_PARKING");
    if (set.has("pet")) extraTermCodes.push("TERM_PET_ALLOWED");
    if (set.size > 0 && !set.has("none")) {
      findings.push({
        code: "INT_VERBAL_PROMISES",
        category: "contract",
        severity: "caution",
        weight: 6,
        title: "말로만 약속받은 것이 있어요",
        description:
          "계약서에 없는 구두 약속은 지켜지지 않아도 증명하기 어렵습니다. 특히 도배·수선 같은 비용이 " +
          "드는 약속은 입주 후 번번이 미뤄집니다.",
        action: "약속받은 내용을 아래 특약 문구로 계약서에 직접 적어 넣고 양쪽이 서명하세요.",
        evidence: { promises: [...set] },
      });
    }
  }

  if (isNo(answers.Q_TRUST_CONSENT_RECEIVED)) {
    findings.push({
      code: "INT_TRUST_CONSENT_MISSING",
      category: "contract",
      severity: "critical",
      weight: 40,
      title: "신탁회사 동의서를 받지 못했어요",
      description:
        "신탁된 집은 신탁회사가 실제 소유자입니다. 동의서 없이 맺은 계약은 무효로 판단될 수 있고, " +
        "그 경우 보증금을 돌려받을 상대방이 사라집니다.",
      action: "신탁회사의 임대차 동의서(법인 인감증명서 첨부)를 받지 못하면 계약하지 마세요.",
      suggestTerms: ["TERM_TRUST_CONSENT_REQUIRED"],
    });
    extraTermCodes.push("TERM_TRUST_CONSENT_REQUIRED");
  }

  return { findings, extraTermCodes: [...new Set(extraTermCodes)] };
}
