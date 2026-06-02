// 업로드한 기록 이미지(Strava 내보내기 등)에서 거리·페이스·시간을 자동 인식.
// tesseract.js(WASM)가 브라우저에서 동작. 코어/언어데이터는 기본 CDN에서 로드(무료).
// 인식은 best-effort라 결과는 항상 사용자가 수정할 수 있게 폼에 채워준다.

import { createWorker } from "tesseract.js";

export interface ParsedStats {
  distance?: string; // "8.24"
  pace?: string; // "5'32\""
  duration?: string; // "45:30"
}

export async function runOcr(
  imageDataUrl: string,
  onProgress?: (p: number) => void
): Promise<{ raw: string; stats: ParsedStats }> {
  const worker = await createWorker("eng", 1, {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) onProgress(m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(imageDataUrl);
    return { raw: data.text, stats: parseStats(data.text) };
  } finally {
    await worker.terminate();
  }
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

  // 시간: h:mm:ss 우선, 없으면 페이스가 아닌 m:ss
  const hms = t.match(/\b(\d{1,2}):(\d{2}):(\d{2})\b/);
  if (hms) {
    stats.duration = `${Number(hms[1])}:${hms[2]}:${hms[3]}`;
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
