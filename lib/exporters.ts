// 3D 회전 카드를 동영상(초록배경·크로마키용) 또는 투명 GIF 로 내보낸다. 전부 브라우저 처리.
// 360°를 정확히 한 바퀴 돌려 GIF·영상이 이음새 없이 무한 반복된다.

import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { OUT_SIZE, type Ratio } from "./cardRender";
import { Card3D, CHROMA_GREEN } from "./card3d";

/** 한 바퀴(360°) 도는 데 걸리는 시간 */
const ROTATION_MS = 4000;

/** 브라우저가 지원하는 영상 코덱 선택. Safari→mp4, Chrome/FF→webm 경향. */
function pickVideoMime(): string {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c))
      return c;
  }
  return "video/webm";
}

function extOf(mime: string): string {
  return mime.includes("mp4") ? "mp4" : "webm";
}

/** 초록 배경 위에서 회전하는 영상 → CapCut 등에서 크로마키로 초록을 빼 오버레이 */
export async function exportVideo(
  overlay: HTMLImageElement,
  ratio: Ratio
): Promise<{ blob: Blob; ext: string }> {
  const { w, h } = OUT_SIZE[ratio];
  const card = new Card3D(overlay, w, h);
  card.setBackground(CHROMA_GREEN);

  const mime = pickVideoMime();
  const stream = card.domElement.captureStream(30);
  const rec = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 12_000_000,
  });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<void>((res) => {
    rec.onstop = () => res();
  });

  rec.start();
  const start = performance.now();
  await new Promise<void>((resolve) => {
    function tick(now: number) {
      const elapsed = now - start;
      card.render((elapsed / ROTATION_MS) * Math.PI * 2);
      if (elapsed < ROTATION_MS) {
        requestAnimationFrame(tick);
      } else {
        rec.stop();
        resolve();
      }
    }
    requestAnimationFrame(tick);
  });
  await stopped;
  card.dispose();

  return { blob: new Blob(chunks, { type: mime }), ext: extOf(mime) };
}

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

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
