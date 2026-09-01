import { formatKo, type DateOnly } from "../lib/date.js";
import { formatKrw } from "./money.js";
import { encodeJo, type LawKey } from "./law-references.js";

/**
 * 특약 추천 엔진 (기획서 2 ① "무엇을 요구해야 하는지" / ④ 대화형 후속 질문).
 *
 * 특약은 "이 상황에서 이 문구를 계약서에 넣어라"까지 가야 쓸모가 있다. 그래서
 * clause() 는 계약서에 **그대로 옮겨 적을 수 있는 완성된 문장**을 돌려준다.
 *
 * ⚠️ 법률 자문이 아니다. 개별 사안에 따라 효력이 달라질 수 있으므로 UI에 그 취지를 표시할 것.
 */

export type TermCategory =
  | "권리관계"
  | "잔금·등기"
  | "임대인 확인"
  | "서류·고지"
  | "보증·보험"
  | "시설·관리"
  | "계약 해제";

export interface TermContext {
  balanceDate?: DateOnly | null;
  contractDate?: DateOnly | null;
  depositKrw: number;
  residentRegistrationDate?: DateOnly | null;
  /** 대항력 발생일 (잔금/전입 다음 날) */
  protectionDate?: DateOnly | null;
  lessorName?: string | null;
  address?: string | null;
  detailAddress?: string | null;
  maintenanceFeeKrw?: number | null;
}

export interface SpecialTermDefinition {
  code: string;
  category: TermCategory;
  title: string;
  /** 낮을수록 먼저 보여준다 */
  priority: number;
  /** true = 이 특약 없이는 계약을 권하지 않음 */
  required: boolean;
  reason: string;
  clause: (ctx: TermContext) => string;
  /** 조건 없이 항상 추천하는 기본 특약인지 */
  baseline?: boolean;
  /** 이 특약의 법적 근거 조문 (정적 인용). 원문은 lawinfo.service가 실시간으로 붙인다. */
  legalBasis?: { law: LawKey; jo: string; label: string }[];
}

const D = (d: DateOnly | null | undefined, fallback: string) => (d ? formatKo(d) : fallback);

