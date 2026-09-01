import { describe, expect, it } from "vitest";
import { evaluateRegistry } from "../../src/domain/registry-risk.js";
import type { RegistryExtraction, RegistryRight } from "../../src/domain/types.js";

const TODAY = "2026-08-20";

function right(overrides: Partial<RegistryRight> = {}): RegistryRight {
  return {
    section: "eul",
    rankNo: "1",
    type: "mortgage",
    holder: "○○은행",
    maxClaimKrw: 100_000_000,
    registeredOn: "2024-03-01",
    isCancelled: false,
    ...overrides,
  };
}

function registry(overrides: Partial<RegistryExtraction> = {}): RegistryExtraction {
  return {
    address: "대전광역시 서구 둔산로 100",
    ownerNames: ["김소유"],
    ownershipAcquiredOn: "2020-05-01",
    issuedOn: TODAY,
    isTrustProperty: false,
    isSectionedBuilding: true,
    rights: [],
    unreadableSections: [],
    ...overrides,
  };
}

const evalWith = (r: Partial<RegistryExtraction>, extra: Record<string, unknown> = {}) =>
  evaluateRegistry({
    registry: registry(r),
    myDepositKrw: 100_000_000,
    today: TODAY,
    ...extra,
  });

describe("치명적 위험 신호", () => {
  it("신탁등기는 critical", () => {
    const r = evalWith({ isTrustProperty: true });
    const f = r.findings.find((x) => x.code === "RIGHTS_TRUST_REGISTERED");
    expect(f?.severity).toBe("critical");
    expect(r.level).toBe("critical");
  });

  it("경매개시결정은 critical", () => {
    const r = evalWith({ rights: [right({ section: "gap", type: "auction", maxClaimKrw: null })] });
    expect(r.findings.map((f) => f.code)).toContain("RIGHTS_AUCTION_STARTED");
  });

  it("압류는 critical, 가압류는 danger", () => {
    const seized = evalWith({ rights: [right({ type: "attachment" })] });
    expect(seized.findings.find((f) => f.code === "RIGHTS_ATTACHMENT")?.severity).toBe("critical");

    const provisional = evalWith({ rights: [right({ type: "provisional_attachment" })] });
    expect(
      provisional.findings.find((f) => f.code === "RIGHTS_PROVISIONAL_ATTACHMENT")?.severity,
    ).toBe("danger");
  });

  it("임차권등기명령은 앞선 세입자 피해 이력이므로 critical", () => {
    const r = evalWith({ rights: [right({ type: "lease_registration" })] });
    expect(
      r.findings.find((f) => f.code === "RIGHTS_PRIOR_LEASE_REGISTRATION")?.severity,
    ).toBe("critical");
  });

  it("계약서 임대인이 등기부 소유자와 다르면 critical", () => {
    const r = evalWith({}, { contractLessorName: "박대리" });
    const f = r.findings.find((x) => x.code === "RIGHTS_OWNER_NAME_MISMATCH");
    expect(f?.severity).toBe("critical");
  });

  it("이름 비교는 공백을 무시한다", () => {
    const r = evalWith({ ownerNames: ["김 소유"] }, { contractLessorName: "김소유" });
    expect(r.findings.map((f) => f.code)).not.toContain("RIGHTS_OWNER_NAME_MISMATCH");
  });
});

describe("근저당 집계", () => {
  it("말소되지 않은 근저당의 채권최고액만 합산한다", () => {
    const r = evalWith({
      rights: [
        right({ maxClaimKrw: 100_000_000 }),
        right({ rankNo: "2", maxClaimKrw: 50_000_000 }),
        right({ rankNo: "3", maxClaimKrw: 999_000_000, isCancelled: true }),
      ],
    });
    expect(r.seniorMortgageKrw).toBe(150_000_000);
    expect(r.cancelledCount).toBe(1);
  });

  it("근저당 3건 이상이면 다중 담보 경고", () => {
    const r = evalWith({
      rights: [right({ rankNo: "1" }), right({ rankNo: "2" }), right({ rankNo: "3" })],
    });
    expect(r.findings.map((f) => f.code)).toContain("RIGHTS_MANY_MORTGAGES");
  });

  it("금액을 읽지 못한 권리는 개수로 보고하고 경고한다", () => {
    const r = evalWith({ rights: [right({ maxClaimKrw: null })] });
    expect(r.unpricedRightsCount).toBe(1);
    expect(r.findings.map((f) => f.code)).toContain("RIGHTS_AMOUNT_UNREADABLE");
  });

  it("전세권·가압류 금액은 근저당과 분리해 집계한다", () => {
    const r = evalWith({
      rights: [
        right({ type: "mortgage", maxClaimKrw: 100_000_000 }),
        right({ type: "jeonse_right", maxClaimKrw: 30_000_000 }),
        right({ type: "provisional_attachment", maxClaimKrw: 20_000_000 }),
      ],
    });
    expect(r.seniorMortgageKrw).toBe(100_000_000);
    expect(r.otherSeniorClaimsKrw).toBe(50_000_000);
  });
});

describe("소유자 · 문서 상태", () => {
  it("최근 6개월 내 소유권 취득은 갭투자 의심 신호", () => {
    const r = evalWith({ ownershipAcquiredOn: "2026-06-01" });
    const f = r.findings.find((x) => x.code === "RIGHTS_RECENT_OWNERSHIP");
    expect(f?.severity).toBe("danger");
    expect(f?.evidence).toMatchObject({ heldDays: 80 });
  });

  it("6개월이 지난 소유권은 경고하지 않는다", () => {
    const r = evalWith({ ownershipAcquiredOn: "2025-01-01" });
    expect(r.findings.map((f) => f.code)).not.toContain("RIGHTS_RECENT_OWNERSHIP");
  });

  it("공동소유는 전원 동의 안내", () => {
    const r = evalWith({ ownerNames: ["김소유", "이공유"] });
    expect(r.findings.map((f) => f.code)).toContain("RIGHTS_MULTIPLE_OWNERS");
  });

  it("등기부가 오래되면 재발급을 요구한다", () => {
    const r = evalWith({ issuedOn: "2026-08-01" });
    const f = r.findings.find((x) => x.code === "RIGHTS_STALE_REGISTRY");
    expect(f?.severity).toBe("caution");

    const veryOld = evalWith({ issuedOn: "2026-01-01" });
    expect(veryOld.findings.find((x) => x.code === "RIGHTS_STALE_REGISTRY")?.severity).toBe("danger");
  });

  it("집합건물이 아니면(다가구) 선순위 보증금 확인을 안내한다", () => {
    const r = evalWith({ isSectionedBuilding: false });
    expect(r.findings.map((f) => f.code)).toContain("RIGHTS_NOT_SECTIONED_BUILDING");
  });
});

describe("깨끗한 등기부", () => {
  it("활성 권리가 없으면 safe finding 을 낸다", () => {
    const r = evalWith({});
    expect(r.level).toBe("safe");
    const clean = r.findings.find((f) => f.code === "RIGHTS_CLEAN");
    expect(clean?.severity).toBe("safe");
    expect(clean?.suggestTerms).toContain("TERM_NO_NEW_ENCUMBRANCE");
  });

  it("말소된 권리만 있어도 깨끗한 것으로 본다", () => {
    const r = evalWith({ rights: [right({ isCancelled: true })] });
    expect(r.level).toBe("safe");
    expect(r.seniorMortgageKrw).toBe(0);
  });
});
