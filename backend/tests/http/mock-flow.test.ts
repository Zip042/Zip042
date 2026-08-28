import { beforeAll, describe, expect, it } from "vitest";
import type { Hono } from "hono";

/**
 * 목 모드 종단 테스트.
 *
 * 외부 의존이 하나도 없으므로 **전체 파이프라인**을 CI에서 돌릴 수 있다:
 *   검사 건 생성 → 문서 등록 → 판독(픅스처) → 규칙 엔진 → 판정 저장 → 조회
 *
 * live 모드에서는 AI · 공공 API 때문에 이 경로를 테스트할 수 없다. 목 모드의 가장 큰 값이 여기다.
 */

let app: Hono;
let today: string;
let buildScenario: typeof import("../../src/mock/fixtures.js").buildScenario;
let SCENARIO_KEYS: typeof import("../../src/mock/fixtures.js").SCENARIO_KEYS;
let mockStore: typeof import("../../src/mock/store.js").store;
let EXTRACTION_SCHEMA_VERSION: typeof import("../../src/services/extraction.service.js").EXTRACTION_SCHEMA_VERSION;

const AUTH = { authorization: "Bearer dev", "content-type": "application/json" };

async function json<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

beforeAll(async () => {
  process.env.ZIP042_MODE = "mock";
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "error";
  delete process.env.SUPABASE_URL;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.DATA_GO_KR_SERVICE_KEY;

  const [{ createApp }, fixtures, dateLib, storeModule, extractionService] = await Promise.all([
    import("../../src/app.js"),
    import("../../src/mock/fixtures.js"),
    import("../../src/lib/date.js"),
    import("../../src/mock/store.js"),
    import("../../src/services/extraction.service.js"),
  ]);
  app = createApp() as unknown as Hono;
  buildScenario = fixtures.buildScenario;
  SCENARIO_KEYS = fixtures.SCENARIO_KEYS;
  today = dateLib.todayKst();
  mockStore = storeModule.store;
  EXTRACTION_SCHEMA_VERSION = extractionService.EXTRACTION_SCHEMA_VERSION;
});

/**
 * 목 모드의 문서 판독은 항상 시나리오 픽스처(`mock/fixtures.ts`)에서 나오고, 그 어떤
 * 시나리오도 법인 임대인 이름을 갖고 있지 않다 — 사업자등록번호 진위확인 2분기
 * (not_applicable/unavailable)를 e2e 로 확인하려면 판독 결과에 임대인 이름이 있어야 한다
 * (법인명이든 개인명이든 — Finding 4 이후로는 사업자등록번호 유무만 결과를 가른다).
 *
 * 공유 시나리오 픽스처를 건드리는 대신(다른 시나리오·`/v1/dev/seed` 기본 동작에 영향을 줄
 * 위험이 있다), `ensureExtractions` 가 재판독 없이 그대로 쓰는 `document_extractions`
 * 캐시 행을 이 테스트 전용으로 직접 심는다. 이 캐시-우선 경로는 실제 서비스 코드
 * (`document.service.ts`)가 이미 쓰는 정상 동작이므로, 이 방식은 내부 구현을
 * 우회하는 게 아니라 그 경로를 통해 법인명을 주입하는 것이다.
 */
async function registerCaseWithLessorName(
  caseId: string,
  lessorName: string,
  headers: Record<string, string> = AUTH,
): Promise<void> {
  const upRes = await app.request(`/v1/cases/${caseId}/documents/upload-url`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      docType: "lease_draft",
      fileName: "임대차계약서.pdf",
      mimeType: "application/pdf",
    }),
  });
  const { upload } = await json<{ upload: { url: string; storagePath: string } }>(upRes);

  await app.request(new URL(upload.url).pathname, {
    method: "PUT",
    headers: { "content-type": "application/pdf" },
    body: Buffer.from("%PDF-1.4 테스트 파일"),
  });

  const regRes = await app.request(`/v1/cases/${caseId}/documents`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      docType: "lease_draft",
      storagePath: upload.storagePath,
      originalName: "임대차계약서.pdf",
      mimeType: "application/pdf",
      sizeBytes: 21,
    }),
  });
  const { document } = await json<{ document: { id: string } }>(regRes);

  mockStore.table("document_extractions").push({
    ...mockStore.defaultsFor("document_extractions"),
    document_id: document.id,
    case_id: caseId,
    doc_type: "lease_draft",
    model: "test-fixture:corporate-lessor",
    schema_version: EXTRACTION_SCHEMA_VERSION,
    payload: { lessorName },
    confidence: 0.9,
  });
}

