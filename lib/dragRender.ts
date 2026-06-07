// 고양이 발바닥(육구)이 위에서 도장처럼 "쾅" 찍으면, 발을 떼는 순간 그 자리에
// (투명 배경의) 기록 이미지가 짠 하고 나타나는 장면. 전부 Canvas 2D.
//
// 배경은 완전 투명 — 사용자가 나중에 직접 배경 이미지를 합성한다.
// 기록 이미지도 투명 PNG 그대로 사용(어떤 배경/박스도 덧대지 않음).
// 미리보기·GIF가 이 drawDragFrame 하나를 공유한다(해상도만 다름, 비율은 w/h에서 자동).
//
// 진행(t: 0→1, GIF는 무한 반복):
//   0.00~0.22  내려찍기 : 발이 위에서 가속하며 내려와 중앙을 덮음(anticipation)
//   0.22       임팩트   : 쾅! 발이 눌리며 스쿼시 + 임팩트 선, 기록이 뒤에서 팝업
//   0.22~0.44  떼기     : 발이 다시 위로 빠지며 기록이 드러남
//   0.44~0.92  공개     : 기록 또렷이(푸터 없음)
//   0.92~1.00  리셋     : 살짝 페이드아웃되어 루프가 매끄럽게 이어짐

import { crew } from "./crew";

/** 한 사이클 시간(ms) */
export const DRAG_DURATION_MS = 5200;

// 검은 고양이 발 팔레트
const FUR_MAIN = "#2f2f37";
const FUR_DARK = "#191920";
const FUR_LIGHT = "#52525f";
const PAD = "#eb9aa8"; // 육구(젤리) 핑크
const PAD_SHINE = "#fbd2d9";
const PAD_DARK = "#cd7585";
const OUTLINE = "#08080c";

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function easeOut(x: number) {
  return 1 - Math.pow(1 - clamp01(x), 3);
}
function easeIn(x: number) {
  const c = clamp01(x);
  return c * c * c;
}
function easeInOut(x: number) {
  const c = clamp01(x);
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}
function easeOutBack(x: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const c = clamp01(x);
  return 1 + c3 * Math.pow(c - 1, 3) + c1 * Math.pow(c - 1, 2);
}

type Pt = { x: number; y: number };
const P = (x: number, y: number): Pt => ({ x, y });

// ── 공개되는 기록 이미지(투명 그대로) ──────────────────────────
function drawCard(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLCanvasElement,
  cx: number,
  cy: number,
  cw: number,
  ch: number,
  alpha: number
) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, cx - cw / 2, cy - ch / 2, cw, ch);
  ctx.restore();
}

