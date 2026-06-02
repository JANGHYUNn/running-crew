// 애니메이션 카드를 동영상(MP4/WebM) 또는 GIF 로 내보낸다. 전부 브라우저에서 처리.

import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { drawFrame, OUT_SIZE, type Scene } from "./cardRender";

const DURATION_MS = 4200;

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
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(c)
    ) {
      return c;
    }
  }
  return "video/webm";
}

function extOf(mime: string): string {
  return mime.includes("mp4") ? "mp4" : "webm";
}

/** 캔버스를 실시간 렌더하며 MediaRecorder로 녹화 → 동영상 Blob */
export async function exportVideo(
  scene: Scene
): Promise<{ blob: Blob; ext: string }> {
  const { w, h } = OUT_SIZE[scene.ratio];
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d 컨텍스트를 만들 수 없습니다");

  const mime = pickVideoMime();
  const stream = canvas.captureStream(30);
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
      const p = Math.min(1, (now - start) / DURATION_MS);
      drawFrame(ctx!, scene, w, h, p);
      if (p < 1) {
        requestAnimationFrame(tick);
      } else {
        drawFrame(ctx!, scene, w, h, 1);
        // 마지막 프레임 잠깐 유지 후 정지
        setTimeout(() => {
          rec.stop();
          resolve();
        }, 600);
      }
    }
    requestAnimationFrame(tick);
  });
  await stopped;

  return { blob: new Blob(chunks, { type: mime }), ext: extOf(mime) };
}

/** 프레임을 한 장씩 그려 gifenc로 인코딩. 용량 때문에 절반 해상도 사용. */
export async function exportGif(scene: Scene, fps = 14): Promise<Blob> {
  const full = OUT_SIZE[scene.ratio];
  const w = Math.round(full.w / 2);
  const h = Math.round(full.h / 2);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas 2d 컨텍스트를 만들 수 없습니다");

  const enc = GIFEncoder();
  const frames = Math.round((DURATION_MS / 1000) * fps);
  const delay = Math.round(1000 / fps);

  for (let i = 0; i <= frames; i++) {
    const p = i / frames;
    drawFrame(ctx, scene, w, h, p);
    const { data } = ctx.getImageData(0, 0, w, h);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    enc.writeFrame(index, w, h, { palette, delay });
    // UI 스레드 양보(프리징 방지)
    if (i % 4 === 0) await new Promise((res) => setTimeout(res));
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
