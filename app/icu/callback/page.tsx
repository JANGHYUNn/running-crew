"use client";

// intervals.icu OAuth 콜백 처리.
// icu 가 ?code=…&state=… 로 돌려보내면 여기서 state 검증 → 토큰 교환·저장 → /map 으로.
// 정적 export 호환을 위해 useSearchParams 대신 window.location.search 를 직접 읽는다.
import { useEffect, useState } from "react";
import { exchangeAndStore, verifyState } from "@/lib/icu";

export default function IcuCallbackPage() {
  const [status, setStatus] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("intervals.icu 연동 처리 중…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const err = params.get("error");

    (async () => {
      if (err) {
        setStatus("error");
        setMessage(`연동이 취소되었거나 실패했습니다 (${err})`);
        return;
      }
      if (!code) {
        setStatus("error");
        setMessage("인증 코드가 없습니다.");
        return;
      }
      if (!verifyState(state)) {
        setStatus("error");
        setMessage("보안 검증(state)에 실패했습니다. 다시 시도해 주세요.");
        return;
      }
      try {
        await exchangeAndStore(code);
        setStatus("done");
        setMessage("연동 완료! 지도로 이동합니다…");
        setTimeout(() => {
          window.location.href = "/map";
        }, 1200);
      } catch (e) {
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "연동 실패");
      }
    })();
  }, []);

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <p className="text-2xl">
        {status === "done" ? "✅" : status === "error" ? "⚠️" : "⏳"}
      </p>
      <p className="mt-3 text-sm text-neutral-600">{message}</p>
      {status === "error" && (
        <a href="/map" className="mt-5 inline-block text-sm text-neutral-400 underline">
          지도로 돌아가기
        </a>
      )}
    </div>
  );
}
