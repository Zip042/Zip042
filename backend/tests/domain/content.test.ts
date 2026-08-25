import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHECKLIST_ITEMS,
  CHECKLIST_STAGES,
  buildChecklistTemplate,
  computeChecklistProgress,
  sanitizeCheckedIds,
} from "../../src/domain/checklist.js";
import {
  FRAUD_CASES,
  GLOSSARY_CATEGORIES,
  GLOSSARY_TERMS,
  RELIEF_STEPS,
  findTermsByFinding,
  searchGlossary,
} from "../../src/domain/glossary.js";

/**
 * 용어사전 · 체크리스트는 "콘텐츠"라서 테스트하지 않고 넘어가기 쉽다.
 * 그런데 이 둘은 **판정 결과와 같은 말을 해야** 의미가 있다. 그 연결이 조용히 끊기는 것이
 * 가장 흔한 실패이므로, 코드 참조 무결성을 테스트로 고정한다.
 */

/**
 * 규칙 엔진이 실제로 만들어 내는 finding 코드를 소스에서 수집한다.
 *
 * 하드코딩한 목록과 비교하면 그 목록 자체가 낡는다. 도메인 소스에서 `code: "..."` 를
 * 긁어오면 규칙이 바뀔 때 이 테스트도 같이 따라간다.
 */
function collectDomainCodes(): Set<string> {
  const dir = join(process.cwd(), "src", "domain");
  const codes = new Set<string>();
  for (const file of readdirSync(dir)) {
    // glossary 자신은 제외한다 — 자기 자신을 근거로 삼으면 검증이 되지 않는다.
    if (!file.endsWith(".ts") || file === "glossary.ts") continue;
    const source = readFileSync(join(dir, file), "utf8");
    for (const m of source.matchAll(/code:\s*"([A-Z][A-Z0-9_]{3,})"/g)) codes.add(m[1]!);
  }
  return codes;
}