describe("목 모드 기본", () => {
  it("meta 가 목 모드임을 알려준다", async () => {
    const body = await json<{
      mode: string;
      capabilities: Record<string, boolean>;
    }>(await app.request("/v1/meta"));
    expect(body.mode).toBe("mock");
    // 목 모드에서는 키 없이도 판독·시세가 "가능"하다고 보고해야 한다.
    expect(body.capabilities.documentExtraction).toBe(true);
    expect(body.capabilities.marketPriceLookup).toBe(true);
  });

  it("아무 토큰이나 통하고, 같은 토큰은 같은 사용자다", async () => {
    const a = await json<{ cases: unknown[] }>(
      await app.request("/v1/cases", { headers: { authorization: "Bearer alice" } }),
    );
    const b = await json<{ cases: unknown[] }>(
      await app.request("/v1/cases", { headers: { authorization: "Bearer bob" } }),
    );
    expect(Array.isArray(a.cases)).toBe(true);
    expect(Array.isArray(b.cases)).toBe(true);
  });

  it("토큰이 아예 없으면 여전히 401", async () => {
    expect((await app.request("/v1/cases")).status).toBe(401);
  });

  it("개발 가이드와 시나리오 목록을 제공한다", async () => {
    const guide = await json<{ mode: string; quickStart: string[] }>(await app.request("/v1/dev"));
    expect(guide.mode).toBe("mock");
    expect(guide.quickStart.length).toBeGreaterThan(0);

    const scenarios = await json<{ scenarios: { key: string }[] }>(
      await app.request("/v1/dev/scenarios"),
    );
    expect(scenarios.scenarios.map((s) => s.key)).toEqual([...SCENARIO_KEYS]);
  });
});

