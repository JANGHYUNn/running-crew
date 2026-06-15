/**
 * 목표 기록 → 페이스 전략 계산 (순수 함수, 백엔드 0).
 * "10km를 1시간 안에" 같은 목표를 넣으면 평균 페이스·구간별 통과표·전략을 만든다.
 */
import { calcPace } from "./format";

/** 거리 프리셋 (하프/풀은 공인 거리) */
export const DISTANCE_PRESETS = [
  { label: "5K", km: 5 },
  { label: "10K", km: 10 },
  { label: "하프", km: 21.0975 },
  { label: "풀", km: 42.195 },
] as const;

export type StrategyType = "even" | "negative" | "positive";

export interface StrategyOption {
  type: StrategyType;
  label: string;
  desc: string;
  /** 평균 대비 시작 페이스 가감(초/km). +면 천천히 시작 → 후반 가속(네거티브) */
  swing: number;
  recommended?: boolean;
}

export const STRATEGIES: StrategyOption[] = [
  {
    type: "even",
    label: "이븐",
    desc: "처음부터 끝까지 같은 속도. 가장 단순하고 페이스 감각 잡기 좋아요.",
    swing: 0,
  },
  {
    type: "negative",
    label: "네거티브",
    desc: "초반을 살짝 여유 있게, 후반에 가속. 같은 실력이면 기록 단축에 가장 유리해요.",
    swing: 10,
    recommended: true,
  },
  {
    type: "positive",
    label: "포지티브",
    desc: "초반에 시간을 벌어두기. 후반 체력에 자신 있을 때만.",
    swing: -10,
  },
];

export interface SplitRow {
  index: number;
  /** 이 구간이 끝나는 지점(km) — 보통 1,2,3…, 마지막은 총거리 */
  toKm: number;
  /** 이 구간 길이(km) — 보통 1, 마지막은 나머지 */
  segmentKm: number;
  /** 이 구간 페이스(초/km) */
  segmentPaceSec: number;
  /** toKm 통과 시점 누적 시간(초) */
  cumulativeSec: number;
}

/**
 * 누적 시간 함수 T(s). 페이스가 거리에 따라 선형으로 변하는 모델.
 * pace(s) = avg + swing·(1 - 2s/D)  →  T(s) = avg·s + swing·(s - s²/D).
 * swing 부호와 무관하게 T(D) = targetSec 이 항상 보장됨(목표 시간 정확히 맞음).
 */
function cumulativeTimeAt(
  s: number,
  totalKm: number,
  targetSec: number,
  swing: number
): number {
  const avgPace = targetSec / totalKm;
  return avgPace * s + swing * (s - (s * s) / totalKm);
}

/** 구간별(보통 1km 단위) 통과 표 생성. 마지막 자투리 거리는 별도 행으로. */
export function buildSplits(
  totalKm: number,
  targetSec: number,
  swing: number
): SplitRow[] {
  if (totalKm <= 0 || targetSec <= 0) return [];

  const marks: number[] = [];
  const full = Math.floor(totalKm + 1e-9);
  for (let k = 1; k <= full; k++) marks.push(k);
  if (totalKm - full > 1e-6) marks.push(totalKm); // 하프/풀의 자투리

  const rows: SplitRow[] = [];
  let prevKm = 0;
  let prevSec = 0;
  marks.forEach((toKm, i) => {
    const cumulativeSec = cumulativeTimeAt(toKm, totalKm, targetSec, swing);
    const segmentKm = toKm - prevKm;
    rows.push({
      index: i + 1,
      toKm,
      segmentKm,
      segmentPaceSec: (cumulativeSec - prevSec) / segmentKm,
      cumulativeSec,
    });
    prevKm = toKm;
    prevSec = cumulativeSec;
  });
  return rows;
}

/** 평균 페이스(초/km) */
export function avgPaceSec(totalKm: number, targetSec: number): number {
  if (totalKm <= 0) return 0;
  return targetSec / totalKm;
}

/** 초/km → "5'30\"" (format.calcPace 재사용) */
export function formatPaceSec(secPerKm: number): string {
  return calcPace(1, secPerKm);
}

// ── 목표 현실성 진단 (Riegel 공식) ──────────────────────────
// 최근 기록 하나로 다른 거리 기록을 예측: T2 = T1·(D2/D1)^1.06
export function predictTimeSec(
  knownKm: number,
  knownSec: number,
  targetKm: number
): number {
  if (knownKm <= 0 || knownSec <= 0) return 0;
  return knownSec * Math.pow(targetKm / knownKm, 1.06);
}

// 무리한 목표일 때 추천하는 "첫 목표"의 개선폭(현재 실력 예측 대비). 0.97 = 3% 빠르게.
const SUGGEST_IMPROVE = 0.97;

export type FeasibilityLevel = "easy" | "realistic" | "challenging" | "hard";

export interface Feasibility {
  predictedSec: number;
  /** 목표시간 / 예측시간. <1 이면 현재 실력보다 빠른(어려운) 목표 */
  ratio: number;
  level: FeasibilityLevel;
  title: string;
  message: string;
  /** 무리한 목표일 때 현실적 추천 시간(초) */
  suggestSec?: number;
}

export function assessFeasibility(
  knownKm: number,
  knownSec: number,
  targetKm: number,
  targetSec: number
): Feasibility | null {
  const predictedSec = predictTimeSec(knownKm, knownSec, targetKm);
  if (!predictedSec || !targetSec) return null;
  const ratio = targetSec / predictedSec;

  if (ratio >= 1.0) {
    return {
      predictedSec,
      ratio,
      level: "easy",
      title: "여유 있는 목표",
      message:
        "최근 기록 기준 충분히 가능한 목표예요. 더 도전적으로 잡아도 좋아요.",
    };
  }
  if (ratio >= 0.97) {
    return {
      predictedSec,
      ratio,
      level: "realistic",
      title: "현실적인 목표",
      message: "현재 실력에 거의 맞아요. 컨디션·코스만 받쳐주면 달성권이에요.",
    };
  }
  if (ratio >= 0.93) {
    return {
      predictedSec,
      ratio,
      level: "challenging",
      title: "도전적인 목표",
      message:
        "현재 실력보다 조금 빨라요. 몇 주 인터벌·템포런으로 끌어올리면 노려볼 만해요.",
    };
  }
  return {
    predictedSec,
    ratio,
    level: "hard",
    title: "다소 무리한 목표",
    message:
      "지금 실력 대비 꽤 빠른 목표예요. 아래 추천 기록부터 단계적으로 올리는 걸 권해요.",
    // 추천 목표 = 현재 실력 예측보다 살짝 빠른(도달 가능한) 첫 기록. 예측값과 동일하면
    // "추천"의 의미가 없으므로 ~3% 개선치로(무리한 목표보단 훨씬 쉬움).
    suggestSec: Math.round(predictedSec * SUGGEST_IMPROVE),
  };
}
