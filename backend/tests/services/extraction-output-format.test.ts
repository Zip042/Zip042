import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { zodOutputFormat } from "../../src/services/extraction.service.js";
import {
  brokerageStatementExtractionSchema,
  leaseDraftExtractionSchema,
  registryExtractionSchema,
} from "../../src/schemas/extraction.js";

/**
 * 판독 요청의 `output_format` 을 만드는 경로를 **API 키 없이** 지킨다.
 *
 * 왜 이 테스트가 있는가: SDK 의 `betaZodOutputFormat` 이 내부에서 zod 4 API
 * (`z.toJSONSchema`)를 부르는데 이 저장소는 zod 3 이라, 호출 즉시
 * `z.toJSONSchema is not a function` 으로 판독 경로 전체가 죽어 있었다.
 * SDK 의 peer 범위가 `^3.25.0 || ^4.0.0` 이라 설치는 조용히 성공했고,
 * 키가 없어 실제 호출을 못 해 본 동안 아무도 몰랐다.
 *
 * 이 테스트는 그 조합이 다시 깨지면 **키 없이 CI 에서** 잡는다.
 */
describe("판독 output_format 생성", () => {
  // 세 스키마의 필드가 서로 다르므로 `as const` 로 두면 TS 가 합집합 타입으로 추론해
  // zodOutputFormat<T> 의 인자와 맞지 않는다. 여기서 확인하려는 것은 "어떤 스키마를
  // 넣어도 output_format 이 만들어지는가"이므로 unknown 으로 넓혀서 받는다.
  const cases: [string, ZodType<unknown>][] = [
    ["registry", registryExtractionSchema],
    ["brokerage_statement", brokerageStatementExtractionSchema],
    ["lease_draft", leaseDraftExtractionSchema],
  ];

  for (const [name, schema] of cases) {
    describe(name, () => {
      it("예외 없이 json_schema 형태를 만든다", () => {
        const format = zodOutputFormat(schema, `${name}_extraction`);
        expect(format.type).toBe("json_schema");
        expect(format.schema).toBeTypeOf("object");
      });

      it("Anthropic 이 요구하는 형태로 좁혀진다", () => {
        const { schema: json } = zodOutputFormat(schema, `${name}_extraction`) as {
          schema: Record<string, unknown>;
        };
        expect(json.type).toBe("object");
        // structured outputs 는 추가 필드를 허용하지 않는다.
        expect(json.additionalProperties).toBe(false);
        expect(Object.keys(json.properties as object).length).toBeGreaterThan(0);
        // 참조를 인라인했으므로 남아 있으면 안 된다.
        expect(json.$ref).toBeUndefined();
        expect(json.$schema).toBeUndefined();
      });

      it("parse 가 스키마 검증을 실제로 수행한다", () => {
        const format = zodOutputFormat(schema, `${name}_extraction`);
        // 필수 필드가 빠진 응답은 통과하면 안 된다 — 모델이 지어낸 형태를 그대로 받으면
        // 판정 단계에서 조용히 잘못된 값이 흐른다.
        expect(() => format.parse("{}")).toThrow();
      });
    });
  }

  it("등기부 스키마에 위험 판단 필드가 없다 (설계 원칙 1)", () => {
    const { schema: json } = zodOutputFormat(
      registryExtractionSchema,
      "registry_extraction",
    ) as unknown as { schema: { properties: Record<string, unknown> } };
    const keys = Object.keys(json.properties).join(" ").toLowerCase();
    for (const banned of ["risk", "danger", "safe", "score", "verdict"]) {
      expect(keys).not.toContain(banned);
    }
  });
});