describe("검사 건 생성 → 문서 등록 → 분석 (전체 파이프라인)", () => {
  let caseId: string;
  /** POST /analyze 의 judgment. 아래 GET 테스트가 같은 값인지 대조한다. */
  let postJudgment: JudgmentSnapshot | null = null;

  it("검사 건을 만들 수 있다 (만원 단위 입력)", async () => {
    const res = await app.request("/v1/cases", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        amountUnit: "man",
        title: "테스트 원룸",
        roadAddress: "대전광역시 서구 둔산로 100",
        detailAddress: "301호",
        regionCode: "3017010100",
        sigungu: "대전광역시 서구",
        lat: 36.3504,
        lng: 127.3845,
        buildingType: "multi_family",
        exclusiveAreaM2: 29.75,
        leaseType: "jeonse",
        deposit: 9000, // 9,000만원
        contractTermMonths: 24,
        contractDate: "2026-09-10",
        balanceDate: "2026-10-08",
        residentRegistrationDate: "2026-10-08",
      }),
    });
    expect(res.status).toBe(201);
    const body = await json<{ case: { id: string; terms: { depositKrw: number } } }>(res);
    // 만원 → 원 정규화가 되었는지
    expect(body.case.terms.depositKrw).toBe(90_000_000);
    caseId = body.case.id;
  });

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

  it("서명 업로드 URL → PUT → 등록 3단계가 동작한다", async () => {
    const urlRes = await app.request(`/v1/cases/${caseId}/documents/upload-url`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        docType: "registry",
        fileName: "등기부등본.pdf",
        mimeType: "application/pdf",
      }),
    });
    expect(urlRes.status).toBe(200);
    const { upload } = await json<{ upload: { url: string; storagePath: string } }>(urlRes);

    // 목 모드의 서명 URL 은 우리 서버의 개발용 수신 엔드포인트를 가리킨다.
    const putRes = await app.request(new URL(upload.url).pathname, {
      method: "PUT",
      headers: { "content-type": "application/pdf" },
      body: Buffer.from("%PDF-1.4 테스트 파일"),
    });
    expect(putRes.status).toBe(200);
    expect((await json<{ sizeBytes: number }>(putRes)).sizeBytes).toBeGreaterThan(0);

    const regRes = await app.request(`/v1/cases/${caseId}/documents`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        docType: "registry",
        storagePath: upload.storagePath,
        originalName: "등기부등본.pdf",
        mimeType: "application/pdf",
        sizeBytes: 21,
        mockScenario: "underwater",
      }),
    });
    expect(regRes.status).toBe(201);
    const reg = await json<{ appliedMockScenario: string }>(regRes);
    expect(reg.appliedMockScenario).toBe("underwater");
  });

  it("남의 storagePath 는 등록할 수 없다", async () => {
    const res = await app.request(`/v1/cases/${caseId}/documents`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        docType: "lease_draft",
        storagePath: "someone-else/other-case/x.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("알 수 없는 mockScenario 는 조용히 무시된다 (파일명 추측으로 폴백)", async () => {
    const res = await app.request(`/v1/cases/${caseId}/documents`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        docType: "brokerage_statement",
        storagePath: `${await ownerFolder()}/${caseId}/x.pdf`,
        originalName: "확인설명서_trust.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        mockScenario: "존재하지않는키",
      }),
    });
    expect(res.status).toBe(201);
    // 파일명에 trust 가 있으므로 그걸 쓴다.
    expect((await json<{ appliedMockScenario: string }>(res)).appliedMockScenario).toBe("trust");
  });

  it("분석이 실제로 끝까지 돌아간다", async () => {
    const res = await app.request(`/v1/cases/${caseId}/analyze`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);

    const { analysis } = await json<{ analysis: AnalysisShape }>(res);

    // 판정
    expect(["safe", "caution", "danger", "critical"]).toContain(analysis.verdict.verdict);
    expect(analysis.verdict.headline.length).toBeGreaterThan(5);
    expect(analysis.verdict.summary.length).toBeGreaterThan(20);
    expect(analysis.findings.length).toBeGreaterThan(0);

    // 일정 가공 — 대항력 발생 시점이 계산되어야 한다
    expect(analysis.schedule.evaluable).toBe(true);
    expect(analysis.schedule.opposingPowerEffectiveAt).toBe("2026-10-08T15:00:00.000Z");
    expect(analysis.schedule.unprotectedWindow?.days).toBe(1);
    expect(analysis.schedule.events.length).toBeGreaterThan(5);

    // 시세 · 깡통전세 판정
    expect(analysis.valuation.evaluable).toBe(true);
    expect(analysis.valuation.marketPrice.estimatedKrw).toBeGreaterThan(0);
    expect(analysis.valuation.simulation).not.toBeNull();

    // 특약 — 계약서에 그대로 붙일 수 있는 문구여야 한다
    expect(analysis.specialTerms.length).toBeGreaterThan(5);
    for (const term of analysis.specialTerms) {
      expect(term.clauseText).not.toContain("undefined");
      expect(term.clauseText.length).toBeGreaterThan(20);
    }

    // 판정의 한계를 반드시 알린다
    expect(analysis.caveats.some((c) => c.includes("법률 자문이 아닙니다"))).toBe(true);

    // 아래 GET 테스트와 대조하기 위해 보관한다.
    postJudgment = (analysis as unknown as { judgment?: JudgmentSnapshot }).judgment ?? null;
    expect(postJudgment).not.toBeNull();
  });

  it("저장된 결과를 재계산 없이 다시 읽을 수 있다", async () => {
    const res = await app.request(`/v1/cases/${caseId}/analysis`, { headers: AUTH });
    expect(res.status).toBe(200);
    const { analysis } = await json<{
      analysis: { version: number; specialTerms: unknown[]; judgment?: JudgmentSnapshot; badge?: unknown };
    }>(res);
    expect(analysis.version).toBe(1);
    expect(analysis.specialTerms.length).toBeGreaterThan(0);

    /**
     * POST /analyze 와 **같은 모양**이어야 한다.
     *
     * 실제로 GET 에만 `judgment` 가 빠져 있었다. 프론트는 `judgment` 가 없으면
     * 선순위 채권·보증금을 **0원으로 표시**했고, 결과 화면을 새로고침한 사용자에게
     * "선순위 채권 0만원"이 보였다 — 전세사기 서비스에서 "빚이 없는 안전한 집"으로
     * 읽히는 가장 위험한 오독이다. 두 경로를 여기서 묶어 둔다.
     */
    expect(analysis.judgment).toBeDefined();
    expect(analysis.badge).toBeDefined();
    expect(analysis.judgment!.judgments.length).toBe(postJudgment!.judgments.length);
    expect(analysis.judgment!.calculation).toEqual(postJudgment!.calculation);
    // 금액을 0 으로 채우지 않았는지 확인한다.
    expect(analysis.judgment!.calculation.depositKrw).toBeGreaterThan(0);
  });

  it("재분석하면 version 이 올라간다", async () => {
    await app.request(`/v1/cases/${caseId}/analyze`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({}),
    });
    const res = await app.request(`/v1/cases/${caseId}/analyses`, { headers: AUTH });
    const { analyses } = await json<{ analyses: { version: number }[] }>(res);
    expect(analyses[0]?.version).toBe(2);
  });

  it("타임라인에 D-day 가 붙는다", async () => {
    const res = await app.request(`/v1/cases/${caseId}/timeline`, { headers: AUTH });
    expect(res.status).toBe(200);
    const body = await json<{ events: { code: string; dDay: number }[]; today: string }>(res);
    expect(body.today).toBe(today);
    expect(body.events.length).toBeGreaterThan(5);
    expect(body.events.every((e) => typeof e.dDay === "number")).toBe(true);
  });

  it("일정 미리보기는 문서 없이 즉시 계산된다", async () => {
    const res = await app.request("/v1/schedule/preview", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        contractDate: "2026-09-10",
        balanceDate: "2026-10-10", // 토요일
        residentRegistrationDate: "2026-10-10",
      }),
    });
    expect(res.status).toBe(200);
    const body = await json<{
      schedule: { findings: { code: string }[] };
      alternatives: { earlier: string; later: string };
    }>(res);
    expect(body.schedule.findings.map((f) => f.code)).toContain(
      "SCH_BALANCE_ON_NON_BUSINESS_DAY",
    );
    expect(body.alternatives.later).toBe("2026-10-12");
  });

  async function ownerFolder(): Promise<string> {
    const res = await app.request(`/v1/cases/${caseId}/documents/upload-url`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        docType: "other",
        fileName: "probe.pdf",
        mimeType: "application/pdf",
      }),
    });
    const { upload } = await json<{ upload: { storagePath: string } }>(res);
    return upload.storagePath.split("/")[0]!;
  }
});

