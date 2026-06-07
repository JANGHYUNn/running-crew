// 3D 회전 카드를 투명 GIF 로 내보낸다. 전부 브라우저 처리.
// 360°를 정확히 한 바퀴 돌려 GIF 가 이음새 없이 무한 반복된다.

import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { OUT_SIZE, type Ratio } from "./cardRender";
import { Card3D } from "./card3d";
import {
  drawDragFrame,
  DRAG_DURATION_MS,
  prescaleToWidth,
  dragHeroWidth,
} from "./dragRender";

/** 한 바퀴(360°) 도는 데 걸리는 시간 */
const ROTATION_MS = 4000;

/** 팔레트에서 완전 투명(alpha 0) 색의 인덱스 찾기 */
function transparentIndexOf(palette: number[][]): number {
  for (let i = 0; i < palette.length; i++) {
    if (palette[i][3] === 0) return i;
  }
  return -1;
}

/** 투명 배경 GIF (진짜 알파). 용량 때문에 절반 해상도 사용. */
export async function exportGif(
  overlay: HTMLImageElement,
  ratio: Ratio,
  fps = 18
): Promise<Blob> {
  const full = OUT_SIZE[ratio];
  const w = Math.round(full.w / 2);
  const h = Math.round(full.h / 2);
  const card = new Card3D(overlay, w, h);
  card.setBackground(null); // 투명

  const read = document.createElement("canvas");
  read.width = w;
  read.height = h;
  const ctx = read.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas 2d 컨텍스트를 만들 수 없습니다");

  const enc = GIFEncoder();
  const frames = Math.max(2, Math.round((ROTATION_MS / 1000) * fps));
  const delay = Math.round(1000 / fps);

  for (let i = 0; i < frames; i++) {
    // i/frames (마지막 프레임 제외) → 0~360° 이음새 없이 반복
    card.render((i / frames) * Math.PI * 2);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(card.domElement, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    const palette = quantize(data, 256, {
      format: "rgba4444",
      oneBitAlpha: true,
    });
    const index = applyPalette(data, palette, "rgba4444");
    const tIdx = transparentIndexOf(palette);
    // gifenc 런타임은 transparentIndex 를 지원하나 타입 정의에 빠져 있어 보강
    type FrameOpts = NonNullable<Parameters<typeof enc.writeFrame>[3]> & {
      transparentIndex?: number;
    };
    const opts: FrameOpts = { palette, delay };
    if (tIdx >= 0) {
      opts.transparent = true;
      opts.transparentIndex = tIdx;
    }
    enc.writeFrame(index, w, h, opts);

    // UI 스레드 양보(프리징 방지)
    if (i % 3 === 0) await new Promise((res) => setTimeout(res));
  }
  enc.finish();
  card.dispose();

  return new Blob([enc.bytes() as BlobPart], { type: "image/gif" });
}

/**
 * 발도장 장면 GIF(투명 배경).
 * GIF 투명도는 1비트(반투명 불가)라 정지된 기록의 글자 가장자리가 거칠어진다.
 * 회전과 달리 정지 연출이라 그게 도드라지므로, 풀 해상도로 렌더해 가장자리를 잘게 만든다.
 * (프레임 수는 fps를 낮춰 용량/인코딩 시간 균형)
 */
export async function exportDragGif(
  overlay: HTMLImageElement,
  ratio: Ratio,
  fps = 14
): Promise<Blob> {
  const full = OUT_SIZE[ratio];
  const w = full.w;
  const h = full.h;

  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas 2d 컨텍스트를 만들 수 없습니다");

  // 한 번에 크게 축소하면 글자가 뭉개지므로, 표시 폭 근처까지 단계적으로 미리 축소
  const prepared = prescaleToWidth(
    overlay,
    Math.ceil(dragHeroWidth(overlay, w, h) * 1.15)
  );

  const enc = GIFEncoder();
  const frames = Math.max(2, Math.round((DRAG_DURATION_MS / 1000) * fps));
  const delay = Math.round(1000 / fps);

  for (let i = 0; i < frames; i++) {
    drawDragFrame(ctx, prepared, w, h, i / frames);
    const { data } = ctx.getImageData(0, 0, w, h);

    const palette = quantize(data, 256, {
      format: "rgba4444",
      oneBitAlpha: true,
    });
    const index = applyPalette(data, palette, "rgba4444");
    const tIdx = transparentIndexOf(palette);
    type FrameOpts = NonNullable<Parameters<typeof enc.writeFrame>[3]> & {
      transparentIndex?: number;
    };
    const opts: FrameOpts = { palette, delay };
    if (tIdx >= 0) {
      opts.transparent = true;
      opts.transparentIndex = tIdx;
    }
    enc.writeFrame(index, w, h, opts);

    if (i % 2 === 0) await new Promise((res) => setTimeout(res));
  }
  enc.finish();

  return new Blob([enc.bytes() as BlobPart], { type: "image/gif" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