// ── 고양이 발(육구) ────────────────────────────────────────────
// contactY = 발바닥이 닿는 지점(월드 y). 발/다리는 그 위로 뻗는다.
// U = 발 크기 단위(대략 발 폭). sqx/sqy = 임팩트 스쿼시.
function drawPaw(
  ctx: CanvasRenderingContext2D,
  cx: number,
  contactY: number,
  U: number,
  sqx: number,
  sqy: number,
  alpha: number
) {
  if (alpha <= 0.01) return;
  const ow = Math.max(1.6, 0.024 * U);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, contactY);
  ctx.scale(sqx, sqy);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // 기준 도형(발바닥 닿는 면 y≈0, 발/다리는 위로)
  const toeR = 0.27 * U;
  const toes: Pt[] = [
    P(-0.5 * U, -0.9 * U),
    P(-0.17 * U, -1.13 * U),
    P(0.17 * U, -1.13 * U),
    P(0.5 * U, -0.9 * U),
  ];
  const palm = { x: 0, y: -0.46 * U, rx: 0.7 * U, ry: 0.62 * U };
  const leg = { x: -0.36 * U, y: -3.0 * U, w: 0.72 * U, h: 2.5 * U, r: 0.34 * U };

  const traceLeg = (g = 0) => {
    ctx.beginPath();
    ctx.roundRect(leg.x - g, leg.y - g, leg.w + 2 * g, leg.h + 2 * g, leg.r + g);
  };
  const tracePalm = (g = 0) => {
    ctx.beginPath();
    ctx.ellipse(palm.x, palm.y, palm.rx + g, palm.ry + g, 0, 0, Math.PI * 2);
  };
  const traceToe = (p: Pt, g = 0) => {
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, toeR + g, toeR + g, 0, 0, Math.PI * 2);
  };

  // 1) 외곽선: 도형을 ow만큼 키워 다크로 채움(합집합 외곽이 깔끔)
  ctx.fillStyle = OUTLINE;
  traceLeg(ow);
  ctx.fill();
  toes.forEach((p) => {
    traceToe(p, ow);
    ctx.fill();
  });
  tracePalm(ow);
  ctx.fill();

  // 2) 털 채움(그라데이션으로 입체감)
  const legGrad = ctx.createLinearGradient(leg.x, 0, leg.x + leg.w, 0);
  legGrad.addColorStop(0, FUR_LIGHT);
  legGrad.addColorStop(0.5, FUR_MAIN);
  legGrad.addColorStop(1, FUR_DARK);
  ctx.fillStyle = legGrad;
  traceLeg();
  ctx.fill();

  toes.forEach((p) => {
    const g = ctx.createRadialGradient(
      p.x - 0.09 * U,
      p.y - 0.12 * U,
      0.02 * U,
      p.x,
      p.y,
      toeR * 1.25
    );
    g.addColorStop(0, FUR_LIGHT);
    g.addColorStop(0.5, FUR_MAIN);
    g.addColorStop(1, FUR_DARK);
    ctx.fillStyle = g;
    traceToe(p);
    ctx.fill();
  });

  const palmGrad = ctx.createRadialGradient(
    -0.16 * U,
    -0.78 * U,
    0.05 * U,
    palm.x,
    palm.y,
    1.0 * U
  );
  palmGrad.addColorStop(0, FUR_LIGHT);
  palmGrad.addColorStop(0.5, FUR_MAIN);
  palmGrad.addColorStop(1, FUR_DARK);
  ctx.fillStyle = palmGrad;
  tracePalm();
  ctx.fill();

  // 발가락 사이 골(은은한 음영) — palm 안쪽에 그려 자연스럽게
  ctx.save();
  tracePalm();
  ctx.clip();
  ctx.strokeStyle = "rgba(0,0,0,0.32)";
  ctx.lineWidth = Math.max(1.4, 0.028 * U);
  for (let i = 0; i < 3; i++) {
    const a = toes[i];
    const b = toes[i + 1];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    ctx.beginPath();
    ctx.moveTo(mx, my + 0.02 * U);
    ctx.lineTo(mx * 1.04, my + 0.32 * U);
    ctx.stroke();
  }
  ctx.restore();

  // ── 육구(핑크 젤리): 큰 패드 + 발가락 콩 4개 (그라데이션 + 광택) ──
  const padFill = (cx0: number, cy0: number, r: number) => {
    const g = ctx.createRadialGradient(
      cx0 - r * 0.3,
      cy0 - r * 0.45,
      r * 0.05,
      cx0,
      cy0,
      r * 1.15
    );
    g.addColorStop(0, PAD_SHINE);
    g.addColorStop(0.5, PAD);
    g.addColorStop(1, PAD_DARK);
    return g;
  };
  const drawBean = (x: number, y: number, rx: number, ry: number) => {
    ctx.fillStyle = padFill(x, y, (rx + ry) / 2);
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.ellipse(x - rx * 0.28, y - ry * 0.32, rx * 0.4, ry * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  // 큰 패드(하트형 둥근 삼각)
  const padPath = new Path2D();
  padPath.moveTo(0, -0.14 * U);
  padPath.bezierCurveTo(-0.36 * U, -0.18 * U, -0.36 * U, -0.64 * U, -0.05 * U, -0.62 * U);
  padPath.bezierCurveTo(-0.01 * U, -0.69 * U, 0.01 * U, -0.69 * U, 0.05 * U, -0.62 * U);
  padPath.bezierCurveTo(0.36 * U, -0.64 * U, 0.36 * U, -0.18 * U, 0, -0.14 * U);
  padPath.closePath();
  ctx.fillStyle = padFill(0, -0.4 * U, 0.4 * U);
  ctx.fill(padPath);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.ellipse(-0.11 * U, -0.5 * U, 0.13 * U, 0.17 * U, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // 발가락 콩
  drawBean(-0.42 * U, -0.82 * U, 0.155 * U, 0.175 * U);
  drawBean(-0.15 * U, -1.0 * U, 0.165 * U, 0.185 * U);
  drawBean(0.15 * U, -1.0 * U, 0.165 * U, 0.185 * U);
  drawBean(0.42 * U, -0.82 * U, 0.155 * U, 0.175 * U);

  ctx.restore();
}

// ── 임팩트(쾅) 선 ───────────────────────────────────────────────
function drawImpact(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  prog: number,
  U: number,
  alpha: number
) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = crew.primary;
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(2.2, 0.045 * U);
  const N = 9;
  const r0 = 0.5 * U + prog * 0.55 * U;
  const r1 = r0 + lerp(0.5, 0.12, prog) * U;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + 0.3;
    const dx = Math.cos(a);
    const dy = Math.sin(a) * 0.78;
    ctx.beginPath();
    ctx.moveTo(cx + dx * r0, cy + dy * r0);
    ctx.lineTo(cx + dx * r1, cy + dy * r1);
    ctx.stroke();
  }
  ctx.restore();
}

