"use client";

// 설치형 앱(standalone) 실행 시 보여주는 인앱 애니메이션 스플래시.
// - OS 네이티브 스플래시(정지 이미지)는 애니메이션이 불가 → 앱 부팅 직후 이 오버레이로 처리.
// - 설치된 앱에서만(브라우저 방문자 제외), 세션당 1회만(페이지 이동마다 안 뜨게).
// - manifest background_color 와 같은 빨강 위에서 시작해 이음새 없이 이어진 뒤 페이드아웃.
import { useEffect, useState } from "react";
import { crew } from "@/lib/crew";

const SESSION_KEY = "splash_shown";

export default function SplashScreen() {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!standalone) return;
    if (sessionStorage.getItem(SESSION_KEY) === "1") return;
    sessionStorage.setItem(SESSION_KEY, "1");

    queueMicrotask(() => setShow(true)); // 동기 setState 회피
    const tLeave = setTimeout(() => setLeaving(true), 1400); // 페이드아웃 시작
    const tDone = setTimeout(() => setShow(false), 1850); // 완전 제거
    return () => {
      clearTimeout(tLeave);
      clearTimeout(tDone);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      className={`splash${leaving ? " splash--leaving" : ""}`}
      style={{ backgroundColor: crew.primary }}
      aria-hidden
    >
      <div className="splash__logo">{crew.name}</div>
      <div className="splash__runners">{crew.logoEmoji}</div>
      <div className="splash__tagline">{crew.tagline}</div>
    </div>
  );
}
