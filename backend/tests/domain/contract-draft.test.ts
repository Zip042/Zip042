import { describe, expect, it } from "vitest";
import { assembleContractDraft, type ContractDraftInput } from "../../src/domain/contract-draft.js";

function baseInput(): ContractDraftInput {
  return {
    parties: [
      { role: "임대인", name: "김임대", businessRegistrationNumber: null, businessVerification: null },
      { role: "임차인", name: null, businessRegistrationNumber: null, businessVerification: null },
    ],
    property: {
      roadAddress: "대전광역시 서구 둔산로 100",
      detailAddress: "301호",
      buildingType: "multi_family",
      exclusiveAreaM2: 29.75,
    },
    terms: {
      leaseType: "jeonse",
      depositKrw: 90_000_000,
      monthlyRentKrw: 0,
      maintenanceFeeKrw: 50_000,
      contractDate: "2026-09-10",
      balanceDate: "2026-10-08",
      contractTermMonths: 24,
    },
    specialTerms: [
      {
        code: "TERM_NO_NEW_ENCUMBRANCE",
        title: "잔금일 다음 날까지 새로운 담보 설정 금지",
        priority: 10,
        clauseText: "임대인은 ... 담보권도 설정하지 아니한다.",
        legalBasis: [{ law: "주택임대차보호법", jo: "000300", label: "제3조" }],
      },
    ],
    standardForm: {
      pdfUrl: "https://www.law.go.kr/mock/양식.pdf",
      fallbackUrl: "https://www.law.go.kr",
    },
  };
}

describe("assembleContractDraft", () => {
  it("주소와 상세주소를 하나의 문자열로 합친다", () => {
    const draft = assembleContractDraft(baseInput());
    expect(draft.propertyDescription).toBe("대전광역시 서구 둔산로 100 301호");
  });

  it("전세는 보증금만 요약에 넣는다", () => {
    const draft = assembleContractDraft(baseInput());
    expect(draft.terms.summary).toBe("보증금 9,000만원");
  });

  it("월세는 보증금과 월세를 함께 요약한다", () => {
    const input = baseInput();
    input.terms.leaseType = "monthly";
    input.terms.depositKrw = 10_000_000;
    input.terms.monthlyRentKrw = 500_000;
    const draft = assembleContractDraft(input);
    expect(draft.terms.summary).toBe("보증금 1,000만원 / 월세 50만원");
  });

  it("특약을 우선순위 순으로 정렬하고 법조문 라벨을 붙인다", () => {
    const input = baseInput();
    input.specialTerms.push({
      code: "TERM_LOW_PRIORITY",
      title: "낮은 우선순위 특약",
      priority: 999,
      clauseText: "...",
      legalBasis: [],
    });
    const draft = assembleContractDraft(input);
    expect(draft.specialTerms.map((t) => t.code)).toEqual([
      "TERM_NO_NEW_ENCUMBRANCE",
      "TERM_LOW_PRIORITY",
    ]);
    expect(draft.specialTerms[0]!.legalBasisLabels).toEqual(["주택임대차보호법 제3조"]);
    expect(draft.specialTerms[1]!.legalBasisLabels).toEqual([]);
  });

  it("주소가 없으면 안내 문구를 대신 넣는다", () => {
    const input = baseInput();
    input.property.roadAddress = null;
    input.property.detailAddress = null;
    const draft = assembleContractDraft(input);
    expect(draft.propertyDescription).toBe("주소 미입력");
  });

  it("서식 PDF 링크가 있으면 그것을, 없으면 대체 링크를 쓴다", () => {
    const withPdf = assembleContractDraft(baseInput());
    expect(withPdf.standardFormUrl).toBe("https://www.law.go.kr/mock/양식.pdf");

    const input = baseInput();
    input.standardForm.pdfUrl = null;
    const withoutPdf = assembleContractDraft(input);
    expect(withoutPdf.standardFormUrl).toBe("https://www.law.go.kr");
  });

  it("면책 문구를 항상 포함한다", () => {
    const draft = assembleContractDraft(baseInput());
    expect(draft.disclaimer).toContain("법률 자문이 아니며");
  });

  it("렌트홈 안내를 항상 포함한다", () => {
    const draft = assembleContractDraft(baseInput());
    expect(draft.rentHomeNotice.linkUrl).toBe("https://www.renthome.go.kr");
  });

  it("계약일과 잔금일을 출력에 포함한다", () => {
    const draft = assembleContractDraft(baseInput());
    expect(draft.terms.contractDate).toBe("2026-09-10");
    expect(draft.terms.balanceDate).toBe("2026-10-08");
  });
});
