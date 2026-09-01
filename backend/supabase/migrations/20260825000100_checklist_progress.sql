-- ZIP 042 · 계약 체크리스트 진행 상태
--
-- 프론트엔드 `/checklist` 화면의 체크 상태를 저장한다.
--
-- ## 왜 case 에 매달지 않는가
--
-- 체크리스트 화면은 검사 건(case) 없이도 열리는 독립 메뉴다("계약 체크리스트" 상단 네비).
-- 집을 보러 다니는 단계 — 즉 아직 올릴 서류도 매물도 정해지지 않은 시점 — 부터 쓰는 것이
-- 이 화면의 목적이므로, case 를 만들어야만 저장되게 하면 가장 필요한 순간에 못 쓴다.
--
-- 그래서 **사용자당 한 줄**로 둔다. 나중에 "검사 건별 체크리스트"가 필요해지면
-- nullable case_id 를 추가하고 unique 를 (user_id, case_id) 로 넓히면 된다(가산 변경).
--
-- 항목 목록 자체는 DB 에 두지 않는다. `src/domain/checklist.ts` 의 순수 데이터이며,
-- 여기에는 **사용자가 체크한 id 만** 저장한다. 항목 문구를 고치는 데 마이그레이션이
-- 필요해지면 아무도 문구를 고치지 않게 된다.

create table checklist_progress (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  -- domain/checklist.ts 의 ChecklistItem.id 목록. 알 수 없는 id 는 서버가 걸러 저장한다.
  checked_item_ids text[] not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table checklist_progress is
  '계약 단계별 체크리스트의 사용자별 체크 상태. 항목 정의는 코드(domain/checklist.ts)에 있다.';

alter table checklist_progress enable row level security;

-- 본인 행만 읽고 쓸 수 있다. service_role 은 RLS 를 우회한다.
create policy checklist_progress_owner_all on checklist_progress
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- updated_at 자동 갱신. 다른 테이블과 같은 트리거 함수를 재사용한다.
create trigger checklist_progress_touch_updated_at
  before update on checklist_progress
  for each row execute function touch_updated_at();
