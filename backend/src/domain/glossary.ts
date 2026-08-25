/**
 * 용어사전 · 사기 수법 · 피해 대응 절차.
 *
 * 프론트엔드 `/glossary` 화면이 쓰는 교육용 콘텐츠다.
 *
 * ## 왜 서버가 들고 있는가
 *
 * 프론트엔드에 하드코딩해도 화면은 나온다. 그런데 이 서비스에서 용어 설명은 **판정 근거와
 * 같은 말을 해야 한다**. 판정이 "채권최고액이 시세의 67%"라고 말하는데 용어사전이
 * 채권최고액을 다르게 설명하면 사용자는 어느 쪽을 믿어야 할지 모른다.
 *
 * 그래서 `relatedFindings` 로 **판정 코드와 용어를 연결**해 둔다. 판정 화면에서
 * "이게 무슨 말이죠?"를 누르면 정확히 그 항목을 설명하는 용어로 보낼 수 있다.
 * 규칙 엔진이 바뀌면 용어도 같이 고쳐야 한다는 뜻이기도 하다 — 그게 의도다.
 *
 * 순수 데이터 + 순수 함수만 둔다 (`src/domain/*` 규칙). DB 조회도 외부 호출도 없다.
 */

/** 프론트엔드 필터 칩과 1:1 대응한다. "전체"는 필터를 걸지 않은 상태이므로 여기 없다. */
export const GLOSSARY_CATEGORIES = ["등기부", "보증금", "계약서", "절차"] as const;
export type GlossaryCategory = (typeof GLOSSARY_CATEGORIES)[number];

/**
 * 용어에 붙는 강조 표시.
 *  - `risk`     : 보이면 위험을 의심해야 하는 것
 *  - `must_do`  : 임차인이 반드시 챙겨야 하는 것
 * 표시가 필요 없는 중립 용어는 태그를 두지 않는다.
 */
export type GlossaryTag = "risk" | "must_do";

