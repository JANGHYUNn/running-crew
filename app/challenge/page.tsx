"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { crew } from "@/lib/crew";
import { supabaseReady } from "@/lib/supabase";
import {
  getLeaderboard,
  listRunsByMember,
  listSeasons,
  memberLabel,
  type LeaderboardMember,
  type LeaderboardTeam,
  type Member,
  type Run,
  type Season,
} from "@/lib/challenge";
import { formatDateDot, formatKm, todayISO } from "@/lib/format";
import SupabaseNotice from "@/components/SupabaseNotice";
import ProofThumb from "@/components/ProofThumb";
import Sheet from "@/components/Sheet";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function ChallengePage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState(""); // 선택된 시즌
  const [board, setBoard] = useState<LeaderboardTeam[]>([]);
  const [boardSeasonId, setBoardSeasonId] = useState(""); // board가 어느 시즌 것인지
  const [loading, setLoading] = useState(true); // 시즌 목록 로딩
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  // 멤버 탭 시 그 사람 기록·증빙을 시트로 열람(다른 사람 검증)
  const [sheet, setSheet] = useState<LeaderboardMember | null>(null);
  const [memberRuns, setMemberRuns] = useState<Record<string, Run[]>>({});

  // 시즌 목록 로드(개수와 무관하게 항상 선택 화면을 먼저 보여준다)
  useEffect(() => {
    if (!supabaseReady) return;
    let alive = true;
    (async () => {
      try {
        const list = await listSeasons();
        if (!alive) return;
        setSeasons(list);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "불러오기 실패");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 선택된 시즌의 리더보드 로드
  useEffect(() => {
    if (!seasonId) return;
    const s = seasons.find((x) => x.id === seasonId);
    if (!s) return;
    let alive = true;
    (async () => {
      try {
        const b = await getLeaderboard(s);
        if (!alive) return;
        setError(null);
        setBoard(b);
        setBoardSeasonId(s.id);
        setOpen(new Set());
        setSheet(null);
        setMemberRuns({});
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "불러오기 실패");
      }
    })();
    return () => {
      alive = false;
    };
  }, [seasonId, seasons]);

  if (!supabaseReady) return <SupabaseNotice />;

  const selectedSeason = seasons.find((s) => s.id === seasonId);
  const boardLoading = !!seasonId && boardSeasonId !== seasonId;
  const today = todayISO();

  async function refresh() {
    if (!selectedSeason) return;
    setRefreshing(true);
    try {
      const b = await getLeaderboard(selectedSeason);
      setBoard(b);
      setOpen(new Set());
      setSheet(null);
      setMemberRuns({});
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      setRefreshing(false);
    }
  }

  function toggle(teamId: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }

  // 멤버 기록은 시트로 연다(한 달치 30줄이 리더보드에 그대로 펼쳐지지 않도록).
  function openRuns(row: LeaderboardMember) {
    setSheet(row);
    const memberId = row.member.id;
    if (memberRuns[memberId] === undefined && selectedSeason) {
      listRunsByMember(memberId, selectedSeason)
        .then((runs) => setMemberRuns((prev) => ({ ...prev, [memberId]: runs })))
        .catch(() => setMemberRuns((prev) => ({ ...prev, [memberId]: [] })));
    }
  }

  const maxKm = board.length > 0 ? Math.max(...board.map((t) => t.totalKm), 1) : 1;
  const totalKm = board.reduce((s, t) => s + t.totalKm, 0);
  const allMembers: Member[] = board.flatMap((t) => t.members.map((m) => m.member));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0">
          {seasonId && (
            <button
              onClick={() => setSeasonId("")}
              className="mb-1 text-sm text-neutral-400"
            >
              ← 시즌 목록
            </button>
          )}
          <h1 className="text-xl font-bold">🏆 조별 누적거리 챌린지</h1>
          {selectedSeason && (
            <p className="mt-1 text-sm text-neutral-500">
              {selectedSeason.name} · {formatDateDot(selectedSeason.start_date)}~
              {formatDateDot(selectedSeason.end_date)}
            </p>
          )}
        </div>
        {selectedSeason && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={refresh}
              disabled={refreshing}
              className="rounded-lg border border-neutral-200 px-2.5 py-2 text-sm text-neutral-500 hover:bg-neutral-50 disabled:opacity-50"
              title="새로고침"
              aria-label="새로고침"
            >
              {refreshing ? "…" : "↻"}
            </button>
            <Link
              href="/challenge/submit"
              className="rounded-xl px-4 py-2 text-sm font-bold text-white"
              style={{ backgroundColor: crew.primary }}
            >
              기록 제출
            </Link>
          </div>
        )}
      </div>

      {loading && <p className="py-10 text-center text-neutral-400">불러오는 중…</p>}

      {error && (
        <p className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}</p>
      )}

      {/* 시즌 없음 */}
      {!loading && !error && seasons.length === 0 && (
        <EmptyState
          title="아직 시즌이 없어요"
          desc="관리 화면에서 이번 달 시즌과 조를 만들어 시작하세요."
        />
      )}

      {/* 시즌 선택(여러 개 & 미선택) */}
      {!loading && !error && seasons.length > 0 && !seasonId && (
        <div>
          <h2 className="mb-3 text-sm font-bold text-neutral-500">
            시즌을 선택하세요
          </h2>
          <ul className="space-y-2">
            {seasons.map((s) => {
              const active = s.start_date <= today && today <= s.end_date;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => setSeasonId(s.id)}
                    className="flex w-full items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 text-left transition hover:border-neutral-400 hover:shadow-sm"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{s.name}</span>
                        {active && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                            진행 중
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-neutral-400">
                        {formatDateDot(s.start_date)}~{formatDateDot(s.end_date)}
                      </p>
                    </div>
                    <span className="text-lg text-neutral-300">›</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 선택된 시즌 리더보드 */}
      {!error && seasonId && (
        <>
          {boardLoading && (
            <p className="py-10 text-center text-neutral-400">불러오는 중…</p>
          )}

          {!boardLoading && board.length > 0 && (
            <div className="mb-5 rounded-2xl border border-neutral-200 bg-white px-5 py-4 text-center">
              <p className="text-xs text-neutral-400">크루 전체 누적거리</p>
              <p
                className="mt-0.5 text-2xl font-bold tnum"
                style={{ color: crew.primary }}
              >
                {formatKm(totalKm)}
                <span className="ml-1 text-sm font-normal text-neutral-400">km</span>
              </p>
            </div>
          )}

          {!boardLoading && board.length === 0 && (
            <EmptyState
              title="아직 편성된 조가 없어요"
              desc="관리 화면에서 조와 조원을 추가하세요."
            />
          )}

          <ol className="space-y-3">
            {board.map((row, i) => {
              const isOpen = open.has(row.team.id);
              return (
                <li
                  key={row.team.id}
                  className="overflow-hidden rounded-2xl border border-neutral-200 bg-white"
                >
                  <button
                    onClick={() => toggle(row.team.id)}
                    className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-neutral-50"
                  >
                    <span className="w-7 text-center text-lg font-bold tnum">
                      {MEDALS[i] ?? i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-bold">{row.team.name}</span>
                        <span className="shrink-0 text-lg font-bold tnum">
                          {formatKm(row.totalKm)}
                          <span className="ml-0.5 text-xs font-normal text-neutral-400">
                            km
                          </span>
                        </span>
                      </div>
                      {/* 누적거리 막대 (데이터 기반 동적값 → 인라인) */}
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(row.totalKm / maxKm) * 100}%`,
                            backgroundColor: crew.primary,
                          }}
                        />
                      </div>
                      <div className="mt-1 text-xs text-neutral-400">
                        조원 {row.members.length}명 · {row.runCount}회 ·{" "}
                        {/* 펼친 뒤엔 안내가 낡으므로, 다음 동작(멤버 탭)을 알려준다 */}
                        {isOpen ? "이름을 누르면 기록·인증사진" : "펼쳐서 기여도 보기"}
                      </div>
                    </div>
                    <span className="shrink-0 text-neutral-300">
                      {isOpen ? "▲" : "▼"}
                    </span>
                  </button>

                  {isOpen && (
                    <ul className="border-t border-neutral-100 bg-neutral-50/60 px-4 py-2">
                      {row.members.map((m) => (
                        <li
                          key={m.member.id}
                          className="border-b border-neutral-100 py-1 last:border-0"
                        >
                          <button
                            onClick={() => openRuns(m)}
                            disabled={m.runCount === 0}
                            className="flex w-full items-center justify-between gap-2 py-1.5 text-left text-sm disabled:opacity-60"
                          >
                            <span className="truncate text-neutral-700">
                              {memberLabel(allMembers, m.member)}
                            </span>
                            <span className="tnum shrink-0 text-neutral-500">
                              {formatKm(m.km)} km
                              <span className="ml-1 text-xs text-neutral-400">
                                ({m.runCount})
                              </span>
                              {m.runCount > 0 && (
                                <span className="ml-1.5 text-xs text-neutral-300">
                                  ›
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      ))}
                      {row.members.length === 0 && (
                        <li className="py-2 text-sm text-neutral-400">
                          조원이 없습니다
                        </li>
                      )}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}

      <div className="mt-8 text-center">
        <Link
          href="/challenge/admin"
          className="text-xs text-neutral-400 underline underline-offset-2"
        >
          시즌 · 조 관리
        </Link>
      </div>

      {sheet && (
        <Sheet
          title={memberLabel(allMembers, sheet.member)}
          subtitle={`${formatKm(sheet.km)} km · ${sheet.runCount}회${
            selectedSeason ? ` · ${selectedSeason.name}` : ""
          }`}
          onClose={() => setSheet(null)}
        >
          <MemberRuns runs={memberRuns[sheet.member.id]} />
        </Sheet>
      )}
    </div>
  );
}

/** 시트 안 기록 목록(최신순). 한 달치가 쌓여도 시트 안에서만 스크롤된다. */
function MemberRuns({ runs }: { runs: Run[] | undefined }) {
  if (runs === undefined)
    return <p className="py-4 text-center text-sm text-neutral-400">불러오는 중…</p>;
  if (runs.length === 0)
    return <p className="py-4 text-center text-sm text-neutral-400">기록 없음</p>;

  return (
    <ul className="space-y-2">
      {runs.map((r) => (
        <li key={r.id} className="flex items-center gap-2.5 text-sm">
          {r.image_url ? (
            <ProofThumb
              url={r.image_url}
              className="h-11 w-11 rounded-lg border border-neutral-200 object-cover"
            />
          ) : (
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-dashed border-neutral-200 text-[9px] text-neutral-300">
              없음
            </span>
          )}
          <span className="tnum font-bold text-neutral-700">
            {formatKm(Number(r.distance_km))}km
          </span>
          <span className="tnum text-xs text-neutral-400">
            {formatDateDot(r.run_date)}
          </span>
          {r.note && (
            <span className="truncate text-xs text-neutral-400">{r.note}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center">
      <p className="font-semibold text-neutral-700">{title}</p>
      <p className="mt-1 text-sm text-neutral-500">{desc}</p>
      <Link
        href="/challenge/admin"
        className="mt-4 inline-block rounded-xl px-4 py-2 text-sm font-bold text-white"
        style={{ backgroundColor: crew.primary }}
      >
        관리 화면으로
      </Link>
    </div>
  );
}
