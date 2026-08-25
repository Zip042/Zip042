import { formatKrw } from "./money.js";
import type { DateOnly } from "../lib/date.js";
import type { BusinessRegistrationResult } from "./types.js";

/**
 * 계약서 초안 조립 (기획서 3 "임대차 계약서 초안").
 *
 * 이미 조회·계산된 데이터를 국토부 표준임대차계약서 순서(당사자 → 목적물 표시 →
 * 계약 조건 → 특약사항)로 재배열만 한다. Claude를 다시 호출하지 않는다 — 이미
 * 추출된 데이터를 결정론적으로 매핑하는 편이 판정 재현성과 비용 양쪽에서 낫다.
 *
 * ⚠️ 정부 표준계약서 PDF의 필드를 프로그램으로 채우지 않는다. 서식 필드 매핑은
 * 양식이 바뀔 때마다 깨지기 쉬운 반면, 이 구조화 JSON + 원본 서식 링크를 함께
 * 주는 편이 유지보수 비용 대비 가치가 높다.
 */

export type ContractDraftLeaseType = "jeonse" | "monthly" | "semi_jeonse";

export interface ContractDraftParty {
  role: "임대인" | "임차인";
  name: string | null;
  businessRegistrationNumber: string | null;
  businessVerification: BusinessRegistrationResult | null;
}

export interface ContractDraftPropertyDescription {
  roadAddress: string | null;
  detailAddress: string | null;
  buildingType: string | null;
  exclusiveAreaM2: number | null;
}

export interface ContractDraftTerms {
  leaseType: ContractDraftLeaseType;
  depositKrw: number;
  monthlyRentKrw: number;
  maintenanceFeeKrw: number;
  contractDate: DateOnly | null;
  balanceDate: DateOnly | null;
  contractTermMonths: number;
}

export interface ContractDraftSpecialTermInput {
  code: string;
  title: string;
  priority: number;
  clauseText: string;
  legalBasis: { law: string; jo: string; label: string }[];
}

export interface ContractDraftInput {
  parties: ContractDraftParty[];
  property: ContractDraftPropertyDescription;
  terms: ContractDraftTerms;
  specialTerms: ContractDraftSpecialTermInput[];
  standardForm: { pdfUrl: string | null; fallbackUrl: string };
}

export interface ContractDraftSpecialTermLine {
  code: string;
  title: string;
  clauseText: string;
  legalBasisLabels: string[];
}

export interface ContractDraft {
  parties: ContractDraftParty[];
  propertyDescription: string;
  terms: {
    summary: string;
    leaseTypeLabel: string;
    depositKrw: number;
    monthlyRentKrw: number;
    maintenanceFeeKrw: number;
    contractTermMonths: number;
    contractDate: DateOnly | null;
    balanceDate: DateOnly | null;
  };
  specialTerms: ContractDraftSpecialTermLine[];
  standardFormUrl: string;
  rentHomeNotice: { message: string; linkUrl: string };
  disclaimer: string;
}

const LEASE_TYPE_LABEL: Record<ContractDraftLeaseType, string> = {
  jeonse: "전세",
  monthly: "월세",
  semi_jeonse: "반전세",
};

function summarizeTerms(terms: ContractDraftTerms): string {
  const deposit = `보증금 ${formatKrw(terms.depositKrw)}`;
  if (terms.leaseType === "monthly" || terms.monthlyRentKrw > 0) {
    return `${deposit} / 월세 ${formatKrw(terms.monthlyRentKrw)}`;
  }
  return deposit;
}

export function assembleContractDraft(input: ContractDraftInput): ContractDraft {
  const { property, terms } = input;

  const propertyDescription =
    [property.roadAddress, property.detailAddress].filter((v): v is string => Boolean(v)).join(" ") ||
    "주소 미입력";

  const specialTerms: ContractDraftSpecialTermLine[] = input.specialTerms
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map((t) => ({
      code: t.code,
      title: t.title,
      clauseText: t.clauseText,
      legalBasisLabels: t.legalBasis.map((b) => `${b.law} ${b.label}`),
    }));

  return {
    parties: input.parties,
    propertyDescription,
    terms: {
      summary: summarizeTerms(terms),
      leaseTypeLabel: LEASE_TYPE_LABEL[terms.leaseType],
      depositKrw: terms.depositKrw,
      monthlyRentKrw: terms.monthlyRentKrw,
      maintenanceFeeKrw: terms.maintenanceFeeKrw,
      contractTermMonths: terms.contractTermMonths,
      contractDate: terms.contractDate,
      balanceDate: terms.balanceDate,
    },
    specialTerms,
    standardFormUrl: input.standardForm.pdfUrl ?? input.standardForm.fallbackUrl,
    rentHomeNotice: {
      message: "임대사업자 등록 여부는 API로 확인할 수 없습니다. 임대인에게 등록 여부를 직접 요구하세요.",
      linkUrl: "https://www.renthome.go.kr",
    },
    disclaimer:
      "이 초안은 법률 자문이 아니며, 국토교통부 표준임대차계약서 작성을 보조하는 도구입니다. " +
      "최종 서명 전 반드시 원본 서식과 대조하고 전문가와 상담하세요.",
  };
}
