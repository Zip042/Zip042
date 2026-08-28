/**
 * 키가 도착한 직후 "무엇이 살아있고 무엇이 죽었는지"를 한 번에 확인한다.
 *
 *   npm run preflight
 *   npm run preflight -- --only anthropic,molit
 *
 * ## 왜 이 스크립트가 있는가
 *
 * `/v1/meta` 의 capabilities 는 **키가 설정되어 있는지**만 본다. 키가 오타거나
 * 승인 대기 중이거나 오퍼레이션 경로가 틀린 경우는 잡지 못한다. 특히 공공데이터포털은
 * 키 오류를 **HTTP 200 + 에러 XML** 로 돌려주므로, 실제로 한 번 호출해 보는 것 말고는
 * 확인할 방법이 없다.
 *
 * 각 검사는 **실제 외부 호출 1회**를 하고, 실패하면 원인과 다음 조치를 함께 출력한다.
 * 서로 독립이므로 하나가 죽어도 나머지는 계속 검사한다.
 *
 * 비용: Anthropic 검사만 과금된다 (아주 짧은 호출 1회). 나머지는 무료 API 다.
 *
 * ## CLAUDE.md "키가 생기면 할 일" 과의 대응
 *
 *   1. Supabase           → supabase 검사
 *   2. 공휴일 동기화       → kasi 검사 (이후 POST /v1/admin/holidays/sync 1회 필수)
 *   3. AI 판독            → anthropic 검사 (정확도는 `npm run extract` 로 별도 확인)
 *   4. 실거래가           → molit 검사 ← ENDPOINTS 오퍼레이션명이 맞는지가 관건
 *   5. 주소 검색          → address 검사
 */
import { loadDotEnv } from "../src/lib/dotenv.js";

const dotenv = loadDotEnv();

const { loadEnv } = await import("../src/env.js");
type Env = import("../src/env.js").Env;

// 이 스크립트는 실행 모드를 강제하지 않는다. 목 모드로 돌리면 "키 없음"만 확인되므로
// live 모드 설정 그대로 검사하는 것이 목적이다. 다만 Supabase 가 아직 없는 단계에서도
// 나머지 키를 검사할 수 있어야 하므로, env 검증이 실패하면 그 사실을 알리고 계속 간다.

type Verdict = "ok" | "skip" | "fail";

interface CheckResult {
  verdict: Verdict;
  /** 한 줄 요약. 성공이면 실제로 받은 값을 보여준다 (설정만 확인한 게 아님을 증명). */
  summary: string;
  /** 실패 시 다음에 할 일. */
  nextStep?: string;
}

interface Check {
  key: string;
  label: string;
  run: (env: Env | null) => Promise<CheckResult>;
}

const TIMEOUT_MS = 15_000;

function ok(summary: string): CheckResult {
  return { verdict: "ok", summary };
}
function skip(summary: string, nextStep?: string): CheckResult {
  return { verdict: "skip", summary, nextStep };
}
function fail(summary: string, nextStep?: string): CheckResult {
  return { verdict: "fail", summary, nextStep };
}

function reason(err: unknown): string {
  if (err instanceof Error) {
    // AbortSignal.timeout 은 TimeoutError 를 던진다.
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return `응답 없음 (${TIMEOUT_MS / 1000}초 초과)`;
    }
    return err.message;
  }
  return String(err);
}

/** XML/JSON 어느 쪽으로 와도 태그 값을 하나 꺼낸다. */
function tagValue(body: string, names: string[]): string | null {
  for (const name of names) {
    const xml = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(body);
    if (xml?.[1]) return xml[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, "$1").trim();
    const json = new RegExp(`"${name}"\\s*:\\s*"?([^",}]+)"?`).exec(body);
    if (json?.[1]) return json[1].trim();
  }
  return null;
}

// ---------------------------------------------------------------------------
// 검사 항목
// ---------------------------------------------------------------------------

