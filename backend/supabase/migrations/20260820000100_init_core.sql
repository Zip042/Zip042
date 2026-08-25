-- ZIP 042 · 코어 스키마
-- 전세사기 예방 AI 서비스 — 원룸 계약 안전 검사
--
-- 설계 원칙
--  1) case(검사 건)를 루트 애그리게이트로 두고 문서 · 추출 · 분석 · 일정을 모두 case에 매단다.
--  2) AI가 뽑아낸 원문(raw jsonb)과, 서버가 정규화한 결과(테이블 컬럼)를 분리 저장한다.
--     → 규칙 엔진이 바뀌어도 재분석(re-analysis)이 가능하고, 판정 근거를 추적할 수 있다.
--  3) 판정 결과는 덮어쓰지 않고 analyses.version 으로 누적한다(감사 추적 · 규칙 버전 비교).

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "postgis" with schema extensions;

-- ---------------------------------------------------------------------------
-- ENUM
-- ---------------------------------------------------------------------------

-- 검사 결과 상태 표현 (기획서 3-4 §7 "상태 표현" 과 1:1 대응)
create type risk_level as enum ('safe', 'caution', 'danger', 'critical');

create type case_status as enum ('draft', 'ready', 'analyzing', 'analyzed', 'failed');

-- 사용자가 올리는 3종 서류
create type doc_type as enum (
  'registry',            -- 등기부등본
  'brokerage_statement', -- 중개대상물 확인·설명서
  'lease_draft',         -- 임대차 계약서 초안
  'building_ledger',     -- 건축물대장 (선택)
  'other'
);

create type doc_status as enum ('uploaded', 'processing', 'parsed', 'failed');

create type lease_type as enum (
  'jeonse',       -- 전세
  'monthly',      -- 월세
  'semi_jeonse'   -- 반전세
);

create type building_type as enum (
  'apartment',       -- 아파트
  'officetel',       -- 오피스텔
  'multi_family',    -- 다세대 (구분등기 O)
  'multi_household', -- 다가구 (단독, 구분등기 X → 선순위 보증금 확인 필수)
  'row_house',       -- 연립
  'detached',        -- 단독
  'studio',          -- 원룸(도시형생활주택 등)
  'other'
);

-- 등기부등본에서 발견되는 권리의 종류
create type right_type as enum (
  'mortgage',               -- 근저당권
  'jeonse_right',           -- 전세권
  'lease_registration',     -- 주택임차권 (임차권등기명령)
  'provisional_attachment', -- 가압류
  'attachment',             -- 압류
  'provisional_registration', -- 가등기 (소유권이전청구권 등)
  'trust',                  -- 신탁
  'auction',                -- 경매개시결정 / 강제경매
  'injunction',             -- 처분금지가처분
  'superficies',            -- 지상권
  'ownership_transfer',     -- 소유권 이전
  'other'
);

create type finding_category as enum (
  'rights',    -- 권리관계 (등기부)
  'valuation', -- 시세 · 깡통전세
  'schedule',  -- 일정 (대항력 · 확정일자)
  'document',  -- 서류 교차검증
  'region',    -- 지역 위험
  'contract'   -- 계약 조건 · 특약
);

-- ---------------------------------------------------------------------------
-- 사용자
-- ---------------------------------------------------------------------------

create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nickname    text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 검사 건 (case)
-- ---------------------------------------------------------------------------

