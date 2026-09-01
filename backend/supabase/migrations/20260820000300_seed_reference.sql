-- ZIP 042 · 참조 데이터 시드
--
-- 1) 양력 고정 공휴일 (2026 ~ 2028)
--    음력 기반 공휴일(설날 · 추석 · 부처님오신날)과 대체공휴일 · 임시공휴일은 해마다 고시되므로
--    여기에 넣지 않는다. `POST /v1/admin/holidays/sync` 로 한국천문연구원 특일 정보 API에서 동기화한다.
--    → 동기화 전에는 "잔금일이 음력 연휴다"를 서버가 감지하지 못한다. 운영 전 반드시 1회 동기화할 것.

insert into public_holidays (holiday_date, name, is_synced)
select d::date, n, false
from (values
  ('2026-01-01', '신정'),   ('2026-03-01', '삼일절'), ('2026-05-05', '어린이날'),
  ('2026-06-06', '현충일'), ('2026-08-15', '광복절'), ('2026-10-03', '개천절'),
  ('2026-10-09', '한글날'), ('2026-12-25', '성탄절'),
  ('2027-01-01', '신정'),   ('2027-03-01', '삼일절'), ('2027-05-05', '어린이날'),
  ('2027-06-06', '현충일'), ('2027-08-15', '광복절'), ('2027-10-03', '개천절'),
  ('2027-10-09', '한글날'), ('2027-12-25', '성탄절'),
  ('2028-01-01', '신정'),   ('2028-03-01', '삼일절'), ('2028-05-05', '어린이날'),
  ('2028-06-06', '현충일'), ('2028-08-15', '광복절'), ('2028-10-03', '개천절'),
  ('2028-10-09', '한글날'), ('2028-12-25', '성탄절')
) as t(d, n)
on conflict (holiday_date) do nothing;

-- 2) 소액임차인 최우선변제 기준 (주택임대차보호법 시행령 제10조 · 제11조)
--    금액이 개정될 때마다 행을 추가하고 effective_from 으로 버전을 관리한다.
--    ⚠️ 아래 값은 2023-02-21 개정 기준으로 입력했다. 운영 투입 전 법제처 최신 조문으로 검증할 것.
create table if not exists small_lessee_thresholds (
  id              bigserial primary key,
  effective_from  date not null,
  region_class    text not null,  -- 'seoul' | 'overconcentration' | 'metropolitan' | 'other'
  region_label    text not null,
  max_deposit_krw bigint not null,
  priority_krw    bigint not null,
  note            text,
  unique (effective_from, region_class)
);

alter table small_lessee_thresholds enable row level security;
create policy small_lessee_thresholds_read on small_lessee_thresholds
  for select to authenticated, anon using (true);

insert into small_lessee_thresholds
  (effective_from, region_class, region_label, max_deposit_krw, priority_krw, note)
values
  ('2023-02-21', 'seoul',             '서울특별시',                        165000000, 55000000, null),
  ('2023-02-21', 'overconcentration', '수도권 과밀억제권역 · 세종 · 용인 · 화성 · 김포', 145000000, 48000000, null),
  ('2023-02-21', 'metropolitan',      '광역시(과밀억제권역·군 제외) · 안산 · 광주 · 파주 · 이천 · 평택',
                                                                            85000000, 28000000, '대전광역시가 여기에 해당'),
  ('2023-02-21', 'other',             '그 외 지역',                         75000000, 25000000, null)
on conflict (effective_from, region_class) do nothing;

-- 3) 개발용 피해주택 더미 데이터
--    실제 피해주택 주소는 개인 · 재산 정보이므로 저장소에 커밋하지 않는다.
--    아래는 좌표만 대전 서구 · 유성구 범위에 흩뿌린 완전한 가상 데이터이며,
--    운영 DB에는 절대 넣지 않는다 (source = 'dev_fixture' 로 식별 후 삭제).
do $$
declare
  i integer;
begin
  if current_setting('zip042.seed_fixtures', true) is distinct from 'on' then
    raise notice 'dev fixture 생략 (활성화: set zip042.seed_fixtures = ''on'')';
    return;
  end if;

  for i in 1..120 loop
    insert into victim_properties (
      source, source_key, road_address, building_name, sigungu,
      building_key, owner_key, lat, lng, reported_on, case_count
    )
    values (
      'dev_fixture',
      'fixture-' || i,
      '(개발용 더미) 대전광역시 서구 가상로 ' || i,
      '더미빌라 ' || i,
      case when i % 2 = 0 then '대전광역시 서구' else '대전광역시 유성구' end,
      'FIXTURE-BLDG-' || (i % 20),
      'FIXTURE-OWNER-' || (i % 8),
      case when i % 2 = 0 then 36.3504 else 36.3620 end + (i % 17) * 0.0009,
      case when i % 2 = 0 then 127.3845 else 127.3560 end + (i % 13) * 0.0011,
      date '2024-01-01' + (i * 5),
      1 + (i % 3)
    )
    on conflict (source, source_key) do nothing;
  end loop;
end $$;
