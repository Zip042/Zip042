import type { ZodType } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { loadEnv } from "../../env.js";
import { badRequest, internal, upstreamFailed } from "../../lib/errors.js";
import { log } from "../../lib/logger.js";

/**
 * Google Gemini 판독 어댑터.
 *
 * Anthropic 경로(`extraction.service.ts`)와 **같은 계약**을 지킨다 —
 * PDF 를 그대로 넣고, 스키마를 강제하고, 파싱된 객체를 돌려준다.
 * 그래야 규칙 엔진이 어느 모델을 썼는지 몰라도 된다.
 *
 * ## 스키마 강제
 *
 * Gemini 는 `responseMimeType: "application/json"` + `responseSchema` 로 구조화 출력을
 * 강제한다. Anthropic 의 `messages.parse` 와 목적이 같다. **"JSON 으로 답해줘"라고
 * 부탁하지 않는다** — 열 번에 아홉 번 맞고 한 번 깨지는데, 그 한 번이 사용자에게 간다.
 *
 * ## Gemini 의 스키마 제약
 *
 * OpenAPI 3.0 subset 만 받는다. zod-to-json-schema 가 내는 것 중 다음이 거부된다.
 *   · `$schema` · `definitions` · `$ref`   → `$refStrategy: "none"` 으로 인라인
 *   · `additionalProperties`               → 제거
 *   · `nullable` 대신 `type: [...]` 배열   → Gemini 는 `nullable: true` 를 쓴다
 * `sanitizeSchema()` 가 이 변환을 한다.
 *
 * 문서: https://ai.google.dev/gemini-api/docs/structured-output
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const TIMEOUT_MS = 120_000;

/** PDF 와 이미지를 그대로 받는다. Anthropic 경로와 같은 목록을 지원해야 한다. */
const SUPPORTED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/**
 * zod 가 만든 JSON Schema 를 Gemini 가 받아들이는 형태로 좁힌다.
 *
 * 재귀적으로 훑으며 지원하지 않는 키워드를 제거하고, `type: ["string","null"]` 같은
 * 유니온을 `type: "string", nullable: true` 로 바꾼다.
 */
export function sanitizeSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeSchema);
  if (schema === null || typeof schema !== "object") return schema;

  const src = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(src)) {
    // Gemini 가 거부하는 키워드.
    if (["$schema", "definitions", "$ref", "additionalProperties", "default"].includes(key)) {
      continue;
    }

    if (key === "type" && Array.isArray(value)) {
      // ["string", "null"] → type: "string" + nullable: true
      const types = value.filter((t) => t !== "null");
      if (value.includes("null")) out.nullable = true;
      out.type = types.length === 1 ? types[0] : (types[0] ?? "string");
      continue;
    }

    out[key] = sanitizeSchema(value);
  }
  return out;
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
}

export interface GeminiParseArgs<T> {
  systemPrompt: string;
  userPrompt: string;
  fileBuffer: Buffer;
  mimeType: string;
  schema: ZodType<T>;
  schemaName: string;
}

export interface GeminiParseResult<T> {
  parsed: T;
  model: string;
  usage: { inputTokens: number; outputTokens: number } | null;
}

export function isGeminiAvailable(): boolean {
  return Boolean(loadEnv().GEMINI_API_KEY);
}

/**
 * PDF·이미지를 Gemini 에 넣고 스키마에 맞는 객체를 받는다.
 *
 * 오류는 전부 사용자에게 그대로 보여줄 수 있는 한국어 `AppError` 로 바꾼다 —
 * 화면이 문구를 다시 쓰지 않아도 되게.
 */
