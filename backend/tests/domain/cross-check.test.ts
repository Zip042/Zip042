import { describe, expect, it } from "vitest";
import { crossCheck, normalizeAddress, type CaseFacts } from "../../src/domain/cross-check.js";
import type {
  BrokerageStatementExtraction,
  LeaseDraftExtraction,
  RegistryExtraction,
} from "../../src/domain/types.js";

const TODAY = "2026-08-20";

const facts = (o: Partial<CaseFacts> = {}): CaseFacts => ({
  roadAddress: "대전광역시 서구 둔산로 100",
  detailAddress: "301호",
  exclusiveAreaM2: 29.75,
  depositKrw: 100_000_000,
  monthlyRentKrw: 0,
  maintenanceFeeKrw: 70_000,
  contractDate: "2026-09-10",
  balanceDate: "2026-10-08",
  isMultiHousehold: false,
  today: TODAY,
  ...o,
});

const registry = (o: Partial<RegistryExtraction> = {}): RegistryExtraction => ({
  address: "대전광역시 서구 둔산로 100",
  ownerNames: ["김소유"],
  isTrustProperty: false,
  isSectionedBuilding: true,
  exclusiveAreaM2: 29.75,
  rights: [],
  unreadableSections: [],
  ...o,
});

const lease = (o: Partial<LeaseDraftExtraction> = {}): LeaseDraftExtraction => ({
  address: "대전광역시 서구 둔산로 100",
  detailAddress: "301호",
  lessorName: "김소유",
  lessorAccountHolder: "김소유",
  depositKrw: 100_000_000,
  monthlyRentKrw: 0,
  contractDate: "2026-09-10",
  balanceDate: "2026-10-08",
  specialTerms: ["임대인은 잔금일 다음 날까지 근저당을 설정하지 않는다."],
  unreadableSections: [],
  ...o,
});

const brokerage = (o: Partial<BrokerageStatementExtraction> = {}): BrokerageStatementExtraction => ({
  address: "대전광역시 서구 둔산로 100",
  ownerName: "김소유",
  exclusiveAreaM2: 29.75,
  declaredEncumbrances: [],
  agentRegistrationNo: "30170-2024-00123",
  signedByAgent: true,
  issuedOn: "2026-08-18",
  unreadableSections: [],
  ...o,
});

describe("서류 제출 여부", () => {
  it("등기부가 없으면 danger", () => {
    const r = crossCheck({ facts: facts() });
    expect(r.findings.find((f) => f.code === "DOC_REGISTRY_MISSING")?.severity).toBe("danger");
  });

  it("권장 서류(확인설명서 · 계약서)가 없으면 caution", () => {
    const r = crossCheck({ facts: facts(), registry: registry() });
    const codes = r.findings.map((f) => f.code);
    expect(codes).toContain("DOC_BROKERAGE_STATEMENT_MISSING");
    expect(codes).toContain("DOC_LEASE_DRAFT_MISSING");
    expect(r.level).toBe("caution");
  });

  it("세 서류가 모두 일치하면 위험 항목이 없다", () => {
    const r = crossCheck({
      facts: facts(),
      registry: registry(),
      lease: lease(),
      brokerage: brokerage(),
    });
    expect(r.submitted).toEqual({ registry: true, brokerage: true, lease: true });
    expect(r.findings).toHaveLength(0);
    expect(r.level).toBe("safe");
  });
});

describe("주소 대조", () => {
  it("건물번호가 다르면 critical", () => {
    const r = crossCheck({
      facts: facts(),
      registry: registry({ address: "대전광역시 서구 둔산로 200" }),
      lease: lease(),
    });
    expect(r.findings.find((f) => f.code === "DOC_ADDRESS_MISMATCH")?.severity).toBe("critical");
  });

  it("표기 차이(공백 · 괄호)는 같은 주소로 본다", () => {
    const r = crossCheck({
      facts: facts(),
      registry: registry({ address: "대전광역시  서구 둔산로 100 (둔산동)" }),
      lease: lease(),
      brokerage: brokerage(),
    });
    expect(r.findings.map((f) => f.code)).not.toContain("DOC_ADDRESS_MISMATCH");
  });

  it("동·호수가 없으면 확정일자 효력 위험을 알린다", () => {
    const r = crossCheck({
      facts: facts({ detailAddress: null }),
      registry: registry(),
      lease: lease({ detailAddress: null }),
      brokerage: brokerage(),
    });
    expect(r.findings.find((f) => f.code === "DOC_DETAIL_ADDRESS_MISSING")?.severity).toBe("danger");
  });

  it("주소 정규화", () => {
    expect(normalizeAddress("대전광역시 서구 둔산로 100 (둔산동)")).toBe("대전광역시서구둔산로100둔산동");
  });
});