describe("대화형 후속 질문", () => {
  let caseId: string;

  beforeAll(async () => {
    const res = await app.request("/v1/cases", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        roadAddress: "대전광역시 서구 둔산로 100",
        leaseType: "monthly",
        deposit: 10_000_000,
        monthlyRent: 500_000,
        maintenanceFee: 70_000,
        contractDate: "2026-09-10",
        balanceDate: "2026-10-08",
      }),
    });
    caseId = (await json<{ case: { id: string } }>(res)).case.id;
  });

  it("질문을 최대 3개씩 준다", async () => {
    const res = await app.request(`/v1/cases/${caseId}/interview`, { headers: AUTH });
    expect(res.status).toBe(200);
    const { interview } = await json<{
      interview: { questions: { code: string }[]; totalQuestions: number };
    }>(res);
    expect(interview.questions.length).toBeLessThanOrEqual(3);
    expect(interview.totalQuestions).toBeGreaterThan(3);
    expect(interview.questions[0]?.code).toBe("Q_RESIDENT_REGISTRATION_OBJECTION");
  });

  it("답변이 위험 신호와 특약으로 변환된다", async () => {
    const res = await app.request(`/v1/cases/${caseId}/interview/answers`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        answers: {
          Q_RESIDENT_REGISTRATION_OBJECTION: true,
          Q_VERBAL_PROMISES: ["cleaning", "pet"],
        },
      }),
    });
    expect(res.status).toBe(200);
    const { interview } = await json<{
      interview: {
        answeredCount: number;
        derivedFindings: { code: string; severity: string }[];
        derivedTerms: { code: string }[];
      };
    }>(res);
    expect(interview.answeredCount).toBe(2);
    const objection = interview.derivedFindings.find(
      (f) => f.code === "INT_REGISTRATION_OBJECTION",
    );
    expect(objection?.severity).toBe("critical");
    expect(interview.derivedTerms.map((t) => t.code)).toContain("TERM_PET_ALLOWED");
  });

  it("잘못된 질문 코드는 400", async () => {
    const res = await app.request(`/v1/cases/${caseId}/interview/answers`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ answers: { Q_NOT_A_REAL_QUESTION: true } }),
    });
    expect(res.status).toBe(400);
  });

  it("인터뷰 답변이 분석 판정에 반영된다", async () => {
    const res = await app.request(`/v1/cases/${caseId}/analyze`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({}),
    });
    const { analysis } = await json<{ analysis: AnalysisShape }>(res);
    expect(analysis.findings.map((f) => f.code)).toContain("INT_REGISTRATION_OBJECTION");
    // 전입신고를 막는 임대인은 계약 불가 판정이어야 한다.
    expect(analysis.verdict.contractable).toBe(false);
  });
});

