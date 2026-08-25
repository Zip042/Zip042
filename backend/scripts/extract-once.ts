/**
 * 로컬 파일 하나를 AI 판독기에 그대로 통과시켜 결과 JSON 을 출력한다.
 *
 *   npm run extract -- ./등기부.pdf registry
 *   npm run extract -- ./확인설명서.jpg brokerage_statement --out result.json
 *   npm run extract -- ./계약서.pdf lease_draft --effort medium
 *
 * ## 왜 이 스크립트가 있는가
 *
 * 판독 정확도를 확인하려면 원래는 Supabase 세팅 → 검사 건 생성 → 서명 업로드 →
 * 문서 등록 → 분석 실행을 전부 통과해야 한다. 프롬프트를 한 줄 고칠 때마다 그걸
 * 반복하면 튜닝이 사실상 불가능하다.
 *
 * 이 스크립트는 **DB · Storage · 인증을 모두 건너뛰고** extraction.service 만 직접
 * 호출한다. 필요한 것은 ANTHROPIC_API_KEY 와 파일 하나뿐이다.
 *
 * ## 판독 결과를 볼 때 확인할 것 (CLAUDE.md "키가 생기면 할 일" 3번)
 *
 *  - 말소선이 그어진 권리가 `isCancelled: true` 로 나오는지 (가장 자주 틀린다)
 *  - 근저당권의 `maxClaimKrw` 가 **채권최고액**인지 (채권액을 읽으면 위험을 과소평가한다)
 *  - 신탁 기재를 `isTrustProperty` 로 잡는지
 *  - 읽지 못한 값이 null 인지, 아니면 그럴듯한 값으로 채워졌는지 ← 채워지면 프롬프트 실패
 *
 * ⚠️ 실제 등기부에는 개인정보가 들어 있다. `--out` 으로 저장한 결과 파일을 저장소에
 *    커밋하지 말 것 (.gitignore 의 secrets/ 아래에 두거나 저장 후 삭제).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { loadDotEnv } from "../src/lib/dotenv.js";

loadDotEnv();

// live 모드로 강제한다. 목 모드면 픅스처가 돌아와서 판독 확인 자체가 무의미하다.
// (SUPABASE_URL 이 없어도 이 스크립트는 DB 를 쓰지 않으므로 상관없다.)
process.env.ZIP042_MODE = "live";
// live 모드 env 검증은 Supabase 3종을 요구한다. DB 를 쓰지 않으므로 더미로 통과시킨다.
process.env.SUPABASE_URL ??= "https://extract-once.invalid";
process.env.SUPABASE_ANON_KEY ??= "x".repeat(20);
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "x".repeat(20);

const DOC_TYPES = ["registry", "brokerage_statement", "lease_draft"] as const;
type DocType = (typeof DOC_TYPES)[number];

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function usage(message?: string): never {
  if (message) console.error(`\n오류: ${message}`);
  console.error(`
사용법: npm run extract -- <파일경로> <문서종류> [옵션]

  문서종류  ${DOC_TYPES.join(" | ")}

  옵션
    --out <경로>     결과 JSON 을 파일로 저장 (기본: 화면 출력만)
    --effort <값>    추론 강도 low|medium|high (기본: 환경변수 ANTHROPIC_EFFORT 또는 high)

  지원 형식  ${Object.keys(MIME_BY_EXT).join(" ")}
  필요한 값  ANTHROPIC_API_KEY (.env 또는 환경변수)
`);
  process.exit(message ? 1 : 0);
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) usage();

function optionValue(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const positional = args.filter((a, i) => {
  if (a.startsWith("--")) return false;
  // 옵션의 값 자리는 위치 인자가 아니다.
  return !(i > 0 && ["--out", "--effort"].includes(args[i - 1]!));
});

const [filePathArg, docTypeArg] = positional;
if (!filePathArg) usage("파일 경로가 없습니다.");
if (!docTypeArg) usage("문서 종류가 없습니다.");
if (!DOC_TYPES.includes(docTypeArg as DocType)) {
  usage(`문서 종류가 올바르지 않습니다: ${docTypeArg}`);
}

const docType = docTypeArg as DocType;
const filePath = resolve(filePathArg);
const ext = extname(filePath).toLowerCase();
const mimeType = MIME_BY_EXT[ext];
if (!mimeType) usage(`지원하지 않는 형식입니다: ${ext || "(확장자 없음)"}`);

const effort = optionValue("--effort");
if (effort) {
  if (!["low", "medium", "high"].includes(effort)) usage(`--effort 값이 올바르지 않습니다: ${effort}`);
  process.env.ANTHROPIC_EFFORT = effort;
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(`
오류: ANTHROPIC_API_KEY 가 없습니다.

  PowerShell:  $env:ANTHROPIC_API_KEY = "sk-ant-..."
  bash:        export ANTHROPIC_API_KEY=sk-ant-...

  또는 프로젝트 루트의 .env 에 넣고 실행하세요.
`);
  process.exit(1);
}

let fileBuffer: Buffer;
try {
  fileBuffer = readFileSync(filePath);
} catch (err) {
  console.error(`파일을 읽지 못했습니다: ${filePath}`);
  console.error(`  ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

// env 검증 후에 import 한다 (모듈 로드 시점에 loadEnv 가 캐시되는 것을 막기 위해).
const { extractBrokerageStatement, extractLeaseDraft, extractRegistry } = await import(
  "../src/services/extraction.service.js"
);
const { loadEnv } = await import("../src/env.js");

const sizeMb = (fileBuffer.byteLength / 1024 / 1024).toFixed(2);
console.error(`판독 시작 — ${basename(filePath)} (${sizeMb}MB, ${mimeType})`);
console.error(`  문서종류 ${docType} / 모델 ${loadEnv().ANTHROPIC_MODEL} / 강도 ${loadEnv().ANTHROPIC_EFFORT}`);
console.error("  실제 문서는 20~60초 걸립니다...\n");

const startedAt = Date.now();

try {
  const result =
    docType === "registry"
      ? await extractRegistry(fileBuffer, mimeType)
      : docType === "brokerage_statement"
        ? await extractBrokerageStatement(fileBuffer, mimeType)
        : await extractLeaseDraft(fileBuffer, mimeType);

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  const json = JSON.stringify(result.payload, null, 2);

  // 결과는 stdout, 진행 상황은 stderr — `npm run extract -- ... > out.json` 이 되게.
  console.log(json);

  console.error(`\n${"─".repeat(60)}`);
  console.error(`소요 ${elapsedSec}초 / 모델 ${result.model}`);
  console.error(`판독 신뢰도 ${result.confidence} (모델 자기보고 — 정확도 보장이 아니다)`);
  if (result.usage) {
    console.error(`토큰 입력 ${result.usage.inputTokens} / 출력 ${result.usage.outputTokens}`);
  }

  // 판독 실패의 가장 중요한 신호를 눈에 띄게 요약한다.
  const payload = result.payload as { unreadableSections?: string[] };
  const unreadable = payload.unreadableSections ?? [];
  if (unreadable.length > 0) {
    console.error(`\n읽지 못한 부분 ${unreadable.length}건:`);
    for (const s of unreadable) console.error(`  · ${s}`);
  } else {
    console.error("\n읽지 못한 부분: 없음");
  }

  if (docType === "registry") {
    const registry = result.payload as {
      rights: { type: string; isCancelled: boolean; maxClaimKrw: number | null }[];
      isTrustProperty: boolean;
      ownerNames: string[];
    };
    const cancelled = registry.rights.filter((r) => r.isCancelled).length;
    const mortgages = registry.rights.filter((r) => r.type === "mortgage" && !r.isCancelled);
    const totalMaxClaim = mortgages.reduce((sum, r) => sum + (r.maxClaimKrw ?? 0), 0);
    console.error(`\n등기부 요약 (직접 대조할 값)`);
    console.error(`  권리 ${registry.rights.length}건 (말소 ${cancelled}건)`);
    console.error(`  유효 근저당 ${mortgages.length}건 / 채권최고액 합계 ${totalMaxClaim.toLocaleString("ko-KR")}원`);
    console.error(`  소유자 ${registry.ownerNames.length}명 / 신탁 ${registry.isTrustProperty ? "있음" : "없음"}`);
    if (mortgages.some((r) => r.maxClaimKrw === null)) {
      console.error(`  ⚠️ 채권최고액을 읽지 못한 근저당이 있습니다 — 프롬프트 확인 필요`);
    }
  }

  const outPath = optionValue("--out");
  if (outPath) {
    writeFileSync(resolve(outPath), `${json}\n`, "utf8");
    console.error(`\n결과를 저장했습니다: ${resolve(outPath)}`);
    console.error(`  ⚠️ 개인정보가 들어 있습니다. 커밋하지 말고 확인 후 삭제하세요.`);
  }
} catch (err) {
  console.error(`\n판독 실패 (${((Date.now() - startedAt) / 1000).toFixed(1)}초)`);
  if (err instanceof Error) {
    console.error(`  ${err.message}`);
    // AppError 의 detail 에 원인이 담겨 있을 수 있다.
    const detail = (err as { detail?: unknown }).detail;
    if (detail !== undefined) console.error(`  detail: ${JSON.stringify(detail)}`);
  } else {
    console.error(`  ${String(err)}`);
  }
  process.exit(1);
}
