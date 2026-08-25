# ZIP 042 — 백엔드 API

사회초년생을 위한 원룸 계약 안전 검사 서비스(`ZIP 042`)의 백엔드입니다.
**Hono + Supabase** 기반이며, 프론트엔드가 소비할 REST API만 제공합니다.

기획서(`ZIP042_기획서_v0.2`)의 솔루션 4가지를 그대로 API로 옮겼습니다.

| 기획서 | 구현 |
|---|---|
| ① 등기부등본 AI 분석 | `POST /v1/cases/:caseId/analyze` — 문서 판독(AI) + 규칙 엔진 판정 |
| ② 대전 지역 위험 레이어 | `GET /v1/region/risk`, `GET /v1/region/grid` — PostGIS 반경 500m 집계 |
| ③ 실거래가 연동 시세 조회 | 국토교통부 실거래가 API → ㎡당 단가 중위값 |
| ④ 대화형 후속 질문 | `GET/POST /v1/cases/:caseId/interview` → 특약 자동 도출 |

여기에 추가 요구사항인 **중개대상물 확인·설명서 / 임대차 계약서 초안 / 보증금·월세·일정**
가공 처리가 포함되어 있습니다.

---

## API 계약 (프론트엔드가 먼저 볼 곳)

| 산출물 | 위치 |
|---|---|
| **OpenAPI 3.1 문서** | `GET /v1/openapi.json` · 파일: `openapi.json` (`npm run openapi`) |
| **브라우저 문서** | `GET /v1/docs` |
| **TypeScript 응답 타입** | `src/api-types.ts` (서버가 쓰는 타입을 그대로 재수출 — 드리프트 불가) |

타입 클라이언트 생성:

```bash
npx openapi-typescript http://localhost:8787/v1/openapi.json -o src/lib/api.d.ts
```

요청 스키마는 **실제 검증에 쓰는 zod 스키마에서 생성**되므로 코드와 어긋날 수 없습니다.
경로 28개 · 오퍼레이션 35개 · 스키마 16개.

---

## 0. 프론트엔드 먼저 개발하기 — 목(mock) 모드

**API 키도 Supabase도 없이** 전체 API를 붙여볼 수 있습니다. 설정 파일도 필요 없습니다.

```bash
npm install
npm run dev:mock
```

```bash
curl -X POST localhost:8787/v1/dev/seed -H 'authorization: Bearer dev' -H 'content-type: application/json' -d '{"reset":true}'
```

이 한 번으로 위험 등급별 샘플 검사 건 10건이 만들어지고 분석까지 끝납니다.

```
clean                caution     6점  대체로 괜찮지만 확인할 게 있어요 (빚+보증금 = 집값의 40.9%)
mortgage_moderate    caution    24점  대체로 괜찮지만 확인할 게 있어요 (빚+보증금 = 집값의 68.2%)
underwater           critical   66점  계약을 권하지 않아요 — 집값보다 빚과 보증금이 더 많아요 (깡통전세)
trust                critical   51점  계약을 권하지 않아요 — 신탁등기가 되어 있어요
auction              critical  100점  계약을 권하지 않아요 — 이미 경매가 시작된 집이에요
multi_household      danger     26점  아직 판단할 수 없어요 — 앞선 세입자들의 보증금을 모릅니다
owner_mismatch       critical   85점  계약을 권하지 않아요 — 계약서의 임대인이 등기부 소유자와 달라요
recent_owner_gap     danger     57점  조건을 고치지 않으면 위험해요 — 빚 + 보증금이 집값의 80%를 넘어요
document_mismatch    critical  100점  계약을 권하지 않아요 — 서류마다 주소가 달라요
unreadable           danger     41점  아직 판단할 수 없어요 — 금액을 읽지 못한 권리가 있어요
```

### ⚠️ 주소는 반드시 검색 API로 고르세요

`GET /v1/addresses/search` 결과의 `lat` · `lng` · `regionCode` · `sigungu` 를 그대로 넘겨야
**지역 위험 레이어와 시세 조회가 동작합니다.** 사용자가 타이핑한 주소만 보내면 두 기능이 조용히
빕니다. (서버가 주소로 보완을 시도하지만, 검색으로 고르는 편이 정확합니다.)

목 모드에서는 대전 5개 구 + 서울·세종 샘플 주소로 검색이 동작하고, 실제 키(카카오/VWorld)를
꽂으면 `src/services/address.service.ts` 의 제공자만 바뀝니다.

### 인증

`Authorization` 헤더에 **아무 문자열**이나 보내면 됩니다. 토큰이 곧 사용자 식별자입니다.

```
Authorization: Bearer dev          → 기본 개발 사용자
Authorization: Bearer dev:<uuid>   → 지정한 사용자 (다중 사용자 시나리오)
Authorization: Bearer alice        → 'alice' 로 매핑된 사용자 (같은 토큰 = 항상 같은 사용자)
```

헤더가 아예 없으면 실제와 동일하게 401이 납니다.

### 개발용 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/v1/dev` | 목 모드 사용법 (여기부터 읽으세요) |
| `GET` | `/v1/dev/scenarios` | 판독 시나리오 10종 목록 |
| `POST` | `/v1/dev/seed` | 샘플 검사 건 생성 + 분석 실행 |
| `POST` | `/v1/dev/reset` | 전체 초기화 |
| `GET` | `/v1/dev/state` | 메모리 저장소 현황 |

### 원하는 시나리오로 판독시키기