type ImgSrc = HTMLImageElement | HTMLCanvasElement;
const srcW = (s: ImgSrc) => ("naturalWidth" in s ? s.naturalWidth : s.width) || 1;
const srcH = (s: ImgSrc) =>
  ("naturalHeight" in s ? s.naturalHeight : s.height) || 1;

/**
 * 원본 이미지를 목표 폭 근처까지 "절반씩 단계적으로" 축소해 둔다.
 * 한 번에 크게 축소하면(예: 1080→432) 글자가 뭉개지므로, 밉맵처럼 단계 축소로
 * 또렷함을 유지한다. 결과를 drawDragFrame 에 넘기면 마지막 미세 축소만 일어난다.
 */
export function prescaleToWidth(src: ImgSrc, targetW: number): ImgSrc {
  let cw = srcW(src);
  let ch = srcH(src);
  if (cw <= targetW * 1.5) return src;
  let cur: ImgSrc = src;
  while (cw > targetW * 2) {
    const nw = Math.max(Math.round(targetW), Math.round(cw / 2));
    const nh = Math.round((ch * nw) / cw);
    const c = document.createElement("canvas");
    c.width = nw;
    c.height = nh;
    const cx = c.getContext("2d");
    if (!cx) break;
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = "high";
    cx.drawImage(cur, 0, 0, nw, nh);
    cur = c;
    cw = nw;
    ch = nh;
  }
  return cur;
}

/** drawDragFrame 에서 쓰는 기록 표시 폭(heroW) 계산 — prescale 목표치 산정용 */
export function dragHeroWidth(src: ImgSrc, w: number, h: number): number {
  const iw = srcW(src);
  const ih = srcH(src);
  const fit = Math.min((w * 0.82) / iw, (h * 0.8) / ih);
  return iw * fit;
}

