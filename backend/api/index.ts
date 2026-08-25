import { handle } from "hono/vercel";
import { createApp } from "../src/app.js";

/**
 * Vercel Functions 진입점.
 * Node.js 런타임(Fluid Compute)에서 동작한다 — Edge 런타임을 쓰면 안 된다:
 * Anthropic SDK · Supabase 서비스 키 · Buffer 처리를 위해 완전한 Node.js API가 필요하고,
 * 문서 분석은 60초를 넘길 수 있어 긴 실행 시간이 필요하다.
 */
const app = createApp();

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);
