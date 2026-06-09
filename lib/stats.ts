// 개인 기록 통계 데이터 레이어 (/me).
// 카카오 로그인 사용자의 personal_runs 를 브라우저에서 직접 CRUD/집계한다(정적 export, 서버 0).
// RLS: 읽기는 로그인 전체 허용(랭킹/타인 기록), 쓰기는 본인 행만. supabase/auth-stats.sql 참고.
import { getSupabase } from "@/lib/supabase";
import { monthKey, startOfWeekISO, todayISO } from "@/lib/format";
import type { User } from "@supabase/supabase-js";
import { nicknameOf, avatarOf } from "@/lib/auth";

export interface Profile {
  id: string;
  nickname: string | null;
  avatar_url: string | null;
  updated_at: string;
}

export interface PersonalRun {
  id: string;
  user_id: string;
  distance_km: number;
  /** 소요 시간(초). 입력 안 한 기록은 null → 페이스·최장시간 집계에서 제외 */
  duration_sec: number | null;
  run_date: string;
  note: string | null;
  image_url: string | null;
  image_hash: string | null;
  created_at: string;
}

function sb() {
  const client = getSupabase();
  if (!client) throw new Error("Supabase 가 설정되지 않았습니다.");
  return client;
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// ── 프로필 ─────────────────────────────────────────────
/** 로그인 시 카카오 메타데이터로 내 프로필 upsert(랭킹에 닉네임·아바타 노출용) */
export async function upsertMyProfile(user: User): Promise<void> {
  const { error } = await sb()
    .from("profiles")
    .upsert(
      {
        id: user.id,
        nickname: nicknameOf(user),
        avatar_url: avatarOf(user),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
  if (error) throw new Error(error.message);
}

// ── 런(개인 기록) ──────────────────────────────────────
/** 내 기록 전체(최신순) */
export async function listMyRuns(userId: string): Promise<PersonalRun[]> {
  return unwrap(
    await sb()
      .from("personal_runs")
      .select("*")
      .eq("user_id", userId)
      .order("run_date", { ascending: false })
  );
}

export async function addPersonalRun(input: {
  userId: string;
  distanceKm: number;
  durationSec?: number | null;
  runDate: string;
  note?: string | null;
  imageUrl?: string | null;
  imageHash?: string | null;
}): Promise<PersonalRun> {
  return unwrap(
    await sb()
      .from("personal_runs")
      .insert({
        user_id: input.userId,
        distance_km: input.distanceKm,
        duration_sec: input.durationSec ?? null,
        run_date: input.runDate,
        note: input.note ?? null,
        image_url: input.imageUrl ?? null,
        image_hash: input.imageHash ?? null,
      })
      .select()
      .single()
  );
}

export async function deletePersonalRun(id: string): Promise<void> {
  const { error } = await sb().from("personal_runs").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** 같은 이미지(sha256)로 등록된 내 기록이 있으면 반환(중복 차단) */
export async function findPersonalRunByImageHash(
  userId: string,
  hash: string
): Promise<PersonalRun | null> {
  const rows = unwrap<PersonalRun[]>(
    await sb()
      .from("personal_runs")
      .select("*")
      .eq("user_id", userId)
      .eq("image_hash", hash)
      .limit(1)
  );
  return rows[0] ?? null;
}

// ── 통계 집계(클라이언트) ───────────────────────────────
export interface Bucket {
  key: string; // "2026-06" 또는 주 시작일 "2026-06-02"
  km: number;
  runCount: number;
}
export interface StatsSummary {
  total: number;
  thisMonth: number;
  thisWeek: number;
  runCount: number;
  monthly: Bucket[]; // 오래된→최근
  weekly: Bucket[]; // 오래된→최근
  /** 평균 페이스(초/km). 시간 입력된 기록들의 (총시간/총거리). 없으면 0 */
  avgPaceSec: number;
  /** 최장 거리(km) */
  longestKm: number;
  /** 최장 시간(초). 시간 입력된 기록 중 최대. 없으면 0 */
  longestDurationSec: number;
  /** 시간이 입력된 기록 수(평균 페이스·최장 시간의 표본) */
  timedCount: number;
  /** 날짜별 누적 거리(히트맵용) "YYYY-MM-DD" → km */
  byDay: Record<string, number>;
}

function bucketize(
  runs: PersonalRun[],
  keyOf: (run: PersonalRun) => string
): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const r of runs) {
    const key = keyOf(r);
    const cur = map.get(key) ?? { key, km: 0, runCount: 0 };
    cur.km += Number(r.distance_km);
    cur.runCount += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** 내 기록 배열 → 통계 요약 */
export function summarizeStats(runs: PersonalRun[]): StatsSummary {
  const today = todayISO();
  const curMonth = monthKey(today);
  const curWeek = startOfWeekISO(today);

  let total = 0;
  let thisMonth = 0;
  let thisWeek = 0;
  let longestKm = 0;
  let longestDurationSec = 0;
  let timedDist = 0; // 시간 입력된 기록의 거리 합
  let timedSec = 0; // 시간 입력된 기록의 시간 합
  let timedCount = 0;
  const byDay: Record<string, number> = {};
  for (const r of runs) {
    const km = Number(r.distance_km);
    total += km;
    if (monthKey(r.run_date) === curMonth) thisMonth += km;
    if (startOfWeekISO(r.run_date) === curWeek) thisWeek += km;
    if (km > longestKm) longestKm = km;
    byDay[r.run_date] = (byDay[r.run_date] ?? 0) + km;
    const sec = r.duration_sec;
    if (sec && sec > 0) {
      timedDist += km;
      timedSec += sec;
      timedCount += 1;
      if (sec > longestDurationSec) longestDurationSec = sec;
    }
  }

  return {
    total,
    thisMonth,
    thisWeek,
    runCount: runs.length,
    monthly: bucketize(runs, (r) => monthKey(r.run_date)),
    weekly: bucketize(runs, (r) => startOfWeekISO(r.run_date)),
    avgPaceSec: timedDist > 0 ? timedSec / timedDist : 0,
    longestKm,
    longestDurationSec,
    timedCount,
    byDay,
  };
}

// ── 크루 랭킹 ──────────────────────────────────────────
export interface RankRow {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  totalKm: number;
  runCount: number;
}

/** 크루 전체 기록(통계 합산용). run_date·distance_km 만 필요 */
export async function getCrewRuns(): Promise<PersonalRun[]> {
  return unwrap(
    await sb()
      .from("personal_runs")
      .select("*")
      .order("run_date", { ascending: false })
  );
}

/** 크루 전체 누적거리 순위(내림차순). 데이터가 작아 클라이언트 집계 */
export async function getCrewRanking(): Promise<RankRow[]> {
  const profiles = unwrap<Profile[]>(await sb().from("profiles").select("*"));
  const runs = unwrap<Pick<PersonalRun, "user_id" | "distance_km">[]>(
    await sb().from("personal_runs").select("user_id, distance_km")
  );

  const agg = new Map<string, { totalKm: number; runCount: number }>();
  for (const r of runs) {
    const cur = agg.get(r.user_id) ?? { totalKm: 0, runCount: 0 };
    cur.totalKm += Number(r.distance_km);
    cur.runCount += 1;
    agg.set(r.user_id, cur);
  }

  const rows: RankRow[] = profiles.map((p) => {
    const a = agg.get(p.id) ?? { totalKm: 0, runCount: 0 };
    return {
      userId: p.id,
      nickname: p.nickname || "러너",
      avatarUrl: p.avatar_url,
      totalKm: a.totalKm,
      runCount: a.runCount,
    };
  });

  rows.sort((a, b) => b.totalKm - a.totalKm);
  return rows;
}
