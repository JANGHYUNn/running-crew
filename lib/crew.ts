/**
 * 크루 브랜딩 설정.
 * 이 파일 하나만 바꾸면 앱 전체 이름 / 색 / 로고가 바뀝니다.
 */
export const crew = {
  /** 크루 이름 (카드·헤더에 표시) */
  name: "11.1k",
  /** 한 줄 소개 */
  tagline: "함께 달리는 즐거움",
  /** 로고 대용 이모지 (이미지 로고가 생기면 교체). 성별 중립 위해 여성+남성 함께 */
  logoEmoji: "🏃‍♀️🏃‍♂️",
  /** 포인트 색 (카드 강조색·버튼) */
  primary: "#FF4D2E",
  /** 보조 색 */
  accent: "#1A1A1A",
} as const;

export type Crew = typeof crew;