문서 등록 시 `mockScenario` 를 넣거나, **파일명에 시나리오 키를 포함**시키면 됩니다.

```json
POST /v1/cases/{caseId}/documents
{ "docType": "registry", "storagePath": "...", "mimeType": "application/pdf",
  "sizeBytes": 120000, "mockScenario": "trust" }
```

`등기부_trust.pdf` 처럼 올려도 같은 결과가 나옵니다. 지정하지 않으면 `mortgage_moderate` 입니다.

### 업로드 흐름도 그대로 동작합니다

목 모드의 서명 업로드 URL은 **우리 서버의 수신 엔드포인트**를 가리킵니다. 그래서 프론트엔드는
실제 Supabase Storage를 붙였을 때와 **완전히 같은 3단계 코드**를 쓸 수 있고, 나중에 코드를
고칠 일이 없습니다.

### 목 모드에서 하지 않는 것

| 항목 | 목 모드 | 왜 |
|---|---|---|
| RLS(사용자 격리) | 흉내내지 않음 | 격리 검증은 `supabase/tests/verify_rls.sql` 로 실제 Postgres에서 |
| 문서 내용 판독 | 파일을 읽지 않음 | 어떤 파일을 올려도 시나리오 픅스처를 반환 |
| 시세 | 건물 유형·지역코드로 계산한 고정값 | `source: "manual"` 로 표시되므로 프론트엔드가 구분 가능 |
| 데이터 영속성 | 메모리에만 | 재시작하면 사라짐 (개발 중에는 오히려 편함) |

`GET /v1/meta` 의 `mode` 가 `"mock"` 인지 확인하면 프론트엔드가 두 모드를 구분할 수 있습니다.

### live 모드로 넘어가기

`.env` 에 Supabase 값을 채우면 자동으로 live 모드가 됩니다 (`SUPABASE_URL` 유무로 판단).
명시하려면 `ZIP042_MODE=live`. **운영 환경(`NODE_ENV=production`)에서 목 모드로 부팅하는 것은
env 검증 단계에서 차단됩니다** — 실데이터 없이 그럴듯한 응답을 내보내는 사고를 막기 위해서입니다.

프론트엔드 코드는 바꿀 것이 없습니다. 인증 토큰만 실제 Supabase 액세스 토큰으로 바뀝니다.

---

## 1. 핵심 설계 결정

### AI는 판독만, 판정은 규칙 엔진이

```
문서(PDF·이미지) ──AI──▶ 구조화 데이터 ──규칙 엔진──▶ 위험 판정 · 특약
                (추출만)                 (결정론적)
```

`src/domain/*` 은 전부 **순수 함수**이고 외부 의존이 없습니다. 이렇게 나눈 이유:

1. **재현성** — 같은 문서는 언제나 같은 판정을 받습니다. 규칙이 바뀌면 저장된 추출 결과로 재분석만 하면 됩니다.
2. **설명 가능성** — "왜 위험한가"를 조문과 숫자로 설명할 수 있습니다. 모든 판정은 `evidence` 를 함께 냅니다.
3. **안전** — 모델이 "안전해 보입니다"라고 말해버리는 사고를 구조적으로 막습니다. 추출 스키마에는 위험 판단 필드가 없습니다.

AI 추출 스키마의 모든 필드는 `nullable` 입니다. "모르겠다"를 표현할 방법이 없으면
모델이 값을 지어내기 때문입니다.

### 모르는 값을 0으로 채우지 않는다

이 서비스에서 가장 위험한 실패는 조용한 실패입니다.
시세 조회가 실패하면 `source: "unavailable"`, 다가구의 선순위 보증금을 모르면 `null` 로 두고,
둘 다 **사용자에게 보이는 finding** 으로 올립니다.

### 금액 단위

내부 계산은 전부 **원(KRW) 정수**입니다. 프론트엔드는 `amountUnit: "krw" | "man"` 으로
단위를 명시하고, 스키마 계층에서 원 단위로 정규화합니다. (만원/원 혼용으로 100배 오차가 나는 사고 방지)

---

## 2. 일정 가공 — 이 서비스의 핵심 로직

프론트엔드가 받은 날짜 3개(계약일 · 잔금 예정일 · 전입신고 예정일)를
**법적 효력이 언제 생기는지**로 변환합니다. (`src/domain/schedule.ts`)

```
계약일 ──▶ 확정일자(당일 권장) ──▶ 잔금일 ──▶ 전입신고 ──▶ [다음날 0시] 대항력 발생
                                    └── 이 사이가 무방비 구간 ──┘
```

계산해서 내보내는 값:

| 값 | 근거 |
|---|---|
| `opposingPowerEffectiveAt` | 주택임대차보호법 제3조 ① — 인도 + 주민등록의 **다음 날 0시** (KST) |
| `priorityRightEffectiveAt` | 제3조의2 ② — 대항력 요건 + 확정일자 중 **늦은 쪽** |
| `unprotectedWindow` | 잔금 지급 ~ 대항력 발생 전. 이 구간에 임대인이 대출을 받으면 은행이 앞선다 |
| `residentRegistrationDeadline` | 주민등록법 제11조 — 전입 후 14일 |
| `renewalNoticeWindow` | 제6조 · 제6조의3 — 만료 6개월 ~ 2개월 전 |
| `protectedTermEnd` | 제4조 ① — 2년 미만 계약도 임차인은 2년 주장 가능 |
| `events[]` | 날짜별 체크리스트 (D-day 포함) |

