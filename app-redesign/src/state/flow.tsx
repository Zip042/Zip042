import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { JudgmentResult, RegistryExtraction } from "@/data/sample";

/**
 * 검사 흐름 상태 — 서류 → 판독 확인 → 판정 → 세부사항이 같은 검사 건을 공유합니다.
 *
 * 라우터로만 넘기면 새로고침 한 번에 caseId 를 잃습니다. 그래서 caseId 만
 * sessionStorage 에 둡니다(판정 결과는 언제든 서버에서 다시 받을 수 있으므로
 * 저장하지 않습니다 — 오래된 판정을 화면에 남기는 것이 더 위험합니다).
 */

interface FlowState {
  caseId: string | null;
  setCaseId: (id: string | null) => void;

  /** 방금 실행한 판정. 없으면 화면이 서버에서 다시 가져옵니다. */
  result: JudgmentResult | null;
  setResult: (r: JudgmentResult | null) => void;

  extraction: RegistryExtraction | null;
  setExtraction: (e: RegistryExtraction | null) => void;

  specialTerms: { title: string; body: string }[];
  setSpecialTerms: (t: { title: string; body: string }[]) => void;

  reset: () => void;
}

const KEY = "zip042.caseId";

function readCaseId(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

const Ctx = createContext<FlowState | null>(null);

export function FlowProvider({ children }: { children: ReactNode }) {
  const [caseId, setCaseIdState] = useState<string | null>(readCaseId);
  const [result, setResult] = useState<JudgmentResult | null>(null);
  const [extraction, setExtraction] = useState<RegistryExtraction | null>(null);
  const [specialTerms, setSpecialTerms] = useState<{ title: string; body: string }[]>([]);

  const value = useMemo<FlowState>(
    () => ({
      caseId,
      setCaseId: (id) => {
        setCaseIdState(id);
        try {
          if (id) sessionStorage.setItem(KEY, id);
          else sessionStorage.removeItem(KEY);
        } catch {
          /* 저장 못 해도 이번 탭에서는 메모리로 동작 */
        }
      },
      result,
      setResult,
      extraction,
      setExtraction,
      specialTerms,
      setSpecialTerms,
      reset: () => {
        setResult(null);
        setExtraction(null);
        setSpecialTerms([]);
        setCaseIdState(null);
        try {
          sessionStorage.removeItem(KEY);
        } catch {
          /* noop */
        }
      },
    }),
    [caseId, result, extraction, specialTerms],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFlow(): FlowState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFlow 는 FlowProvider 안에서만 쓸 수 있습니다.");
  return v;
}
