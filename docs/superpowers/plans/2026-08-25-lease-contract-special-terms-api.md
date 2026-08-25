# 임대차 계약서 초안 · 특약 조건 API 연동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 집톡_필요API_요약 3번(임대차 계약서 초안)·4번(특약 조건 추가) 구성 중 아직 없는 기능 — 법제처 API 연동, 특약 법조문 인용, 계약서 초안 조립, 국세청 사업자등록 진위확인 — 을 백엔드에 구현한다.

**Architecture:** `market-price.service.ts`가 세운 기존 패턴(live/mock 이중 모드, 실패 시 `unavailable` 반환, `.env` 키 주입)을 그대로 따른다. 결정론적 조립 로직은 `domain/*.ts`(순수 함수, 단위 테스트)에, 외부 I/O는 `services/*.ts`(mock/live 분기)에 둔다. law.go.kr 실 API 파라미터는 2026-08-25 실제 호출로 검증했다 — 상세는 [설계 스펙](../specs/2026-08-25-lease-contract-special-terms-api-design.md) 참고.

**Tech Stack:** TypeScript, Hono, Zod, Vitest, Supabase(Postgres). 신규 외부 의존 없음(둘 다 `fetch` 기반 REST 호출).

## Global Constraints

- Claude API를 계약서 필드 자동 채움이나 특약 문구 생성에 **다시 호출하지 않는다** — 이미 추출된 데이터를 결정론적으로 매핑한다 (CLAUDE.md 원칙 1: "AI는 판독만, 판정은 규칙엔진이").
- 모든 신규 외부 API 호출은 실패 시 예외를 던지지 않고 `source: "unavailable"`(또는 `"not_applicable"`)을 반환해 상위 로직을 막지 않는다 (CLAUDE.md 원칙 2).
- 판례(prec) 자동 인용은 구현하지 않는다 — 변호사법 리스크.
- 정부 표준계약서 PDF의 필드를 프로그램으로 채워 넣지 않는다 — 구조화 JSON + 원본 서식 링크로 대체한다.
- 모든 신규 코드는 `npm run typecheck`와 `npm test`를 통과해야 하고, OpenAPI 변경은 `npm run openapi` 재생성 결과가 커밋된 `openapi.json`과 일치해야 한다.

---

## Task 1: 법제처 조문 참조 상수 (`domain/law-references.ts`)

law.go.kr 오픈API가 쓰는 조번호(JO) 인코딩과, 우리가 인용하는 법령의 고정 식별자(MST/ID)를 모아두는 순수 모듈. 2026-08-25에 `OC=test`로 실제 호출해 확인한 값이다.

**Files:**
- Create: `backend/src/domain/law-references.ts`
- Test: `backend/tests/domain/law-references.test.ts`

**Interfaces:**
- Produces: `LAW_REGISTRY: Record<"주택임대차보호법" | "주민등록법", { mst: string; id: string }>`, `type LawKey`, `encodeJo(article: number, branch?: number): string` — Task 2·3·6이 이 세 가지를 그대로 가져다 쓴다.

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/domain/law-references.test.ts
import { describe, expect, it } from "vitest";
import { encodeJo, LAW_REGISTRY } from "../../src/domain/law-references.js";

describe("encodeJo", () => {
  it("조 번호만 있으면 가지번호를 00으로 채운다", () => {
    expect(encodeJo(3)).toBe("000300");
  });

  it("가지번호가 있으면 뒤 2자리에 넣는다", () => {
    expect(encodeJo(3, 2)).toBe("000302");
  });

  it("주민등록법 제11조를 인코딩한다", () => {
    expect(encodeJo(11)).toBe("001100");
  });

  it("조 번호가 0 이하면 에러", () => {
    expect(() => encodeJo(0)).toThrow();
  });

  it("조 번호가 9999를 넘으면 에러", () => {
    expect(() => encodeJo(10_000)).toThrow();
  });

  it("가지번호가 100 이상이면 에러", () => {
    expect(() => encodeJo(3, 100)).toThrow();
  });

  it("가지번호가 음수면 에러", () => {
    expect(() => encodeJo(3, -1)).toThrow();
  });
});

