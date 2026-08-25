/**
 * 법제처 국가법령정보 오픈API(open.law.go.kr)가 쓰는 조번호(JO) 인코딩과,
 * 우리가 특약 근거로 인용하는 법령의 고정 식별자를 모아둔다.
 *
 * MST(법령마스터번호)·ID는 2026-08-25 `https://www.law.go.kr/DRF/lawSearch.do?OC=test&target=law`
 * 실제 호출로 확인했다. JO 인코딩(조 4자리 + 가지번호 2자리)도 같은 날
 * `target=lawjosub` 실제 호출로 검증했다(제3조 → "000300", 제3조의2 → "000302" 정상 응답 확인).
 *
 * ⚠️ 법이 폐지·전부개정되면 MST가 바뀔 수 있다. 이 값이 깨지면 lawinfo.service.ts의
 * 조문 조회가 전부 unavailable로 폴백하므로, 그 경우 포털에서 재확인할 것.
 */

export const LAW_REGISTRY = {
  주택임대차보호법: { mst: "276291", id: "001248" },
  주민등록법: { mst: "268555", id: "001655" },
} as const;

export type LawKey = keyof typeof LAW_REGISTRY;

/** 조 번호를 law.go.kr JO 파라미터 형식(6자리: 조 4자리 + 가지번호 2자리)으로 인코딩한다. */
export function encodeJo(article: number, branch = 0): string {
  if (!Number.isInteger(article) || article <= 0 || article > 9999) {
    throw new Error(`조 번호가 올바르지 않습니다: ${article}`);
  }
  if (!Number.isInteger(branch) || branch < 0 || branch > 99) {
    throw new Error(`가지번호가 올바르지 않습니다: ${branch}`);
  }
  return `${String(article).padStart(4, "0")}${String(branch).padStart(2, "0")}`;
}
