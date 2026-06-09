"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { crew } from "@/lib/crew";
import DurationPicker from "@/components/DurationPicker";
import { formatDuration } from "@/lib/format";
import {
  assessFeasibility,
  avgPaceSec,
  buildSplits,
  DISTANCE_PRESETS,
  formatPaceSec,
  STRATEGIES,
  type FeasibilityLevel,
  type StrategyType,
} from "@/lib/strategy";

export default function PacePage() {
  const [distance, setDistance] = useState("10");
  const [targetSec, setTargetSec] = useState(55 * 60); // 기본 55:00
  const [strategy, setStrategy] = useState<StrategyType>("negative");
  const [explainOpen, setExplainOpen] = useState(true);

  // 목표 현실성 진단(선택): 최근 기록
  const [recentDist, setRecentDist] = useState("");
  const [recentSec, setRecentSec] = useState(0);

  const totalKm = Number(distance);
  const valid = totalKm > 0 && targetSec > 0;

  const swing = STRATEGIES.find((s) => s.type === strategy)?.swing ?? 0;

  const splits = useMemo(
    () => (valid ? buildSplits(totalKm, targetSec, swing) : []),
    [valid, totalKm, targetSec, swing]
  );
  const avgSec = valid ? avgPaceSec(totalKm, targetSec) : 0;

  const recentKm = Number(recentDist);
  const feasibility = useMemo(
    () =>
      valid && recentKm > 0 && recentSec > 0
        ? assessFeasibility(recentKm, recentSec, totalKm, targetSec)
        : null,
    [valid, recentKm, recentSec, totalKm, targetSec]
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">🎯 목표 기록 페이스 전략</h1>
          <p className="text-xs text-neutral-400">
            목표 거리·시간을 넣으면 구간별 통과 페이스를 짜줘요
          </p>
        </div>
        <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-600">
          홈
        </Link>
      </div>

      {/* 입력 */}
      <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5">
        <span className="mb-2 block text-xs font-medium text-neutral-500">
          목표 거리
        </span>
        <div className="mb-3 flex flex-wrap gap-2">
          {DISTANCE_PRESETS.map((p) => {
            const on = Number(distance) === p.km;
            return (
              <button
                key={p.label}
                onClick={() => setDistance(String(p.km))}
                className="rounded-full border px-3 py-1.5 text-sm font-medium transition"
                style={
                  on
                    ? { backgroundColor: crew.primary, color: "#fff", borderColor: crew.primary }
                    : { borderColor: "#e5e5e5", color: "#525252" }
                }
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">
              거리 (km)
            </span>
            <input
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
              className="input tnum"
              placeholder="10"
              inputMode="decimal"
            />
          </label>
          <div className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">
              목표 시간
            </span>
            <DurationPicker seconds={targetSec} onChange={setTargetSec} />
          </div>
        </div>
      </section>

      {!valid ? (
        <p className="mt-6 rounded-xl border border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-400">
          목표 거리와 시간을 입력하면 전략표가 나타나요.
        </p>
      ) : (
        <>
          {/* 평균 페이스 요약 */}
          <section className="mt-6 grid grid-cols-3 gap-3">
            <SummaryCard label="목표" value={`${trimKm(totalKm)} km`} accent />
            <SummaryCard label="완주 시간" value={formatDuration(targetSec)} />
            <SummaryCard label="평균 페이스" value={formatPaceSec(avgSec)} unit="/km" />
          </section>

          {/* 전략 선택 */}
          <section className="mt-6">
            <div className="flex overflow-hidden rounded-xl border border-neutral-200">
              {STRATEGIES.map((s) => {
                const on = strategy === s.type;
                return (
                  <button
                    key={s.type}
                    onClick={() => setStrategy(s.type)}
                    className="flex-1 px-2 py-2.5 text-sm font-semibold transition"
                    style={
                      on
                        ? { backgroundColor: crew.primary, color: "#fff" }
                        : { color: "#737373" }
                    }
                  >
                    {s.label}
                    {s.recommended && <span> ★</span>}
                  </button>
                );
              })}
            </div>

            {/* 펼쳐보는 용어 설명 */}
            <button
              onClick={() => setExplainOpen((v) => !v)}
              className="mt-2 flex w-full items-center justify-between text-left text-xs font-medium text-neutral-500 hover:text-neutral-700"
            >
              <span>ⓘ 이븐·네거티브·포지티브가 뭐가 달라요?</span>
              <span className="text-neutral-400">{explainOpen ? "▲ 접기" : "▼ 펼치기"}</span>
            </button>

            {explainOpen ? (
              <ul className="mt-2 space-y-2 rounded-xl bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-600">
                {STRATEGIES.map((s) => (
                  <li
                    key={s.type}
                    className="flex gap-2"
                    style={
                      strategy === s.type
                        ? { color: crew.primary, fontWeight: 600 }
                        : undefined
                    }
                  >
                    <span className="shrink-0">{STRATEGY_VISUAL[s.type]}</span>
                    <span>
                      <b>{s.label}</b>
                      {s.recommended && " (추천)"} — {s.desc}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-neutral-500">
                {STRATEGIES.find((s) => s.type === strategy)?.desc}
              </p>
            )}
          </section>

          {/* 구간 통과표 */}
          <section className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <div className="grid grid-cols-3 border-b border-neutral-100 bg-neutral-50 px-4 py-2.5 text-xs font-medium text-neutral-500">
              <span>구간</span>
              <span className="text-right">랩 페이스</span>
              <span className="text-right">누적 통과</span>
            </div>
            <ul className="divide-y divide-neutral-100">
              {splits.map((row) => {
                const isMajor = Math.abs(row.toKm % 5) < 1e-6;
                const isPartial = row.segmentKm < 0.999;
                const hi = isMajor || isPartial;
                return (
                  <li
                    key={row.index}
                    className="grid grid-cols-3 px-4 py-2.5 text-sm"
                    style={hi ? { backgroundColor: `${crew.primary}0d` } : undefined}
                  >
                    <span className={`tnum ${hi ? "font-bold" : "text-neutral-600"}`}>
                      {trimKm(row.toKm)} km
                    </span>
                    <span className="tnum text-right text-neutral-500">
                      {formatPaceSec(row.segmentPaceSec)}
                    </span>
                    <span
                      className={`tnum text-right ${hi ? "font-bold" : "font-medium text-neutral-700"}`}
                      style={hi ? { color: crew.primary } : undefined}
                    >
                      {formatDuration(row.cumulativeSec)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* 목표 현실성 진단(선택) */}
          <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5">
            <h2 className="text-sm font-bold text-neutral-600">
              🔍 이 목표 현실적일까?{" "}
              <span className="font-normal text-neutral-400">(선택)</span>
            </h2>
            <p className="mt-1 text-xs text-neutral-400">
              최근 달린 기록을 넣으면 현재 실력으로 가능한지 진단해줘요.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-neutral-500">
                  최근 거리 (km)
                </span>
                <input
                  value={recentDist}
                  onChange={(e) => setRecentDist(e.target.value)}
                  className="input tnum"
                  placeholder="5"
                  inputMode="decimal"
                />
              </label>
              <div className="block">
                <span className="mb-1 block text-xs font-medium text-neutral-500">
                  그때 기록
                </span>
                <DurationPicker seconds={recentSec} onChange={setRecentSec} />
              </div>
            </div>

            {feasibility && (
              <div
                className="mt-4 rounded-xl p-4 text-sm"
                style={feasibilityStyle(feasibility.level)}
              >
                <p className="font-bold">
                  {feasibilityEmoji(feasibility.level)} {feasibility.title}
                </p>
                <p className="mt-1 leading-relaxed">{feasibility.message}</p>
                <p className="mt-2 text-xs opacity-80">
                  현재 실력 예상 기록{" "}
                  <b className="tnum">{formatDuration(feasibility.predictedSec)}</b>
                  {feasibility.suggestSec && (
                    <>
                      {" "}· 추천 목표{" "}
                      <b className="tnum">{formatDuration(feasibility.suggestSec)}</b>
                    </>
                  )}
                </p>
              </div>
            )}
          </section>

          <p className="mt-4 text-center text-xs text-neutral-400">
            ★ 네거티브 = 초반에 욕심내지 않는 게 핵심. 첫 1~2km는 표보다 더 천천히 가도 돼요.
          </p>
        </>
      )}
    </div>
  );
}

// ── 작은 컴포넌트/헬퍼 ─────────────────────────────────────
const STRATEGY_VISUAL: Record<StrategyType, string> = {
  even: "🟰",
  negative: "🐢→🐇",
  positive: "🐇→🐢",
};

function SummaryCard({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-2xl border border-neutral-200 bg-white p-4 text-center"
      style={accent ? { borderColor: crew.primary } : undefined}
    >
      <p className="text-xs text-neutral-400">{label}</p>
      <p className="mt-1">
        <span
          className="tnum text-xl font-extrabold"
          style={accent ? { color: crew.primary } : undefined}
        >
          {value}
        </span>
        {unit && <span className="ml-0.5 text-xs text-neutral-400">{unit}</span>}
      </p>
    </div>
  );
}

/** 거리 표기: 정수면 그대로, 소수면 불필요한 0 제거(21.0975 → 21.1) */
function trimKm(km: number): string {
  if (Number.isInteger(km)) return String(km);
  return km.toFixed(2).replace(/\.?0+$/, "");
}

function feasibilityEmoji(level: FeasibilityLevel): string {
  return { easy: "😎", realistic: "👍", challenging: "🔥", hard: "⚠️" }[level];
}

function feasibilityStyle(level: FeasibilityLevel): React.CSSProperties {
  const map: Record<FeasibilityLevel, [string, string]> = {
    easy: ["#f0fdf4", "#86efac"],
    realistic: ["#eff6ff", "#93c5fd"],
    challenging: ["#fff7ed", "#fdba74"],
    hard: ["#fef2f2", "#fca5a5"],
  };
  const [bg, ring] = map[level];
  return { backgroundColor: bg, boxShadow: `inset 0 0 0 1px ${ring}` };
}
