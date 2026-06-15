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

/** 오늘 날짜를 로컬 기준 "YYYY-MM-DD" 로 반환(input[type=date]·시즌 비교용) */
export function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 거리(km) 표기: 소수 1자리, 1000단위 콤마 */
export function formatKm(km: number): string {
  return km.toLocaleString("ko-KR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/** "YYYY-MM-DD" → "YYYY-MM" (월별 집계 키) */
export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** "YYYY-MM-DD" → 그 주(월요일 시작)의 월요일 "YYYY-MM-DD" (주별 집계 키) */
export function startOfWeekISO(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  const day = d.getDay(); // 0=일 ~ 6=토
  const diff = day === 0 ? 6 : day - 1; // 월요일까지 되돌릴 일수
  d.setDate(d.getDate() - diff);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

// ── 연속 기간 키 열거(통계 그래프 빈 기간 0 채움용) ──────────
/** "YYYY-MM" 키에서 n개월 뺀 키 */
export function monthKeyMinus(key: string, n: number): string {
  let [y, m] = key.split("-").map(Number);
  m -= n;
  while (m <= 0) {
    m += 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** 주 시작일 키("YYYY-MM-DD")에서 n주 뺀 키 */
export function weekKeyMinus(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() - n * 7);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

/** 두 "YYYY-MM" 키 사이(포함)의 모든 월 키를 오름차순으로 */
export function enumerateMonths(startKey: string, endKey: string): string[] {
  const out: string[] = [];
  let [y, m] = startKey.split("-").map(Number);
  for (let guard = 0; guard < 600; guard++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (key > endKey) break;
    out.push(key);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** "YYYY-MM-DD" 에서 n일 뺀 키 */
export function dayKeyMinus(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() - n);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

/** 두 "YYYY-MM-DD" 키 사이(포함)의 모든 날짜 키를 오름차순으로(1일 간격) */
export function enumerateDays(startKey: string, endKey: string): string[] {
  const out: string[] = [];
  const d = new Date(`${startKey}T00:00:00`);
  const end = new Date(`${endKey}T00:00:00`);
  for (let guard = 0; guard < 1000 && d <= end; guard++) {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    out.push(`${d.getFullYear()}-${m}-${dd}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** 두 주 시작일 키("YYYY-MM-DD") 사이(포함)의 모든 주 키를 오름차순으로(7일 간격) */
export function enumerateWeeks(startKey: string, endKey: string): string[] {
  const out: string[] = [];
  const d = new Date(`${startKey}T00:00:00`);
  const end = new Date(`${endKey}T00:00:00`);
  for (let guard = 0; guard < 600 && d <= end; guard++) {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    out.push(`${d.getFullYear()}-${m}-${dd}`);
    d.setDate(d.getDate() + 7);
  }
  return out;
}
