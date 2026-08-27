/**
 * 백엔드 호출 창구.
 *
 * ## 왜 이 파일 하나로 모으는가
 *
 * 화면마다 fetch 를 흩뿌리면 인증 헤더·에러 형태·기본 주소가 제각각이 됩니다.
 * 특히 이 서비스는 **실패를 조용히 넘기면 안 되는** 성격이라(모르는 값을 0으로
 * 채우지 않는다), 실패를 한 곳에서 같은 모양으로 만들어 화면에 넘깁니다.
 *
 * ## 개발 중 인증
 *
 * 목 모드 백엔드는 토큰을 검증하지 않고 **토큰 문자열 자체를 사용자 식별자로** 씁니다.
 * `Bearer dev` 로 보내면 항상 같은 사용자가 됩니다.
 * live 모드에서는 실제 Supabase JWT 를 검증하므로 `dev` 는 401 입니다 —
 * 그때는 localStorage 의 `zip042.token` 에 진짜 토큰을 넣어야 합니다.
 */

const TOKEN_KEY = "zip042.token";
const DEV_TOKEN = "dev";

/** dev 서버는 /v1 을 백엔드로 프록시합니다(vite.config.ts). 그래서 상대경로면 충분합니다. */
const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function token(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? DEV_TOKEN;
  } catch {
    // 시크릿 모드 등에서 localStorage 가 막혀도 앱이 죽지 않게.
    return DEV_TOKEN;
  }
}

export function setToken(v: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, v);
  } catch {
    /* 저장 못 해도 이번 세션은 기본 토큰으로 동작 */
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 20_000, ...rest } = init;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...rest,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token()}`,
        ...(rest.headers ?? {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const aborted = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new ApiError(
      0,
      aborted
        ? "서버 응답이 너무 오래 걸립니다. 잠시 후 다시 시도해 주세요."
        : "서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.",
      err,
    );
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    // 백엔드는 { error: { code, message } } 또는 zod 검증 실패 형태로 준다.
    const b = body as { error?: { message?: string }; message?: string } | null;
    const message =
      b?.error?.message ??
      b?.message ??
      (res.status === 401
        ? "로그인이 필요합니다."
        : `요청이 실패했습니다. (HTTP ${res.status})`);
    throw new ApiError(res.status, message, body);
  }

  return body as T;
}

export const api = {
  get: <T>(path: string, init?: RequestInit & { timeoutMs?: number }) =>
    request<T>(path, { ...init, method: "GET" }),
  post: <T>(path: string, json?: unknown, init?: RequestInit & { timeoutMs?: number }) =>
    request<T>(path, {
      ...init,
      method: "POST",
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
    }),
  put: <T>(path: string, json?: unknown) =>
    request<T>(path, {
      method: "PUT",
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
    }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
