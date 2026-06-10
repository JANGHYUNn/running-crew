-- 조별 누적거리 챌린지 스키마
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 실행하세요.
--
-- 구조: 시즌(월간 기간) → 조(team) → 멤버(member) → 런(run, 매 런 1행)
-- 리더보드 = 시즌 기간 내 런을 조별로 SUM 해서 순위.
--
-- 보안: 50~70명 신뢰 그룹 + 로그인 없음 전제라 anon 키로 읽기/쓰기를 모두 허용한다.
-- 부정입력이 우려되면 나중에 정책을 조이거나(예: 관리자 PIN), 인증 이미지 필수로 강화.

-- ── 테이블 ───────────────────────────────────────────────
create table if not exists seasons (
  id         uuid primary key default gen_random_uuid(),
  name       text        not null,            -- "2026년 6월" 등
  start_date date        not null,
  end_date   date        not null,
  created_at timestamptz not null default now()
);

create table if not exists teams (
  id        uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  name      text not null                      -- "1조" 등
);

create table if not exists members (
  id      uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  name    text not null
);

create table if not exists runs (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references members(id) on delete cascade,
  distance_km numeric(6,2) not null check (distance_km > 0 and distance_km < 1000),
  run_date    date not null,
  note        text,                            -- 장소/메모(선택)
  image_url   text,                            -- 인증 이미지(선택, 추후 Storage 연동)
  image_hash  text,                            -- 업로드 이미지 sha256(중복 재업로드 차단용)
  created_at  timestamptz not null default now()
);

-- 이미 runs 테이블이 있는 경우(기존 DB) 컬럼만 추가:
alter table runs add column if not exists image_hash text;

-- 조회 성능용 인덱스
create index if not exists idx_teams_season  on teams(season_id);
create index if not exists idx_members_team  on members(team_id);
create index if not exists idx_runs_member   on runs(member_id);
create index if not exists idx_runs_date     on runs(run_date);
create index if not exists idx_runs_hash     on runs(image_hash);

-- ── RLS: 전체 허용(신뢰 그룹 전제) ─────────────────────────
-- ⚠️ anon 뿐 아니라 authenticated 도 허용해야 한다.
-- 카카오 로그인(/me)을 한 사용자는 요청 역할이 anon → authenticated 로 바뀌므로,
-- to anon 으로만 두면 로그인한 사람은 RLS 위반("new row violates row-level
-- security policy")이 난다. 그래서 두 역할 모두에 정책을 건다.
alter table seasons enable row level security;
alter table teams   enable row level security;
alter table members enable row level security;
alter table runs    enable row level security;

-- 기존 정책 정리 후 재생성(재실행 안전)
do $$
declare t text;
begin
  foreach t in array array['seasons','teams','members','runs'] loop
    execute format('drop policy if exists %I_all on %I', t, t);
    execute format(
      'create policy %I_all on %I for all to anon, authenticated using (true) with check (true)',
      t, t);
  end loop;
end $$;
