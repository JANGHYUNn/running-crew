"use client";

// 한 사람의 기록을 달력 히트맵으로 보여준다.
// 30줄짜리 리스트를 6줄 그리드로 압축 — 모바일에서 스크롤 없이
// "언제 얼마나 뛰었나"가 한눈에 들어오고, 날짜를 누르면 그 날 기록·인증사진만 아래에 펼친다.
// 챌린지(시즌 범위)와 개인 기록(월 범위)이 같은 컴포넌트를 쓴다.
import { useMemo, useState } from "react";
import { crew } from "@/lib/crew";
import { enumerateDays, formatKm } from "@/lib/format";
import ProofThumb from "@/components/ProofThumb";

/** 챌린지 Run·개인 PersonalRun 양쪽이 만족하는 최소 형태 */
export interface CalendarRun {
  id: string;
  run_date: string;
  distance_km: number;
  note: string | null;
  image_url: string | null;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 히트맵 농도 4단계 — 그 사람의 최고 기록 대비 비율(남과 비교하는 지표가 아님) */
function levelOf(km: number, maxKm: number): number {
  if (km <= 0) return 0;
  const r = km / maxKm;
  if (r <= 0.25) return 1;
  if (r <= 0.5) return 2;
  if (r <= 0.75) return 3;
  return 4;
}

/** 단계별 크루 컬러 혼합 비율(%) — 0단계는 회색이라 여기 없음 */
const MIX = [0, 26, 48, 70, 100];

/** 데이터 기반 동적 색이라 인라인(클래스로 뺄 수 없음) */
function cellStyle(lv: number) {
  if (lv === 0) return undefined;
  return {
    backgroundColor: `color-mix(in srgb, ${crew.primary} ${MIX[lv]}%, #ffffff)`,
    color: lv >= 3 ? "#ffffff" : "#404040",
  };
}

/** "2026-08-11" → "8.11 (화)" */
function dayLabel(iso: string): string {
  const wd = WEEKDAYS[new Date(`${iso}T00:00:00`).getDay()];
  return `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))} (${wd})`;
}

export default function RunCalendar({
  runs,
  start,
  end,
  focusDate,
  onDelete,
}: {
  runs: CalendarRun[];
  /** 그릴 기간("YYYY-MM-DD") — 챌린지는 시즌 전체, 개인 기록은 한 달 */
  start: string;
  end: string;
  /** 이 날짜를 대신 펼쳐 본다(제출 화면에서 고른 날짜와 달력을 맞추는 용도) */
  focusDate?: string;
  /** 넘기면 상세에 삭제 버튼이 붙는다(본인 기록 관리 화면 전용) */
  onDelete?: (run: CalendarRun) => void;
}) {
  const stats = useMemo(() => {
    const kmByDate = new Map<string, number>();
    const runsByDate = new Map<string, CalendarRun[]>();
    for (const r of runs) {
      kmByDate.set(r.run_date, (kmByDate.get(r.run_date) ?? 0) + Number(r.distance_km));
      const arr = runsByDate.get(r.run_date) ?? [];
      arr.push(r);
      runsByDate.set(r.run_date, arr);
    }

    return {
      kmByDate,
      runsByDate,
      // 히트맵 기준값 — 칸이 하루 합계라 최댓값도 하루 합계 기준
      maxDayKm: Math.max(...kmByDate.values(), 0),
      dayCount: kmByDate.size,
    };
  }, [runs]);

  // 달력 그리드: 기간이 두 달에 걸치면 월별로 나눠 그린다.
  // lead = 그 달 첫 표시일의 요일만큼 앞을 비운다(기간이 월 중간에 시작해도 요일이 맞음).
  const months = useMemo(() => {
    const out: { key: string; label: string; days: string[]; lead: number }[] = [];
    for (const iso of enumerateDays(start, end)) {
      const key = iso.slice(0, 7);
      let cur = out[out.length - 1];
      if (!cur || cur.key !== key) {
        cur = {
          key,
          label: `${Number(key.slice(5))}월`,
          days: [],
          lead: new Date(`${iso}T00:00:00`).getDay(),
        };
        out.push(cur);
      }
      cur.days.push(iso);
    }
    return out;
  }, [start, end]);

  // 기본 선택 = 가장 최근에 뛴 날(열자마자 최신 인증사진이 보이도록)
  const [selected, setSelected] = useState<string>(
    () => focusDate ?? runs.reduce((max, r) => (r.run_date > max ? r.run_date : max), "")
  );

  // 바깥에서 날짜를 고르면 달력도 따라간다(제출 화면의 날짜 입력과 연동).
  // effect 대신 렌더 중 보정 — prop 변화에 맞춰 state 를 조정하는 React 권장 패턴.
  const [prevFocus, setPrevFocus] = useState(focusDate);
  if (focusDate && focusDate !== prevFocus) {
    setPrevFocus(focusDate);
    setSelected(focusDate);
  }

  const selectedRuns = stats.runsByDate.get(selected) ?? [];

  return (
    <div>
      {months.map((mo) => (
        <div key={mo.key} className="first:mt-0 mt-3">
          {months.length > 1 && (
            <p className="mb-1 text-xs font-bold text-neutral-400">{mo.label}</p>
          )}
          <div className="grid grid-cols-7 gap-[3px]">
            {WEEKDAYS.map((w) => (
              <span key={w} className="text-center text-[10px] text-neutral-400">
                {w}
              </span>
            ))}
            {Array.from({ length: mo.lead }, (_, i) => (
              <span key={`lead-${i}`} />
            ))}
            {mo.days.map((iso) => {
              const km = stats.kmByDate.get(iso) ?? 0;
              const lv = levelOf(km, stats.maxDayKm || 1);
              const isSel = iso === selected;
              // 칸은 정사각형 대신 4:3 — 정사각형이면 6줄이 시트 높이를 넘겨 스크롤이 생긴다
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={km === 0}
                  onClick={() => setSelected(iso)}
                  aria-label={`${dayLabel(iso)} ${km > 0 ? `${formatKm(km)}km` : "기록 없음"}`}
                  aria-pressed={isSel}
                  className={`tnum grid aspect-[4/3] place-items-center rounded-lg text-[11px] ${
                    km > 0
                      ? "font-bold"
                      : "bg-neutral-100 text-neutral-300 disabled:cursor-default"
                  } ${isSel ? "ring-2 ring-neutral-900 ring-offset-1" : ""}`}
                  style={cellStyle(lv)}
                >
                  {Number(iso.slice(8, 10))}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* 기록이 하나도 없는 달엔 범례가 군더더기라 감춘다 */}
      {stats.dayCount > 0 ? (
        <p className="mt-1.5 flex items-center justify-end gap-1 text-[10px] text-neutral-400">
          적게
          {[1, 2, 3, 4].map((lv) => (
            <span key={lv} className="h-3 w-3 rounded-sm" style={cellStyle(lv)} />
          ))}
          많이 · {stats.dayCount}일 뛰었어요
        </p>
      ) : (
        <p className="mt-1.5 text-center text-xs text-neutral-400">
          이 기간엔 기록이 없어요
        </p>
      )}

      {/* 선택한 날 상세 */}
      {selected && (
        <div className="mt-2 border-t border-neutral-100 pt-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-bold">{dayLabel(selected)}</p>
            <p className="tnum shrink-0 text-sm text-neutral-500">
              {formatKm(stats.kmByDate.get(selected) ?? 0)} km
              {selectedRuns.length > 1 && (
                <span className="ml-1 text-xs text-neutral-400">
                  ({selectedRuns.length}건)
                </span>
              )}
            </p>
          </div>
          {selectedRuns.length === 0 && (
            <p className="py-2 text-sm text-neutral-400">이 날은 기록이 없어요</p>
          )}

          {/* 하루 한 건이면 메모까지 한 줄로, 여러 건이면 가로 스트립(세로로 쌓으면 시트를 넘친다) */}
          {selectedRuns.length === 1 && (
            <ul className="mt-1.5">
              {selectedRuns.map((r) => (
                <li key={r.id} className="flex items-center gap-3">
                  <Thumb url={r.image_url} />
                  <div className="min-w-0 flex-1">
                    <p className="tnum font-bold text-neutral-700">
                      {formatKm(Number(r.distance_km))}km
                    </p>
                    {r.note && (
                      <p className="truncate text-xs text-neutral-400">{r.note}</p>
                    )}
                  </div>
                  {onDelete && <DeleteButton onClick={() => onDelete(r)} />}
                </li>
              ))}
            </ul>
          )}

          {selectedRuns.length > 1 && (
            <>
              <ul className="mt-1.5 flex flex-wrap gap-2">
                {selectedRuns.map((r) => (
                  <li key={r.id} className="w-12 shrink-0 text-center">
                    <Thumb url={r.image_url} />
                    <p className="tnum mt-0.5 text-[10px] font-bold text-neutral-600">
                      {formatKm(Number(r.distance_km))}km
                    </p>
                    {onDelete && (
                      <button
                        onClick={() => onDelete(r)}
                        className="text-[10px] text-neutral-400 hover:text-red-500"
                      >
                        삭제
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {/* 스트립엔 메모 자리가 없어 아래에 한 줄씩(메모가 있는 기록만) */}
              <ul className="mt-1">
                {selectedRuns
                  .filter((r) => r.note)
                  .map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-1 text-xs text-neutral-400"
                    >
                      <span className="tnum shrink-0">
                        {formatKm(Number(r.distance_km))}km
                      </span>
                      <span className="truncate">· {r.note}</span>
                    </li>
                  ))}
              </ul>
            </>
          )}

          {/* 안내는 기록마다 반복하지 않고 목록 끝에 한 번만 */}
          {selectedRuns.some((r) => r.image_url) && (
            <p className="mt-1 text-right text-[10px] text-neutral-300">
              사진을 누르면 원본
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="ml-auto shrink-0 px-1 text-xs text-neutral-400 hover:text-red-500"
    >
      삭제
    </button>
  );
}

/** 인증사진 썸네일(없으면 자리표시) */
function Thumb({ url }: { url: string | null }) {
  if (!url)
    return (
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-dashed border-neutral-200 text-[9px] text-neutral-300">
        사진 없음
      </span>
    );
  return (
    <ProofThumb
      url={url}
      className="h-12 w-12 rounded-lg border border-neutral-200 object-cover"
    />
  );
}

