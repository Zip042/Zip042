import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { loadEnv } from "../env.js";
import type { AppBindings } from "../middleware/auth.js";
import { regionQuerySchema } from "../schemas/case.js";
import { REGION_THRESHOLDS } from "../domain/region-risk.js";
import { isOwnerMatchingEnabled, lookupRegionRisk, regionRiskGrid } from "../services/region.service.js";
import { getCase } from "../services/case.service.js";
import { userClient } from "../lib/supabase.js";
import { assertOwnership } from "./cases.js";

export const regionRoute = new Hono<AppBindings>();

/**
 * 좌표 기준 지역 위험 조회 (기획서 2 ②).
 * 지도 화면에서 사용자가 임의 지점을 탭했을 때도 쓸 수 있게 case 와 분리해 두었다.
 * 피해주택의 개별 주소는 응답에 포함되지 않는다 — 집계값만 나간다.
 */
regionRoute.get("/risk", zValidator("query", regionQuerySchema), async (c) => {
  const { lat, lng, radiusM } = c.req.valid("query");
  const result = await lookupRegionRisk({ lat, lng, radiusM });
  return c.json({
    region: result,
    thresholds: REGION_THRESHOLDS,
    ownerMatchingEnabled: isOwnerMatchingEnabled(),
  });
});

/** 지도 히트맵용 격자 집계 (약 100m 셀). */
regionRoute.get(
  "/grid",
  zValidator(
    "query",
    z.object({
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
      radiusM: z.coerce.number().int().min(200).max(10_000).default(2000),
    }),
  ),
  async (c) => {
    const { lat, lng, radiusM } = c.req.valid("query");
    const cells = await regionRiskGrid(lat, lng, radiusM);
    return c.json({ cells, cellSizeDeg: 0.001, radiusM });
  },
);

/** 특정 case 기준 지역 위험 — 동일 건물 · 동일 소유자 탐지까지 포함한다. */
regionRoute.get(
  "/cases/:caseId/region",
  zValidator("param", z.object({ caseId: z.string().uuid() })),
  async (c) => {
    const { caseId } = c.req.valid("param");
    await assertOwnership(c.get("accessToken"), caseId);
    const row = await getCase(userClient(c.get("accessToken")), caseId);

    const result = await lookupRegionRisk({
      lat: row.lat,
      lng: row.lng,
      radiusM: loadEnv().REGION_RISK_RADIUS_M,
      roadAddress: row.road_address,
    });
    return c.json({ region: result, ownerMatchingEnabled: isOwnerMatchingEnabled() });
  },
);
