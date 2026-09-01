import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, setToken, clearToken } from "@/lib/api";

/**
 * 로그인 상태.
 *
 * ## 세션을 어떻게 아는가
 *
 * 서버가 만료 시각까지 딸린 JWT 를 안 돌려줍니다(accessToken 문자열만 옵니다).
 * 그래서 "로그인했다"는 사실 자체는 로컬에 남기되(토큰이 있으면 로그인한 것으로
 * 간주), 실제로 유효한지는 **첫 보호된 API 호출이 401 을 돌려줄 때** 압니다.
 * `api.ts` 가 401 을 감지하면 이 컨텍스트의 `signOut` 을 부를 수 있게
 * `onUnauthorized` 콜백을 등록해 둡니다.
 */

interface AuthState {
  email: string | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

interface AuthSession {
  accessToken: string;
  userId: string;
  email: string;
}

const EMAIL_KEY = "zip042.email";

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(() => {
    try {
      return localStorage.getItem(EMAIL_KEY);
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);

  // api.ts 가 401 을 만나면 여기로 알려 로그인 상태를 지운다.
  // (토큰 만료·서버 재시작으로 세션이 끊긴 경우를 화면이 알아채게 한다.)
  useEffect(() => {
    const handler = () => {
      clearToken();
      try {
        localStorage.removeItem(EMAIL_KEY);
      } catch {
        /* noop */
      }
      setEmail(null);
    };
    window.addEventListener("zip042:unauthorized", handler);
    return () => window.removeEventListener("zip042:unauthorized", handler);
  }, []);

  function persist(session: AuthSession) {
    setToken(session.accessToken);
    try {
      localStorage.setItem(EMAIL_KEY, session.email);
    } catch {
      /* 저장 못 해도 이번 세션은 메모리로 동작 */
    }
    setEmail(session.email);
  }

  async function signUp(emailInput: string, password: string) {
    setLoading(true);
    try {
      const session = await api.post<AuthSession>("/v1/auth/signup", {
        email: emailInput,
        password,
      });
      persist(session);
    } finally {
      setLoading(false);
    }
  }

  async function signIn(emailInput: string, password: string) {
    setLoading(true);
    try {
      const session = await api.post<AuthSession>("/v1/auth/login", {
        email: emailInput,
        password,
      });
      persist(session);
    } finally {
      setLoading(false);
    }
  }

  function signOut() {
    clearToken();
    try {
      localStorage.removeItem(EMAIL_KEY);
    } catch {
      /* noop */
    }
    setEmail(null);
  }

  const value = useMemo<AuthState>(
    () => ({ email, loading, signUp, signIn, signOut }),
    [email, loading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth 는 AuthProvider 안에서만 쓸 수 있습니다.");
  return v;
}

export { ApiError };
