# 임대차 계약서 초안 · 특약 조건 API 연동 설계

## 배경

`집톡_필요API_요약.pdf`(2026-08 작성)는 ZIP 042 서비스에 필요한 API를 6개 구성으로 정리했다. 이 문서는 그중
**3번(임대차 계약서 초안)**과 **4번(특약 조건 추가)**을 다룬다. 나머지 구성(0 공통 기반, 1 등기부등본 분석,
2 확인설명서)은 범위 밖이다.

기존 코드베이스를 확인한 결과, 4번의 핵심 자산인 특약 문구 라이브러리(`src/domain/special-terms.ts`, 27개
정의)와 3번의 "확정일자·전입신고 D-day 안내"(`src/domain/schedule.ts`)는 **이미 구현되어 있다**. 이번 설계는
문서가 요구하는 나머지 항목 — 법제처 API 연동, 계약서 초안 조립, 특약 법조문 인용, 국세청 사업자등록 진위확인 —
을 다룬다.

### 3번 표 대조 (범위 확정)

| API/항목 | 처리 |
|---|---|
| 법제처 국가법령정보 (law.go.kr) | 이 설계에 포함 |
| Claude API (계약서 필드 자동 채움) | **의도적으로 재사용하지 않음** — 이미 추출된 case 데이터를 결정론적으로 매핑. CLAUDE.md 원칙 "AI는 판독만, 판정은 규칙엔진이"와 일치 |
| 도로명주소 API (소재지 정규화) | 기존 `address.service.ts` 재사용 — 이 설계에 포함 |
| 국세청 사업자등록 진위확인 (15081808) | 이 설계에 포함 (신규 어댑터) |
| NICE 본인확인 / 모두싸인 / 카카오 비즈메시지 | 원문서가 "나중"으로 표시 — **이번 범위에서 제외** (민간 유료 연동) |
| 확정일자·전입신고 D-day 안내 | 이미 `schedule.ts`에 구현됨 — 신규 작업 없음 |
| 임대사업자 등록 여부 (렌트홈) | API 없음 — 이 설계에 링크 안내만 포함 |

### 4번 표 대조

| API/항목 | 처리 |
|---|---|
| Claude API (특약 문구 선택·치환) | 이미 `recommendSpecialTerms()`가 결정론적으로 처리 중 — 변경 없음 |
| 법제처 오픈API (법령 조문 인용) | 이 설계에 포함. **판례(prec) 자동 인용은 제외** — 사안별 판례를 자동으로 붙이면 변호사법 리스크상 오인용 우려가 크다는 원문서의 경고를 따름 |
| 검증된 특약 문구 라이브러리 | 이미 `special-terms.ts`로 구현됨 |
| HUG/HF 보증보험 가입요건 판정 | 이미 `GUARANTEE_LTV_CAP`(`valuation.ts`) + `TERM_GUARANTEE_COOPERATION` 특약으로 구현됨 |

## 1. `lawinfo.service.ts` — 법제처 어댑터 (3·4번 공통)

law.go.kr 국가법령정보 공동활용 오픈API를 호출한다. 실제 파라미터를 포털 가이드에서 확인했다:

- **조문 원문 조회**: `GET https://www.law.go.kr/DRF/lawService.do?target=lawjosub&OC={key}&type=JSON&MST={법령마스터번호}&JO={조번호 6자리}`
  - JO 인코딩: 조번호 4자리 + 가지번호 2자리. 예) 제3조의2 → `000302`
  - 우리가 인용하는 법령(주택임대차보호법, 주민등록법)은 소수이므로 MST 값은 포털에서 1회 확인해 상수로 고정한다 (`market-price.service.ts`의 ENDPOINTS와 동일한 관행 — 운영 전 실제 호출로 검증 필요하다고 주석에 남긴다).
- **별표서식(표준계약서) 조회**: `GET https://www.law.go.kr/DRF/lawSearch.do?target=licbyl&OC={key}&type=JSON&query=주택임대차표준계약서&org={국토교통부 기관코드}`
  - 응답에 별표서식파일링크·별표서식PDF파일링크가 직접 포함되므로 별도 상세 조회가 불필요하다.

