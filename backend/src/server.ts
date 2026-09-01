import { serve } from "@hono/node-server";
import { loadDotEnv } from "./lib/dotenv.js";

// env 검증보다 먼저 .env 를 읽어야 한다. import 순서에 의존하므로 위치를 옮기지 말 것
// (loadEnv 는 첫 호출 결과를 캐시한다).
const dotenv = loadDotEnv();

const { createApp } = await import("./app.js");
const { loadEnv } = await import("./env.js");
const { log } = await import("./lib/logger.js");

/**
 * 로컬 · 컨테이너 실행용 진입점.
 * Vercel 등 서버리스 환경에서는 api/index.ts 가 createApp() 을 직접 export 한다.
 */
const env = loadEnv();
const app = createApp();

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  log.info("ZIP 042 backend started", {
    port: info.port,
    env: env.NODE_ENV,
    mode: env.mode,
    model: env.ANTHROPIC_MODEL,
    // .env 를 실제로 읽었는지 알려준다. 키를 넣었는데 안 먹는 상황을 바로 구분할 수 있다.
    dotEnv: dotenv.loaded ? dotenv.path : "(없음 — 셸 환경변수만 사용)",
  });
});

// 진행 중인 분석(AI 호출)이 끊기지 않도록 graceful shutdown.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log.info("shutting down", { signal });
    server.close(() => process.exit(0));
    // 강제 종료 안전장치
    setTimeout(() => process.exit(1), 15_000).unref();
  });
}
