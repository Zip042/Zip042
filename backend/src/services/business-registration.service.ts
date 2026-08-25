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

  const url = new URL(VALIDATE_URL);
  url.searchParams.set("serviceKey", serviceKey);

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