create table cases (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title   text,
  status  case_status not null default 'draft',

  -- 매물 소재지
  road_address   text,               -- 도로명주소
  jibun_address  text,               -- 지번주소
  detail_address text,               -- 동 · 호
  region_code    text,               -- 법정동코드 10자리 (실거래가 API lawd_cd 앞 5자리 추출용)
  sigungu        text,               -- 예: 대전광역시 서구
  lat            double precision,
  lng            double precision,
  geom           extensions.geography (Point, 4326),

  -- 매물 제원
  building_type     building_type,
  exclusive_area_m2 numeric(10, 4),  -- 전용면적
  floor             integer,
  total_floors      integer,
  built_year        integer,
  household_count   integer,         -- 다가구인 경우 총 세대수

  -- 거래 조건 (프론트에서 입력받는 값)
  lease_type           lease_type not null default 'monthly',
  deposit_krw          bigint not null default 0 check (deposit_krw >= 0),
  monthly_rent_krw     bigint not null default 0 check (monthly_rent_krw >= 0),
  maintenance_fee_krw  bigint not null default 0 check (maintenance_fee_krw >= 0),
  contract_term_months integer not null default 24 check (contract_term_months between 1 and 120),

  -- 일정 (프론트에서 입력받는 값 → 서버가 대항력/우선변제권 시점을 계산)
  contract_date               date, -- 계약 예정일
  balance_date                date, -- 잔금 예정일
  move_in_date                date, -- 입주(인도) 예정일. 비우면 잔금일과 동일 취급
  resident_registration_date  date, -- 전입신고 예정일
  confirmed_date_plan         date, -- 확정일자 신청 예정일. 비우면 계약일과 동일 취급

  -- 사용자가 아는 시세를 직접 입력한 경우 (공공 API 조회 실패 시 폴백)
  user_market_price_krw bigint check (user_market_price_krw is null or user_market_price_krw > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint cases_schedule_order check (
    contract_date is null or balance_date is null or contract_date <= balance_date
  )
);

create index cases_user_id_idx on cases (user_id, created_at desc);
create index cases_geom_idx on cases using gist (geom);

-- geom은 lat/lng에서 파생. 애플리케이션이 신경 쓰지 않도록 트리거로 동기화한다.
create or replace function sync_case_geom()
returns trigger
language plpgsql
as $$
begin
  if new.lat is not null and new.lng is not null then
    new.geom := extensions.st_setsrid(extensions.st_makepoint(new.lng, new.lat), 4326)::extensions.geography;
  else
    new.geom := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger cases_sync_geom
  before insert or update of lat, lng on cases
  for each row execute function sync_case_geom();

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on profiles
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- 문서
-- ---------------------------------------------------------------------------

create table documents (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references cases (id) on delete cascade,
  doc_type      doc_type not null,
  storage_path  text not null,          -- Supabase Storage: documents/{user_id}/{case_id}/{uuid}.pdf
  original_name text,
  mime_type     text not null,
  size_bytes    bigint not null check (size_bytes > 0),
  page_count    integer,
  status        doc_status not null default 'uploaded',
  error_message text,
  uploaded_at   timestamptz not null default now(),
  parsed_at     timestamptz
);

create index documents_case_idx on documents (case_id, doc_type);

-- AI가 문서에서 추출한 구조화 결과 (원문 보존)
create table document_extractions (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null unique references documents (id) on delete cascade,
  case_id      uuid not null references cases (id) on delete cascade,
  doc_type     doc_type not null,
  model        text not null,
  schema_version text not null,
  payload      jsonb not null,          -- 스키마별 추출 결과 원문
  confidence   numeric(4, 3),           -- 0.000 ~ 1.000
  warnings     jsonb not null default '[]'::jsonb,
  usage        jsonb,                   -- 토큰 사용량 (비용 추적)
  created_at   timestamptz not null default now()
);

create index document_extractions_case_idx on document_extractions (case_id, doc_type);

-- 등기부등본 권리 목록 정규화 (규칙 엔진 입력)
create table registry_rights (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references cases (id) on delete cascade,
  document_id  uuid not null references documents (id) on delete cascade,
  section      text not null check (section in ('gap', 'eul')), -- 갑구 / 을구
  rank_no      text,                    -- 순위번호 (예: "3-1")
  right_type   right_type not null,
  holder       text,                    -- 권리자
  max_claim_krw bigint check (max_claim_krw is null or max_claim_krw >= 0), -- 채권최고액
  registered_on date,
  is_cancelled boolean not null default false, -- 말소 여부
  note         text,
  created_at   timestamptz not null default now()
);

create index registry_rights_case_idx on registry_rights (case_id) where is_cancelled = false;

-- ---------------------------------------------------------------------------
-- 시세
-- ---------------------------------------------------------------------------

create table market_prices (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references cases (id) on delete cascade,
  source       text not null,   -- 'molit_rtms' | 'public_notice_price' | 'user_input' | 'manual'
  method       text not null,   -- 산정 방법 설명 (예: 'unit_price_median_12m')
  estimated_krw bigint not null check (estimated_krw > 0),
  low_krw      bigint,
  high_krw     bigint,
  sample_size  integer,
  confidence   numeric(4, 3),
  raw          jsonb,
  created_at   timestamptz not null default now()
);

create index market_prices_case_idx on market_prices (case_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 분석 결과
-- ---------------------------------------------------------------------------

create table analyses (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references cases (id) on delete cascade,
  version      integer not null,
  rules_version text not null,             -- 규칙 엔진 버전 (재현성)
  verdict      risk_level not null,
  score        integer not null check (score between 0 and 100), -- 위험 점수 (높을수록 위험)
  contractable boolean not null,           -- "계약해도 되는지"
  headline     text not null,              -- 한 줄 요약 (쉬운 말)
  summary      text not null,              -- 본문 요약 (쉬운 말)
  payload      jsonb not null,             -- 계산 중간값 전체 (시세/부담률/일정 등)
  created_at   timestamptz not null default now(),
  unique (case_id, version)
);

create index analyses_case_idx on analyses (case_id, version desc);

create table analysis_findings (
  id          uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references analyses (id) on delete cascade,
  code        text not null,        -- 예: 'RIGHTS_TRUST_REGISTERED'
  category    finding_category not null,
  severity    risk_level not null,
  weight      integer not null default 0, -- 점수 기여도
  title       text not null,        -- 사용자용 제목 (쉬운 말)
  description text not null,        -- 왜 위험한지
  action      text,                 -- "무엇을 요구해야 하는지"
  evidence    jsonb not null default '{}'::jsonb, -- 판정 근거 (숫자 · 문서 위치)
  sort_order  integer not null default 0
);

create index analysis_findings_analysis_idx on analysis_findings (analysis_id, sort_order);

-- 특약 추천
create table special_terms (
  id           uuid primary key default gen_random_uuid(),
  analysis_id  uuid not null references analyses (id) on delete cascade,
  code         text not null,
  category     text not null,
  priority     integer not null default 0,   -- 낮을수록 우선
  required     boolean not null default false, -- 필수(빠지면 계약 보류) 여부
  title        text not null,
  clause_text  text not null,   -- 계약서에 그대로 붙일 수 있는 문구
  reason       text not null,   -- 왜 필요한지 (쉬운 말)
  triggered_by text[] not null default '{}'  -- 이 특약을 유발한 finding code 목록
);

create index special_terms_analysis_idx on special_terms (analysis_id, priority);

-- 일정 타임라인 (서버가 가공한 결과)
create table schedule_events (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references cases (id) on delete cascade,
  analysis_id  uuid references analyses (id) on delete cascade,
  code         text not null,       -- 예: 'MOVE_IN_REGISTER'
  event_date   date not null,
  effective_at timestamptz,         -- 법적 효력 발생 시점 (대항력: 전입 다음날 0시)
  severity     risk_level not null default 'safe',
  title        text not null,
  description  text not null,
  checklist    jsonb not null default '[]'::jsonb,
  sort_order   integer not null default 0
);

create index schedule_events_case_idx on schedule_events (case_id, event_date);

-- ---------------------------------------------------------------------------
-- 대화형 후속 질문 (기획서 2 ④)
-- ---------------------------------------------------------------------------

create table interview_sessions (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references cases (id) on delete cascade,
  status       text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  asked_codes  text[] not null default '{}',
  answers      jsonb not null default '{}'::jsonb, -- { question_code: answer }
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

create index interview_sessions_case_idx on interview_sessions (case_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 지역 위험 레이어 (기획서 2 ②)
-- ---------------------------------------------------------------------------

-- 대전시 전세사기 피해주택 소재지 데이터. 공공 API를 배치로 동기화한다.
create table victim_properties (
  id            uuid primary key default gen_random_uuid(),
  source        text not null,               -- 데이터 출처 (예: 'daejeon_open_api')
  source_key    text,                        -- 출처 측 고유키 (업서트용)
  road_address  text,
  jibun_address text,
  building_name text,
  sigungu       text,
  legal_dong    text,
  -- 동일 건물 탐지용 키: 도로명주소를 정규화한 값
  building_key  text,
  -- 동일 소유자 탐지용: 이름 원문을 저장하지 않고 해시만 저장한다 (개인정보 최소화)
  owner_key     text,
  lat           double precision,
  lng           double precision,
  geom          extensions.geography (Point, 4326),
  reported_on   date,
  case_count    integer not null default 1 check (case_count > 0),
  damage_krw    bigint,
  raw           jsonb,
  created_at    timestamptz not null default now(),
  unique (source, source_key)
);

create index victim_properties_geom_idx on victim_properties using gist (geom);
create index victim_properties_building_idx on victim_properties (building_key) where building_key is not null;
create index victim_properties_owner_idx on victim_properties (owner_key) where owner_key is not null;

create or replace function sync_victim_geom()
returns trigger
language plpgsql
as $$
begin
  if new.lat is not null and new.lng is not null then
    new.geom := extensions.st_setsrid(extensions.st_makepoint(new.lng, new.lat), 4326)::extensions.geography;
  else
    new.geom := null;
  end if;
  return new;
end;
$$;

create trigger victim_properties_sync_geom
  before insert or update of lat, lng on victim_properties
  for each row execute function sync_victim_geom();

-- ---------------------------------------------------------------------------
-- 공휴일 (잔금일이 휴일이면 확정일자 · 전입신고를 당일 처리할 수 없다 → 일정 경고)
-- ---------------------------------------------------------------------------

create table public_holidays (
  holiday_date date primary key,
  name         text not null,
  -- 음력 기반 공휴일(설날 · 추석 · 부처님오신날)과 대체공휴일은 매년 확정 고시되므로
  -- 한국천문연구원 특일 정보 API로 동기화한다. is_synced=false는 코드에 하드코딩된 양력 고정 공휴일.
  is_synced    boolean not null default false
);

-- ---------------------------------------------------------------------------
-- 감사 로그
-- ---------------------------------------------------------------------------

create table audit_logs (
  id         bigserial primary key,
  user_id    uuid references auth.users (id) on delete set null,
  case_id    uuid references cases (id) on delete set null,
  action     text not null,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_case_idx on audit_logs (case_id, created_at desc);
