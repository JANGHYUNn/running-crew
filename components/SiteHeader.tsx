"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { crew } from "@/lib/crew";

export default function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const isHome = pathname === "/";

  // 모바일 앱처럼: 이전 화면으로. 직접 진입(히스토리 없음)이면 홈으로.
  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push("/");
  }

  return (
    <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/80 backdrop-blur">
      {/* 1fr · auto · 1fr → 양옆 폭이 같아 가운데 로고가 항상 중앙 정렬 */}
      <div className="mx-auto grid h-14 max-w-2xl grid-cols-[1fr_auto_1fr] items-center px-2">
        {/* 왼쪽: 뒤로가기(홈에선 숨김, 자리만 유지) */}
        <div className="flex justify-start">
          {!isHome && (
            <button
              onClick={goBack}
              aria-label="뒤로가기"
              className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-600 transition active:bg-neutral-100"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          )}
        </div>

        {/* 가운데: 로고(홈으로) */}
        <Link href="/" className="flex items-center gap-1.5 font-bold">
          <span className="text-xl">{crew.logoEmoji}</span>
          <span style={{ color: crew.primary }}>{crew.name}</span>
        </Link>

        {/* 오른쪽: 데스크탑에서만 태그라인(자리 균형용) */}
        <div className="flex justify-end">
          <span className="hidden truncate text-xs text-neutral-400 sm:inline">
            {crew.tagline}
          </span>
        </div>
      </div>
    </header>
  );
}
