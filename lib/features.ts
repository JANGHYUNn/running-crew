/** 앱이 담을 기능 목록. status로 단계적 출시를 표시 */
// hidden: 홈 런처에 노출 안 함(라우트는 살아있어 URL로 직접 접근 가능 — 나만 사용)
export type FeatureStatus = "ready" | "soon" | "hidden";

export interface Feature {
  href: string;
  title: string;
  emoji: string;
  desc: string;
  status: FeatureStatus;
}

export const features: Feature[] = [
  {
    href: "/card",
    title: "3D 회전 기록 카드",
    emoji: "🎬",
    desc: "투명 PNG 기록을 3D로 360° 회전시켜 영상·투명GIF로 (CapCut 오버레이용)",
    status: "hidden",
  },
  {
    href: "/challenge",
    title: "조별 누적거리 챌린지",
    emoji: "🏆",
    desc: "조원이 기록을 올리면 조별 누적거리·순위를 자동 집계",
    status: "ready",
  },
  {
    href: "/me",
    title: "크루 기록 통계",
    emoji: "📊",
    desc: "크루 전체·멤버별 누적·월별·주별 거리와 랭킹을 한눈에",
    status: "ready",
  },
];
