import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { badRequest } from "../lib/errors.js";
import { adminClient, userClient } from "../lib/supabase.js";
import type { AppBindings } from "../middleware/auth.js";
import {
  createCaseSchema,
  marketPriceOverrideSchema,
  normalizeCaseInput,
  updateCaseSchema,
  updateScheduleSchema,
} from "../schemas/case.js";
import {
  createCase,
  deleteCase,
  getCase,
  listCases,
  patchSchedule,
  serializeCase,
  updateCase,
} from "../services/case.service.js";
import { MAN } from "../domain/money.js";
import { resolveLocation } from "../services/address.service.js";

const uuidParam = z.object({ caseId: z.string().uuid("올바른 검사 건 ID가 아닙니다.") });

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const casesRoute = new Hono<AppBindings>();

/**
 * 소유권 확인은 **사용자 토큰 클라이언트**로 한다.
 * RLS가 걸려 있으므로 남의 case 는 조회 자체가 안 되고, 그 결과 404가 난다.
 * (서버가 직접 user_id 를 비교하는 코드를 여러 곳에 흩뿌리지 않기 위한 설계다.)
 */
async function assertOwnership(accessToken: string, caseId: string) {
  const db = userClient(accessToken);
  await getCase(db, caseId);
  return db;
}

/**
 * 좌표·법정동코드가 비어 있으면 주소로 채운다.
 *
 * 이 두 값이 없으면 지역 위험과 시세 조회가 **둘 다 조용히 실패**한다. 프론트엔드가
 * 주소 검색을 건너뛰는 경우를 대비한 안전망이다. 사용자가 명시한 값은 덮어쓰지 않는다.
 */
async function withResolvedLocation(input: ReturnType<typeof normalizeCaseInput>) {
  const resolved = await resolveLocation({
    roadAddress: input.roadAddress,
    lat: input.lat,
    lng: input.lng,
    regionCode: input.regionCode,
    sigungu: input.sigungu,
  });
  return { ...input, ...resolved, resolvedFrom: undefined } as typeof input;
}

casesRoute.post("/", zValidator("json", createCaseSchema), async (c) => {
  const user = c.get("user");
  const db = userClient(c.get("accessToken"));
  const input = await withResolvedLocation(normalizeCaseInput(c.req.valid("json")));
  const row = await createCase(db, user.id, input);
  return c.json({ case: serializeCase(row) }, 201);
});

casesRoute.get("/", zValidator("query", listQuery), async (c) => {
  const db = userClient(c.get("accessToken"));
  const { limit, offset } = c.req.valid("query");
  const { items, total } = await listCases(db, c.get("user").id, { limit, offset });
  return c.json({
    cases: items.map(serializeCase),
    pagination: { limit, offset, total },
  });
});

casesRoute.get("/:caseId", zValidator("param", uuidParam), async (c) => {
  const { caseId } = c.req.valid("param");
  const db = userClient(c.get("accessToken"));
  return c.json({ case: serializeCase(await getCase(db, caseId)) });
});

casesRoute.put(
  "/:caseId",
  zValidator("param", uuidParam),
  zValidator("json", updateCaseSchema),
  async (c) => {
    const { caseId } = c.req.valid("param");
    const db = await assertOwnership(c.get("accessToken"), caseId);
    const row = await updateCase(
      db,
      caseId,
      await withResolvedLocation(normalizeCaseInput(c.req.valid("json"))),
    );
    return c.json({ case: serializeCase(row) });
  },
);

/**
 * 일정만 수정. 프론트엔드에서 "잔금일을 업무일로 옮기기" 같은 조작을 할 때 쓴다.
 * 일정이 바뀌면 대항력 발생 시점이 바뀌므로, 클라이언트는 이후 재분석을 호출해야 한다.
 */
casesRoute.patch(
  "/:caseId/schedule",
  zValidator("param", uuidParam),
  zValidator("json", updateScheduleSchema),
  async (c) => {
    const { caseId } = c.req.valid("param");
    const db = await assertOwnership(c.get("accessToken"), caseId);
    const body = c.req.valid("json");
    const row = await patchSchedule(db, caseId, {
      contractDate: body.contractDate,
      balanceDate: body.balanceDate,
      moveInDate: body.moveInDate,
      residentRegistrationDate: body.residentRegistrationDate,
      confirmedDatePlan: body.confirmedDatePlan,
    });
    if (row.contract_date && row.balance_date && row.contract_date > row.balance_date) {
      throw badRequest("잔금일은 계약일보다 빠를 수 없습니다.");
    }
    return c.json({
      case: serializeCase(row),
      hint: "일정이 바뀌었습니다. POST /v1/cases/{caseId}/analyze 로 재분석하세요.",
    });
  },
);

/** 사용자가 시세를 직접 입력한다. 공공 API 조회가 실패했을 때의 폴백 경로. */
casesRoute.put(
  "/:caseId/market-price",
  zValidator("param", uuidParam),
  zValidator("json", marketPriceOverrideSchema),
  async (c) => {
    const { caseId } = c.req.valid("param");
    const db = await assertOwnership(c.get("accessToken"), caseId);
    const body = c.req.valid("json");
    const krw = body.estimated * (body.amountUnit === "man" ? MAN : 1);

    const { error } = await db
      .from("cases")
      .update({ user_market_price_krw: krw })
      .eq("id", caseId);
    if (error) throw new Error(`시세 저장 실패: ${error.message}`);

    await adminClient().from("market_prices").insert({
      case_id: caseId,
      source: "user_input",
      method: body.note ?? "사용자 직접 입력",
      estimated_krw: krw,
      confidence: 0.6,
    });

    return c.json({
      marketPrice: { estimatedKrw: krw, source: "user_input" },
      hint: "POST /v1/cases/{caseId}/analyze 로 재분석하세요.",
    });
  },
);

casesRoute.delete("/:caseId", zValidator("param", uuidParam), async (c) => {
  const { caseId } = c.req.valid("param");
  const db = await assertOwnership(c.get("accessToken"), caseId);
  await deleteCase(db, caseId);
  return c.body(null, 204);
});

/** 소유권 검증 헬퍼를 다른 라우트에서도 쓴다. */
export { assertOwnership };
