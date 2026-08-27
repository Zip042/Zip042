import { describe, expect, it } from "vitest";
import { validateRegistryExtraction } from "../../src/domain/registry-validation.js";
import type { RegistryExtraction } from "../../src/domain/types.js";

const TODAY = "2026-08-27" as const;

function baseRegistry(overrides: Partial<RegistryExtraction> = {}): RegistryExtraction {
  return {
    address: "대전광역시 서구 둔산로 89",
    buildingName: "가상빌라",
    exclusiveAreaM2: 29.75,
    landAreaM2: null,
    ownerNames: ["김소유"],
    ownershipAcquiredOn: "2023-08-27",
    issuedOn: "2026-08-20",
    isTrustProperty: false,
    isSectionedBuilding: true,
    rights: [],
    unreadableSections: [],
    ...overrides,
  };
}

describe("갑구(소유권) 판독 확인", () => {
  it("갑구 rights 도 채워지고 ownerNames 도 있으면 통과한다", () => {
    const findings = validateRegistryExtraction({
      today: TODAY,
      registry: baseRegistry({
        rights: [
          {
            section: "gap",
            rankNo: "2",
            type: "ownership_transfer",
            holder: "김소유",
            maxClaimKrw: null,
            registeredOn: "2023-08-27",
            isCancelled: false,
            note: "소유권이전",
            sourceQuote: "소유권이전 소유자 김소유",
          },
        ],
      }),
    });
    expect(findings.find((f) => f.code === "RIGHTS_GAP_SECTION_EMPTY")).toBeUndefined();
  });

  /**
   * 실제 판독으로 잡은 버그. 같은 문서를 다시 넣어도 모델이 매번 같은 구조로
   * 뽑지 않는다 — ownerNames(최상위 필드)는 채웠는데 rights 의 gap 항목은
   * 하나도 안 만드는 경우가 실제로 나왔다. 예전 로직은 rights 배열만 보고
   * "소유권을 못 읽었다"며 STOP 을 냈는데, 소유자는 이미 알고 있었다.
   * 같은 파일을 두 번 올렸을 때 판정이 갈리는 원인이었다.
   */
  it("rights 의 gap 항목이 비어도 ownerNames 가 있으면 판독 실패로 보지 않는다", () => {
    const findings = validateRegistryExtraction({
      today: TODAY,
      registry: baseRegistry({
        ownerNames: ["이가상"],
        rights: [
          {
            section: "eul",
            rankNo: "2",
            type: "mortgage",
            holder: "가상저축은행",
            maxClaimKrw: 240_000_000,
            registeredOn: "2022-07-14",
            isCancelled: false,
            note: "근저당권설정",
            sourceQuote: "채권최고액 금240,000,000원",
          },
        ],
      }),
    });
    expect(findings.find((f) => f.code === "RIGHTS_GAP_SECTION_EMPTY")).toBeUndefined();
  });

  it("rights 도 비어 있고 ownerNames 도 없으면 진짜 판독 실패로 본다", () => {
    const findings = validateRegistryExtraction({
      today: TODAY,
      registry: baseRegistry({ ownerNames: [], rights: [] }),
    });
    const f = findings.find((x) => x.code === "RIGHTS_GAP_SECTION_EMPTY");
    expect(f).toBeDefined();
    expect(f?.kind).toBe("info_gap");
    expect(f?.severity).toBe("danger");
  });
});

describe("그 외 값 검산", () => {
  it("소재지를 못 읽으면 danger info_gap", () => {
    const findings = validateRegistryExtraction({
      today: TODAY,
      registry: baseRegistry({ address: null }),
    });
    const f = findings.find((x) => x.code === "RIGHTS_ADDRESS_UNREADABLE");
    expect(f).toBeDefined();
    expect(f?.kind).toBe("info_gap");
  });

  it("채권최고액이 0 이하면 판독 오류로 본다", () => {
    const findings = validateRegistryExtraction({
      today: TODAY,
      registry: baseRegistry({
        rights: [
          {
            section: "eul",
            rankNo: "1",
            type: "mortgage",
            holder: "은행",
            maxClaimKrw: 0,
            registeredOn: "2023-01-01",
            isCancelled: false,
            note: "근저당권설정",
            sourceQuote: "채권최고액 금0원",
          },
        ],
      }),
    });
    expect(findings.find((f) => f.code === "RIGHTS_AMOUNT_IMPLAUSIBLE")).toBeDefined();
  });

  it("접수일이 오늘보다 미래면 이상값으로 본다", () => {
    const findings = validateRegistryExtraction({
      today: TODAY,
      registry: baseRegistry({
        rights: [
          {
            section: "eul",
            rankNo: "1",
            type: "mortgage",
            holder: "은행",
            maxClaimKrw: 100_000_000,
            registeredOn: "2099-01-01",
            isCancelled: false,
            note: "근저당권설정",
            sourceQuote: "채권최고액 금100,000,000원",
          },
        ],
      }),
    });
    expect(findings.find((f) => f.code === "RIGHTS_DATE_IMPLAUSIBLE")).toBeDefined();
  });

  it("원문 인용(sourceQuote)이 없는 권리가 있으면 근거 미상으로 본다", () => {
    const findings = validateRegistryExtraction({
      today: TODAY,
      registry: baseRegistry({
        rights: [
          {
            section: "eul",
            rankNo: "1",
            type: "mortgage",
            holder: "은행",
            maxClaimKrw: 100_000_000,
            registeredOn: "2023-01-01",
            isCancelled: false,
            note: "근저당권설정",
            sourceQuote: "",
          },
        ],
      }),
    });
    expect(findings.find((f) => f.code === "RIGHTS_SOURCE_QUOTE_MISSING")).toBeDefined();
  });

  it("문제가 없으면 findings 가 비어 있다", () => {
    const findings = validateRegistryExtraction({
      today: TODAY,
      registry: baseRegistry({
        rights: [
          {
            section: "gap",
            rankNo: "1",
            type: "other",
            holder: "김소유",
            maxClaimKrw: null,
            registeredOn: "2023-08-27",
            isCancelled: false,
            note: "소유권보존",
            sourceQuote: "소유권보존 소유자 김소유",
          },
        ],
      }),
    });
    expect(findings).toEqual([]);
  });
});
