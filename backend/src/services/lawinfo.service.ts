import { loadEnv } from "../env.js";
import { mockLawArticle, mockStandardLeaseForm } from "../mock/lawinfo.js";
import { log } from "../lib/logger.js";
import { LAW_REGISTRY, type LawKey } from "../domain/law-references.js";
import type { LawArticleResult, StandardLeaseFormResult } from "../domain/types.js";

/**
 * 법제처 국가법령정보 공동활용 오픈API 어댑터 (open.law.go.kr).
 *
 * ⚠️ 운영 전 확인 사항
 *   1) OC 키는 open.law.go.kr에서 이메일 인증으로 발급받는다. 발급 즉시 아래 두 호출을
 *      실제로 1회 확인할 것 (2026-08-25 `OC=test`로는 정상 동작 확인함).
 *   2) 조문 원문 태그명(조문내용)은 실제 호출로 확인했으나, 포털이 XML 스키마를 바꾸면
 *      깨질 수 있다. market-price.service.ts와 동일하게 실패는 예외 대신 unavailable로 표현한다.
 */

const LAW_GO_KR_BASE = "https://www.law.go.kr/DRF";

function extractTag(xml: string, names: string[]): string | null {
  for (const name of names) {
    const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
    if (m?.[1] !== undefined) {
      const value = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, "$1").trim();
      if (value.length > 0) return value;
    }
  }
  return null;
}

export function isLawInfoAvailable(): boolean {
  if (loadEnv().mode === "mock") return true;
  return Boolean(loadEnv().LAW_GO_KR_OC);
}

/** 조문 원문을 가져온다. 실패해도 예외를 던지지 않고 unavailable로 표현한다. */
export async function fetchLawArticle(lawKey: LawKey, jo: string): Promise<LawArticleResult> {
  const env = loadEnv();
  const fallbackUrl = `https://www.law.go.kr/법령/${encodeURIComponent(lawKey)}`;

  if (env.mode === "mock") return mockLawArticle(lawKey, jo);

  const oc = env.LAW_GO_KR_OC;
  if (!oc) return { source: "unavailable", text: null, url: fallbackUrl };

  const law = LAW_REGISTRY[lawKey];
  const url = new URL(`${LAW_GO_KR_BASE}/lawService.do`);
  url.searchParams.set("OC", oc);
  url.searchParams.set("target", "lawjosub");
  url.searchParams.set("type", "XML");
  url.searchParams.set("MST", law.mst);
  url.searchParams.set("JO", jo);

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`법제처 API 오류 (${res.status})`);
    const xml = await res.text();
    const text = extractTag(xml, ["조문내용"]);
    if (!text) throw new Error("조문내용을 찾을 수 없습니다.");
    return { source: "law_go_kr", text, url: fallbackUrl };
  } catch (err) {
    log.warn("법제처 조문 조회 실패", {
      lawKey,
      jo,
      error: err instanceof Error ? err.message : String(err),
    });
    return { source: "unavailable", text: null, url: fallbackUrl };
  }
}

/** 국토교통부 소관 주택임대차표준계약서 서식 링크를 가져온다. */
export async function fetchStandardLeaseForm(): Promise<StandardLeaseFormResult> {
  const env = loadEnv();
  const fallbackUrl =
    "https://www.law.go.kr/DRF/lawSearch.do?target=licbyl&query=주택임대차표준계약서";

  if (env.mode === "mock") return mockStandardLeaseForm();

  const oc = env.LAW_GO_KR_OC;
  if (!oc) return { source: "unavailable", pdfUrl: null, fallbackUrl };

  const url = new URL(`${LAW_GO_KR_BASE}/lawSearch.do`);
  url.searchParams.set("OC", oc);
  url.searchParams.set("target", "licbyl");
  url.searchParams.set("type", "XML");
  url.searchParams.set("query", "주택임대차표준계약서");

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`법제처 API 오류 (${res.status})`);
    const xml = await res.text();
    const pdfUrl = extractTag(xml, ["별표서식PDF파일링크", "별표서식파일링크"]);
    if (!pdfUrl) throw new Error("서식 파일 링크를 찾을 수 없습니다.");
    return { source: "law_go_kr", pdfUrl, fallbackUrl };
  } catch (err) {
    log.warn("법제처 서식 조회 실패", { error: err instanceof Error ? err.message : String(err) });
    return { source: "unavailable", pdfUrl: null, fallbackUrl };
  }
}
