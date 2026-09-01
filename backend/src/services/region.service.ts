import { createHmac } from "node:crypto";
import { loadEnv } from "../env.js";
import { log } from "../lib/logger.js";
import { adminClient } from "../lib/supabase.js";
import { normalizeAddress } from "../domain/cross-check.js";
import {
  evaluateRegionRisk,
  regionRiskUnavailable,
  type RegionRiskResult,
  type RegionRiskSummary,
} from "../domain/region-risk.js";

/**
 * 지역 위험 레이어 조회 (기획서 2 ②).
 *
 * 개인정보 처리 원칙
 *  - 피해주택의 개별 주소는 클라이언트로 절대 내보내지 않는다. 집계값과 격자 좌표만 반환한다.
 *  - 소유자 이름은 원문으로 저장하지 않고 HMAC 키만 저장·비교한다. 페퍼가 없으면 기능을 끈다.
 */

/** 동일 건물 매칭 키. 도로명주소를 정규화한 값. */
export function buildingKeyOf(roadAddress: string | null | undefined): string | null {
  const normalized = normalizeAddress(roadAddress);
  // 건물번호(숫자)가 없는 주소는 건물 단위로 특정할 수 없다.
  if (!normalized || !/\d/.test(normalized)) return null;
  return normalized;
}

/** 동일 소유자 매칭 키. 이름 원문은 저장하지 않는다. */
export function ownerKeyOf(ownerName: string | null | undefined): string | null {
  const env = loadEnv();
  if (!env.MATCH_KEY_PEPPER) return null;
  const normalized = (ownerName ?? "").replace(/[\s()（）·,]/g, "").trim();
  if (normalized.length < 2) return null;
  return createHmac("sha256", env.MATCH_KEY_PEPPER).update(normalized).digest("hex");
}

export function isOwnerMatchingEnabled(): boolean {
  return Boolean(loadEnv().MATCH_KEY_PEPPER);
}

interface RpcRow {
  radius_m: number;
  victim_case_count: number;
  victim_site_count: number;
  nearest_distance_m: number | null;
  latest_reported_on: string | null;
  same_building_count: number;
  same_owner_count: number;
}

export interface RegionLookupInput {
  lat: number | null;
  lng: number | null;
  radiusM?: number;
  roadAddress?: string | null;
  ownerNames?: string[];
}

export async function lookupRegionRisk(input: RegionLookupInput): Promise<RegionRiskResult> {
  const env = loadEnv();
  const radiusM = input.radiusM ?? env.REGION_RISK_RADIUS_M;

  if (input.lat === null || input.lng === null) {
    return regionRiskUnavailable(radiusM);
  }

  const buildingKey = buildingKeyOf(input.roadAddress);
  // 소유자가 여러 명이면 각각 조회해 합산해야 하므로 대표 1명만 넘기고 나머지는 별도 조회한다.
  const ownerKeys = (input.ownerNames ?? [])
    .map(ownerKeyOf)
    .filter((k): k is string => k !== null);

  try {
    const { data, error } = await adminClient().rpc("region_risk_summary", {
      p_lat: input.lat,
      p_lng: input.lng,
      p_radius_m: radiusM,
      p_building_key: buildingKey,
      p_owner_key: ownerKeys[0] ?? null,
    });
    if (error) throw new Error(error.message);

    const row = (Array.isArray(data) ? data[0] : data) as RpcRow | undefined;
    let summary: RegionRiskSummary = {
      radiusM,
      victimCaseCount: row?.victim_case_count ?? 0,
      victimSiteCount: row?.victim_site_count ?? 0,
      nearestDistanceM: row?.nearest_distance_m ?? null,
      latestReportedOn: row?.latest_reported_on ?? null,
      sameBuildingCount: row?.same_building_count ?? 0,
      sameOwnerCount: row?.same_owner_count ?? 0,
    };

    // 공동소유인 경우 나머지 소유자도 조회해 합산한다.
    if (ownerKeys.length > 1) {
      const extra = await Promise.all(
        ownerKeys.slice(1).map(async (key) => {
          const { data: d } = await adminClient().rpc("region_risk_summary", {
            p_lat: input.lat,
            p_lng: input.lng,
            p_radius_m: radiusM,
            p_building_key: null,
            p_owner_key: key,
          });
          const r = (Array.isArray(d) ? d[0] : d) as RpcRow | undefined;
          return r?.same_owner_count ?? 0;
        }),
      );
      summary = {
        ...summary,
        sameOwnerCount: summary.sameOwnerCount + extra.reduce((a, b) => a + b, 0),
      };
    }

    return evaluateRegionRisk(summary);
  } catch (err) {
    log.error("지역 위험 조회 실패", {
      error: err instanceof Error ? err.message : String(err),
    });
    return regionRiskUnavailable(radiusM);
  }
}

export interface GridCell {
  lat: number;
  lng: number;
  caseCount: number;
}

/** 지도 히트맵용 격자 집계. 개별 주소는 나가지 않는다. */
export async function regionRiskGrid(
  lat: number,
  lng: number,
  radiusM = 2000,
): Promise<GridCell[]> {
  const { data, error } = await adminClient().rpc("region_risk_grid", {
    p_lat: lat,
    p_lng: lng,
    p_radius_m: radiusM,
    p_cell_deg: 0.001,
  });
  if (error) {
    log.error("지역 격자 조회 실패", { error: error.message });
    return [];
  }
  const rows = (data ?? []) as { cell_lat: number; cell_lng: number; case_count: number }[];
  return rows.map((r) => ({ lat: r.cell_lat, lng: r.cell_lng, caseCount: r.case_count }));
}

export interface VictimUpsertRow {
  sourceKey: string;
  roadAddress?: string | null;
  jibunAddress?: string | null;
  buildingName?: string | null;
  sigungu?: string | null;
  legalDong?: string | null;
  ownerName?: string | null;
  lat?: number | null;
  lng?: number | null;
  reportedOn?: string | null;
  caseCount?: number;
  damageKrw?: number | null;
}

/**
 * 피해주택 데이터 배치 적재. 소유자 이름은 HMAC 키로만 저장한다.
 * 관리자 엔드포인트에서 공공 API 동기화 시 호출한다.
 */
export async function upsertVictimProperties(
  source: string,
  rows: VictimUpsertRow[],
): Promise<{ upserted: number; ownerKeysComputed: number }> {
  if (rows.length === 0) return { upserted: 0, ownerKeysComputed: 0 };

  let ownerKeysComputed = 0;
  const payload = rows.map((r) => {
    const ownerKey = ownerKeyOf(r.ownerName);
    if (ownerKey) ownerKeysComputed += 1;
    return {
      source,
      source_key: r.sourceKey,
      road_address: r.roadAddress ?? null,
      jibun_address: r.jibunAddress ?? null,
      building_name: r.buildingName ?? null,
      sigungu: r.sigungu ?? null,
      legal_dong: r.legalDong ?? null,
      building_key: buildingKeyOf(r.roadAddress),
      owner_key: ownerKey,
      lat: r.lat ?? null,
      lng: r.lng ?? null,
      reported_on: r.reportedOn ?? null,
      case_count: r.caseCount ?? 1,
      damage_krw: r.damageKrw ?? null,
    };
  });

  const { error, count } = await adminClient()
    .from("victim_properties")
    .upsert(payload, { onConflict: "source,source_key", count: "exact" });
  if (error) throw new Error(`피해주택 적재 실패: ${error.message}`);

  return { upserted: count ?? payload.length, ownerKeysComputed };
}
