"use client";

// 크루 집단 여정 지도 — 마일스톤(연동 흐름) 단계.
// 현재: 카카오 로그인 → intervals.icu OAuth 연동 → 최근 활동 목록 확인까지.
// 다음: 활동 GPS(getRouteCoords)를 MapLibre 지도에 레이어로 렌더(미구현).
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { User } from "@supabase/supabase-js";
import { crew } from "@/lib/crew";
import { supabaseReady } from "@/lib/supabase";
import { getCurrentUser, signInWithKakao } from "@/lib/auth";
import {
  disconnectIcu,
  getIcuConnection,
  getRouteCoords,
  icuConfigured,
  listActivities,
  startIcuAuth,
  type IcuActivity,
} from "@/lib/icu";
import type { Route } from "@/components/CrewMap";
import SupabaseNotice from "@/components/SupabaseNotice";

// Mapbox 는 window 에 의존 → 정적 export 프리렌더 회피 위해 클라 전용 로드.
const CrewMap = dynamic(() => import("@/components/CrewMap"), { ssr: false });
// 토큰 설정 여부(컴포넌트에서 import 하면 mapbox-gl 이 페이지 번들로 끌려오므로 env 로 직접 확인).
const mapboxConfigured = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);

function rangeLastYear(): [string, string] {
  const today = new Date();
  const newest = today.toISOString().slice(0, 10);
  const oldest = new Date(today.getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
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

  async function loadActivities() {
    setLoadingActs(true);
    setError(null);
    try {
      const [oldest, newest] = rangeLastYear();
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "해제 실패");
    }
  }

  if (!supabaseReady) return <SupabaseNotice />;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-xl font-bold">🗺️ 크루 여정 지도</h1>
      <p className="mt-1 text-sm text-neutral-500">
        intervals.icu 활동 경로를 지도에 모아 봅니다.
      </p>

      {!icuConfigured && (
        <Notice>
          intervals.icu 앱 등록(client id) 대기 중이라 아직 연동을 켤 수 없어요. 등록 완료 후
          활성화됩니다.
        </Notice>
      )}

      {error && (
        <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}</p>
      )}

      {checking ? (
        <p className="py-10 text-center text-neutral-400">확인 중…</p>
      ) : !user ? (
        <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 text-center">
          <p className="text-sm text-neutral-600">
            먼저 카카오 로그인이 필요해요. (내 계정에 연동을 묶어둡니다)
          </p>
          <button
            onClick={() => signInWithKakao()}
            className="mt-4 rounded-xl bg-[#FEE500] px-5 py-2.5 text-sm font-bold text-black"
          >
            카카오로 로그인
          </button>
        </div>
      ) : !connected ? (
        <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 text-center">
          <p className="text-sm text-neutral-600">
            intervals.icu 를 연동하면 내 러닝 경로를 지도에 올릴 수 있어요.
          </p>
          <button
            onClick={() => startIcuAuth()}
            disabled={!icuConfigured}
            className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40"
            style={{ backgroundColor: crew.primary }}
          >
            intervals.icu 연동하기
          </button>
        </div>
      ) : (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
              ✓ intervals.icu 연동됨
            </span>
            <button
              onClick={handleDisconnect}
              className="text-xs text-neutral-400 underline"
            >
              연동 해제
            </button>
          </div>

          {mapboxConfigured ? (
            <div className="mt-4">
              <CrewMap routes={routes} />
            </div>
          ) : (
            <Notice>
              지도 토큰(NEXT_PUBLIC_MAPBOX_TOKEN)이 아직 설정되지 않아 지도를 표시할 수 없어요.
            </Notice>
          )}

          <button
            onClick={loadActivities}
            disabled={loadingActs}
            className="mt-4 w-full rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
          >
            {loadingActs ? "불러오는 중…" : "내 활동 불러오기(최근 1년)"}
          </button>

          {activities.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {activities.slice(0, 20).map((a) => {
                const shown = routes.some((r) => r.id === a.id);
                const loading = routeLoadingId === a.id;
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
                      <span className="truncate">{a.name || a.type || "활동"}</span>
                      <span className="flex shrink-0 items-center gap-2 pl-2 text-xs">
                        <span className={shown ? "text-neutral-300" : "text-neutral-400"}>
                          {a.start_date_local?.slice(0, 10)}
                        </span>
                        <span className={shown ? "text-white" : "text-neutral-300"}>
                          {loading ? "…" : shown ? "표시중" : "지도에"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-700 ring-1 ring-amber-200">
      {children}
    </p>
  );
}
