// 땅따먹기(territory) 격자·기하 — 백엔드 없이 순수 계산.
//
// 소유권 단위는 ~50m 정사각 셀(겹침·뺏기·면적 계산이 정확해진다). 점령 규칙은
// "최신 점령 우선"(뺏기 가능, DB claim_cells_for, supabase/territory.sql).
// 단 화면에는 셀을 "하나의 폴리곤으로 합쳐서"(dissolve) 매끈하게 그린다.
//
//  - routeToTerritory: GPS 경로 → 점령 셀(버퍼로 밴드 확장 + 닫힌 루프 내부 채움).
//  - cellsToPolygons:  소유 셀 묶음 → 합쳐진 폴리곤(외곽 + 구멍) [렌더용].

/** 셀 한 변 길이(미터) */
export const CELL_M = 50;

// 경로를 면으로 만들기 위한 버퍼(셀 단위 팽창 반경). 열린 경로(시작≠종료)도 밴드형 폴리곤이 된다.
export const BUFFER_CELLS = 1;

// 땅따먹기 "최근" 기간(일). 점령 시각이 이 기간을 벗어난 셀은 지도·순위에서 사라진다.
// → 오래된 기록으로 땅을 깔 수 없고, 계속 달려야 땅을 유지한다.
export const WINDOW_DAYS = 7;

/** 점령 인정 하한 시각(ISO). 이보다 오래된 claimed_at 은 제외. */
export function windowCutoffISO(): string {
  return new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
}

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

/** GPS 경로([lng,lat][]) → 지나간 셀 Map.
 *  점 사이 구간을 셀 1/3 간격으로 보간해, 점 간격이 벌어져도 셀이 빠지지 않게 한다. */
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

/** 셀 집합을 r칸(체비셰프 거리)만큼 팽창 — 경로를 밴드(면)로 만든다. */
function dilate(cells: Map<string, Cell>, r: number): Map<string, Cell> {
  if (r <= 0) return new Map(cells);
  const out = new Map(cells);
  for (const c of cells.values()) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const x = c.x + dx;
        const y = c.y + dy;
        out.set(cellKey(x, y), { x, y });
      }
    }
  }
  return out;
}

/** 셀들이 둘러싼 내부 빈칸을 채운다(닫힌 루프 → 면). 바깥에서 4방향 flood 로 '외부'를 찾고 나머지를 내부로. */
function fillEnclosed(cells: Map<string, Cell>): Map<string, Cell> {
  if (cells.size === 0) return new Map(cells);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of cells.values()) {
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.x > maxX) maxX = c.x;
    if (c.y > maxY) maxY = c.y;
  }
  // bbox 를 1칸 패딩 → 외부가 항상 테두리에서 연결되도록.
  minX -= 1;
  minY -= 1;
  maxX += 1;
  maxY += 1;

  const outside = new Set<string>();
  const stack: Cell[] = [{ x: minX, y: minY }];
  const inBox = (x: number, y: number) => x >= minX && x <= maxX && y >= minY && y <= maxY;
  while (stack.length) {
    const { x, y } = stack.pop()!;
    const k = cellKey(x, y);
    if (!inBox(x, y) || outside.has(k) || cells.has(k)) continue;
    outside.add(k);
    stack.push({ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 });
  }

  const out = new Map(cells);
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      const k = cellKey(x, y);
      if (!cells.has(k) && !outside.has(k)) out.set(k, { x, y }); // 내부 빈칸 → 채움
    }
  }
  return out;
}

/** GPS 경로 → 점령 셀(버퍼 밴드 + 닫힌 루프 내부 채움). 웹훅/서버에서 사용. */
export function routeToTerritory(coords: [number, number][]): Map<string, Cell> {
  const line = routeToCells(coords);
  if (line.size === 0) return line;
  return fillEnclosed(dilate(line, BUFFER_CELLS));
}

