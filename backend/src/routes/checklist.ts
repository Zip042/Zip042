import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { buildChecklistTemplate, computeChecklistProgress } from "../domain/checklist.js";
import { userClient } from "../lib/supabase.js";
import type { AppBindings } from "../middleware/auth.js";
import {
  getChecklistState,
  resetChecklistState,
  saveChecklistState,
} from "../services/checklist.service.js";

/**
 * 계약 단계별 체크리스트 (프론트엔드 `/checklist`).
 *
 * 라우터가 둘로 나뉜다.
 *  - `checklistCatalogRoute` : 항목 목록. **로그인 없이** 볼 수 있다.
 *  - `checklistRoute`        : 체크 상태 저장·조회. 로그인 필요.
 *
 * 목록을 공개로 두는 이유는 특약 카탈로그와 같다 — 계약 전에 무엇을 확인해야 하는지는
 * 가입하지 않은 사람도 볼 수 있어야 하는 교육 정보다. 가입을 강요하면 정작 필요한
 * 사람이 못 본다.
 */

export const checklistCatalogRoute = new Hono();

checklistCatalogRoute.get("/checklist", (c) => {
  const stages = buildChecklistTemplate();
  return c.json({
    stages,
    // 체크가 하나도 없는 상태의 진행률. 프론트엔드가 분모를 따로 계산하지 않아도 된다.
    progress: computeChecklistProgress([]),
    disclaimer:
      "체크리스트는 일반적인 계약 절차를 기준으로 한 참고 자료입니다. 개별 사안에 따라 필요한 확인이 달라질 수 있습니다.",
  });
});

export const checklistRoute = new Hono<AppBindings>();

/** 내 체크 상태. 저장한 적이 없어도 404 가 아니라 빈 상태를 돌려준다. */
checklistRoute.get("/checklist/progress", async (c) => {
  const user = c.get("user");
  const db = userClient(c.get("accessToken"));
  return c.json({ checklist: await getChecklistState(db, user.id) });
});

const saveSchema = z.object({
  /**
   * 체크된 항목 id **전체**. 부분 갱신이 아니라 전체 교체다.
   * 알 수 없는 id 는 서버가 조용히 걸러낸다(항목이 지워졌을 때 400 을 내면 화면이 멈춘다).
   */
  checkedItemIds: z.array(z.string().min(1).max(64)).max(200),
});

checklistRoute.put("/checklist/progress", zValidator("json", saveSchema), async (c) => {
  const user = c.get("user");
  const db = userClient(c.get("accessToken"));
  const { checkedItemIds } = c.req.valid("json");
  return c.json({ checklist: await saveChecklistState(db, user.id, checkedItemIds) });
});

checklistRoute.delete("/checklist/progress", async (c) => {
  const user = c.get("user");
  const db = userClient(c.get("accessToken"));
  return c.json({ checklist: await resetChecklistState(db, user.id) });
});
