import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppBindings } from "../middleware/auth.js";
import { searchAddress } from "../services/address.service.js";

export const addressRoute = new Hono<AppBindings>();

/**
 * 주소 검색.
 *
 * 프론트엔드는 **반드시 이 엔드포인트로 주소를 골라야** 합니다. 사용자가 타이핑한 주소를
 * 그대로 검사 건에 넣으면 좌표와 법정동코드가 비어, 지역 위험과 시세 조회가 둘 다 실패합니다.
 */
addressRoute.get(
  "/addresses/search",
  zValidator(
    "query",
    z.object({
      q: z.string().trim().min(2, "검색어를 2자 이상 입력해 주세요.").max(100),
      limit: z.coerce.number().int().min(1).max(30).default(10),
    }),
  ),
  async (c) => {
    const { q, limit } = c.req.valid("query");
    const outcome = await searchAddress(q, limit);
    return c.json({
      results: outcome.results,
      provider: outcome.provider,
      isMockData: outcome.isMockData,
      hint: outcome.isMockData
        ? "개발용 목 데이터입니다. 실제 주소 검색은 카카오/VWorld 키 연동 후 동작합니다."
        : undefined,
      usage:
        "검사 건 생성 시 결과의 lat · lng · regionCode · sigungu 를 그대로 넘기세요. " +
        "이 값이 없으면 지역 위험과 시세 조회를 할 수 없습니다.",
    });
  },
);
