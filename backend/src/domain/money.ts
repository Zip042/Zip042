/**
 * 금액 도메인 — 모든 내부 계산은 **원(KRW) 정수**로 한다.
 *
 * 프론트엔드는 "만원" 단위로 입력받는 경우가 많으므로 라우트 스키마에서 원 단위로 정규화한 뒤
 * 이 모듈에 넘긴다. 부동소수점 오차를 피하기 위해 나눗셈 결과는 항상 반올림해 정수로 되돌린다.
 */

export const MAN = 10_000;
export const EOK = 100_000_000;

/** 사용자에게 보여줄 한국식 금액 표기. 예: 235_000_000 → "2억 3,500만원" */
export function formatKrw(krw: number): string {
  if (!Number.isFinite(krw)) return "-";
  const sign = krw < 0 ? "-" : "";
  const abs = Math.round(Math.abs(krw));
  if (abs === 0) return "0원";

  const eok = Math.floor(abs / EOK);
  const man = Math.floor((abs % EOK) / MAN);
  const won = abs % MAN;

  const parts: string[] = [];
  if (eok > 0) parts.push(`${eok.toLocaleString("ko-KR")}억`);
  if (man > 0) parts.push(`${man.toLocaleString("ko-KR")}만원`);
  if (won > 0) parts.push(`${won.toLocaleString("ko-KR")}원`);
  // "2억"처럼 만원 단위가 0인 경우 뒤에 '원'을 붙여준다.
  if (man === 0 && won === 0) parts[parts.length - 1] = `${parts[parts.length - 1]}원`;
  return sign + parts.join(" ");
}

/**
 * 등기부 · 계약서 원문에 적힌 한국어 금액을 숫자로. AI 추출값이 문자열로 올 때의 안전망.
 * 예: "금150,000,000원" → 150000000, "2억5천만원" → 250000000, "1억2,000만" → 120000000
 * 해석할 수 없으면 null (조용히 0으로 만들지 않는다 — 0원 채권최고액은 판정을 왜곡한다).
 */
export function parseKoreanAmount(input: string | number | null | undefined): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input) : null;
  if (!input) return null;

  const text = input.replace(/\s|,|금|원정|원/g, "");
  if (!text) return null;

  // 순수 숫자
  if (/^\d+$/.test(text)) return Number(text);

  const unitPattern = /(\d+(?:\.\d+)?)(조|억|천만|백만|십만|만|천|백)?/g;
  const unitValue: Record<string, number> = {
    조: 1_000_000_000_000,
    억: EOK,
    천만: 10_000_000,
    백만: 1_000_000,
    십만: 100_000,
    만: MAN,
    천: 1_000,
    백: 100,
  };

  let total = 0;
  let matched = false;
  for (const m of text.matchAll(unitPattern)) {
    const [, digits, unit] = m;
    if (!digits) continue;
    matched = true;
    total += Number(digits) * (unit ? (unitValue[unit] ?? 1) : 1);
  }
  return matched ? Math.round(total) : null;
}

/**
 * 환산보증금 — 월세를 보증금으로 환산해 합산한 금액.
 *
 * 반전세·월세 매물에서 "실제로 얼마를 떼일 수 있는가"는 보증금뿐이지만,
 * 시세 대비 부담률을 볼 때는 월세도 자본화해서 비교해야 매물 간 비교가 가능하다.
 *
 * 환산식: 보증금 + (월세 × 12 ÷ 전월세전환율)
 *
 * ⚠️ 전환율은 지역 · 시점에 따라 달라진다. 기본 5.5%는 대전 원룸 시장의 대략적인 수치이므로
 *    운영 시 한국부동산원 전월세전환율 통계로 주기적으로 갱신할 것.
 */
export const DEFAULT_CONVERSION_RATE = 0.055;

export function convertedDeposit(
  depositKrw: number,
  monthlyRentKrw: number,
  rate: number = DEFAULT_CONVERSION_RATE,
): number {
  if (rate <= 0) throw new RangeError("전월세전환율은 0보다 커야 합니다.");
  if (monthlyRentKrw <= 0) return Math.round(depositKrw);
  return Math.round(depositKrw + (monthlyRentKrw * 12) / rate);
}

/**
 * 주택임대차보호법 제7조의2 — 보증금의 전부/일부를 월세로 전환할 때의 산정률 상한.
 * 「기준금리 + 2%」와 10% 중 **낮은 쪽**. 임대인이 과도한 전환을 요구하는지 점검하는 데 쓴다.
 */
export function legalConversionCap(baseRate: number): number {
  return Math.min(baseRate + 0.02, 0.1);
}

/** 0으로 나누기를 막는 비율 계산. 분모가 0이면 null. */
export function safeRatio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return numerator / denominator;
}

export function toPercent(ratio: number | null, digits = 1): number | null {
  if (ratio === null) return null;
  const factor = 10 ** digits;
  return Math.round(ratio * 100 * factor) / factor;
}