export interface GlossaryTerm {
  code: string;
  term: string;
  /** 같은 뜻으로 검색될 수 있는 말. 검색에만 쓰고 화면에는 노출하지 않는다. */
  aliases: string[];
  category: GlossaryCategory;
  tag: GlossaryTag | null;
  /** 한 줄 요약. 목록에서 접혀 있을 때 보여줄 수 있다. */
  summary: string;
  /** 펼쳤을 때의 설명. 사회초년생 기준으로 쓴다 — 법률 용어로 법률 용어를 설명하지 않는다. */
  description: string;
  /**
   * 이 용어가 설명하는 판정 항목 코드. 판정 화면에서 용어로 연결할 때 쓴다.
   * 규칙 엔진의 finding code 와 문자열이 일치해야 한다.
   */
  relatedFindings: string[];
  /** 근거 법 조문. 없으면 빈 배열. */
  legalBasis: string[];
}

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    code: "G_MORTGAGE",
    term: "근저당권",
    aliases: ["근저당", "저당", "담보대출"],
    category: "등기부",
    tag: "risk",
    summary: "집을 담보로 빌린 돈이 있다는 표시입니다.",
    description:
      "집주인이 집을 담보로 은행에서 돈을 빌리면 등기부 을구에 근저당권이 적힙니다. " +
      "집이 경매로 넘어가면 이 돈이 내 보증금보다 **먼저** 변제됩니다. " +
      "근저당이 있다고 무조건 위험한 것은 아니고, 그 금액과 시세를 견줘 봐야 합니다.",
    relatedFindings: ["RIGHTS_MORTGAGE_PRESENT", "RIGHTS_MANY_MORTGAGES", "VAL_HIGH_BURDEN"],
    legalBasis: [],
  },
  {
    code: "G_MAX_CLAIM",
    term: "채권최고액",
    aliases: ["최고액", "채권 최고액"],
    category: "등기부",
    tag: "risk",
    summary: "실제 빌린 돈이 아니라, 담보로 잡은 한도 금액입니다.",
    description:
      "등기부에 적히는 금액은 실제 대출 잔액이 아니라 **담보 한도**입니다. " +
      "보통 실제 대출의 110~120%로 설정합니다. 실제 잔액은 더 적을 수 있지만, " +
      "집주인이 언제든 그 한도까지 다시 빌릴 수 있으므로 위험을 볼 때는 이 큰 금액을 기준으로 삼습니다. " +
      "ZIP 042도 채권최고액을 기준으로 계산합니다.",
    relatedFindings: ["VAL_HIGH_BURDEN", "RIGHTS_AMOUNT_UNREADABLE"],
    legalBasis: [],
  },
  {
    code: "G_FIXED_DATE",
    term: "확정일자",
    aliases: ["확정 일자"],
    category: "보증금",
    tag: "must_do",
    summary: "받아 둔 날짜를 기준으로 보증금을 돌려받을 순위가 생깁니다.",
    description:
      "계약서에 확정일자를 받으면 그 날짜 기준으로 **우선변제권**이 생깁니다. " +
      "집이 경매로 넘어갔을 때 나보다 늦은 채권자보다 먼저 보증금을 받을 수 있다는 뜻입니다. " +
      "주민센터·등기소·인터넷등기소에서 받을 수 있고, 전입신고와 함께 **잔금 치른 당일**에 처리하세요.",
    relatedFindings: ["CONFIRMED_DATE", "SCH_CONFIRMED_DATE_LATE"],
    legalBasis: ["주택임대차보호법 제3조의2"],
  },
  {
    code: "G_OPPOSING_POWER",
    term: "대항력",
    aliases: ["대항 력", "전입신고 효력"],
    category: "보증금",
    tag: "must_do",
    summary: "집주인이 바뀌어도 계속 살 수 있는 힘입니다.",
    description:
      "**전입신고 + 실제 거주(점유)** 두 가지를 갖추면 대항력이 생깁니다. " +
      "집이 팔리거나 경매로 넘어가도 새 주인에게 임차권을 주장할 수 있습니다. " +
      "주의할 점은 효력이 신고한 날이 아니라 **다음 날 0시**부터라는 것입니다. " +
      "잔금 당일에 신고해도 그날 하루는 무방비이므로, 잔금일과 전입신고일을 같은 날로 맞추는 것이 중요합니다.",
    relatedFindings: [
      "RESIDENT_REGISTRATION",
      "RESIDENT_REGISTRATION_DEADLINE",
      "PROTECTION_EFFECTIVE",
      "SCH_REGISTRATION_DELAYED",
      "SCH_REGISTRATION_PAST_LEGAL_DEADLINE",
    ],
    legalBasis: ["주택임대차보호법 제3조", "주민등록법 제11조"],
  },
  {
    code: "G_JEONSE_RATIO",
    term: "전세가율",
    aliases: ["전세 가율", "깡통전세", "깡통 전세"],
    category: "보증금",
    tag: "risk",
    summary: "시세 대비 보증금(과 빚)의 비율입니다. 높을수록 위험합니다.",
    description:
      "매매 시세 대비 보증금의 비율입니다. ZIP 042는 보증금만이 아니라 " +
      "**선순위 채권최고액까지 더해** 계산합니다 — 경매에서 내 앞에 서는 돈이 전부이기 때문입니다. " +
      "이 비율이 80%를 넘으면 경매 낙찰가가 떨어졌을 때 보증금을 다 못 받을 수 있고, " +
      "100%를 넘으면 이미 시세보다 빚이 많은 상태(깡통전세)입니다.",
    relatedFindings: ["VAL_HIGH_BURDEN", "VAL_MODERATE_BURDEN", "VAL_UNDERWATER", "VAL_AUCTION_GAP"],
    legalBasis: [],
  },
  {
    code: "G_TRUST",
    term: "신탁등기",
    aliases: ["신탁", "신탁 등기", "수탁자"],
    category: "등기부",
    tag: "risk",
    summary: "집의 소유권이 신탁회사에 넘어가 있는 상태입니다.",
    description:
      "소유권이 신탁회사(수탁자)에 있는 경우입니다. 이때 등기부상 소유자는 신탁회사이므로, " +
      "**원래 집주인과 계약하면 그 계약이 무효가 될 수 있습니다.** " +
      "계약하려면 신탁원부를 확인하고 수탁자의 동의를 서면으로 받아야 합니다. " +
      "전세사기에서 자주 쓰이는 수법이므로 신탁등기가 보이면 반드시 멈추고 확인하세요.",
    relatedFindings: ["RIGHTS_TRUST_REGISTERED", "TERM_TRUST_CONSENT_REQUIRED", "INT_TRUST_CONSENT_MISSING"],
    legalBasis: [],
  },
  {
    code: "G_LEASE_REGISTRATION_ORDER",
    term: "임차권등기명령",
    aliases: ["임차권 등기", "임차권등기"],
    category: "절차",
    tag: null,
    summary: "보증금을 못 받고 이사해야 할 때 순위를 지키는 제도입니다.",
    description:
      "계약이 끝났는데 보증금을 못 받았을 때, 법원에 신청해 등기부에 임차권을 올리는 제도입니다. " +
      "이 등기를 마치면 **이사를 나가도 대항력과 우선변제권이 그대로 유지**됩니다. " +
      "등기가 실제로 완료된 것을 확인한 뒤에 이사하세요. 신청만 하고 나가면 순위를 잃습니다.",
    relatedFindings: ["RIGHTS_PRIOR_LEASE_REGISTRATION", "RIGHTS_PRIOR_JEONSE"],
    legalBasis: ["주택임대차보호법 제3조의3"],
  },
  {
    code: "G_PROVISIONAL_SEIZURE",
    term: "가압류 · 압류",
    aliases: ["가압류", "압류", "가처분"],
    category: "등기부",
    tag: "risk",
    summary: "집주인이 빚 문제로 재산을 묶인 상태라는 표시입니다.",
    description:
      "채권자가 집주인의 재산을 미리 묶어 둔 것입니다. 등기부 갑구에 적힙니다. " +
      "집주인의 자금 사정이 이미 나쁘다는 뜻이고, 경매로 이어질 수 있습니다. " +
      "가압류가 있는 집은 보증금 반환이 어려워질 가능성이 높으므로 계약을 재검토하세요.",
    relatedFindings: ["RIGHTS_INJUNCTION", "RIGHTS_AUCTION_STARTED", "RIGHTS_PROVISIONAL_REGISTRATION"],
    legalBasis: [],
  },
  {
    code: "G_PRIORITY_SMALL_LESSEE",
    term: "최우선변제권",
    aliases: ["소액임차인", "최우선 변제", "소액 임차인"],
    category: "보증금",
    tag: null,
    summary: "보증금이 일정액 이하면 순위와 무관하게 일부를 먼저 받습니다.",
    description:
      "보증금이 지역별 기준액 이하인 소액임차인은 근저당보다 순위가 늦어도 " +
      "**일정 금액까지는 가장 먼저** 받을 수 있습니다. 다만 보호되는 금액은 보증금 전액이 아니라 " +
      "지역별로 정해진 한도까지이고, **경매개시결정 전에 대항력을 갖춘 경우**에만 적용됩니다. " +
      "기준액은 지역과 계약 시점에 따라 다릅니다.",
    relatedFindings: ["VAL_SMALL_LESSEE_PROTECTED"],
    legalBasis: ["주택임대차보호법 제8조"],
  },
  {
    code: "G_MULTI_HOUSEHOLD",
    term: "다가구주택",
    aliases: ["다가구", "다세대 차이"],
    category: "등기부",
    tag: "risk",
    summary: "건물 전체가 하나의 등기라, 다른 세입자의 보증금이 내 앞 순위입니다.",
    description:
      "호수별로 등기가 나뉜 다세대주택(빌라)과 달리, 다가구주택은 **건물 전체가 집주인 한 명의 소유**입니다. " +
      "그래서 나보다 먼저 들어온 세입자들의 보증금 전부가 내 앞 순위가 됩니다. " +
      "등기부만으로는 그 금액을 알 수 없으므로, 중개사에게 **선순위 확정일자 현황(전입세대 열람)**을 " +
      "반드시 요구해야 합니다. 안 알려주면 그 자체가 위험 신호입니다.",
    relatedFindings: [
      "RIGHTS_NOT_SECTIONED_BUILDING",
      "VAL_SENIOR_DEPOSIT_UNKNOWN",
      "DOC_PRIOR_TENANT_NOT_DISCLOSED",
      "INT_PRIOR_TENANT_UNDISCLOSED",
    ],
    legalBasis: [],
  },
  {
    code: "G_BROKERAGE_STATEMENT",
    term: "중개대상물 확인·설명서",
    aliases: ["확인설명서", "확인 설명서", "중개대상물"],
    category: "계약서",
    tag: "must_do",
    summary: "중개사가 설명한 내용을 적고 서명하는, 책임을 남기는 문서입니다.",
    description:
      "공인중개사는 계약 전에 이 서류로 권리관계·시설·중개보수를 설명하고 서명·날인할 의무가 있습니다. " +
      "여기에 **근저당·선순위 보증금이 사실대로 적혀 있는지**가 핵심입니다. " +
      "나중에 문제가 생겼을 때 중개사 책임을 묻는 근거가 되므로, 받지 않고 계약하면 안 됩니다. " +
      "손해배상책임 보장 증서(공제증서)도 함께 확인하세요.",
    relatedFindings: [
      "DOC_BROKERAGE_STATEMENT_MISSING",
      "DOC_ENCUMBRANCE_NOT_DISCLOSED",
      "DOC_BROKER_NOT_SIGNED",
      "DOC_BROKER_GUARANTEE_EXPIRED",
    ],
    legalBasis: [],
  },
  {
    code: "G_SPECIAL_TERMS",
    term: "특약사항",
    aliases: ["특약"],
    category: "계약서",
    tag: "must_do",
    summary: "계약서에 직접 적어 넣는 약속입니다. 안 적으면 효력이 없습니다.",
    description:
      "표준 계약서에 없는 내용을 당사자끼리 추가로 정하는 항목입니다. " +
      '"잔금일까지 근저당을 말소한다", "전입신고와 확정일자를 방해하지 않는다" 같은 조항이 대표적입니다. ' +
      "구두로 약속받은 것은 나중에 증명하기 어렵습니다. **반드시 계약서 특약란에 적고 서명받으세요.** " +
      "ZIP 042는 판정 결과에 맞춰 넣어야 할 특약 문구를 골라 드립니다.",
    relatedFindings: ["DOC_NO_SPECIAL_TERMS"],
    legalBasis: [],
  },
];

