"use client";

// 크루 집단 여정 지도 + 🟦 땅따먹기.
// 점령은 intervals.icu 웹훅으로 서버에서 자동 처리(worker/index.ts). 이 페이지는 "보기 전용":
// 카카오 로그인 → icu 연동 상태 확인 → 크루 전체 점령 현황을 폴리곤으로 렌더 + 순위.
// 규칙: 점령은 영구 유지(안 사라짐) · 최신 점령 우선(뺏기) · 한 활동 1회.
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { User } from "@supabase/supabase-js";
import { crew } from "@/lib/crew";
import { supabaseReady } from "@/lib/supabase";
import { getCurrentUser, signInWithKakao } from "@/lib/auth";
import {
  disconnectIcu,
  getIcuConnection,
  icuConfigured,
  startIcuAuth,
} from "@/lib/icu";
import { cellsToPolygons, colorForUser, type Cell } from "@/lib/territory";
import { fetchCells, type OwnedCell } from "@/lib/territoryStore";
import { COURSES, withUniqueIds } from "@/lib/courses";
import type { Territory } from "@/components/CrewMap";
import BottomSheet from "@/components/BottomSheet";
import SupabaseNotice from "@/components/SupabaseNotice";

// Mapbox 는 window 에 의존 → 정적 export 프리렌더 회피 위해 클라 전용 로드.
const CrewMap = dynamic(() => import("@/components/CrewMap"), { ssr: false });
// 토큰 설정 여부(컴포넌트에서 import 하면 mapbox-gl 이 페이지 번들로 끌려오므로 env 로 직접 확인).
const mapboxConfigured = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);

export default function MapPage() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [connected, setConnected] = useState(false);
  const [cells, setCells] = useState<OwnedCell[]>([]);
  const [error, setError] = useState<string | null>(null);
  // 지도 레이어 표시 토글(땅따먹기 / 러닝 추천 경로).
  const [showTerritory, setShowTerritory] = useState(true);
  const [showCourses, setShowCourses] = useState(true);
  // 겹치는 경로 구분용: 탭한 코스만 강조(한 번 더 탭하면 해제).
  const [highlightedCourseId, setHighlightedCourseId] = useState<string | null>(null);
  // id 중복(변환기 기본 id) 방지 — 강조/범례가 id 로 구분하므로 고유화 필수.
  const courses = useMemo(() => withUniqueIds(COURSES), []);

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
            const cs = await fetchCells(); // 크루 전체 점령 현황
            if (!alive) return;
            setCells(cs);
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

  // 셀을 소유자별로 묶어 합쳐진 폴리곤으로(렌더용). 리더보드는 소유자별 칸 수 집계.
  const territories = useMemo<Territory[]>(() => {
    const byUser = new Map<string, Cell[]>();
    for (const c of cells) {
      const arr = byUser.get(c.userId);
      if (arr) arr.push({ x: c.x, y: c.y });
      else byUser.set(c.userId, [{ x: c.x, y: c.y }]);
    }
    const out: Territory[] = [];
    for (const [userId, ucells] of byUser) {
      const color = colorForUser(userId);
      for (const polygon of cellsToPolygons(ucells)) out.push({ polygon, color });
    }
    return out;
  }, [cells]);

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

  async function handleDisconnect() {
    if (!confirm("intervals.icu 연동을 해제할까요?")) return;
    try {
      await disconnectIcu();
      setConnected(false);
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
            연동하면 달린 만큼 지도에 내 땅이 칠해져요.
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
            연동하기
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
          {/* 풀스크린 지도(점령 폴리곤 + 추천 경로) */}
          <div className="absolute inset-0">
            <CrewMap
              territories={territories}
              courses={courses}
              showTerritory={showTerritory}
              showCourses={showCourses}
              highlightedCourseId={showCourses ? highlightedCourseId : null}
            />
          </div>

          {/* 좌상단 레이어 토글 + 코스 범례 */}
          <div className="absolute left-3 top-3 z-10 flex max-w-[60%] flex-col items-start gap-1.5">
            <LayerToggle
              active={showTerritory}
              onClick={() => setShowTerritory((v) => !v)}
            >
              🚩 땅따먹기
            </LayerToggle>
            <LayerToggle
              active={showCourses}
              onClick={() => setShowCourses((v) => !v)}
            >
              🏃 추천 경로
            </LayerToggle>

            {showCourses && courses.length > 0 && (
              <div className="mt-1 rounded-xl bg-white/90 p-1.5 shadow-sm ring-1 ring-black/5 backdrop-blur">
                {courses.map((c) => {
                  const on = highlightedCourseId === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() =>
                        setHighlightedCourseId((cur) => (cur === c.id ? null : c.id))
                      }
                      className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-xs ${
                        on ? "bg-neutral-900 text-white" : "text-neutral-700"
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: c.color }}
                      />
                      <span className="truncate font-bold">{c.name}</span>
                      <span className={on ? "text-white/70" : "text-neutral-400"}>
                        {c.distance}km
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 상단 떠있는 상태칩 / 에러 토스트 */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-2 p-3">
            <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-green-700 shadow-sm ring-1 ring-black/5 backdrop-blur">
              ✓ 자동 점령 중
            </span>
            {error && (
              <p className="pointer-events-auto rounded-xl bg-red-600/95 px-4 py-2 text-sm text-white shadow">
                {error}
              </p>
            )}
          </div>

          {/* 바텀시트: peek 에 요약, 펼치면 순위 */}
          <BottomSheet>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm">
                  <span className="font-bold text-neutral-900">🚩 내 땅 {myCount.toLocaleString()}칸</span>
                  <span className="text-neutral-400"> · 전체 {totalCount.toLocaleString()}칸</span>
                </div>
                <p className="mt-0.5 text-[11px] text-neutral-400">
                  달리면 자동으로 칠해져요 · 같은 칸을 더 최근에 달린 사람이 차지해요
                </p>
              </div>
              <button onClick={handleDisconnect} className="text-xs text-neutral-400 underline">
                연동 해제
              </button>
            </div>

            {leaderboard.length > 0 ? (
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
            ) : (
              <p className="mt-4 rounded-xl bg-neutral-100 p-3 text-center text-sm text-neutral-500">
                아직 점령된 땅이 없어요. 한 번 달리면 자동으로 칠해져요.
              </p>
            )}
          </BottomSheet>
        </>
      )}
    </div>
  );
}

function LayerToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1.5 text-xs font-bold shadow-sm ring-1 ring-black/5 backdrop-blur transition ${
        active
          ? "bg-white/95 text-neutral-900"
          : "bg-white/50 text-neutral-400 line-through"
      }`}
    >
      {children}
    </button>
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