describe("LAW_REGISTRY", () => {
  it("주택임대차보호법 MST/ID를 갖고 있다", () => {
    expect(LAW_REGISTRY.주택임대차보호법).toEqual({ mst: "276291", id: "001248" });
  });

  it("주민등록법 MST/ID를 갖고 있다", () => {
    expect(LAW_REGISTRY.주민등록법).toEqual({ mst: "268555", id: "001655" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/domain/law-references.test.ts`
Expected: FAIL — `Cannot find module '../../src/domain/law-references.js'`

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/domain/law-references.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/domain/law-references.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/domain/law-references.ts backend/tests/domain/law-references.test.ts
git commit -m "feat: 법제처 조문 참조 상수(MST/JO 인코딩) 추가"
```

---

## Task 2: 법제처 어댑터 (`services/lawinfo.service.ts`)

law.go.kr 오픈API를 호출해 조문 원문과 표준계약서 서식 링크를 가져온다. `market-price.service.ts`와 동일한 live/mock 분기, 실패 시 `unavailable` 폴백 패턴을 따른다.

**Files:**
- Modify: `backend/.env.example` (LAW_GO_KR_OC 추가)
- Modify: `backend/src/env.ts` (EnvSchema에 LAW_GO_KR_OC 추가)
- Modify: `backend/src/domain/types.ts` (LawArticleResult, StandardLeaseFormResult 타입 추가)
- Create: `backend/src/mock/lawinfo.ts`
- Create: `backend/src/services/lawinfo.service.ts`
- Test: `backend/tests/services/lawinfo.test.ts`

**Interfaces:**
- Consumes: `LAW_REGISTRY`, `LawKey`, `encodeJo` from `../domain/law-references.js` (Task 1)
- Produces: `isLawInfoAvailable(): boolean`, `fetchLawArticle(lawKey: LawKey, jo: string): Promise<LawArticleResult>`, `fetchStandardLeaseForm(): Promise<StandardLeaseFormResult>` — Task 3·7이 이 세 함수를 가져다 쓴다.

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/services/lawinfo.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCache } from "../../src/env.js";
import {
  fetchLawArticle,
  fetchStandardLeaseForm,
  isLawInfoAvailable,
} from "../../src/services/lawinfo.service.js";

describe("lawinfo.service", () => {
  beforeEach(() => {
    process.env.ZIP042_MODE = "mock";
    delete process.env.LAW_GO_KR_OC;
    resetEnvCache();
  });

  afterEach(() => {
    delete process.env.ZIP042_MODE;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    resetEnvCache();
  });

  it("목 모드에서는 항상 사용 가능하다고 보고한다", () => {
    expect(isLawInfoAvailable()).toBe(true);
  });

  it("목 모드에서 조문 원문을 돌려준다", async () => {
    const result = await fetchLawArticle("주택임대차보호법", "000300");
    expect(result.source).toBe("law_go_kr");
    expect(result.text).toContain("그 다음 날부터 제삼자에 대하여 효력이 생긴다");
  });

  it("목 모드에서 표준계약서 서식 링크를 돌려준다", async () => {
    const result = await fetchStandardLeaseForm();
    expect(result.source).toBe("law_go_kr");
    expect(result.pdfUrl).not.toBeNull();
  });

  it("live 모드인데 OC 키가 없으면 unavailable을 반환한다", async () => {
    process.env.ZIP042_MODE = "live";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "a".repeat(20);
    process.env.SUPABASE_SERVICE_ROLE_KEY = "b".repeat(20);
    resetEnvCache();

    const result = await fetchLawArticle("주택임대차보호법", "000300");
    expect(result.source).toBe("unavailable");
    expect(result.text).toBeNull();
    expect(result.url).toContain("law.go.kr");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/services/lawinfo.test.ts`
Expected: FAIL — `Cannot find module '../../src/services/lawinfo.service.js'`

- [ ] **Step 3: Write minimal implementation**

`.env.example`에 다음 블록을 `# --- 공공데이터포털` 섹션 뒤에 추가한다:

```bash
# --- 법제처 국가법령정보 공동활용 (계약서 초안 · 특약 법조문 인용) --------
# https://open.law.go.kr — 이메일 인증으로 OC 키 발급
LAW_GO_KR_OC=
```

`env.ts`의 `EnvSchema`에 `DATA_GO_KR_BASE_URL` 다음 줄로 추가:

```ts
    // 법제처 국가법령정보 공동활용 (계약서 초안 · 특약 법조문 인용)
    LAW_GO_KR_OC: z.string().optional(),
```

`domain/types.ts`에 (파일 끝에) 추가:

```ts
export interface LawArticleResult {
  source: "law_go_kr" | "unavailable";
  text: string | null;
  url: string;
}

export interface StandardLeaseFormResult {
  source: "law_go_kr" | "unavailable";
  pdfUrl: string | null;
  fallbackUrl: string;
}
```

```ts
// backend/src/mock/lawinfo.ts
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
```

```ts
// backend/src/services/lawinfo.service.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/services/lawinfo.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/.env.example backend/src/env.ts backend/src/domain/types.ts \
  backend/src/mock/lawinfo.ts backend/src/services/lawinfo.service.ts \
  backend/tests/services/lawinfo.test.ts
git commit -m "feat: 법제처 law.go.kr 어댑터 추가 (조문 원문 · 표준계약서 서식)"
```

---

## Task 3: 특약별 법조문 인용 (`domain/special-terms.ts`, `routes/terms.ts`)

특약 정의에 정적 법조문 인용(`legalBasis`)을 추가하고, `/special-terms/compose` 응답에 그 조문의 실시간 원문을 붙인다.

**중요한 설계 결정:** `special_terms` DB 테이블에는 `legal_basis` 컬럼이 없다(추가하지 않는다). 법조문 인용은 코드에만 존재하는 정적 값이므로, `getLatestAnalysis()`로 DB에서 복원한 `RecommendedTerm`에는 이 정보가 없다. 그래서 `legalBasisFor(code)` 헬퍼로 **항상 코드를 통해 라이브러리를 다시 조회**한다 — `RecommendedTerm` 객체 자체에 `legalBasis`를 실어 나르지 않는다.

**Files:**
- Modify: `backend/src/domain/special-terms.ts`
- Modify: `backend/src/routes/terms.ts`
- Test: `backend/tests/domain/special-terms.test.ts`

**Interfaces:**
- Consumes: `encodeJo`, `LawKey` from `../domain/law-references.js` (Task 1), `fetchLawArticle` from `../services/lawinfo.service.js` (Task 2)
- Produces: `SpecialTermDefinition.legalBasis?: { law: LawKey; jo: string; label: string }[]`, `legalBasisFor(code: string): { law: LawKey; jo: string; label: string }[]` — Task 7이 `legalBasisFor`를 가져다 쓴다.

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/domain/special-terms.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/domain/special-terms.test.ts`
Expected: FAIL — `SPECIAL_TERM_LIBRARY.TERM_NO_NEW_ENCUMBRANCE!.legalBasis` is `undefined`, and `legalBasisFor` is not exported.

- [ ] **Step 3: Write minimal implementation**

`domain/special-terms.ts` 상단 import에 추가:

```ts
import { encodeJo, type LawKey } from "./law-references.js";
```

`SpecialTermDefinition` 인터페이스에 필드 추가 (`baseline?: boolean;` 다음 줄):

```ts
  /** 이 특약의 법적 근거 조문 (정적 인용). 원문은 lawinfo.service가 실시간으로 붙인다. */
  legalBasis?: { law: LawKey; jo: string; label: string }[];
```

`TERM_NO_NEW_ENCUMBRANCE` 정의에 `baseline: true,` 다음 줄로 추가:

```ts
    legalBasis: [{ law: "주택임대차보호법", jo: encodeJo(3), label: "제3조" }],
```

`TERM_ADDRESS_EXACT` 정의에 `required: true,` 다음 줄로 추가:

```ts
    legalBasis: [
      { law: "주택임대차보호법", jo: encodeJo(3), label: "제3조" },
      { law: "주택임대차보호법", jo: encodeJo(3, 2), label: "제3조의2" },
    ],
```

파일 맨 끝(`collectTermTriggers` 함수 뒤)에 헬퍼 추가:

```ts
/**
 * 코드로 특약의 정적 법조문 인용을 찾는다.
 *
 * `special_terms` 테이블에는 이 값을 저장하지 않는다 — 법 인용은 배포 시점에만 바뀌는
 * 정적 값이라 DB에 실어 나를 이유가 없다. `RecommendedTerm`이 DB에서 복원됐든 방금
 * 계산됐든, 항상 코드로 라이브러리를 다시 조회하면 안전하다.
 */
export function legalBasisFor(code: string): NonNullable<SpecialTermDefinition["legalBasis"]> {
  return SPECIAL_TERM_LIBRARY[code]?.legalBasis ?? [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/domain/special-terms.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/domain/special-terms.ts backend/tests/domain/special-terms.test.ts
git commit -m "feat: 특약에 정적 법조문 인용(legalBasis) 추가"
```

- [ ] **Step 6: `/special-terms/catalog`와 `/special-terms/compose`에 인용 노출**

`routes/terms.ts` 상단 import에 추가:

```ts
import { fetchLawArticle } from "../services/lawinfo.service.js";
```

`termsCatalogRoute.get("/special-terms/catalog", ...)` 안의 `.map((def) => ({...}))` 객체에 필드 추가 (`clauseTemplate: def.clause(ctx),` 다음 줄):

```ts
      legalBasis: def.legalBasis ?? [],
```

`compose` 핸들러에서 `const unknown = ...` 다음, `const text = ...` 앞에 추가:

```ts
    const legalBasis = await Promise.all(
      selected
        .filter((def) => (def.legalBasis?.length ?? 0) > 0)
        .map(async (def) => ({
          code: def.code,
          citations: await Promise.all(
            def.legalBasis!.map(async (ref) => {
              const article = await fetchLawArticle(ref.law, ref.jo);
              return {
                law: ref.law,
                label: ref.label,
                text: article.text,
                source: article.source,
                url: article.url,
              };
            }),
          ),
        })),
    );
```

`return c.json({...})` 안에 `unknownCodes: unknown,` 다음 줄로 추가:

```ts
      legalBasis,
```

- [ ] **Step 7: mock-flow 종단 테스트에 검증 추가**

`backend/tests/http/mock-flow.test.ts` 파일 끝의 `interface AnalysisShape` 선언 바로 위에 새 describe 블록 추가:

```ts
describe("특약 법조문 인용 (compose)", () => {
  it("compose 응답에 법조문 원문이 붙는다", async () => {
    const created = await app.request("/v1/cases", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        title: "법조문 인용 확인",
        leaseType: "jeonse",
        amountUnit: "man",
        deposit: 9000,
      }),
    });
    const caseId = (await json<{ case: { id: string } }>(created)).case.id;

    const res = await app.request(`/v1/cases/${caseId}/special-terms/compose`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ codes: ["TERM_NO_NEW_ENCUMBRANCE"] }),
    });
    expect(res.status).toBe(200);

    const body = await json<{
      legalBasis: {
        code: string;
        citations: { law: string; label: string; text: string | null; source: string }[];
      }[];
    }>(res);
    const entry = body.legalBasis.find((b) => b.code === "TERM_NO_NEW_ENCUMBRANCE");
    expect(entry?.citations[0]?.label).toBe("제3조");
    expect(entry?.citations[0]?.source).toBe("law_go_kr");
    expect(entry?.citations[0]?.text).toContain("다음 날");
  });
});
```

Run: `cd backend && npx vitest run tests/http/mock-flow.test.ts`
Expected: PASS (전체 스위트, 새 테스트 포함)

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/terms.ts backend/tests/http/mock-flow.test.ts
git commit -m "feat: compose 응답에 특약 법조문 원문 인용 추가"
```

---

## Task 4: 사업자등록번호 케이스 필드

임대인이 법인일 때 국세청 진위확인에 쓸 사업자등록번호를 사용자가 직접 입력하는 필드로 추가한다. 등기부에는 법인등록번호만 나오고 사업자등록번호는 별개 체계라 문서에서 자동 추출되지 않는다.

**Files:**
- Create: `backend/supabase/migrations/20260825000300_case_business_registration_number.sql`
- Modify: `backend/src/schemas/case.ts`
- Modify: `backend/src/services/case.service.ts`
- Modify: `backend/src/mock/store.ts`
- Test: `backend/tests/http/mock-flow.test.ts` (확장)

**Interfaces:**
- Produces: `CaseRow.business_registration_number: string | null`, `serializeCase(row).lessor.businessRegistrationNumber: string | null` — Task 7의 `contract-draft.service.ts`가 `row.business_registration_number`를 읽는다.

- [ ] **Step 1: Write the failing test**

`backend/tests/http/mock-flow.test.ts`의 "검사 건 생성 → 문서 등록 → 분석 (전체 파이프라인)" describe 블록 안, 첫 `it("검사 건을 만들 수 있다 ...")` 다음에 추가:

```ts
  it("사업자등록번호 형식이 틀리면 400", async () => {
    const res = await app.request("/v1/cases", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        title: "형식 오류",
        leaseType: "jeonse",
        amountUnit: "man",
        deposit: 9000,
        businessRegistrationNumber: "12345",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("사업자등록번호를 저장하고 그대로 돌려받는다", async () => {
    const res = await app.request("/v1/cases", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        title: "법인 임대인",
        leaseType: "jeonse",
        amountUnit: "man",
        deposit: 9000,
        businessRegistrationNumber: "123-45-67890",
      }),
    });
    expect(res.status).toBe(201);
    const body = await json<{ case: { lessor: { businessRegistrationNumber: string | null } } }>(
      res,
    );
    expect(body.case.lessor.businessRegistrationNumber).toBe("123-45-67890");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/http/mock-flow.test.ts -t "사업자등록번호"`
Expected: FAIL — 첫 테스트는 지금 400 대신 (알 수 없는 필드라) 201이 나오고, 둘째 테스트는 `body.case.lessor`가 `undefined`.

- [ ] **Step 3: Write minimal implementation**

```sql
-- backend/supabase/migrations/20260825000300_case_business_registration_number.sql
-- ZIP 042 · cases 에 사업자등록번호 컬럼 추가
--
-- 법인 임대인의 국세청 사업자등록정보 진위확인(business-registration.service.ts)에 쓰인다.
-- 등기부에는 법인등록번호만 나오고 사업자등록번호는 별개 번호 체계라 문서에서 자동으로
-- 추출되지 않는다 — 사용자가 화면에서 직접 입력한다.

alter table cases
  add column business_registration_number text
    check (business_registration_number is null or business_registration_number ~ '^\d{3}-\d{2}-\d{5}$');

comment on column cases.business_registration_number is
  '000-00-00000 형식. 법인 임대인일 때만 사용자가 입력. 국세청 진위확인 API 입력값.';
```

`schemas/case.ts`에서 `const moneyFields = {...}` 앞에 새 그룹 추가:

```ts
const lessorFields = {
  /** 000-00-00000 형식. 법인 임대인일 때만 입력. 국세청 진위확인 API에 쓰인다. */
  businessRegistrationNumber: z
    .string()
    .trim()
    .regex(/^\d{3}-\d{2}-\d{5}$/, "사업자등록번호는 000-00-00000 형식입니다.")
    .nullish(),
};
```

`createCaseSchema`의 `z.object({...})` 안, `...moneyFields,` 다음 줄에 추가:

```ts
    ...lessorFields,
```

`NormalizedCaseInput` 인터페이스에 필드 추가 (`householdCount: number | null;` 다음 줄):

```ts
  businessRegistrationNumber: string | null;
```

`normalizeCaseInput()`의 반환 객체에 추가 (`householdCount: input.householdCount ?? null,` 다음 줄):

```ts
    businessRegistrationNumber: input.businessRegistrationNumber ?? null,
```

`services/case.service.ts`의 `CaseRow` 인터페이스에 추가 (`household_count: number | null;` 다음 줄):

```ts
  business_registration_number: string | null;
```

`CASE_COLUMNS` 문자열에 `household_count,` 뒤에 추가:

```ts
"business_registration_number," +
```

(`CASE_COLUMNS`는 여러 줄 문자열 연결이므로, `"...household_count,lease_type,"` 부분을 `"...household_count,business_registration_number,lease_type,"`로 바꾼다.)

`toRowPayload()`에 추가 (`household_count: input.householdCount,` 다음 줄):

```ts
    business_registration_number: input.businessRegistrationNumber,
```

`serializeCase()`의 반환 객체에 새 그룹 추가 (`property: {...},` 블록 다음, `terms: {...}` 앞):

```ts
    lessor: {
      businessRegistrationNumber: row.business_registration_number,
    },
```

`mock/store.ts`의 `DEFAULTS.cases`에 추가 (`household_count: null,` 다음 줄):

```ts
    business_registration_number: null,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/http/mock-flow.test.ts`
Expected: PASS (전체 스위트)

- [ ] **Step 5: Commit**

```bash
git add backend/supabase/migrations/20260825000300_case_business_registration_number.sql \
  backend/src/schemas/case.ts backend/src/services/case.service.ts backend/src/mock/store.ts \
  backend/tests/http/mock-flow.test.ts
git commit -m "feat: cases에 사업자등록번호 필드 추가"
```

---

## Task 5: 국세청 사업자등록 진위확인 (`services/business-registration.service.ts`)

15081808번, 공공데이터포털이 `api.odcloud.kr`에 호스팅하는 POST API. 다른 실거래가 API와 달리 POST + JSON body라는 점이 다르다. 기존 `DATA_GO_KR_SERVICE_KEY`를 재사용한다.

**Files:**
- Modify: `backend/src/domain/types.ts` (BusinessRegistrationInput, BusinessRegistrationResult 타입 추가)
- Create: `backend/src/mock/business-registration.ts`
- Create: `backend/src/services/business-registration.service.ts`
- Test: `backend/tests/services/business-registration.test.ts`

**Interfaces:**
- Produces: `isBusinessRegistrationAvailable(): boolean`, `verifyBusinessRegistration(input: BusinessRegistrationInput): Promise<BusinessRegistrationResult>` — Task 7이 이 함수를 가져다 쓴다.

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/services/business-registration.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCache } from "../../src/env.js";
import {
  isBusinessRegistrationAvailable,
  verifyBusinessRegistration,
} from "../../src/services/business-registration.service.js";

describe("business-registration.service", () => {
  beforeEach(() => {
    process.env.ZIP042_MODE = "mock";
    delete process.env.DATA_GO_KR_SERVICE_KEY;
    resetEnvCache();
  });

  afterEach(() => {
    delete process.env.ZIP042_MODE;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    resetEnvCache();
  });

  it("목 모드에서는 항상 사용 가능하다", () => {
    expect(isBusinessRegistrationAvailable()).toBe(true);
  });

  it("목 모드에서 정상 대표자명은 valid=true", async () => {
    const result = await verifyBusinessRegistration({
      businessNumber: "123-45-67890",
      representativeName: "김대표",
      openingDate: "2020-01-01",
    });
    expect(result.source).toBe("nts");
    expect(result.valid).toBe(true);
  });

  it("목 모드에서 대표자명에 '가짜'가 있으면 valid=false", async () => {
    const result = await verifyBusinessRegistration({
      businessNumber: "123-45-67890",
      representativeName: "가짜대표",
      openingDate: "2020-01-01",
    });
    expect(result.valid).toBe(false);
  });

  it("live 모드인데 서비스 키가 없으면 unavailable", async () => {
    process.env.ZIP042_MODE = "live";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "a".repeat(20);
    process.env.SUPABASE_SERVICE_ROLE_KEY = "b".repeat(20);
    resetEnvCache();

    const result = await verifyBusinessRegistration({
      businessNumber: "123-45-67890",
      representativeName: "김대표",
      openingDate: "2020-01-01",
    });
    expect(result.source).toBe("unavailable");
    expect(result.valid).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/services/business-registration.test.ts`
Expected: FAIL — `Cannot find module '../../src/services/business-registration.service.js'`

- [ ] **Step 3: Write minimal implementation**

`domain/types.ts` 파일 끝에 추가:

```ts
export interface BusinessRegistrationInput {
  businessNumber: string;
  representativeName: string;
  openingDate: DateOnly;
}

export interface BusinessRegistrationResult {
  source: "nts" | "unavailable" | "not_applicable";
  valid: boolean | null;
  status: string | null;
}
```

```ts
// backend/src/mock/business-registration.ts
import type {
  BusinessRegistrationInput,
  BusinessRegistrationResult,
} from "../domain/types.js";

/**
 * 목 모드 사업자등록 진위확인.
 * 대표자 이름에 "가짜"가 들어 있으면 불일치로 응답한다 (위험 시나리오 개발용 트리거).
 */
export function mockBusinessRegistration(
  input: BusinessRegistrationInput,
): BusinessRegistrationResult {
  const valid = !input.representativeName.includes("가짜");
  return {
    source: "nts",
    valid,
    status: valid ? "확인됨" : "확인할 수 없습니다",
  };
}
```

```ts
// backend/src/services/business-registration.service.ts
import { loadEnv } from "../env.js";
import { mockBusinessRegistration } from "../mock/business-registration.js";
import { log } from "../lib/logger.js";
import type { BusinessRegistrationInput, BusinessRegistrationResult } from "../domain/types.js";

/**
 * 국세청 사업자등록정보 진위확인 API 어댑터 (15081808, data.go.kr → api.odcloud.kr 호스팅).
 *
 * ⚠️ 운영 전 확인 사항
 *   1) 요청/응답 필드는 공개된 예시(businesses 배열 → data 배열의 valid/valid_msg) 기준으로
 *      작성했다. 포털에서 실제 신청 후 1회 실 호출로 필드명을 재확인할 것
 *      (market-price.service.ts와 동일 관행).
 *   2) serviceKey는 DATA_GO_KR_SERVICE_KEY를 재사용한다 — data.go.kr 일반 인증키는
 *      포털 내 여러 API에 공용으로 쓰인다.
 */

const VALIDATE_URL = "https://api.odcloud.kr/api/nts-businessman/v1/validate";

export function isBusinessRegistrationAvailable(): boolean {
  if (loadEnv().mode === "mock") return true;
  return Boolean(loadEnv().DATA_GO_KR_SERVICE_KEY);
}

export async function verifyBusinessRegistration(
  input: BusinessRegistrationInput,
): Promise<BusinessRegistrationResult> {
  const env = loadEnv();
  if (env.mode === "mock") return mockBusinessRegistration(input);

  const serviceKey = env.DATA_GO_KR_SERVICE_KEY;
  if (!serviceKey) {
    return { source: "unavailable", valid: null, status: "서비스 키가 설정되지 않았습니다." };
  }

  const url = new URL(VALIDATE_URL);
  url.searchParams.set("serviceKey", serviceKey);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businesses: [
          {
            b_no: input.businessNumber.replace(/-/g, ""),
            start_dt: input.openingDate.replace(/-/g, ""),
            p_nm: input.representativeName,
          },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`국세청 API 오류 (${res.status})`);
    const body = (await res.json()) as { data?: { valid?: string; valid_msg?: string }[] };
    const first = body.data?.[0];
    if (!first?.valid) throw new Error("응답에서 valid 필드를 찾을 수 없습니다.");
    return {
      source: "nts",
      valid: first.valid === "01",
      status: first.valid_msg ?? (first.valid === "01" ? "확인됨" : "확인할 수 없음"),
    };
  } catch (err) {
    log.warn("국세청 사업자등록 진위확인 실패", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { source: "unavailable", valid: null, status: null };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/services/business-registration.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/domain/types.ts backend/src/mock/business-registration.ts \
  backend/src/services/business-registration.service.ts \
  backend/tests/services/business-registration.test.ts
git commit -m "feat: 국세청 사업자등록 진위확인 어댑터 추가"
```

---

## Task 6: 계약서 초안 조립 로직 (`domain/contract-draft.ts`, 순수 함수)

이미 조회·계산된 데이터(당사자 정보, 매물 표시, 계약 조건, 추천 특약, 표준서식 링크)를 국토부 표준계약서 순서로 조립하는 순수 함수. Claude를 다시 호출하지 않는다.

**Files:**
- Create: `backend/src/domain/contract-draft.ts`
- Test: `backend/tests/domain/contract-draft.test.ts`

**Interfaces:**
- Produces: `assembleContractDraft(input: ContractDraftInput): ContractDraft`, `ContractDraftInput`, `ContractDraftSpecialTermInput`, `ContractDraft` 타입 — Task 7이 그대로 가져다 쓴다.

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/domain/contract-draft.test.ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/domain/contract-draft.test.ts`
Expected: FAIL — `Cannot find module '../../src/domain/contract-draft.js'`

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/domain/contract-draft.ts
import { formatKrw } from "./money.js";
import type { DateOnly } from "../lib/date.js";
import type { BusinessRegistrationResult } from "./types.js";

/**
 * 계약서 초안 조립 (기획서 3 "임대차 계약서 초안").
 *
 * 이미 조회·계산된 데이터를 국토부 표준임대차계약서 순서(당사자 → 목적물 표시 →
 * 계약 조건 → 특약사항)로 재배열만 한다. Claude를 다시 호출하지 않는다 — 이미
 * 추출된 데이터를 결정론적으로 매핑하는 편이 판정 재현성과 비용 양쪽에서 낫다.
 *
 * ⚠️ 정부 표준계약서 PDF의 필드를 프로그램으로 채우지 않는다. 서식 필드 매핑은
 * 양식이 바뀔 때마다 깨지기 쉬운 반면, 이 구조화 JSON + 원본 서식 링크를 함께
 * 주는 편이 유지보수 비용 대비 가치가 높다.
 */

export type ContractDraftLeaseType = "jeonse" | "monthly" | "semi_jeonse";

export interface ContractDraftParty {
  role: "임대인" | "임차인";
  name: string | null;
  businessRegistrationNumber: string | null;
  businessVerification: BusinessRegistrationResult | null;
}

export interface ContractDraftPropertyDescription {
  roadAddress: string | null;
  detailAddress: string | null;
  buildingType: string | null;
  exclusiveAreaM2: number | null;
}

export interface ContractDraftTerms {
  leaseType: ContractDraftLeaseType;
  depositKrw: number;
  monthlyRentKrw: number;
  maintenanceFeeKrw: number;
  contractDate: DateOnly | null;
  balanceDate: DateOnly | null;
  contractTermMonths: number;
}

export interface ContractDraftSpecialTermInput {
  code: string;
  title: string;
  priority: number;
  clauseText: string;
  legalBasis: { law: string; jo: string; label: string }[];
}

export interface ContractDraftInput {
  parties: ContractDraftParty[];
  property: ContractDraftPropertyDescription;
  terms: ContractDraftTerms;
  specialTerms: ContractDraftSpecialTermInput[];
  standardForm: { pdfUrl: string | null; fallbackUrl: string };
}

export interface ContractDraftSpecialTermLine {
  code: string;
  title: string;
  clauseText: string;
  legalBasisLabels: string[];
}

export interface ContractDraft {
  parties: ContractDraftParty[];
  propertyDescription: string;
  terms: {
    summary: string;
    leaseTypeLabel: string;
    depositKrw: number;
    monthlyRentKrw: number;
    maintenanceFeeKrw: number;
    contractTermMonths: number;
  };
  specialTerms: ContractDraftSpecialTermLine[];
  standardFormUrl: string;
  rentHomeNotice: { message: string; linkUrl: string };
  disclaimer: string;
}

const LEASE_TYPE_LABEL: Record<ContractDraftLeaseType, string> = {
  jeonse: "전세",
  monthly: "월세",
  semi_jeonse: "반전세",
};

function summarizeTerms(terms: ContractDraftTerms): string {
  const deposit = `보증금 ${formatKrw(terms.depositKrw)}`;
  if (terms.leaseType === "monthly" || terms.monthlyRentKrw > 0) {
    return `${deposit} / 월세 ${formatKrw(terms.monthlyRentKrw)}`;
  }
  return deposit;
}

export function assembleContractDraft(input: ContractDraftInput): ContractDraft {
  const { property, terms } = input;

  const propertyDescription =
    [property.roadAddress, property.detailAddress].filter((v): v is string => Boolean(v)).join(" ") ||
    "주소 미입력";

  const specialTerms: ContractDraftSpecialTermLine[] = input.specialTerms
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map((t) => ({
      code: t.code,
      title: t.title,
      clauseText: t.clauseText,
      legalBasisLabels: t.legalBasis.map((b) => `${b.law} ${b.label}`),
    }));

  return {
    parties: input.parties,
    propertyDescription,
    terms: {
      summary: summarizeTerms(terms),
      leaseTypeLabel: LEASE_TYPE_LABEL[terms.leaseType],
      depositKrw: terms.depositKrw,
      monthlyRentKrw: terms.monthlyRentKrw,
      maintenanceFeeKrw: terms.maintenanceFeeKrw,
      contractTermMonths: terms.contractTermMonths,
    },
    specialTerms,
    standardFormUrl: input.standardForm.pdfUrl ?? input.standardForm.fallbackUrl,
    rentHomeNotice: {
      message: "임대사업자 등록 여부는 API로 확인할 수 없습니다. 임대인에게 등록 여부를 직접 요구하세요.",
      linkUrl: "https://www.renthome.go.kr",
    },
    disclaimer:
      "이 초안은 법률 자문이 아니며, 국토교통부 표준임대차계약서 작성을 보조하는 도구입니다. " +
      "최종 서명 전 반드시 원본 서식과 대조하고 전문가와 상담하세요.",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/domain/contract-draft.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/domain/contract-draft.ts backend/tests/domain/contract-draft.test.ts
git commit -m "feat: 계약서 초안 조립 순수 함수 추가"
```

---

## Task 7: 계약서 초안 라우트 (`services/contract-draft.service.ts`, `routes/contract-draft.ts`)

Task 2·3·4·5·6에서 만든 조각을 엮어 `GET /v1/cases/:caseId/contract-draft`를 완성한다. 매물 주소는 `case.service.ts`에 이미 저장된 `road_address`/`detail_address`를 그대로 쓴다 — 이 값은 검사 건 생성 시 이미 도로명주소·Kakao 어댑터(0번 구성)를 거쳐 정규화된 값이므로, 여기서 다시 호출할 필요가 없다.

**Files:**
- Create: `backend/src/services/contract-draft.service.ts`
- Create: `backend/src/routes/contract-draft.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/openapi.ts`
- Test: `backend/tests/http/mock-flow.test.ts` (확장)

**Interfaces:**
- Consumes: `getCase` (`case.service.js`), `ensureExtractions` (`document.service.js`), `getLatestAnalysis` (`analysis.service.js`), `recommendSpecialTerms`, `legalBasisFor` (`special-terms.js`, Task 3), `fetchStandardLeaseForm` (`lawinfo.service.js`, Task 2), `verifyBusinessRegistration` (`business-registration.service.js`, Task 5), `assembleContractDraft` (`contract-draft.js`, Task 6)
- Produces: `buildContractDraft(db: Db, caseId: string): Promise<ContractDraft>`, `GET /v1/cases/:caseId/contract-draft`

- [ ] **Step 1: Write the failing test**

`backend/tests/http/mock-flow.test.ts` 파일 끝의 `interface AnalysisShape` 선언 바로 위에 추가 (Task 3의 "특약 법조문 인용 (compose)" 블록 뒤):

```ts
describe("계약서 초안", () => {
  it("등기부 판독 없이도 기본 특약으로 초안을 만든다", async () => {
    const created = await app.request("/v1/cases", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        title: "계약서 초안 확인",
        roadAddress: "대전광역시 서구 둔산로 100",
        detailAddress: "301호",
        leaseType: "jeonse",
        amountUnit: "man",
        deposit: 9000,
        contractDate: "2026-09-10",
        balanceDate: "2026-10-08",
      }),
    });
    const caseId = (await json<{ case: { id: string } }>(created)).case.id;

    const res = await app.request(`/v1/cases/${caseId}/contract-draft`, { headers: AUTH });
    expect(res.status).toBe(200);

    const body = await json<{
      draft: {
        propertyDescription: string;
        specialTerms: { code: string; legalBasisLabels: string[] }[];
        standardFormUrl: string;
        rentHomeNotice: { linkUrl: string };
        disclaimer: string;
      };
    }>(res);

    expect(body.draft.propertyDescription).toBe("대전광역시 서구 둔산로 100 301호");
    expect(body.draft.specialTerms.length).toBeGreaterThan(0);
    const withCitation = body.draft.specialTerms.find(
      (t) => t.code === "TERM_NO_NEW_ENCUMBRANCE",
    );
    expect(withCitation?.legalBasisLabels).toEqual(["주택임대차보호법 제3조"]);
    expect(body.draft.standardFormUrl).toContain("law.go.kr");
    expect(body.draft.rentHomeNotice.linkUrl).toBe("https://www.renthome.go.kr");
    expect(body.draft.disclaimer).toContain("법률 자문이 아니며");
  });

  it("사업자등록번호가 없으면 진위확인은 not_applicable", async () => {
    const created = await app.request("/v1/cases", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        title: "개인 임대인",
        leaseType: "jeonse",
        amountUnit: "man",
        deposit: 9000,
      }),
    });
    const caseId = (await json<{ case: { id: string } }>(created)).case.id;

    const res = await app.request(`/v1/cases/${caseId}/contract-draft`, { headers: AUTH });
    const body = await json<{
      draft: { parties: { role: string; businessVerification: { source: string } | null }[] };
    }>(res);
    const lessor = body.draft.parties.find((p) => p.role === "임대인");
    expect(lessor?.businessVerification).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/http/mock-flow.test.ts -t "계약서 초안"`
Expected: FAIL — `GET /v1/cases/:caseId/contract-draft` returns 404 (route not found)

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/services/contract-draft.service.ts
import type { Db } from "../lib/supabase.js";
import type { DateOnly } from "../lib/date.js";
import { getCase } from "./case.service.js";
import { ensureExtractions } from "./document.service.js";
import { getLatestAnalysis } from "./analysis.service.js";
import { legalBasisFor, recommendSpecialTerms } from "../domain/special-terms.js";
import { fetchStandardLeaseForm } from "./lawinfo.service.js";
import { verifyBusinessRegistration } from "./business-registration.service.js";
import { assembleContractDraft, type ContractDraft } from "../domain/contract-draft.js";
import type { BusinessRegistrationResult } from "../domain/types.js";

const CORPORATE_MARKERS = ["주식회사", "(주)", "유한회사", "재단법인", "사단법인"];

function looksCorporate(name: string | null): boolean {
  if (!name) return false;
  return CORPORATE_MARKERS.some((marker) => name.includes(marker));
}

export async function buildContractDraft(db: Db, caseId: string): Promise<ContractDraft> {
  const row = await getCase(db, caseId);

  const [extractions, analysis, standardForm] = await Promise.all([
    ensureExtractions(caseId, { reparse: false }),
    getLatestAnalysis(db, caseId),
    fetchStandardLeaseForm(),
  ]);

  const lessorName = extractions.lease?.lessorName ?? extractions.registry?.ownerNames?.[0] ?? null;

  const specialTerms =
    analysis && analysis.specialTerms.length > 0
      ? analysis.specialTerms
      : recommendSpecialTerms(new Map(), {
          depositKrw: row.deposit_krw,
          contractDate: row.contract_date as DateOnly | null,
          balanceDate: row.balance_date as DateOnly | null,
          residentRegistrationDate: row.resident_registration_date as DateOnly | null,
          protectionDate: (row.resident_registration_date ?? row.balance_date) as DateOnly | null,
          address: row.road_address,
          detailAddress: row.detail_address,
          maintenanceFeeKrw: row.maintenance_fee_krw,
        });

  let businessVerification: BusinessRegistrationResult | null = null;
  if (looksCorporate(lessorName)) {
    if (row.business_registration_number && lessorName && row.contract_date) {
      businessVerification = await verifyBusinessRegistration({
        businessNumber: row.business_registration_number,
        representativeName: lessorName,
        openingDate: row.contract_date as DateOnly,
      });
    } else if (row.business_registration_number) {
      businessVerification = {
        source: "unavailable",
        valid: null,
        status: "대표자명 또는 계약일이 없어 확인할 수 없습니다.",
      };
    } else {
      businessVerification = { source: "not_applicable", valid: null, status: null };
    }
  }

  return assembleContractDraft({
    parties: [
      {
        role: "임대인",
        name: lessorName,
        businessRegistrationNumber: row.business_registration_number,
        businessVerification,
      },
      { role: "임차인", name: null, businessRegistrationNumber: null, businessVerification: null },
    ],
    property: {
      roadAddress: row.road_address,
      detailAddress: row.detail_address,
      buildingType: row.building_type,
      exclusiveAreaM2: row.exclusive_area_m2,
    },
    terms: {
      leaseType: row.lease_type,
      depositKrw: row.deposit_krw,
      monthlyRentKrw: row.monthly_rent_krw,
      maintenanceFeeKrw: row.maintenance_fee_krw,
      contractDate: row.contract_date as DateOnly | null,
      balanceDate: row.balance_date as DateOnly | null,
      contractTermMonths: row.contract_term_months,
    },
    specialTerms: specialTerms.map((t) => ({
      code: t.code,
      title: t.title,
      priority: t.priority,
      clauseText: t.clauseText,
      legalBasis: legalBasisFor(t.code),
    })),
    standardForm: { pdfUrl: standardForm.pdfUrl, fallbackUrl: standardForm.fallbackUrl },
  });
}
```

```ts
// backend/src/routes/contract-draft.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { userClient } from "../lib/supabase.js";
import type { AppBindings } from "../middleware/auth.js";
import { buildContractDraft } from "../services/contract-draft.service.js";
import { assertOwnership } from "./cases.js";

const caseParam = z.object({ caseId: z.string().uuid() });

export const contractDraftRoute = new Hono<AppBindings>();

/**
 * 국토교통부 표준임대차계약서 자동완성 초안.
 * "계약서 작성"이 아니라 이미 수집된 데이터로 표준계약서 항목을 채워주는 보조 도구다.
 */
contractDraftRoute.get("/:caseId/contract-draft", zValidator("param", caseParam), async (c) => {
  const { caseId } = c.req.valid("param");
  await assertOwnership(c.get("accessToken"), caseId);
  const draft = await buildContractDraft(userClient(c.get("accessToken")), caseId);
  return c.json({ draft });
});
```

`app.ts`에 import 추가 (`import { termsCatalogRoute, termsRoute } from "./routes/terms.js";` 다음 줄):

```ts
import { contractDraftRoute } from "./routes/contract-draft.js";
```

`app.ts`의 라우터 마운트 섹션에 추가 (`app.route("/v1", termsRoute);` 다음 줄):

```ts
  app.route("/v1/cases", contractDraftRoute);
```

`openapi.ts`의 `tags` 배열에 추가 (`{ name: "special-terms", ... },` 다음 줄):

```ts
      { name: "contract-draft", description: "계약서 초안" },
```

`openapi.ts`의 `paths` 객체에 추가 (`"/v1/cases/{caseId}/special-terms/compose": {...},` 블록 다음):

```ts
      "/v1/cases/{caseId}/contract-draft": {
        get: {
          tags: ["contract-draft"],
          summary: "표준임대차계약서 자동완성 초안",
          description:
            "이미 수집된 등기부·확인설명서 데이터와 추천 특약으로 국토교통부 표준계약서 " +
            "항목을 채운 초안입니다. 법률 자문이 아닙니다.",
          parameters: [caseIdParam],
          responses: { "200": jsonResponse("계약서 초안", { type: "object" }), ...errorResponses },
        },
      },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/http/mock-flow.test.ts`
Expected: PASS (전체 스위트)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/contract-draft.service.ts backend/src/routes/contract-draft.ts \
  backend/src/app.ts backend/src/openapi.ts backend/tests/http/mock-flow.test.ts
git commit -m "feat: 계약서 초안 라우트(GET /v1/cases/:caseId/contract-draft) 추가"
```

---

## Task 8: 전체 검증 및 OpenAPI 재생성

**Files:**
- Modify: `backend/openapi.json` (재생성 결과)

- [ ] **Step 1: 타입 검사**

Run: `cd backend && npm run typecheck`
Expected: 오류 없음

- [ ] **Step 2: 전체 테스트**

Run: `cd backend && npm test`
Expected: 기존 242개 + 이번 작업에서 추가한 약 25개 테스트 전부 PASS

- [ ] **Step 3: OpenAPI 재생성**

Run: `cd backend && npm run openapi`
Expected: `openapi.json`이 갱신되고, git diff에 Task 7에서 추가한 `/v1/cases/{caseId}/contract-draft` 경로와 `contract-draft` 태그가 나타난다.

- [ ] **Step 4: 재생성 결과가 안정적인지 확인 (한 번 더 실행)**

Run: `cd backend && npm run openapi && git diff --stat backend/openapi.json`
Expected: 두 번째 실행에서는 diff가 없어야 한다(생성 스크립트가 결정론적인지 확인).

- [ ] **Step 5: Commit**

```bash
git add backend/openapi.json
git commit -m "chore: OpenAPI 문서 재생성 (계약서 초안 · 특약 법조문 인용 반영)"
```
