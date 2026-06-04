// 업로드한 기록 이미지(Strava 내보내기 등)에서 거리·페이스·시간을 자동 인식.
// tesseract.js(WASM)가 브라우저에서 동작. 코어/언어데이터는 기본 CDN에서 로드(무료).
// 인식은 best-effort라 결과는 항상 사용자가 수정할 수 있게 폼에 채워준다.

export interface ParsedStats {
  distance?: string; // "8.24"
  pace?: string; // "5'32\""
  duration?: string; // "45:30"
}

export async function runOcr(
  imageDataUrl: string,
  onProgress?: (p: number) => void
): Promise<{ raw: string; stats: ParsedStats }> {
  // 전처리: OCR이 못 읽는 케이스를 검정글자/흰배경으로 정규화한다.
  const prepped = await preprocessForOcr(imageDataUrl);

  // 동적 import: tesseract.js(WASM·워커)를 실제 사용 시점에만 로드한다.
  // 모듈 최상단 import 시 Turbopack 번들/하이드레이션에서 문제가 날 수 있어 피한다.
  const { createWorker } = await import("tesseract.js");

  const worker = await createWorker("eng", 1, {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) onProgress(m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(prepped);
    return { raw: data.text, stats: parseStats(data.text) };
  } finally {
    await worker.terminate();
  }
}

/**
 * OCR 전처리(브라우저 Canvas).
 * - 투명 PNG(스트라바 공유 이미지 등: 흰 글자가 투명 배경 위) → 불투명=검정, 투명=흰색.
 *   흰 글자가 흰 배경이 돼 OCR이 못 읽는 문제를 해결한다.
 * - 일반 불투명 이미지 → 그레이스케일 + 어두운 배경이면 반전(다크모드 스샷 대응).
 * 실패 시 원본을 그대로 반환(best-effort).
 */
async function preprocessForOcr(dataUrl: string): Promise<string> {
  try {
    const img = await loadImage(dataUrl);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return dataUrl;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0);

    const id = ctx.getImageData(0, 0, w, h);
    const d = id.data;
    const n = d.length / 4;

    // 투명 픽셀 비율로 "투명 배경 공유 이미지" 판별
    let transparent = 0;
    for (let i = 0; i < n; i++) if (d[i * 4 + 3] < 200) transparent++;
    const transparentRatio = transparent / n;

    if (transparentRatio > 0.3) {
      // 알파가 곧 잉크: 불투명→검정, 투명→흰색
      for (let i = 0; i < n; i++) {
        const v = d[i * 4 + 3] > 40 ? 0 : 255;
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
        d[i * 4 + 3] = 255;
      }
    } else {
      // 불투명: 그레이스케일 + 평균 밝기로 다크모드면 반전
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const g = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
        sum += g;
      }
      const invert = sum / n < 128;
      for (let i = 0; i < n; i++) {
        let g = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
        if (invert) g = 255 - g;
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = g;
        d[i * 4 + 3] = 255;
      }
    }
    ctx.putImageData(id, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return dataUrl;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

/** OCR 텍스트에서 숫자들을 추출. Strava 등 다양한 레이아웃 대응 best-effort. */
export function parseStats(text: string): ParsedStats {
  const t = text.replace(/[|]/g, " ");
  const stats: ParsedStats = {};

  // 거리: "8.24 km" 형태 우선, 없으면 첫 소수
  const distKm = t.match(/(\d{1,3}[.,]\d{1,2})\s*k\s*m/i);
  const distAny = t.match(/(\d{1,3}[.,]\d{1,2})/);
  if (distKm) stats.distance = distKm[1].replace(",", ".");
  else if (distAny) stats.distance = distAny[1].replace(",", ".");

  // 페이스: m:ss 뒤에 /km · min · " 같은 단서
  const pace = t.match(/(\d{1,2})\s*[:'′]\s*(\d{2})\s*(?:["″]|\/?\s*km|min)/i);
  if (pace) stats.pace = `${Number(pace[1])}'${pace[2]}"`;

  // 시간: ① h:mm:ss → ② "1h 2m 3s"/"33m 14s"/"45m" 단위형(스트라바) → ③ 페이스 아닌 m:ss
  const hms = t.match(/\b(\d{1,2}):(\d{2}):(\d{2})\b/);
  // 단위형: km(킬로미터)의 m과 헷갈리지 않게 m 뒤에 분/초 단서가 있을 때만.
  const unit = t.match(
    /(?:(\d{1,2})\s*h)?\s*(\d{1,2})\s*m(?:in)?\s*(\d{1,2})\s*s\b/i
  );
  if (hms) {
    stats.duration = `${Number(hms[1])}:${hms[2]}:${hms[3]}`;
  } else if (unit) {
    const h = Number(unit[1] || 0);
    const m = Number(unit[2]);
    const s = String(unit[3]).padStart(2, "0");
    stats.duration = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
  } else {
    const paceStr = pace ? `${pace[1]}:${pace[2]}` : "";
    const candidate = [...t.matchAll(/\b(\d{1,2})\s*[:'′]\s*(\d{2})\b/g)]
      .map((m) => `${m[1]}:${m[2]}`)
      .find((s) => s !== paceStr);
    if (candidate) {
      const [m, s] = candidate.split(":");
      stats.duration = `${Number(m)}:${s}`;
    }
  }

  return stats;
}