감지하는 일정 위험:

- 전입신고가 잔금일보다 늦음 (1일 → 주의, 2~3일 → 위험, 4일+ → 매우 위험)
- **잔금일이 주말·공휴일** → 주민센터·등기소 휴무로 확정일자·전입신고 당일 처리 불가
- 확정일자를 잔금일 이후로 미룸
- 전입신고 법정 기한(14일) 초과
- 잔금일 당일 근저당 설정 위험 (구조적으로 항상 존재 → 필수 특약 유발)

> **공휴일 데이터**: 음력 연휴(설날·추석·부처님오신날)와 대체공휴일은 매년 고시되므로
> `POST /v1/admin/holidays/sync` 로 한국천문연구원 특일 정보 API에서 동기화해야 합니다.
> 동기화 전에는 `GET /v1/meta` 의 `capabilities.lunarHolidaysSynced` 가 `false` 이고,
> 분석 응답의 `caveats` 에 경고가 붙습니다. **운영 투입 전 반드시 1회 실행하세요.**

---

## 3. 깡통전세 판정과 보증금 회수 시뮬레이션

`src/domain/valuation.ts`

```
부담률 = (선순위 근저당 채권최고액 + 선순위 임차보증금 + 기타 선순위 청구 + 내 보증금) / 시세
```

| 부담률 | 등급 |
|---|---|
| < 60% | 안전 |
| 60 ~ 80% | 주의 |
| 80 ~ 100% | 위험 |
| ≥ 100% | 매우 위험 (깡통전세) |

경매 배당 순서를 그대로 모사해 **실제로 얼마를 못 받는지**를 계산합니다.

```
낙찰가(시세 × 낙찰가율) - 경매비용
  → ① 소액임차인 최우선변제 (선순위 근저당보다 앞선다)
  → ② 선순위 권리자
  → ③ 내 보증금 잔액
```

소액임차인 최우선변제 기준(대전은 광역시 기준)은 `small_lessee_thresholds` 테이블에서
계약일 기준으로 조회합니다.

---

## 2-1. 분석 실행 — 동기와 비동기 둘 다 제공

실제 문서 판독은 문서 수에 따라 **20~60초**가 걸립니다. 두 경로를 모두 제공하니
프론트엔드가 상황에 맞게 고르면 됩니다.

| 경로 | 언제 쓰는가 |
|---|---|
| `POST /v1/cases/:id/analyze` | 동기. 서버리스(Vercel) 환경, 또는 단순하게 가고 싶을 때. 타임아웃 90초 이상 |
| `POST /v1/cases/:id/analyze/jobs` | 비동기(권장). 모바일 네트워크가 끊겨도 결과를 잃지 않습니다 |

비동기 흐름:

```
POST .../analyze/jobs        → 202 { job: { id, status: "queued" }, poll: { intervalMs: 2500 } }
GET  .../analyze/jobs/{id}   → { job: { status, progress, step } }   ← 2.5초 간격 폴링
                                 step 예: "등기부등본을 읽고 있어요"
status === "succeeded"       → GET .../analysis 로 결과 조회
```

진행 중 작업이 있으면 새로 만들지 않고 그 작업을 돌려줍니다(**멱등**, `200 + reused: true`).
사용자가 버튼을 두 번 눌러도 AI 호출이 두 배가 되지 않습니다. DB 의 부분 unique 인덱스
(`status in ('queued','running')`)가 경쟁 조건까지 막습니다.

> **`GET /v1/meta` 의 `capabilities.asyncAnalysis` 를 확인하세요.** 서버리스 환경에서는
> 응답 후 백그라운드 실행이 보장되지 않아 `false` 로 내려가고, 그때는 동기 경로를 써야 합니다.
> (Vercel 에서 비동기를 쓰려면 `@vercel/functions` 의 `waitUntil()` 연동이 필요합니다.)

---

## 3-1. "위험하다"와 "모른다"를 구분한다

판정 점수를 단순 합산하면 **작은 문제 다섯 개가 치명적 문제 하나보다 높게** 나옵니다.
실제로 초기 구현에서 "사진이 흐림"만으로 87점 **매우 위험**이 나왔고, 이런 오판은 사용자가
판정 자체를 신뢰하지 않게 만듭니다. 그래서 두 가지를 도입했습니다.

**① 두 축 분리** — 모든 finding 은 `kind` 를 가집니다.

| kind | 의미 | 점수 반영 |
|---|---|---|
| `risk` | 이 집·계약에 **실제로 있는** 위험 | 반영 |
| `info_gap` | 서류가 없거나 판독이 안 돼 **확인하지 못한** 항목 | 미반영 |

`info_gap` 은 `informationGaps` 로 따로 나가고, 하나라도 있으면 판정은 최소 '주의' 이상이 됩니다
— 확인하지 않은 것을 안전하다고 말할 수는 없기 때문입니다.

그중 **판정을 완료할 수 없게 만드는 항목**(시세 미확인, 채권최고액 판독 실패,
다가구 선순위 보증금 미상, 등기부 미제출)은 `blockingGaps` 로 분류되고 `contractable = false` 가
됩니다. 이때 응답은 "위험합니다"가 아니라 **"아직 판단할 수 없어요"** 라고 말합니다.

**② 같은 카테고리 내 체감 가중치** — 두 번째 서류 문제는 첫 번째만큼 새로운 정보를 주지 않으므로
순위에 따라 기여도를 줄입니다(1, 0.5, 0.25, …). 덕분에 점수가 해석 가능한 값이 됩니다.

