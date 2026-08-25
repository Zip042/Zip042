import { describe, expect, it } from "vitest";
import { SPECIAL_TERM_LIBRARY, legalBasisFor } from "../../src/domain/special-terms.js";

describe("특약 법조문 인용", () => {
  it("TERM_NO_NEW_ENCUMBRANCE는 주택임대차보호법 제3조를 인용한다", () => {
    expect(SPECIAL_TERM_LIBRARY.TERM_NO_NEW_ENCUMBRANCE!.legalBasis).toEqual([
      { law: "주택임대차보호법", jo: "000300", label: "제3조" },
    ]);
  });

  it("TERM_ADDRESS_EXACT는 제3조와 제3조의2를 함께 인용한다", () => {
    const labels = SPECIAL_TERM_LIBRARY.TERM_ADDRESS_EXACT!.legalBasis?.map((b) => b.label);
    expect(labels).toEqual(["제3조", "제3조의2"]);
  });

  it("법적 근거를 정하지 않은 특약은 legalBasisFor가 빈 배열을 돌려준다", () => {
    expect(legalBasisFor("TERM_PET_ALLOWED")).toEqual([]);
  });

  it("존재하지 않는 코드도 안전하게 빈 배열을 돌려준다", () => {
    expect(legalBasisFor("NOT_A_REAL_CODE")).toEqual([]);
  });
});