export const SPECIAL_TERM_LIBRARY: Record<string, SpecialTermDefinition> = {
  // ---------------------------------------------------------------- 기본 특약
  TERM_NO_NEW_ENCUMBRANCE: {
    code: "TERM_NO_NEW_ENCUMBRANCE",
    category: "권리관계",
    title: "잔금일 다음 날까지 새로운 담보 설정 금지",
    priority: 10,
    required: true,
    baseline: true,
    legalBasis: [{ law: "주택임대차보호법", jo: encodeJo(3), label: "제3조" }],
    reason:
      "전입신고를 해도 법적 보호는 다음 날 0시부터 시작됩니다. 그 하루 사이에 임대인이 대출을 받으면 " +
      "은행이 내 보증금보다 앞서게 되는데, 이 특약이 그 상황에서 계약을 해제하고 보증금을 돌려받을 근거가 됩니다.",
    clause: (ctx) =>
      `임대인은 본 계약 체결일부터 임차인의 주택 인도 및 전입신고 다음 날(${D(ctx.protectionDate, "잔금 지급일 다음 날")})까지 ` +
      "본 주택에 근저당권·전세권·저당권 등 어떠한 담보권도 설정하지 아니하며, 소유권을 제3자에게 이전하지 아니한다. " +
      "이를 위반한 경우 임차인은 본 계약을 해제할 수 있고, 임대인은 지급받은 금원 전액과 위약금으로 보증금의 10%를 " +
      "임차인에게 즉시 반환한다.",
  },

  TERM_REGISTRY_STATE_AT_BALANCE: {
    code: "TERM_REGISTRY_STATE_AT_BALANCE",
    category: "잔금·등기",
    title: "잔금일 등기부 상태 유지 확인",
    priority: 20,
    required: true,
    baseline: true,
    reason:
      "계약일과 잔금일 사이에 등기부가 바뀌는 일이 실제로 자주 있습니다. 잔금을 보내기 전에 확인할 " +
      "권리를 계약서로 확보해 두면, 문제가 있을 때 잔금 지급을 거절할 수 있습니다.",
    clause: (ctx) =>
      `임차인은 잔금 지급 전 등기사항전부증명서를 발급하여 본 계약 체결 당시(${D(ctx.contractDate, "계약일")})와 ` +
      "권리관계가 동일한지 확인할 수 있다. 계약 체결 당시와 다른 권리(근저당권·가압류·압류·가등기·신탁 등)가 " +
      "새로 설정되어 있는 경우, 임차인은 잔금 지급을 거절하고 본 계약을 해제할 수 있으며 임대인은 이미 지급받은 " +
      "계약금 전액을 즉시 반환한다.",
  },

  TERM_CONTRACT_VOID_ON_RIGHTS_CHANGE: {
    code: "TERM_CONTRACT_VOID_ON_RIGHTS_CHANGE",
    category: "계약 해제",
    title: "권리 변동 시 계약 해제 및 손해배상",
    priority: 30,
    required: true,
    baseline: true,
    reason:
      "특약을 위반했을 때 '어떻게 되는지'를 적어두지 않으면 다툼이 길어집니다. 해제 사유와 배상액을 " +
      "미리 정해두면 협상 없이 바로 반환을 요구할 수 있습니다.",
    clause: () =>
      "본 특약사항 중 어느 하나라도 임대인이 위반한 경우, 임차인은 별도의 최고 없이 본 계약을 해제할 수 있다. " +
      "이 경우 임대인은 임차인이 지급한 계약금·중도금·잔금 전액을 즉시 반환하고, 임차인이 입은 손해(중개보수, " +
      "이사비용, 대출 관련 비용을 포함한다)를 배상한다.",
  },

  TERM_PAYMENT_TO_OWNER_ACCOUNT: {
    code: "TERM_PAYMENT_TO_OWNER_ACCOUNT",
    category: "임대인 확인",
    title: "보증금은 등기부상 소유자 본인 계좌로만 지급",
    priority: 40,
    required: true,
    baseline: true,
    reason:
      "제3자 계좌로 보증금을 보내면 '누구에게 준 돈인지'가 흐려져 반환 청구가 어려워집니다. " +
      "송금 대상을 계약서에 못박아 두는 것이 가장 값싼 안전장치입니다.",
    clause: (ctx) =>
      `보증금 ${formatKrw(ctx.depositKrw)}은 등기사항전부증명서상 소유자${ctx.lessorName ? ` ${ctx.lessorName}` : ""} ` +
      "본인 명의의 계좌로만 지급하며, 제3자(가족·법인·중개사무소 등) 명의 계좌로의 지급 요구에 임차인은 응하지 아니한다. " +
      "임대인이 지정한 계좌의 예금주가 소유자 본인이 아닌 경우 임차인은 지급을 보류할 수 있고, 이로 인한 지연은 " +
      "임차인의 책임으로 보지 아니한다.",
  },

  TERM_TAX_CERTIFICATE: {
    code: "TERM_TAX_CERTIFICATE",
    category: "서류·고지",
    title: "국세·지방세 납세증명서 제출",
    priority: 50,
    required: false,
    baseline: true,
    reason:
      "임대인이 세금을 체납하면 그 세금(당해세)이 내 보증금보다 먼저 배당될 수 있습니다. " +
      "임차인은 임대차계약 체결 후 임대인의 납세증명서를 요구할 권리가 있습니다.",
    clause: (ctx) =>
      `임대인은 잔금 지급일(${D(ctx.balanceDate, "잔금일")}) 전까지 국세 및 지방세 납세증명서(발급일로부터 ` +
      "7일 이내의 것)를 임차인에게 제출한다. 체납 사실이 확인되는 경우 임차인은 본 계약을 해제할 수 있으며, " +
      "임대인은 지급받은 금원 전액을 즉시 반환한다.",
  },

  TERM_DEFECT_REPAIR: {
    code: "TERM_DEFECT_REPAIR",
    category: "시설·관리",
    title: "입주 전 하자 수선 및 원상복구 범위",
    priority: 120,
    required: false,
    baseline: true,
    reason:
      "누수·곰팡이·보일러 고장 같은 문제는 입주 후에 발견되면 책임 소재를 두고 다투게 됩니다. " +
      "입주 전 상태를 기록하고 수선 책임을 미리 정해두면 퇴거 시 보증금에서 깎이는 일을 막을 수 있습니다.",
    clause: (ctx) =>
      `임대인은 입주일(${D(ctx.balanceDate, "입주일")}) 전까지 누수·곰팡이·결로, 보일러·급수·배수·전기 설비의 ` +
      "하자를 자신의 비용으로 수선한다. 입주일 이후 발견되는 위 하자 및 노후로 인한 시설물 고장의 수선 비용은 " +
      "임대인이 부담하며, 임차인의 고의·과실로 인한 파손만 임차인이 부담한다. " +
      "임차인은 입주일에 주택 상태를 사진·영상으로 기록하여 임대인에게 전달하고, 이를 원상복구 범위 판단의 기준으로 한다.",
  },

  // ------------------------------------------------------- 조건부 (권리관계)
  TERM_MORTGAGE_RELEASE_BEFORE_BALANCE: {
    code: "TERM_MORTGAGE_RELEASE_BEFORE_BALANCE",
    category: "권리관계",
    title: "잔금일 전 근저당권 등 말소 (말소 확인 후 잔금 지급)",
    priority: 5,
    required: true,
    reason:
      "이미 설정된 담보가 내 보증금보다 앞서는 상태에서는 아무리 특약을 넣어도 경매 시 순위가 밀립니다. " +
      "말소를 잔금 지급의 **조건**으로 만들어야 실효성이 있습니다.",
    clause: (ctx) =>
      `임대인은 잔금 지급일(${D(ctx.balanceDate, "잔금일")}) 전까지 본 주택에 설정된 근저당권·전세권·가압류·압류·` +
      "가등기 등 임차인의 권리에 앞서는 모든 권리를 자신의 비용으로 말소한다. " +
      "임차인은 말소된 등기사항전부증명서를 확인한 후 잔금을 지급하며, 말소가 확인되지 않으면 잔금 지급을 " +
      "거절하거나 본 계약을 해제할 수 있고, 임대인은 지급받은 금원 전액을 즉시 반환한다. " +
      "말소를 위해 잔금으로 채무를 상환하는 경우, 임차인은 임대인의 채권자(금융기관) 계좌로 직접 상환하고 " +
      "그 금액만큼 잔금 지급 의무를 이행한 것으로 본다.",
  },

  TERM_TRUST_CONSENT_REQUIRED: {
    code: "TERM_TRUST_CONSENT_REQUIRED",
    category: "권리관계",
    title: "신탁회사의 임대차 동의서 제출",
    priority: 1,
    required: true,
    reason:
      "신탁된 주택은 신탁회사가 소유자입니다. 신탁회사 동의 없는 임대차계약은 무효로 판단될 수 있고, " +
      "그 경우 보증금 반환을 청구할 상대방조차 사라집니다.",
    clause: (ctx) =>
      `임대인은 본 계약 체결 시 신탁회사(수탁자)가 발행한 임대차 동의서(법인 인감증명서 첨부) 및 신탁원부를 ` +
      `임차인에게 교부한다. 위 서류가 잔금 지급일(${D(ctx.balanceDate, "잔금일")}) 전까지 교부되지 않는 경우 ` +
      "본 계약은 효력을 상실하며, 임대인은 지급받은 금원 전액을 즉시 반환한다. " +
      "임차인에 대한 보증금 반환 의무는 신탁회사와 임대인이 연대하여 부담한다.",
  },

  TERM_PRIOR_TENANT_DISCLOSURE: {
    code: "TERM_PRIOR_TENANT_DISCLOSURE",
    category: "서류·고지",
    title: "선순위 임차보증금 총액 고지 (확정일자 부여현황 · 전입세대확인서)",
    priority: 15,
    required: true,
    reason:
      "다가구주택은 등기부만으로 앞선 세입자의 보증금을 알 수 없습니다. 그 금액이 내 순위보다 앞서므로, " +
      "고지받지 않으면 보증금을 얼마나 돌려받을 수 있는지 계산 자체가 불가능합니다.",
    clause: (ctx) =>
      `임대인은 본 계약 체결 시 본 건물의 선순위 임차보증금 총액과 임차인 수를 서면으로 고지하고, ` +
      `잔금 지급일(${D(ctx.balanceDate, "잔금일")}) 전까지 '확정일자 부여현황'(관할 등기소·주민센터 발급) 및 ` +
      "'전입세대확인서'를 임차인에게 교부한다. 고지한 금액이 사실과 다른 경우 임차인은 본 계약을 해제할 수 있고, " +
      "임대인은 지급받은 금원 전액과 손해를 배상한다.",
  },

  TERM_ALL_OWNERS_CONSENT: {
    code: "TERM_ALL_OWNERS_CONSENT",
    category: "임대인 확인",
    title: "공동소유자 전원의 동의",
    priority: 25,
    required: true,
    reason:
      "공동소유 주택은 지분 과반의 동의가 없으면 임대차계약의 효력이 다투어질 수 있습니다. " +
      "일부 소유자만 서명한 계약은 나중에 다른 소유자가 명도를 청구할 수 있습니다.",
    clause: () =>
      "본 주택이 공동소유인 경우, 임대인은 등기사항전부증명서상 공유자 전원의 서명 또는 인감증명서가 첨부된 " +
      "위임장을 본 계약서에 첨부한다. 이를 갖추지 못한 경우 임차인은 본 계약을 해제할 수 있고, " +
      "임대인은 지급받은 금원 전액을 즉시 반환한다.",
  },

  TERM_LESSOR_IDENTITY: {
    code: "TERM_LESSOR_IDENTITY",
    category: "임대인 확인",
    title: "임대인 본인 확인 및 대리 계약 요건",
    priority: 2,
    required: true,
    reason:
      "소유자가 아닌 사람과의 계약은 무효가 될 수 있습니다. 계약서 임대인과 등기부 소유자가 다르면 " +
      "대리권을 증명하는 서류가 반드시 필요합니다.",
    clause: () =>
      "임대인은 계약 체결 시 신분증 원본을 제시하여 등기사항전부증명서상 소유자 본인임을 확인시킨다. " +
      "대리인이 계약하는 경우 소유자의 인감증명서(본인 발급, 3개월 이내)가 첨부된 위임장 원본과 대리인 " +
      "신분증을 제출하며, 임차인은 소유자 본인과 직접 통화하여 위임 사실을 확인할 수 있다. " +
      "위 요건을 갖추지 못한 계약은 무효로 하고, 임대인 및 대리인은 지급받은 금원 전액을 즉시 반환한다.",
  },

  TERM_ADDRESS_EXACT: {
    code: "TERM_ADDRESS_EXACT",
    category: "서류·고지",
    title: "등기부 표기와 동일한 주소·동·호수 기재",
    priority: 35,
    required: true,
    legalBasis: [
      { law: "주택임대차보호법", jo: encodeJo(3), label: "제3조" },
      { law: "주택임대차보호법", jo: encodeJo(3, 2), label: "제3조의2" },
    ],
    reason:
      "확정일자와 전입신고는 주소가 등기부 표기와 일치해야 효력이 인정됩니다. 문패나 우편함 호수가 " +
      "등기부와 다른 건물이 실제로 많고, 이 경우 우선변제권을 잃을 수 있습니다.",
    clause: (ctx) =>
      `본 계약의 목적물 표시는 등기사항전부증명서 표제부 기재와 동일하게 ` +
      `"${ctx.address ?? "(등기부상 주소)"}${ctx.detailAddress ? ` ${ctx.detailAddress}` : ""}"로 하며, ` +
      "현관 문패·우편함 표기가 이와 다른 경우 등기부 기재를 기준으로 한다. " +
      "임차인은 등기부 기재와 동일한 주소로 전입신고 및 확정일자를 신청한다.",
  },

  TERM_DEBT_CERTIFICATE: {
    code: "TERM_DEBT_CERTIFICATE",
    category: "서류·고지",
    title: "금융기관 부채(대출 잔액) 증명서 제출",
    priority: 55,
    required: false,
    reason:
      "등기부의 채권최고액은 담보 한도일 뿐, 실제 남은 빚과 다릅니다. 실제 잔액을 확인해야 " +
      "보증금을 돌려받을 수 있는지 정확히 계산할 수 있습니다.",
    clause: (ctx) =>
      `임대인은 잔금 지급일(${D(ctx.balanceDate, "잔금일")}) 전까지 본 주택에 설정된 근저당권의 ` +
      "실제 대출 잔액을 확인할 수 있는 금융기관 발행 부채증명서를 임차인에게 제출한다. " +
      "제출된 잔액이 임대인이 고지한 금액을 초과하는 경우 임차인은 본 계약을 해제할 수 있다.",
  },

  TERM_GUARANTEE_COOPERATION: {
    code: "TERM_GUARANTEE_COOPERATION",
    category: "보증·보험",
    title: "전세보증금 반환보증 가입 협조",
    priority: 60,
    required: false,
    reason:
      "보증보험에 가입하면 임대인이 보증금을 돌려주지 못해도 보증기관이 대신 지급합니다. " +
      "가입에는 임대인의 서류 협조가 필요하고, 가입 불가 사유(위반건축물·과다 담보 등)가 " +
      "확인되면 그 자체가 위험 신호입니다.",
    clause: (ctx) =>
      "임대인은 임차인의 전세보증금 반환보증(주택도시보증공사·한국주택금융공사·SGI서울보증) 가입에 필요한 " +
      "서류 제출 및 확인에 협조한다. 임대인의 사유(위반건축물, 과다 담보, 세금 체납, 신탁 등)로 보증 가입이 " +
      `거절되는 경우 임차인은 잔금 지급일(${D(ctx.balanceDate, "잔금일")}) 전까지 본 계약을 해제할 수 있고, ` +
      "임대인은 지급받은 금원 전액을 즉시 반환한다.",
  },

  TERM_ILLEGAL_BUILDING_REMEDY: {
    code: "TERM_ILLEGAL_BUILDING_REMEDY",
    category: "계약 해제",
    title: "위반건축물 시정명령·철거 시 계약 해제",
    priority: 65,
    required: false,
    reason:
      "위반건축물은 이행강제금이 계속 부과되고, 시정명령이 내려지면 실제로 사용 공간이 줄거나 " +
      "퇴거해야 할 수 있습니다. 그 위험을 임대인이 부담하도록 정해둡니다.",
    clause: () =>
      "임대인은 본 주택이 건축물대장상 위반건축물로 등재되어 있음을 고지하였다. 임대차 기간 중 " +
      "관할 행정청의 시정명령·철거명령·사용금지 처분으로 임차인이 목적물의 전부 또는 일부를 사용할 수 없게 된 " +
      "경우, 임차인은 본 계약을 해제할 수 있고 임대인은 보증금 전액과 임차인의 이사비용 및 중개보수를 배상한다.",
  },

  TERM_BROKER_LIABILITY: {
    code: "TERM_BROKER_LIABILITY",
    category: "서류·고지",
    title: "중개사 권리관계 설명 내용의 서면 확인",
    priority: 70,
    required: false,
    reason:
      "중개사가 설명한 내용을 서면으로 남겨두면, 설명이 사실과 달랐을 때 중개사와 공제기관에 " +
      "손해배상을 청구할 수 있습니다. 말로만 들은 설명은 증거가 되지 않습니다.",
    clause: () =>
      "개업공인중개사는 본 주택의 권리관계(근저당권·전세권·가압류·압류·신탁·선순위 임차보증금을 포함한다)를 " +
      "중개대상물 확인·설명서에 사실대로 기재하고 서명·날인하여 임차인에게 교부하였음을 확인한다. " +
      "기재 내용이 사실과 다른 경우 개업공인중개사는 공인중개사법에 따라 임차인이 입은 손해를 배상한다.",
  },

  TERM_CONTRACT_VOID_ON_MISDISCLOSURE: {
    code: "TERM_CONTRACT_VOID_ON_MISDISCLOSURE",
    category: "계약 해제",
    title: "고지 내용이 사실과 다를 경우 계약 무효",
    priority: 75,
    required: false,
    reason:
      "임대인이 선순위 보증금이나 대출 규모를 축소해 말하는 경우가 많습니다. 고지 내용을 계약의 " +
      "전제로 명시해두면, 사실과 다를 때 계약을 되돌릴 수 있습니다.",
    clause: () =>
      "임대인이 본 계약 체결 시 고지한 권리관계 및 선순위 임차보증금의 내용은 본 계약의 중요한 전제이다. " +
      "고지 내용이 사실과 다른 것으로 밝혀진 경우 임차인은 본 계약을 해제할 수 있고, 임대인은 지급받은 금원 " +
      "전액과 위약금으로 보증금의 10%를 임차인에게 지급한다.",
  },

  TERM_PRICE_DISCLOSURE: {
    code: "TERM_PRICE_DISCLOSURE",
    category: "서류·고지",
    title: "최근 실거래 사례 및 매매가 고지",
    priority: 80,
    required: false,
    reason:
      "시세를 모르면 깡통전세인지 판단할 수 없습니다. 임대인이 최근 이 집을 산 경우 매매가는 " +
      "가장 정확한 시세 자료입니다.",
    clause: () =>
      "임대인은 본 주택의 취득 시기와 취득가액, 그리고 같은 건물 내 동일 면적 세대의 최근 1년 실거래 사례를 " +
      "임차인에게 고지한다. 고지 내용이 사실과 다른 경우 임차인은 본 계약을 해제할 수 있다.",
  },

  // ------------------------------------------------ 대화형 후속 질문 기반 특약
  TERM_EARLY_TERMINATION: {
    code: "TERM_EARLY_TERMINATION",
    category: "계약 해제",
    title: "중도 퇴거 시 조건 (사전 통보 · 중개보수 부담)",
    priority: 130,
    required: false,
    reason:
      "학교·직장 사정으로 중간에 나가야 할 가능성이 있다면, 미리 조건을 정해두는 편이 훨씬 유리합니다. " +
      "특약이 없으면 관행적으로 임차인이 새 세입자를 구하고 중개보수까지 부담하게 됩니다.",
    clause: () =>
      "임차인이 임대차 기간 만료 전에 퇴거하는 경우, 임차인은 퇴거 예정일 2개월 전까지 임대인에게 통보한다. " +
      "임대인은 통보받은 날부터 새로운 임차인을 구하는 데 협조하고, 새로운 임차인이 정해지면 보증금을 " +
      "즉시 반환한다. 이 경우 임차인은 잔여 기간에 대한 차임을 부담하지 아니하고, 신규 임대차의 중개보수는 " +
      "임차인이 부담한다.",
  },

  TERM_MAINTENANCE_FEE_ITEMIZED: {
    code: "TERM_MAINTENANCE_FEE_ITEMIZED",
    category: "시설·관리",
    title: "관리비 항목 명시 및 인상 제한",
    priority: 140,
    required: false,
    reason:
      "원룸 관리비는 항목이 불명확한 경우가 많아, 입주 후 갑자기 오르거나 안 쓴 비용까지 청구되는 " +
      "분쟁이 잦습니다. 항목과 인상 한도를 미리 적어두는 것이 가장 확실한 예방책입니다.",
    clause: (ctx) =>
      `월 관리비는 ${ctx.maintenanceFeeKrw ? formatKrw(ctx.maintenanceFeeKrw) : "계약서에 기재한 금액"}으로 확정하며, ` +
      "관리비에 포함되는 항목(수도·전기·가스·인터넷·청소·승강기·공동전기 등)을 본 특약에 열거하고, " +
      "열거되지 않은 항목은 청구하지 아니한다. 임대차 기간 중 관리비는 인상하지 아니하며, " +
      "개별 사용량에 따라 부과되는 항목은 검침 내역을 임차인에게 제시한 후 청구한다." +
      (ctx.balanceDate ? ` 관리비 산정 기준일은 ${formatKo(ctx.balanceDate)}로 한다.` : ""),
  },

  TERM_APPLIANCE_REPAIR: {
    code: "TERM_APPLIANCE_REPAIR",
    category: "시설·관리",
    title: "옵션 가전·가구의 수선 책임",
    priority: 150,
    required: false,
    reason:
      "에어컨·세탁기 같은 옵션 가전은 임대인 소유물이므로 노후 고장은 임대인이 고쳐야 하지만, " +
      "명시하지 않으면 임차인이 부담하는 경우가 많습니다.",
    clause: () =>
      "본 주택에 설치된 옵션 품목(에어컨, 냉장고, 세탁기, 인덕션, 붙박이장 등)의 목록과 상태를 별지로 " +
      "작성하여 계약서에 첨부한다. 위 품목의 노후·자연 고장에 대한 수리·교체 비용은 임대인이 부담하고, " +
      "임차인의 고의·과실로 인한 파손만 임차인이 부담한다.",
  },

  TERM_PET_ALLOWED: {
    code: "TERM_PET_ALLOWED",
    category: "시설·관리",
    title: "반려동물 사육 동의",
    priority: 160,
    required: false,
    reason:
      "구두 동의만 받아두면 나중에 계약 위반을 이유로 퇴거를 요구받거나 보증금에서 과도하게 " +
      "차감될 수 있습니다.",
    clause: () =>
      "임대인은 임차인의 반려동물 사육에 동의한다. 다만 임차인은 반려동물로 인한 훼손(벽지·바닥재 등)에 대해 " +
      "통상의 사용에 따른 마모를 초과하는 부분을 원상복구하거나 그 비용을 부담한다.",
  },

  TERM_PARKING: {
    code: "TERM_PARKING",
    category: "시설·관리",
    title: "주차 공간 확보",
    priority: 170,
    required: false,
    reason: "주차 가능 여부와 대수를 계약서에 적어두지 않으면 입주 후 사용을 제한받는 일이 흔합니다.",
    clause: () =>
      "임대인은 임차인에게 본 건물 주차장 내 1대의 주차 공간을 임대차 기간 동안 무상으로 제공한다. " +
      "제공이 불가능하게 된 경우 임차인은 그에 상당하는 차임의 감액을 청구할 수 있다.",
  },

  TERM_PRE_MOVE_IN_CLEANING: {
    code: "TERM_PRE_MOVE_IN_CLEANING",
    category: "시설·관리",
    title: "입주 전 청소 · 도배 · 장판",
    priority: 180,
    required: false,
    reason: "구두 약속은 이행되지 않아도 증명하기 어렵습니다. 범위와 시점을 계약서에 적어야 합니다.",
    clause: (ctx) =>
      `임대인은 입주일(${D(ctx.balanceDate, "입주일")}) 전까지 자신의 비용으로 전체 도배 및 장판 교체와 ` +
      "입주 청소를 완료한다. 완료되지 않은 경우 임차인은 직접 시행하고 그 비용을 차임에서 공제할 수 있다.",
  },
};

