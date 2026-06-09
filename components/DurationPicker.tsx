"use client";

import { useEffect, useState } from "react";

/**
 * 분:초 (필요 시 시:분:초) 구분 입력 피커. 자유 텍스트 대신 칸을 나눠 실수를 줄인다.
 * - 1시간 미만이면 `시` 칸을 숨겨 노이즈를 없앤다. `＋시간`을 누르거나 값이 1시간을
 *   넘으면 `시` 칸이 나타난다.
 * - `seconds` prop 이 외부에서 바뀌면(예: OCR 자동채움) 표시도 따라 갱신된다.
 *   입력 중에는 내부 버퍼를 유지해 커서가 튀지 않게 한다.
 */
export default function DurationPicker({
  seconds,
  onChange,
}: {
  seconds: number;
  onChange: (sec: number) => void;
}) {
  const init = splitHMS(seconds);
  const [hh, setHh] = useState(String(init.h));
  const [mm, setMm] = useState(pad(init.m));
  const [ss, setSs] = useState(pad(init.s));
  const [showHours, setShowHours] = useState(init.h > 0);

  // 외부에서 seconds 가 바뀌면(현재 입력값과 다를 때만) 표시를 동기화.
  // 사용자가 타이핑 중일 때는 seconds === 로컬합 이라 건너뛰어 깜빡임이 없다.
  const localTotal =
    (Number(hh) || 0) * 3600 + (Number(mm) || 0) * 60 + (Number(ss) || 0);
  useEffect(() => {
    if (seconds !== localTotal) {
      const x = splitHMS(seconds);
      setHh(String(x.h));
      setMm(pad(x.m));
      setSs(pad(x.s));
      if (x.h > 0) setShowHours(true);
    }
    // localTotal 은 의도적으로 제외(seconds 변화에만 반응)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);

  function emit(h: string, m: string, s: string) {
    onChange((Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0));
  }

  return (
    <PickerBox>
      {showHours && (
        <Seg
          value={hh}
          onChange={(v) => {
            const n = clean(v, 23);
            setHh(n);
            emit(n, mm, ss);
          }}
          unit="시"
        />
      )}
      <Seg
        value={mm}
        onChange={(v) => {
          const n = clean(v, 59);
          setMm(n);
          emit(hh, n, ss);
        }}
        onBlur={() => setMm((m) => pad(Number(m) || 0))}
        unit="분"
      />
      <Seg
        value={ss}
        onChange={(v) => {
          const n = clean(v, 59);
          setSs(n);
          emit(hh, mm, n);
        }}
        onBlur={() => setSs((s) => pad(Number(s) || 0))}
        unit="초"
      />
      {!showHours && (
        <button
          type="button"
          onClick={() => setShowHours(true)}
          className="ml-auto whitespace-nowrap text-xs text-neutral-400 hover:text-neutral-600"
        >
          ＋시간
        </button>
      )}
    </PickerBox>
  );
}

/**
 * 평균 페이스 입력 피커(분'초"/km). 페이스는 1시간을 넘지 않으니 분·초만 받는다.
 * 동기화 동작은 DurationPicker 와 동일.
 */
export function PacePicker({
  paceSec,
  onChange,
}: {
  paceSec: number;
  onChange: (sec: number) => void;
}) {
  const init = splitMS(paceSec);
  const [mm, setMm] = useState(pad(init.m));
  const [ss, setSs] = useState(pad(init.s));

  const localTotal = (Number(mm) || 0) * 60 + (Number(ss) || 0);
  useEffect(() => {
    if (paceSec !== localTotal) {
      const x = splitMS(paceSec);
      setMm(pad(x.m));
      setSs(pad(x.s));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paceSec]);

  function emit(m: string, s: string) {
    onChange((Number(m) || 0) * 60 + (Number(s) || 0));
  }

  return (
    <PickerBox>
      <Seg
        value={mm}
        onChange={(v) => {
          const n = clean(v, 59);
          setMm(n);
          emit(n, ss);
        }}
        unit="′"
      />
      <Seg
        value={ss}
        onChange={(v) => {
          const n = clean(v, 59);
          setSs(n);
          emit(mm, n);
        }}
        onBlur={() => setSs((s) => pad(Number(s) || 0))}
        unit="″"
      />
      <span className="ml-auto whitespace-nowrap text-xs text-neutral-400">/km</span>
    </PickerBox>
  );
}

// ── 공용 조각 ──────────────────────────────────────────────
function PickerBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[calc(1.5em+1rem+2px)] items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3">
      {children}
    </div>
  );
}

function Seg({
  value,
  onChange,
  onBlur,
  unit,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  unit: string;
}) {
  return (
    <span className="flex items-baseline">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onFocus={(e) => e.target.select()}
        inputMode="numeric"
        className="tnum w-7 bg-transparent text-right outline-none"
        style={{ fontSize: 16 }}
        placeholder="0"
      />
      <span className="ml-0.5 mr-1.5 text-xs text-neutral-400">{unit}</span>
    </span>
  );
}

/** 숫자만, 두 자리, 최댓값으로 제한 */
function clean(raw: string, max: number): string {
  const digits = raw.replace(/\D/g, "").slice(0, 2);
  if (digits === "") return "";
  return String(Math.min(max, Number(digits)));
}

/** 총 초 → {시, 분, 초} */
export function splitHMS(total: number): { h: number; m: number; s: number } {
  const t = Math.max(0, Math.floor(total));
  return { h: Math.floor(t / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}
/** 총 초 → {분, 초} (페이스용) */
function splitMS(total: number): { m: number; s: number } {
  const t = Math.max(0, Math.floor(total));
  return { m: Math.floor(t / 60), s: t % 60 };
}
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
