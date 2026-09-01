import type { Db } from "../lib/supabase.js";
import type { DateOnly } from "../lib/date.js";
import { getCase } from "./case.service.js";
import { ensureExtractions } from "./document.service.js";
import { getLatestAnalysis } from "./analysis.service.js";
import { legalBasisFor, recommendSpecialTerms } from "../domain/special-terms.js";
import { fetchStandardLeaseForm } from "./lawinfo.service.js";
import { assembleContractDraft, type ContractDraft } from "../domain/contract-draft.js";
import type { BusinessRegistrationResult } from "../domain/types.js";

const CORPORATE_MARKERS = ["주식회사", "(주)", "유한회사", "재단법인", "사단법인"];

export function looksCorporate(name: string | null): boolean {
  if (!name) return false;
  return CORPORATE_MARKERS.some((marker) => name.includes(marker));
}

export async function buildContractDraft(db: Db, caseId: string): Promise<ContractDraft> {
  const row = await getCase(db, caseId);

  // 문서 추출은 캐시 미스 시 AI 호출(과금 대상)이 일어난다. 여기서 실패해도 case 행 ·
  // 표준계약서 · 기본 특약만으로 초안은 낼 수 있으므로, 추출 실패로 전체 요청을
  // 500 으로 죽이지 않는다 (interview.service.ts 의 동일 패턴 참고).
  const [extractions, analysis, standardForm] = await Promise.all([
    ensureExtractions(caseId, { reparse: false }).catch(() => null),
    getLatestAnalysis(db, caseId),
    fetchStandardLeaseForm(),
  ]);

  const lessorName =
    extractions?.lease?.lessorName ?? extractions?.registry?.ownerNames?.[0] ?? null;

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

  // 국세청 진위확인 API는 대표자성명(p_nm)·개업일자(start_dt)를 요구하는데, 이 스키마에는
  // 그 둘을 실제로 담을 필드가 없다 (사업자등록번호만 Task 4에서 추가됨). 임차 계약의
  // 임대인 이름·계약일을 대신 넣어 호출하면 정상 법인도 false 로 나오는 명백한 오답을
  // 만들어내므로, 이 호출부에서는 verifyBusinessRegistration 을 절대 실제 호출하지 않는다.
  // 대표자성명·개업일자 필드가 스키마에 추가되면 이 자리에서 verifyBusinessRegistration을
  // 호출하도록 바꾼다. (looksCorporate() 는 이 판단에 더 이상 관여하지 않는다 —
  // 사업자등록번호가 있다는 사실 자체가 확인 가능 여부를 결정한다.)
  let businessVerification: BusinessRegistrationResult | null = null;
  if (row.business_registration_number) {
    businessVerification = {
      source: "unavailable",
      valid: null,
      status: "대표자성명·개업일자 정보가 없어 확인할 수 없습니다.",
    };
  } else {
    businessVerification = { source: "not_applicable", valid: null, status: null };
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
