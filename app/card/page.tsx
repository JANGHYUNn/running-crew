"use client";

import { useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import RecordCard, {
  CARD_SIZE,
  type CardRatio,
} from "@/components/RecordCard";
import {
  calcPace,
  formatDateDot,
  formatDuration,
  parseDurationToSeconds,
} from "@/lib/format";
import { crew } from "@/lib/crew";

export default function CardPage() {
  const cardRef = useRef<HTMLDivElement>(null);

  const [distance, setDistance] = useState("8.24");
  const [durationInput, setDurationInput] = useState("45:30");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("한강 반포지구");
  const [runner, setRunner] = useState("");
  const [ratio, setRatio] = useState<CardRatio>("story");
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 입력으로부터 파생값 계산 (페이스/시간/날짜 포맷)
  const derived = useMemo(() => {
    const dist = Number(distance) || 0;
    const seconds = parseDurationToSeconds(durationInput);
    return {
      pace: calcPace(dist, seconds),
      duration: formatDuration(seconds),
      dateDot: formatDateDot(date),
    };
  }, [distance, durationInput, date]);

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    // base64 data URL로 읽어야 캡처 시 CORS 문제 없음
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    if (!cardRef.current) return;
    setSaving(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        // 미리보기(360px)를 3배로 → 1080px 폭의 선명한 이미지
        pixelRatio: 3,
        cacheBust: true,
      });
      const link = document.createElement("a");
      link.download = `record_${distance}km_${date || "card"}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error(err);
      alert("이미지 저장에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-xl font-bold">📸 기록 인증 카드</h1>
      <p className="mb-6 text-sm text-neutral-500">
        기록을 입력하고 사진을 올리면 인스타 공유용 카드가 만들어집니다.
      </p>

      {/* 미리보기 */}
      <div className="mb-6 flex justify-center">
        <div
          className="overflow-hidden rounded-2xl shadow-lg"
          style={{ width: CARD_SIZE[ratio].w, height: CARD_SIZE[ratio].h }}
        >
          <RecordCard
            ref={cardRef}
            photo={photo}
            distance={distance || "0.00"}
            pace={derived.pace}
            duration={derived.duration}
            dateDot={derived.dateDot}
            location={location}
            runner={runner}
            ratio={ratio}
          />
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

      {/* 입력 폼 */}
      <div className="grid gap-4 rounded-2xl border border-neutral-200 bg-white p-5 sm:grid-cols-2">
        <Field label="거리 (km)">
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            className="input"
            placeholder="8.24"
          />
        </Field>

        <Field label="시간 (hh:mm:ss 또는 mm:ss)">
          <input
            value={durationInput}
            onChange={(e) => setDurationInput(e.target.value)}
            className="input"
            placeholder="45:30"
          />
        </Field>

        <Field label="날짜">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input"
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

        <Field label="배경 사진">
          <input
            type="file"
            accept="image/*"
            onChange={onPhotoChange}
            className="block w-full text-sm text-neutral-500 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm"
          />
        </Field>

        {/* 자동 계산 결과 표시 */}
        <div className="sm:col-span-2 flex gap-6 rounded-lg bg-neutral-50 px-3 py-2 text-sm">
          <span className="text-neutral-400">자동 계산</span>
          <span>
            페이스 <b className="tnum">{derived.pace}</b>/km
          </span>
          <span>
            시간 <b className="tnum">{derived.duration}</b>
          </span>
        </div>
      </div>

      {/* 저장 버튼 */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-5 w-full rounded-xl py-3 font-bold text-white transition disabled:opacity-50"
        style={{ backgroundColor: crew.primary }}
      >
        {saving ? "이미지 만드는 중…" : "이미지로 저장하기"}
      </button>

      <p className="mt-3 text-center text-xs text-neutral-400">
        저장 후 인스타 스토리에 올려보세요 · 모든 작업은 내 브라우저에서만 처리됩니다
      </p>
    </div>
  );
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
