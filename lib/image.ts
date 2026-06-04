// 증빙 이미지 클라이언트 압축(업로드 용량 최소화 → 무료 Storage 유지).
// 긴 변을 maxSize 로 줄이고 JPEG 로 인코딩. 투명 PNG(스트라바 공유 카드)는 흰 배경으로 평탄화.

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

/** File → 압축된 JPEG Blob (기본 긴 변 720px, 품질 0.8) */
export async function compressImage(
  file: File,
  maxSize = 720,
  quality = 0.8
): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const longSide = Math.max(img.naturalWidth, img.naturalHeight) || maxSize;
    const scale = Math.min(1, maxSize / longSide);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 미지원");
    ctx.fillStyle = "#ffffff"; // 투명 평탄화
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("이미지 압축 실패"))),
        "image/jpeg",
        quality
      )
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
