import type { Db } from "../lib/supabase.js";
import type { DateOnly } from "../lib/date.js";
import { getCase } from "./case.service.js";
import { ensureExtractions } from "./document.service.js";
import { getLatestAnalysis } from "./analysis.service.js";
import { legalBasisFor, recommendSpecialTerms } from "../domain/special-terms.js";
import { fetchStandardLeaseForm } from "./lawinfo.service.js";
import { verifyBusinessRegistration } from "./business-registration.service.js";
import { assembleContractDraft, type ContractDraft } from "../domain/contract-draft.js";
import type { BusinessRegistrationResult } from "../domain/types.js";

const CORPORATE_MARKERS = ["주식회사", "(주)", "유한회사", "재단법인", "사단법인"];

function looksCorporate(name: string | null): boolean {
  if (!name) return false;
  return CORPORATE_MARKERS.some((marker) => name.includes(marker));
}

export async function buildContractDraft(db: Db, caseId: string): Promise<ContractDraft> {
  const row = await getCase(db, caseId);

  const [extractions, analysis, standardForm] = await Promise.all([
    ensureExtractions(caseId, { reparse: false }),
    getLatestAnalysis(db, caseId),
    fetchStandardLeaseForm(),
  ]);

  const lessorName = extractions.lease?.lessorName ?? extractions.registry?.ownerNames?.[0] ?? null;

  const specialTerms =
    analysis && analysis.specialTerms.length > 0
      ? analysis.specialTerms
      : recommendSpecialTerms(new Map(), {
          depositKrw: row.deposit_krw,
          contractDate: row.contract_date as DateOnly | null,
          balanceDate: row.balance_date as DateOnly | null,
          residentRegistrationDate: row.resident_registration_date as DateOnly | null,
          protectionDate: (row.resident_registration_date ?? row.balance_date) as DateOnly | null,
          address: row.road_address,
          detailAddress: row.detail_address,
          maintenanceFeeKrw: row.maintenance_fee_krw,
        });

  let businessVerification: BusinessRegistrationResult | null = null;
  if (looksCorporate(lessorName)) {
    if (row.business_registration_number && lessorName && row.contract_date) {
      businessVerification = await verifyBusinessRegistration({
        businessNumber: row.business_registration_number,
        representativeName: lessorName,
        openingDate: row.contract_date as DateOnly,
      });
    } else if (row.business_registration_number) {
      businessVerification = {
        source: "unavailable",
        valid: null,
        status: "대표자명 또는 계약일이 없어 확인할 수 없습니다.",
      };
    } else {
      businessVerification = { source: "not_applicable", valid: null, status: null };
    }
  }

  return assembleContractDraft({
    parties: [
      {
        role: "임대인",
        name: lessorName,
        businessRegistrationNumber: row.business_registration_number,
        businessVerification,
      },
      { role: "임차인", name: null, businessRegistrationNumber: null, businessVerification: null },
    ],
    property: {
      roadAddress: row.road_address,
      detailAddress: row.detail_address,
      buildingType: row.building_type,
      exclusiveAreaM2: row.exclusive_area_m2,
    },
    terms: {
      leaseType: row.lease_type,
      depositKrw: row.deposit_krw,
      monthlyRentKrw: row.monthly_rent_krw,
      maintenanceFeeKrw: row.maintenance_fee_krw,
      contractDate: row.contract_date as DateOnly | null,
      balanceDate: row.balance_date as DateOnly | null,
      contractTermMonths: row.contract_term_months,
    },
    specialTerms: specialTerms.map((t) => ({
      code: t.code,
      title: t.title,
      priority: t.priority,
      clauseText: t.clauseText,
      legalBasis: legalBasisFor(t.code),
    })),
    standardForm: { pdfUrl: standardForm.pdfUrl, fallbackUrl: standardForm.fallbackUrl },
  });
}
