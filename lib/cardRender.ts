// 캔버스 프레임 렌더러.
// 미리보기 · 동영상 · GIF 가 전부 이 drawFrame 하나를 공유한다(해상도만 다름).
// 모든 좌표는 w/h 비율 기반이라 어떤 크기로도 동일하게 그려진다.

import { crew } from "./crew";

export type Ratio = "story" | "square";

/** 내보내기 해상도 (고해상도) */
export const OUT_SIZE: Record<Ratio, { w: number; h: number }> = {
  story: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
};

/** 미리보기 해상도 */
export const PREVIEW_SIZE: Record<Ratio, { w: number; h: number }> = {
  story: { w: 360, h: 640 },
  square: { w: 360, h: 360 },
};

export interface Scene {
  img: HTMLImageElement | null;
  ratio: Ratio;
  distance: string; // "8.24"
  pace: string; // "5'32\""
  duration: string; // "45:30"
  location: string;
  runner: string;
}

const FONT = `'Apple SD Gothic Neo', system-ui, -apple-system, 'Segoe UI', sans-serif`;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r = Math.round;

/** 한 프레임을 캔버스에 그린다. progress: 0~1 (애니메이션 진행도) */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  w: number,
  h: number,
  progress: number
) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = crew.accent;
  ctx.fillRect(0, 0, w, h);

  // 배경 이미지 (Ken Burns: 느린 줌인)
  if (scene.img && scene.img.complete && scene.img.naturalWidth > 0) {
    drawImageCover(ctx, scene.img, w, h, lerp(1.06, 1.16, easeOut(progress)));
  }

  // 하단 가독성 그라데이션
  const g = ctx.createLinearGradient(0, h * 0.3, 0, h);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const pad = w * 0.07;
  ctx.textAlign = "left";

  // 상단: 장소
  if (scene.location) {
    const a = clamp01((progress - 0.05) / 0.25);
    ctx.globalAlpha = a;
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "top";
    ctx.font = `600 ${r(h * 0.021)}px ${FONT}`;
    ctx.fillText(scene.location, pad, pad - (1 - a) * 10);
    ctx.globalAlpha = 1;
  }

  // 하단 푸터(크루) → 스탯 → 거리 순으로 아래에서 위로
  const footerBaseY = h - pad;
  const lineY = footerBaseY - h * 0.05;
  drawFooter(ctx, w, h, pad, footerBaseY, lineY, progress);

  const statsBaseY = lineY - h * 0.028;
  drawStatRow(ctx, scene, w, h, pad, statsBaseY, progress);

  drawDistance(ctx, scene, w, pad, statsBaseY - h * 0.085, h, progress);
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  scale: number
) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const base = Math.max(w / iw, h / ih);
  const s = base * scale;
  const dw = iw * s;
  const dh = ih * s;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function drawDistance(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  w: number,
  pad: number,
  baselineY: number,
  h: number,
  progress: number
) {
  const num = parseFloat(scene.distance) || 0;
  const dp = easeOut((progress - 0.08) / 0.5); // 카운트업
  const shown = (num * dp).toFixed(2);
  const a = clamp01(progress / 0.15);

  ctx.globalAlpha = a;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fff";
  ctx.font = `800 ${r(h * 0.108)}px ${FONT}`;
  ctx.fillText(shown, pad, baselineY);
  const numW = ctx.measureText(shown).width;

  ctx.font = `800 ${r(h * 0.03)}px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText("KM", pad + numW + w * 0.02, baselineY);
  ctx.globalAlpha = 1;
}

function drawStatRow(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  w: number,
  h: number,
  pad: number,
  y: number,
  progress: number
) {
  const items = [
    { label: "페이스", value: scene.pace || "--'--\"" },
    { label: "시간", value: scene.duration || "--:--" },
  ];
  if (scene.runner) items.push({ label: "러너", value: scene.runner });

  ctx.textAlign = "left";
  let x = pad;
  const gap = w * 0.06;

  items.forEach((it, i) => {
    const a = clamp01((progress - 0.35 - i * 0.06) / 0.3);
    const dy = (1 - easeOut(a)) * 16;
    ctx.globalAlpha = a;

    ctx.textBaseline = "alphabetic";
    ctx.font = `600 ${r(h * 0.0145)}px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fillText(it.label, x, y - h * 0.03 + dy);

    ctx.font = `800 ${r(h * 0.024)}px ${FONT}`;
    ctx.fillStyle = "#fff";
    ctx.fillText(it.value, x, y + dy);
    const valW = ctx.measureText(it.value).width;

    ctx.globalAlpha = 1;
    x += valW + gap;
  });
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pad: number,
  baseY: number,
  lineY: number,
  progress: number
) {
  const a = clamp01((progress - 0.55) / 0.3);
  ctx.globalAlpha = a;

  // 구분선
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = Math.max(1, h * 0.0012);
  ctx.beginPath();
  ctx.moveTo(pad, lineY);
  ctx.lineTo(w - pad, lineY);
  ctx.stroke();

  const textY = baseY - h * 0.012;
  // 로고 이모지
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `${r(h * 0.026)}px ${FONT}`;
  ctx.fillStyle = "#fff";
  ctx.fillText(crew.logoEmoji, pad, textY);

  // 크루 이름
  ctx.font = `800 ${r(h * 0.026)}px ${FONT}`;
  ctx.fillStyle = crew.primary;
  ctx.fillText(crew.name, pad + h * 0.04, textY);

  // 태그라인 (오른쪽)
  ctx.textAlign = "right";
  ctx.font = `500 ${r(h * 0.017)}px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(crew.tagline, w - pad, textY);

  ctx.textAlign = "left";
  ctx.globalAlpha = 1;
}
