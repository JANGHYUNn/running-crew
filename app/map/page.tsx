"use client";

// 크루 집단 여정 지도 + 🟦 땅따먹기.
// 흐름: 카카오 로그인 → intervals.icu 연동 → 활동 불러오기 → GPS 경로로 ~50m 셀 점령.
// 점령 규칙: 최신 우선(뺏기 가능). 점령 현황은 크루원 전체가 공유(supabase/territory.sql).
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { User } from "@supabase/supabase-js";
import { crew } from "@/lib/crew";
import { supabaseReady } from "@/lib/supabase";
import { getCurrentUser, nicknameOf, signInWithKakao } from "@/lib/auth";
import {
  disconnectIcu,
  getIcuConnection,
  getRouteCoords,
  icuConfigured,
  listActivities,
  startIcuAuth,
  type IcuActivity,
} from "@/lib/icu";
import { WINDOW_DAYS, colorForUser, routeToCells } from "@/lib/territory";
import {
  claimCells,
  fetchCells,
  fetchClaimedActivityIds,
  type OwnedCell,
} from "@/lib/territoryStore";
import type { Route, TerritoryCell } from "@/components/CrewMap";
import BottomSheet from "@/components/BottomSheet";
import SupabaseNotice from "@/components/SupabaseNotice";

// Mapbox 는 window 에 의존 → 정적 export 프리렌더 회피 위해 클라 전용 로드.
const CrewMap = dynamic(() => import("@/components/CrewMap"), { ssr: false });
// 토큰 설정 여부(컴포넌트에서 import 하면 mapbox-gl 이 페이지 번들로 끌려오므로 env 로 직접 확인).
const mapboxConfigured = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);