export interface RecommendedTerm {
  code: string;
  category: TermCategory;
  title: string;
  priority: number;
  required: boolean;
  reason: string;
  clauseText: string;
  triggeredBy: string[];
}

/**
 * finding 코드 목록과 대화형 답변 결과를 받아 특약을 선정한다.
 *
 * @param triggeredCodes finding 이 suggestTerms 로 지목한 특약 코드 → 유발 finding 코드 매핑
 * @param extraCodes 인터뷰 답변 등에서 직접 지정한 특약 코드
 */
export function recommendSpecialTerms(
  triggeredCodes: Map<string, string[]>,
  ctx: TermContext,
  extraCodes: string[] = [],
): RecommendedTerm[] {
  const selected = new Map<string, string[]>();

  // 기본 특약은 조건 없이 포함
  for (const def of Object.values(SPECIAL_TERM_LIBRARY)) {
    if (def.baseline) selected.set(def.code, []);
  }
  for (const [code, causes] of triggeredCodes) {
    if (!SPECIAL_TERM_LIBRARY[code]) continue;
    selected.set(code, [...(selected.get(code) ?? []), ...causes]);
  }
  for (const code of extraCodes) {
    if (!SPECIAL_TERM_LIBRARY[code]) continue;
    if (!selected.has(code)) selected.set(code, ["interview"]);
  }

  return [...selected.entries()]
    .map(([code, triggeredBy]) => {
      const def = SPECIAL_TERM_LIBRARY[code]!;
      return {
        code: def.code,
        category: def.category,
        title: def.title,
        priority: def.priority,
        required: def.required,
        reason: def.reason,
        clauseText: def.clause(ctx),
        triggeredBy: [...new Set(triggeredBy)],
      };
    })
    .sort((a, b) => a.priority - b.priority);
}

/** findings 배열에서 특약 유발 관계를 뽑아낸다. */
export function collectTermTriggers(
  findings: { code: string; suggestTerms?: string[] }[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const f of findings) {
    for (const term of f.suggestTerms ?? []) {
      map.set(term, [...(map.get(term) ?? []), f.code]);
    }
  }
  return map;
}

/**
 * 코드로 특약의 정적 법조문 인용을 찾는다.
 *
 * `special_terms` 테이블에는 이 값을 저장하지 않는다 — 법 인용은 배포 시점에만 바뀌는
 * 정적 값이라 DB에 실어 나를 이유가 없다. `RecommendedTerm`이 DB에서 복원됐든 방금
 * 계산됐든, 항상 코드로 라이브러리를 다시 조회하면 안전하다.
 */
export function legalBasisFor(code: string): NonNullable<SpecialTermDefinition["legalBasis"]> {
  return SPECIAL_TERM_LIBRARY[code]?.legalBasis ?? [];
}
