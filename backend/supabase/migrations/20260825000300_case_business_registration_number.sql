-- backend/supabase/migrations/20260825000300_case_business_registration_number.sql
-- ZIP 042 · cases 에 사업자등록번호 컬럼 추가
--
-- 법인 임대인의 국세청 사업자등록정보 진위확인(business-registration.service.ts)에 쓰인다.
-- 등기부에는 법인등록번호만 나오고 사업자등록번호는 별개 번호 체계라 문서에서 자동으로
-- 추출되지 않는다 — 사용자가 화면에서 직접 입력한다.

alter table cases
  add column business_registration_number text
    check (business_registration_number is null or business_registration_number ~ '^\d{3}-\d{2}-\d{5}$');

comment on column cases.business_registration_number is
  '000-00-00000 형식. 법인 임대인일 때만 사용자가 입력. 국세청 진위확인 API 입력값.';
