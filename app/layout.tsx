import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SiteHeader from "@/components/SiteHeader";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import SplashScreen from "@/components/SplashScreen";
import AppleSplashLinks from "@/components/AppleSplashLinks";
import { crew } from "@/lib/crew";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${crew.name} · 크루`,
  description: crew.tagline,
  // iOS 홈화면 추가 시 앱처럼 동작(주소창 숨김) + 아이콘
  appleWebApp: {
    capable: true,
    title: crew.name,
    statusBarStyle: "default",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

// width=device-width, initial-scale=1 은 Next가 기본 주입함.
// 모바일 브라우저 상단바 색만 헤더(흰색)에 맞춤.
export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900">
        <AppleSplashLinks />
        <SplashScreen />
        <ServiceWorkerRegister />
        <SiteHeader />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
