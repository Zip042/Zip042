import { notFound } from "../lib/errors.js";
import { unwrap, type Db } from "../lib/supabase.js";
import type { NormalizedCaseInput } from "../schemas/case.js";

/** cases 테이블 행 (snake_case, DB 그대로) */
export interface CaseRow {
  id: string;
  user_id: string;
  title: string | null;
  status: "draft" | "ready" | "analyzing" | "analyzed" | "failed";
  road_address: string | null;
  jibun_address: string | null;
  detail_address: string | null;
  region_code: string | null;
  sigungu: string | null;
  lat: number | null;
  lng: number | null;
  building_type: string | null;
  exclusive_area_m2: number | null;
  floor: number | null;
  total_floors: number | null;
  built_year: number | null;
  household_count: number | null;
  lease_type: "jeonse" | "monthly" | "semi_jeonse";
  deposit_krw: number;
  monthly_rent_krw: number;
  maintenance_fee_krw: number;
  contract_term_months: number;
  contract_date: string | null;
  balance_date: string | null;
  move_in_date: string | null;
  resident_registration_date: string | null;
  confirmed_date_plan: string | null;
  user_market_price_krw: number | null;
  created_at: string;
  updated_at: string;
}

const CASE_COLUMNS =
  "id,user_id,title,status,road_address,jibun_address,detail_address,region_code,sigungu,lat,lng," +
  "building_type,exclusive_area_m2,floor,total_floors,built_year,household_count,lease_type," +
  "deposit_krw,monthly_rent_krw,maintenance_fee_krw,contract_term_months,contract_date,balance_date," +
  "move_in_date,resident_registration_date,confirmed_date_plan,user_market_price_krw,created_at,updated_at";

function toRowPayload(input: NormalizedCaseInput): Record<string, unknown> {
  return {
    title: input.title,
    road_address: input.roadAddress,
    jibun_address: input.jibunAddress,
    detail_address: input.detailAddress,
    region_code: input.regionCode,
    sigungu: input.sigungu,
    lat: input.lat,
    lng: input.lng,
    building_type: input.buildingType,
    exclusive_area_m2: input.exclusiveAreaM2,
    floor: input.floor,
    total_floors: input.totalFloors,
    built_year: input.builtYear,
    household_count: input.householdCount,
    lease_type: input.leaseType,
    deposit_krw: input.depositKrw,
    monthly_rent_krw: input.monthlyRentKrw,
    maintenance_fee_krw: input.maintenanceFeeKrw,
    contract_term_months: input.contractTermMonths,
    contract_date: input.contractDate,
    balance_date: input.balanceDate,
    move_in_date: input.moveInDate,
    resident_registration_date: input.residentRegistrationDate,
    confirmed_date_plan: input.confirmedDatePlan,
    user_market_price_krw: input.userMarketPriceKrw,
  };
}

export async function createCase(
  db: Db,
  userId: string,
  input: NormalizedCaseInput,
): Promise<CaseRow> {
  const result = await db
    .from("cases")
    .insert({ ...toRowPayload(input), user_id: userId })
    .select(CASE_COLUMNS)
    .single();
  return unwrap(result, "검사 건 생성") as unknown as CaseRow;
}

export async function updateCase(
  db: Db,
  caseId: string,
  input: NormalizedCaseInput,
): Promise<CaseRow> {
  const result = await db
    .from("cases")
    .update(toRowPayload(input))
    .eq("id", caseId)
    .select(CASE_COLUMNS)
    .single();
  if (result.error?.code === "PGRST116") throw notFound("검사 건을 찾을 수 없습니다.");
  return unwrap(result, "검사 건 수정") as unknown as CaseRow;
}

