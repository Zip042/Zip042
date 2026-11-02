# ZIP 042

> 사회초년생을 위한 원룸 임대차(전세·월세) 계약 안전 검사 서비스

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6)
![React](https://img.shields.io/badge/React-18-61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF)
![Hono](https://img.shields.io/badge/Backend-Hono%20%2B%20Supabase-orange)

대전대학교 × 멋쟁이사자처럼 **Campus AX-Ton** 팀 프로젝트 (팀명: 깡통방위대)

---

## 서비스 소개

등기부등본과 계약 서류를 올리면, AI가 서류에서 정보를 읽어 내고 **규칙 엔진이 위험도를 판정**합니다. 빚과 보증금이 집값에서 차지하는 비율, 신탁등기, 경매 진행 여부 같은 위험 요소를 사회초년생이 이해할 수 있는 말로 설명하고, 계약서에 넣을 특약을 제안합니다.

| 기능 | 내용 |
|---|---|
| 등기부등본 분석 | AI는 서류 판독만, 위험 판정은 결정론적 규칙 엔진이 담당 |
| 지역 위험 정보 | 대전 지역 반경 500m 위험 집계 |
| 시세 조회 | 국토교통부 실거래가 API로 ㎡당 단가 중위값 계산 |
| 후속 질문 → 특약 | 대화형 질문으로 상황을 확인하고 특약 자동 도출 |
| 계약서 초안 | 특약과 근거 법조문을 담은 임대차 계약서 초안 |
| 계약 준비 | 계약 체크리스트, 사회초년생용 계약 용어 사전 |

## 개발 정보

| 항목 | 내용 |
|---|---|
| 기간 | 2026.08 ~ 2026.09 |
| 팀 | 4인 |
| 프런트엔드 | TypeScript · React 18 · React Router · Vite · Tailwind CSS · Radix UI |
| 백엔드 | Hono · Supabase · zod · OpenAPI 3.1 |
| 배포 | Vercel |

## 담당 파트 — 이건호

### 1. 프런트엔드 앱 구축과 화면

와이어프레임과 디자인 가이드를 합친 설계 문서를 먼저 쓰고, 그 계획대로 `app/`을 처음부터 만들었습니다.

- Vite + React + TypeScript 프로젝트 구성과 라우터·공용 레이아웃
- 디자인 토큰(브랜드·의미 색상, 글꼴, 모서리 크기)과 Radix 기반 공용 UI 컴포넌트
- 홈, 서류 업로드·분석 진행, 위험 리포트, 계약 체크리스트, 용어 사전 화면의 첫 구현
- 홈 화면의 위험 요소·필수 확인 목록을 붉은색·초록색 배경으로 구분하는 등 시각 정리, Zip042 브랜드 적용
- 용어 사전에 사회초년생용 계약 용어 30개 추가

| 경로 | 화면 |
|---|---|
| `/` | 홈 |
| `/analyze` | 서류 업로드와 분석 진행 |
| `/analyze/documents` | 추가 서류 업로드 |
| `/analyze/details` | 계약 세부 정보 입력 |
| `/analyze/result` | 위험 리포트 |
| `/checklist` | 계약 체크리스트 |
| `/glossary` | 계약 용어 사전 |

### 2. 서류 업로드와 비동기 분석 연동

```
파일 선택 → 확장자·10MB 검사 → 서명 URL 발급 요청
        → 스토리지에 직접 업로드 (uploadToSignedUrl) → 분석 API 호출 → 결과 표시
```

파일을 백엔드를 거치지 않고 서명 URL로 스토리지에 바로 올리고, 추가 서류를 올리면 다시 분석합니다. 분석 단계 사이의 상태(`caseId`, 업로드한 파일 이름, 마지막 판정 결과)는 `AnalysisFlow`(React Context)로 관리하고 `sessionStorage`에 저장해, 새로고침해도 흐름이 이어지고 탭을 닫으면 사라지게 했습니다.

### 3. 타입과 요청을 한곳에서

- 백엔드의 OpenAPI 명세로 `openapi-typescript`를 실행해 `api-types.d.ts`를 생성했습니다. 응답 타입을 손으로 옮겨 적지 않아 백엔드와 어긋나지 않습니다
- 모든 요청은 공통 함수 `apiRequest`를 거쳐 인증 토큰을 붙이고, 실패하면 상태 코드와 내용을 담은 `ApiError`로 통일해 화면에서 같은 방식으로 처리합니다
- 주소는 법정동 코드와 좌표로 다뤄, 대전 외 지역으로 넓힐 때 화면을 고치지 않아도 되게 했습니다

### 4. 백엔드 — 계약서 초안과 특약 법조문

설계 문서와 구현 계획을 먼저 작성한 뒤 기능 단위로 나눠 구현하고 테스트했습니다.

- `GET /v1/cases/:caseId/contract-draft`: 계약서 초안을 순수 함수로 조립해 반환 (계약일·잔금일 포함)
- **국세청 사업자등록 진위확인 어댑터:** 법인 임대인 검증, 잘못된 입력값·요청 제한·추출 실패 처리
- **법제처(law.go.kr) 어댑터:** 특약마다 근거 법조문(`legalBasis`) 원문 인용, 네트워크 실패 시 폴백
- 사업자등록번호 필드와 OpenAPI 응답 스키마 추가
- 각 분기와 실패 상황을 테스트로 검증

## 폴더 구조

```
app/              프런트엔드 (React · TypeScript · Vite)
├── src/pages/    홈, 분석 단계, 결과, 체크리스트, 용어 사전
├── src/state/    AnalysisFlow (Context + sessionStorage)
└── src/lib/      apiRequest, 업로드, OpenAPI 생성 타입
app-redesign/     개편 디자인 프런트엔드
backend/          Hono + Supabase API, 규칙 엔진, 테스트
design-guide/     디자인 가이드
```

## 실행 방법

```bash
# 백엔드 (API 키 없이 목 모드로 실행)
cd backend && npm install && npm run dev:mock

# 프런트엔드
cd app && npm install && npm run dev
```
