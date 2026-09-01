-- ZIP 042 · RLS 경계 검증
--
-- 실행 방법 (로컬 Supabase):
--   supabase db reset
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" -f supabase/tests/verify_rls.sql
--
-- 이 스크립트는 "사용자 A 가 B 의 데이터를 볼 수 없다"는 것을 실제로 확인한다.
-- 정책을 고칠 때마다 돌려야 한다 — RLS 는 이 서비스의 유일한 데이터 격리 장치다.
--
-- ⚠️ 테스트 데이터를 삽입하므로 **운영 DB에서 실행하지 말 것**. 끝에서 정리한다.

\set ON_ERROR_STOP on

begin;

-- auth.uid() 를 세션 설정에서 읽도록 임시 대체해 사용자를 시뮬레이션한다.
-- (트랜잭션을 롤백하므로 원본 함수는 그대로 남는다.)
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('test.uid', true), '')::uuid $$;

insert into auth.users (id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002')
on conflict (id) do nothing;

insert into cases (id, user_id, road_address, deposit_krw, lat, lng) values
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'RLS테스트 A의 집', 100000000, 36.35, 127.38),
  ('22222222-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002',
   'RLS테스트 B의 집', 200000000, 36.36, 127.39);

insert into analyses (case_id, version, rules_version, verdict, score, contractable, headline, summary, payload)
values ('22222222-0000-0000-0000-000000000002', 1, 'test', 'danger', 40, false, 'B', 'B', '{}');

insert into victim_properties (source, source_key, road_address, lat, lng)
values ('rls_test', 'rls-1', 'RLS테스트 피해주택', 36.35, 127.38)
on conflict (source, source_key) do nothing;

-- ---------------------------------------------------------------------------
-- 검증
-- ---------------------------------------------------------------------------

do $$
declare
  visible integer;
  failures text[] := '{}';
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', true);

  select count(*) into visible from cases;
  if visible <> 1 then
    failures := failures || format('cases: 자기 것 1건만 보여야 하는데 %s건', visible);
  end if;

  select count(*) into visible from cases where id = '22222222-0000-0000-0000-000000000002';
  if visible <> 0 then
    failures := failures || 'cases: 남의 case 가 ID 직접 지정으로 노출됨';
  end if;

  select count(*) into visible from analyses;
  if visible <> 0 then
    failures := failures || 'analyses: 남의 분석 결과가 노출됨';
  end if;

  -- 피해주택은 정책이 없으므로(deny-by-default) 클라이언트가 원본을 볼 수 없어야 한다.
  select count(*) into visible from victim_properties;
  if visible <> 0 then
    failures := failures || 'victim_properties: 피해주택 원본이 노출됨 (개인정보 위험)';
  end if;

  -- 공휴일은 공개 참조 데이터이므로 보여야 한다.
  select count(*) into visible from public_holidays;
  if visible = 0 then
    failures := failures || 'public_holidays: 공개 참조 데이터를 읽지 못함';
  end if;

  select count(*) into visible from small_lessee_thresholds;
  if visible = 0 then
    failures := failures || 'small_lessee_thresholds: 공개 참조 데이터를 읽지 못함';
  end if;

  -- 남의 user_id 로 case 를 만들 수 없어야 한다.
  begin
    insert into cases (user_id, road_address, deposit_krw)
    values ('bbbbbbbb-0000-0000-0000-000000000002', 'RLS테스트 위조', 1);
    failures := failures || 'cases: 남의 user_id 로 삽입이 성공함 (심각)';
  exception when others then
    null; -- 기대한 동작
  end;

  perform set_config('role', 'none', true);
  reset role;

  if array_length(failures, 1) > 0 then
    raise exception E'RLS 검증 실패:\n  - %', array_to_string(failures, E'\n  - ');
  end if;

  raise notice '✓ RLS 검증 통과 — 사용자 격리 · 피해주택 비공개 · 참조 데이터 공개가 모두 정상';
end $$;

-- ---------------------------------------------------------------------------
-- 지역 위험 RPC 동작 확인
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  select * into r from region_risk_summary(36.35, 127.38, 500);
  if r.victim_case_count < 1 then
    raise exception 'region_risk_summary: 반경 내 피해가 집계되지 않음 (geom 트리거 확인 필요)';
  end if;
  if r.nearest_distance_m is null then
    raise exception 'region_risk_summary: 최근접 거리가 계산되지 않음';
  end if;
  raise notice '✓ region_risk_summary 정상 (건수 %, 최근접 %m)',
    r.victim_case_count, round(r.nearest_distance_m);
end $$;

rollback;

\echo '검증 완료 — 모든 테스트 데이터는 롤백되었습니다.'