/** 한 프레임을 ctx(크기 w×h)에 그린다. t∈[0,1). 배경 투명. */
export function drawDragFrame(
  ctx: CanvasRenderingContext2D,
  img: ImgSrc,
  w: number,
  h: number,
  t: number
) {
  ctx.clearRect(0, 0, w, h);
  // 기록 이미지를 축소해 그릴 때 뭉개지지 않도록 고품질 스무딩(3D 회전의 밉맵에 대응)
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // 타이밍: 내려와 잠깐 멈칫(준비) → 살짝 들었다(anticipation) → 쾅 내려찍고 → 튕겨오름
  const HOV = 0.12; // 호버 도착
  const WIND = 0.2; // 살짝 들어올리는 준비동작 끝
  const STAMP = 0.27; // 임팩트
  const REB = 0.38; // 반동 정점(튕겨오름)
  const OFF = 0.56; // 완전히 빠짐

  const iw = srcW(img);
  const ih = srcH(img);
  const fit = Math.min((w * 0.82) / iw, (h * 0.8) / ih);
  const heroW = iw * fit;
  const heroH = ih * fit;
  const heroC = P(w / 2, h * 0.46);

  // 발 접지점 y
  const offTop = -0.22 * h;
  const pressY = h * 0.66; // 발바닥이 닿는 지점(중앙을 덮도록)
  const hoverY = pressY - 0.16 * h;
  const windY = hoverY - 0.05 * h;
  const reboundY = pressY - 0.34 * h;
  const U = Math.min(w * 0.48, h * 0.3); // 발 크기

  let contactY: number;
  let slamProg = 0; // 내려찍는 동안 0→1(스피드 라인용)
  if (t < HOV) {
    contactY = lerp(offTop, hoverY, easeOut(t / HOV)); // 감속하며 도착(멈칫)
  } else if (t < WIND) {
    contactY = lerp(hoverY, windY, easeInOut((t - HOV) / (WIND - HOV))); // 살짝 듦
  } else if (t < STAMP) {
    slamProg = (t - WIND) / (STAMP - WIND);
    contactY = lerp(windY, pressY, easeIn(slamProg)); // 가속하며 내려찍기
  } else if (t < REB) {
    contactY = lerp(pressY, reboundY, easeOut((t - STAMP) / (REB - STAMP))); // 튕겨오름
  } else if (t < OFF) {
    contactY = lerp(reboundY, offTop, easeIn((t - REB) / (OFF - REB))); // 빠짐
  } else {
    contactY = offTop;
  }

  // 임팩트 스쿼시(충돌 순간 납작) + 반동 스트레치(직후 길쭉)
  const sqImpact = clamp01(1 - Math.abs(t - STAMP) / 0.05);
  const stretch =
    t > STAMP ? clamp01(1 - Math.abs(t - (STAMP + 0.06)) / 0.08) : 0;
  const sqx = 1 + 0.24 * sqImpact - 0.13 * stretch;
  const sqy = 1 - 0.28 * sqImpact + 0.17 * stretch;

  // 기록 페이드/팝(임팩트에 맞춰 톡 튀며 등장 → 유지 → 끝에서 살짝 사라져 루프 매끄럽게)
  const inA = clamp01((t - (STAMP - 0.02)) / 0.12);
  const outA = 1 - clamp01((t - 0.92) / 0.08);
  const recAlpha = Math.min(inA, outA);
  const recScale = lerp(0.5, 1, easeOutBack(inA));
  const cardW = heroW * recScale;
  const cardH = heroH * recScale;

  // 임팩트 선
  const impProg = clamp01((t - STAMP) / 0.14);
  const impAlpha = (1 - impProg) * (t >= STAMP ? 1 : 0);

  // 그리기: 기록(뒤) → 스피드라인 → 발(덮음) → 임팩트 선
  drawCard(ctx, img, heroC.x, heroC.y, cardW, cardH, recAlpha);
  if (slamProg > 0.15 && t < STAMP) {
    ctx.save();
    ctx.globalAlpha = slamProg * 0.5;
    ctx.strokeStyle = "rgba(120,120,130,0.9)";
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1.5, 0.02 * U);
    for (let i = -1; i <= 1; i++) {
      const lx = w / 2 + i * 0.34 * U;
      const ly = contactY - 0.95 * U;
      ctx.beginPath();
      ctx.moveTo(lx, ly - 0.5 * U);
      ctx.lineTo(lx, ly - 0.5 * U + 0.34 * U * slamProg);
      ctx.stroke();
    }
    ctx.restore();
  }
  drawPaw(ctx, w / 2, contactY, U, sqx, sqy, 1);
  drawImpact(ctx, w / 2, pressY, impProg, U, impAlpha * 0.9);
}