```ts
export function isLawInfoAvailable(): boolean;

export async function fetchLawArticle(
  lawKey: "주택임대차보호법" | "주민등록법",
  jo: string, // "000302" 형식
): Promise<{ source: "law_go_kr" | "unavailable"; text: string | null; url: string }>;

export async function fetchStandardLeaseForm(): Promise<{
  source: "law_go_kr" | "unavailable";
  pdfUrl: string | null;
  fallbackUrl: string; // law.go.kr 검색 결과 딥링크
}>;
```

- 환경변수 `LAW_GO_KR_OC` 신규 추가 (`.env.example`). OC 키는 open.law.go.kr에서 이메일 인증으로 사용자가 직접
  발급받아야 한다 — 계정 생성은 대신 처리할 수 없는 영역이다.
- mock 모드: 고정 fixture 텍스트 반환 (다른 서비스와 동일한 패턴).
- 키 없음/호출 실패/타임아웃 → 예외를 던지지 않고 `source: "unavailable"` + `fallbackUrl`(law.go.kr 검색
  페이지 딥링크)을 반환한다. 법조문 인용이 API 장애로 특약 추천 전체를 막지 않아야 한다 (CLAUDE.md 원칙 2).

## 2. 특약별 법조문 인용 확장 (4번)

`SpecialTermDefinition`(`special-terms.ts`)에 정적 필드를 추가한다:

```ts
legalBasis?: { law: "주택임대차보호법" | "주민등록법"; jo: string; label: string }[];
// 예: [{ law: "주택임대차보호법", jo: "000302", label: "제3조의2" }]
```

인용 자체(어느 특약이 어느 조문에 근거하는지)는 **정적으로 하드코딩**한다 — 이미 `schedule.ts` 상단에 조문
근거를 모아둔 팀 관행과 일치하고, 법 개정은 자주 일어나지 않는다. `lawinfo.service.ts`는 그 조문의 **원문
텍스트만** 실시간으로 가져와 붙이는 역할만 한다.

`terms.ts`의 `/cases/:caseId/special-terms/compose` 응답에 특약별로 `legalBasis` 배열을 추가하고, 각 항목에
`fetchLawArticle()` 결과(`legalText` 또는 `unavailable` 표시)를 채운다. 조회 실패해도 `label`("제3조의2")은
항상 표시되고 원문만 "원문 확인 필요" + law.go.kr 링크로 대체된다.

판례 자동 인용은 넣지 않는다.

## 3. `contract-draft.service.ts` — 계약서 초안 조립 (3번 핵심)

신규 서비스 + 라우트(`GET /v1/cases/:caseId/contract-draft`). Claude를 다시 호출하지 않고 이미 DB에 있는
데이터를 국토부 표준임대차계약서 항목 순서로 결정론적으로 매핑한다:

1. **당사자 정보**: `case.service.ts`의 임대인/임차인 필드, 등기부 추출 결과(`extraction.service.ts`)의
   소유자 이름과 대조
2. **목적물 표시**: 주소는 `address.service.ts`(도로명주소·Kakao 어댑터, 기존 0번 구성 재사용)로 정규화한
   표기를 사용 — 문서 3번 표의 "도로명주소 API 재사용" 항목이 여기 해당
3. **계약 내용(제1~6조)**: 보증금·월세·계약기간·잔금일 등 `case.service.ts` 필드를 그대로 채움
4. **특약사항**: `recommendSpecialTerms()` 결과의 `clauseText`를 순서대로 삽입 (2절에서 추가한 `legalBasis`
   라벨도 특약 옆에 괄호로 표기)
5. **참고 서식**: `fetchStandardLeaseForm()`으로 받은 국토부 공식 PDF 링크를 함께 반환

실제 정부 PDF의 필드에 프로그램으로 값을 채워 넣지는 않는다 — 서식 필드 매핑은 양식이 바뀔 때마다 깨지기
쉬운 반면, 구조화된 JSON + 원본 서식 PDF 링크를 같이 주는 편이 유지보수 비용 대비 가치가 높다. 프론트가 이
JSON을 화면에 렌더링하거나 인쇄용으로 사용한다.

응답에는 기존 `analysis.service.ts`의 `caveats`/`disclaimer` 패턴과 동일하게 "이 초안은 법률 자문이
아니며, 국토부 표준계약서 자동완성을 보조하는 도구입니다"라는 문구를 반드시 포함한다 (변호사법 리스크
프레이밍 — 원문서 하단 경고 반영).

