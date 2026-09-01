import { setAuthTokenProvider } from "./api";

/**
 * 로그인 세션.
 *
 * ## 지금 상태
 *
 * 실제 로그인 화면이 아직 없습니다. 백엔드는 **목 모드에서 토큰을 검증하지 않고
 * 토큰 문자열 자체를 사용자 식별자로** 씁니다(`Bearer dev` → 항상 같은 사용자).
 * 그래서 개발 중에는 고정 토큰 하나로 저장·조회가 전부 동작합니다.
 *
 * Supabase Auth 를 붙일 때 할 일은 `getToken` 이 세션의 access_token 을 돌려주도록
 * 바꾸는 것 하나뿐입니다. 화면 코드는 토큰을 몰라도 됩니다.
 *
 * ⚠️ live 모드 백엔드는 이 토큰을 실제 JWT 로 검증하므로 `dev` 는 401 이 됩니다.
 *    그때는 진짜 로그인을 붙여야 합니다.
 */

const STORAGE_KEY = "zip042.token";
const DEV_TOKEN = "dev";

function readToken(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEV_TOKEN;
  } catch {
    // 시크릿 모드 등에서 localStorage 가 막혀 있어도 앱이 죽지 않게 한다.
    return DEV_TOKEN;
  }
}

export function getToken(): string {
  return readToken();
}

/** 여러 사용자를 흉내낼 때 씁니다 (목 모드에서 토큰 = 사용자). */
export function setToken(token: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    /* 저장할 수 없으면 이번 세션에만 기본 토큰을 쓴다 */
  }
}

/** 앱 시작 시 한 번 호출합니다. */
export function initSession(): void {
  setAuthTokenProvider(() => readToken());
}
