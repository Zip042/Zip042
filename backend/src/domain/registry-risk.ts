import { diffDays, formatKo, isAfter, type DateOnly } from "../lib/date.js";
import { formatKrw, safeRatio, toPercent } from "./money.js";
import {
  RIGHT_LABEL_KO,
  maxRisk,
  type Finding,
  type RegistryExtraction,
  type RegistryRight,
  type RiskLevel,
} from "./types.js";
import { separateCancelledRights } from "./registry-cancellation.js";
import { cancelledEntriesNotice, validateRegistryExtraction } from "./registry-validation.js";

/**
 * 등기부등본 위험 규칙 엔진.
 *
 * 기획서 1-3의 문제의식("정보는 공개되어 있으나 사용자가 읽을 수 없다")에 직접 대응하는 모듈.
 * 각 규칙은 등기부의 한 줄을 "그래서 나에게 무슨 일이 생기는가"로 번역한다.
 *
 * 설계 규칙
 *  - AI는 **추출만** 한다. 위험 판정은 전부 이 결정론적 규칙 엔진이 한다.
 *    → 같은 등기부는 언제나 같은 판정을 받고, 판정 근거를 조문/숫자로 설명할 수 있다.
 *  - 말소된 권리(is_cancelled)는 위험에서 제외하되, 개수는 참고 정보로 남긴다.
 */

/** 소유권 취득이 이 기간 안이면 '최근 취득'으로 본다. 갭투자·명의대여 신호. */
const RECENT_OWNERSHIP_DAYS = 180;
/** 등기부 발급 후 이 기간이 지나면 재발급을 요구한다. */
const REGISTRY_FRESHNESS_DAYS = 7;
/** 근저당 건수가 이 값 이상이면 다중 담보로 본다. */
const MANY_MORTGAGES_COUNT = 3;

export interface RegistryRiskInput {
  registry: RegistryExtraction;
  /** 계약서상 임대인 이름 (교차검증용, 없으면 생략) */
  contractLessorName?: string | null;
  myDepositKrw: number;
  today: DateOnly;
}

export interface RegistryRiskResult {
  level: RiskLevel;
  /** 선순위 근저당 채권최고액 합계 (말소 제외) */
  seniorMortgageKrw: number;
  /** 전세권 · 가압류 · 압류 등 기타 선순위 청구 합계. 금액 미상 항목은 0으로 두고 findings로 경고한다. */
  otherSeniorClaimsKrw: number;
  activeRights: RegistryRight[];
  cancelledCount: number;
  /** 금액을 읽지 못한 활성 권리 개수 — 계산 신뢰도에 직접 영향 */
  unpricedRightsCount: number;
  findings: Finding[];
}

/** 이름 비교용 정규화: 공백·괄호 제거. 동명이인 문제는 생년월일로 별도 확인해야 한다. */
export function normalizeName(name: string | null | undefined): string {
  if (!name) return "";
  return name.replace(/[\s()（）·,]/g, "").trim();
}

const MONEY_BEARING: ReadonlySet<RegistryRight["type"]> = new Set([
  "mortgage",
  "jeonse_right",
  "lease_registration",
  "provisional_attachment",
  "attachment",
]);

