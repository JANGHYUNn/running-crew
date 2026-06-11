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

-- 점령에 "이미 사용한 활동" 기록 — 같은 활동을 두 번 점령에 못 쓰게(브라우저/기기 무관).
create table if not exists territory_activities (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  activity_id text        not null,
  claimed_at  timestamptz not null default now(),
  primary key (user_id, activity_id)
);

alter table territory_activities enable row level security;

-- 본인 사용 기록만 읽기(클라가 "점령됨" 표시·중복 스킵에 사용). 쓰기는 claim_cells 전용.
drop policy if exists territory_activities_own on territory_activities;
create policy territory_activities_own on territory_activities
  for select to authenticated using (auth.uid() = user_id);

-- 셀 점령 핵심 로직(소유자를 명시적으로 받음). 클라/서버(웹훅) 양쪽에서 공유.
--   cells: [{ "k": "x_y", "x": 12, "y": 34 }, ...]
--   기존 claimed_at 보다 나중일 때만 덮어쓴다(최신 우선).
--   ⚠️ 한 활동(p_activity_id)은 1회만 점령에 사용 가능 — 이미 쓴 활동이면 -1 반환(셀 변경 없음).
--   반환: 새로 점령/갱신된 셀 수(이미 사용한 활동이면 -1).
create or replace function claim_cells_for(
  p_user_id uuid,
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
  changed int;
begin
  if p_user_id is null then
    raise exception 'user id required';
  end if;

  -- 이 활동을 처음 쓰는 경우에만 진행. 이미 기록돼 있으면(중복) 아무것도 안 하고 -1.
  insert into territory_activities (user_id, activity_id, claimed_at)
    values (p_user_id, p_activity_id, p_claimed_at)
    on conflict do nothing;
  if not found then
    return -1;
  end if;

  insert into territory_cells (cell_key, x, y, user_id, owner_name, claimed_at, activity_id)
  select
    (c->>'k'),
    (c->>'x')::int,
    (c->>'y')::int,
    p_user_id,
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

-- 서버 전용(웹훅 Worker가 service_role 키로 호출). 일반 클라이언트는 호출 불가.
revoke execute on function claim_cells_for(uuid, jsonb, text, timestamptz, text) from public;
grant execute on function claim_cells_for(uuid, jsonb, text, timestamptz, text) to service_role;

-- 클라이언트용 래퍼: 소유자는 항상 호출자(auth.uid()).
create or replace function claim_cells(
  cells jsonb,
  p_owner_name text,
  p_claimed_at timestamptz,
  p_activity_id text
)
returns int
language sql
security definer
set search_path = public
as $$
  select claim_cells_for(auth.uid(), cells, p_owner_name, p_claimed_at, p_activity_id);
$$;

grant execute on function claim_cells(jsonb, text, timestamptz, text) to authenticated;

-- ── "최근 N일"만 인정(감쇠) ───────────────────────────────
-- 점령 인정 기간은 클라이언트 읽기에서 claimed_at >= now()-N일 로 필터한다(lib/territory.ts WINDOW_DAYS).
-- 기간 지난 행은 카운트되지 않을 뿐 자동 삭제되진 않으므로, 가끔 정리하려면 아래를 실행(선택):
--   delete from territory_cells where claimed_at < now() - interval '14 days';
