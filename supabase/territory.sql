-- 땅따먹기(territory) — 크루원이 달린 ~50m 셀을 점령. 점령 규칙: "최신 점령 우선"(뺏기 가능).
-- Supabase 대시보드 → SQL Editor 에 붙여넣어 실행. (재실행 안전)
--
-- 셀은 정수 좌표(x,y)로 식별(격자 계산은 lib/territory.ts). 셀당 1행(현재 소유자).
-- 읽기는 로그인 유저 전체 허용(지도·리더보드 공유). 쓰기는 claim_cells RPC 로만 — 본인 명의로,
-- 기존 점령보다 "나중" 기록일 때만 소유권을 가져온다.

create table if not exists territory_cells (
  cell_key    text        primary key,   -- 'x_y'
  x           int         not null,
  y           int         not null,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  owner_name  text,                       -- 표시용 닉네임(비정규화 — 클라에서 auth.users 조인 불가)
  claimed_at  timestamptz not null default now(),  -- 활동 시각(이 값이 클수록 최신 점령)
  activity_id text
);

create index if not exists territory_cells_user on territory_cells (user_id);

alter table territory_cells enable row level security;

-- 점령 현황은 로그인한 크루원 누구나 읽기(지도 색칠·리더보드 공유 목적).
drop policy if exists territory_read on territory_cells;
create policy territory_read on territory_cells
  for select to authenticated using (true);

-- ⚠️ 직접 INSERT/UPDATE 정책은 두지 않는다. 남의 셀을 뺏는 동작이 필요해 본인-only RLS 로는 불가.
--    대신 claim_cells RPC(SECURITY DEFINER)가 규칙을 강제하며 RLS 를 우회한다.

-- 셀 점령 RPC.
--   cells: [{ "k": "x_y", "x": 12, "y": 34 }, ...]
--   소유자는 항상 호출자(auth.uid()). 기존 claimed_at 보다 나중일 때만 덮어쓴다(최신 우선).
--   반환: 새로 점령/갱신된 셀 수.
create or replace function claim_cells(
  cells jsonb,
  p_owner_name text,
  p_claimed_at timestamptz,
  p_activity_id text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  changed int;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  insert into territory_cells (cell_key, x, y, user_id, owner_name, claimed_at, activity_id)
  select
    (c->>'k'),
    (c->>'x')::int,
    (c->>'y')::int,
    uid,
    p_owner_name,
    p_claimed_at,
    p_activity_id
  from jsonb_array_elements(cells) as c
  on conflict (cell_key) do update
    set user_id     = excluded.user_id,
        owner_name  = excluded.owner_name,
        claimed_at  = excluded.claimed_at,
        activity_id = excluded.activity_id
    where excluded.claimed_at > territory_cells.claimed_at;

  get diagnostics changed = row_count;
  return changed;
end;
$$;

grant execute on function claim_cells(jsonb, text, timestamptz, text) to authenticated;

-- ── "최근 N일"만 인정(감쇠) ───────────────────────────────
-- 점령 인정 기간은 클라이언트 읽기에서 claimed_at >= now()-N일 로 필터한다(lib/territory.ts WINDOW_DAYS).
-- 기간 지난 행은 카운트되지 않을 뿐 자동 삭제되진 않으므로, 가끔 정리하려면 아래를 실행(선택):
--   delete from territory_cells where claimed_at < now() - interval '14 days';