/**
 * 실제 사기 수법.
 *
 * 사례를 나열하는 목적은 겁을 주려는 것이 아니라 **패턴을 알아보게** 하는 것이다.
 * 그래서 수법마다 "이런 신호가 보이면 의심하라"를 함께 적는다.
 */
export interface FraudCase {
  code: string;
  title: string;
  /** 어떻게 당하는가 */
  how: string;
  /** 계약 전에 알아챌 수 있는 신호 */
  signals: string[];
  /** 무엇을 하면 막을 수 있는가 */
  prevention: string;
}

export const FRAUD_CASES: FraudCase[] = [
  {
    code: "F_FORGED_DELEGATION",
    title: "대리인이 위임장을 위조한 계약",
    how:
      "집주인 본인이 아니라 '대리인'이 나와 계약하고 보증금을 가로챕니다. " +
      "위임장과 인감증명서가 위조된 경우가 많습니다.",
    signals: [
      "집주인을 한 번도 직접 만나지 못했다",
      "위임장은 있는데 인감증명서가 없거나 발급일이 오래됐다",
      "보증금을 집주인 명의가 아닌 계좌로 보내라고 한다",
    ],
    prevention:
      "집주인과 직접 영상통화라도 하고, 등기부상 소유자 명의 계좌로만 송금하세요. " +
      "인감증명서는 발급 3개월 이내인지 확인합니다.",
  },
  {
    code: "F_DOUBLE_CONTRACT",
    title: "한 집에 세입자를 둘 이상 받는 이중계약",
    how:
      "같은 집을 여러 사람에게 각각 임대하고 보증금을 중복으로 받습니다. " +
      "중개사가 가담하거나, 집주인이 관리인을 사칭해 벌이기도 합니다.",
    signals: [
      "시세보다 눈에 띄게 싸다",
      "계약을 서두르고 가계약금부터 보내라고 한다",
      "전입신고를 미뤄 달라고 한다",
    ],
    prevention:
      "잔금 당일 등기부를 다시 열람하고, 전입세대 열람으로 이미 사는 사람이 있는지 확인하세요. " +
      "전입신고를 미루라는 요구는 그 자체로 계약을 중단할 사유입니다.",
  },
  {
    code: "F_OWNERSHIP_TRANSFER",
    title: "잔금 직후 소유권을 넘기는 수법",
    how:
      "보증금을 받은 직후 집을 빚 많은 제3자(속칭 바지사장)에게 넘깁니다. " +
      "새 주인은 갚을 능력이 없어 보증금 반환이 불가능해집니다.",
    signals: [
      "집주인이 최근에 집을 샀다 (소유권 이전이 몇 개월 이내)",
      "집주인이 같은 건물·같은 동네에 집을 여러 채 갖고 있다",
      "매매와 임대차를 동시에 진행한다",
    ],
    prevention:
      '특약에 "잔금일까지 소유권을 이전하지 않는다"를 넣고, 잔금 당일 등기부를 재확인하세요. ' +
      "전입신고와 확정일자를 잔금 당일에 반드시 마칩니다.",
  },
  {
    code: "F_TRUST_PROPERTY",
    title: "신탁된 집을 원래 주인이 계약",
    how:
      "소유권이 신탁회사에 있는데 위탁자(원래 집주인)가 마치 자기 집인 것처럼 계약합니다. " +
      "수탁자 동의가 없으면 계약 자체가 무효라 보증금을 돌려받을 근거가 없습니다.",
    signals: [
      "등기부 갑구에 신탁 등기가 있다",
      "집주인이 신탁원부 열람을 꺼린다",
      '"신탁은 형식일 뿐"이라며 넘어가려 한다',
    ],
    prevention:
      "신탁원부를 직접 열람하고, 수탁자(신탁회사)의 서면 동의를 받으세요. " +
      "동의를 못 받으면 계약하지 않는 것이 맞습니다.",
  },
  {
    code: "F_UNDISCLOSED_PRIOR",
    title: "다가구 선순위 보증금을 숨긴 계약",
    how:
      "다가구주택에서 이미 다른 세입자들의 보증금이 시세를 넘는데도 이를 알리지 않고 계약합니다. " +
      "등기부에는 다른 세입자의 보증금이 나타나지 않아 눈으로는 알 수 없습니다.",
    signals: [
      "다가구주택인데 선순위 확정일자 현황을 안 보여준다",
      "중개대상물 확인·설명서의 선순위 항목이 비어 있다",
      "몇 세대가 사는지 물어도 답을 흐린다",
    ],
    prevention:
      "전입세대 열람과 확정일자 부여 현황을 요구하세요. 임대인 동의가 필요하므로 " +
      "**계약 전에** 요청하고, 거부하면 계약하지 마세요.",
  },
];

