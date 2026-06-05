"use client";

import { useEffect, useRef, useState } from "react";
import { crew } from "@/lib/crew";
import { PREVIEW_SIZE, type Ratio } from "@/lib/cardRender";
import { Card3D } from "@/lib/card3d";
import { downloadBlob, exportGif, exportVideo } from "@/lib/exporters";

export default function CardPage() {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [ratio, setRatio] = useState<Ratio>("square");
  const [exporting, setExporting] = useState<null | "video" | "gif">(null);

  const holderRef = useRef<HTMLDivElement>(null);

  // 미리보기: Three.js 캔버스를 컨테이너에 붙이고 연속 회전
  useEffect(() => {
    const holder = holderRef.current;
    if (!holder || !img) return;

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
  }, [img, ratio]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    const image = await loadImage(dataUrl);
    setImg(image);
    e.target.value = "";
  }

  async function handleExport(kind: "video" | "gif") {
    if (!img) return;
    setExporting(kind);
    try {
      const base = `run_spin_${ratio}`;
      if (kind === "video") {
        const { blob, ext } = await exportVideo(img, ratio);
        downloadBlob(blob, `${base}_green.${ext}`);
      } else {
        const blob = await exportGif(img, ratio);
        downloadBlob(blob, `${base}.gif`);
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
      <h1 className="mb-1 text-xl font-bold">🎬 3D 회전 기록 카드</h1>
      <p className="mb-6 text-sm text-neutral-500">
        배경이 투명한 기록 이미지(PNG)를 올리면 3D로 360° 연속 회전하는 영상/GIF를
        만들어 줍니다. 다운로드해서 CapCut 등으로 내 사진·영상 위에 오버레이하세요.
        모든 처리는 내 브라우저에서만 이뤄집니다.
      </p>

      {/* 미리보기 (뒤 체커보드 = 투명 표시) */}
      <div className="mb-5 flex justify-center">
        <div
          className="checkerboard relative w-full overflow-hidden rounded-2xl shadow-lg"
          style={{
            maxWidth: PREVIEW_SIZE[ratio].w,
            aspectRatio: `${PREVIEW_SIZE[ratio].w} / ${PREVIEW_SIZE[ratio].h}`,
          }}
        >
          <div ref={holderRef} className="absolute inset-0" />
          {!img && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-neutral-500">
              투명 배경 기록 이미지(PNG)를 올리면
              <br />
              여기서 3D로 돌아갑니다
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
            투명 배경 기록 이미지 올리기
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
          배경이 투명한 PNG여야 깔끔하게 돕니다. (스트라바·NRC 캡처는 배경 지우기
          앱으로 누끼 따서 올리세요)
        </p>
      </div>

      {/* 내보내기 */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => handleExport("gif")}
          disabled={!img || busy}
          className="rounded-xl py-3 font-bold text-white transition disabled:opacity-50"
          style={{ backgroundColor: crew.primary }}
        >
          {exporting === "gif" ? "GIF 만드는 중…" : "투명 GIF 저장"}
        </button>
        <button
          onClick={() => handleExport("video")}
          disabled={!img || busy}
          className="rounded-xl border border-neutral-300 py-3 font-bold text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-50"
        >
          {exporting === "video" ? "영상 만드는 중…" : "🟩 영상 저장(크로마키)"}
        </button>
      </div>

      {/* 사용 안내 */}
      <div className="mt-4 rounded-xl bg-neutral-100 p-4 text-xs leading-relaxed text-neutral-500">
        <p className="mb-1 font-bold text-neutral-700">어디에 쓰나요?</p>
        <p>
          • <b>투명 GIF</b> — CapCut/인스타에 바로 오버레이. 간편하지만 색·테두리가
          살짝 거칠어요.
        </p>
        <p>
          • <b>영상(크로마키)</b> — 초록 배경 위에서 회전합니다. CapCut에서{" "}
          <b>오버레이로 추가 → 크로마키</b>로 초록을 빼면 화질이 가장 깔끔해요.
        </p>
      </div>
    </div>
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