// 점령에 쓸 활동 기간 = 최근 WINDOW_DAYS 일(과거 백필 없음 — 오래된 기록으로 땅 못 깖).
function rangeRecent(): [string, string] {
  const today = new Date();
  const newest = today.toISOString().slice(0, 10);
  const oldest = new Date(today.getTime() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  return [oldest, newest];
}

export default function MapPage() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [connected, setConnected] = useState(false);
  const [activities, setActivities] = useState<IcuActivity[]>([]);
  const [loadingActs, setLoadingActs] = useState(false);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeLoadingId, setRouteLoadingId] = useState<string | null>(null);
  const [cells, setCells] = useState<OwnedCell[]>([]);
  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set()); // 이미 점령에 쓴 활동
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 마운트 시 로그인·연동 상태 확인. 첫 await 전엔 setState 를 두지 않는다(이펙트 규칙).
  useEffect(() => {
    if (!supabaseReady) return;
    let alive = true;
    (async () => {
      try {
        const u = await getCurrentUser();
        if (!alive) return;
        setUser(u);
        if (u) {
          const conn = await getIcuConnection();
          if (!alive) return;
          setConnected(Boolean(conn));
          if (conn) {
            const [cs, ids] = await Promise.all([
              fetchCells(), // 크루 전체 점령 현황
              fetchClaimedActivityIds(u.id), // 내가 이미 쓴 활동
            ]);
            if (!alive) return;
            setCells(cs);
            setClaimedIds(ids);
          }
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "확인 실패");
      } finally {
        if (alive) setChecking(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 셀 → 지도 fill(소유자 색). 리더보드는 셀을 소유자별로 집계.
  const mapCells = useMemo<TerritoryCell[]>(
    () => cells.map((c) => ({ x: c.x, y: c.y, color: colorForUser(c.userId) })),
    [cells]
  );
  const leaderboard = useMemo(() => {
    const by = new Map<string, { name: string; count: number }>();
    for (const c of cells) {
      const e = by.get(c.userId) ?? { name: c.ownerName ?? "러너", count: 0 };
      e.count += 1;
      by.set(c.userId, e);
    }
    return [...by.entries()]
      .map(([userId, v]) => ({ userId, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [cells]);

  // 불러온 활동들의 GPS 경로로 셀을 점령(이미 처리한 활동은 건너뜀).
  async function claimTerritory() {
    if (!user) return;
    if (activities.length === 0) {
      setError("먼저 '내 활동 불러오기'로 활동을 가져와 주세요.");
      return;
    }
    setClaiming(true);
    setError(null);
    setClaimMsg(null);
    try {
      const name = nicknameOf(user);
      // 이미 쓴 활동은 서버 기록 기준으로 제외(브라우저/기기 무관).
      const used = new Set(claimedIds);
      const targets = activities.filter((a) => !used.has(a.id));
      let processed = 0;
      let claimed = 0;
      for (let i = 0; i < targets.length; i++) {
        const a = targets[i];
        setClaimMsg(`땅 점령 중… (${i + 1}/${targets.length})`);
        let coords: [number, number][] = [];
        try {
          coords = await getRouteCoords(a.id);
        } catch {
          continue; // 스트림 조회 실패 → 기록하지 않고 다음에 재시도
        }
        // GPS 없으면 빈 배열로 호출(서버에 '사용함'만 기록돼 다음에 다시 안 잡힘).
        const list = coords.length >= 2 ? [...routeToCells(coords).values()] : [];
        const claimedAt = new Date(a.start_date_local ?? Date.now()).toISOString();
        const n = await claimCells(list, name, claimedAt, a.id);
        used.add(a.id); // 사용 처리
        if (n >= 0) {
          processed += 1;
          claimed += n;
        }
      }
      setClaimedIds(used);
      setCells(await fetchCells()); // 최신 현황 반영
      setClaimMsg(
        processed === 0
          ? "새로 점령할 활동이 없어요 (이미 사용했거나 경로가 없어요)."
          : `${processed}개 활동에서 ${claimed}칸을 점령했어요! 🚩`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "땅 점령 실패");
    } finally {
      setClaiming(false);
    }
  }

  async function loadActivities() {
    setLoadingActs(true);
    setError(null);
    try {
      const [oldest, newest] = rangeRecent();
      setActivities(await listActivities(oldest, newest));
    } catch (e) {
      setError(e instanceof Error ? e.message : "활동 불러오기 실패");
    } finally {
      setLoadingActs(false);
    }
  }

  // 활동 행 탭 → 지도에 경로 표시/숨김 토글. GPS 없는 활동(실내 등)은 안내.
  async function toggleRoute(id: string) {
    if (routes.some((r) => r.id === id)) {
      setRoutes((prev) => prev.filter((r) => r.id !== id));
      return;
    }
    setRouteLoadingId(id);
    setError(null);
    try {
      const coords = await getRouteCoords(id);
      if (coords.length < 2) {
        setError("이 활동엔 GPS 경로가 없어요 (실내·트레드밀 활동일 수 있어요).");
        return;
      }
      setRoutes((prev) => [...prev, { id, coords }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "경로 불러오기 실패");
    } finally {
      setRouteLoadingId(null);
    }
  }

  async function handleDisconnect() {
    if (!confirm("intervals.icu 연동을 해제할까요?")) return;
    try {
      await disconnectIcu();
      setConnected(false);
      setActivities([]);
      setRoutes([]);
      setClaimMsg(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "해제 실패");
    }
  }

  const myCount = leaderboard.find((r) => r.userId === user?.id)?.count ?? 0;
  const totalCount = cells.length;

  if (!supabaseReady) return <SupabaseNotice />;

  // 헤더(h-14=3.5rem) 아래를 꽉 채우는 풀스크린 컨테이너. 시트는 이 안에서 absolute.
  return (
    <div className="relative h-[calc(100dvh-3.5rem)] w-full overflow-hidden bg-neutral-100">
      {/* 로그인/연동 전: 가운데 카드. 연동 후: 풀스크린 지도 + 바텀시트. */}
      {checking ? (
        <p className="pt-20 text-center text-neutral-400">확인 중…</p>
      ) : !user ? (
        <CenterCard>
          <p className="text-sm text-neutral-600">
            먼저 카카오 로그인이 필요해요. (내 계정에 연동을 묶어둡니다)
          </p>
          <button
            onClick={() => signInWithKakao()}
            className="mt-4 rounded-xl bg-[#FEE500] px-5 py-2.5 text-sm font-bold text-black"
          >
            카카오로 로그인
          </button>
        </CenterCard>
      ) : !connected ? (
        <CenterCard>
          <p className="text-sm text-neutral-600">
            intervals.icu 를 연동하면 내 러닝 경로로 땅따먹기를 할 수 있어요.
          </p>
          {!icuConfigured && (
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-700 ring-1 ring-amber-200">
              intervals.icu 앱 등록(client id) 대기 중이라 아직 연동을 켤 수 없어요.
            </p>
          )}
          <button
            onClick={() => startIcuAuth()}
            disabled={!icuConfigured}
            className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40"
            style={{ backgroundColor: crew.primary }}
          >
            intervals.icu 연동하기
          </button>
        </CenterCard>
      ) : !mapboxConfigured ? (
        <CenterCard>
          <p className="text-sm text-amber-700">
            지도 토큰(NEXT_PUBLIC_MAPBOX_TOKEN)이 아직 설정되지 않아 지도를 표시할 수 없어요.
          </p>
        </CenterCard>
      ) : (
        <>
          {/* 풀스크린 지도 */}
          <div className="absolute inset-0">
            <CrewMap routes={routes} cells={mapCells} />
          </div>

          {/* 상단 떠있는 상태칩 / 토스트 */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-2 p-3">
            <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-green-700 shadow-sm ring-1 ring-black/5 backdrop-blur">
              ✓ intervals.icu 연동됨
            </span>
            {error && (
              <p className="pointer-events-auto rounded-xl bg-red-600/95 px-4 py-2 text-sm text-white shadow">
                {error}
              </p>
            )}
          </div>

          {/* 바텀시트: peek 에 요약+주요버튼, 펼치면 순위·활동목록 */}
          <BottomSheet>
            {/* ── peek 영역(접힘 시 보임) ── */}
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm">
                  <span className="font-bold text-neutral-900">🚩 내 땅 {myCount.toLocaleString()}칸</span>
                  <span className="text-neutral-400"> · 전체 {totalCount.toLocaleString()}칸</span>
                </div>
                <p className="mt-0.5 text-[11px] text-neutral-400">
                  최근 {WINDOW_DAYS}일 점령 현황 · 안 달리면 사라져요
                </p>
              </div>
              <button onClick={handleDisconnect} className="text-xs text-neutral-400 underline">
                연동 해제
              </button>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                onClick={loadActivities}
                disabled={loadingActs}
                className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
              >
                {loadingActs ? "불러오는 중…" : "활동 불러오기"}
              </button>
              <button
                onClick={claimTerritory}
                disabled={claiming || activities.length === 0}
                className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40"
                style={{ backgroundColor: crew.primary }}
              >
                {claiming ? claimMsg ?? "점령 중…" : "🚩 땅 점령"}
              </button>
            </div>

            {claimMsg && !claiming && (
              <p className="mt-2 rounded-xl bg-neutral-100 p-2.5 text-center text-sm text-neutral-600">
                {claimMsg}
              </p>
            )}

            {/* ── 펼침 영역 ── */}
            {leaderboard.length > 0 && (
              <div className="mt-4">
                <h2 className="text-sm font-bold text-neutral-700">🏆 땅따먹기 순위</h2>
                <ol className="mt-2 space-y-1.5">
                  {leaderboard.map((row, i) => {
                    const me = row.userId === user?.id;
                    return (
                      <li key={row.userId} className="flex items-center gap-2 text-sm">
                        <span className="w-5 shrink-0 text-center font-bold text-neutral-400">
                          {i + 1}
                        </span>
                        <span
                          className="h-3 w-3 shrink-0 rounded-sm"
                          style={{ backgroundColor: colorForUser(row.userId) }}
                        />
                        <span
                          className={`truncate ${me ? "font-bold text-neutral-900" : "text-neutral-700"}`}
                        >
                          {row.name}
                          {me && " (나)"}
                        </span>
                        <span className="ml-auto shrink-0 tabular-nums text-neutral-500">
                          {row.count.toLocaleString()}칸
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            {activities.length > 0 && (
              <div className="mt-4">
                <h2 className="text-sm font-bold text-neutral-700">
                  내 활동(최근 {WINDOW_DAYS}일) · 탭하면 경로 표시
                </h2>
                <ul className="mt-2 space-y-1.5">
                  {activities.slice(0, 20).map((a) => {
                    const shown = routes.some((r) => r.id === a.id);
                    const loading = routeLoadingId === a.id;
                    const claimed = claimedIds.has(a.id);
                    return (
                      <li key={a.id}>
                        <button
                          onClick={() => toggleRoute(a.id)}
                          disabled={loading}
                          className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:opacity-60 ${
                            shown
                              ? "border-transparent bg-neutral-900 text-white"
                              : "border-neutral-100 bg-white text-neutral-700 hover:bg-neutral-50"
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            {claimed && <span title="점령에 사용됨">🚩</span>}
                            <span className="truncate">{a.name || a.type || "활동"}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2 pl-2 text-xs">
                            <span className={shown ? "text-neutral-300" : "text-neutral-400"}>
                              {a.start_date_local?.slice(0, 10)}
                            </span>
                            <span className={shown ? "text-white" : "text-neutral-300"}>
                              {loading ? "…" : claimed ? "점령됨" : shown ? "표시중" : "지도에"}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </BottomSheet>
        </>
      )}
    </div>
  );
}

function CenterCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 pt-12">
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center">
        {children}
      </div>
    </div>
  );
}
