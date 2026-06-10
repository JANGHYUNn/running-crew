import type { MetadataRoute } from "next";
import { crew } from "@/lib/crew";

// 정적 export(output: "export")에서 매니페스트를 정적 파일로 내보내기 위함
export const dynamic = "force-static";

/**
 * 웹앱 매니페스트 → 홈화면 추가(설치형 PWA)용.
 * Next가 빌드 시 정적 /manifest.webmanifest 로 내보냄(서버 불필요).
 * 브랜딩 값은 lib/crew.ts 한 곳에서 가져옴.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${crew.name} · 크루`,
    short_name: crew.name,
    description: crew.tagline,
    start_url: "/",
    display: "standalone", // 주소창 없이 앱처럼
    // 설치형 앱 실행 스플래시 배경 = 검정 계열(인앱 로고 드로잉 스플래시와 이음새 제거)
    background_color: crew.accent,
    theme_color: crew.primary,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
