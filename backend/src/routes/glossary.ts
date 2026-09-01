import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  FRAUD_CASES,
  GLOSSARY_CATEGORIES,
  RELIEF_STEPS,
  findTermsByFinding,
  searchGlossary,
} from "../domain/glossary.js";
import { notFound } from "../lib/errors.js";

/**
 * 용어사전 · 사기 수법 · 피해 대응 절차 (프론트엔드 `/glossary`).
 *
 * 전부 **로그인 없이** 볼 수 있다. 특약 카탈로그·체크리스트 목록과 같은 이유다 —
 * 계약 전에 알아야 할 정보에 가입을 요구하면 정작 필요한 사람이 못 본다.
 *
 * 검색은 서버에서 한다. 프론트엔드가 전체 목록을 받아 필터링해도 되지만,
 * 정렬 규칙("근저당"을 치면 `근저당권`이 맨 위)이 화면마다 달라지면 안 되기 때문이다.
 */

export const glossaryRoute = new Hono();

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.enum(GLOSSARY_CATEGORIES).optional(),
});

glossaryRoute.get("/glossary", zValidator("query", listQuery), (c) => {
  const { q, category } = c.req.valid("query");
  const terms = searchGlossary({ query: q ?? null, category: category ?? null });

  return c.json({
    terms,
    categories: GLOSSARY_CATEGORIES,
    query: q ?? null,
    category: category ?? null,
    total: terms.length,
  });
});

/** 사기 수법. 용어사전 화면 우측 "실제 사기 사례" 카드가 쓴다. */
glossaryRoute.get("/glossary/fraud-cases", (c) => c.json({ fraudCases: FRAUD_CASES }));

/**
 * 피해 대응 절차. "피해를 당했다면" 카드 → "대응 절차 보기".
 * 순서가 중요하므로 배열 순서를 그대로 유지해 내려준다.
 */
glossaryRoute.get("/glossary/relief-steps", (c) =>
  c.json({
    reliefSteps: RELIEF_STEPS,
    disclaimer:
      "일반적인 절차 안내이며 법률 자문이 아닙니다. 실제 대응은 전세피해지원센터나 변호사와 상담하세요.",
  }),
);

/**
 * 판정 항목 코드로 용어를 찾는다.
 * 결과 화면에서 "이게 무슨 말이죠?"를 눌렀을 때 쓴다.
 */
glossaryRoute.get(
  "/glossary/by-finding/:code",
  zValidator("param", z.object({ code: z.string().min(3).max(64) })),
  (c) => {
    const { code } = c.req.valid("param");
    const terms = findTermsByFinding(code);
    if (terms.length === 0) {
      throw notFound("이 판정 항목에 연결된 용어가 없습니다.");
    }
    return c.json({ findingCode: code, terms });
  },
);
