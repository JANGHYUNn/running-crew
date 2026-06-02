import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 정적 사이트로 빌드 → Cloudflare Pages / Vercel / Netlify 어디든 무료 배포 가능
  output: "export",
  images: {
    // 정적 export 환경에선 이미지 최적화 서버를 안 쓰므로 비활성화
    unoptimized: true,
  },
};

export default nextConfig;
