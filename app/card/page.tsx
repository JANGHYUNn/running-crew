"use client";

import { useEffect, useRef, useState } from "react";
import { crew } from "@/lib/crew";
import { runOcr } from "@/lib/ocr";
import {
  drawFrame,
  PREVIEW_SIZE,
  type Ratio,
  type Scene,
} from "@/lib/cardRender";
import { downloadBlob, exportGif, exportVideo } from "@/lib/exporters";

export default function CardPage() {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [distance, setDistance] = useState("");
  const [pace, setPace] = useState("");
  const [duration, setDuration] = useState("");
  const [location, setLocation] = useState("");
  const [runner, setRunner] = useState("");
  const [ratio, setRatio] = useState<Ratio>("story");

  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [exporting, setExporting] = useState<null | "video" | "gif">(null);

  const previewRef = useRef<HTMLCanvasElement>(null);

  // 최신 scene 을 ref로 유지 → 프리뷰 루프가 항상 최신값을 그림
  const scene: Scene = { img, ratio, distance, pace, duration, location, runner };
  const sceneRef = useRef(scene);
  useEffect(() => {
    sceneRef.current = scene;
  });

  // 미리보기 루프 (4.2초 재생 + 약간 멈춤 후 반복)
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    const { w, h } = PREVIEW_SIZE[ratio];
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      const cycle = ((now - start) / 4200) % 1.3; // 1.0~1.3 구간은 정지(여운)
      drawFrame(ctx, sceneRef.current, w, h, Math.min(1, cycle));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ratio]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    const image = await loadImage(dataUrl);
    setImg(image);

    // 자동 인식
    setOcrBusy(true);
    setOcrProgress(0);
    try {
      const { stats } = await runOcr(dataUrl, setOcrProgress);
      if (stats.distance) setDistance(stats.distance);
      if (stats.pace) setPace(stats.pace);
      if (stats.duration) setDuration(stats.duration);
    } catch (err) {
      console.error(err);
    } finally {
      setOcrBusy(false);
    }
  }

  async function handleExport(kind: "video" | "gif") {
    if (!img) return;
    setExporting(kind);
    try {
      const base = `run_${distance || "card"}`;
      if (kind === "video") {
        const { blob, ext } = await exportVideo(sceneRef.current);
        downloadBlob(blob, `${base}.${ext}`);
      } else {
        const blob = await exportGif(sceneRef.current);
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
      <h1 className="mb-1 text-xl font-bold">🎬 기록 인증 카드</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Strava·NRC 기록 이미지를 올리면 숫자를 자동 인식하고, 애니메이션 영상/GIF로
        만들어 줍니다. 모든 처리는 내 브라우저에서만 이뤄집니다.
      </p>

      {/* 미리보기 */}
      <div className="mb-5 flex justify-center">
        <div
          className="relative overflow-hidden rounded-2xl bg-neutral-900 shadow-lg"
          style={{ width: PREVIEW_SIZE[ratio].w, height: PREVIEW_SIZE[ratio].h }}
        >
          <canvas ref={previewRef} className="h-full w-full" />
          {!img && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-neutral-400">
              기록 이미지를 올리면 여기에 미리보기가 재생됩니다
            </div>
          )}
        </div>
      </div>

      {/* 비율 토글 */}
      <div className="mb-5 flex justify-center gap-2">
        <RatioButton
          active={ratio === "story"}
          onClick={() => setRatio("story")}
          label="스토리 9:16"
        />
        <RatioButton
          active={ratio === "square"}
          onClick={() => setRatio("square")}
          label="피드 1:1"
        />
      </div>

      {/* 업로드 */}
      <div className="mb-5 rounded-2xl border border-neutral-200 bg-white p-5">
        <label className="block">
          <span className="mb-2 block text-sm font-bold">
            1. 기록 이미지 올리기
          </span>
          <input
            type="file"
            accept="image/*"
            onChange={onUpload}
            disabled={busy}
            className="block w-full text-sm text-neutral-500 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm"
          />
        </label>
        {ocrBusy && (
          <p className="mt-3 text-sm text-neutral-500">
            숫자 인식 중… {Math.round(ocrProgress * 100)}%
          </p>
        )}
      </div>

      {/* 입력 폼 (자동 인식 후 수정) */}
      <div className="grid gap-4 rounded-2xl border border-neutral-200 bg-white p-5 sm:grid-cols-2">
        <div className="sm:col-span-2 -mb-1 text-sm font-bold">
          2. 기록 확인 · 수정{" "}
          <span className="font-normal text-neutral-400">
            (자동 인식이 틀리면 고쳐주세요)
          </span>
        </div>

        <Field label="거리 (km)">
          <input
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            className="input"
            placeholder="8.24"
            inputMode="decimal"
          />
        </Field>

        <Field label="페이스">
          <input
            value={pace}
            onChange={(e) => setPace(e.target.value)}
            className="input"
            placeholder="5'32&quot;"
          />
        </Field>

        <Field label="시간">
          <input
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="input"
            placeholder="45:30"
          />
        </Field>

        <Field label="장소 (선택)">
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="input"
            placeholder="한강 반포지구"
          />
        </Field>

        <Field label="러너 이름 (선택)">
          <input
            value={runner}
            onChange={(e) => setRunner(e.target.value)}
            className="input"
            placeholder="홍길동"
          />
        </Field>
      </div>

      {/* 내보내기 */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          onClick={() => handleExport("video")}
          disabled={!img || busy}
          className="rounded-xl py-3 font-bold text-white transition disabled:opacity-50"
          style={{ backgroundColor: crew.primary }}
        >
          {exporting === "video" ? "영상 만드는 중…" : "🎬 동영상으로 저장"}
        </button>
        <button
          onClick={() => handleExport("gif")}
          disabled={!img || busy}
          className="rounded-xl border border-neutral-300 py-3 font-bold text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-50"
        >
          {exporting === "gif" ? "GIF 만드는 중…" : "GIF로 저장"}
        </button>
      </div>

      <p className="mt-3 text-center text-xs text-neutral-400">
        동영상은 인스타 스토리/릴스에, GIF는 어디서나 공유하기 좋아요
      </p>
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-500">
        {label}
      </span>
      {children}
    </label>
  );
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
