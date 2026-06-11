-- intervals.icu OAuth 토큰 저장 (지도 레이어 기능 전용)
-- 카카오 로그인(Supabase auth) 사용자별로 icu 토큰을 1행 보관한다.
-- Supabase 대시보드 → SQL Editor 에 붙여넣어 실행. (재실행 안전)
--
-- ⚠️ intervals.icu 는 refresh token 을 쓰지 않고 장수명 access token 만 발급한다.
--    → refresh_token / expires_at 은 nullable (보관 안 함). 재인증 시 새 access token 으로 대체.

create table if not exists icu_tokens (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  athlete_id    text,                          -- icu athlete id (예: i609347)
  access_token  text        not null,
  refresh_token text,                          -- icu 미사용(항상 null)
  expires_at    timestamptz,                   -- icu 미사용(토큰 장수명)
  scope         text,
  display_name  text,                          -- 표시용 닉네임(웹훅 점령 시 owner_name 으로 사용)
  updated_at    timestamptz not null default now()
);

-- 이미 not null 로 만들어진 기존 테이블을 nullable 로 완화(재실행 안전).
alter table icu_tokens alter column refresh_token drop not null;
alter table icu_tokens alter column expires_at   drop not null;
-- 기존 테이블에 display_name 컬럼 추가(재실행 안전).
alter table icu_tokens add column if not exists display_name text;

-- 웹훅 Worker(service_role)가 athlete_id 로 토큰을 찾을 수 있게 인덱스(선택).
create index if not exists icu_tokens_athlete on icu_tokens (athlete_id);

alter table icu_tokens enable row level security;

-- 본인 토큰만 읽기/쓰기. 남의 토큰은 접근 불가(auth.uid() = user_id).
drop policy if exists icu_tokens_own on icu_tokens;
create policy icu_tokens_own on icu_tokens
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
