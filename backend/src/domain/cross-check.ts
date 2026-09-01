import { diffDays, formatKo, isAfter, isBefore, type DateOnly } from "../lib/date.js";
import { formatKrw } from "./money.js";
import { normalizeName } from "./registry-risk.js";
import {
  maxRisk,
  type BrokerageStatementExtraction,
  type Finding,
  type LeaseDraftExtraction,
  type RegistryExtraction,
  type RiskLevel,
} from "./types.js";

/**
 * 서류 교차검증.
 *
 * 등기부등본 · 중개대상물 확인·설명서 · 임대차계약서 초안, 그리고 사용자가 입력한 거래 조건까지
 * 네 개의 출처를 서로 대조한다. 전세사기의 상당수는 "한 서류에는 맞게 적혀 있고 다른 서류에는
 * 다르게 적혀 있는" 형태로 흔적을 남기기 때문에, 단일 서류 분석만으로는 잡히지 않는다.
 *
 * 원칙: 값이 없는 것(미제출·판독실패)과 값이 다른 것(불일치)을 반드시 구분한다.
 *       없는 것을 '일치'로 처리하면 검증하지 않은 것을 검증했다고 말하는 셈이 된다.
 */

/** 면적 비교 허용 오차(㎡). 서류마다 소수점 표기가 달라 이 정도는 같은 값으로 본다. */
const AREA_TOLERANCE_M2 = 0.5;
/** 확인·설명서 발급일이 계약일보다 이 일수 이상 오래되면 경고 */
const STATEMENT_STALE_DAYS = 30;

export type MatchStatus = "match" | "mismatch" | "unknown";

export interface FieldComparison {
  field: string;
  label: string;
  status: MatchStatus;
  values: Record<string, string | number | null>;
}

export interface CaseFacts {
  roadAddress?: string | null;
  detailAddress?: string | null;
  exclusiveAreaM2?: number | null;
  depositKrw: number;
  monthlyRentKrw: number;
  maintenanceFeeKrw: number;
  contractDate?: DateOnly | null;
  balanceDate?: DateOnly | null;
  isMultiHousehold: boolean;
  today: DateOnly;
}

export interface CrossCheckInput {
  facts: CaseFacts;
  registry?: RegistryExtraction | null;
  brokerage?: BrokerageStatementExtraction | null;
  lease?: LeaseDraftExtraction | null;
}

export interface CrossCheckResult {
  level: RiskLevel;
  submitted: { registry: boolean; brokerage: boolean; lease: boolean };
  comparisons: FieldComparison[];
  findings: Finding[];
}

/**
 * 주소 정규화 — 도로명/지번 주소를 비교 가능한 형태로 줄인다.
 * 완벽한 주소 매칭은 도로명주소 API가 필요하므로, 여기서는 **불일치를 놓치지 않는 쪽**으로
 * 보수적으로 판단하고 확신이 없으면 unknown 을 낸다.
 */
export function normalizeAddress(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/대한민국/g, "")
    .replace(/[()（）\[\]]/g, " ")
    .replace(/제(?=\d)/g, "") // '제3층' → '3층'
    .replace(/\s+/g, "")
    .trim();
}

/** 주소에서 숫자 토큰(건물번호 · 동 · 호)만 뽑는다. 표기 차이에 덜 민감한 비교 키. */
export function addressNumberTokens(input: string | null | undefined): string[] {
  if (!input) return [];
  return (input.match(/\d+(?:-\d+)?/g) ?? []).filter((t) => t.length > 0);
}

function compareAddress(a: string | null | undefined, b: string | null | undefined): MatchStatus {
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  if (!na || !nb) return "unknown";
  if (na === nb) return "match";
  if (na.includes(nb) || nb.includes(na)) return "match";

  const ta = addressNumberTokens(na);
  const tb = addressNumberTokens(nb);
  if (ta.length === 0 || tb.length === 0) return "unknown";
  // 건물번호(첫 숫자 토큰)가 다르면 확실히 다른 주소다.
  if (ta[0] !== tb[0]) return "mismatch";
  // 건물번호는 같은데 나머지 토큰이 다르면 동·호수 표기 차이일 수 있어 단정하지 않는다.
  return ta.join(",") === tb.join(",") ? "match" : "unknown";
}

