import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppBindings } from "../middleware/auth.js";
import { signIn, signUp } from "../services/auth.service.js";

export const authRoute = new Hono<AppBindings>();

const credentials = z.object({
  email: z.string().trim().toLowerCase().email("올바른 이메일 형식이 아닙니다."),
  // Supabase 기본 최소 길이가 6자다. 서버가 먼저 걸러야 그 사유를 명확히 보여줄 수 있다.
  password: z.string().min(6, "비밀번호는 6자 이상이어야 합니다."),
});

authRoute.post("/signup", zValidator("json", credentials), async (c) => {
  const { email, password } = c.req.valid("json");
  const session = await signUp(email, password);
  return c.json(session, 201);
});

authRoute.post("/login", zValidator("json", credentials), async (c) => {
  const { email, password } = c.req.valid("json");
  const session = await signIn(email, password);
  return c.json(session);
});
