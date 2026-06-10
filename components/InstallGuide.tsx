"use client";

// 홈 화면에 PWA 설치 안내 카드.
// - 이미 설치됨(standalone)이거나 사용자가 닫았으면 렌더 안 함.
// - iOS: 직접 설치 API 가 없어 "공유 → 홈 화면에 추가" 단계를 아이콘으로 안내.
// - Android(크롬): beforeinstallprompt 를 잡아 버튼 한 번으로 설치. 없으면 수동 안내.
// 하이드레이션 안전 + 이펙트 동기 setState 회피를 위해 감지는 queueMicrotask 로 미룬다.
import { useEffect, useState } from "react";
import { crew } from "@/lib/crew";

const DISMISS_KEY = "pwa_install_dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "ios" | "android" | "other";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function detectPlatform(): Platform {
  const ua = window.navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "other";
}

export default function InstallGuide() {
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setHidden(true);
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);

    // 동기 setState 회피 + 클라이언트에서만 감지(하이드레이션 안전)
    queueMicrotask(() => {
      if (isStandalone() || localStorage.getItem(DISMISS_KEY) === "1") {
        setHidden(true);
      } else {
        setPlatform(detectPlatform());
      }
      setReady(true);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setHidden(true);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setHidden(true);
  }

  if (!ready || hidden || platform === "other") return null;

  return (
    <section className="mb-8 rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-bold">📲 홈 화면에 추가해서 앱처럼 쓰기</h2>
          <p className="mt-1 text-sm text-neutral-500">
            {crew.name} 를 바탕화면에 추가하면 주소창 없이 앱처럼 바로 열려요.
          </p>
        </div>
        <button
          onClick={dismiss}
          aria-label="닫기"
          className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100"
        >
          ✕
        </button>
      </div>

      {platform === "ios" ? (
        <ol className="mt-4 space-y-3">
          <Step n={1}>
            하단 <ShareIcon /> <b>공유</b> 버튼을 누르세요
          </Step>
          <Step n={2}>
            메뉴에서 <PlusIcon /> <b>“홈 화면에 추가”</b> 를 선택
          </Step>
          <Step n={3}>
            오른쪽 위 <b>“추가”</b> 를 누르면 끝! 🎉
          </Step>
          <p className="pl-9 text-xs text-neutral-400">
            ※ Safari 브라우저에서만 가능해요. (다른 앱에서 열었다면 Safari 로 열어주세요)
          </p>
        </ol>
      ) : deferred ? (
        <button
          onClick={install}
          className="mt-4 w-full rounded-xl py-3 text-sm font-bold text-white"
          style={{ backgroundColor: crew.primary }}
        >
          홈 화면에 추가하기
        </button>
      ) : (
        <ol className="mt-4 space-y-3">
          <Step n={1}>
            오른쪽 위 <MenuIcon /> <b>메뉴</b> 를 누르세요
          </Step>
          <Step n={2}>
            <b>“앱 설치”</b> 또는 <b>“홈 화면에 추가”</b> 를 선택하면 끝! 🎉
          </Step>
        </ol>
      )}
    </section>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 text-sm text-neutral-700">
      <span
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
        style={{ backgroundColor: crew.primary }}
      >
        {n}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

// ── 인라인 아이콘(이미지 자산 없이 일관된 표기) ──────────────
function ShareIcon() {
  return (
    <svg
      className="inline-block align-text-bottom"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 15V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M5 12v7a1 1 0 001 1h12a1 1 0 001-1v-7" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      className="inline-block align-text-bottom"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg
      className="inline-block align-text-bottom"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}
