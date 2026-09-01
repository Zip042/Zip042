import { badRequest } from "../lib/errors.js";
import { adminClient, type Db } from "../lib/supabase.js";
import {
  INTERVIEW_QUESTIONS,
  applyInterviewAnswers,
  nextQuestions,
  totalApplicableQuestions,
  type AnswerValue,
  type InterviewContext,
  type InterviewQuestion,
} from "../domain/interview.js";
import { recommendSpecialTerms, type RecommendedTerm } from "../domain/special-terms.js";
import { getCase, type CaseRow } from "./case.service.js";
import { ensureExtractions } from "./document.service.js";

/**
 * 대화형 후속 질문 세션 (기획서 2 ④).
 *
 * 질문 노출 조건은 분석 결과에 의존한다 — 신탁이 아닌 집에 "신탁 동의서 받았나요?"를 묻는 것은
 * 사용자의 시간을 낭비하는 일이다. 그래서 세션을 시작할 때 최신 분석 결과에서 context 를 만든다.
 */

const QUESTION_CODES = new Set(INTERVIEW_QUESTIONS.map((q) => q.code));

interface SessionRow {
  id: string;
  case_id: string;
  status: string;
  asked_codes: string[];
  answers: Record<string, AnswerValue>;
  created_at: string;
  completed_at: string | null;
}

async function buildContext(db: Db, caseId: string): Promise<InterviewContext> {
  const row: CaseRow = await getCase(db, caseId);

  // 분석이 이미 돌았으면 그 결과를 쓴다. 없으면 문서 추출만 읽어 최소 context 를 만든다.
  const { data: analysis } = await adminClient()
    .from("analyses")
    .select("payload")
    .eq("case_id", caseId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const payload = analysis?.payload as
    | { valuation?: { burdenRatio?: number | null; seniorClaimsKrw?: number } }
    | undefined;

  const extractions = payload
    ? null
    : await ensureExtractions(caseId, { reparse: false }).catch(() => null);

  const registry = extractions?.registry ?? null;
  const hasMortgage = payload
    ? (payload.valuation?.seniorClaimsKrw ?? 0) > 0
    : (registry?.rights ?? []).some((r) => !r.isCancelled && r.type === "mortgage");

  return {
    isMultiHousehold:
      row.building_type === "multi_household" ||
      row.building_type === "detached" ||
      (registry ? !registry.isSectionedBuilding : false),
    burdenRatio: payload?.valuation?.burdenRatio ?? null,
    hasMortgage,
    hasTrust: registry?.isTrustProperty ?? false,
    monthlyRentKrw: row.monthly_rent_krw,
    maintenanceFeeKrw: row.maintenance_fee_krw,
    depositKrw: row.deposit_krw,
  };
}

export interface InterviewState {
  sessionId: string;
  status: string;
  answeredCount: number;
  totalQuestions: number;
  /** 다음에 물어볼 질문 (최대 3개) */
  questions: InterviewQuestion[];
  answers: Record<string, AnswerValue>;
  /** 지금까지의 답변에서 도출된 특약 */
  derivedTerms: RecommendedTerm[];
  /** 지금까지의 답변에서 도출된 위험 신호 */
  derivedFindings: ReturnType<typeof applyInterviewAnswers>["findings"];
}

async function loadOrCreateSession(caseId: string): Promise<SessionRow> {
  const admin = adminClient();
  const { data, error } = await admin
    .from("interview_sessions")
    .select("id,case_id,status,asked_codes,answers,created_at,completed_at")
    .eq("case_id", caseId)
    .eq("status", "in_progress")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`인터뷰 세션 조회: ${error.message}`);
  if (data) return data as unknown as SessionRow;

  const created = await admin
    .from("interview_sessions")
    .insert({ case_id: caseId })
    .select("id,case_id,status,asked_codes,answers,created_at,completed_at")
    .single();
  if (created.error || !created.data) {
    throw new Error(`인터뷰 세션 생성: ${created.error?.message}`);
  }
  return created.data as unknown as SessionRow;
}

function toState(
  session: SessionRow,
  ctx: InterviewContext,
  caseRow: { depositKrw: number; maintenanceFeeKrw: number },
): InterviewState {
  const answers = session.answers ?? {};
  const answered = new Set(Object.keys(answers));
  const outcome = applyInterviewAnswers(answers);

  return {
    sessionId: session.id,
    status: session.status,
    answeredCount: answered.size,
    totalQuestions: totalApplicableQuestions(ctx),
    questions: nextQuestions(ctx, answered, 3),
    answers,
    derivedTerms: recommendSpecialTerms(
      new Map(),
      { depositKrw: caseRow.depositKrw, maintenanceFeeKrw: caseRow.maintenanceFeeKrw },
      outcome.extraTermCodes,
      // 기본 특약은 분석 결과에서 이미 제공하므로, 여기서는 인터뷰가 추가한 것만 골라낸다.
    ).filter((t) => outcome.extraTermCodes.includes(t.code)),
    derivedFindings: outcome.findings,
  };
}

export async function startInterview(db: Db, caseId: string): Promise<InterviewState> {
  const [session, ctx, row] = await Promise.all([
    loadOrCreateSession(caseId),
    buildContext(db, caseId),
    getCase(db, caseId),
  ]);
  return toState(session, ctx, {
    depositKrw: row.deposit_krw,
    maintenanceFeeKrw: row.maintenance_fee_krw,
  });
}

export async function submitAnswers(
  db: Db,
  caseId: string,
  incoming: Record<string, AnswerValue>,
): Promise<InterviewState> {
  const unknownCodes = Object.keys(incoming).filter((c) => !QUESTION_CODES.has(c));
  if (unknownCodes.length > 0) {
    throw badRequest(`알 수 없는 질문 코드입니다: ${unknownCodes.join(", ")}`);
  }

  const session = await loadOrCreateSession(caseId);
  const merged = { ...(session.answers ?? {}), ...incoming };
  const askedCodes = [...new Set([...(session.asked_codes ?? []), ...Object.keys(merged)])];

  const ctx = await buildContext(db, caseId);
  const remaining = nextQuestions(ctx, new Set(Object.keys(merged)), 1);
  const completed = remaining.length === 0;

  const admin = adminClient();
  const { data, error } = await admin
    .from("interview_sessions")
    .update({
      answers: merged,
      asked_codes: askedCodes,
      status: completed ? "completed" : "in_progress",
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("id", session.id)
    .select("id,case_id,status,asked_codes,answers,created_at,completed_at")
    .single();
  if (error || !data) throw new Error(`답변 저장 실패: ${error?.message}`);

  const row = await getCase(db, caseId);
  return toState(data as unknown as SessionRow, ctx, {
    depositKrw: row.deposit_krw,
    maintenanceFeeKrw: row.maintenance_fee_krw,
  });
}

export async function resetInterview(caseId: string): Promise<void> {
  const { error } = await adminClient()
    .from("interview_sessions")
    .update({ status: "abandoned" })
    .eq("case_id", caseId)
    .eq("status", "in_progress");
  if (error) throw new Error(`인터뷰 초기화 실패: ${error.message}`);
}