export async function geminiParse<T>({
  systemPrompt,
  userPrompt,
  fileBuffer,
  mimeType,
  schema,
  schemaName,
}: GeminiParseArgs<T>): Promise<GeminiParseResult<T>> {
  const env = loadEnv();
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw internal("Gemini API 키가 설정되지 않았습니다.");

  if (!SUPPORTED_MIME.has(mimeType)) {
    throw badRequest("문서 형식을 처리할 수 없습니다. PDF 또는 이미지 파일인지 확인해 주세요.");
  }

  const jsonSchema = zodToJsonSchema(schema, { name: schemaName, $refStrategy: "none" }) as
    Record<string, unknown>;
  const definitions = jsonSchema.definitions as Record<string, unknown> | undefined;
  const body = sanitizeSchema(definitions?.[schemaName] ?? jsonSchema);

  const parts: GeminiPart[] = [
    // 문서를 먼저, 지시를 나중에. 순서를 뒤집으면 인식률이 떨어진다.
    { inlineData: { mimeType, data: fileBuffer.toString("base64") } },
    { text: userPrompt },
  ];

  const url = `${API_BASE}/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`;

  let res: Response;
  let raw: string;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          // 판독은 창의성이 필요 없다. 같은 문서에 같은 결과가 나와야 한다.
          temperature: 0,
          maxOutputTokens: 16_000,
          responseMimeType: "application/json",
          responseSchema: body,
        },
      }),
    });
    raw = await res.text();
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw upstreamFailed("문서 분석이 시간 안에 끝나지 않았습니다. 페이지 수를 줄여 다시 시도해 주세요.");
    }
    throw upstreamFailed("문서 분석 서버에 연결하지 못했습니다.");
  }

  if (res.status === 401 || res.status === 403) {
    throw internal("문서 분석 서비스 인증에 실패했습니다. 서버 설정을 확인해 주세요.");
  }
  if (res.status === 429) {
    throw upstreamFailed("분석 요청이 많아 잠시 대기가 필요합니다. 1~2분 후 다시 시도해 주세요.");
  }

  let parsedBody: GeminiResponse;
  try {
    parsedBody = JSON.parse(raw) as GeminiResponse;
  } catch {
    throw upstreamFailed("문서 분석 응답을 해석하지 못했습니다.");
  }

  if (!res.ok) {
    log.error("gemini error", { status: res.status, message: parsedBody.error?.message });
    throw upstreamFailed(`문서 분석에 실패했습니다. (${res.status})`);
  }

  // 안전 필터에 걸린 경우.
  if (parsedBody.promptFeedback?.blockReason) {
    log.warn("gemini blocked", { reason: parsedBody.promptFeedback.blockReason });
    throw upstreamFailed(
      "문서 분석이 거부되었습니다. 개인정보가 과도하게 포함되지 않았는지 확인하고 다시 시도해 주세요.",
    );
  }

  const candidate = parsedBody.candidates?.[0];
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw upstreamFailed("문서가 너무 길어 분석을 끝내지 못했습니다. 필요한 페이지만 남겨 다시 올려주세요.");
  }

  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) {
    throw upstreamFailed("문서에서 구조화된 정보를 얻지 못했습니다. 더 선명한 파일로 다시 시도해 주세요.");
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw upstreamFailed("문서 분석 결과가 올바른 형식이 아닙니다. 다시 시도해 주세요.");
  }

  // 스키마를 강제했더라도 **서버에서 한 번 더 검증**한다.
  // 모델이 형식을 지켰다는 보장은 모델이 하는 말일 뿐이다.
  const result = schema.safeParse(json);
  if (!result.success) {
    log.warn("gemini schema mismatch", {
      issues: result.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
    });
    throw upstreamFailed("문서 분석 결과가 예상한 형식과 달랐습니다. 다시 시도해 주세요.");
  }

  return {
    parsed: result.data,
    model: env.GEMINI_MODEL,
    usage: parsedBody.usageMetadata
      ? {
          inputTokens: parsedBody.usageMetadata.promptTokenCount ?? 0,
          outputTokens: parsedBody.usageMetadata.candidatesTokenCount ?? 0,
        }
      : null,
  };
}
