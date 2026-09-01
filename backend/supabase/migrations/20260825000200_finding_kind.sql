-- ZIP 042 · analysis_findings 에 kind 컬럼 추가
--
-- ## 왜 필요한가 (설계 원칙 3)
--
-- `Finding.kind` 는 "이 집에 실제로 존재하는 위험(risk)"과 "서류가 없어서 확인하지 못한
-- 항목(info_gap)"을 가르는 축이다. 이 구분이 없으면 "사진이 흐리다"가 "경매가 진행 중이다"와
-- 같은 무게로 쌓여 판정이 무의미해진다 — 초기 구현에서 실제로 "사진이 흐림"만으로
-- 87점 매우위험이 나왔던 문제다.
--
-- 그런데 판정을 **저장할 때 이 컬럼이 없어서** kind 가 통째로 버려지고 있었다.
-- 그래서 `GET /v1/cases/{id}/analysis` 의 findings 배열은 모든 항목이 kind 없이 돌아왔고,
-- 프론트엔드가 `kind` 로 두 축을 나누려 해도 나눌 수 없었다(전부 위험으로 보임).
-- `verdict.informationGaps` 에는 남아 있었기 때문에 같은 항목이 양쪽에 중복 노출됐다.
--
-- 기존 행은 'risk' 로 채운다. 과거 판정의 info_gap 여부는 복원할 수 없지만,
-- 그 값들은 `analyses.payload` 안의 verdict.informationGaps 에 남아 있다.

alter table analysis_findings
  add column kind text not null default 'risk'
    check (kind in ('risk', 'info_gap'));

comment on column analysis_findings.kind is
  'risk = 실제 위험 / info_gap = 확인하지 못한 항목. info_gap 은 위험 점수에 더해지지 않는다.';

-- 목록 화면이 위험만 빠르게 뽑을 수 있게 한다.
create index analysis_findings_kind_idx on analysis_findings (analysis_id, kind);