export async function patchSchedule(
  db: Db,
  caseId: string,
  patch: {
    contractDate?: string | null;
    balanceDate?: string | null;
    moveInDate?: string | null;
    residentRegistrationDate?: string | null;
    confirmedDatePlan?: string | null;
  },
): Promise<CaseRow> {
  const payload: Record<string, unknown> = {};
  if (patch.contractDate !== undefined) payload.contract_date = patch.contractDate;
  if (patch.balanceDate !== undefined) payload.balance_date = patch.balanceDate;
  if (patch.moveInDate !== undefined) payload.move_in_date = patch.moveInDate;
  if (patch.residentRegistrationDate !== undefined) {
    payload.resident_registration_date = patch.residentRegistrationDate;
  }
  if (patch.confirmedDatePlan !== undefined) payload.confirmed_date_plan = patch.confirmedDatePlan;

  const result = await db
    .from("cases")
    .update(payload)
    .eq("id", caseId)
    .select(CASE_COLUMNS)
    .single();
  if (result.error?.code === "PGRST116") throw notFound("검사 건을 찾을 수 없습니다.");
  return unwrap(result, "일정 수정") as unknown as CaseRow;
}

export async function getCase(db: Db, caseId: string): Promise<CaseRow> {
  const result = await db.from("cases").select(CASE_COLUMNS).eq("id", caseId).maybeSingle();
  if (result.error) throw new Error(`검사 건 조회: ${result.error.message}`);
  if (!result.data) throw notFound("검사 건을 찾을 수 없습니다.");
  return result.data as unknown as CaseRow;
}

/**
 * 검사 건 목록.
 *
 * RLS 가 이미 소유자만 보이게 걸러주지만, **user_id 를 코드에서도 명시적으로 필터**한다.
 * 이유: 이 함수에 service_role 클라이언트가 실수로 전달되면 RLS 가 우회되어 전체 사용자의
 * 데이터가 노출된다. 보안 경계를 한 겹에만 의존하지 않는다(이중 방어).
 */
export async function listCases(
  db: Db,
  userId: string,
  opts: { limit: number; offset: number },
): Promise<{ items: CaseRow[]; total: number }> {
  const { data, error, count } = await db
    .from("cases")
    .select(CASE_COLUMNS, { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(opts.offset, opts.offset + opts.limit - 1);
  if (error) throw new Error(`검사 건 목록 조회: ${error.message}`);
  return { items: (data ?? []) as unknown as CaseRow[], total: count ?? 0 };
}

export async function deleteCase(db: Db, caseId: string): Promise<void> {
  const { error } = await db.from("cases").delete().eq("id", caseId);
  if (error) throw new Error(`검사 건 삭제: ${error.message}`);
}

export async function setCaseStatus(
  db: Db,
  caseId: string,
  status: CaseRow["status"],
): Promise<void> {
  const { error } = await db.from("cases").update({ status }).eq("id", caseId);
  if (error) throw new Error(`상태 변경: ${error.message}`);
}

/** API 응답용 camelCase 변환. 프론트엔드는 이 형태만 본다. */
export function serializeCase(row: CaseRow) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    property: {
      roadAddress: row.road_address,
      jibunAddress: row.jibun_address,
      detailAddress: row.detail_address,
      regionCode: row.region_code,
      sigungu: row.sigungu,
      lat: row.lat,
      lng: row.lng,
      buildingType: row.building_type,
      exclusiveAreaM2: row.exclusive_area_m2,
      floor: row.floor,
      totalFloors: row.total_floors,
      builtYear: row.built_year,
      householdCount: row.household_count,
    },
    terms: {
      leaseType: row.lease_type,
      depositKrw: row.deposit_krw,
      monthlyRentKrw: row.monthly_rent_krw,
      maintenanceFeeKrw: row.maintenance_fee_krw,
      contractTermMonths: row.contract_term_months,
      userMarketPriceKrw: row.user_market_price_krw,
    },
    schedule: {
      contractDate: row.contract_date,
      balanceDate: row.balance_date,
      moveInDate: row.move_in_date,
      residentRegistrationDate: row.resident_registration_date,
      confirmedDatePlan: row.confirmed_date_plan,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