등급 결정: **치명적 위험 항목이 있으면 critical**, 그 외에는 최고 심각도와 점수 구간
(주의 15 / 위험 40 / 매우위험 85)의 높은 쪽. `contractable` 은 치명적 항목이 없고 점수 55 미만이며
`blockingGaps` 가 비어 있을 때만 `true` 입니다.

> **지역 위험은 계약을 단독으로 거부하지 않습니다.** 반경 내 피해 밀도는 최대 '위험'까지만
> 올라갑니다 — 동네 통계는 이 집에 대한 증거가 아니기 때문입니다. 반면 **동일 건물 · 동일 소유자**
> 피해는 이 물건·이 임대인에 대한 직접 증거이므로 '매우 위험'을 유지합니다.

---

## 4. 서류 교차검증

세 서류 + 사용자 입력, 네 출처를 서로 대조합니다. (`src/domain/cross-check.ts`)

전세사기 상당수는 "한 서류에는 맞게, 다른 서류에는 다르게" 적힌 형태로 흔적을 남기므로
단일 서류 분석만으로는 잡히지 않습니다.

| 점검 | 위험도 |
|---|---|
| 서류 간 주소 불일치 | 매우 위험 |
| 보증금 입금 계좌 명의 ≠ 임대인 | 매우 위험 |
| 등기부에는 근저당이 있는데 확인·설명서 권리관계란에 미기재 | 위험 (중개사 설명의무 위반 근거) |
| 계약금 + 잔금 ≠ 보증금 | 위험 |
| 계약서 잔금일 ≠ 입력 잔금일 | 위험 (일정 계산 기준이 흔들림) |
| 서류 간 전용면적 불일치 (허용 오차 0.5㎡) | 위험 |
| 계약서에 동·호수 누락 | 위험 (확정일자 효력 문제) |
| 위반건축물 표시 | 위험 (보증보험 거절 사유) |
| 다가구인데 선순위 임차 내역 미기재 | 위험 |
| 중개사 공제 기간이 계약일 전 만료 | 위험 |

**값이 없는 것(미제출·판독실패)과 값이 다른 것(불일치)을 반드시 구분합니다.**
없는 것을 '일치'로 처리하면 검증하지 않은 것을 검증했다고 말하는 셈이기 때문입니다.

---

## 5. 시작하기

```bash
npm install
```

키 없이 바로 돌려보려면 0절의 목 모드를 쓰세요. 실제 Supabase 를 붙일 때만 `.env` 가 필요합니다.

```bash
cp .env.example .env   # 값 채우기
```

### Supabase 준비

```bash
supabase start          # 로컬
supabase db push        # 마이그레이션 적용
```

마이그레이션은 3개입니다.

| 파일 | 내용 |
|---|---|
| `20260820000100_init_core.sql` | 확장 · ENUM · 테이블 · 트리거 |
| `20260820000200_rls.sql` | RLS 정책 · 지역 위험 RPC · Storage 버킷 |
| `20260820000300_seed_reference.sql` | 공휴일(양력 고정) · 소액임차인 기준 · 개발용 더미 |
| `20260820000400_jobs_and_notifications.sql` | 분석 작업 큐 · 알림 발송함 · 고아 작업 정리 함수 |

개발용 피해주택 더미 데이터는 기본적으로 **생성되지 않습니다**. 필요하면:

```sql
set zip042.seed_fixtures = 'on';
-- 그 뒤 마이그레이션 재실행
```

### RLS 검증

RLS는 이 서비스의 유일한 데이터 격리 장치입니다. 정책을 고칠 때마다 실행하세요.

```bash
psql "$SUPABASE_DB_URL" -f supabase/tests/verify_rls.sql
```

"사용자 A가 B의 case·분석 결과를 볼 수 없다", "클라이언트가 피해주택 원본을 읽을 수 없다",
"남의 `user_id`로 case를 만들 수 없다", "지역 위험 RPC가 실제로 집계한다"를 확인하고
모든 테스트 데이터를 롤백합니다.

### 실행

```bash
npm run dev:mock   # 외부 의존 없이 (프론트엔드 개발용)
npm run dev        # Supabase 설정이 있으면 live, 없으면 자동으로 목 모드
npm run typecheck
npm test
npm run build && npm start
```

설정은 프로젝트 루트의 `.env` 에서 읽습니다 (`.env.example` 을 복사해 채우세요).
셸에 이미 있는 환경변수가 `.env` 보다 우선합니다 — 배포 환경의 설정이 실수로 커밋된
`.env` 에 덮이지 않게 하기 위한 규칙입니다. 서버 시작 로그의 `dotEnv` 필드로 어느 파일을
읽었는지 확인할 수 있습니다.

### 외부 연동 확인 (키를 받은 직후)

```bash
npm run preflight                     # 키별로 실제 호출 1회 → ✅/❌ 와 다음 조치
npm run preflight -- --only molit     # 특정 항목만
```

`/v1/meta` 의 capabilities 는 **키가 설정되어 있는지**만 봅니다. 키가 오타거나 승인 대기
중이거나 오퍼레이션 경로가 틀린 경우는 잡지 못합니다. 특히 공공데이터포털은 키 오류를
**HTTP 200 + 에러 XML** 로 돌려주므로 실제로 호출해 봐야 압니다.