// ── 렌더용: 셀 묶음 → 합쳐진 폴리곤 ────────────────────────
type Ring = [number, number][]; // [lng, lat][] (닫힘)
/** GeoJSON Polygon coordinates: [외곽링, 구멍링...] */
export type Poly = Ring[];

const cornerKey = (cx: number, cy: number) => `${cx}_${cy}`;

/** 소유 셀 묶음 → 외곽선을 따낸 폴리곤 배열(인접 셀은 하나로 합쳐짐, 구멍 포함). */
export function cellsToPolygons(cells: Cell[]): Poly[] {
  if (cells.length === 0) return [];
  const has = new Set(cells.map((c) => cellKey(c.x, c.y)));
  const inSet = (x: number, y: number) => has.has(cellKey(x, y));

  // 경계 방향 엣지: 셀 내부가 왼쪽이 되도록 CCW. 코너 좌표(정수)는 셀 격자의 꼭짓점.
  const edges = new Map<string, [number, number][]>(); // startCorner → endCorners
  const addEdge = (ax: number, ay: number, bx: number, by: number) => {
    const k = cornerKey(ax, ay);
    const list = edges.get(k);
    if (list) list.push([bx, by]);
    else edges.set(k, [[bx, by]]);
  };
  for (const { x, y } of cells) {
    if (!inSet(x, y - 1)) addEdge(x, y, x + 1, y); // bottom →
    if (!inSet(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1); // right ↑
    if (!inSet(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1); // top ←
    if (!inSet(x - 1, y)) addEdge(x, y + 1, x, y); // left ↓
  }

  // 엣지를 이어 닫힌 링으로(코너 정수 좌표).
  const intRings: [number, number][][] = [];
  for (const [startKey, ends] of edges) {
    while (ends.length) {
      const [sx, sy] = startKey.split("_").map(Number);
      const ring: [number, number][] = [[sx, sy]];
      let cx = sx;
      let cy = sy;
      let safety = 0;
      while (safety++ < 1_000_000) {
        const list = edges.get(cornerKey(cx, cy));
        if (!list || list.length === 0) break;
        const [nx, ny] = list.pop()!;
        ring.push([nx, ny]);
        cx = nx;
        cy = ny;
        if (cx === sx && cy === sy) break; // 링 닫힘
      }
      if (ring.length >= 4) intRings.push(ring);
    }
  }

  // 외곽(반시계, 양의 면적) vs 구멍(시계, 음의 면적) 분류 후 구멍을 외곽에 중첩.
  const signedArea = (r: [number, number][]) => {
    let a = 0;
    for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
    return a / 2;
  };
  const pointInRing = (px: number, py: number, r: [number, number][]) => {
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i];
      const [xj, yj] = r[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };

  const outers: { ring: [number, number][]; area: number; holes: [number, number][][] }[] = [];
  const holes: [number, number][][] = [];
  for (const r of intRings) {
    if (signedArea(r) >= 0) outers.push({ ring: r, area: signedArea(r), holes: [] });
    else holes.push(r);
  }
  for (const h of holes) {
    const [hx, hy] = h[0];
    // 구멍을 포함하는 가장 작은 외곽에 귀속.
    let best: (typeof outers)[number] | null = null;
    for (const o of outers) {
      if (pointInRing(hx, hy, o.ring) && (!best || o.area < best.area)) best = o;
    }
    if (best) best.holes.push(h);
  }

  // 코너 정수 → [lng,lat] 변환.
  const toLngLat = (r: [number, number][]): Ring =>
    r.map(([cx, cy]) => [cx * LNG_STEP, cy * LAT_STEP] as [number, number]);

  return outers.map((o) => [toLngLat(o.ring), ...o.holes.map(toLngLat)]);
}

/** user_id(uuid) → 안정적인 소유자 색(HSL). 같은 유저는 항상 같은 색. */
export function colorForUser(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 75% 55%)`;
}
