/**
 * OpenAPI 문서를 파일로 내보낸다.
 *
 *   npm run openapi                       → openapi.json
 *   npm run openapi -- --out ../frontend/openapi.json
 *
 * 프론트엔드 저장소에서 타입 클라이언트를 만들 때 씁니다:
 *   npx openapi-typescript openapi.json -o src/lib/api.d.ts
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// 문서 생성에는 Supabase 설정이 필요 없다. 목 모드로 두어 env 검증을 통과시킨다.
process.env.ZIP042_MODE ??= "mock";

const { buildOpenApiDocument } = await import("../src/openapi.js");

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outPath = resolve(outIndex >= 0 ? (args[outIndex + 1] ?? "openapi.json") : "openapi.json");
const serverIndex = args.indexOf("--server");
const serverUrl = serverIndex >= 0 ? args[serverIndex + 1] : undefined;

const doc = buildOpenApiDocument(serverUrl);
writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");

const paths = Object.keys(doc.paths as Record<string, unknown>);
const operations = paths.reduce(
  (sum, p) => sum + Object.keys((doc.paths as Record<string, object>)[p]!).length,
  0,
);
console.log(`OpenAPI 문서를 내보냈습니다: ${outPath}`);
console.log(`  경로 ${paths.length}개 / 오퍼레이션 ${operations}개`);
