// 조별 누적거리 챌린지 데이터 레이어.
// 모든 함수는 브라우저에서 Supabase 를 직접 호출한다(정적 export, 서버 0).
// Supabase 미설정 시 getSupabase()가 null → 호출 전 supabaseReady 로 분기할 것.
import { getSupabase } from "@/lib/supabase";

export interface Season {
  id: string;
  name: string;
  start_date: string; // "2026-06-01"
  end_date: string;
  created_at: string;
}
export interface Team {
  id: string;
  season_id: string;
  name: string;
}
export interface Member {
  id: string;
  team_id: string;
  name: string;
}
export interface Run {
  id: string;
  member_id: string;
  distance_km: number;
  run_date: string;
  note: string | null;
  image_url: string | null;
  image_hash: string | null;
  user_id: string | null; // 소프트 귀속: 로그인 상태로 제출한 작성자(선택)
  created_at: string;
}

/** 같은 조에 동일 이름이 둘 이상이면 "#n" 구분자를 붙여 반환(동명이인 대응) */
export function memberLabel(all: Member[], m: Member): string {
  const dups = all.filter((x) => x.team_id === m.team_id && x.name === m.name);
  if (dups.length <= 1) return m.name;
  const idx = dups.findIndex((x) => x.id === m.id);
  return `${m.name} #${idx + 1}`;
}

/** 리더보드의 조원 한 명(기여 거리·횟수) */
export interface LeaderboardMember {
  member: Member;
  km: number;
  runCount: number;
}

/** 리더보드 한 줄(조 단위) — 조원별 기여 포함 */
export interface LeaderboardTeam {
  team: Team;
  totalKm: number;
  runCount: number;
  members: LeaderboardMember[];
}

function sb() {
  const client = getSupabase();
  if (!client) throw new Error("Supabase 가 설정되지 않았습니다.");
  return client;
}

/** Supabase 에러를 throw 로 변환 */
function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// ── 시즌 ───────────────────────────────────────────────
export async function listSeasons(): Promise<Season[]> {
  return unwrap(
    await sb().from("seasons").select("*").order("start_date", { ascending: false })
  );
}

/** 오늘이 포함된 시즌, 없으면 가장 최근 시즌, 그것도 없으면 null */
export async function getActiveSeason(today: string): Promise<Season | null> {
  const seasons = await listSeasons();
  if (seasons.length === 0) return null;
  const current = seasons.find((s) => s.start_date <= today && today <= s.end_date);
  return current ?? seasons[0];
}

export async function createSeason(
  name: string,
  startDate: string,
  endDate: string
): Promise<Season> {
  return unwrap(
    await sb()
      .from("seasons")
      .insert({ name, start_date: startDate, end_date: endDate })
      .select()
      .single()
  );
}

