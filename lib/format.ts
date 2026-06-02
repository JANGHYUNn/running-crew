/** "hh:mm:ss" 또는 "mm:ss" 문자열을 총 초로 변환 */
export function parseDurationToSeconds(input: string): number {
  const parts = input
    .split(":")
    .map((p) => p.trim())
    .filter((p) => p !== "")
    .map((p) => Number(p));

  if (parts.some((n) => Number.isNaN(n))) return 0;

  if (parts.length === 3) {
    const [h, m, s] = parts;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    return m * 60 + s;
  }
  if (parts.length === 1) {
    return parts[0] * 60; // 분 단위로 간주
  }
  return 0;
}

/** 총 초 → "h:mm:ss" (1시간 미만이면 "m:ss") */
export function formatDuration(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds < 0) return "0:00";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/**
 * 페이스 계산: km당 분/초.
 * @returns 예: 5'32"
 */
export function calcPace(distanceKm: number, totalSeconds: number): string {
  if (!distanceKm || !totalSeconds) return "--'--\"";
  const secPerKm = totalSeconds / distanceKm;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  // 반올림으로 60초가 되면 분으로 올림
  const adjM = s === 60 ? m + 1 : m;
  const adjS = s === 60 ? 0 : s;
  return `${adjM}'${String(adjS).padStart(2, "0")}"`;
}

/** YYYY-MM-DD → "2026.06.02" 표기 */
export function formatDateDot(isoDate: string): string {
  if (!isoDate) return "";
  return isoDate.replaceAll("-", ".");
}
