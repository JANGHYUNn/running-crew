"use client";

// 추천 코스 좌표 가져오기 도구(크루장용, 비공개 링크).
// Strava 웹페이지에서 GPX 내보내기 → 텍스트/파일 붙여넣기, 또는 encoded polyline 문자열 붙여넣기.
// → 미리보기 지도 + lib/courses.ts 에 붙여넣을 Course 스니펫 출력. 백엔드 0.
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  parseRoute,
  simplify,
  routeDistanceKm,
  toCourseSnippet,
  type LngLat,
} from "@/lib/courseImport";
import type { Course } from "@/lib/courses";

const CrewMap = dynamic(() => import("@/components/CrewMap"), { ssr: false });
const mapboxConfigured = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** 코스 id — 영문 슬러그가 없으면(한글 이름 등) 출발 좌표로 고유 id 생성. */
function courseId(name: string, coords: LngLat[]): string {
  const slug = slugify(name);
  if (slug) return slug;
  const [lng, lat] = coords[0] ?? [0, 0];
  return `course-${Math.round(lat * 1000)}-${Math.round(lng * 1000)}`;
}

export default function CourseImportPage() {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [desc, setDesc] = useState("");
  const [color, setColor] = useState("#fc5200"); // Strava 오렌지
  const [coords, setCoords] = useState<LngLat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleConvert() {
    setError(null);
    setCopied(false);
    try {
      const raw = parseRoute(text);
      if (raw.length < 2) {
        setError("좌표를 찾지 못했어요. GPX 전체 또는 polyline 문자열을 붙여넣었는지 확인해 주세요.");
        setCoords([]);
        return;
      }
      setCoords(simplify(raw, 150));
    } catch {
      setError("변환에 실패했어요. 입력 형식을 확인해 주세요.");
      setCoords([]);
    }
  }

  async function handleFile(file: File) {
    const t = await file.text();
    setText(t);
    setError(null);
    try {
      const raw = parseRoute(t);
      if (raw.length < 2) {
        setError("파일에서 좌표를 찾지 못했어요.");
        setCoords([]);
        return;
      }
      setCoords(simplify(raw, 150));
      if (!name) setName(file.name.replace(/\.gpx$/i, ""));
    } catch {
      setError("파일을 읽지 못했어요.");
    }
  }

  const distanceKm = useMemo(() => routeDistanceKm(coords), [coords]);

  const draft: Course | null = useMemo(() => {
    if (coords.length < 2) return null;
    return {
      id: courseId(name, coords),
      name: name || "내 코스",
      region: region.trim() || "기타",
      distance: distanceKm,
      desc: desc || undefined,
      color,
      coords,
    };
  }, [coords, name, region, desc, color, distanceKm]);

  const snippet = useMemo(
    () =>
      draft
        ? toCourseSnippet({ ...draft, distance: distanceKm })
        : "",
    [draft, distanceKm]
  );

  async function handleCopy() {
    if (!snippet) return;
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <h1 className="text-lg font-bold text-neutral-900">🏃 추천 코스 가져오기</h1>
      <p className="mt-1 text-xs text-neutral-500">
        Strava 활동·루트의 <b>…</b> → <b>GPX 내보내기</b>로 받은 파일을 올리거나,
        파일 내용/인코딩된 polyline 문자열을 붙여넣으세요.
      </p>

      {/* 입력 */}
      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="text-xs font-bold text-neutral-600">GPX 파일</span>
          <input
            type="file"
            accept=".gpx,application/gpx+xml,text/xml"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            className="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-200 file:px-3 file:py-1.5 file:text-sm file:font-bold"
          />
        </label>

        <label className="block">
          <span className="text-xs font-bold text-neutral-600">
            또는 붙여넣기 (GPX 전체 / polyline)
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="<gpx>... 또는  }_p~iF~ps|U_ulLnnqC..."
            className="mt-1 block w-full rounded-xl border border-neutral-300 p-2 font-mono text-xs"
          />
        </label>

        <button
          onClick={handleConvert}
          className="w-full rounded-xl bg-neutral-900 py-2.5 text-sm font-bold text-white"
        >
          변환
        </button>

        {error && (
          <p className="rounded-xl bg-red-50 p-3 text-xs text-red-600 ring-1 ring-red-100">
            {error}
          </p>
        )}
      </div>

      {/* 결과 */}
      {draft && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <label className="col-span-2 block">
              <span className="text-xs font-bold text-neutral-600">코스 이름</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="청라호수공원 한바퀴"
                className="mt-1 block w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="col-span-2 block">
              <span className="text-xs font-bold text-neutral-600">
                지역 <span className="font-normal text-neutral-400">(범례 칩 그룹 · 예: 부천, 인천)</span>
              </span>
              <input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="부천"
                className="mt-1 block w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="col-span-2 block">
              <span className="text-xs font-bold text-neutral-600">설명(선택)</span>
              <input
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="평지 · 야간조명 · 신호 없음"
                className="mt-1 block w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-neutral-600">색</span>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="mt-1 block h-10 w-full rounded-xl border border-neutral-300"
              />
            </label>
            <div className="flex flex-col justify-end">
              <span className="text-xs font-bold text-neutral-600">자동 계산</span>
              <p className="mt-1 rounded-xl bg-neutral-100 px-3 py-2 text-sm tabular-nums text-neutral-700">
                {distanceKm.toFixed(1)}km · {coords.length}점
              </p>
            </div>
          </div>

          {/* 미리보기 지도 */}
          {mapboxConfigured ? (
            <div className="mt-4 h-64 overflow-hidden rounded-2xl ring-1 ring-black/5">
              <CrewMap
                territories={[]}
                courses={[draft]}
                showTerritory={false}
                showCourses
                fitCourses
              />
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
              지도 토큰이 없어 미리보기는 생략돼요(스니펫 출력은 정상).
            </p>
          )}

          {/* 스니펫 */}
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-600">
                lib/courses.ts 의 COURSES 배열에 붙여넣기
              </span>
              <button
                onClick={handleCopy}
                className="rounded-lg bg-neutral-900 px-3 py-1 text-xs font-bold text-white"
              >
                {copied ? "복사됨 ✓" : "복사"}
              </button>
            </div>
            <textarea
              readOnly
              value={snippet}
              rows={8}
              className="mt-1 block w-full rounded-xl border border-neutral-300 bg-neutral-50 p-2 font-mono text-[11px] leading-relaxed"
            />
          </div>
        </>
      )}
    </div>
  );
}
