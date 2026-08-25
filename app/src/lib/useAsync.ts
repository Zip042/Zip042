import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api";

/**
 * 서버에서 데이터를 읽어 오는 최소한의 훅.
 *
 * React Query 같은 라이브러리를 쓰지 않는 이유: 지금 화면 수와 요청 수에 비해
 * 캐시·무효화 정책을 도입할 이득이 없습니다. 필요해지면 이 훅의 사용처만 바꾸면 됩니다.
 *
 * 화면이 반드시 구분해야 하는 세 상태를 그대로 노출합니다.
 *  - `loading` : 아직 모른다
 *  - `error`   : 실패했다 (서버가 준 한국어 문구가 그대로 들어 있다)
 *  - `data`    : 값이 있다
 *
 * 이 셋을 뭉뚱그리면 "빈 목록"과 "불러오기 실패"가 같은 화면이 됩니다. 이 서비스에서
 * 조용한 실패는 가장 위험한 실패이므로 화면에서도 구분해야 합니다.
 */
export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** 다시 불러온다. 저장 후 갱신에 쓴다. */
  reload: () => void;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // 언마운트 후 setState 를 막는다. 페이지를 빠르게 오가면 경고가 뜬다.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    setLoading(true);
    setError(null);

    fnRef
      .current()
      .then((value) => {
        if (!alive.current) return;
        setData(value);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!alive.current) return;
        setData(null);
        setError(toMessage(err));
      })
      .finally(() => {
        if (alive.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, loading, error, reload };
}

/**
 * 오류를 사용자에게 보여줄 문구로 바꾼다.
 *
 * `ApiError` 의 message 는 **서버가 준 한국어 문장**이다. 화면에서 다시 쓰지 않는다 —
 * 문구를 양쪽에서 관리하면 서버가 이유를 바꿔도 화면은 옛말을 계속한다.
 */
export function toMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof TypeError) {
    // fetch 자체가 실패했다 = 서버가 안 떠 있거나 네트워크가 끊겼다.
    return "서버에 연결하지 못했습니다. 백엔드가 실행 중인지 확인해 주세요.";
  }
  if (err instanceof Error) return err.message;
  return "알 수 없는 오류가 발생했습니다.";
}
