/**
 * 브이월드 공동주택가격정보 zip 파일을 받아 집계 JSON 으로 바꾼다.
 *
 *   npm run import:housing-price
 *
 * ## 언제 다시 돌리나
 *
 * 이 데이터는 **반기(6개월)** 마다 갱신된다. 새로 받았을 때만 다시 돌리면 된다.
 *
 * ## 받는 방법 (사람이 직접 — 로그인이 있어야 다운로드가 열린다)
 *
 *   1. https://www.vworld.kr/dtmk/dtmk_ntads_s002.do?dsId=30529 접속 (로그인 필요)
 *   2. 파일명 검색에 "대전" 입력
 *   3. 대전 5개 구(동구·중구·서구·유성구·대덕구) zip 을 전부 다운로드
 *   4. `data/housing-price/` 에 그대로 넣기 (파일명 그대로, 압축 풀 필요 없음)
 *   5. `npm run import:housing-price` 실행
 *   6. 결과물(`data/housing-price/daejeon.json`)만 커밋한다 — 원본 zip 은 커밋하지 않는다
 *
 * ## 왜 대전만인가
 *
 * 이 서비스는 대전 서비스로 시작했다(REGION_THRESHOLDS · classifyRegion 등 다른 코드도
 * 대전 기준이 정확하고 그 외 지역은 보수적 근사다). 전국을 받으면 원본만 수백MB 다.
 * 다른 지역이 필요해지면 같은 방식으로 zip 을 추가하고 이 스크립트를 다시 돌리면 된다.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import AdmZip from "adm-zip";
import iconv from "iconv-lite";
import {
  aggregateHousingPrices,
  parseHousingPriceLine,
  type HousingPriceRow,
} from "../src/domain/housing-price-import.js";

const SOURCE_DIR = resolve(process.cwd(), "data/housing-price");
const OUTPUT_PATH = resolve(SOURCE_DIR, "daejeon.json");

function readZipEntries(zipPath: string): string[] {
  const zip = new AdmZip(zipPath);
  const texts: string[] = [];
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory || !entry.entryName.toUpperCase().endsWith(".TXT")) continue;
    // 원본은 CP949(EUC-KR) 다. UTF-8 로 읽으면 한글이 깨진다.
    texts.push(iconv.decode(entry.getData(), "cp949"));
  }
  return texts;
}

function main(): void {
  let zipFiles: string[];
  try {
    zipFiles = readdirSync(SOURCE_DIR).filter((f) => f.toLowerCase().endsWith(".zip"));
  } catch {
    console.error(`❌ ${SOURCE_DIR} 를 찾을 수 없습니다.`);
    console.error("   위 안내대로 브이월드에서 zip 을 받아 이 폴더에 넣어 주세요.");
    process.exit(1);
  }

  if (zipFiles.length === 0) {
    console.error(`❌ ${SOURCE_DIR} 에 zip 파일이 없습니다.`);
    process.exit(1);
  }

  console.log(`대전 공동주택가격정보 ${zipFiles.length}개 파일을 읽습니다...`);

  const rows: HousingPriceRow[] = [];
  let rawLineCount = 0;
  let skippedCount = 0;

  for (const zipFile of zipFiles) {
    const path = resolve(SOURCE_DIR, zipFile);
    const texts = readZipEntries(path);
    if (texts.length === 0) {
      console.warn(`  ⚠️ ${zipFile} 안에서 .TXT 파일을 찾지 못했습니다. (내부 구조가 바뀌었을 수 있음)`);
      continue;
    }
    for (const text of texts) {
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        if (!line.trim()) continue;
        rawLineCount += 1;
        const row = parseHousingPriceLine(line);
        if (row) rows.push(row);
        else skippedCount += 1;
      }
    }
    console.log(`  ${zipFile} — ${texts.length}개 파일 처리`);
  }

  if (rows.length === 0) {
    console.error("❌ 파싱된 행이 하나도 없습니다. 원본 형식이 바뀌었을 수 있습니다.");
    console.error("   domain/housing-price-import.ts 의 파싱 규칙을 원본 파일과 대조해 보세요.");
    process.exit(1);
  }

  const groups = aggregateHousingPrices(rows);

  writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(
      {
        // 반기 갱신이므로 이 파일이 언제 것인지 남겨 둔다. 판정에 쓸 때 오래됐으면
        // 화면에 "공시가 기준 시점"을 함께 보여줄 수 있게.
        generatedAt: new Date().toISOString(),
        baseYear: "2026", // 원본 파일의 기준연도. 다음 반기 갱신 때 domain 파서가 함께 검증한다.
        groups,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log("");
  console.log(`원본 행 ${rawLineCount}건 (건너뜀 ${skippedCount}건) → 단지 ${groups.length}개로 집계`);
  console.log(`저장: ${OUTPUT_PATH}`);
  console.log("");
  console.log("⚠️ data/housing-price/*.zip 은 커밋하지 마세요. daejeon.json 만 커밋합니다.");
}

main();