describe("용어사전", () => {
  it("용어 코드가 중복되지 않는다", () => {
    const codes = GLOSSARY_TERMS.map((t) => t.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("모든 용어의 카테고리가 필터 목록 안에 있다", () => {
    for (const term of GLOSSARY_TERMS) {
      expect(GLOSSARY_CATEGORIES).toContain(term.category);
    }
  });

  it("relatedFindings 가 전부 실제 판정 코드다", () => {
    // 이 테스트가 깨지면 규칙 엔진의 코드가 바뀐 것이다.
    // 용어사전을 따라 고쳐야 결과 화면의 "이게 무슨 말이죠?" 링크가 살아 있다.
    const real = collectDomainCodes();
    const dangling: string[] = [];
    for (const term of GLOSSARY_TERMS) {
      for (const code of term.relatedFindings) {
        if (!real.has(code)) dangling.push(`${term.code} → ${code}`);
      }
    }
    expect(dangling).toEqual([]);
  });

  it("판정 코드로 용어를 찾을 수 있다", () => {
    const terms = findTermsByFinding("VAL_HIGH_BURDEN");
    expect(terms.map((t) => t.code)).toContain("G_JEONSE_RATIO");
    expect(findTermsByFinding("존재하지_않는_코드")).toEqual([]);
  });

  it("검색은 용어명 일치를 별칭·본문 일치보다 위에 둔다", () => {
    // "근저당" 은 `근저당권` 의 별칭이자 `채권최고액` 본문에도 나온다.
    const results = searchGlossary({ query: "근저당" });
    expect(results[0]?.code).toBe("G_MORTGAGE");
  });

  it("검색어의 공백을 무시한다", () => {
    expect(searchGlossary({ query: "채권 최고액" })[0]?.code).toBe("G_MAX_CLAIM");
    expect(searchGlossary({ query: "채권최고액" })[0]?.code).toBe("G_MAX_CLAIM");
  });

  it("카테고리로 거르면 그 카테고리만 남는다", () => {
    const results = searchGlossary({ category: "계약서" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((t) => t.category === "계약서")).toBe(true);
  });

  it("검색어가 없으면 전체를 돌려준다", () => {
    expect(searchGlossary().length).toBe(GLOSSARY_TERMS.length);
    expect(searchGlossary({ query: "" }).length).toBe(GLOSSARY_TERMS.length);
  });

  it("맞는 게 없으면 빈 배열이다", () => {
    expect(searchGlossary({ query: "존재하지않는용어xyz" })).toEqual([]);
  });

  it("사기 사례에는 신호와 예방책이 반드시 있다", () => {
    // 수법만 나열하면 겁만 주고 끝난다. 알아보는 법과 막는 법이 함께 있어야 한다.
    expect(FRAUD_CASES.length).toBeGreaterThan(0);
    for (const fraud of FRAUD_CASES) {
      expect(fraud.signals.length).toBeGreaterThan(0);
      expect(fraud.prevention.length).toBeGreaterThan(0);
    }
  });

  it("피해 대응 절차의 순서가 1부터 빠짐없이 이어진다", () => {
    // 순서를 틀리면 되돌릴 수 없는 단계(임차권등기 전 이사)가 있으므로 번호가 정확해야 한다.
    expect(RELIEF_STEPS.map((s) => s.order)).toEqual(
      Array.from({ length: RELIEF_STEPS.length }, (_, i) => i + 1),
    );
  });
});

describe("계약 체크리스트", () => {
  it("항목 id 가 중복되지 않는다", () => {
    // id 는 체크 상태의 저장 키다. 겹치면 한쪽을 체크할 때 다른 쪽도 체크된다.
    const ids = CHECKLIST_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("모든 항목이 정의된 단계에 속한다", () => {
    const stages = new Set(CHECKLIST_STAGES.map((s) => s.code));
    for (const item of CHECKLIST_ITEMS) expect(stages.has(item.stage)).toBe(true);
  });

  it("빈 단계가 없다", () => {
    // 단계 네비를 눌렀는데 아무것도 없으면 화면이 깨진 것처럼 보인다.
    for (const stage of buildChecklistTemplate()) {
      expect(stage.items.length).toBeGreaterThan(0);
    }
  });

  it("relatedTerms 가 전부 실제 용어 코드다", () => {
    const known = new Set(GLOSSARY_TERMS.map((t) => t.code));
    const dangling: string[] = [];
    for (const item of CHECKLIST_ITEMS) {
      for (const code of item.relatedTerms) {
        if (!known.has(code)) dangling.push(`${item.id} → ${code}`);
      }
    }
    expect(dangling).toEqual([]);
  });

  it("템플릿이 모든 항목을 빠짐없이 담는다", () => {
    const flattened = buildChecklistTemplate().flatMap((s) => s.items);
    expect(flattened.length).toBe(CHECKLIST_ITEMS.length);
  });

  it("진행률: 아무것도 체크하지 않으면 0", () => {
    const p = computeChecklistProgress([]);
    expect(p.done).toBe(0);
    expect(p.requiredDone).toBe(0);
    expect(p.total).toBe(CHECKLIST_ITEMS.length);
    expect(p.missingRequired.length).toBe(p.requiredTotal);
  });

  it("진행률: 전부 체크하면 100%이고 남은 필수가 없다", () => {
    const p = computeChecklistProgress(CHECKLIST_ITEMS.map((i) => i.id));
    expect(p.done).toBe(p.total);
    expect(p.requiredDone).toBe(p.requiredTotal);
    expect(p.missingRequired).toEqual([]);
  });

  it("진행률: 필수를 따로 센다", () => {
    // 선택 항목만 다 체크해도 필수 진행률은 0이어야 한다.
    const optionalIds = CHECKLIST_ITEMS.filter((i) => !i.required).map((i) => i.id);
    const p = computeChecklistProgress(optionalIds);
    expect(p.done).toBe(optionalIds.length);
    expect(p.requiredDone).toBe(0);
  });

  it("알 수 없는 id 는 진행률을 부풀리지 않는다", () => {
    // 항목이 지워진 뒤에도 옛 체크가 남아 있을 수 있다. 100% 를 넘으면 안 된다.
    const p = computeChecklistProgress([...CHECKLIST_ITEMS.map((i) => i.id), "지워진_항목", "또다른_옛항목"]);
    expect(p.done).toBe(p.total);
  });

  it("단계별 합이 전체와 같다", () => {
    const p = computeChecklistProgress(CHECKLIST_ITEMS.map((i) => i.id));
    expect(p.byStage.reduce((sum, s) => sum + s.total, 0)).toBe(p.total);
    expect(p.byStage.reduce((sum, s) => sum + s.done, 0)).toBe(p.done);
  });

  it("sanitize 가 알 수 없는 id 와 중복을 걸러낸다", () => {
    const first = CHECKLIST_ITEMS[0]!.id;
    expect(sanitizeCheckedIds([first, first, "없는항목"])).toEqual([first]);
  });

  it("sanitize 결과는 정렬되어 있다", () => {
    // 저장 값이 매번 다른 순서면 불필요한 갱신과 diff 가 생긴다.
    const ids = CHECKLIST_ITEMS.map((i) => i.id);
    const sanitized = sanitizeCheckedIds([...ids].reverse());
    expect(sanitized).toEqual([...sanitized].sort());
  });

  it("필수 항목이 각 단계에 최소 하나는 있다", () => {
    // 어느 단계든 "이것만은 반드시" 가 있어야 사용자가 우선순위를 판단할 수 있다.
    for (const stage of buildChecklistTemplate()) {
      expect(stage.items.some((i) => i.required)).toBe(true);
    }
  });
});
