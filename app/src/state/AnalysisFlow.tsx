import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * 분석 흐름(`/analyze` → `/analyze/documents` → `/analyze/details` → `/analyze/result`)이
 * 공유하는 상태.
 *
 * 페이지가 라우터로 나뉘어 있으므로 caseId 를 어딘가에 들고 있어야 합니다.
 * `sessionStorage` 에 저장하는 이유: 새로고침해도 흐름이 이어지고, 탭을 닫으면 사라집니다.
 * (localStorage 로 두면 다음에 앱을 열었을 때 남의 옛 검사 건이 튀어나옵니다.)
 */

const STORAGE_KEY = "zip042.flow";

export interface FlowState {
  caseId: string | null;
  /** 마지막으로 올린 등기부 파일 이름. 진행 화면에 그대로 보여준다. */
  registryFileName: string | null;
  /** 서류 단계를 건너뛰었는지 — 스텝 표시에 쓴다. */
  skippedDocuments: boolean;
  /**
   * 방금 받은 판정 결과.
   *
   * 보통은 결과 화면이 서버에서 다시 읽는다. 다만 데모 배포처럼 서버가 검사 건을
   * 잃어버리는 환경(서버리스 인스턴스마다 인메모리 저장소가 따로다)에서는 이 값이
   * 대비책이 된다 — **이번 세션에서 실제로 받은 판정**이므로 지어낸 값이 아니다.
   */
  lastAnalysis: Record<string, unknown> | null;
}

const EMPTY: FlowState = {
  caseId: null,
  registryFileName: null,
  skippedDocuments: false,
  lastAnalysis: null,
};

function read(): FlowState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<FlowState>) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

function write(state: FlowState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* 저장할 수 없어도 이번 화면 전환까지는 메모리 상태로 동작한다 */
  }
}

interface FlowContext extends FlowState {
  update: (patch: Partial<FlowState>) => void;
  reset: () => void;
}

const Context = createContext<FlowContext | null>(null);

export function AnalysisFlowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FlowState>(read);

  const update = useCallback((patch: Partial<FlowState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      write(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setState(EMPTY);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* 지우지 못해도 메모리 상태는 비워졌다 */
    }
  }, []);

  const value = useMemo<FlowContext>(() => ({ ...state, update, reset }), [state, update, reset]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAnalysisFlow(): FlowContext {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useAnalysisFlow 는 AnalysisFlowProvider 안에서만 쓸 수 있습니다.");
  return ctx;
}
