import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppBindings } from "../middleware/auth.js";
import { interviewAnswerSchema } from "../schemas/case.js";
import { resetInterview, startInterview, submitAnswers } from "../services/interview.service.js";
import { assertOwnership } from "./cases.js";

const caseParam = z.object({ caseId: z.string().uuid() });

export const interviewRoute = new Hono<AppBindings>();

/**
 * 대화형 후속 질문 (기획서 2 ④).
 *
 * 흐름: GET /interview 로 다음 질문 3개를 받고 → POST /interview/answers 로 답을 보내면
 *       다음 질문과 지금까지 도출된 특약·위험이 함께 돌아온다. 질문이 다 끝나면 questions 가 빈 배열.
 *       최종 반영은 POST /analyze 를 다시 호출할 때 이루어진다.
 */
interviewRoute.get("/:caseId/interview", zValidator("param", caseParam), async (c) => {
  const { caseId } = c.req.valid("param");
  const db = await assertOwnership(c.get("accessToken"), caseId);
  return c.json({ interview: await startInterview(db, caseId) });
});

interviewRoute.post(
  "/:caseId/interview/answers",
  zValidator("param", caseParam),
  zValidator("json", interviewAnswerSchema),
  async (c) => {
    const { caseId } = c.req.valid("param");
    const db = await assertOwnership(c.get("accessToken"), caseId);
    const state = await submitAnswers(db, caseId, c.req.valid("json").answers);
    return c.json({
      interview: state,
      hint:
        state.questions.length === 0
          ? "모든 질문에 답했습니다. POST /v1/cases/{caseId}/analyze 로 최종 판정을 갱신하세요."
          : undefined,
    });
  },
);

interviewRoute.delete("/:caseId/interview", zValidator("param", caseParam), async (c) => {
  const { caseId } = c.req.valid("param");
  await assertOwnership(c.get("accessToken"), caseId);
  await resetInterview(caseId);
  return c.body(null, 204);
});
