/**
 * 백엔드 호출 창구.
 *
 * ## 왜 이 파일 하나로 모으는가
 *
 * 화면마다 fetch 를 흩뿌리면 인증 헤더·에러 형태·기본 주소가 제각각이 됩니다.
 * 특히 이 서비스는 **실패를 조용히 넘기면 안 되는** 성격이라(모르는 값을 0으로
 * 채우지 않는다), 실패를 한 곳에서 같은 모양으로 만들어 화면에 넘깁니다.
 *
 * ## 인증
 *
 * 로그인하면 `POST /v1/auth/login` 이 돌려준 access token 을 여기 저장합니다.
 * 로그인 전에는 헤더를 아예 안 보냅니다 — 공개 엔드포인트(용어사전 등)는 그래도
 * 되고, 보호된 엔드포인트는 진짜 401 을 받아야 화면이 "로그인이 필요합니다"를
 * 정확히 보여줍니다. 가짜 토큰을 만들어 보내면 그 신호가 흐려집니다.
 */

const TOKEN_KEY = "zip042.token";

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

function token(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // 시크릿 모드 등에서 localStorage 가 막혀도 앱이 죽지 않게.
    return null;
  }
}

export function setToken(v: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, v);
  } catch {
    /* 저장 못 해도 이번 세션은 로그인 안 한 것으로 동작 */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* noop */
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 20_000, ...rest } = init;
  const t = token();

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...rest,
      headers: {
        "content-type": "application/json",
        ...(t ? { authorization: `Bearer ${t}` } : {}),
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
    if (res.status === 401 && t) {
      // 토큰이 있었는데 거부됐다 = 만료됐거나 서버가 재시작됐다. 세션을 지우고
      // AuthProvider 가 로그인 화면으로 보내게 알린다. (여기서 화면을 직접 옮기지
      // 않는다 — api.ts 는 fetch 계층이지 라우팅을 몰라야 한다.)
      window.dispatchEvent(new Event("zip042:unauthorized"));
    }
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
