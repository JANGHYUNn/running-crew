"use client";

import { useEffect } from "react";

/**
 * 서비스워커 등록(브라우저에서만). UI 없음 — layout에 한 번 마운트.
 * 등록되면 설치형 PWA 조건이 충족되어 "홈 화면에 추가"가 가능해짐.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("SW 등록 실패:", err);
    });
  }, []);

  return null;
}
