"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { crew } from "@/lib/crew";
import { supabaseReady } from "@/lib/supabase";
import {
  avatarOf,
  getCurrentUser,
  nicknameOf,
  onAuthChange,
  signInWithKakao,
  signOut,
} from "@/lib/auth";
import {
  addPersonalRun,
  deletePersonalRun,
  findPersonalRunByImageHash,
  getCrewRanking,
  getCrewRuns,
  listMyRuns,
  summarizeStats,
  upsertMyProfile,
  type PersonalRun,
  type RankRow,
} from "@/lib/stats";
import { runOcr } from "@/lib/ocr";
import { compressImage, fileToDataUrl, sha256Hex } from "@/lib/image";
import { uploadProof } from "@/lib/storage";
import {
  calcPace,
  formatDateDot,
  formatDuration,
  formatKm,
  startOfWeekISO,
  todayISO,
} from "@/lib/format";
import { PacePicker } from "@/components/DurationPicker";
import SupabaseNotice from "@/components/SupabaseNotice";

export default function MePage() {
  const [user, setUser] = useState<User | null>(null);

  // 크루 전체 데이터(로그인 없이도 조회)
  const [crewRuns, setCrewRuns] = useState<PersonalRun[]>([]);
  const [ranking, setRanking] = useState<RankRow[]>([]);
  const [crewLoading, setCrewLoading] = useState(true);

  // 내 데이터(로그인 시)
  const [myRuns, setMyRuns] = useState<PersonalRun[]>([]);
  const [formOpen, setFormOpen] = useState(false);

  // 세션 추적: 초기 1회 + 변화 구독(카카오 콜백 복귀 포함)
  useEffect(() => {
    if (!supabaseReady) return;
    getCurrentUser().then(setUser);
    return onAuthChange(setUser);
  }, []);

  // 로그인되면 프로필 upsert(랭킹에 닉네임·아바타 노출)
  useEffect(() => {
    if (user) upsertMyProfile(user).catch(() => {});
  }, [user]);

  const reloadCrew = useCallback(async () => {
    const [runs, rank] = await Promise.all([getCrewRuns(), getCrewRanking()]);
    setCrewRuns(runs);
    setRanking(rank);
  }, []);

  const reloadMine = useCallback(async () => {
    if (!user) {
      setMyRuns([]);
      return;
    }
    setMyRuns(await listMyRuns(user.id));
  }, [user]);

  // 크루 데이터 초기 로드
  useEffect(() => {
    if (!supabaseReady) return;
    let active = true;
    (async () => {
      try {
        await reloadCrew();
      } finally {
        if (active) setCrewLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [reloadCrew]);

  // 내 기록 로드(로그인 변화 시)
  useEffect(() => {
    (async () => {
      try {
        await reloadMine();
      } catch {
        /* noop */
      }
    })();
  }, [reloadMine]);

  const myStats = useMemo(() => summarizeStats(myRuns), [myRuns]);

  if (!supabaseReady) return <SupabaseNotice />;

  async function onAddClick() {
    if (!user) {
      try {
        await signInWithKakao();
      } catch (e) {
        alert(e instanceof Error ? e.message : "로그인 실패");
      }
      return;
    }
    setFormOpen((v) => !v);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">📊 크루 기록·통계</h1>
          <p className="text-xs text-neutral-400">{crew.name}</p>
        </div>
        {user ? (
          <div className="flex items-center gap-2">
            {avatarOf(user) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarOf(user)!}
                alt=""
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : null}
            <span className="text-sm font-medium">{nicknameOf(user)}</span>
            <button
              onClick={() => signOut()}
              className="text-xs text-neutral-400 hover:text-neutral-600"
            >
              로그아웃
            </button>
          </div>
        ) : (
          <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-600">
            홈
          </Link>
        )}
      </div>

      {/* 통계 — 대상(크루/개인)·지표·기간 선택 */}
      <StatsExplorer
        crewRuns={crewRuns}
        ranking={ranking}
        currentUserId={user?.id}
        loading={crewLoading}
      />

      {/* 내 기록 추가 */}
      <button
        onClick={onAddClick}
        className="mt-6 w-full rounded-xl py-3.5 font-bold text-white transition"
        style={{ backgroundColor: crew.primary }}
      >
        {!user
          ? "＋ 카카오 로그인하고 내 기록 추가"
          : formOpen
            ? "× 닫기"
            : "＋ 내 기록 추가"}
      </button>

      {/* 로그인 + 폼 열림: 등록 폼 + 내 기록 */}
      {user && formOpen && (
        <UploadForm
          user={user}
          myRuns={myRuns}
          onAdded={async () => {
            await Promise.all([reloadMine(), reloadCrew()]);
          }}
        />
      )}

      {user && (
        <section className="mt-8">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-bold">내 기록</h2>
            <span className="text-sm text-neutral-500">
              합계{" "}
              <span className="tnum font-bold text-neutral-800">
                {formatKm(myStats.total)}
              </span>{" "}
              km · {myStats.runCount}회
            </span>
          </div>
          {myRuns.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-200 p-4 text-center text-sm text-neutral-400">
              아직 기록이 없어요. 위 “내 기록 추가”로 첫 기록을 올려보세요!
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
              {myRuns.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between px-4 py-3 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {r.image_url && (
                      <a href={r.image_url} target="_blank" rel="noreferrer" className="shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.image_url}
                          alt="인증"
                          className="h-10 w-10 rounded-md border border-neutral-200 object-cover"
                        />
                      </a>
                    )}
                    <div className="min-w-0">
                      <span className="tnum font-bold">
                        {formatKm(Number(r.distance_km))} km
                      </span>
                      <span className="ml-2 text-neutral-400">
                        {formatDateDot(r.run_date)}
                      </span>
                      {r.note && (
                        <span className="ml-2 truncate text-neutral-400">{r.note}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      if (!confirm("이 기록을 삭제할까요?")) return;
                      try {
                        await deletePersonalRun(r.id);
                        await Promise.all([reloadMine(), reloadCrew()]);
                      } catch (e) {
                        alert(e instanceof Error ? e.message : "삭제 실패");
                      }
                    }}
                    className="shrink-0 text-xs text-neutral-400 hover:text-red-500"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* 크루 랭킹 */}
      <section className="mt-8">
        <h2 className="mb-2 font-bold">🏅 크루 누적거리 랭킹</h2>
        {crewLoading ? (
          <p className="py-6 text-center text-sm text-neutral-400">불러오는 중…</p>
        ) : ranking.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-200 p-4 text-center text-sm text-neutral-400">
            아직 랭킹이 없어요. 첫 기록의 주인공이 되어보세요!
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            {ranking.map((row, i) => {
              const me = user?.id === row.userId;
              return (
                <li
                  key={row.userId}
                  className="flex items-center gap-3 px-4 py-3 text-sm"
                  style={me ? { backgroundColor: `${crew.primary}11` } : undefined}
                >
                  <span className="w-6 shrink-0 text-center font-bold text-neutral-400">
                    {i + 1}
                  </span>
                  {row.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.avatarUrl}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-200">
                      🏃
                    </div>
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {row.nickname}
                    {me && (
                      <span className="ml-1 text-xs" style={{ color: crew.primary }}>
                        (나)
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="tnum font-bold">{formatKm(row.totalKm)}</span>
                    <span className="text-neutral-400"> km · {row.runCount}회</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── 업로드 폼 ───────────────────────────────────────────
function UploadForm({
  user,
  myRuns,
  onAdded,
}: {
  user: User;
  myRuns: PersonalRun[];
  onAdded: () => Promise<void>;
}) {
  const [distance, setDistance] = useState("");
  const [paceSec, setPaceSec] = useState(0); // 평균 페이스(초/km)
  const [runDate, setRunDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageHash, setImageHash] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrError(null);
    setDistance("");
    setPaceSec(0);
    setOcrBusy(true);
    setOcrProgress(0);
    try {
      const dataUrl = await fileToDataUrl(file);
      setImageFile(file);
      setImagePreview(dataUrl);
      setImageHash(await sha256Hex(file));
      const { stats } = await runOcr(dataUrl, setOcrProgress);
      if (stats.distance) setDistance(stats.distance);
      else setOcrError("거리 자동인식 실패 — 거리 칸에 직접 입력해 주세요.");
      // 페이스 자동채움: OCR이 뽑은 "5'14\"" → 초. 러닝 범위(2:00~20:00/km) 밖이면 무시.
      const pace = parsePaceToSeconds(stats.pace);
      if (pace >= 120 && pace <= 1200) setPaceSec(pace);
    } catch (err) {
      console.error(err);
      setOcrError(
        (err instanceof Error ? err.message : String(err)) || "이미지 인식 실패"
      );
    } finally {
      setOcrBusy(false);
      e.target.value = "";
    }
  }

  async function handleSubmit() {
    const km = Number(distance);
    if (!km || km <= 0) return alert("거리를 올바르게 입력해 주세요.");
    if (!imageFile || !imageHash) return alert("인증 이미지를 첨부해 주세요.");
    const dup = myRuns.some(
      (r) => r.run_date === runDate && Number(r.distance_km) === km
    );
    if (dup && !confirm(`${runDate}에 ${km}km 기록이 이미 있어요. 그래도 추가할까요?`))
      return;
    setSubmitting(true);
    try {
      const existing = await findPersonalRunByImageHash(user.id, imageHash);
      if (existing) {
        alert("이미 등록된 인증 이미지예요. (같은 이미지는 한 번만 등록돼요)");
        return;
      }
      const blob = await compressImage(imageFile);
      const imageUrl = await uploadProof(blob);
      await addPersonalRun({
        userId: user.id,
        distanceKm: km,
        // 페이스(초/km) × 거리 = 소요시간. 평균페이스·최장시간 집계는 duration_sec 기반.
        durationSec: paceSec > 0 ? Math.round(paceSec * km) : null,
        runDate,
        note: note.trim() || null,
        imageUrl,
        imageHash,
      });
      setDistance("");
      setPaceSec(0);
      setNote("");
      setImageFile(null);
      setImagePreview(null);
      setImageHash(null);
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1800);
      await onAdded();
    } catch (e) {
      alert(e instanceof Error ? e.message : "제출 실패");
    } finally {
      setSubmitting(false);
    }
  }

  const distanceValid = Number(distance) > 0;

  return (
    <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-neutral-500">날짜</span>
        <input
          type="date"
          value={runDate}
          max={todayISO()}
          onChange={(e) => setRunDate(e.target.value)}
          className="input"
        />
      </label>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500">거리 (km)</span>
          <input
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            className="input"
            placeholder="8.24"
            inputMode="decimal"
          />
        </label>
        <div className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500">
            평균 페이스 <span className="text-neutral-400">(선택)</span>
          </span>
          <PacePicker paceSec={paceSec} onChange={setPaceSec} />
        </div>
      </div>

      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-medium text-neutral-500">메모 (선택)</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="input"
          placeholder="한강 반포지구 정기런"
        />
      </label>

      <div className="mt-4 rounded-xl bg-neutral-50 p-3">
        <span className="block text-xs font-medium text-neutral-500">
          인증 이미지 <span className="text-red-500">*</span> — 기록 스샷 올리면 거리
          자동인식 + 증빙으로 보관돼요
        </span>
        <input
          type="file"
          accept="image/*"
          onChange={onUpload}
          disabled={ocrBusy || submitting}
          className="mt-2 block w-full text-sm text-neutral-500 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-200 file:px-3 file:py-1.5 file:text-sm"
        />
        {imagePreview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imagePreview}
            alt="첨부한 인증 이미지 미리보기"
            className="mt-3 max-h-44 rounded-lg border border-neutral-200"
          />
        )}
        {ocrBusy && (
          <p className="mt-2 text-xs text-neutral-500">
            인식 중… {Math.round(ocrProgress * 100)}% (인식 후 거리 칸을 확인·수정하세요)
          </p>
        )}
        {ocrError && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm font-bold text-amber-700 ring-1 ring-amber-300">
            <span aria-hidden>⚠️</span>
            <span className="break-all">{ocrError}</span>
          </p>
        )}
        {!ocrBusy && imageFile && (
          <p className="mt-2 text-xs text-green-600">
            ✓ 인증 이미지 첨부됨 — 같은 이미지 중복은 자동 차단돼요
          </p>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting || ocrBusy || !imageFile || !distanceValid}
        className="mt-5 w-full rounded-xl py-3 font-bold text-white transition disabled:opacity-50"
        style={{ backgroundColor: crew.primary }}
      >
        {submitting
          ? "업로드 중…"
          : justAdded
            ? "✓ 추가됨!"
            : !imageFile
              ? "인증 이미지를 먼저 첨부하세요"
              : !distanceValid
                ? "거리를 입력하세요"
                : "기록 추가"}
      </button>
    </section>
  );
}

// ── 작은 컴포넌트들 ─────────────────────────────────────
function StatCard({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-2xl border border-neutral-200 bg-white p-4"
      style={accent ? { borderColor: crew.primary } : undefined}
    >
      <p className="text-xs text-neutral-400">{label}</p>
      <p className="mt-1">
        <span
          className="tnum text-2xl font-extrabold"
          style={accent ? { color: crew.primary } : undefined}
        >
          {value}
        </span>
        <span className="ml-1 text-xs text-neutral-400">{unit}</span>
      </p>
    </div>
  );
}

// ── 통계 탐색기(대상·지표·기간 선택) ─────────────────────
type Metric = "km" | "count";

function StatsExplorer({
  crewRuns,
  ranking,
  currentUserId,
  loading,
}: {
  crewRuns: PersonalRun[];
  ranking: RankRow[];
  currentUserId?: string;
  loading: boolean;
}) {
  const [target, setTarget] = useState("crew"); // "crew" | userId
  const [metric, setMetric] = useState<Metric>("km");
  const [period, setPeriod] = useState<"month" | "week">("month");

  const isCrew = target === "crew";
  const runs = useMemo(
    () => (isCrew ? crewRuns : crewRuns.filter((r) => r.user_id === target)),
    [crewRuns, target, isCrew]
  );
  const stats = useMemo(() => summarizeStats(runs), [runs]);

  const buckets = (period === "month" ? stats.monthly : stats.weekly).slice(
    period === "month" ? -8 : -10
  );
  const fmtKey = period === "month" ? mmLabel : weekLabel;
  const prefix = isCrew ? "크루" : "";

  return (
    <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-neutral-600">📊 통계</h2>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs font-medium"
        >
          <option value="crew">크루 전체</option>
          {ranking.map((r) => (
            <option key={r.userId} value={r.userId}>
              {r.nickname}
              {r.userId === currentUserId ? " (나)" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* 요약 카드 — 대상에 따라 변경 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={`${prefix} 누적`} value={formatKm(stats.total)} unit="km" accent />
        <StatCard label="이번 달" value={formatKm(stats.thisMonth)} unit="km" />
        <StatCard label="이번 주" value={formatKm(stats.thisWeek)} unit="km" />
        <StatCard label="총 러닝" value={String(stats.runCount)} unit="회" />
      </div>

      {/* 기록 하이라이트 — 평균 페이스·최장 거리·최장 시간 */}
      <div className="mt-3 grid grid-cols-3 gap-3">
        <StatCard
          label="평균 페이스"
          value={stats.timedCount > 0 ? calcPace(1, stats.avgPaceSec) : "—"}
          unit={stats.timedCount > 0 ? "/km" : ""}
        />
        <StatCard label="최장 거리" value={formatKm(stats.longestKm)} unit="km" />
        <StatCard
          label="최장 시간"
          value={stats.longestDurationSec > 0 ? formatDuration(stats.longestDurationSec) : "—"}
          unit=""
        />
      </div>
      {stats.timedCount === 0 && stats.runCount > 0 && (
        <p className="mt-2 text-xs text-neutral-400">
          기록 추가 시 <b>시간</b>을 입력하면 평균 페이스·최장 시간이 집계돼요.
        </p>
      )}

      {/* 활동 히트맵(잔디) */}
      <ActivityHeatmap byDay={stats.byDay} />

      {/* 지표·기간 토글 */}
      <div className="mt-5 flex items-center justify-between gap-2">
        <Toggle
          value={metric}
          onChange={(v) => setMetric(v)}
          options={[
            ["km", "거리"],
            ["count", "횟수"],
          ]}
        />
        <Toggle
          value={period}
          onChange={(v) => setPeriod(v)}
          options={[
            ["month", "월별"],
            ["week", "주별"],
          ]}
        />
      </div>

      <div className="mt-3">
        {loading ? (
          <p className="py-10 text-center text-sm text-neutral-400">불러오는 중…</p>
        ) : (
          <TrendChart buckets={buckets} fmtKey={fmtKey} metric={metric} />
        )}
      </div>
    </section>
  );
}

/** 작은 세그먼트 토글 */
function Toggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-neutral-200 text-xs">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className="px-3 py-1.5 font-medium transition"
          style={
            value === v
              ? { backgroundColor: crew.primary, color: "#fff" }
              : { color: "#737373" }
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** recharts 영역 차트 추이 (지표: 거리 km / 횟수) */
function TrendChart({
  buckets,
  fmtKey,
  metric,
}: {
  buckets: { key: string; km: number; runCount: number }[];
  fmtKey: (key: string) => string;
  metric: Metric;
}) {
  if (buckets.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-neutral-400">
        아직 데이터가 없어요.
      </p>
    );
  }

  const unit = metric === "km" ? "km" : "회";
  const data = buckets.map((b) => ({
    name: fmtKey(b.key),
    value: metric === "km" ? Number(b.km.toFixed(1)) : b.runCount,
  }));

  return (
    <div style={{ width: "100%", height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={crew.primary} stopOpacity={0.35} />
              <stop offset="100%" stopColor={crew.primary} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "#a3a3a3" }}
            tickLine={false}
            axisLine={{ stroke: "#e5e5e5" }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#a3a3a3" }}
            tickLine={false}
            axisLine={false}
            width={40}
            unit={unit}
            allowDecimals={metric === "km"}
          />
          <Tooltip
            formatter={(value) => {
              const v = typeof value === "number" ? value : Number(value);
              return [
                `${metric === "km" ? formatKm(v) : v} ${unit}`,
                metric === "km" ? "거리" : "횟수",
              ];
            }}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #e5e5e5",
              fontSize: 12,
            }}
            labelStyle={{ fontWeight: 700, color: "#404040" }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={crew.primary}
            strokeWidth={2.5}
            fill="url(#trendFill)"
            dot={{ r: 3, fill: "#fff", stroke: crew.primary, strokeWidth: 2 }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** "2026-06" → "6월" */
function mmLabel(key: string): string {
  return `${Number(key.slice(5, 7))}월`;
}
/** 주 시작일 "2026-06-02" → "6/2" */
function weekLabel(key: string): string {
  return `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;
}

// ── 활동 히트맵(GitHub 잔디 스타일) ─────────────────────────
const HEATMAP_WEEKS = 53; // 최근 약 1년
const CELL = 12; // 칸 크기(px)
const GAP = 3; // 칸 간격(px)

function ActivityHeatmap({ byDay }: { byDay: Record<string, number> }) {
  const scroller = useRef<HTMLDivElement>(null);
  // 마운트 시 최근(오른쪽)이 보이도록 스크롤
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  // 이번 주 월요일부터 (HEATMAP_WEEKS-1)주 전 월요일까지가 그리드의 시작
  const firstMonday = addDaysISO(startOfWeekISO(todayISO()), -7 * (HEATMAP_WEEKS - 1));
  const today = todayISO();

  // 주(열) 단위. 각 주는 월~일 7일.
  const weeks = Array.from({ length: HEATMAP_WEEKS }, (_, w) => {
    const monday = addDaysISO(firstMonday, w * 7);
    const days = Array.from({ length: 7 }, (_, d) => addDaysISO(monday, d));
    return { monday, days };
  });

  const activeDays = Object.values(byDay).filter((v) => v > 0).length;
  const totalKm = Object.values(byDay).reduce((a, b) => a + b, 0);

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-neutral-600">🔥 활동 히트맵</h3>
        <span className="text-xs text-neutral-400">
          최근 1년 · <span className="tnum">{activeDays}</span>일 ·{" "}
          <span className="tnum">{formatKm(totalKm)}</span> km
        </span>
      </div>

      <div ref={scroller} className="overflow-x-auto pb-1">
        <div className="inline-flex flex-col gap-1">
          {/* 월 라벨 */}
          <div className="flex" style={{ gap: GAP, paddingLeft: 22 }}>
            {weeks.map((wk, i) => {
              const prevMonth = i > 0 ? weeks[i - 1].monday.slice(5, 7) : "";
              const month = wk.monday.slice(5, 7);
              const show = month !== prevMonth;
              return (
                <div
                  key={wk.monday}
                  className="whitespace-nowrap text-[10px] text-neutral-400"
                  style={{ width: CELL }}
                >
                  {show ? `${Number(month)}월` : ""}
                </div>
              );
            })}
          </div>

          {/* 요일 라벨 + 칸 그리드 */}
          <div className="flex" style={{ gap: GAP }}>
            <div className="flex flex-col" style={{ gap: GAP, width: 22 - GAP }}>
              {["월", "", "수", "", "금", "", ""].map((label, d) => (
                <span
                  key={d}
                  className="text-right text-[9px] leading-none text-neutral-400"
                  style={{ height: CELL, lineHeight: `${CELL}px` }}
                >
                  {label}
                </span>
              ))}
            </div>

            {weeks.map((wk) => (
              <div key={wk.monday} className="flex flex-col" style={{ gap: GAP }}>
                {wk.days.map((date) => {
                  const future = date > today;
                  const km = byDay[date] ?? 0;
                  return (
                    <div
                      key={date}
                      title={future ? undefined : `${formatDateDot(date)} · ${formatKm(km)} km`}
                      style={{
                        width: CELL,
                        height: CELL,
                        borderRadius: 2,
                        backgroundColor: future ? "transparent" : heatColor(km),
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 범례 */}
      <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-neutral-400">
        <span>적음</span>
        {[0, 2.9, 5.9, 9.9, 15].map((km) => (
          <span
            key={km}
            style={{ width: CELL, height: CELL, borderRadius: 2, backgroundColor: heatColor(km) }}
          />
        ))}
        <span>많음</span>
      </div>
    </section>
  );
}

/** 하루 누적 거리(km) → 잔디 색(crew.primary 농도 4단계) */
function heatColor(km: number): string {
  if (km <= 0) return "#ebedf0";
  if (km < 3) return `${crew.primary}40`;
  if (km < 6) return `${crew.primary}73`;
  if (km < 10) return `${crew.primary}b3`;
  return crew.primary;
}

/** OCR 페이스 문자열("5'14\"" 또는 "5:14") → 초/km */
function parsePaceToSeconds(pace?: string): number {
  if (!pace) return 0;
  const m = pace.match(/(\d{1,2})\s*['′:]\s*(\d{1,2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

/** "YYYY-MM-DD" 에 days 일 더한 ISO 날짜 */
function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}