const checks: Check[] = [
  {
    key: "supabase",
    label: "Supabase (DB · Storage · Auth)",
    async run(env) {
      if (!env) return skip("env 검증 실패로 확인 불가");
      if (env.mode === "mock") {
        return skip("목 모드 — SUPABASE_URL 이 없습니다", "Supabase 프로젝트를 만들고 .env 를 채우세요.");
      }

      const { adminClient } = await import("../src/lib/supabase.js");
      const admin = adminClient();

      // 참조 테이블을 한 건 읽는다. 마이그레이션이 적용됐는지까지 함께 확인된다.
      const { error } = await admin.from("small_lessee_thresholds").select("id").limit(1);
      if (error) {
        // 42P01 = 테이블 없음 → 연결은 됐지만 마이그레이션이 안 됐다.
        if (error.code === "42P01") {
          return fail("연결됨 · 테이블 없음", "supabase db push 로 마이그레이션을 적용하세요.");
        }
        return fail(`쿼리 실패 — ${error.message}`, "SUPABASE_SERVICE_ROLE_KEY 를 확인하세요.");
      }

      // Storage 버킷 존재 확인. 없으면 업로드가 등록 단계까지 통과한 뒤 실패한다.
      const { data: buckets, error: bucketErr } = await admin.storage.listBuckets();
      if (bucketErr) {
        return fail(`DB 정상 · Storage 조회 실패 — ${bucketErr.message}`);
      }
      const wanted = env.SUPABASE_STORAGE_BUCKET;
      const found = (buckets ?? []).some((b) => b.name === wanted);
      if (!found) {
        return fail(
          `DB 정상 · 버킷 "${wanted}" 없음`,
          `Supabase 대시보드 Storage 에서 "${wanted}" 버킷을 만드세요 (public 아님).`,
        );
      }

      return ok(`DB 정상 · 버킷 "${wanted}" 확인`);
    },
  },

  {
    key: "anthropic",
    label: "Anthropic (문서 판독)",
    async run(env) {
      const apiKey = env?.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return skip("ANTHROPIC_API_KEY 없음", "판독 없이는 위험 판정을 낼 수 없습니다. 최우선 발급 대상.");
      }

      const model = env?.ANTHROPIC_MODEL ?? "claude-opus-5";
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS });

      try {
        // 가장 짧은 호출. 키 유효성과 모델 접근 권한만 본다 (판독 정확도는 npm run extract).
        const res = await client.messages.create({
          model,
          max_tokens: 16,
          messages: [{ role: "user", content: "ping" }],
        });
        const usedTokens = res.usage.input_tokens + res.usage.output_tokens;
        return ok(`키 유효 · 모델 ${res.model} 응답 (토큰 ${usedTokens})`);
      } catch (err) {
        const e = err as { status?: number; message?: string };
        if (e.status === 401) return fail("인증 실패 (401)", "ANTHROPIC_API_KEY 값을 다시 확인하세요.");
        if (e.status === 404) {
          return fail(
            `모델 "${model}" 에 접근할 수 없습니다 (404)`,
            "ANTHROPIC_MODEL 값 또는 조직의 모델 접근 권한을 확인하세요.",
          );
        }
        if (e.status === 429) return fail("요청 한도 초과 (429)", "잠시 후 다시 실행하세요. 키 자체는 유효합니다.");
        return fail(reason(err));
      }
    },
  },

  {
    key: "molit",
    label: "국토교통부 실거래가 (공공데이터포털)",
    async run(env) {
      const serviceKey = env?.DATA_GO_KR_SERVICE_KEY ?? process.env.DATA_GO_KR_SERVICE_KEY;
      if (!serviceKey) {
        return skip("DATA_GO_KR_SERVICE_KEY 없음", "없으면 시세가 unavailable 로 표시되고 계약 판정이 보류됩니다.");
      }

      const base = env?.DATA_GO_KR_BASE_URL ?? "https://apis.data.go.kr";
      // 대전 서구(30170) 연립다세대 — 원룸·빌라 시세의 주 경로다.
      // 지난달로 조회한다(당월은 신고 기한 때문에 비어 있을 수 있다).
      const now = new Date();
      const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const dealYmd = `${lastMonth.getUTCFullYear()}${String(lastMonth.getUTCMonth() + 1).padStart(2, "0")}`;

      // ⚠️ serviceKey 는 URLSearchParams 에 넣지 않는다. "Encoding" 키는 이미 URL
      // 인코딩된 문자열이라 searchParams.set() 을 거치면 이중 인코딩되어 인증이
      // 조용히 실패한다(본문 없는 HTTP 403 — 이 검사가 잡으려는 바로 그 함정을
      // 검사 스크립트 자신이 밟고 있었다). market-price.service.ts 와 같은 방식으로 맞춘다.
      const rest = new URLSearchParams({
        LAWD_CD: "30170",
        DEAL_YMD: dealYmd,
        numOfRows: "5",
        pageNo: "1",
      });
      /**
       * **네 개를 모두 확인한다.**
       *
       * 공공데이터포털은 데이터셋마다 따로 승인한다. 예전에는 연립다세대 하나만
       * 검사해서, 아파트·오피스텔·단독다가구가 403 인데도 이 검사는 ✅ 를 냈다.
       * "확인했다"가 거짓이 되는 검사는 없는 것만 못하다.
       *
       * 유형별로 다른 엔드포인트를 쓰므로, 하나가 막히면 그 유형의 시세가
       * 통째로 안 나온다 — 특히 단독·다가구는 전세사기 핵심 유형이다.
       */
      const targets: { label: string; path: string; dataset: string }[] = [
        { label: "연립·다세대 매매", path: "/1613000/RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade", dataset: "15126467" },
        { label: "아파트 매매", path: "/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev", dataset: "15126469" },
        { label: "오피스텔 매매", path: "/1613000/RTMSDataSvcOffiTrade/getRTMSDataSvcOffiTrade", dataset: "15126475" },
        { label: "단독·다가구 매매", path: "/1613000/RTMSDataSvcSHTrade/getRTMSDataSvcSHTrade", dataset: "15126472" },
      ];

      const notApproved: string[] = [];
      const results: string[] = [];
      let parseChecked = false;

      for (const t of targets) {
        const endpoint = new URL(t.path, base);
        const url = `${endpoint.origin}${endpoint.pathname}?serviceKey=${serviceKey}&${rest.toString()}`;
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
          const body = await res.text();
          const code = tagValue(body, ["resultCode", "returnReasonCode"]);
          const msg = tagValue(body, ["resultMsg", "returnAuthMsg", "errMsg"]);

          // 미승인은 HTTP 403 + "등록되지 않은 서비스키" 또는 응답코드 30 으로 온다.
          const unregistered =
            res.status === 403 || code === "30" || (msg ?? "").includes("등록되지 않은");
          if (unregistered) {
            notApproved.push(`${t.label}(${t.dataset})`);
            results.push(`❌ ${t.label} — 활용신청 안 됨`);
            continue;
          }
          if (!res.ok) {
            results.push(`❌ ${t.label} — HTTP ${res.status}`);
            continue;
          }
          if (code && !["00", "000", "0000"].includes(code)) {
            results.push(`❌ ${t.label} — 응답코드 ${code} ${msg ?? ""}`);
            continue;
          }

          const n = (body.match(/<item>/g) ?? []).length;
          results.push(`✅ ${t.label} — 거래 ${n}건`);

          // 파싱은 표본이 있는 첫 응답에서 한 번만 확인하면 충분하다(응답 형식이 같다).
          if (n > 0 && !parseChecked) {
            parseChecked = true;
            const firstItem = /<item>([\s\S]*?)<\/item>/.exec(body)?.[1] ?? "";
            const amount = tagValue(firstItem, ["dealAmount", "거래금액"]);
            const area = tagValue(firstItem, ["excluUseAr", "전용면적"]);
            if (!amount || !area) {
              return fail(
                `${t.label} 파싱 실패 (거래금액=${amount ?? "없음"}, 전용면적=${area ?? "없음"})`,
                "market-price.service.ts 의 extractTag 후보 필드명을 실제 응답에 맞게 추가하세요.",
              );
            }
            results[results.length - 1] += ` · 파싱 성공 (${amount}만원 / ${area}㎡)`;
          }
        } catch (err) {
          results.push(`❌ ${t.label} — ${reason(err)}`);
        }
      }

      const detail = [`${dealYmd} 대전 서구`, ...results].join("  |  ");
      if (notApproved.length > 0) {
        return fail(
          detail,
          `포털에서 다음을 활용신청하세요: ${notApproved.join(", ")}. ` +
            "승인 전까지 해당 유형은 시세가 나오지 않습니다(판정은 '시세 확인 못 함'으로 끝납니다).",
        );
      }
      return ok(detail);

    },
  },

  {
    key: "kasi",
    label: "한국천문연구원 특일 정보 (공휴일)",
    async run(env) {
      // KASI 도 공공데이터포털 API 다 — 별도 키가 없으면 공통 키로 동작한다 (admin.ts 와 동일).
      const serviceKey =
        env?.KASI_SERVICE_KEY ?? env?.DATA_GO_KR_SERVICE_KEY ?? process.env.DATA_GO_KR_SERVICE_KEY;
      if (!serviceKey) {
        return skip(
          "KASI_SERVICE_KEY · 공통 DATA_GO_KR_SERVICE_KEY 모두 없음",
          "없으면 음력 공휴일(설·추석)을 모릅니다 → '잔금일이 설 연휴'를 놓칩니다.",
        );
      }

      // 설 연휴가 있는 달로 조회한다. 음력 공휴일이 실제로 오는지 확인하는 것이 목적이다.
      const year = new Date().getUTCFullYear();
      // ⚠️ serviceKey 는 URLSearchParams 에 넣지 않는다 — 이중 인코딩 함정 (molit 검사와 동일).
      const rest = new URLSearchParams({
        solYear: String(year),
        solMonth: "02",
        numOfRows: "50",
        _type: "json",
      });
      const url = `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?serviceKey=${serviceKey}&${rest.toString()}`;

      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        const body = await res.text();
        if (!res.ok) return fail(`HTTP ${res.status}`);

        const code = tagValue(body, ["resultCode", "returnReasonCode"]);
        const msg = tagValue(body, ["resultMsg", "returnAuthMsg", "errMsg"]);
        if (code && !["00", "000", "0000"].includes(code)) {
          return fail(
            `응답 코드 ${code} — ${msg ?? "사유 미상"}`,
            code === "30"
              ? "포털에서 '특일 정보' API 활용신청 승인 여부를 확인하세요."
              : "포털의 활용신청 상세를 확인하세요.",
          );
        }

        const dates = [...body.matchAll(/"?locdate"?\s*:\s*"?(\d{8})/g)].map((m) => m[1]!);
        if (dates.length === 0) {
          return ok(`키 유효 · ${year}-02 공휴일 0건 — 응답 형식은 정상`);
        }
        return ok(`키 유효 · ${year}-02 공휴일 ${dates.length}건 (${dates.join(", ")})`);
      } catch (err) {
        return fail(reason(err));
      }
    },
  },

  {
    key: "address",
    label: "주소 검색 · 지오코딩",
    async run(env) {
      const kakao = env?.KAKAO_REST_API_KEY ?? process.env.KAKAO_REST_API_KEY;
      const vworld = env?.VWORLD_API_KEY ?? process.env.VWORLD_API_KEY;

      if (!kakao && !vworld) {
        return skip(
          "KAKAO_REST_API_KEY · VWORLD_API_KEY 모두 없음",
          "목 데이터로 폴백합니다. 실제 좌표·법정동코드가 없으면 지역 위험과 시세 조회가 동작하지 않습니다.",
        );
      }

      if (kakao) {
        const url = new URL("https://dapi.kakao.com/v2/local/search/address.json");
        // ⚠️ 건물번호까지 넣어야 한다. 도로명만("둔산로") 검색하면 address_type 이 "ROAD" 라
        //    `address` 가 null 로 오고 b_code 가 아예 없다 — 키 문제로 오해하기 쉽다.
        url.searchParams.set("query", "대전광역시 서구 둔산로 89");
        url.searchParams.set("size", "1");
        try {
          const res = await fetch(url, {
            headers: { Authorization: `KakaoAK ${kakao}` },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          const body = await res.text();
          if (res.status === 401) {
            return fail("카카오 인증 실패 (401)", "REST API 키인지 확인하세요 (JavaScript 키는 안 됩니다).");
          }
          if (!res.ok) return fail(`카카오 HTTP ${res.status} — ${body.slice(0, 160)}`);

          const parsed = JSON.parse(body) as {
            documents?: { address?: { b_code?: string; h_code?: string }; x?: string; y?: string }[];
          };
          const top = parsed.documents?.[0];
          if (!top) return ok("카카오 키 유효 · 검색 결과 0건 (질의어 문제일 수 있음)");

          const bCode = top.address?.b_code;
          if (!bCode) {
            return fail(
              "카카오 응답에 b_code(법정동코드)가 없습니다",
              "address 대신 road_address 만 온 경우입니다. 두 경로를 모두 읽도록 구현하세요.",
            );
          }
          // b_code 앞 5자리가 실거래가 API 의 LAWD_CD 다. 이 값이 맞아야 시세가 나온다.
          return ok(
            `카카오 키 유효 · b_code ${bCode} (LAWD_CD ${bCode.slice(0, 5)}) · 좌표 ${top.y},${top.x}`,
          );
        } catch (err) {
          return fail(`카카오 — ${reason(err)}`);
        }
      }

      // VWorld 는 지오코딩만 확인한다 (법정동코드는 별도 조회가 필요할 수 있다).
      const url = new URL("https://api.vworld.kr/req/address");
      url.searchParams.set("service", "address");
      url.searchParams.set("request", "getcoord");
      url.searchParams.set("version", "2.0");
      url.searchParams.set("crs", "epsg:4326");
      url.searchParams.set("type", "road");
      url.searchParams.set("address", "대전광역시 서구 둔산로 100");
      url.searchParams.set("format", "json");
      url.searchParams.set("key", vworld!);
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        const body = await res.text();
        if (!res.ok) return fail(`VWorld HTTP ${res.status}`);
        const status = tagValue(body, ["status"]);
        if (status && status !== "OK") {
          const text = tagValue(body, ["text", "errMsg"]);
          return fail(`VWorld status=${status} — ${text ?? "사유 미상"}`, "키 승인 여부와 등록 도메인을 확인하세요.");
        }
        const x = tagValue(body, ["x"]);
        const y = tagValue(body, ["y"]);
        return ok(`VWorld 키 유효 · 좌표 ${y},${x} — 법정동코드는 별도 조회가 필요합니다`);
      } catch (err) {
        return fail(`VWorld — ${reason(err)}`);
      }
    },
  },

  {
    key: "juso",
    label: "도로명주소 개발자센터 (법정동코드)",
    async run(env) {
      const key = env?.JUSO_CONFM_KEY ?? process.env.JUSO_CONFM_KEY;
      if (!key) {
        return skip(
          "JUSO_CONFM_KEY 없음",
          "**가장 먼저 신청할 키입니다.** 법정동코드가 없으면 실거래가 API 가 전부 동작하지 않습니다. https://business.juso.go.kr",
        );
      }
      const { searchJuso } = await import("../src/services/public-data/juso.js");
      const res = await searchJuso("대전광역시 서구 둔산로", 1);
      if (!res.ok) {
        return fail(
          res.reason,
          res.failure === "unauthorized"
            ? "신청 시 등록한 '사용 URL' 에 현재 환경(로컬이면 http://localhost)이 들어 있는지 확인하세요."
            : undefined,
        );
      }
      const top = res.data[0];
      if (!top) return ok("키 유효 · 검색 결과 0건 (질의어 문제일 수 있음)");
      if (!/^\d{10}$/.test(top.regionCode)) {
        return fail(
          `법정동코드가 10자리가 아닙니다: ${top.regionCode}`,
          "이 값의 앞 5자리가 실거래가 API 의 LAWD_CD 입니다. 응답 필드(admCd)를 확인하세요.",
        );
      }
      return ok(
        `키 유효 · ${top.roadAddress} → 법정동코드 ${top.regionCode} (LAWD_CD ${top.regionCode.slice(0, 5)})`,
      );
    },
  },

  {
    key: "building",
    label: "건축HUB 건축물대장 (위반건축물)",
    async run(env) {
      const key =
        env?.MOLIT_BUILDING_LEDGER_KEY ?? env?.DATA_GO_KR_SERVICE_KEY ?? process.env.DATA_GO_KR_SERVICE_KEY;
      if (!key) {
        return skip("키 없음", "주소만으로 위반건축물을 자동 확인하는 기능이 꺼집니다.");
      }
      const { fetchBuildingLedger } = await import("../src/services/public-data/building-ledger.js");
      // 대전 서구 둔산동. 실제 번지는 키 검증용이므로 결과 없음도 정상이다.
      const res = await fetchBuildingLedger({
        regionCode: "3017010100",
        jibunAddress: "둔산동 1000",
      });
      if (!res.ok) {
        if (res.failure === "no_data") return ok("키 유효 · 해당 번지 자료 없음 (응답 형식은 정상)");
        return fail(res.reason);
      }
      return ok(
        `키 유효 · ${res.data.buildingName ?? "건물"} · 용도 ${res.data.mainUse ?? "?"} · 위반 ${
          res.data.isIllegal === null ? "확인불가" : res.data.isIllegal ? "있음" : "없음"
        }`,
      );
    },
  },

  {
    key: "housing-price",
    label: "공동주택가격 (HUG 보증 판정, 대전 · 반기 갱신 정적 데이터)",
    async run() {
      // 키가 아니라 커밋된 data/housing-price/daejeon.json 파일로 동작한다
      // (CLAUDE.md · domain/housing-price-import.ts 참고 — data.go.kr 에 이 API 자체가 없다).
      // 그래서 이 검사는 외부 호출이 아니라 "번들된 데이터가 실제로 읽히는지" 확인이다.
      const { isHousingPriceConfigured, fetchHousingPrice } = await import(
        "../src/services/public-data/housing-price.js"
      );
      if (!isHousingPriceConfigured()) {
        return fail(
          "data/housing-price/daejeon.json 을 찾지 못했습니다.",
          "npm run import:housing-price 로 다시 만들거나, 파일이 커밋됐는지 확인하세요.",
        );
      }
      // 실제로 존재하는 단지로 조회해 파이프라인 전체(파일 로드 → 매칭 → 계산)를 확인한다.
      const res = await fetchHousingPrice({
        regionCode: "3011010100",
        buildingName: "뜰안채주상복합",
        exclusiveAreaM2: 59.9,
      });
      if (!res.ok) return fail(res.reason, "domain/housing-price-import.ts 의 매칭 규칙을 확인하세요.");
      return ok(
        `데이터 정상 · ${res.data.matchedName} 표본 ${res.data.sampleSize}건 · 59.9㎡ 공시가 ${Math.round(res.data.officialPriceKrw / 10_000).toLocaleString("ko-KR")}만원`,
      );
    },
  },

  {
    key: "nts",
    label: "국세청 사업자등록 상태조회",
    async run(env) {
      const key = env?.NTS_BIZ_SERVICE_KEY ?? env?.DATA_GO_KR_SERVICE_KEY ?? process.env.DATA_GO_KR_SERVICE_KEY;
      if (!key) return skip("키 없음", "법인 임대인의 휴폐업 여부를 확인하지 못합니다.");

      const { fetchBusinessStatus } = await import("../src/services/business-registration.service.js");
      // 실재하지 않는 번호로 부른다. 응답 **형식**이 오는지만 보면 되고,
      // 등록되지 않은 번호도 국세청은 정상 응답으로 돌려준다.
      const res = await fetchBusinessStatus("0000000000");
      if (res.source === "unavailable") {
        return fail("응답을 받지 못했습니다.", "활용신청 승인 여부와 서비스 키를 확인하세요.");
      }
      return ok(`키 유효 · 응답 형식 정상 (등록여부 ${res.registered ? "있음" : "없음"})`);
    },
  },

  {
    key: "llm",
    label: "판독 모델 선택 (Anthropic / Gemini)",
    async run(env) {
      if (!env) return skip("env 검증 실패로 확인 불가");
      const { resolveLlmProvider } = await import("../src/services/llm/provider.js");
      const p = resolveLlmProvider();
      if (p.active === null) return skip(p.reason, "판독 없이는 위험 판정을 낼 수 없습니다.");
      return ok(`${p.active} 사용 — ${p.reason}`);
    },
  },

  {
    key: "secrets",
    label: "서버 자체 시크릿 (외부 호출 없음)",
    async run(env) {
      if (!env) return skip("env 검증 실패로 확인 불가");
      const missing: string[] = [];
      if (!env.ADMIN_API_TOKEN) missing.push("ADMIN_API_TOKEN (관리자 배치 · 공휴일 동기화가 막힙니다)");
      if (!env.MATCH_KEY_PEPPER) missing.push("MATCH_KEY_PEPPER (동일 소유자 탐지가 비활성화됩니다)");
      if (missing.length === 0) return ok("ADMIN_API_TOKEN · MATCH_KEY_PEPPER 설정됨");
      return skip(
        `미설정 ${missing.length}건`,
        `${missing.join(" / ")} — openssl rand -hex 32 로 생성해 .env 에 넣으세요.`,
      );
    },
  },
];

// ---------------------------------------------------------------------------
// 실행
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const onlyIndex = args.indexOf("--only");
const only = onlyIndex >= 0 ? (args[onlyIndex + 1] ?? "").split(",").map((s) => s.trim()) : null;

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
사용법: npm run preflight [-- --only <검사이름,...>]

  검사 이름  ${checks.map((c) => c.key).join(" ")}

  각 검사는 실제 외부 호출 1회를 합니다. anthropic 검사만 과금됩니다(아주 짧은 호출).
`);
  process.exit(0);
}

let env: Env | null = null;
try {
  env = loadEnv();
} catch (err) {
  console.error(`\n⚠️ 환경변수 검증 실패 — 일부 검사를 건너뜁니다.\n${reason(err)}\n`);
}

const selected = only ? checks.filter((c) => only.includes(c.key)) : checks;
if (selected.length === 0) {
  console.error(`--only 값이 어떤 검사와도 맞지 않습니다: ${only?.join(",")}`);
  process.exit(1);
}

console.log(`\nZIP 042 preflight — 모드 ${env?.mode ?? "(불명)"}`);
console.log(`설정 출처  ${dotenv.loaded ? dotenv.path : ".env 없음 — 셸 환경변수만 사용"}`);
console.log("─".repeat(72));

const ICON: Record<Verdict, string> = { ok: "✅", skip: "⏭️ ", fail: "❌" };
const tally: Record<Verdict, number> = { ok: 0, skip: 0, fail: 0 };

// 진행 표시는 TTY 에서만 쓴다. 파이프로 넘길 때 커서 제어 문자가 리터럴로 남기 때문이다.
const interactive = process.stdout.isTTY === true;

// 순차 실행한다. 병렬로 돌리면 출력이 섞여서 어느 검사의 결과인지 알기 어렵다.
for (const check of selected) {
  if (interactive) process.stdout.write(`   ${check.label} ... `);
  let result: CheckResult;
  try {
    result = await check.run(env);
  } catch (err) {
    // 검사 자체가 터져도 나머지는 계속 간다.
    result = fail(`검사 실행 중 오류 — ${reason(err)}`);
  }
  tally[result.verdict] += 1;
  if (interactive) process.stdout.write("\r\x1b[2K");
  console.log(`${ICON[result.verdict]} ${check.label}`);
  console.log(`      ${result.summary}`);
  if (result.nextStep) console.log(`      → ${result.nextStep}`);
}

console.log(`${"─".repeat(72)}`);
console.log(`정상 ${tally.ok} · 미설정 ${tally.skip} · 실패 ${tally.fail}\n`);

if (tally.fail > 0) {
  console.log("실패한 항목은 위의 → 안내를 따르세요.\n");
} else if (tally.skip > 0) {
  console.log("실패는 없습니다. 미설정 항목은 해당 기능만 비활성화된 상태로 동작합니다.\n");
} else {
  console.log("모든 외부 연동이 살아 있습니다. 다음 단계:");
  console.log("  1) POST /v1/admin/holidays/sync 를 1회 호출 (음력 공휴일 적재)");
  console.log("  2) npm run extract -- <실제등기부.pdf> registry 로 판독 정확도 확인\n");
}

// 실패가 있으면 0 이 아닌 코드로 끝낸다 (CI 나 스크립트에서 이어 쓸 수 있게).
process.exit(tally.fail > 0 ? 1 : 0);
