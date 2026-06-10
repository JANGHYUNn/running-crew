"use client";

// 크루 집단 여정 지도 — 마일스톤(연동 흐름) 단계.
// 현재: 카카오 로그인 → intervals.icu OAuth 연동 → 최근 활동 목록 확인까지.
// 다음: 활동 GPS(getRouteCoords)를 MapLibre 지도에 레이어로 렌더(미구현).
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { crew } from "@/lib/crew";
import { supabaseReady } from "@/lib/supabase";
import { getCurrentUser, signInWithKakao } from "@/lib/auth";
import {
  disconnectIcu,
  getIcuConnection,
  icuConfigured,
  listActivities,
  startIcuAuth,
  type IcuActivity,
} from "@/lib/icu";
import SupabaseNotice from "@/components/SupabaseNotice";

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

  async function handleDisconnect() {
    if (!confirm("intervals.icu 연동을 해제할까요?")) return;
    try {
      await disconnectIcu();
      setConnected(false);
      setActivities([]);
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

          <button
            onClick={loadActivities}
            disabled={loadingActs}
            className="mt-4 w-full rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
          >
            {loadingActs ? "불러오는 중…" : "내 활동 불러오기(최근 1년)"}
          </button>

          {activities.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {activities.slice(0, 20).map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between rounded-lg border border-neutral-100 bg-white px-3 py-2 text-sm"
                >
                  <span className="truncate text-neutral-700">{a.name || a.type || "활동"}</span>
                  <span className="shrink-0 pl-2 text-xs text-neutral-400">
                    {a.start_date_local?.slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-6 rounded-xl border border-dashed border-neutral-300 p-4 text-center text-xs text-neutral-400">
            🚧 다음 단계: 활동 GPS를 MapLibre 지도에 경로 레이어로 렌더링
          </p>
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
