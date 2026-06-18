// 웹훅 CPU 초과 원인 진단 — 실제 활동의 GPS 스트림을 받아 territory 계산이
// 왜 폭주하는지 "터뜨리지 않고" 측정한다(실제 fillEnclosed/보간 루프는 돌리지 않음).
//
// 사용법:
//   ICU_API_KEY=xxxxx node scripts/diagnose-activity.mjs 158049541
//   (icu API key: intervals.icu → Settings → Developer settings → API key)
//
// 출력: 좌표 수 / 위경도 범위 / 이상치(0,0·한국권 밖·비유한) / 격자 bbox 칸수 /
//       routeToCells 보간 총 step 수 → 무엇이 CPU를 태웠는지 한눈에.

const CELL_M = 50;
const REF_LAT = 37.5;
const LAT_STEP = CELL_M / 111_320;
const LNG_STEP = CELL_M / (111_320 * Math.cos((REF_LAT * Math.PI) / 180));

const id = process.argv[2];
const key = process.env.ICU_API_KEY;
if (!id || !key) {
  console.error("usage: ICU_API_KEY=xxx node scripts/diagnose-activity.mjs <activityId>");
  process.exit(1);
}

const auth = "Basic " + Buffer.from(`API_KEY:${key}`).toString("base64");
const res = await fetch(`https://intervals.icu/api/v1/activity/${id}/streams.json?types=latlng`, {
  headers: { Authorization: auth },
});
if (!res.ok) {
  console.error(`streams ${res.status}: ${await res.text().catch(() => "")}`);
  process.exit(1);
}
const streams = await res.json();
const s = Array.isArray(streams) ? streams.find((x) => x.type === "latlng") : undefined;
if (!s?.data || !s.data2) {
  console.log("latlng 스트림 없음 → coords=0 (이 케이스라면 보류됐어야 정상)");
  process.exit(0);
}
const lat = s.data, lng = s.data2;
const n = Math.min(lat.length, lng.length);

// 1) 원시 좌표 통계 + 이상치
let latMin = Infinity, latMax = -Infinity, lngMin = Infinity, lngMax = -Infinity;
const bad = [];
const inKorea = (la, lo) => la >= 33 && la <= 39 && lo >= 124 && lo <= 132;
for (let i = 0; i < n; i++) {
  const la = lat[i], lo = lng[i];
  if (!Number.isFinite(la) || !Number.isFinite(lo) || (la === 0 && lo === 0) || !inKorea(la, lo)) {
    if (bad.length < 10) bad.push({ i, lat: la, lng: lo });
    continue;
  }
  if (la < latMin) latMin = la; if (la > latMax) latMax = la;
  if (lo < lngMin) lngMin = lo; if (lo > lngMax) lngMax = lo;
}

// 2) 격자 bbox (이상치 포함 = 실제 코드가 보는 값)
let X0 = Infinity, X1 = -Infinity, Y0 = Infinity, Y1 = -Infinity;
for (let i = 0; i < n; i++) {
  const x = Math.floor(lng[i] / LNG_STEP), y = Math.floor(lat[i] / LAT_STEP);
  if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
  if (x < X0) X0 = x; if (x > X1) X1 = x; if (y < Y0) Y0 = y; if (y > Y1) Y1 = y;
}
const bboxCells = (X1 - X0 + 3) * (Y1 - Y0 + 3); // fillEnclosed 이중루프가 도는 칸 수(패딩 +1)

// 3) routeToCells 보간 총 step 수 (실제로 돌지 않고 합만 계산)
let totalSteps = 0, maxSeg = 0, maxSegAt = -1;
for (let i = 1; i < n; i++) {
  const dx = lng[i] - lng[i - 1], dy = lat[i] - lat[i - 1];
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx) / LNG_STEP, Math.abs(dy) / LAT_STEP) * 3));
  if (!Number.isFinite(steps)) continue;
  totalSteps += steps;
  if (steps > maxSeg) { maxSeg = steps; maxSegAt = i; }
}

const fmt = (v) => (Number.isFinite(v) ? v.toLocaleString() : String(v));
console.log(`\n=== activity ${id} 진단 ===`);
console.log(`좌표 수            : ${fmt(n)}`);
console.log(`정상범위 위도      : ${latMin.toFixed(5)} ~ ${latMax.toFixed(5)}`);
console.log(`정상범위 경도      : ${lngMin.toFixed(5)} ~ ${lngMax.toFixed(5)}`);
console.log(`이상치 좌표 개수   : ${bad.length}${bad.length >= 10 ? "+" : ""}`);
if (bad.length) console.log(`  예시            :`, bad.map((b) => `#${b.i}=(${b.lat},${b.lng})`).join(", "));
console.log(`격자 bbox 칸수     : ${fmt(bboxCells)}   ← fillEnclosed 이중루프가 도는 칸`);
console.log(`보간 total steps   : ${fmt(totalSteps)}   ← routeToCells 가 도는 횟수`);
console.log(`최대 단일구간 step : ${fmt(maxSeg)} (좌표 #${maxSegAt} 부근)`);
console.log(`\n판정: ` + (
  bboxCells > 5_000_000 || totalSteps > 5_000_000
    ? `🔴 폭주 확정 — 위 수치가 10ms CPU로 처리 불가. ` +
      (bad.length ? `원인=이상치 좌표(${bad.length}개).` : `원인=비정상적으로 넓은 bbox/구간.`)
    : `🟢 이 수치만으론 정상 범위 — 다른 요인(좌표 수 과다 등) 의심.`
));
