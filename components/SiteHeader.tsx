"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { crew } from "@/lib/crew";
import { useAuth } from "@/components/AuthProvider";
import { avatarOf, nicknameOf } from "@/lib/auth";

export default function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const isHome = pathname === "/";

  // 카카오·intervals.icu OAuth 리다이렉트가 히스토리에 쌓이는 페이지는
  // router.back() 이 연동 중간 페이지(/icu/callback 등)로 돌아가므로 홈으로 보낸다.
  const backToHome = pathname === "/map";

  // 모바일 앱처럼: 이전 화면으로. 직접 진입(히스토리 없음)이면 홈으로.
  function goBack() {
    if (backToHome) router.push("/");
    else if (window.history.length > 1) router.back();
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

        {/* 오른쪽: 전역 카카오 로그인/프로필 */}
        <div className="flex justify-end">
          <AuthMenu />
        </div>
      </div>
    </header>
  );
}

// 어디서나 보이는 로그인 상태. 로그인 강제는 안 함 — 글쓰기 페이지에서만 게이트.
function AuthMenu() {
  const { user, loading, ready, signIn, signOut } = useAuth();

  // Supabase 미설정이면 로그인 개념이 없음 → 예전처럼 태그라인만.
  if (!ready) {
    return (
      <span className="hidden truncate text-xs text-neutral-400 sm:inline">
        {crew.tagline}
      </span>
    );
  }

  // 세션 확인 중엔 깜빡임 방지로 자리만 비워둔다.
  if (loading) return <span className="h-8 w-8" aria-hidden />;

  if (!user) {
    return (
      <button
        onClick={() => signIn()}
        className="rounded-full bg-[#FEE500] px-3 py-1.5 text-xs font-bold text-black transition active:opacity-80"
      >
        로그인
      </button>
    );
  }

  const avatar = avatarOf(user);
  return (
    <div className="flex items-center gap-2">
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar}
          alt=""
          className="h-8 w-8 rounded-full object-cover"
        />
      ) : (
        <span className="grid h-8 w-8 place-items-center rounded-full bg-neutral-200 text-sm">
          🏃
        </span>
      )}
      <span className="hidden max-w-[8rem] truncate text-sm font-medium sm:inline">
        {nicknameOf(user)}
      </span>
      <button
        onClick={() => signOut()}
        className="text-xs text-neutral-400 transition hover:text-neutral-600"
      >
        로그아웃
      </button>
    </div>
  );
}
