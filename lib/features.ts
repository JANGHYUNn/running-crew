/** 앱이 담을 기능 목록. status로 단계적 출시를 표시 */
export type FeatureStatus = "ready" | "soon";

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
    emoji: "📸",
    desc: "거리·페이스 입력하면 인스타 공유용 카드 자동 생성",
    status: "ready",
  },
  {
    href: "/pace",
    title: "페이스 그룹 편성",
    emoji: "🔧",
    desc: "정기런 참가자를 페이스별 조로 자동 분반",
    status: "soon",
  },
  {
    href: "/journey",
    title: "크루 집단 여정",
    emoji: "🗺️",
    desc: "크루 누적거리를 지도 위 여정으로 시각화",
    status: "soon",
  },
  {
    href: "/cheer",
    title: "대회 응원 보드",
    emoji: "📣",
    desc: "공동 참가 대회 D-day와 응원 메시지 모으기",
    status: "soon",
  },
];