function compareNumber(
  a: number | null | undefined,
  b: number | null | undefined,
  tolerance = 0,
): MatchStatus {
  if (a === null || a === undefined || b === null || b === undefined) return "unknown";
  return Math.abs(a - b) <= tolerance ? "match" : "mismatch";
}

function compareNameToList(
  name: string | null | undefined,
  list: string[] | null | undefined,
): MatchStatus {
  const n = normalizeName(name);
  if (!n || !list || list.length === 0) return "unknown";
  return list.some((x) => normalizeName(x) === n) ? "match" : "mismatch";
}

export function crossCheck(input: CrossCheckInput): CrossCheckResult {
  const { facts, registry, brokerage, lease } = input;
  const findings: Finding[] = [];
  const comparisons: FieldComparison[] = [];

  const submitted = {
    registry: Boolean(registry),
    brokerage: Boolean(brokerage),
    lease: Boolean(lease),
  };

  // ---------------------------------------------------------------------
  // 미제출 서류 안내 (권장 서류이므로 danger가 아니라 caution)
  // ---------------------------------------------------------------------
  if (!registry) {
    findings.push({
      code: "DOC_REGISTRY_MISSING",
      category: "document",
      kind: "info_gap",
      severity: "danger",
      weight: 25,
      title: "등기부등본이 없어요 — 핵심 점검을 못 했습니다",
      description:
        "등기부등본은 이 서비스의 판정에서 가장 중요한 서류입니다. 없으면 집주인이 누구인지, " +
        "빚이 얼마나 잡혀 있는지 전혀 확인할 수 없습니다.",
      action: "인터넷등기소(iros.go.kr)에서 열람용으로 발급(700원)해 올려주세요.",
    });
  }
  if (!brokerage) {
    findings.push({
      code: "DOC_BROKERAGE_STATEMENT_MISSING",
      category: "document",
      kind: "info_gap",
      severity: "caution",
      weight: 8,
      title: "중개대상물 확인·설명서가 없어요",
      description:
        "중개사가 반드시 작성해 교부해야 하는 서류입니다(공인중개사법). 이 서류가 있으면 중개사가 " +
        "설명한 내용과 등기부가 일치하는지 대조할 수 있고, 나중에 분쟁이 생겼을 때 중개사 책임을 " +
        "묻는 근거가 됩니다.",
      action: "계약 전에 중개사에게 서명·날인된 확인·설명서를 요구하세요. 안 주면 계약을 미루세요.",
    });
  }
  if (!lease) {
    findings.push({
      code: "DOC_LEASE_DRAFT_MISSING",
      category: "document",
      kind: "info_gap",
      severity: "caution",
      weight: 6,
      title: "임대차 계약서 초안이 없어요",
      description:
        "계약서 초안이 있으면 서명 전에 금액·날짜·특약을 미리 검토할 수 있습니다. " +
        "현장에서 처음 보고 서명하면 불리한 조항을 놓치기 쉽습니다.",
      action: "중개사에게 계약서 초안을 미리 받아 올려주세요.",
    });
  }

  // ---------------------------------------------------------------------
  // 주소
  // ---------------------------------------------------------------------
  const addressStatuses: MatchStatus[] = [];
  if (registry?.address) {
    const s = compareAddress(registry.address, facts.roadAddress);
    addressStatuses.push(s);
    comparisons.push({
      field: "address.registry_vs_input",
      label: "등기부 주소 ↔ 입력 주소",
      status: s,
      values: { registry: registry.address, input: facts.roadAddress ?? null },
    });
  }
  if (lease?.address && registry?.address) {
    const s = compareAddress(lease.address, registry.address);
    addressStatuses.push(s);
    comparisons.push({
      field: "address.lease_vs_registry",
      label: "계약서 주소 ↔ 등기부 주소",
      status: s,
      values: { lease: lease.address, registry: registry.address },
    });
  }
  if (brokerage?.address && registry?.address) {
    const s = compareAddress(brokerage.address, registry.address);
    addressStatuses.push(s);
    comparisons.push({
      field: "address.brokerage_vs_registry",
      label: "확인·설명서 주소 ↔ 등기부 주소",
      status: s,
      values: { brokerage: brokerage.address, registry: registry.address },
    });
  }

  if (addressStatuses.includes("mismatch")) {
    findings.push({
      code: "DOC_ADDRESS_MISMATCH",
      category: "document",
      severity: "critical",
      weight: 40,
      title: "서류마다 주소가 달라요",
      description:
        "등기부등본 · 계약서 · 확인·설명서에 적힌 주소가 서로 다릅니다. 다른 집의 등기부를 보여주고 " +
        "실제로는 빚이 많은 집을 계약하게 만드는 수법이 실제로 있습니다. 확정일자도 주소가 정확해야 효력이 있어요.",
      action:
        "세 서류의 주소(동·호수까지)가 완전히 같은지 직접 대조하세요. 하나라도 다르면 계약을 진행하지 마세요.",
      evidence: {
        registry: registry?.address ?? null,
        lease: lease?.address ?? null,
        brokerage: brokerage?.address ?? null,
        input: facts.roadAddress ?? null,
      },
      suggestTerms: ["TERM_ADDRESS_EXACT"],
    });
  }

  // 동·호수 누락은 확정일자 효력과 직결된다.
  if (lease && !lease.detailAddress && !facts.detailAddress) {
    findings.push({
      code: "DOC_DETAIL_ADDRESS_MISSING",
      category: "document",
      kind: "info_gap",
      severity: "danger",
      weight: 18,
      title: "계약서에 동·호수가 없어요",
      description:
        "다세대·다가구 주택에서 계약서에 호수가 정확히 적혀 있지 않으면, 확정일자를 받아도 " +
        "우선변제권이 인정되지 않을 수 있습니다(대법원 판례). 실제 문패·우편함과 등기부상 호수가 " +
        "다른 경우도 있어 반드시 확인해야 합니다.",
      action:
        "등기부등본에 적힌 호수 표기를 그대로 계약서에 적어 넣으세요. 현관 문패와 다르면 등기부 기준으로 씁니다.",
      suggestTerms: ["TERM_ADDRESS_EXACT"],
    });
  }

  // ---------------------------------------------------------------------
  // 임대인 / 소유자
  // ---------------------------------------------------------------------
  if (lease?.lessorName && registry?.ownerNames?.length) {
    const s = compareNameToList(lease.lessorName, registry.ownerNames);
    comparisons.push({
      field: "lessor.lease_vs_registry",
      label: "계약서 임대인 ↔ 등기부 소유자",
      status: s,
      values: { lease: lease.lessorName, registry: registry.ownerNames.join(", ") },
    });
    // 불일치 자체는 registry-risk 의 RIGHTS_OWNER_NAME_MISMATCH 가 담당한다(중복 방지).
  }

  if (brokerage?.ownerName && registry?.ownerNames?.length) {
    const s = compareNameToList(brokerage.ownerName, registry.ownerNames);
    comparisons.push({
      field: "lessor.brokerage_vs_registry",
      label: "확인·설명서 소유자 ↔ 등기부 소유자",
      status: s,
      values: { brokerage: brokerage.ownerName, registry: registry.ownerNames.join(", ") },
    });
    if (s === "mismatch") {
      findings.push({
        code: "DOC_OWNER_MISMATCH_BROKERAGE",
        category: "document",
        severity: "danger",
        weight: 25,
        title: "확인·설명서의 소유자가 등기부와 달라요",
        description:
          `확인·설명서에는 '${brokerage.ownerName}', 등기부에는 '${registry.ownerNames.join(", ")}'로 ` +
          "적혀 있습니다. 중개사가 소유자를 잘못 확인했거나, 서류 자체가 다른 집 것일 수 있습니다.",
        action: "중개사에게 즉시 확인을 요구하고, 등기부 기준으로 정정된 서류를 받으세요.",
        evidence: { brokerage: brokerage.ownerName, registry: registry.ownerNames },
      });
    }
  }

  // 계좌 명의 불일치 — 보증금을 엉뚱한 사람에게 보내는 사고를 막는다.
  if (lease?.lessorAccountHolder && lease?.lessorName) {
    const s = compareNameToList(lease.lessorAccountHolder, [lease.lessorName]);
    comparisons.push({
      field: "account_holder.vs_lessor",
      label: "입금 계좌 명의 ↔ 임대인",
      status: s,
      values: { accountHolder: lease.lessorAccountHolder, lessor: lease.lessorName },
    });
    if (s === "mismatch") {
      findings.push({
        code: "DOC_ACCOUNT_HOLDER_MISMATCH",
        category: "document",
        severity: "critical",
        weight: 35,
        title: "보증금 입금 계좌의 명의가 임대인과 달라요",
        description:
          `계약서에 적힌 입금 계좌 명의는 '${lease.lessorAccountHolder}'인데 임대인은 ` +
          `'${lease.lessorName}'입니다. 제3자 계좌로 보증금을 보내면 돌려받기가 매우 어려워집니다.`,
        action:
          "반드시 등기부상 소유자 본인 명의 계좌로만 송금하세요. 가족·법인·중개사 계좌 요구는 거절하세요.",
        evidence: { accountHolder: lease.lessorAccountHolder, lessorName: lease.lessorName },
        suggestTerms: ["TERM_PAYMENT_TO_OWNER_ACCOUNT"],
      });
    }
  }

  // ---------------------------------------------------------------------
  // 면적
  // ---------------------------------------------------------------------
  const areaValues: Record<string, number | null> = {
    registry: registry?.exclusiveAreaM2 ?? null,
    brokerage: brokerage?.exclusiveAreaM2 ?? null,
    lease: lease?.exclusiveAreaM2 ?? null,
    input: facts.exclusiveAreaM2 ?? null,
  };
  const knownAreas = Object.entries(areaValues).filter(([, v]) => v !== null) as [string, number][];
  if (knownAreas.length >= 2) {
    const min = Math.min(...knownAreas.map(([, v]) => v));
    const max = Math.max(...knownAreas.map(([, v]) => v));
    const status: MatchStatus = max - min <= AREA_TOLERANCE_M2 ? "match" : "mismatch";
    comparisons.push({
      field: "area.cross",
      label: "전용면적 대조",
      status,
      values: areaValues,
    });
    if (status === "mismatch") {
      findings.push({
        code: "DOC_AREA_MISMATCH",
        category: "document",
        severity: "danger",
        weight: 15,
        title: "서류마다 전용면적이 달라요",
        description:
          `면적이 ${min}㎡ ~ ${max}㎡로 서로 다릅니다. 면적은 시세 계산의 기준이라 값이 틀리면 ` +
          "깡통전세 판정도 틀립니다. 다른 호수의 서류가 섞였을 가능성도 있습니다.",
        action: "등기부등본 표제부의 전용면적을 기준으로 다른 서류를 정정하도록 요구하세요.",
        evidence: areaValues,
      });
    }
  }

  // ---------------------------------------------------------------------
  // 금액 — 계약서 ↔ 사용자 입력
  // ---------------------------------------------------------------------
  if (lease) {
    const depositStatus = compareNumber(lease.depositKrw, facts.depositKrw);
    comparisons.push({
      field: "deposit.lease_vs_input",
      label: "계약서 보증금 ↔ 입력 보증금",
      status: depositStatus,
      values: { lease: lease.depositKrw ?? null, input: facts.depositKrw },
    });
    if (depositStatus === "mismatch") {
      findings.push({
        code: "DOC_DEPOSIT_MISMATCH",
        category: "document",
        severity: "danger",
        weight: 20,
        title: "계약서 보증금이 입력한 금액과 달라요",
        description:
          `계약서에는 ${formatKrw(lease.depositKrw!)}, 입력값은 ${formatKrw(facts.depositKrw)}입니다. ` +
          "이 서비스의 모든 위험 계산은 보증금 금액을 기준으로 하므로, 어느 쪽이 맞는지 먼저 확정해야 합니다.",
        action: "계약서 금액이 협의한 금액과 같은지 확인하세요. 숫자와 한글 표기가 함께 적혀 있는지도 보세요.",
        evidence: { lease: lease.depositKrw, input: facts.depositKrw },
      });
    }

    const rentStatus = compareNumber(lease.monthlyRentKrw, facts.monthlyRentKrw);
    comparisons.push({
      field: "monthly_rent.lease_vs_input",
      label: "계약서 월세 ↔ 입력 월세",
      status: rentStatus,
      values: { lease: lease.monthlyRentKrw ?? null, input: facts.monthlyRentKrw },
    });
    if (rentStatus === "mismatch") {
      findings.push({
        code: "DOC_RENT_MISMATCH",
        category: "document",
        severity: "caution",
        weight: 8,
        title: "계약서 월세가 입력한 금액과 달라요",
        description: `계약서 ${formatKrw(lease.monthlyRentKrw!)} vs 입력 ${formatKrw(facts.monthlyRentKrw)}.`,
        action: "월세와 관리비가 구분되어 적혀 있는지 확인하세요.",
        evidence: { lease: lease.monthlyRentKrw, input: facts.monthlyRentKrw },
      });
    }

    // 계약금 + 잔금 = 보증금 검산
    if (
      lease.depositKrw !== null &&
      lease.depositKrw !== undefined &&
      lease.downPaymentKrw !== null &&
      lease.downPaymentKrw !== undefined &&
      lease.balanceKrw !== null &&
      lease.balanceKrw !== undefined
    ) {
      const sum = lease.downPaymentKrw + lease.balanceKrw;
      const status: MatchStatus = sum === lease.depositKrw ? "match" : "mismatch";
      comparisons.push({
        field: "deposit.sum_check",
        label: "계약금 + 잔금 = 보증금",
        status,
        values: {
          downPayment: lease.downPaymentKrw,
          balance: lease.balanceKrw,
          sum,
          deposit: lease.depositKrw,
        },
      });
      if (status === "mismatch") {
        findings.push({
          code: "DOC_DEPOSIT_SUM_MISMATCH",
          category: "document",
          severity: "danger",
          weight: 15,
          title: "계약금과 잔금을 더한 금액이 보증금과 맞지 않아요",
          description:
            `계약금 ${formatKrw(lease.downPaymentKrw)} + 잔금 ${formatKrw(lease.balanceKrw)} = ` +
            `${formatKrw(sum)}인데, 보증금은 ${formatKrw(lease.depositKrw)}로 적혀 있습니다. ` +
            `차액 ${formatKrw(Math.abs(lease.depositKrw - sum))}이 설명되지 않습니다.`,
          action: "중도금이 따로 있는지 확인하고, 없다면 계약서를 정정하세요.",
          evidence: { downPayment: lease.downPaymentKrw, balance: lease.balanceKrw, sum, deposit: lease.depositKrw },
        });
      }
    }

    // 날짜 대조
    if (lease.contractDate && facts.contractDate && lease.contractDate !== facts.contractDate) {
      findings.push({
        code: "DOC_CONTRACT_DATE_MISMATCH",
        category: "document",
        severity: "caution",
        weight: 6,
        title: "계약서의 계약일이 입력한 날짜와 달라요",
        description: `계약서 ${formatKo(lease.contractDate)} vs 입력 ${formatKo(facts.contractDate)}.`,
        action: "일정 계산이 달라지므로 실제 계약일로 맞춰 주세요.",
        evidence: { lease: lease.contractDate, input: facts.contractDate },
      });
    }
    if (lease.balanceDate && facts.balanceDate && lease.balanceDate !== facts.balanceDate) {
      findings.push({
        code: "DOC_BALANCE_DATE_MISMATCH",
        category: "document",
        severity: "danger",
        weight: 12,
        title: "계약서의 잔금일이 입력한 날짜와 달라요",
        description:
          `계약서 ${formatKo(lease.balanceDate)} vs 입력 ${formatKo(facts.balanceDate)}. ` +
          "잔금일은 전입신고·대항력 발생 시점의 기준이므로 반드시 일치해야 합니다.",
        action: "실제 잔금일로 통일하고, 전입신고 일정도 다시 확인하세요.",
        evidence: { lease: lease.balanceDate, input: facts.balanceDate },
      });
    }

    if (lease.signedByLessor === false) {
      findings.push({
        code: "DOC_LEASE_NOT_SIGNED",
        category: "document",
        severity: "caution",
        // 초안 단계에서는 서명이 없는 것이 정상이므로 가중치를 낮게 둔다.
        weight: 2,
        title: "계약서에 임대인 서명·날인이 없어요",
        description: "초안 단계라면 정상입니다. 실제 계약 시에는 임대인 본인의 서명 또는 인감이 반드시 필요합니다.",
        action: "서명 전 신분증 원본과 대조하고, 대리인이면 위임장·인감증명서를 확인하세요.",
      });
    }

    if (lease.specialTerms.length === 0) {
      findings.push({
        code: "DOC_NO_SPECIAL_TERMS",
        category: "contract",
        severity: "caution",
        weight: 10,
        title: "계약서에 특약사항이 하나도 없어요",
        description:
          "표준계약서의 기본 조항만으로는 잔금일 근저당 설정, 권리 변동 같은 위험을 막을 수 없습니다. " +
          "특약은 나중에 문제가 생겼을 때 계약을 해제하고 보증금을 돌려받을 수 있는 근거가 됩니다.",
        action: "아래 추천 특약을 계약서 특약사항란에 직접 적어 넣고 양쪽이 서명하세요.",
      });
    }
  }

  // ---------------------------------------------------------------------
  // 중개대상물 확인·설명서 고유 점검
  // ---------------------------------------------------------------------
  if (brokerage) {
    // (1) 권리관계 미기재 — 중개사 설명의무 위반 신호
    const registryHasEncumbrance =
      (registry?.rights ?? []).some(
        (r) => !r.isCancelled && (r.type === "mortgage" || r.type === "jeonse_right"),
      ) || false;
    if (registryHasEncumbrance && brokerage.declaredEncumbrances.length === 0) {
      findings.push({
        code: "DOC_ENCUMBRANCE_NOT_DISCLOSED",
        category: "document",
        severity: "danger",
        weight: 28,
        title: "등기부에는 담보가 있는데 확인·설명서에는 안 적혀 있어요",
        description:
          "등기부등본에 근저당권(또는 전세권)이 있는데, 중개사가 작성한 확인·설명서의 권리관계란에는 " +
          "기재되어 있지 않습니다. 공인중개사법상 설명의무 위반에 해당할 수 있고, 이 기록은 나중에 " +
          "중개사와 공제기관에 손해배상을 청구할 근거가 됩니다.",
        action:
          "중개사에게 권리관계란을 정확히 다시 작성해 달라고 요구하세요. 거부하면 다른 중개사무소를 이용하세요. " +
          "지금 상태의 서류는 반드시 사진으로 보관하세요.",
        evidence: {
          registryEncumbrances: (registry?.rights ?? [])
            .filter((r) => !r.isCancelled && (r.type === "mortgage" || r.type === "jeonse_right"))
            .map((r) => ({ type: r.type, amountKrw: r.maxClaimKrw })),
          declared: brokerage.declaredEncumbrances,
        },
        suggestTerms: ["TERM_BROKER_LIABILITY"],
      });
    }

    // (2) 위반건축물
    if (brokerage.isIllegalBuilding === true) {
      findings.push({
        code: "DOC_ILLEGAL_BUILDING",
        category: "document",
        severity: "danger",
        weight: 25,
        title: "위반건축물로 표시된 집이에요",
        description:
          "건축물대장에 위반건축물로 등재된 집입니다. 전세보증금 반환보증(HUG 등) 가입이 거절되는 " +
          "대표적인 사유이고, 이행강제금이 계속 부과되면 임대인의 자금 사정이 나빠집니다. " +
          "불법 증축 부분은 철거 명령 대상이 될 수도 있습니다.",
        action:
          "보증보험 가입이 필요하다면 이 집은 피하세요. 계약한다면 위반 부분이 내가 쓸 공간인지 확인하고, " +
          "철거 시 계약 해제와 보증금 반환을 특약으로 넣으세요.",
        suggestTerms: ["TERM_ILLEGAL_BUILDING_REMEDY", "TERM_GUARANTEE_COOPERATION"],
      });
    }

    // (3) 다가구인데 선순위 임차 내역 미기재
    if (facts.isMultiHousehold && brokerage.priorTenantInfoDisclosed !== true) {
      findings.push({
        code: "DOC_PRIOR_TENANT_NOT_DISCLOSED",
        category: "document",
        kind: "info_gap",
        severity: "danger",
        weight: 25,
        title: "다가구인데 앞선 세입자 보증금이 설명서에 없어요",
        description:
          "다가구주택은 확인·설명서에 '선순위 임차 내역'을 적어야 합니다. 이 정보가 없으면 내 앞에 " +
          "얼마의 보증금이 있는지 알 수 없고, 회수 가능 금액을 계산할 수 없습니다.",
        action:
          "중개사에게 확정일자 부여현황과 전입세대확인서를 근거로 선순위 보증금 총액을 기재해 달라고 요구하세요.",
        suggestTerms: ["TERM_PRIOR_TENANT_DISCLOSURE", "TERM_CONTRACT_VOID_ON_MISDISCLOSURE"],
      });
    }

    // (4) 중개사 서명 누락
    if (brokerage.signedByAgent === false) {
      findings.push({
        code: "DOC_BROKER_NOT_SIGNED",
        category: "document",
        severity: "danger",
        weight: 15,
        title: "확인·설명서에 중개사 서명·날인이 없어요",
        description:
          "서명·날인이 없는 확인·설명서는 나중에 중개사가 '내가 작성한 것이 아니다'라고 주장할 여지를 남깁니다. " +
          "손해배상을 청구할 때 가장 중요한 증거가 무력화됩니다.",
        action: "개업공인중개사의 서명·날인과 소속중개보조원 아닌 본인 확인을 받으세요.",
      });
    }

    // (5) 중개사 등록번호 형식
    if (brokerage.agentRegistrationNo && !/^\d{5}-\d{4}-\d{5}$/.test(brokerage.agentRegistrationNo.trim())) {
      findings.push({
        code: "DOC_BROKER_REG_NO_FORMAT",
        category: "document",
        severity: "caution",
        weight: 5,
        title: "중개사 등록번호 형식이 이상해요",
        description:
          `'${brokerage.agentRegistrationNo}'는 일반적인 중개사무소 등록번호 형식(00000-0000-00000)과 ` +
          "다릅니다. 판독 오류일 수도 있지만, 무등록 중개일 가능성도 확인해야 합니다.",
        action:
          "국가공간정보포털 또는 해당 시·군·구청 부동산정보과에서 등록 여부와 대표자 이름을 조회하세요.",
        evidence: { agentRegistrationNo: brokerage.agentRegistrationNo },
      });
    }

    // (6) 공제(보증) 만료
    if (brokerage.guaranteeExpiresOn && facts.contractDate) {
      if (isBefore(brokerage.guaranteeExpiresOn, facts.contractDate)) {
        findings.push({
          code: "DOC_BROKER_GUARANTEE_EXPIRED",
          category: "document",
          severity: "danger",
          weight: 18,
          title: "중개사 공제(손해배상 보증)가 계약일 전에 끝나요",
          description:
            `공제 기간이 ${formatKo(brokerage.guaranteeExpiresOn)}까지인데 계약일은 ` +
            `${formatKo(facts.contractDate)}입니다. 중개 사고가 나도 공제기관에서 배상받을 수 없습니다.`,
          action: "유효한 공제증서를 요구하거나, 공제가 유효한 다른 중개사무소를 이용하세요.",
          evidence: {
            guaranteeExpiresOn: brokerage.guaranteeExpiresOn,
            contractDate: facts.contractDate,
          },
        });
      }
    }

    // (7) 설명서 발급일이 오래됨
    if (brokerage.issuedOn) {
      const age = diffDays(brokerage.issuedOn, facts.today);
      if (age > STATEMENT_STALE_DAYS) {
        findings.push({
          code: "DOC_STATEMENT_STALE",
          category: "document",
          kind: "info_gap",
          severity: "caution",
          weight: 6,
          title: `확인·설명서가 ${age}일 전 것이에요`,
          description:
            "그동안 권리관계가 바뀌었을 수 있습니다. 확인·설명서는 계약 시점의 상태를 기준으로 작성돼야 합니다.",
          action: "계약일 기준으로 다시 작성된 확인·설명서를 받으세요.",
          evidence: { issuedOn: brokerage.issuedOn, ageDays: age },
        });
      } else if (isAfter(brokerage.issuedOn, facts.today)) {
        comparisons.push({
          field: "brokerage.issued_on",
          label: "확인·설명서 발급일",
          status: "unknown",
          values: { issuedOn: brokerage.issuedOn, today: facts.today },
        });
      }
    }
  }

  return {
    level: maxRisk(...findings.map((f) => f.severity)),
    submitted,
    comparisons,
    findings,
  };
}
