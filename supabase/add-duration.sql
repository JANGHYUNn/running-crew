-- personal_runs 에 소요 시간(duration_sec) 추가 — /me 통계의 평균 페이스·최장 시간용.
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 한 번만 실행하세요.
-- 기존 기록은 시간이 비어(NULL) 있어 페이스·최장시간 집계에서 자연히 제외됩니다.

alter table personal_runs
  add column if not exists duration_sec integer
  check (duration_sec is null or (duration_sec > 0 and duration_sec < 86400));
