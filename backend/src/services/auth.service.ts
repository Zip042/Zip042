import { adminClient } from "../lib/supabase.js";
import { badRequest, upstreamFailed } from "../lib/errors.js";
import { log } from "../lib/logger.js";

/**
 * 이메일·비밀번호 회원가입·로그인.
 *
 * ## 왜 Supabase 기본 가입을 그대로 안 쓰는가
 *
 * Supabase 기본 가입(`signUp`)은 이메일 확인 메일을 보내고, **확인 전에는 로그인이
 * 안 됩니다.** 실제로 호출해서 확인했습니다 — 가입은 200 으로 성공하지만 바로 로그인을
 * 시도하면 `email_not_confirmed` 로 막힙니다. 이 메일이 실제로 오는지, 스팸함으로
 * 새는지도 검증되지 않은 상태라 팀원이 "가입했는데 로그인이 안 된다"는 조용한 실패를
 * 겪게 됩니다.
 *
 * 그래서 서버가 `adminClient()`(service_role)로 **가입과 동시에 확인 처리**까지
 * 합니다. 이메일 인증 없이 바로 로그인되는 대신, 이메일 소유 확인이라는 보안 계층을
 * 잃습니다 — 팀 내부 도구로는 맞는 선택이지만, 실서비스로 갈 때는 이 부분을
 * 다시 설계해야 합니다.
 */

export interface AuthSession {
  accessToken: string;
  userId: string;
  email: string;
}

export async function signUp(email: string, password: string): Promise<AuthSession> {
  const admin = adminClient();

  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr) {
    if (createErr.message.includes("already been registered")) {
      throw badRequest("이미 가입된 이메일입니다. 로그인해 주세요.");
    }
    // Supabase 기본 비밀번호 최소 길이(6자) 등도 여기로 온다 — 메시지를 그대로 보여준다.
    throw badRequest(createErr.message);
  }

  return signIn(email, password);
}

export async function signIn(email: string, password: string): Promise<AuthSession> {
  const admin = adminClient();
  const { data, error } = await admin.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    if (error?.message.includes("Invalid login credentials")) {
      throw badRequest("이메일 또는 비밀번호가 올바르지 않습니다.");
    }
    log.warn("로그인 실패", { email, error: error?.message });
    throw upstreamFailed("로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  }

  return {
    accessToken: data.session.access_token,
    userId: data.user.id,
    email: data.user.email ?? email,
  };
}