## 4. `business-registration.service.ts` — 국세청 사업자등록 진위확인 (3번)

15081808번, 공공데이터포털 API. 기존 `DATA_GO_KR_SERVICE_KEY` 재사용. 다른 실거래가 API와 달리 **POST +
JSON body** 방식이라는 점이 다르다 (사업자등록번호·대표자성명·개업일자 등을 배열로 전송).

```ts
export async function verifyBusinessRegistration(input: {
  businessNumber: string;
  representativeName: string;
  openingDate: DateOnly;
}): Promise<{
  source: "nts" | "unavailable" | "not_applicable";
  valid: boolean | null;
  status: string | null;
}>;
```

- **사업자등록번호는 자동 추출 대상이 아니다.** 등기부에는 법인의 경우 법인등록번호만 나오고, 사업자등록번호는
  별개 번호 체계라 계약서·등기부 어디에도 구조적으로 등장하지 않는다. 사용자가 화면에서 직접 입력하는 선택
  필드(`businessRegistrationNumber`)로 `case.service.ts`/`schemas/case.ts`에 추가한다.
- 법인 임대인 여부는 별도 필드를 추가하지 않고, 이미 추출된 `ownerName`/`lessorName`에 "주식회사"·"(주)"·
  "유한회사"·"재단법인"·"사단법인" 패턴이 포함되는지로 휴리스틱 판단해 사업자등록번호 입력 UI를 조건부로
  노출한다. 오탐(개인인데 상호에 법인 표기가 섞인 경우)이 있어도 "입력 필드가 한 번 더 보이는" 정도의
  비용이라 안전하다.
- 사업자등록번호를 입력하지 않은 케이스는 이 검증을 건너뛰고 `source: "not_applicable"`로 표시한다(개인
  임대인이 대다수이므로 `unavailable`과 구분해 "실패"가 아님을 명확히 한다).
- API 호출 실패는 `unavailable`로 표시하고 분석을 막지 않는다. `market-price.service.ts`와 동일한
  `Promise.allSettled` 기반 실패 허용 패턴을 따른다.

## 5. 임대사업자 등록 여부 안내 (렌트홈)

API가 없으므로 코드 로직은 거의 없다. `contract-draft.service.ts` 응답에 고정 필드로 포함한다:

```ts
rentHomeNotice: {
  message: "임대사업자 등록 여부는 API로 확인할 수 없습니다. 임대인에게 등록 여부를 직접 요구하세요.";
  linkUrl: "https://www.renthome.go.kr";
}
```

## 보안 · 환경변수

- `LAW_GO_KR_OC` — `.env.example`에 추가, 국세청 진위확인은 기존 `DATA_GO_KR_SERVICE_KEY` 재사용
- law.go.kr·국세청 API 모두 서버 프록시(Node 백엔드)에서만 호출한다 — 원문서의 공통 보안 경고("프론트에서
  직접 호출하면 키가 노출된다")를 그대로 적용

## 테스트 관점

- `lawinfo.service.ts`, `business-registration.service.ts`는 mock 모드 fixture + live 모드 `unavailable`
  폴백 경로를 각각 단위 테스트한다 (`market-price.service.ts` 테스트 패턴 참고).
- `contract-draft.service.ts`는 순수 조립 로직이므로 도메인 계층처럼 외부 의존 없이 단위 테스트 가능해야
  한다 — API 호출 부분(법조문 원문, 서식 링크)은 인터페이스로 주입해 목으로 대체한다.
- `tests/http/mock-flow.test.ts`에 계약서 초안 조회 엔드포인트를 종단 흐름에 추가한다.

## 이번 범위에 포함하지 않는 것 (YAGNI)

- NICE 본인확인, 모두싸인 전자서명, 카카오 비즈메시지 — 원문서가 "나중"으로 명시. 민간 유료 연동이라 키
  발급·계약 절차가 별도로 필요하다.
- 판례(prec) 자동 인용 — 변호사법 리스크.
- 정부 PDF 서식에 프로그램으로 필드를 채워 넣는 기능 — 구조화 JSON + 원본 링크로 대체.
