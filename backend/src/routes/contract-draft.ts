import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { userClient } from "../lib/supabase.js";
import type { AppBindings } from "../middleware/auth.js";
import { buildContractDraft } from "../services/contract-draft.service.js";
import { assertOwnership } from "./cases.js";

const caseParam = z.object({ caseId: z.string().uuid() });

export const contractDraftRoute = new Hono<AppBindings>();

/**
 * 국토교통부 표준임대차계약서 자동완성 초안.
 * "계약서 작성"이 아니라 이미 수집된 데이터로 표준계약서 항목을 채워주는 보조 도구다.
 */
contractDraftRoute.get("/:caseId/contract-draft", zValidator("param", caseParam), async (c) => {
  const { caseId } = c.req.valid("param");
  await assertOwnership(c.get("accessToken"), caseId);
  const draft = await buildContractDraft(userClient(c.get("accessToken")), caseId);
  return c.json({ draft });
});
