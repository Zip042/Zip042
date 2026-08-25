import { describe, expect, it } from "vitest";
import {
  extractCancelledRankNumbers,
  isCancellationEntry,
  separateCancelledRights,
} from "../../src/domain/registry-cancellation.js";
import { evaluateRegistry } from "../../src/domain/registry-risk.js";
import type { RegistryExtraction, RegistryRight } from "../../src/domain/types.js";

/**
 * 말소 걸러내기는 구현 가이드가 "제일 위험한 지점"이라고 못박은 부분이다.
 *
 * 못 걸러내면 **이미 갚은 빚을 살아 있는 것으로 계산**해 멀쩡한 집이 위험으로 뜨고,
 * 반대로 과하게 걸러내면 진짜 빚을 놓친다. 어느 쪽이든 판정이 통째로 뒤집힌다.
 */

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
    note: "근저당권설정",
    sourceQuote: "근저당권설정 채권최고액 금100,000,000원",
    ...overrides,
  };
}

describe("말소 대상 순위번호 추출", () => {
  it("붙여 쓴 형태를 읽는다", () => {
    expect(extractCancelledRankNumbers("3번근저당권설정등기말소")).toEqual(["3"]);
  });

  it("띄어 쓴 형태를 읽는다", () => {
    expect(extractCancelledRankNumbers("3번 근저당권설정 등기말소")).toEqual(["3"]);
  });

  it("여러 건을 한 번에 말소한 경우 전부 읽는다", () => {
    expect(extractCancelledRankNumbers("2번, 3번 근저당권설정등기말소").sort()).toEqual(["2", "3"]);
  });

  it("부기등기(3-1번)를 읽는다", () => {
    expect(extractCancelledRankNumbers("3-1번 가압류등기말소")).toEqual(["3-1"]);
  });

  it("'말소' 가 없으면 순위번호를 수집하지 않는다", () => {
    // "3번 근저당권을 4번으로 이전" 같은 문장에서 오작동하면 살아 있는 빚이 사라진다.
    expect(extractCancelledRankNumbers("3번 근저당권이전")).toEqual([]);
    expect(extractCancelledRankNumbers("소유권이전")).toEqual([]);
  });

  it("빈 값을 안전하게 처리한다", () => {
    expect(extractCancelledRankNumbers(null)).toEqual([]);
    expect(extractCancelledRankNumbers(undefined)).toEqual([]);
    expect(extractCancelledRankNumbers("")).toEqual([]);
  });

  it("말소 등기 자체를 알아본다", () => {
    expect(isCancellationEntry(right({ note: "3번근저당권설정등기말소" }))).toBe(true);
    expect(isCancellationEntry(right({ note: "근저당권설정" }))).toBe(false);
  });
});

