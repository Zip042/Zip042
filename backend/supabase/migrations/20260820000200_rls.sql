-- ZIP 042 · RLS (Row Level Security)
--
-- 원칙
--  - 사용자 데이터(case 및 그 하위)는 소유자만 접근. service_role(서버)은 RLS를 우회한다.
--  - victim_properties / public_holidays 는 공개 참조 데이터이나, 피해주택 주소를 그대로 노출하면
--    2차 피해 소지가 있으므로 클라이언트 직접 SELECT는 막고 집계 RPC만 열어준다.

alter table profiles              enable row level security;
alter table cases                 enable row level security;
alter table documents             enable row level security;
alter table document_extractions  enable row level security;
alter table registry_rights       enable row level security;
alter table market_prices         enable row level security;
alter table analyses              enable row level security;
alter table analysis_findings     enable row level security;
alter table special_terms         enable row level security;
alter table schedule_events       enable row level security;
alter table interview_sessions    enable row level security;
alter table victim_properties     enable row level security;
alter table public_holidays       enable row level security;
alter table audit_logs            enable row level security;

-- profiles ------------------------------------------------------------------
create policy profiles_self_select on profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_self_upsert on profiles
  for insert to authenticated with check (id = auth.uid());
create policy profiles_self_update on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- cases ---------------------------------------------------------------------
create policy cases_owner_all on cases
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- case 소유 여부를 재사용하기 위한 헬퍼. security definer로 RLS 재귀를 피한다.
create or replace function owns_case(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from cases c where c.id = target and c.user_id = auth.uid());
$$;

revoke all on function owns_case(uuid) from public;
grant execute on function owns_case(uuid) to authenticated;

-- case 하위 테이블: 읽기만 허용. 쓰기는 서버(service_role) 전담.
create policy documents_owner_select on documents
  for select to authenticated using (owns_case(case_id));

create policy document_extractions_owner_select on document_extractions
  for select to authenticated using (owns_case(case_id));

create policy registry_rights_owner_select on registry_rights
  for select to authenticated using (owns_case(case_id));

create policy market_prices_owner_select on market_prices
  for select to authenticated using (owns_case(case_id));

create policy analyses_owner_select on analyses
  for select to authenticated using (owns_case(case_id));

create policy schedule_events_owner_select on schedule_events
  for select to authenticated using (owns_case(case_id));

create policy interview_sessions_owner_select on interview_sessions
  for select to authenticated using (owns_case(case_id));

create policy analysis_findings_owner_select on analysis_findings
  for select to authenticated using (
    exists (
      select 1 from analyses a
      where a.id = analysis_findings.analysis_id and owns_case(a.case_id)
    )
  );

create policy special_terms_owner_select on special_terms
  for select to authenticated using (
    exists (
      select 1 from analyses a
      where a.id = special_terms.analysis_id and owns_case(a.case_id)
    )
  );

-- victim_properties / public_holidays / audit_logs
--   정책을 만들지 않는다 = authenticated 는 아무 행도 볼 수 없다(RLS deny-by-default).
--   공휴일은 읽기만 열어준다 (개인정보 아님).
create policy public_holidays_read on public_holidays
  for select to authenticated, anon using (true);

-- ---------------------------------------------------------------------------
-- 지역 위험 레이어 RPC — 원시 주소를 노출하지 않는 집계 API
-- ---------------------------------------------------------------------------

-- 반경 내 피해 건수 · 최근 발생일 · 동일 건물/동일 소유자 일치 여부를 한 번에 계산한다.
create or replace function region_risk_summary(
  p_lat          double precision,
  p_lng          double precision,
  p_radius_m     integer default 500,
  p_building_key text default null,
  p_owner_key    text default null
)
returns table (
  radius_m            integer,
  victim_case_count   integer,
  victim_site_count   integer,
  nearest_distance_m  double precision,
  latest_reported_on  date,
  same_building_count integer,
  same_owner_count    integer
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with origin as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as g
  ),
  nearby as (
    select v.*
    from victim_properties v, origin o
    where v.geom is not null
      and extensions.st_dwithin(v.geom, o.g, p_radius_m)
  )
  select
    p_radius_m,
    coalesce(sum(n.case_count), 0)::integer                       as victim_case_count,
    count(n.id)::integer                                          as victim_site_count,
    (select min(extensions.st_distance(n2.geom, o.g))
       from nearby n2, origin o)                                  as nearest_distance_m,
    max(n.reported_on)                                            as latest_reported_on,
    (select coalesce(sum(v.case_count), 0)::integer
       from victim_properties v
      where p_building_key is not null and v.building_key = p_building_key) as same_building_count,
    (select coalesce(sum(v.case_count), 0)::integer
       from victim_properties v
      where p_owner_key is not null and v.owner_key = p_owner_key)          as same_owner_count
  from nearby n;
$$;

revoke all on function region_risk_summary(double precision, double precision, integer, text, text) from public;
grant execute on function region_risk_summary(double precision, double precision, integer, text, text)
  to authenticated, service_role;

-- 지도 히트맵용: 좌표를 격자(약 100m)로 뭉개서 반환한다. 개별 주소는 나가지 않는다.
create or replace function region_risk_grid(
  p_lat      double precision,
  p_lng      double precision,
  p_radius_m integer default 2000,
  p_cell_deg double precision default 0.001
)
returns table (
  cell_lat   double precision,
  cell_lng   double precision,
  case_count integer
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with origin as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as g
  )
  select
    round((v.lat / p_cell_deg))::numeric::double precision * p_cell_deg as cell_lat,
    round((v.lng / p_cell_deg))::numeric::double precision * p_cell_deg as cell_lng,
    sum(v.case_count)::integer                                          as case_count
  from victim_properties v, origin o
  where v.geom is not null
    and extensions.st_dwithin(v.geom, o.g, p_radius_m)
  group by 1, 2;
$$;

revoke all on function region_risk_grid(double precision, double precision, integer, double precision) from public;
grant execute on function region_risk_grid(double precision, double precision, integer, double precision)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Storage: 문서 버킷
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'case-documents',
  'case-documents',
  false,
  20971520, -- 20MB
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- 경로 규칙: {user_id}/{case_id}/{document_id}.{ext}
-- 첫 번째 세그먼트가 본인 uid 여야 한다.
create policy case_documents_owner_read on storage.objects
  for select to authenticated
  using (bucket_id = 'case-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy case_documents_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'case-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy case_documents_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'case-documents' and (storage.foldername(name))[1] = auth.uid()::text);