export function evaluateRegistry(input: RegistryRiskInput): RegistryRiskResult {
  const { registry, myDepositKrw, today } = input;
  const findings: Finding[] = [];

  // 말소 걸러내기는 **코드가 이중으로** 한다. AI 의 isCancelled 만 믿으면 취소선을
  // 놓쳤을 때 이미 갚은 빚을 살아 있는 것으로 계산한다 (registry-cancellation.ts 참고).
  const cancellation = separateCancelledRights(registry.rights);
  const activeRights = cancellation.active;
  const cancelledCount = cancellation.cancelled.length;

  // 말소사항이 섞인 등기부였다면 조용히 넘기지 않고 사용자에게 알린다.
  if (cancellation.includesCancelledEntries) {
    findings.push(cancelledEntriesNotice(cancellation.rescuedByCode));
  }

  // 값이 말이 되는지 검산한다. 스키마는 형식만 보장하지 값의 타당성은 보장하지 않는다.
  findings.push(...validateRegistryExtraction({ registry, today }));

  const mortgages = activeRights.filter((r) => r.type === "mortgage");
  const seniorMortgageKrw = mortgages.reduce((sum, r) => sum + (r.maxClaimKrw ?? 0), 0);

  const otherSeniorClaimsKrw = activeRights
    .filter((r) => r.type !== "mortgage" && MONEY_BEARING.has(r.type))
    .reduce((sum, r) => sum + (r.maxClaimKrw ?? 0), 0);

  const unpricedRightsCount = activeRights.filter(
    (r) => MONEY_BEARING.has(r.type) && (r.maxClaimKrw === null || r.maxClaimKrw === undefined),
  ).length;

  const has = (type: RegistryRight["type"]) => activeRights.filter((r) => r.type === type);

  // ---------------------------------------------------------------------
  // 계약 자체가 위험한 신호 (critical)
  // ---------------------------------------------------------------------

  const trusts = has("trust");
  if (registry.isTrustProperty || trusts.length > 0) {
    findings.push({
      code: "RIGHTS_TRUST_REGISTERED",
      category: "rights",
      severity: "critical",
      weight: 45,
      title: "신탁등기가 되어 있어요 — 집주인에게 계약 권한이 없을 수 있습니다",
      description:
        "이 집은 신탁회사에 소유권이 넘어가 있습니다. 등기부에 이름이 있는 사람(위탁자)이 아니라 " +
        "신탁회사가 실제 소유자예요. 신탁회사의 서면 동의 없이 맺은 임대차계약은 무효로 판단될 수 있고, " +
        "그 경우 보증금을 한 푼도 돌려받지 못한 채 집을 비워야 할 수 있습니다.",
      action:
        "① 신탁원부를 발급받아 '임대 권한이 누구에게 있는지' 확인하세요. " +
        "② 신탁회사의 임대차 동의서(인감증명서 첨부)를 반드시 받으세요. " +
        "③ 동의서를 받을 수 없다면 계약하지 마세요.",
      evidence: {
        trustHolders: trusts.map((t) => t.holder).filter(Boolean),
        isTrustProperty: registry.isTrustProperty,
      },
      suggestTerms: ["TERM_TRUST_CONSENT_REQUIRED", "TERM_CONTRACT_VOID_ON_RIGHTS_CHANGE"],
    });
  }

  const auctions = has("auction");
  if (auctions.length > 0) {
    findings.push({
      code: "RIGHTS_AUCTION_STARTED",
      category: "rights",
      severity: "critical",
      weight: 50,
      title: "이미 경매가 시작된 집이에요",
      description:
        "등기부에 경매개시결정이 기재되어 있습니다. 지금 계약하면 경매 절차가 진행되는 중에 " +
        "들어가는 것이고, 낙찰자에게 대항할 수 없어 보증금을 잃고 집을 비워야 합니다.",
      action: "절대 계약하지 마세요. 계약금을 이미 냈다면 즉시 계약 해제와 반환을 요구하세요.",
      evidence: { entries: auctions.map((a) => ({ rankNo: a.rankNo, registeredOn: a.registeredOn })) },
    });
  }

  const attachments = [...has("attachment"), ...has("provisional_attachment")];
  if (attachments.length > 0) {
    const hasSeizure = has("attachment").length > 0;
    findings.push({
      code: hasSeizure ? "RIGHTS_ATTACHMENT" : "RIGHTS_PROVISIONAL_ATTACHMENT",
      category: "rights",
      severity: hasSeizure ? "critical" : "danger",
      weight: hasSeizure ? 40 : 30,
      title: hasSeizure ? "압류가 걸려 있어요" : "가압류가 걸려 있어요",
      description:
        (hasSeizure
          ? "세금이나 채무를 갚지 못해 국가·채권자가 이 집을 묶어둔 상태입니다. "
          : "채권자가 소송에 앞서 이 집을 처분하지 못하게 묶어둔 상태입니다. ") +
        "집주인이 이미 돈 문제를 겪고 있다는 뜻이고, 언제든 경매로 넘어갈 수 있습니다.",
      action:
        "계약을 보류하세요. 진행하려면 잔금일 전에 압류·가압류가 모두 말소된 등기부를 확인한 뒤 잔금을 내세요.",
      evidence: {
        entries: attachments.map((a) => ({
          type: RIGHT_LABEL_KO[a.type],
          holder: a.holder,
          amountKrw: a.maxClaimKrw,
          registeredOn: a.registeredOn,
        })),
      },
      suggestTerms: ["TERM_MORTGAGE_RELEASE_BEFORE_BALANCE", "TERM_CONTRACT_VOID_ON_RIGHTS_CHANGE"],
    });
  }

  const injunctions = has("injunction");
  if (injunctions.length > 0) {
    findings.push({
      code: "RIGHTS_INJUNCTION",
      category: "rights",
      severity: "critical",
      weight: 35,
      title: "처분금지가처분이 걸려 있어요",
      description:
        "이 집의 소유권을 두고 다툼이 진행 중입니다. 소송 결과에 따라 집주인이 바뀔 수 있고, " +
        "그 경우 계약이 유지될지 불확실합니다.",
      action: "소유권 분쟁이 끝날 때까지 계약하지 마세요.",
      evidence: { entries: injunctions.map((i) => ({ rankNo: i.rankNo, holder: i.holder })) },
    });
  }

  const leaseRegs = has("lease_registration");
  if (leaseRegs.length > 0) {
    findings.push({
      code: "RIGHTS_PRIOR_LEASE_REGISTRATION",
      category: "rights",
      severity: "critical",
      weight: 38,
      title: "앞선 세입자가 보증금을 못 받았다는 기록이 있어요",
      description:
        "임차권등기명령이 등기되어 있습니다. 이전 세입자가 보증금을 돌려받지 못해 법원에 신청한 " +
        "기록이에요. 이 집의 임대인은 이미 보증금을 반환하지 못한 전력이 있다는 뜻이고, " +
        "그 보증금이 내 순위보다 앞섭니다.",
      action:
        "계약을 권하지 않습니다. 진행하려면 해당 임차권등기가 말소된 것을 확인한 뒤에만 잔금을 내세요.",
      evidence: {
        entries: leaseRegs.map((l) => ({
          holder: l.holder,
          amountKrw: l.maxClaimKrw,
          registeredOn: l.registeredOn,
        })),
      },
      suggestTerms: ["TERM_MORTGAGE_RELEASE_BEFORE_BALANCE"],
    });
  }

  const provisionalRegs = has("provisional_registration");
  if (provisionalRegs.length > 0) {
    findings.push({
      code: "RIGHTS_PROVISIONAL_REGISTRATION",
      category: "rights",
      severity: "danger",
      weight: 28,
      title: "가등기가 있어요 — 소유자가 바뀔 수 있습니다",
      description:
        "누군가 이 집의 소유권을 넘겨받을 권리를 미리 확보해 둔 상태입니다(가등기). 그 사람이 " +
        "본등기를 하면 가등기 이후에 생긴 내 임차권은 밀려나 대항할 수 없게 됩니다.",
      action: "가등기 말소를 조건으로 하거나, 다른 집을 알아보세요.",
      evidence: { entries: provisionalRegs.map((p) => ({ rankNo: p.rankNo, holder: p.holder })) },
      suggestTerms: ["TERM_CONTRACT_VOID_ON_RIGHTS_CHANGE"],
    });
  }

  const jeonseRights = has("jeonse_right");
  if (jeonseRights.length > 0) {
    const total = jeonseRights.reduce((s, r) => s + (r.maxClaimKrw ?? 0), 0);
    findings.push({
      code: "RIGHTS_PRIOR_JEONSE",
      category: "rights",
      severity: "danger",
      weight: 25,
      title: "앞선 전세권이 등기되어 있어요",
      description:
        `전세권 ${jeonseRights.length}건${total > 0 ? ` (합계 ${formatKrw(total)})` : ""}이 나보다 앞서 있습니다. ` +
        "경매가 되면 이 금액이 먼저 배당되고 남은 돈으로 내 보증금을 받게 됩니다.",
      action: "전세권 말소 여부를 확인하고, 말소를 잔금 지급 조건으로 하세요.",
      evidence: { entries: jeonseRights.map((j) => ({ holder: j.holder, amountKrw: j.maxClaimKrw })) },
      suggestTerms: ["TERM_MORTGAGE_RELEASE_BEFORE_BALANCE"],
    });
  }

  // ---------------------------------------------------------------------
  // 근저당
  // ---------------------------------------------------------------------

  if (mortgages.length > 0) {
    const ratioToDeposit = safeRatio(seniorMortgageKrw, myDepositKrw);
    findings.push({
      code: "RIGHTS_MORTGAGE_PRESENT",
      category: "rights",
      severity: seniorMortgageKrw > myDepositKrw ? "danger" : "caution",
      weight: seniorMortgageKrw > myDepositKrw ? 20 : 8,
      title: `근저당권 ${mortgages.length}건 (채권최고액 합계 ${formatKrw(seniorMortgageKrw)})`,
      description:
        `이 집은 은행 등에 담보로 잡혀 있습니다. 채권최고액은 실제 빌린 돈이 아니라 **담보 한도**이고, ` +
        `보통 실제 대출금의 110~120% 수준으로 설정됩니다. 경매가 되면 이 금액이 내 보증금보다 먼저 배당돼요.` +
        (ratioToDeposit !== null
          ? ` 내 보증금(${formatKrw(myDepositKrw)}) 대비 ${toPercent(ratioToDeposit)}% 규모입니다.`
          : ""),
      action:
        "은행에 '대출 잔액 확인서' 또는 임대인이 발급한 부채증명서를 요구해 실제 남은 빚을 확인하세요. " +
        "채권최고액이 클수록 잔금일 전 일부 상환·말소를 요구하는 것이 안전합니다.",
      evidence: {
        count: mortgages.length,
        totalMaxClaimKrw: seniorMortgageKrw,
        entries: mortgages.map((m) => ({
          rankNo: m.rankNo,
          holder: m.holder,
          maxClaimKrw: m.maxClaimKrw,
          registeredOn: m.registeredOn,
          // 이 값을 등기부 어디에서 읽었는지. 사용자에게 근거를 보여줄 때 쓴다.
          sourceQuote: m.sourceQuote ?? null,
        })),
      },
      suggestTerms: ["TERM_DEBT_CERTIFICATE", "TERM_NO_NEW_ENCUMBRANCE"],
    });

    if (mortgages.length >= MANY_MORTGAGES_COUNT) {
      findings.push({
        code: "RIGHTS_MANY_MORTGAGES",
        category: "rights",
        severity: "danger",
        weight: 15,
        title: `근저당이 ${mortgages.length}건이나 있어요`,
        description:
          "한 집에 담보가 여러 건 겹쳐 있다는 것은 집주인이 여러 곳에서 돈을 빌렸다는 뜻입니다. " +
          "2순위·3순위 담보는 보통 이자가 높은 대출이라, 자금 사정이 좋지 않다는 신호예요.",
        action: "다른 집을 알아보는 것을 권합니다.",
        evidence: { count: mortgages.length },
      });
    }

    if (unpricedRightsCount > 0) {
      findings.push({
        code: "RIGHTS_AMOUNT_UNREADABLE",
        category: "rights",
        kind: "info_gap",
        // 채권최고액을 못 읽으면 부담률(빚+보증금 / 시세)을 계산할 수 없다 → 판정 차단 항목.
        severity: "danger",
        weight: 10,
        title: "금액을 읽지 못한 권리가 있어요",
        description:
          `등기부에서 ${unpricedRightsCount}건의 권리 금액을 판독하지 못했습니다. 이 금액이 빠진 상태로 ` +
          "계산했기 때문에, 실제 위험은 표시된 것보다 클 수 있습니다.",
        action: "등기부등본을 더 선명하게 다시 올려주거나, 해당 항목의 금액을 직접 입력해 주세요.",
        evidence: { unpricedRightsCount },
      });
    }
  }

  // ---------------------------------------------------------------------
  // 소유자
  // ---------------------------------------------------------------------

  if (registry.ownerNames.length === 0) {
    findings.push({
      code: "RIGHTS_OWNER_UNREADABLE",
      category: "rights",
      kind: "info_gap",
      severity: "danger",
      weight: 20,
      title: "등기부에서 소유자를 확인하지 못했어요",
      description:
        "소유자 이름을 읽지 못했습니다. 계약에서 가장 먼저 확인해야 하는 것이 '계약하는 사람이 진짜 " +
        "소유자인지'인데, 그 확인을 못 한 상태예요.",
      action: "등기부등본 갑구가 잘 보이도록 다시 올려주세요.",
    });
  } else if (registry.ownerNames.length > 1) {
    findings.push({
      code: "RIGHTS_MULTIPLE_OWNERS",
      category: "rights",
      severity: "caution",
      weight: 8,
      title: `공동소유입니다 (소유자 ${registry.ownerNames.length}명)`,
      description:
        "소유자가 여러 명이면 원칙적으로 지분 과반의 동의가 있어야 임대차계약이 유효합니다. " +
        "일부 소유자만 서명한 계약은 나중에 다른 소유자가 무효를 주장할 수 있어요.",
      action: "소유자 전원의 서명 또는 인감증명서가 첨부된 위임장을 받으세요.",
      evidence: { owners: registry.ownerNames },
      suggestTerms: ["TERM_ALL_OWNERS_CONSENT"],
    });
  }

  if (input.contractLessorName && registry.ownerNames.length > 0) {
    const contractName = normalizeName(input.contractLessorName);
    const matched = registry.ownerNames.some((o) => normalizeName(o) === contractName);
    if (!matched) {
      findings.push({
        code: "RIGHTS_OWNER_NAME_MISMATCH",
        category: "rights",
        severity: "critical",
        weight: 45,
        title: "계약서의 임대인이 등기부 소유자와 달라요",
        description:
          `계약서에는 '${input.contractLessorName}'이 임대인으로 적혀 있는데, 등기부상 소유자는 ` +
          `${registry.ownerNames.join(", ")}입니다. 소유자가 아닌 사람과의 계약은 무효가 될 수 있고, ` +
          "전세사기에서 가장 흔한 형태입니다.",
        action:
          "① 임대인이 대리인이라면 인감증명서가 첨부된 위임장 원본을 확인하세요. " +
          "② 설명이 없다면 계약하지 마세요. 계약금을 이미 보냈다면 즉시 반환을 요구하세요.",
        evidence: {
          contractLessorName: input.contractLessorName,
          registryOwners: registry.ownerNames,
        },
        suggestTerms: ["TERM_LESSOR_IDENTITY"],
      });
    }
  }

  if (registry.ownershipAcquiredOn) {
    const heldDays = diffDays(registry.ownershipAcquiredOn, today);
    if (heldDays >= 0 && heldDays <= RECENT_OWNERSHIP_DAYS) {
      findings.push({
        code: "RIGHTS_RECENT_OWNERSHIP",
        category: "rights",
        severity: "danger",
        weight: 22,
        title: `집주인이 이 집을 산 지 ${heldDays}일밖에 안 됐어요`,
        description:
          `소유권 취득일이 ${formatKo(registry.ownershipAcquiredOn)}입니다. 보증금으로 집값을 치르는 ` +
          "'갭투자'이거나, 명의만 빌려준 사람(이른바 바지사장)일 가능성이 있습니다. " +
          "전세사기 사례에서 자주 나타나는 패턴이에요.",
        action:
          "매매가와 내 보증금을 비교해 보세요. 보증금이 매매가에 가깝다면 위험합니다. " +
          "임대인의 소득·세금 완납 증명(국세·지방세 납세증명서)을 요구하세요.",
        evidence: { ownershipAcquiredOn: registry.ownershipAcquiredOn, heldDays },
        suggestTerms: ["TERM_TAX_CERTIFICATE", "TERM_NO_NEW_ENCUMBRANCE"],
      });
    }
  }

  // ---------------------------------------------------------------------
  // 건물 유형 · 문서 신선도 · 판독 실패
  // ---------------------------------------------------------------------

  if (!registry.isSectionedBuilding) {
    findings.push({
      code: "RIGHTS_NOT_SECTIONED_BUILDING",
      category: "rights",
      kind: "info_gap",
      severity: "caution",
      weight: 12,
      title: "호수별로 등기가 나뉘어 있지 않아요 (다가구·단독)",
      description:
        "이 등기부는 건물 전체에 대한 것이고, 내가 살 호수만 따로 등기되어 있지 않습니다. " +
        "즉 건물에 걸린 빚 전체가 내 보증금보다 앞서고, 다른 호수 세입자들의 보증금도 앞섭니다.",
      action:
        "'확정일자 부여현황'과 '전입세대확인서'를 임대인에게 요구해 앞선 세입자들의 보증금 총액을 확인하세요.",
      evidence: { isSectionedBuilding: false },
      suggestTerms: ["TERM_PRIOR_TENANT_DISCLOSURE"],
    });
  }

  if (registry.issuedOn) {
    const age = diffDays(registry.issuedOn, today);
    if (age > REGISTRY_FRESHNESS_DAYS) {
      findings.push({
        code: "RIGHTS_STALE_REGISTRY",
        category: "rights",
        kind: "info_gap",
        severity: age > 30 ? "danger" : "caution",
        weight: age > 30 ? 15 : 8,
        title: `등기부등본이 ${age}일 전 것이에요`,
        description:
          `발급일이 ${formatKo(registry.issuedOn)}입니다. 등기부는 하루 만에도 바뀝니다. ` +
          "오래된 등기부로 판단하면 그 사이 새로 생긴 근저당이나 소유권 변동을 놓칩니다.",
        action: "인터넷등기소에서 오늘 날짜로 다시 발급받아 올려주세요. (열람 700원)",
        evidence: { issuedOn: registry.issuedOn, ageDays: age },
      });
    } else if (isAfter(registry.issuedOn, today)) {
      findings.push({
        code: "RIGHTS_REGISTRY_DATE_INVALID",
        category: "rights",
        kind: "info_gap",
        severity: "caution",
        weight: 5,
        title: "등기부 발급일이 미래로 읽혔어요",
        description: "문서에서 읽어낸 발급일이 오늘보다 미래입니다. 판독 오류일 수 있습니다.",
        action: "발급일이 잘 보이도록 다시 올려주세요.",
        evidence: { issuedOn: registry.issuedOn, today },
      });
    }
  } else {
    findings.push({
      code: "RIGHTS_ISSUE_DATE_UNKNOWN",
      category: "rights",
      kind: "info_gap",
      severity: "caution",
      weight: 5,
      title: "등기부 발급일을 확인하지 못했어요",
      description: "언제 발급된 등기부인지 알 수 없어, 지금 상태를 반영한 것인지 확인할 수 없습니다.",
      action: "발급일이 보이는 전체 페이지를 올려주세요.",
    });
  }

  if (registry.unreadableSections.length > 0) {
    findings.push({
      code: "RIGHTS_PARTIALLY_UNREADABLE",
      category: "rights",
      kind: "info_gap",
      severity: "caution",
      weight: 10,
      title: "등기부 일부를 읽지 못했어요",
      description:
        `다음 부분을 판독하지 못했습니다: ${registry.unreadableSections.join(", ")}. ` +
        "읽지 못한 부분에 중요한 권리가 숨어 있을 수 있습니다.",
      action: "해당 페이지를 더 선명하게 다시 올려주세요.",
      evidence: { sections: registry.unreadableSections },
    });
  }

  if (activeRights.length === 0 && registry.ownerNames.length > 0 && !registry.isTrustProperty) {
    findings.push({
      code: "RIGHTS_CLEAN",
      category: "rights",
      severity: "safe",
      weight: 0,
      title: "등기부가 깨끗해요",
      description:
        "근저당·가압류 등 나보다 앞서는 권리가 발견되지 않았습니다. " +
        (cancelledCount > 0 ? `(말소된 권리 ${cancelledCount}건은 위험 계산에서 제외했습니다.) ` : "") +
        "다만 등기부는 잔금일에도 바뀔 수 있으니, 잔금 보내기 직전에 반드시 다시 확인하세요.",
      action: "잔금일 당일 오전에 등기부등본을 재발급해 대조하세요.",
      evidence: { cancelledCount },
      suggestTerms: ["TERM_NO_NEW_ENCUMBRANCE", "TERM_REGISTRY_STATE_AT_BALANCE"],
    });
  }

  return {
    // 카테고리 등급은 **실제 위험만으로** 낸다.
    // info_gap 을 섞으면 "사진이 흐림"만으로 이 항목이 danger 로 보인다 (설계 원칙 3).
    // 확인 못 한 항목은 verdict 의 informationGaps 로 따로 나간다.
    level: maxRisk(...findings.filter((f) => f.kind !== "info_gap").map((f) => f.severity)),
    seniorMortgageKrw,
    otherSeniorClaimsKrw,
    activeRights,
    cancelledCount,
    unpricedRightsCount,
    findings,
  };
}