검사 항목: `supabase` `anthropic` `molit` `kasi` `address` `secrets`
(`anthropic` 만 과금됩니다 — 아주 짧은 호출 1회)

### 판독 정확도 확인 · 프롬프트 튜닝

```bash
npm run extract -- ./등기부.pdf registry
npm run extract -- ./확인설명서.jpg brokerage_statement --out result.json
```

DB · Storage · 인증을 모두 건너뛰고 AI 판독만 돌려 결과 JSON 을 출력합니다.
필요한 것은 `ANTHROPIC_API_KEY` 와 파일 하나뿐입니다.

등기부는 다음을 직접 대조하세요 — 자주 틀리는 순서입니다.

1. 말소선이 그어진 권리가 `isCancelled: true` 로 나오는지
2. 근저당권의 `maxClaimKrw` 가 **채권최고액**인지 (채권액을 읽으면 위험을 과소평가합니다)
3. 신탁 기재를 `isTrustProperty` 로 잡는지
4. 읽지 못한 값이 `null` 인지 — 그럴듯한 값으로 채워졌다면 프롬프트 실패입니다

> ⚠️ 실제 등기부에는 개인정보가 있습니다. `--out` 으로 저장한 파일을 커밋하지 마세요.

### 배포

`api/index.ts` 가 Vercel Functions 진입점입니다. **Node.js 런타임(Fluid Compute)** 을 씁니다 —
Anthropic SDK · Buffer 처리 · 긴 실행 시간(문서 분석이 60초를 넘길 수 있음)이 필요하므로
Edge 런타임을 쓰면 안 됩니다. `vercel.json` 에서 `maxDuration: 300` 으로 잡아두었습니다.

---

## 6. API 레퍼런스

베이스: `/v1`. 인증은 `Authorization: Bearer <Supabase access token>`.

### 공개

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/health` | 헬스체크 |
| `GET` | `/v1/meta` | 기능 가용성 (`documentExtraction`, `marketPriceLookup`, `ownerMatching`, `lunarHolidaysSynced`) |
| `GET` | `/v1/special-terms/catalog` | 특약 카탈로그 24종 |

프론트엔드는 시작 시 `/v1/meta` 를 읽어 "시세 조회 불가" 같은 상태를 미리 안내할 수 있습니다.

### 검사 건 (case)

| 메서드 | 경로 | 설명 |
|---|---|---|
| `POST` | `/v1/cases` | 생성 (매물 · 거래조건 · 일정) |
| `GET` | `/v1/cases` | 목록 (`limit`, `offset`) |
| `GET` | `/v1/cases/:caseId` | 상세 |
| `PUT` | `/v1/cases/:caseId` | 전체 수정 |
| `PATCH` | `/v1/cases/:caseId/schedule` | 일정만 수정 |
| `PUT` | `/v1/cases/:caseId/market-price` | 시세 직접 입력 (공공 API 폴백) |
| `DELETE` | `/v1/cases/:caseId` | 삭제 |

생성 요청 예:

```json
{
  "amountUnit": "man",
  "title": "둔산동 원룸",
  "roadAddress": "대전광역시 서구 둔산로 100",
  "detailAddress": "301호",
  "regionCode": "3017010100",
  "sigungu": "대전광역시 서구",
  "lat": 36.3504, "lng": 127.3845,
  "buildingType": "multi_family",
  "exclusiveAreaM2": 29.75,
  "leaseType": "monthly",
  "deposit": 1000,
  "monthlyRent": 50,
  "maintenanceFee": 7,
  "contractTermMonths": 24,
  "contractDate": "2026-09-10",
  "balanceDate": "2026-10-08",
  "residentRegistrationDate": "2026-10-08"
}
```

`amountUnit: "man"` 이면 `deposit: 1000` = 1,000만원입니다.
`moveInDate` 를 비우면 잔금일, `confirmedDatePlan` 을 비우면 계약일로 간주합니다.

### 문서

| 메서드 | 경로 | 설명 |
|---|---|---|
| `POST` | `/v1/cases/:caseId/documents/upload-url` | 서명 업로드 URL 발급 |
| `POST` | `/v1/cases/:caseId/documents` | 업로드 완료 후 등록 |
| `GET` | `/v1/cases/:caseId/documents` | 목록 |
| `GET` | `/v1/cases/:caseId/documents/:documentId/download-url` | 열람 URL (5분) |
| `DELETE` | `/v1/cases/:caseId/documents/:documentId` | 삭제 |

`docType`: `registry`(등기부등본) · `brokerage_statement`(중개대상물 확인·설명서) ·
`lease_draft`(임대차 계약서 초안) · `building_ledger` · `other`

업로드는 2단계입니다. 20MB 파일을 API 서버로 통과시키지 않기 위해 클라이언트가
Storage로 직접 PUT 합니다.

```
1. POST .../documents/upload-url  → { upload: { url, storagePath, ... } }
2. PUT <upload.url>  (파일 본문)
3. POST .../documents  → { docType, storagePath, mimeType, sizeBytes }
```

같은 `docType` 을 여러 번 올리면 **가장 최근 것**만 분석에 사용합니다.

### 분석

| 메서드 | 경로 | 설명 |
|---|---|---|
| `POST` | `/v1/cases/:caseId/analyze` | 전체 분석 실행 |
| `GET` | `/v1/cases/:caseId/analysis` | 저장된 최신 결과 |
| `GET` | `/v1/cases/:caseId/analyses` | 분석 이력 |
| `GET` | `/v1/cases/:caseId/timeline` | 저장된 일정 타임라인 (D-day) |
| `POST` | `/v1/schedule/preview` | **일정만** 계산 (문서·AI 없음, 저장 안 함) |

`POST /analyze` 는 동기 응답입니다. 문서 판독이 포함되면 **20~60초**가 걸릴 수 있으므로
프론트엔드는 타임아웃을 90초 이상 두고 진행 표시를 보여주세요.
이미 판독된 문서만 있으면 규칙 엔진만 돌아 1초 이내입니다.

`POST /v1/schedule/preview` 는 사용자가 날짜 피커를 만질 때마다 호출하기 위한 경량
엔드포인트입니다. 대항력 발생 시점과 무방비 구간을 즉시 계산해 돌려줍니다.

응답 구조:

```
analysis
├── verdict            판정 (verdict/score/contractable/headline/summary/conditions/topFindings)
├── badge              상태 표현 배지 (기획서 3-4 §7 대응)
├── burdenGauge        부담률 게이지 0~100
├── valuation          시세 · 부담률 · 경매 회수 시뮬레이션 · 보증보험 가능성
├── schedule           일정 가공 결과 전체 (위 2절)
├── region             지역 위험 (반경 내 피해 건수 · 동일 건물 · 동일 소유자)
├── crossCheck         서류 교차검증 (comparisons + submitted)
├── documents          제출 여부 · 판독 실패 · 판독 신뢰도
├── specialTerms       추천 특약 (계약서에 그대로 붙일 수 있는 clauseText)
├── findings           모든 판정 항목 (code/severity/weight/title/description/action/evidence)
└── caveats            판정의 한계 (시세 미확인, 등기부 없음, 음력 공휴일 미동기화 등)
```

`verdict.verdict` 는 `safe | caution | danger | critical`,
`verdict.contractable` 은 "계약해도 되는지"입니다.
`critical` finding 이 하나라도 있거나 점수가 55 이상이면 `false` 입니다.

### 주소 검색

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/v1/addresses/search?q=&limit=` | 도로명·지번·건물명·법정동 검색 → 좌표 + 법정동코드 |

