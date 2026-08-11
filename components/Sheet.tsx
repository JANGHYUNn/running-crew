"use client";

// 닫을 수 있는 모달 시트. 모바일=바텀시트, sm 이상=가운데 카드.
// 내용이 길어도 시트 안에서만 스크롤한다(뒤 페이지는 스크롤 잠금).
// 지도용 BottomSheet 와 달리 열림/닫힘이 있고 배경 딤·ESC 로 닫힌다.
import { useEffect, type ReactNode } from "react";

export default function Sheet({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  // ESC 닫기 + 뒤 페이지 스크롤 잠금(모바일에서 시트 스크롤이 페이지로 새는 것 방지)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button
        aria-label="닫기"
        onClick={onClose}
        className="sheet__backdrop absolute inset-0 cursor-default bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="sheet__panel relative flex max-h-[85vh] w-full flex-col rounded-t-3xl bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.18)] sm:max-h-[70vh] sm:max-w-md sm:rounded-2xl sm:shadow-2xl"
      >
        {/* 그립(모바일에서 시트임을 알리는 시각 힌트) */}
        <div className="flex shrink-0 justify-center pt-3 sm:hidden">
          <span className="h-1.5 w-10 rounded-full bg-neutral-300" />
        </div>

        <div className="flex shrink-0 items-start justify-between gap-2 px-4 pb-3 pt-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-xs text-neutral-400">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="-mr-1 shrink-0 rounded-full px-2 py-1 text-lg leading-none text-neutral-400"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-neutral-100 px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
}