export async function updateSeason(
  id: string,
  patch: Partial<Pick<Season, "name" | "start_date" | "end_date">>
): Promise<void> {
  const { error } = await sb().from("seasons").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteSeason(id: string): Promise<void> {
  const { error } = await sb().from("seasons").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── 조 ─────────────────────────────────────────────────
export async function listTeams(seasonId: string): Promise<Team[]> {
  return unwrap(
    await sb().from("teams").select("*").eq("season_id", seasonId).order("name")
  );
}

export async function createTeam(seasonId: string, name: string): Promise<Team> {
  return unwrap(
    await sb().from("teams").insert({ season_id: seasonId, name }).select().single()
  );
}

export async function deleteTeam(id: string): Promise<void> {
  const { error } = await sb().from("teams").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── 멤버 ───────────────────────────────────────────────
/** 시즌에 속한 모든 멤버(조 무관) */
export async function listMembers(teamIds: string[]): Promise<Member[]> {
  if (teamIds.length === 0) return [];
  return unwrap(
    await sb().from("members").select("*").in("team_id", teamIds).order("name")
  );
}

export async function createMember(teamId: string, name: string): Promise<Member> {
  return unwrap(
    await sb().from("members").insert({ team_id: teamId, name }).select().single()
  );
}

export async function updateMember(
  id: string,
  patch: Partial<Pick<Member, "name" | "team_id">>
): Promise<void> {
  const { error } = await sb().from("members").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteMember(id: string): Promise<void> {
  const { error } = await sb().from("members").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── 런(기록) ───────────────────────────────────────────
/** 멤버의 시즌 기간 내 런 목록(최신순) */
export async function listRunsByMember(
  memberId: string,
  season: Season
): Promise<Run[]> {
  return unwrap(
    await sb()
      .from("runs")
      .select("*")
      .eq("member_id", memberId)
      .gte("run_date", season.start_date)
      .lte("run_date", season.end_date)
      .order("run_date", { ascending: false })
  );
}

export async function addRun(input: {
  memberId: string;
  distanceKm: number;
  runDate: string;
  note?: string | null;
  imageUrl?: string | null;
  imageHash?: string | null;
  userId?: string | null; // 로그인 상태면 작성자 user_id 를 함께 남김(소프트 귀속)
}): Promise<Run> {
  const row: Record<string, unknown> = {
    member_id: input.memberId,
    distance_km: input.distanceKm,
    run_date: input.runDate,
    note: input.note ?? null,
    image_url: input.imageUrl ?? null,
  };
  // 해시가 있을 때만 포함(컬럼 미추가 DB에서 수동입력은 계속 동작하도록)
  if (input.imageHash) row.image_hash = input.imageHash;
  // 로그인 상태일 때만 포함(user_id 컬럼 미추가 DB·비로그인 제출은 계속 동작하도록)
  if (input.userId) row.user_id = input.userId;
  return unwrap(await sb().from("runs").insert(row).select().single());
}

/** 같은 이미지(sha256)로 등록된 런이 이미 있으면 반환(중복 차단용) */
export async function findRunByImageHash(hash: string): Promise<Run | null> {
  const rows = unwrap<Run[]>(
    await sb().from("runs").select("*").eq("image_hash", hash).limit(1)
  );
  return rows[0] ?? null;
}

export async function deleteRun(id: string): Promise<void> {
  const { error } = await sb().from("runs").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── 리더보드 집계 ───────────────────────────────────────
/** 시즌의 조별 누적거리 순위(조원별 기여 포함). 데이터가 작아 클라이언트에서 집계 */
export async function getLeaderboard(season: Season): Promise<LeaderboardTeam[]> {
  const teams = await listTeams(season.id);
  if (teams.length === 0) return [];
  const members = await listMembers(teams.map((t) => t.id));

  const memberIds = members.map((m) => m.id);
  const runs =
    memberIds.length === 0
      ? []
      : unwrap<Run[]>(
          await sb()
            .from("runs")
            .select("*")
            .in("member_id", memberIds)
            .gte("run_date", season.start_date)
            .lte("run_date", season.end_date)
        );

  // 멤버별 합산
  const perMember = new Map<string, { km: number; runCount: number }>();
  for (const r of runs) {
    const cur = perMember.get(r.member_id) ?? { km: 0, runCount: 0 };
    cur.km += Number(r.distance_km);
    cur.runCount += 1;
    perMember.set(r.member_id, cur);
  }

  const membersByTeam = new Map<string, Member[]>();
  for (const m of members) {
    const arr = membersByTeam.get(m.team_id) ?? [];
    arr.push(m);
    membersByTeam.set(m.team_id, arr);
  }

  const board: LeaderboardTeam[] = teams.map((team) => {
    const teamMembers = (membersByTeam.get(team.id) ?? []).map((member) => {
      const agg = perMember.get(member.id) ?? { km: 0, runCount: 0 };
      return { member, km: agg.km, runCount: agg.runCount };
    });
    teamMembers.sort((a, b) => b.km - a.km);
    const totalKm = teamMembers.reduce((s, m) => s + m.km, 0);
    const runCount = teamMembers.reduce((s, m) => s + m.runCount, 0);
    return { team, totalKm, runCount, members: teamMembers };
  });

  board.sort((a, b) => b.totalKm - a.totalKm);
  return board;
}