describe("금액 · 날짜 대조", () => {
  it("계약서 보증금이 입력값과 다르면 danger", () => {
    const r = crossCheck({
      facts: facts(),
      registry: registry(),
      lease: lease({ depositKrw: 150_000_000 }),
    });
    expect(r.findings.find((f) => f.code === "DOC_DEPOSIT_MISMATCH")?.severity).toBe("danger");
  });

  it("계약금 + 잔금 ≠ 보증금이면 검산 실패를 알린다", () => {
    const r = crossCheck({
      facts: facts(),
      registry: registry(),
      lease: lease({ downPaymentKrw: 10_000_000, balanceKrw: 80_000_000 }),
    });
    const f = r.findings.find((x) => x.code === "DOC_DEPOSIT_SUM_MISMATCH");
    expect(f?.severity).toBe("danger");
    expect(f?.evidence).toMatchObject({ sum: 90_000_000, deposit: 100_000_000 });
  });

  it("계약금 + 잔금 = 보증금이면 통과", () => {
    const r = crossCheck({
      facts: facts(),
      registry: registry(),
      lease: lease({ downPaymentKrw: 10_000_000, balanceKrw: 90_000_000 }),
    });
    expect(r.findings.map((f) => f.code)).not.toContain("DOC_DEPOSIT_SUM_MISMATCH");
  });

  it("잔금일 불일치는 일정 계산에 영향을 주므로 danger", () => {
    const r = crossCheck({
      facts: facts(),
      registry: registry(),
      lease: lease({ balanceDate: "2026-10-15" }),
    });
    expect(r.findings.find((f) => f.code === "DOC_BALANCE_DATE_MISMATCH")?.severity).toBe("danger");
  });

  it("입금 계좌 명의가 임대인과 다르면 critical", () => {
    const r = crossCheck({
      facts: facts(),
      registry: registry(),
      lease: lease({ lessorAccountHolder: "김가족" }),
    });
    expect(r.findings.find((f) => f.code === "DOC_ACCOUNT_HOLDER_MISMATCH")?.severity).toBe("critical");
  });

  it("면적이 서류마다 다르면 danger", () => {
    const r = crossCheck({
      facts: facts(),
      registry: registry({ exclusiveAreaM2: 29.75 }),
      brokerage: brokerage({ exclusiveAreaM2: 42.1 }),
    });
    expect(r.findings.find((f) => f.code === "DOC_AREA_MISMATCH")?.severity).toBe("danger");
  });

  it("면적 0.5㎡ 이내 차이는 같은 값으로 본다", () => {
    const r = crossCheck({
      facts: facts(),
      registry: registry({ exclusiveAreaM2: 29.75 }),
      brokerage: brokerage({ exclusiveAreaM2: 29.8 }),
    });
    expect(r.findings.map((f) => f.code)).not.toContain("DOC_AREA_MISMATCH");
  });
});

describe("중개대상물 확인·설명서 고유 점검", () => {
  it("등기부에 근저당이 있는데 설명서에 미기재면 중개사 설명의무 위반 신호", () => {
    const r = crossCheck({
      facts: facts(),
      registry: registry({
        rights: [
          {
            section: "eul",
            type: "mortgage",
            maxClaimKrw: 100_000_000,
            isCancelled: false,
          },
        ],
      }),
      brokerage: brokerage({ declaredEncumbrances: [] }),
      lease: lease(),
    });
    const f = r.findings.find((x) => x.code === "DOC_ENCUMBRANCE_NOT_DISCLOSED");
    expect(f?.severity).toBe("danger");
    expect(f?.suggestTerms).toContain("TERM_BROKER_LIABILITY");
  });

  it("설명서에 기재되어 있으면 경고하지 않는다", () => {
    const r = crossCheck({
      facts: facts(),
      registry: registry({
        rights: [{ section: "eul", type: "mortgage", maxClaimKrw: 100_000_000, isCancelled: false }],
      }),
      brokerage: brokerage({ declaredEncumbrances: ["근저당권 1억원 ○○은행"] }),
      lease: lease(),
    });
    expect(r.findings.map((f) => f.code)).not.toContain("DOC_ENCUMBRANCE_NOT_DISCLOSED");
  });

  it("위반건축물이면 danger", () => {
    const r = crossCheck({
      facts: facts(),
      registry: registry(),
      lease: lease(),
      brokerage: brokerage({ isIllegalBuilding: true }),
    });
    expect(r.findings.find((f) => f.code === "DOC_ILLEGAL_BUILDING")?.severity).toBe("danger");
  });

  it("다가구인데 선순위 임차 내역이 없으면 danger", () => {
    const r = crossCheck({
      facts: facts({ isMultiHousehold: true }),
      registry: registry(),
      lease: lease(),
      brokerage: brokerage({ priorTenantInfoDisclosed: null }),
    });
    expect(r.findings.find((f) => f.code === "DOC_PRIOR_TENANT_NOT_DISCLOSED")?.severity).toBe("danger");
  });

  it("중개사 공제가 계약일 전에 만료되면 danger", () => {
    const r = crossCheck({
      facts: facts(),
      registry: registry(),
      lease: lease(),
      brokerage: brokerage({ guaranteeExpiresOn: "2026-09-01" }),
    });
    expect(r.findings.find((f) => f.code === "DOC_BROKER_GUARANTEE_EXPIRED")?.severity).toBe("danger");
  });

  it("중개사 등록번호 형식이 이상하면 caution", () => {
    const r = crossCheck({
      facts: facts(),
      registry: registry(),
      lease: lease(),
      brokerage: brokerage({ agentRegistrationNo: "1234" }),
    });
    expect(r.findings.find((f) => f.code === "DOC_BROKER_REG_NO_FORMAT")?.severity).toBe("caution");
  });

  it("특약이 하나도 없으면 안내한다", () => {
    const r = crossCheck({
      facts: facts(),
      registry: registry(),
      lease: lease({ specialTerms: [] }),
      brokerage: brokerage(),
    });
    expect(r.findings.map((f) => f.code)).toContain("DOC_NO_SPECIAL_TERMS");
  });
});