describe("살아 있는 권리 가려내기", () => {
  it("AI 가 놓쳐도 말소 등기 문구를 보고 걸러낸다 ← 이중 방어의 핵심", () => {
    // 취소선은 글자가 아니라서 판독이 놓칠 수 있다. 그래도 "3번…말소" 는 글자로 남는다.
    const result = separateCancelledRights([
      right({ rankNo: "3", isCancelled: false, maxClaimKrw: 300_000_000 }),
      right({ rankNo: "5", note: "3번근저당권설정등기말소", type: "other", maxClaimKrw: null }),
    ]);

    expect(result.active).toHaveLength(0);
    expect(result.rescuedByCode).toEqual(["3"]);
    expect(result.includesCancelledEntries).toBe(true);
  });

  it("AI 가 말소로 표시한 것도 걸러낸다", () => {
    const result = separateCancelledRights([right({ rankNo: "2", isCancelled: true })]);
    expect(result.active).toHaveLength(0);
    // AI 가 이미 잡았으므로 코드가 '구조'한 것은 아니다.
    expect(result.rescuedByCode).toEqual([]);
    expect(result.includesCancelledEntries).toBe(true);
  });

  it("말소되지 않은 권리는 그대로 남긴다", () => {
    const result = separateCancelledRights([
      right({ rankNo: "1", maxClaimKrw: 100_000_000 }),
      right({ rankNo: "2", maxClaimKrw: 50_000_000 }),
    ]);
    expect(result.active).toHaveLength(2);
    expect(result.includesCancelledEntries).toBe(false);
    expect(result.rescuedByCode).toEqual([]);
  });

  it("다른 순위번호의 말소는 건드리지 않는다", () => {
    // 3번을 말소했다고 1번까지 지우면 진짜 빚을 놓친다.
    const result = separateCancelledRights([
      right({ rankNo: "1", maxClaimKrw: 100_000_000 }),
      right({ rankNo: "3", maxClaimKrw: 300_000_000 }),
      right({ rankNo: "9", note: "3번근저당권설정등기말소", type: "other" }),
    ]);
    expect(result.active.map((r) => r.rankNo)).toEqual(["1"]);
  });

  it("말소 등기 자체는 권리로 세지 않는다", () => {
    const result = separateCancelledRights([
      right({ rankNo: "4", note: "2번가압류등기말소", type: "other" }),
    ]);
    expect(result.active).toHaveLength(0);
  });
});

describe("판정에 실제로 반영된다", () => {
  function registry(rights: RegistryRight[]): RegistryExtraction {
    return {
      address: "대전광역시 서구 둔산로 100",
      ownerNames: ["김소유"],
      ownershipAcquiredOn: "2020-05-01",
      issuedOn: TODAY,
      isTrustProperty: false,
      isSectionedBuilding: true,
      rights: [
        { ...right({ section: "gap", rankNo: "1", type: "ownership_transfer", maxClaimKrw: null, note: "소유권이전" }) },
        ...rights,
      ],
      unreadableSections: [],
    };
  }

  const evalWith = (rights: RegistryRight[]) =>
    evaluateRegistry({ registry: registry(rights), myDepositKrw: 90_000_000, today: TODAY });

  it("말소된 근저당은 선순위 채권에 더해지지 않는다", () => {
    // 이게 틀리면 이미 갚은 3억이 빚으로 잡혀 멀쩡한 집이 위험으로 뜬다.
    const withCancelled = evalWith([
      right({ rankNo: "3", maxClaimKrw: 300_000_000 }),
      right({ rankNo: "7", note: "3번근저당권설정등기말소", type: "other", maxClaimKrw: null }),
    ]);
    expect(withCancelled.seniorMortgageKrw).toBe(0);

    // 대조군 — 말소 등기가 없으면 그대로 잡혀야 한다.
    const alive = evalWith([right({ rankNo: "3", maxClaimKrw: 300_000_000 })]);
    expect(alive.seniorMortgageKrw).toBe(300_000_000);
  });

  it("말소사항이 포함된 등기부라는 사실을 사용자에게 알린다", () => {
    const r = evalWith([
      right({ rankNo: "3", maxClaimKrw: 300_000_000 }),
      right({ rankNo: "7", note: "3번근저당권설정등기말소", type: "other", maxClaimKrw: null }),
    ]);
    const notice = r.findings.find((f) => f.code === "RIGHTS_INCLUDES_CANCELLED");
    expect(notice).toBeDefined();
    // 이미 정리된 권리이므로 위험 점수에 더해지면 안 된다.
    expect(notice?.kind).toBe("info_gap");
    expect(notice?.weight).toBe(0);
    expect(notice?.action).toContain("현재 유효사항만");
  });

  it("깨끗한 등기부에는 말소 안내가 붙지 않는다", () => {
    const r = evalWith([right({ rankNo: "1", maxClaimKrw: 50_000_000 })]);
    expect(r.findings.find((f) => f.code === "RIGHTS_INCLUDES_CANCELLED")).toBeUndefined();
  });
});
