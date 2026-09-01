import { adminClient } from "../lib/supabase.js";
import { notFound } from "../lib/errors.js";
import type { RegistryExtraction } from "../domain/types.js";

/**
 * 판독 결과 조회 — **사람이 원본과 대조하기 위한** 화면용.
 *
 * ## 왜 별도 엔드포인트인가
 *
 * 분석 응답(`/analysis`)은 **판정**을 담습니다. 등급·근거·다음 행동이지, 등기부에서
 * 무엇을 어떻게 읽었는지가 아닙니다. 그런데 AI 가 채권최고액을 한 자리 잘못 읽으면
 * 그 판정 전체가 틀립니다.
 *
 * 그래서 판정을 보여주기 **전에** 사용자가 원본과 대조할 수 있어야 하고, 그러려면
 * 판독 원문(각 권리의 `sourceQuote` 포함)이 필요합니다. 판정에는 쓰이지 않는
 * 데이터라 분석 응답에 섞지 않고 따로 냅니다.
 *
 * ## 소유권 검증
 *
 * `adminClient()` 를 쓰므로 RLS 가 우회됩니다. 그래서 이 함수가 **직접** case 소유권을
 * 확인합니다(CLAUDE.md 의 이중 방어 규칙).
 */

export interface ExtractionReview {
  /** 판독이 아직 없으면 null. "아직 안 읽었다"와 "읽었는데 비었다"는 다릅니다. */
  registry: RegistryExtraction | null;
  /** 모델 자기보고 신뢰도. **정확도 보장이 아닙니다** — 화면에서 그렇게 표시할 것. */
  confidence: number | null;
  model: string | null;
  schemaVersion: string | null;
  extractedAt: string | null;
}

export async function getExtractionReview(
  caseId: string,
  userId: string,
): Promise<ExtractionReview> {
  const admin = adminClient();

  // RLS 를 우회하는 클라이언트이므로 소유권을 코드에서 확인한다.
  const { data: owned } = await admin
    .from("cases")
    .select("id")
    .eq("id", caseId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!owned) throw notFound("검사 건을 찾을 수 없습니다.");

  const { data } = await admin
    .from("document_extractions")
    .select("payload,confidence,model,schema_version,created_at")
    .eq("case_id", caseId)
    .eq("doc_type", "registry")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return { registry: null, confidence: null, model: null, schemaVersion: null, extractedAt: null };
  }

  return {
    registry: (data.payload ?? null) as RegistryExtraction | null,
    confidence: data.confidence === null ? null : Number(data.confidence),
    model: (data.model as string | null) ?? null,
    schemaVersion: (data.schema_version as string | null) ?? null,
    extractedAt: (data.created_at as string | null) ?? null,
  };
}
