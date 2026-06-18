// Strava 등에서 받은 경로를 추천 코스 좌표([lng,lat][])로 변환하는 도구 모음.
// API 없이 "웹페이지에서 가져오기" 두 경로를 모두 지원:
//   - GPX 텍스트/파일(활동·루트 → GPX 내보내기)
//   - Google encoded polyline 문자열(Strava 페이지에 박힌 형식)
// 결과는 lib/courses.ts 의 Course.coords 에 그대로 넣을 수 있다.

export type LngLat = [number, number];

/** Google encoded polyline 디코드 → [lng, lat][] (Strava 기본 정밀도 5). */
export function decodePolyline(str: string, precision = 5): LngLat[] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coords: LngLat[] = [];
  const factor = Math.pow(10, precision);

  while (index < str.length) {
    let result = 1;
    let shift = 0;
    let b: number;
    do {
      b = str.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 1;
    shift = 0;
    do {
      b = str.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lng / factor, lat / factor]); // GeoJSON = [lng, lat]
  }
  return coords;
}

/** GPX 텍스트(trkpt/rtept) → [lng, lat][]. 브라우저 DOMParser 사용. */
export function parseGpx(xml: string): LngLat[] {
  if (typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const pts = Array.from(doc.querySelectorAll("trkpt, rtept"));
  const coords: LngLat[] = [];
  for (const p of pts) {
    const lat = parseFloat(p.getAttribute("lat") ?? "");
    const lng = parseFloat(p.getAttribute("lon") ?? "");
    if (Number.isFinite(lat) && Number.isFinite(lng)) coords.push([lng, lat]);
  }
  return coords;
}

/** 입력이 GPX/XML 인지 대략 판별. 아니면 polyline 으로 취급. */
export function looksLikeGpx(text: string): boolean {
  return /<\?xml|<gpx|<trkpt|<rtept/i.test(text);
}

/** GPX/polyline 자동 감지 후 좌표 추출. */
export function parseRoute(text: string): LngLat[] {
  const t = text.trim();
  if (!t) return [];
  return looksLikeGpx(t) ? parseGpx(t) : decodePolyline(t);
}

/** 점 개수를 maxPoints 이하로 균등 샘플링(첫·끝점 보존). 정적 파일 비대화 방지. */
export function simplify(coords: LngLat[], maxPoints = 150): LngLat[] {
  if (coords.length <= maxPoints) return coords;
  const step = (coords.length - 1) / (maxPoints - 1);
  const out: LngLat[] = [];
  for (let i = 0; i < maxPoints; i++) out.push(coords[Math.round(i * step)]);
  out[out.length - 1] = coords[coords.length - 1];
  return out;
}

/** 경로 총거리(km) — haversine 합. */
export function routeDistanceKm(coords: LngLat[]): number {
  const R = 6371;
  let km = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    km += 2 * R * Math.asin(Math.sqrt(a));
  }
  return km;
}

/** lib/courses.ts 에 붙여넣을 Course 객체 소스 텍스트 생성(좌표는 소수점 5자리). */
export function toCourseSnippet(c: {
  id: string;
  name: string;
  region: string;
  distance: number;
  desc?: string;
  color: string;
  coords: LngLat[];
}): string {
  const r5 = (n: number) => Number(n.toFixed(5));
  const coordsText = c.coords
    .map(([lng, lat]) => `    [${r5(lng)}, ${r5(lat)}],`)
    .join("\n");
  const descLine = c.desc ? `\n    desc: ${JSON.stringify(c.desc)},` : "";
  return `  {
    id: ${JSON.stringify(c.id)},
    name: ${JSON.stringify(c.name)},
    region: ${JSON.stringify(c.region)},
    distance: ${Number(c.distance.toFixed(1))},${descLine}
    color: ${JSON.stringify(c.color)},
    coords: [
${coordsText}
    ],
  },`;
}