describe("판정 저장 — 위험과 '확인 못 함'이 섞이지 않는다", () => {
  it("저장된 findings 가 kind 를 그대로 들고 온다", async () => {
    // 이 테스트가 없어서 실제로 kind 가 통째로 버려지고 있었다(컬럼이 없었다).
    // 그 결과 프론트엔드가 두 축을 나눌 수 없어 "사진이 흐림"이 위험으로 보였다 (설계 원칙 3).
    const created = await app.request("/v1/cases", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ title: "kind 보존 확인", leaseType: "jeonse", amountUnit: "man", deposit: 9000 }),
    });
    const caseId = (await json<{ case: { id: string } }>(created)).case.id;

    // 서류를 하나도 올리지 않으면 info_gap 이 반드시 생긴다(등기부 미제출 · 시세 미확인 등).
    const analyzed = await app.request(`/v1/cases/${caseId}/analyze`, {
      method: "POST",
      headers: AUTH,
      body: "{}",
    });
    expect(analyzed.status).toBe(200);

    const stored = await json<{
      analysis: {
        findings: { code: string; kind?: string }[];
        verdict: { informationGaps: { code: string }[] };
      };
    }>(await app.request(`/v1/cases/${caseId}/analysis`, { headers: AUTH }));

    const gapCodes = new Set(stored.analysis.verdict.informationGaps.map((g) => g.code));
    expect(gapCodes.size).toBeGreaterThan(0);

    // 모든 finding 에 kind 가 있어야 한다.
    for (const f of stored.analysis.findings) {
      expect(f.kind, `${f.code} 에 kind 가 없습니다`).toBeDefined();
    }

    // informationGaps 에 있는 항목은 findings 에서도 info_gap 이어야 한다.
    for (const f of stored.analysis.findings) {
      if (gapCodes.has(f.code)) {
        expect(f.kind, `${f.code} 는 info_gap 이어야 합니다`).toBe("info_gap");
      }
    }

    // 반대로 info_gap 이 아닌 것이 informationGaps 에 들어 있으면 안 된다.
    const riskCodes = stored.analysis.findings.filter((f) => f.kind === "risk").map((f) => f.code);
    for (const code of riskCodes) {
      expect(gapCodes.has(code), `${code} 가 위험이면서 동시에 확인 못 함으로 잡혔습니다`).toBe(false);
    }
  });
});

describe("계약 체크리스트 — 저장과 진행률", () => {
  it("처음에는 빈 상태이고 404 가 아니다", async () => {
    const res = await app.request("/v1/checklist/progress", { headers: AUTH });
    expect(res.status).toBe(200);
    const body = await json<{ checklist: { checkedItemIds: string[]; updatedAt: string | null } }>(res);
    expect(body.checklist.checkedItemIds).toEqual([]);
    expect(body.checklist.updatedAt).toBeNull();
  });

  it("저장하면 진행률이 함께 갱신된다", async () => {
    const template = await json<{ stages: { items: { id: string; required: boolean }[] }[] }>(
      await app.request("/v1/checklist"),
    );
    const allItems = template.stages.flatMap((s) => s.items);
    const firstRequired = allItems.find((i) => i.required)!;

    const saved = await app.request("/v1/checklist/progress", {
      method: "PUT",
      headers: AUTH,
      body: JSON.stringify({ checkedItemIds: [firstRequired.id] }),
    });
    expect(saved.status).toBe(200);
    const body = await json<{
      checklist: {
        checkedItemIds: string[];
        progress: { done: number; requiredDone: number; missingRequired: { id: string }[] };
      };
    }>(saved);
    expect(body.checklist.checkedItemIds).toEqual([firstRequired.id]);
    expect(body.checklist.progress.done).toBe(1);
    expect(body.checklist.progress.requiredDone).toBe(1);
    expect(body.checklist.progress.missingRequired.map((m) => m.id)).not.toContain(firstRequired.id);
  });

  it("다시 조회하면 저장된 상태가 그대로 나온다", async () => {
    const body = await json<{ checklist: { checkedItemIds: string[]; updatedAt: string | null } }>(
      await app.request("/v1/checklist/progress", { headers: AUTH }),
    );
    expect(body.checklist.checkedItemIds.length).toBe(1);
    expect(body.checklist.updatedAt).not.toBeNull();
  });

  it("알 수 없는 항목 id 는 조용히 걸러진다 (400 이 아니다)", async () => {
    // 항목이 지워진 뒤 옛 체크가 남아 있어도 화면이 멈추면 안 된다.
    const res = await app.request("/v1/checklist/progress", {
      method: "PUT",
      headers: AUTH,
      body: JSON.stringify({ checkedItemIds: ["없는항목", "issued_registry"] }),
    });
    expect(res.status).toBe(200);
    const body = await json<{ checklist: { checkedItemIds: string[] } }>(res);
    expect(body.checklist.checkedItemIds).toEqual(["issued_registry"]);
  });

  it("사용자마다 체크 상태가 분리된다", async () => {
    const other = { authorization: "Bearer bob", "content-type": "application/json" };
    const body = await json<{ checklist: { checkedItemIds: string[] } }>(
      await app.request("/v1/checklist/progress", { headers: other }),
    );
    expect(body.checklist.checkedItemIds).toEqual([]);
  });

  it("초기화하면 전부 해제된다", async () => {
    const res = await app.request("/v1/checklist/progress", { method: "DELETE", headers: AUTH });
    expect(res.status).toBe(200);
    expect((await json<{ checklist: { checkedItemIds: string[] } }>(res)).checklist.checkedItemIds).toEqual([]);

    const after = await json<{ checklist: { checkedItemIds: string[] } }>(
      await app.request("/v1/checklist/progress", { headers: AUTH }),
    );
    expect(after.checklist.checkedItemIds).toEqual([]);
  });
});

