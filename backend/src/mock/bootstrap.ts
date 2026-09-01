import { addDays, addMonths, todayKst, type DateOnly } from "../lib/date.js";
import { log } from "../lib/logger.js";
import { adminClient } from "../lib/supabase.js";
import { invalidateHolidayCache } from "../services/holidays.service.js";
import { runAnalysis } from "../services/analysis.service.js";
import {
  holidaySeed,
  SMALL_LESSEE_SEED,
  victimSeed,
  buildScenario,
  scenarioDates,
  type ScenarioKey,
} from "./fixtures.js";
import { clearDocumentScenarios, setDocumentScenario } from "./extraction.js";
import { MOCK_DEFAULT_USER_ID, resetMockData } from "./client.js";
import { store } from "./store.js";

/**
 * 목 모드 부팅 시드.
 *
 * 마이그레이션의 참조 데이터 시드(`20260820000300_seed_reference.sql`)와 **같은 값**을 넣는다.
 * 목 모드에서 본 화면이 실제 Supabase 를 붙였을 때와 달라지면 목 모드의 의미가 없다.
 */

let seeded = false;

export function seedReferenceData(): void {
  if (seeded) return;
  const year = new Date().getUTCFullYear();

  // 쿼리 빌더 대역은 지연 실행(await 시점에 동작)이므로 여기서는 쓸 수 없다.
  // createApp() 이 동기 함수라 await 할 곳이 없어, 저장소에 직접 넣는다.
  const put = (table: string, rows: Record<string, unknown>[]) => {
    const target = store.table(table);
    target.length = 0;
    target.push(...rows.map((r) => ({ ...store.defaultsFor(table), ...r })));
  };

  put("public_holidays", holidaySeed(year - 1, year + 3));
  put("small_lessee_thresholds", SMALL_LESSEE_SEED);
  put("victim_properties", victimSeed(120));

  invalidateHolidayCache();
  seeded = true;

  log.info("목 모드 참조 데이터 시드 완료", store.stats());
}

/** 프론트엔드가 즉시 붙어볼 수 있도록 시나리오별 검사 건을 만들고 분석까지 돌린다. */
export interface SeededCase {
  caseId: string;
  scenario: ScenarioKey;
  label: string;
  title: string;
  verdict: string;
  score: number;
  contractable: boolean;
  headline: string;
}

export async function seedSampleCases(
  scenarios: ScenarioKey[],
  userId: string = MOCK_DEFAULT_USER_ID,
): Promise<SeededCase[]> {
  seedReferenceData();
  const admin = adminClient();
  const today = todayKst();
  const out: SeededCase[] = [];

  for (const key of scenarios) {
    const bundle = buildScenario(key, today);
    // 계약서 초안 픽스처와 **같은 값**을 써야 한다 — 따로 계산하면 어긋나서
    // "계약서의 잔금일이 입력한 날짜와 달라요" 가 뜬다. (fixtures.ts 주석 참고)
    const { contractDate, balanceDate } = scenarioDates(today);

    const inserted = await admin
      .from("cases")
      .insert({
        user_id: userId,
        title: `[샘플] ${bundle.label}`,
        status: "ready",
        road_address: bundle.registry.address?.replace(/\s\S+호$/, "") ?? null,
        detail_address: bundle.lease.detailAddress,
        // 대전 서구 법정동코드. 시세 대역이 결정론적으로 계산하는 데 쓴다.
        region_code: key === "multi_household" ? "3020010100" : "3017010100",
        sigungu: key === "multi_household" ? "대전광역시 유성구" : "대전광역시 서구",
        // 피해주택 더미 클러스터에서 떨어진 좌표를 쓴다. 시나리오는 서류·등기부 위험을
        // 보여주는 것이 목적이라, 지역 점수가 섞이면 무엇 때문에 위험한지 읽기 어려워진다.
        // 지역 위험 레이어 확인은 GET /v1/region/risk?lat=36.3504&lng=127.3845 로 별도 확인.
        lat: key === "multi_household" ? 36.3305 : 36.3288,
        lng: key === "multi_household" ? 127.4102 : 127.4135,
        building_type: bundle.buildingType,
        exclusive_area_m2: bundle.exclusiveAreaM2,
        floor: 3,
        total_floors: 5,
        built_year: 2014,
        lease_type: bundle.monthlyRentKrw > 0 ? "monthly" : "jeonse",
        deposit_krw: bundle.depositKrw,
        monthly_rent_krw: bundle.monthlyRentKrw,
        maintenance_fee_krw: 70_000,
        contract_term_months: 24,
        contract_date: contractDate,
        balance_date: balanceDate,
        resident_registration_date: balanceDate,
        confirmed_date_plan: contractDate,
        // 시나리오가 의도한 판정이 나오도록 시세를 고정한다.
        user_market_price_krw: bundle.marketPriceKrw,
      })
      .select("id")
      .single();

    const caseId = (inserted.data as { id: string } | null)?.id;
    if (!caseId) {
      log.warn("샘플 검사 건 생성 실패", { scenario: key });
      continue;
    }

    // 3종 서류를 모두 등록하고 각각에 같은 시나리오를 붙인다.
    for (const docType of ["registry", "brokerage_statement", "lease_draft"] as const) {
      const doc = await admin
        .from("documents")
        .insert({
          case_id: caseId,
          doc_type: docType,
          storage_path: `${userId}/${caseId}/${docType}-${key}.pdf`,
          original_name: `${docType}_${key}.pdf`,
          mime_type: "application/pdf",
          size_bytes: 120_000,
          status: "uploaded",
        })
        .select("id")
        .single();
      const docId = (doc.data as { id: string } | null)?.id;
      if (docId) setDocumentScenario(docId, key);
    }

    const analysis = await runAnalysis(admin, caseId, {
      refreshMarketPrice: false,
      reparseDocuments: false,
    });

    out.push({
      caseId,
      scenario: key,
      label: bundle.label,
      title: `[샘플] ${bundle.label}`,
      verdict: analysis.verdict.verdict,
      score: analysis.verdict.score,
      contractable: analysis.verdict.contractable,
      headline: analysis.verdict.headline,
    });
  }

  return out;
}

/** 모든 목 데이터를 비운다. 참조 데이터는 다시 시드한다. */
export function resetAll(): void {
  resetMockData();
  clearDocumentScenarios();
  seeded = false;
  seedReferenceData();
}

/** 만료 임박 케이스처럼 특정 시점을 보고 싶을 때 쓰는 보조 날짜. */
export function relativeDates(today: DateOnly = todayKst()) {
  return {
    today,
    contractSoon: addDays(today, 7),
    balanceSoon: addDays(today, 21),
    termEnd: addMonths(today, 24),
  };
}