/**
 * 피해가 이미 발생했을 때의 대응 절차.
 *
 * 순서가 중요하다 — 임차권등기를 마치기 전에 이사하면 순위를 잃는 것처럼,
 * 순서를 틀리면 되돌릴 수 없는 단계가 있다. 그래서 목록이 아니라 번호를 매긴 절차로 둔다.
 */
export interface ReliefStep {
  order: number;
  title: string;
  detail: string;
  /** 순서를 지키지 않으면 생기는 손해. 없으면 null. */
  warning: string | null;
}

export const RELIEF_STEPS: ReliefStep[] = [
  {
    order: 1,
    title: "계약 종료를 서면으로 통지하고 증거를 남긴다",
    detail:
      "계약 만료 6개월 전부터 2개월 전 사이에 갱신 거절 의사를 알려야 합니다. " +
      "내용증명 우편으로 보내면 통지 사실과 날짜가 증거로 남습니다.",
    warning:
      "기한 내에 통지하지 않으면 같은 조건으로 계약이 자동 갱신됩니다(묵시적 갱신).",
  },
  {
    order: 2,
    title: "보증금을 못 받으면 임차권등기명령을 신청한다",
    detail:
      "계약이 끝났는데 보증금을 돌려받지 못하면 관할 법원에 임차권등기명령을 신청합니다. " +
      "등기부에 임차권이 올라가면 이사를 나가도 대항력과 우선변제권이 유지됩니다.",
    warning:
      "**등기가 완료된 것을 확인한 뒤에 이사하세요.** 신청만 하고 나가면 순위를 잃습니다.",
  },
  {
    order: 3,
    title: "보증보험에 가입했다면 보증이행을 청구한다",
    detail:
      "HUG·HF·SGI 등 보증보험에 가입했다면 보증기관에 이행을 청구합니다. " +
      "계약 종료 통지 증거, 임차권등기, 보증서가 필요합니다.",
    warning: "청구 기한이 정해져 있으므로 계약 종료 후 곧바로 확인하세요.",
  },
  {
    order: 4,
    title: "전세피해지원센터에 상담을 신청한다",
    detail:
      "국토교통부 전세피해지원센터와 지자체 창구에서 법률 상담, 긴급 주거 지원, " +
      "경·공매 대행을 안내받을 수 있습니다. 전세사기피해자 결정 신청도 여기서 안내합니다.",
    warning: null,
  },
  {
    order: 5,
    title: "보증금반환청구 소송 · 강제집행을 진행한다",
    detail:
      "지급명령이나 보증금반환청구 소송으로 집행권원을 확보한 뒤 강제경매를 신청합니다. " +
      "소액이면 지급명령이 빠르고 비용이 적습니다.",
    warning: null,
  },
];

