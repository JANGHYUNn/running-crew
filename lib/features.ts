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
    title: "기록 인증 카드",
    emoji: "🎬",
    desc: "Strava·NRC 기록 이미지를 올리면 애니메이션 영상·GIF로 자동 변환",
    status: "hidden",
  },
  {
    href: "/challenge",
    title: "조별 누적거리 챌린지",
    emoji: "🏆",
    desc: "조원이 기록을 올리면 조별 누적거리·순위를 자동 집계",
    status: "ready",
  },
];
