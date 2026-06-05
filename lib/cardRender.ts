// 3D 회전 카드의 출력/미리보기 해상도와 비율 타입.
// (회전 렌더는 lib/card3d.ts, 내보내기는 lib/exporters.ts)

export type Ratio = "story" | "square";

/** 내보내기 해상도 (고해상도) */
export const OUT_SIZE: Record<Ratio, { w: number; h: number }> = {
  story: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
};

/** 미리보기 해상도 */
export const PREVIEW_SIZE: Record<Ratio, { w: number; h: number }> = {
  story: { w: 360, h: 640 },
  square: { w: 420, h: 420 },
};
