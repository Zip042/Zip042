import { loadEnv } from "../env.js";
import { mockBusinessRegistration } from "../mock/business-registration.js";
import { log } from "../lib/logger.js";
import type { BusinessRegistrationInput, BusinessRegistrationResult } from "../domain/types.js";

/**
 * 국세청 사업자등록정보 진위확인 API 어댑터 (15081808, data.go.kr → api.odcloud.kr 호스팅).
 *
 * ⚠️ 운영 전 확인 사항
 *   1) 요청/응답 필드는 공개된 예시(businesses 배열 → data 배열의 valid/valid_msg) 기준으로
 *      작성했다. 포털에서 실제 신청 후 1회 실 호출로 필드명을 재확인할 것
 *      (market-price.service.ts와 동일 관행).
 *   2) serviceKey는 DATA_GO_KR_SERVICE_KEY를 재사용한다 — data.go.kr 일반 인증키는
 *      포털 내 여러 API에 공용으로 쓰인다.
 */

const VALIDATE_URL = "https://api.odcloud.kr/api/nts-businessman/v1/validate";

export function isBusinessRegistrationAvailable(): boolean {
  if (loadEnv().mode === "mock") return true;
  return Boolean(loadEnv().DATA_GO_KR_SERVICE_KEY);
}

export async function verifyBusinessRegistration(
  input: BusinessRegistrationInput,
): Promise<BusinessRegistrationResult> {
  const env = loadEnv();
  if (env.mode === "mock") return mockBusinessRegistration(input);

  const serviceKey = env.DATA_GO_KR_SERVICE_KEY;
  if (!serviceKey) {
    return { source: "unavailable", valid: null, status: "서비스 키가 설정되지 않았습니다." };
  }

  // ⚠️ serviceKey 를 URLSearchParams 로 넣으면 안 된다.
  // 포털이 주는 "Encoding" 키는 이미 URL 인코딩된 문자열이라 `%2B` 가 `%252B` 로
  // 이중 인코딩되어 인증이 조용히 실패한다. 그래서 쿼리에 직접 붙인다.
  const url = `${VALIDATE_URL}?serviceKey=${serviceKey}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businesses: [
          {
            b_no: input.businessNumber.replace(/-/g, ""),
            start_dt: input.openingDate.replace(/-/g, ""),
            p_nm: input.representativeName,
          },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`국세청 API 오류 (${res.status})`);
    const body = (await res.json()) as { data?: { valid?: string; valid_msg?: string }[] };
    const first = body.data?.[0];
    if (!first?.valid) throw new Error("응답에서 valid 필드를 찾을 수 없습니다.");
    return {
      source: "nts",
      valid: first.valid === "01",
      status: first.valid_msg ?? (first.valid === "01" ? "확인됨" : "확인할 수 없음"),
    };
  } catch (err) {
    log.warn("국세청 사업자등록 진위확인 실패", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { source: "unavailable", valid: null, status: null };
  }
}

const STATUS_URL = "https://api.odcloud.kr/api/nts-businessman/v1/status";

/**
 * 사업자 **휴폐업 여부** 조회.
 *
 * 진위확인(`verifyBusinessRegistration`)은 "번호·대표자·개업일이 서로 맞는가"를 본다.
 * 이 함수는 다른 것을 본다 — **지금 살아 있는 사업자인가.**
 *
 * 전세사기에서 폐업한 법인 명의로 계약해 보증금 반환 책임을 흐리는 수법이 있다.
 * 등기부에는 법인명만 나오고 폐업 여부는 나오지 않으므로, 이 조회가 유일한 확인 수단이다.
 */
export interface BusinessStatusResult {
  source: "nts" | "unavailable";
  /** 국세청에 등록된 번호인지. false 면 계약서의 번호가 가짜일 수 있다. */
  registered: boolean | null;
  /** "계속사업자" · "휴업자" · "폐업자" · null(확인 못 함) */
  status: string | null;
  /** 폐업일 YYYYMMDD. 폐업이 아니면 null. */
  closedOn: string | null;
  /** 지금 정상 영업 중인지. 휴·폐업이면 false. null 은 확인 못 함이다. */
  active: boolean | null;
}

export async function fetchBusinessStatus(
  businessNumber: string,
): Promise<BusinessStatusResult> {
  const env = loadEnv();
  const serviceKey = env.NTS_BIZ_SERVICE_KEY ?? env.DATA_GO_KR_SERVICE_KEY;
  if (!serviceKey) {
    return { source: "unavailable", registered: null, status: null, closedOn: null, active: null };
  }

  const digits = businessNumber.replace(/\D/g, "");
  if (digits.length !== 10) {
    return { source: "unavailable", registered: null, status: null, closedOn: null, active: null };
  }

  try {
    const res = await fetch(`${STATUS_URL}?serviceKey=${serviceKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ b_no: [digits] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`국세청 API 오류 (${res.status})`);

    const body = (await res.json()) as {
      data?: { b_stt?: string; tax_type?: string; end_dt?: string }[];
    };
    const row = body.data?.[0];
    const status = row?.b_stt?.trim() || null;
    const taxType = row?.tax_type?.trim() || null;

    return {
      source: "nts",
      // 국세청은 등록되지 않은 번호에 대해 b_stt 를 비우고 tax_type 에 안내 문구를 넣는다.
      registered: Boolean(status) || Boolean(taxType && !taxType.includes("등록되지")),
      status,
      closedOn: row?.end_dt?.trim() || null,
      // "계속사업자" 만 정상으로 본다. 휴업도 보증금 반환 능력에 직결된다.
      active: status ? status === "계속사업자" : null,
    };
  } catch (err) {
    log.warn("국세청 사업자 상태조회 실패", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { source: "unavailable", registered: null, status: null, closedOn: null, active: null };
  }
}