describe("지역 위험 레이어", () => {
  it("피해주택 더미가 반경 500m 내에서 집계된다", async () => {
    const res = await app.request("/v1/region/risk?lat=36.3504&lng=127.3845", { headers: AUTH });
    expect(res.status).toBe(200);
    const { region } = await json<{
      region: { summary: { victimCaseCount: number; nearestDistanceM: number | null } };
    }>(res);
    expect(region.summary.victimCaseCount).toBeGreaterThan(0);
    expect(region.summary.nearestDistanceM).not.toBeNull();
  });

  it("피해가 없는 좌표는 safe 로 나온다", async () => {
    const res = await app.request("/v1/region/risk?lat=37.5665&lng=126.9780", { headers: AUTH });
    const { region } = await json<{ region: { level: string; summary: { victimCaseCount: number } } }>(
      res,
    );
    expect(region.summary.victimCaseCount).toBe(0);
    expect(region.level).toBe("safe");
  });

  it("히트맵 격자는 개별 주소를 노출하지 않는다", async () => {
    const res = await app.request("/v1/region/grid?lat=36.3504&lng=127.3845&radiusM=3000", {
      headers: AUTH,
    });
    const body = await json<{ cells: { lat: number; lng: number; caseCount: number }[] }>(res);
    expect(body.cells.length).toBeGreaterThan(0);
    // 셀에는 좌표와 건수만 있어야 한다.
    expect(Object.keys(body.cells[0]!).sort()).toEqual(["caseCount", "lat", "lng"]);
  });
});

