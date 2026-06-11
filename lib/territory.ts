// 땅따먹기(territory) 격자 로직 — 백엔드 없이 순수 계산.
//
// 지도를 ~50m 정사각 셀로 나눠, 크루원의 GPS 경로가 지나간 셀을 점령한다.
// 점령 규칙은 "최신 점령 우선"(뺏기 가능) — DB의 claim_cells RPC가 담당(supabase/territory.sql).
// 이 파일은 좌표 ↔ 셀 변환·경로 래스터라이즈·소유자 색만 책임진다.

/** 셀 한 변 길이(미터) */
export const CELL_M = 50;

// 위도 1°≈111,320m. 경도 1°는 위도에 따라 좁아지므로(=cos) 기준 위도에서 ~정사각이 되도록 보정.
// 격자가 전 좌표에서 일관되게 깔리려면 스텝이 "고정 상수"여야 한다 → 크루 활동 지역(서울권) 기준.
const REF_LAT = 37.5;
const LAT_STEP = CELL_M / 111_320;
const LNG_STEP = CELL_M / (111_320 * Math.cos((REF_LAT * Math.PI) / 180));

/** 셀 정수 좌표(x=경도칸, y=위도칸) */
export interface Cell {
  x: number;
  y: number;
}

/** [lng, lat] → 셀 정수 좌표 */
export function cellOf(lng: number, lat: number): Cell {
  return { x: Math.floor(lng / LNG_STEP), y: Math.floor(lat / LAT_STEP) };
}

/** 셀 고유 키(DB primary key) */
export function cellKey(x: number, y: number): string {
  return `${x}_${y}`;
}

/** GPS 경로([lng,lat][]) → 지나간 셀 키 Set.
 *  점 사이 구간을 셀 절반보다 촘촘히 보간해, 점 간격이 벌어져도 셀이 빠지지 않게 한다.
 *  (icu 스트림은 보통 1초 간격이라 점 자체가 이미 촘촘하지만 안전장치) */
export function routeToCells(coords: [number, number][]): Map<string, Cell> {
  const cells = new Map<string, Cell>();
  if (coords.length === 0) return cells;

  const add = (lng: number, lat: number) => {
    const c = cellOf(lng, lat);
    cells.set(cellKey(c.x, c.y), c);
  };

  let [plng, plat] = coords[0];
  add(plng, plat);
  for (let i = 1; i < coords.length; i++) {
    const [lng, lat] = coords[i];
    const dx = lng - plng;
    const dy = lat - plat;
    // 구간을 셀 스텝의 1/3 간격으로 샘플(대각 이동에서도 셀 누락 없게 여유).
    const steps = Math.max(
      1,
      Math.ceil(Math.max(Math.abs(dx) / LNG_STEP, Math.abs(dy) / LAT_STEP) * 3)
    );
    for (let s = 1; s <= steps; s++) {
      add(plng + (dx * s) / steps, plat + (dy * s) / steps);
    }
    plng = lng;
    plat = lat;
  }
  return cells;
}

/** 셀 → 닫힌 사각 폴리곤([lng,lat][], GeoJSON 순서) */
export function cellPolygon(x: number, y: number): [number, number][] {
  const lng0 = x * LNG_STEP;
  const lat0 = y * LAT_STEP;
  const lng1 = lng0 + LNG_STEP;
  const lat1 = lat0 + LAT_STEP;
  return [
    [lng0, lat0],
    [lng1, lat0],
    [lng1, lat1],
    [lng0, lat1],
    [lng0, lat0],
  ];
}

/** user_id(uuid) → 안정적인 소유자 색(HSL). 같은 유저는 항상 같은 색. */
export function colorForUser(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 75% 55%)`;
}