한도 60회/분. 응답의 `isMockData` 가 `true` 면 개발용 데이터입니다.

### 홈 · 일정 · 알림

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/v1/home` | 홈 요약 — 검사 건 · 판정 · 다가오는 일정 · 알림 배지 |
| `GET` | `/v1/timeline/upcoming?limit=` | 전체 검사 건의 다가오는 일정 (캘린더) |
| `GET` | `/v1/notifications?includeSent=` | 앱 내 알림함 |

`/v1/home` 은 검사 건마다 `nextAction`(다음에 할 일 한 줄)을 포함합니다 —
프론트엔드가 우선순위 로직을 다시 만들지 않아도 됩니다.

알림 수는 두 값으로 나옵니다: **`notifications.due`**(오늘 보낼 것, 배지용)와
**`notifications.pending`**(예정 전체, 목록 길이). 하나로 합치면 배지에 13이 떠 있는데
정작 오늘 할 일은 없는 상황이 생겨 사용자가 배지를 무시하게 됩니다.

### 지역 위험

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/v1/region/risk?lat=&lng=&radiusM=` | 좌표 기준 집계 |
| `GET` | `/v1/region/grid?lat=&lng=&radiusM=` | 히트맵 격자 (약 100m 셀) |
| `GET` | `/v1/region/cases/:caseId/region` | case 기준 (동일 건물·소유자 탐지 포함) |

피해주택의 **개별 주소는 응답에 절대 포함되지 않습니다** — 집계값과 격자 좌표만 나갑니다.

### 대화형 후속 질문

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/v1/cases/:caseId/interview` | 다음 질문 (최대 3개) |
| `POST` | `/v1/cases/:caseId/interview/answers` | 답변 제출 |
| `DELETE` | `/v1/cases/:caseId/interview` | 세션 초기화 |

질문은 분석 결과에 따라 조건부로 노출됩니다 — 신탁이 아닌 집에 신탁 동의서를 묻지 않습니다.
답변은 특약 또는 위험 신호로 변환되며, 최종 반영은 `POST /analyze` 를 다시 호출할 때입니다.

서류로는 알 수 없지만 결정적인 신호들을 여기서 잡습니다:

- 임대인이 전입신고를 미루라고 했나 → **매우 위험**
- 보증금을 제3자 계좌로 요구했나 → **매우 위험**
- 임대인 본인을 직접 만나 신분증을 확인했나
- 공인중개사를 거치는가 (직거래 / 앱 거래)

### 특약

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/v1/special-terms/catalog` | 전체 카탈로그 (공개) |
| `GET` | `/v1/cases/:caseId/special-terms` | 이 집에 맞춘 추천 특약 |
| `POST` | `/v1/cases/:caseId/special-terms/compose` | 선택한 특약을 붙여넣기용 텍스트로 조립 |

특약은 "이 문구를 계약서에 넣어라"까지 갑니다. `clauseText` 는 날짜·금액·주소가 채워진
**완성된 문장**이라 그대로 옮겨 적을 수 있습니다.

기본 특약 7종은 조건 없이 항상 포함됩니다 (새 담보 설정 금지, 잔금일 등기부 상태 유지,
권리 변동 시 해제, 소유자 본인 계좌 지급, 납세증명서, 하자 수선 등).

### 관리자 (`x-admin-token` 헤더)

