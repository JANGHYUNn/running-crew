"use client";

// 모바일 앱 스타일 바텀시트. 접힘(peek)·펼침 2단 스냅.
// 그립을 드래그하거나 탭하면 토글. 펼침 상태에서 내용은 스크롤.
// 부모는 position:relative 인 고정 높이 컨테이너여야 한다(시트는 absolute bottom-0).
import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from "react";

/** 접힘 상태에서 보일 높이(px): 그립 + 상단 요약/주요 버튼 */
const PEEK = 132;
/** 이 픽셀 이상 움직이면 '드래그'로 보고 탭 토글을 무시 */
const DRAG_THRESHOLD = 6;

export default function BottomSheet({ children }: { children: ReactNode }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [dragY, setDragY] = useState<number | null>(null);
  const [sheetHeight, setSheetHeight] = useState(0); // 내용에 따라 바뀌므로 관찰
  const dragStart = useRef<{ y: number; base: number } | null>(null);
  const moved = useRef(false);

  // 시트 실제 높이를 관찰(내용 변화 시 갱신). transform 은 offsetHeight 에 영향 없음.
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSheetHeight(el.offsetHeight));
    ro.observe(el);
    setSheetHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  // 접힘 시 아래로 내릴 거리 = 시트 높이 - peek.
  const collapsedOffset = Math.max(0, sheetHeight - PEEK);
  const baseOffset = expanded ? 0 : collapsedOffset;
  const measured = sheetHeight > 0;
  const offset = dragY ?? baseOffset;

  function onPointerDown(e: PointerEvent) {
    dragStart.current = { y: e.clientY, base: baseOffset };
    moved.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent) {
    if (!dragStart.current) return;
    const delta = e.clientY - dragStart.current.y;
    if (Math.abs(delta) > DRAG_THRESHOLD) moved.current = true;
    const next = Math.min(collapsedOffset, Math.max(0, dragStart.current.base + delta));
    setDragY(next);
  }
  function onPointerUp() {
    if (!dragStart.current) return;
    if (moved.current) {
      // 드래그 → 중간 기준으로 가까운 스냅으로.
      setExpanded((dragY ?? baseOffset) < collapsedOffset / 2);
    } else {
      // 탭 → 토글.
      setExpanded((v) => !v);
    }
    setDragY(null);
    dragStart.current = null;
  }

  return (
    <div
      ref={sheetRef}
      className="absolute inset-x-0 bottom-0 z-10 flex max-h-[80%] flex-col rounded-t-3xl border-t border-neutral-200 bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.14)]"
      style={{
        // 측정 전엔 화면 밖(아래)에서 시작 → 측정 후 peek 위치로 슬라이드 업.
        transform: measured ? `translateY(${offset}px)` : "translateY(100%)",
        transition: dragY === null ? "transform 0.28s cubic-bezier(0.4,0,0.2,1)" : "none",
      }}
    >
      {/* 그립(드래그/탭 영역) */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex shrink-0 cursor-grab touch-none flex-col items-center pb-1 pt-3 active:cursor-grabbing"
      >
        <span className="h-1.5 w-10 rounded-full bg-neutral-300" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </div>
  );
}
