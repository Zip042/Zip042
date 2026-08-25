import type { LawArticleResult, StandardLeaseFormResult } from "../domain/types.js";
import type { LawKey } from "../domain/law-references.js";

/**
 * 법제처 API 목 데이터.
 * 실제 조문 원문 일부를 그대로 넣어둔다(2026-08-25 실제 호출로 확인한 문구) —
 * "임대인은 잔금일 다음 날까지..." 같은 특약 문구와 나란히 보여도 부자연스럽지 않게 하기 위함.
 */
const ARTICLE_FIXTURES: Record<string, string> = {
  "주택임대차보호법:000300":
    "임대차는 그 등기가 없는 경우에도 임차인이 주택의 인도와 주민등록을 마친 때에는 " +
    "그 다음 날부터 제삼자에 대하여 효력이 생긴다.",
  "주택임대차보호법:000302":
    "제3조제1항ㆍ제2항 또는 제3항의 대항요건(對抗要件)과 임대차계약증서(제3조제2항 및 제3항의 " +
    "경우에는 법인과 임대인 사이의 임대차계약증서를 말한다)상의 확정일자(確定日字)를 갖춘 임차인은 " +
    "「민사집행법」에 따른 경매 또는 「국세징수법」에 따른 공매(公賣)를 할 때에 임차주택(대지를 " +
    "포함한다)의 환가대금(換價代金)에서 후순위권리자(後順位權利者)나 그 밖의 채권자보다 우선하여 " +
    "보증금을 변제(辨濟)받을 권리가 있다.",
  "주민등록법:001100":
    "제10조에 따른 신고는 세대주가 신고사유가 발생한 날부터 14일 이내에 하여야 한다. " +
    "다만, 세대주가 신고할 수 없으면 그를 대신하여 다음 각 호의 어느 하나에 해당하는 자가 할 수 있다.",
};

export function mockLawArticle(lawKey: LawKey, jo: string): LawArticleResult {
  const text =
    ARTICLE_FIXTURES[`${lawKey}:${jo}`] ?? `(목 데이터) ${lawKey} ${jo} 조문 원문 예시입니다.`;
  return {
    source: "law_go_kr",
    text,
    url: `https://www.law.go.kr/법령/${encodeURIComponent(lawKey)}`,
  };
}

export function mockStandardLeaseForm(): StandardLeaseFormResult {
  return {
    source: "law_go_kr",
    pdfUrl: "https://www.law.go.kr/mock/주택임대차표준계약서.pdf",
    fallbackUrl: "https://www.law.go.kr/DRF/lawSearch.do?target=licbyl&query=주택임대차표준계약서",
  };
}
