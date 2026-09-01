-- ZIP 042 · 분석 작업 큐 + 알림 발송함
--
-- 두 가지를 추가한다.
--  1) analysis_jobs      : 문서 판독이 20~60초 걸리므로 비동기 실행 경로가 필요하다.
--  2) notification_outbox: 일정 알림을 "언제 무엇을 보낼지" 계산해 쌓아둔다.
--                          실제 발송 채널(푸시·알림톡)은 나중에 붙이고, 여기까지가 서버 책임이다.

-- ---------------------------------------------------------------------------
-- 분석 작업 큐
-- ---------------------------------------------------------------------------

create type job_status as enum ('queued', 'running', 'succeeded', 'failed', 'canceled');

create table analysis_jobs (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references cases (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  status       job_status not null default 'queued',
  /** 0~100. 단계별로 갱신해 프론트엔드가 진행률을 보여줄 수 있게 한다. */
  progress     integer not null default 0 check (progress between 0 and 100),
  /** 현재 수행 중인 단계 (사용자에게 보여줄 문구) */
  step         text,
  options      jsonb not null default '{}'::jsonb,
  /** 성공 시 생성된 분석 버전 */
  analysis_version integer,
  error_code   text,
  error_message text,
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz
);

create index analysis_jobs_case_idx on analysis_jobs (case_id, created_at desc);
-- 같은 case 에 동시에 여러 작업이 도는 것을 막는다. 진행 중인 작업은 케이스당 1건.
create unique index analysis_jobs_active_uniq
  on analysis_jobs (case_id)
  where status in ('queued', 'running');

-- ---------------------------------------------------------------------------
-- 알림 발송함
-- ---------------------------------------------------------------------------

create type notification_channel as enum ('push', 'kakao', 'email', 'none');
create type notification_status as enum ('pending', 'sent', 'skipped', 'failed');

create table notification_outbox (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references cases (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  /** 어떤 일정에 대한 알림인지 (schedule_events.code) */
  event_code   text not null,
  /** 알림 규칙 코드. 예: 'D_MINUS_1', 'D_DAY' */
  rule_code    text not null,
  /** 보낼 날짜 (KST 기준). 이 날 배치가 집어간다. */
  send_on      date not null,
  event_date   date not null,
  severity     risk_level not null default 'safe',
  title        text not null,
  body         text not null,
  /** 알림에서 바로 열 화면 */
  deep_link    text,
  channel      notification_channel not null default 'push',
  status       notification_status not null default 'pending',
  sent_at      timestamptz,
  error_message text,
  created_at   timestamptz not null default now(),
  -- 같은 일정 · 같은 규칙으로 두 번 만들지 않는다 (재분석 시 중복 방지).
  unique (case_id, event_code, rule_code)
);

create index notification_outbox_due_idx
  on notification_outbox (send_on, status)
  where status = 'pending';
create index notification_outbox_case_idx on notification_outbox (case_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table analysis_jobs enable row level security;
alter table notification_outbox enable row level security;

-- 사용자는 자기 작업의 상태만 읽는다. 생성·수정은 서버(service_role) 전담.
create policy analysis_jobs_owner_select on analysis_jobs
  for select to authenticated using (user_id = auth.uid());

create policy notification_outbox_owner_select on notification_outbox
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 유지보수
-- ---------------------------------------------------------------------------

/**
 * 서버가 재시작되면 in-process 러너가 사라져 'running' 작업이 영원히 남는다.
 * 부팅 시 이 함수를 호출해 오래된 진행 중 작업을 실패로 정리한다.
 */
create or replace function reap_stale_analysis_jobs(p_older_than_minutes integer default 15)
returns integer
language sql
security definer
set search_path = public
as $$
  with stale as (
    update analysis_jobs
       set status = 'failed',
           error_code = 'STALE',
           error_message = '서버가 재시작되어 작업이 중단되었습니다. 다시 시도해 주세요.',
           finished_at = now()
     where status in ('queued', 'running')
       and created_at < now() - make_interval(mins => p_older_than_minutes)
    returning 1
  )
  select coalesce(count(*), 0)::integer from stale;
$$;

revoke all on function reap_stale_analysis_jobs(integer) from public;
grant execute on function reap_stale_analysis_jobs(integer) to service_role;