| 메서드 | 경로 | 설명 |
|---|---|---|
| `POST` | `/v1/admin/holidays/sync` | 특일 정보 API에서 공휴일 동기화 |
| `POST` | `/v1/admin/holidays/cache/invalidate` | 공휴일 캐시 무효화 |
| `POST` | `/v1/admin/victim-properties` | 피해주택 데이터 적재 |
| `DELETE` | `/v1/admin/victim-properties/dev-fixtures` | 개발용 더미 삭제 |
| `GET` | `/v1/admin/notifications/due?date=` | 발송할 알림 목록 |
| `PATCH` | `/v1/admin/notifications/mark` | 발송 결과 기록 |
| `POST` | `/v1/admin/jobs/reap` | 고아 분석 작업 정리 |

사용자 JWT와 별개의 공유 시크릿을 씁니다. **프론트엔드에 절대 노출하지 마세요.**

### 요청 제한

AI 호출이 붙은 엔드포인트라 **비용 사고 방지**가 목적입니다. 응답에 `RateLimit-Limit` ·
`RateLimit-Remaining` · `RateLimit-Reset` 헤더가 붙고, 초과 시 `429` + `Retry-After` 입니다.

| 버킷 | 한도 |
|---|---|
| 분석 실행 | 10회 / 시간 |
| 업로드 URL 발급 | 30회 / 시간 |
| 주소 검색 | 60회 / 분 |
| 검사 건 쓰기 | 60회 / 분 |

인증된 사용자는 사용자 ID 로, 비인증은 IP 로 셉니다.
in-memory 구현이라 **다중 인스턴스에서는 실제 한도가 인스턴스 수만큼 커집니다** —
정확한 제한이 필요해지면 `setRateLimitStore()` 로 Redis 구현을 꽂으면 됩니다.

