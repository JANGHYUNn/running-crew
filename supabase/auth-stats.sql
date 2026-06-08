-- 카카오 로그인 기반 개인 기록 통계 스키마 (/me 기능)
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 실행하세요. (한 번만)
--
-- 기존 /challenge 와 독립된 데이터셋입니다.
-- 구조: auth.users(카카오 로그인) ─ profiles(닉네임/아바타) ─ personal_runs(매 런 1행, user 소유)
-- 통계 = personal_runs 를 user 별로 SUM(누적/월별/주별), 랭킹 = user 간 누적거리 순위.
--
-- 보안: 읽기(select)는 anon 포함 전체 허용 — 비로그인도 크루 통계·랭킹을 한눈에 볼 수 있게.
--       (기존 /challenge 와 동일한 신뢰그룹 전제) 쓰기/수정/삭제는 로그인 본인 행만(auth.uid()).

-- ── 테이블 ───────────────────────────────────────────────
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nickname   text,
  avatar_url text,
  updated_at timestamptz not null default now()
);

create table if not exists personal_runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  distance_km numeric(6,2) not null check (distance_km > 0 and distance_km < 1000),
  run_date    date not null,
  note        text,
  image_url   text,
  image_hash  text,
  created_at  timestamptz not null default now()
);

-- 조회 성능용 인덱스
create index if not exists idx_pruns_user on personal_runs(user_id);
create index if not exists idx_pruns_date on personal_runs(run_date);
create index if not exists idx_pruns_hash on personal_runs(image_hash);

-- ── RLS ──────────────────────────────────────────────────
alter table profiles      enable row level security;
alter table personal_runs enable row level security;

-- profiles: 누구나 읽기(랭킹/이름 노출), 본인 행만 생성/수정
drop policy if exists profiles_select       on profiles;
drop policy if exists profiles_upsert_self  on profiles;
drop policy if exists profiles_update_self  on profiles;
create policy profiles_select on profiles
  for select to anon, authenticated using (true);
create policy profiles_upsert_self on profiles
  for insert to authenticated with check (auth.uid() = id);
create policy profiles_update_self on profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- personal_runs: 누구나 읽기(크루 통계/랭킹/기록 열람), 본인 행만 생성/수정/삭제
drop policy if exists pruns_select       on personal_runs;
drop policy if exists pruns_insert_self  on personal_runs;
drop policy if exists pruns_update_self  on personal_runs;
drop policy if exists pruns_delete_self  on personal_runs;
create policy pruns_select on personal_runs
  for select to anon, authenticated using (true);
create policy pruns_insert_self on personal_runs
  for insert to authenticated with check (auth.uid() = user_id);
create policy pruns_update_self on personal_runs
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy pruns_delete_self on personal_runs
  for delete to authenticated using (auth.uid() = user_id);

-- ── Storage: 기존 proofs 버킷을 로그인 사용자도 쓸 수 있게 ──────
-- 기존 supabase/storage.sql 은 anon 롤만 허용 → 로그인 사용자(authenticated)용 정책 추가.
drop policy if exists proofs_read_auth   on storage.objects;
drop policy if exists proofs_insert_auth on storage.objects;
drop policy if exists proofs_delete_auth on storage.objects;
create policy proofs_read_auth on storage.objects
  for select to authenticated using (bucket_id = 'proofs');
create policy proofs_insert_auth on storage.objects
  for insert to authenticated with check (bucket_id = 'proofs');
create policy proofs_delete_auth on storage.objects
  for delete to authenticated using (bucket_id = 'proofs');
