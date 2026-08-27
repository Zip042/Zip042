/**
 * 로컬 확인용 로그인 토큰 발급.
 *
 *   npm run dev:token
 *
 * live 모드 백엔드는 Supabase JWT 를 실제로 검증하므로 목 모드의 `Bearer dev` 가
 * 통하지 않습니다. 프론트에 아직 로그인 화면이 없어서, 확인용 계정 하나로
 * access_token 을 받아 브라우저에 직접 넣는 용도입니다.
 *
 * ⚠️ 토큰은 1시간 뒤 만료됩니다. 만료되면 다시 실행하세요.
 * ⚠️ 이 계정은 로컬 확인용입니다. 운영 데이터에 쓰지 마세요.
 */
import { loadDotEnv } from "../src/lib/dotenv.js";

loadDotEnv();
process.env.ZIP042_MODE = "live";

const EMAIL = "test-local@zip042.dev";
const PASSWORD = "zip042-local-test-0000";

const { adminClient } = await import("../src/lib/supabase.js");
const admin = adminClient();

const { error: createErr } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
});
// 이미 있으면 그대로 씁니다.
if (createErr && !createErr.message.includes("already been registered")) {
  console.error("계정 생성 실패:", createErr.message);
  process.exit(1);
}

const { data, error } = await admin.auth.signInWithPassword({
  email: EMAIL,
  password: PASSWORD,
});
if (error || !data.session) {
  console.error("로그인 실패:", error?.message ?? "세션 없음");
  process.exit(1);
}

console.log("");
console.log("브라우저 콘솔(F12)에 아래를 붙여넣고 새로고침하세요:");
console.log("");
console.log(`localStorage.setItem('zip042.token', '${data.session.access_token}')`);
console.log("");
console.log(`user_id  ${data.user?.id}`);
console.log(`만료     약 1시간 뒤 (만료되면 npm run dev:token 다시 실행)`);
