"use client";

import { useEffect, useRef, useState } from "react";
import { crew } from "@/lib/crew";
import { PREVIEW_SIZE, type Ratio } from "@/lib/cardRender";
import { Card3D } from "@/lib/card3d";
import {
  drawDragFrame,
  DRAG_DURATION_MS,
  prescaleToWidth,
  dragHeroWidth,
} from "@/lib/dragRender";
import { downloadBlob, exportGif, exportDragGif } from "@/lib/exporters";

type Theme = "spin" | "drag";

export default function CardPage() {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [ratio, setRatio] = useState<Ratio>("square");
  const [theme, setTheme] = useState<Theme>("spin");
  const [exporting, setExporting] = useState<null | "gif">(null);

  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 미리보기(3D 회전): Three.js 캔버스를 컨테이너에 붙이고 연속 회전
  useEffect(() => {
    const holder = holderRef.current;
    if (theme !== "spin" || !holder || !img) return;

    const { w, h } = PREVIEW_SIZE[ratio];
    const card = new Card3D(img, w, h);
    card.setBackground(null); // 투명(뒤 체커보드가 비쳐 보임)
    const el = card.domElement;
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.display = "block";
    holder.appendChild(el);

    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      card.render(((now - start) / 4000) * Math.PI * 2);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      holder.removeChild(el);
      card.dispose();
    };
  }, [img, ratio, theme]);

  // 미리보기(타이어 끌기): Canvas 2D 장면을 루프 재생
  useEffect(() => {
    const canvas = canvasRef.current;
    if (theme !== "drag" || !canvas || !img) return;

    const { w, h } = PREVIEW_SIZE[ratio];
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // 표시 폭(고DPI 반영) 근처까지 단계적으로 미리 축소 → 글자 또렷
    const prepared = prescaleToWidth(
      img,
      Math.ceil(dragHeroWidth(img, w, h) * dpr * 1.15)
    );

    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      const t = ((now - start) % DRAG_DURATION_MS) / DRAG_DURATION_MS;
      drawDragFrame(ctx, prepared, w, h, t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(raf);
  }, [img, ratio, theme]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    const image = await loadImage(dataUrl);
    setImg(image);
    e.target.value = "";
  }

  async function handleExport() {
    if (!img) return;
    setExporting("gif");
    try {
      if (theme === "spin") {
        const blob = await exportGif(img, ratio);
        downloadBlob(blob, `run_spin_${ratio}.gif`);
      } else {
        const blob = await exportDragGif(img, ratio);
        downloadBlob(blob, `run_drag_${ratio}.gif`);
      }
    } catch (err) {
      console.error(err);
      alert("내보내기에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setExporting(null);
    }
  }

  const busy = exporting !== null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-xl font-bold">
        {theme === "spin" ? "🎬 3D 회전 기록 카드" : "🐾 고양이 발도장 공개"}
      </h1>
      <p className="mb-5 text-sm text-neutral-500">
        {theme === "spin"
          ? "배경이 투명한 기록 이미지(PNG)를 올리면 3D로 360° 연속 회전하는 투명 GIF를 만들어 줍니다. CapCut 등으로 오버레이하세요."
          : "투명 배경 기록 이미지(PNG)를 올리면 고양이 발바닥이 도장처럼 쾅 찍히고, 그 자리에 기록이 짠 하고 나타나는 투명 GIF를 만들어 줍니다."}
        {" 모든 처리는 내 브라우저에서만 이뤄집니다."}
      </p>

      {/* 테마 토글 */}
      <div className="mb-5 grid grid-cols-2 gap-2">
        <ThemeButton
          active={theme === "spin"}
          onClick={() => setTheme("spin")}
          title="🎬 3D 회전"
          desc="투명 PNG 360° 회전"
        />
        <ThemeButton
          active={theme === "drag"}
          onClick={() => setTheme("drag")}
          title="🐾 발도장"
          desc="발바닥 쾅 → 기록 등장"
        />
      </div>

      {/* 미리보기 */}
      <div className="mb-5 flex justify-center">
        <div
          className="checkerboard relative w-full overflow-hidden rounded-2xl shadow-lg"
          style={{
            maxWidth: PREVIEW_SIZE[ratio].w,
            aspectRatio: `${PREVIEW_SIZE[ratio].w} / ${PREVIEW_SIZE[ratio].h}`,
          }}
        >
          {theme === "spin" ? (
            <div ref={holderRef} className="absolute inset-0" />
          ) : (
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full"
            />
          )}
          {!img && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-neutral-500">
              {theme === "spin" ? (
                <>
                  투명 배경 기록 이미지(PNG)를 올리면
                  <br />
                  여기서 3D로 돌아갑니다
                </>
              ) : (
                <>
                  투명 기록 이미지를 올리면
                  <br />
                  발바닥 도장으로 공개합니다
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 비율 토글 */}
      <div className="mb-5 flex justify-center gap-2">
        <RatioButton
          active={ratio === "square"}
          onClick={() => setRatio("square")}
          label="정사각 1:1"
        />
        <RatioButton
          active={ratio === "story"}
          onClick={() => setRatio("story")}
          label="세로 9:16"
        />
      </div>

      {/* 업로드 */}
      <div className="mb-5 rounded-2xl border border-neutral-200 bg-white p-5">
        <label className="block">
          <span className="mb-2 block text-sm font-bold">
            {theme === "spin"
              ? "투명 배경 기록 이미지 올리기"
              : "기록 스크린샷 올리기"}
          </span>
          <input
            type="file"
            accept="image/png,image/*"
            onChange={onUpload}
            disabled={busy}
            className="block w-full text-sm text-neutral-500 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm"
          />
        </label>
        <p className="mt-2 text-xs text-neutral-400">
          {theme === "spin"
            ? "배경이 투명한 PNG여야 깔끔하게 돕니다. (스트라바·NRC 캡처는 배경 지우기 앱으로 누끼 따서 올리세요)"
            : "배경이 투명한 기록 이미지(PNG)를 올리세요. 결과 GIF도 투명 배경으로 나옵니다."}
        </p>
      </div>

      {/* 내보내기 */}
      <button
        onClick={handleExport}
        disabled={!img || busy}
        className="w-full rounded-xl py-3 font-bold text-white transition disabled:opacity-50"
        style={{ backgroundColor: crew.primary }}
      >
        {exporting === "gif" ? "GIF 만드는 중…" : "투명 GIF 저장"}
      </button>

      {/* 사용 안내 */}
      <div className="mt-4 rounded-xl bg-neutral-100 p-4 text-xs leading-relaxed text-neutral-500">
        <p className="mb-1 font-bold text-neutral-700">어디에 쓰나요?</p>
        {theme === "spin" ? (
          <p>
            • <b>투명 GIF</b> — CapCut/인스타에 바로 오버레이하세요. 배경이 투명해서
            내 사진·영상 위에 그대로 올릴 수 있어요.
          </p>
        ) : (
          <p>
            • <b>투명 장면 GIF</b> — 배경이 투명해서 CapCut/영상편집에서 내가 원하는
            배경 위에 올릴 수 있어요. 고양이 발바닥이 도장처럼 찍어 내 기록을 공개하는 장면입니다.
          </p>
        )}
      </div>
    </div>
  );
}

function ThemeButton({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border px-3 py-2.5 text-left transition ${
        active
          ? "border-neutral-900 bg-neutral-900 text-white"
          : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
      }`}
    >
      <span className="block text-sm font-bold">{title}</span>
      <span
        className={`block text-xs ${active ? "text-neutral-300" : "text-neutral-400"}`}
      >
        {desc}
      </span>
    </button>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function RatioButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-neutral-900 text-white"
          : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
      }`}
    >
      {label}
    </button>
  );
}
