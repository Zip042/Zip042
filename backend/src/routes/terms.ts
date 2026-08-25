import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { todayKst, type DateOnly } from "../lib/date.js";
import { userClient } from "../lib/supabase.js";
import type { AppBindings } from "../middleware/auth.js";
import {
  SPECIAL_TERM_LIBRARY,
  recommendSpecialTerms,
  type TermContext,
} from "../domain/special-terms.js";
import { getCase } from "../services/case.service.js";
import { getLatestAnalysis } from "../services/analysis.service.js";
import { fetchLawArticle } from "../services/lawinfo.service.js";
import { assertOwnership } from "./cases.js";

const caseParam = z.object({ caseId: z.string().uuid() });

export const termsRoute = new Hono<AppBindings>();

/**
 * 특약 전체 목록 (카탈로그) — 로그인 없이 볼 수 있는 공개 라우터.
 * 프론트엔드가 "이런 특약도 있어요" 화면을 만들 때 쓴다. 계약 정보가 없으므로
 * 문구의 날짜·금액 자리에는 안내용 문구가 들어간다.
 */
export const termsCatalogRoute = new Hono();

termsCatalogRoute.get("/special-terms/catalog", (c) => {
  const ctx: TermContext = { depositKrw: 0 };
  const items = Object.values(SPECIAL_TERM_LIBRARY)
    .sort((a, b) => a.priority - b.priority)
    .map((def) => ({
      code: def.code,
      category: def.category,
      title: def.title,
      priority: def.priority,
      required: def.required,
      baseline: def.baseline ?? false,
      reason: def.reason,
      clauseTemplate: def.clause(ctx),
      legalBasis: def.legalBasis ?? [],
    }));

  return c.json({
    specialTerms: items,
    categories: [...new Set(items.map((i) => i.category))],
    disclaimer:
      "특약 문구는 참고용 예시입니다. 법률 자문이 아니며, 개별 사안에 따라 효력이 달라질 수 있습니다.",
  });
});

/**
 * 특정 case 의 추천 특약.
 *
 * 분석이 이미 돌았으면 저장된 결과를 그대로 돌려준다(같은 판정에 같은 특약).
 * 아직 분석 전이면 계약 조건만으로 기본 특약을 계산해 미리 보여준다.
 */
termsRoute.get("/cases/:caseId/special-terms", zValidator("param", caseParam), async (c) => {
  const { caseId } = c.req.valid("param");
  await assertOwnership(c.get("accessToken"), caseId);
  const db = userClient(c.get("accessToken"));

  const analysis = await getLatestAnalysis(db, caseId);
  if (analysis && analysis.specialTerms.length > 0) {
    return c.json({
      specialTerms: analysis.specialTerms,
      source: "analysis",
      analysisVersion: analysis.version,
      disclaimer:
        "특약 문구는 참고용 예시입니다. 법률 자문이 아니며, 개별 사안에 따라 효력이 달라질 수 있습니다.",
    });
  }

  const row = await getCase(db, caseId);
  const protectionDate = row.resident_registration_date ?? row.balance_date;
  const terms = recommendSpecialTerms(new Map(), {
    depositKrw: row.deposit_krw,
    contractDate: row.contract_date as DateOnly | null,
    balanceDate: row.balance_date as DateOnly | null,
    residentRegistrationDate: row.resident_registration_date as DateOnly | null,
    protectionDate: protectionDate as DateOnly | null,
    address: row.road_address,
    detailAddress: row.detail_address,
    maintenanceFeeKrw: row.maintenance_fee_krw,
  });

  return c.json({
    specialTerms: terms,
    source: "baseline",
    hint: "분석(POST /v1/cases/{caseId}/analyze)을 실행하면 이 집의 위험에 맞춘 특약이 추가됩니다.",
    generatedAt: todayKst(),
    disclaimer:
      "특약 문구는 참고용 예시입니다. 법률 자문이 아니며, 개별 사안에 따라 효력이 달라질 수 있습니다.",
  });
});

/**
 * 선택한 특약을 계약서에 붙일 수 있는 텍스트 블록으로 만들어 준다.
 * 프론트엔드에서 "복사하기" 버튼 하나로 처리할 수 있게 서버가 조립한다.
 */
termsRoute.post(
  "/cases/:caseId/special-terms/compose",
  zValidator("param", caseParam),
  zValidator("json", z.object({ codes: z.array(z.string()).min(1).max(30) })),
  async (c) => {
    const { caseId } = c.req.valid("param");
    const { codes } = c.req.valid("json");
    await assertOwnership(c.get("accessToken"), caseId);
    const row = await getCase(userClient(c.get("accessToken")), caseId);

    const ctx: TermContext = {
      depositKrw: row.deposit_krw,
      contractDate: row.contract_date as DateOnly | null,
      balanceDate: row.balance_date as DateOnly | null,
      residentRegistrationDate: row.resident_registration_date as DateOnly | null,
      protectionDate: (row.resident_registration_date ?? row.balance_date) as DateOnly | null,
      address: row.road_address,
      detailAddress: row.detail_address,
      maintenanceFeeKrw: row.maintenance_fee_krw,
    };

    const selected = codes
      .map((code) => SPECIAL_TERM_LIBRARY[code])
      .filter((d): d is NonNullable<typeof d> => Boolean(d))
      .sort((a, b) => a.priority - b.priority);

    const unknown = codes.filter((code) => !SPECIAL_TERM_LIBRARY[code]);

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

    const text = selected
      .map((def, i) => `${i + 1}. ${def.clause(ctx)}`)
      .join("\n\n");

    return c.json({
      composed: text,
      includedCodes: selected.map((d) => d.code),
      unknownCodes: unknown,
      legalBasis,
      disclaimer:
        "계약서 특약사항란에 옮겨 적고 임대인·임차인 양쪽이 서명해야 효력이 있습니다. 법률 자문이 아닙니다.",
    });
  },
);