describe("시나리오별 판정 — 프론트엔드가 모든 등급 화면을 볼 수 있어야 한다", () => {
  let seeded: { scenario: string; verdict: string; score: number; contractable: boolean }[];

  beforeAll(async () => {
    const res = await app.request("/v1/dev/seed", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ reset: true }),
    });
    expect(res.status).toBe(200);
    seeded = (await json<{ cases: typeof seeded }>(res)).cases;
  });

  it("모든 시나리오가 생성되고 분석까지 끝난다", () => {
    expect(seeded).toHaveLength(SCENARIO_KEYS.length);
  });

  it("각 시나리오가 의도한 등급으로 판정된다", () => {
    const mismatches: string[] = [];
    for (const row of seeded) {
      const expected = buildScenario(row.scenario as never, today).expectedVerdict;
      if (row.verdict !== expected) {
        mismatches.push(`${row.scenario}: 기대 ${expected} → 실제 ${row.verdict}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("안전~매우위험 등급이 골고루 나온다", () => {
    const levels = new Set(seeded.map((s) => s.verdict));
    // 프론트엔드가 최소한 주의 · 위험 · 매우위험 화면을 다 볼 수 있어야 한다.
    expect(levels.has("critical")).toBe(true);
    expect(levels.has("danger")).toBe(true);
    expect(levels.has("caution")).toBe(true);
  });

  it("치명적 시나리오는 모두 계약 불가", () => {
    for (const key of ["trust", "auction", "underwater", "owner_mismatch"]) {
      const row = seeded.find((s) => s.scenario === key);
      expect(row?.contractable, key).toBe(false);
    }
  });

  it("초기화하면 검사 건이 사라진다", async () => {
    await app.request("/v1/dev/reset", { method: "POST", headers: AUTH });
    const res = await app.request("/v1/cases", { headers: AUTH });
    expect((await json<{ cases: unknown[] }>(res)).cases).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

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
      draft: {
        parties: {
          role: string;
          businessVerification: { source: string; valid: boolean | null } | null;
        }[];
      };
    }>(res);
    const lessor = body.draft.parties.find((p) => p.role === "임대인");
    // Finding 4 이전에는 looksCorporate(lessorName) 이 false 라 이 분기 자체에
    // 들어가지 않아 businessVerification 이 아예 null 이었다. 지금은 사업자등록번호
    // 유무만으로 결정하므로, 없으면 not_applicable "객체"를 준다(bare null 이 아니다).
    expect(lessor?.businessVerification?.source).toBe("not_applicable");
    expect(lessor?.businessVerification?.valid).toBeNull();
  });

  describe("사업자등록 진위확인 — 사업자등록번호 유무로 결정되는 2분기", () => {
    it("법인 임대인 + 사업자등록번호 미입력 → not_applicable", async () => {
      const created = await app.request("/v1/cases", {
        method: "POST",
        headers: AUTH,
        body: JSON.stringify({
          title: "법인 임대인 (등록번호 없음)",
          leaseType: "jeonse",
          amountUnit: "man",
          deposit: 9000,
          contractDate: "2026-09-10",
          balanceDate: "2026-10-08",
        }),
      });
      const caseId = (await json<{ case: { id: string } }>(created)).case.id;
      await registerCaseWithLessorName(caseId, "(주)가상법인");

      const res = await app.request(`/v1/cases/${caseId}/contract-draft`, { headers: AUTH });
      expect(res.status).toBe(200);
      const body = await json<{
        draft: {
          parties: {
            role: string;
            businessVerification: { source: string; valid: boolean | null } | null;
          }[];
        };
      }>(res);
      const lessor = body.draft.parties.find((p) => p.role === "임대인");
      expect(lessor?.businessVerification?.source).toBe("not_applicable");
      expect(lessor?.businessVerification?.valid).toBeNull();
    });

    it("법인 임대인 + 사업자등록번호 있음 → unavailable (대표자성명·개업일자 필드가 없어 실제 확인 불가)", async () => {
      const created = await app.request("/v1/cases", {
        method: "POST",
        headers: AUTH,
        body: JSON.stringify({
          title: "법인 임대인 (계약일 없음)",
          leaseType: "jeonse",
          amountUnit: "man",
          deposit: 9000,
          businessRegistrationNumber: "123-45-67890",
        }),
      });
      const caseId = (await json<{ case: { id: string } }>(created)).case.id;
      await registerCaseWithLessorName(caseId, "(주)가상법인");

      const res = await app.request(`/v1/cases/${caseId}/contract-draft`, { headers: AUTH });
      expect(res.status).toBe(200);
      const body = await json<{
        draft: { parties: { role: string; businessVerification: { source: string } | null }[] };
      }>(res);
      const lessor = body.draft.parties.find((p) => p.role === "임대인");
      expect(lessor?.businessVerification?.source).toBe("unavailable");
    });

    it("법인 임대인 + 사업자등록번호·계약일 모두 있어도 국세청 API를 실제로는 호출하지 않는다 (Finding 1)", async () => {
      // 예전에는 이 조합(사업자등록번호 + 임대인명 + 계약일)이 모두 있으면 그 값들을
      // verifyBusinessRegistration 에 그대로 흘려 mock 진위확인이 source: "nts", valid: true
      // 를 반환했다. 하지만 계약일은 개업일자(start_dt)가 아니고 임대인명은 대표자성명(p_nm)이
      // 아니므로, 이는 실제 API 앞에서는 명백한 오답을 만드는 위험한 호출이었다(Finding 1).
      // 지금은 사업자등록번호가 있으면 무조건 unavailable 을 반환하고 API를 호출하지 않는다.
      const created = await app.request("/v1/cases", {
        method: "POST",
        headers: AUTH,
        body: JSON.stringify({
          title: "법인 임대인 (진위확인 불가 — 스키마에 대표자성명·개업일자 필드 없음)",
          leaseType: "jeonse",
          amountUnit: "man",
          deposit: 9000,
          businessRegistrationNumber: "123-45-67890",
          contractDate: "2026-09-10",
          balanceDate: "2026-10-08",
        }),
      });
      const caseId = (await json<{ case: { id: string } }>(created)).case.id;
      await registerCaseWithLessorName(caseId, "(주)가상법인");

      const res = await app.request(`/v1/cases/${caseId}/contract-draft`, { headers: AUTH });
      expect(res.status).toBe(200);
      const body = await json<{
        draft: {
          parties: {
            role: string;
            businessVerification: { source: string; valid: boolean | null; status: string | null } | null;
          }[];
        };
      }>(res);
      const lessor = body.draft.parties.find((p) => p.role === "임대인");
      expect(lessor?.businessVerification?.source).toBe("unavailable");
      expect(lessor?.businessVerification?.valid).toBeNull();
      expect(lessor?.businessVerification?.status).toBe("대표자성명·개업일자 정보가 없어 확인할 수 없습니다.");
    });

    it("Finding 4: 법인처럼 보이지 않는 임대인이라도 사업자등록번호가 있으면 unavailable (not null)", async () => {
      // Finding 4 이전 버그: 바깥 게이트가 looksCorporate(lessorName) 였기 때문에,
      // 사업자등록번호를 입력해도 임대인 이름이 법인 명칭 패턴이 아니면(개인 이름 · null 등)
      // 이 분기 자체에 들어가지 못해 businessVerification 이 조용히 null 로 남았다 —
      // 사용자가 준 실제 정보(사업자등록번호)가 아무 신호도 만들지 못하는 버그였다.
      // 지금은 사업자등록번호 유무가 그 자체로 충분한 게이트이므로, 법인처럼 보이지
      // 않는 이름이어도 unavailable 객체를 받아야 한다.
      //
      // /contract-draft 는 RATE_LIMITS.analyze(시간당 10회)를 쓰고 이 파일의 다른
      // 테스트들과 버킷을 공유하므로(같은 "Bearer dev" 사용자), 한도 소진을 피하려고
      // 이 테스트만 별도 토큰(= 별도 사용자)을 쓴다.
      const FINDING4_AUTH = { authorization: "Bearer finding4-noncorp-brn", "content-type": "application/json" };
      const created = await app.request("/v1/cases", {
        method: "POST",
        headers: FINDING4_AUTH,
        body: JSON.stringify({
          title: "개인처럼 보이는 이름 + 사업자등록번호",
          leaseType: "jeonse",
          amountUnit: "man",
          deposit: 9000,
          businessRegistrationNumber: "123-45-67890",
        }),
      });
      const caseId = (await json<{ case: { id: string } }>(created)).case.id;
      // "홍길동"은 CORPORATE_MARKERS 중 어느 것도 포함하지 않으므로 looksCorporate() 는 false.
      await registerCaseWithLessorName(caseId, "홍길동", FINDING4_AUTH);

      const res = await app.request(`/v1/cases/${caseId}/contract-draft`, { headers: FINDING4_AUTH });
      expect(res.status).toBe(200);
      const body = await json<{
        draft: {
          parties: {
            role: string;
            name: string | null;
            businessVerification: { source: string; valid: boolean | null } | null;
          }[];
        };
      }>(res);
      const lessor = body.draft.parties.find((p) => p.role === "임대인");
      expect(lessor?.name).toBe("홍길동");
      expect(lessor?.businessVerification?.source).toBe("unavailable");
      expect(lessor?.businessVerification?.valid).toBeNull();
    });
  });
});

interface JudgmentSnapshot {
  judgments: unknown[];
  calculation: Record<string, number | null>;
}

interface AnalysisShape {
  verdict: {
    verdict: string;
    score: number;
    contractable: boolean;
    headline: string;
    summary: string;
  };
  schedule: {
    evaluable: boolean;
    opposingPowerEffectiveAt: string | null;
    unprotectedWindow: { days: number } | null;
    events: unknown[];
  };
  valuation: {
    evaluable: boolean;
    marketPrice: { estimatedKrw: number };
    simulation: unknown;
  };
  specialTerms: { code: string; clauseText: string }[];
  findings: { code: string; severity: string }[];
  caveats: string[];
}