### 오류 형식

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "입력값을 확인해 주세요.",
    "issues": [{ "path": "deposit", "message": "..." }],
    "requestId": "..."
  }
}
```

`code`: `BAD_REQUEST` · `UNAUTHORIZED` · `FORBIDDEN` · `NOT_FOUND` · `CONFLICT` ·
`UNPROCESSABLE` · `VALIDATION_FAILED` · `RATE_LIMITED` · `UPSTREAM_FAILED` · `INTERNAL`

예상하지 못한 오류는 내부 메시지를 노출하지 않고 `requestId` 만 돌려줍니다.

---

## 7. 보안 · 개인정보

- **RLS**: 사용자 데이터는 소유자만 접근. case 하위 테이블은 **읽기만** 허용하고 쓰기는 서버 전담입니다.
- **피해주택 데이터**: `victim_properties` 에는 RLS 정책을 만들지 않아 클라이언트가 직접 SELECT 할 수 없습니다. 집계 RPC(`security definer`)만 열어둡니다.
- **소유자 이름**: 원문을 저장하지 않고 HMAC(`MATCH_KEY_PEPPER`) 키만 저장·비교합니다. 이름은 엔트로피가 낮아 단순 해시로는 역추적이 가능하기 때문입니다. 페퍼가 없으면 동일 소유자 탐지 기능이 **비활성화**됩니다 (`/v1/meta` 로 확인).
- **Storage 경로**: `{user_id}/{case_id}/{uuid}.{ext}`. Storage RLS가 첫 세그먼트를 검사하고, 서버도 등록 시 경로 소유권을 재검증합니다.
- **토큰 검증**: JWKS 로컬 검증 → HS256 로컬 검증 → `auth.getUser()` 원격 검증 순으로 폴백합니다.
- **이중 방어**: 사용자 소유 목록 조회(`cases` · `home` · `notifications` · `timeline`)는 RLS 와 **별개로 코드에서도 `user_id` 를 필터링**합니다. 이 경로에 `service_role` 클라이언트가 실수로 전달되면 RLS 가 우회되어 전체 사용자 데이터가 노출되기 때문입니다. 보안 경계를 한 겹에만 의존하지 않습니다.

---

## 8. 운영 전 확인 목록

아래는 **실제 값 검증이 필요한 항목**입니다. 코드에는 근거 주석과 함께 상수로 모아두었습니다.

| 항목 | 위치 | 왜 |
|---|---|---|
| 공휴일 동기화 실행 | `POST /v1/admin/holidays/sync` | 음력 연휴 미반영 시 잔금일 휴일 경고가 누락됨 |
| 소액임차인 기준 금액 | `small_lessee_thresholds` 테이블 | 2023-02-21 개정 기준으로 입력. 법제처 최신 조문 확인 필요 |
| 경매 낙찰가율 | `AUCTION_RECOVERY_RATE` (`valuation.ts`) | 보수적 기본값. 대전 지역 최근 12개월 실제 낙찰가율로 교체 권장 |
| 전월세전환율 | `DEFAULT_CONVERSION_RATE` (`money.ts`) | 기본 5.5%. 한국부동산원 통계로 주기 갱신 |
| 실거래가 API 오퍼레이션 경로 | `ENDPOINTS` (`market-price.service.ts`) | 공공데이터포털에서 실제 신청한 오퍼레이션명 확인 필요 |
| 보증보험 심사 기준 | `GUARANTEE_LTV_CAP` (`valuation.ts`) | 90% 룰 하나만 적용한 **참고용 신호**. 확정 정보로 표시하지 말 것 |
| 과밀억제권역 분류 | `classifyRegion` (`small-lessee.service.ts`) | 대전은 정확. 그 외 지역은 보수적으로 분류 |
| Supabase 타입 생성 | `src/lib/supabase.ts` | `supabase gen types typescript` 로 생성해 `Db` 별칭 교체 권장 |
| 지역 위험 임계값 | `REGION_THRESHOLDS` (`region-risk.ts`) | 실제 피해 데이터 적재 후 분포를 보고 재조정 필요 |
| 목 모드 차단 확인 | `ZIP042_MODE` | 배포 환경에 `NODE_ENV=production` 이 설정되어 있는지 확인 |
| 주소 검색 제공자 | `address.service.ts` | 카카오 `b_code`(법정동코드)를 써야 함. `h_code`(행정동)는 실거래가 조회에 안 맞음 |
| 비동기 분석 실행 보장 | `job.service.ts` | 서버리스라면 `waitUntil()` 연동 또는 동기 경로 사용 |
| 요청 제한 저장소 | `rate-limit.ts` | 다중 인스턴스면 Redis 구현으로 교체 |
| 알림 발송 채널 | `notification.service.ts` | 발송함까지만 구현됨. 푸시·알림톡 연동 필요 |

> **법률 자문이 아닙니다.** 모든 판정 응답에 `caveats` / `disclaimer` 가 포함되어 있습니다.
> UI에서 이 문구를 반드시 노출하세요.

### 아직 만들지 않은 것 (키·인프라 필요)

| 항목 | 필요한 것 |
|---|---|
| 실제 문서 판독 | `ANTHROPIC_API_KEY` + 실제 등기부등본으로 프롬프트 튜닝 |
| 실거래가 시세 | 공공데이터포털 서비스 키 + 오퍼레이션 경로 확인 |
| 주소 검색 (실데이터) | 카카오 REST API 키 또는 VWorld 키 |
| 공휴일 (음력) | 한국천문연구원 특일 정보 키 → `POST /v1/admin/holidays/sync` |
| 알림 발송 | 푸시(FCM) 또는 카카오 알림톡 채널 + Cron |
| 건축물대장 판독 | 공공 API 키 (현재 enum 에만 존재, 판독은 건너뜀) |
| 배포 | Vercel CLI · 프로젝트 연결 |

---

## 9. 구조

```
src/
├── app.ts                    Hono 앱 구성 (미들웨어 · 라우팅 · 오류 처리)
├── server.ts                 Node 실행 진입점
├── env.ts                    환경변수 검증 (부팅 시 1회)
├── lib/                      date(KST) · money · errors · logger · supabase
├── middleware/
│   ├── auth.ts                 Supabase JWT 검증 · 관리자 토큰
│   └── rate-limit.ts           요청 제한 (교체 가능한 저장소 인터페이스)
├── openapi.ts                OpenAPI 3.1 문서 (요청 스키마는 zod 에서 생성)
├── api-types.ts              프론트엔드용 응답 타입 재수출
├── schemas/                  요청 스키마 · AI 추출 스키마
├── domain/                   ★ 순수 함수 규칙 엔진 (외부 의존 없음)
│   ├── schedule.ts             일정 가공 (대항력 · 우선변제권 · 무방비 구간)
│   ├── valuation.ts            깡통전세 판정 · 경매 회수 시뮬레이션
│   ├── registry-risk.ts        등기부 위험 규칙
│   ├── cross-check.ts          서류 교차검증
│   ├── region-risk.ts          지역 위험 등급
│   ├── special-terms.ts        특약 24종 라이브러리
│   ├── interview.ts            대화형 질문 · 답변 → 특약/위험 변환
│   ├── notifications.ts        일정 알림 산출 · 다가오는 일정
│   └── verdict.ts              종합 판정
├── services/                 DB · 외부 API · AI 오케스트레이션
├── mock/                     ★ 목 모드 (외부 의존 대역)
│   ├── store.ts                in-memory 테이블 + PostgREST 호환 쿼리 빌더
│   ├── client.ts               Supabase 클라이언트 대역 (from/rpc/storage/auth)
│   ├── fixtures.ts             판독 시나리오 10종 + 참조 데이터 시드
│   ├── extraction.ts           문서 판독 · 시세 대역
│   └── bootstrap.ts            부팅 시드 · 샘플 검사 건 생성
└── routes/                   HTTP 레이어 (dev.ts 는 목 모드에서만 마운트)
scripts/generate-openapi.ts OpenAPI 문서 파일 내보내기
api/index.ts                  Vercel Functions 진입점
supabase/migrations/          스키마 · RLS · 시드
tests/
├── domain/                   규칙 엔진 단위 테스트
└── http/
    ├── app.test.ts             앱 부팅 · 라우팅 · 인증
    └── mock-flow.test.ts       ★ 전체 파이프라인 종단 테스트
supabase/tests/verify_rls.sql RLS 경계 · 지역 위험 RPC 검증
```

`npm test` → **203개 통과.**

목 모드 덕분에 `mock-flow.test.ts` 가 **전체 파이프라인을 CI에서 검증**합니다 —
검사 건 생성 → 서명 업로드 → 문서 등록 → 판독 → 규칙 엔진 → 판정 저장 → 조회까지.
live 모드에서는 AI·공공 API 때문에 이 경로를 테스트할 수 없으므로, 목 모드의 가장 큰 값이 여기입니다.

마이그레이션 3개와 `verify_rls.sql` 은 PostgreSQL 16 + PostGIS 3.4 에서 실제 적용·검증했습니다.