// ---------------------------------------------------------------------------
// 조회 (순수 함수)
// ---------------------------------------------------------------------------

/** 검색·필터에 쓰기 위해 비교 가능한 형태로 낮춘다. */
function normalize(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

export interface GlossaryQuery {
  /** 검색어. 용어명 · 별칭 · 요약 · 설명을 모두 훑는다. */
  query?: string | null;
  /** 카테고리 필터. 비우면 전체. */
  category?: GlossaryCategory | null;
}

/**
 * 용어를 검색한다.
 *
 * 정렬 규칙: 용어명이 정확히 일치 → 용어명이 포함 → 별칭이 포함 → 본문이 포함.
 * 사용자가 "근저당"을 치면 `근저당권`이 맨 위에 와야 하기 때문이다.
 */
export function searchGlossary({ query, category }: GlossaryQuery = {}): GlossaryTerm[] {
  const pool = category ? GLOSSARY_TERMS.filter((t) => t.category === category) : GLOSSARY_TERMS;

  const q = query ? normalize(query) : "";
  if (q.length === 0) return [...pool];

  const scored: { term: GlossaryTerm; rank: number }[] = [];
  for (const term of pool) {
    const name = normalize(term.term);
    const aliasHit = term.aliases.some((a) => normalize(a).includes(q));
    const bodyHit = normalize(`${term.summary}${term.description}`).includes(q);

    const rank = name === q ? 0 : name.includes(q) ? 1 : aliasHit ? 2 : bodyHit ? 3 : -1;
    if (rank >= 0) scored.push({ term, rank });
  }

  return scored
    .sort((a, b) => a.rank - b.rank || a.term.term.localeCompare(b.term.term, "ko"))
    .map((s) => s.term);
}

/** 판정 항목 코드로 용어를 찾는다. 결과 화면의 "이게 무슨 말이죠?" 링크가 쓴다. */
export function findTermsByFinding(findingCode: string): GlossaryTerm[] {
  return GLOSSARY_TERMS.filter((t) => t.relatedFindings.includes(findingCode));
}
