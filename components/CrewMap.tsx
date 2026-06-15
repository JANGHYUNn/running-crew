"use client";

// Mapbox GL JS 지도 — 땅따먹기 점령 영역을 소유자 색 폴리곤(fill+outline)으로 렌더.
// territories 가 바뀌면 단일 GeoJSON 소스를 갱신하고 전체 영역에 맞춰 화면을 맞춘다(fitBounds).
import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { FeatureCollection } from "geojson";
import type { Poly } from "@/lib/territory";
import type { Course } from "@/lib/courses";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
/** 토큰 설정 여부(페이지 분기용) */
export const mapboxConfigured = Boolean(TOKEN);

/** 한 소유자의 점령 폴리곤(합쳐진 영역, 소유자 색) */
export interface Territory {
  /** GeoJSON Polygon coordinates: [외곽링, 구멍링...] */
  polygon: Poly;
  color: string;
}

const CHEONGNA: [number, number] = [126.6465, 37.5345]; // 기본 중심: 인천 청라국제도시

function toFeatureCollection(territories: Territory[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: territories.map((t) => ({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: t.polygon },
      properties: { color: t.color },
    })),
  };
}

function coursesToFeatureCollection(courses: Course[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: courses.map((c) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: c.coords },
      properties: { id: c.id, color: c.color, name: c.name, distance: c.distance },
    })),
  };
}

/** 레이어 그룹 표시/숨김 토글(레이어가 아직 없으면 무시) */
function setVisible(map: mapboxgl.Map, ids: string[], show: boolean) {
  for (const id of ids) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", show ? "visible" : "none");
    }
  }
}

const TERRITORY_LAYERS = ["territory-fill", "territory-line"];
// courses-hit: 라인 탭을 쉽게 받기 위한 투명 굵은 선(맨 위).
const COURSE_LAYERS = [
  "courses-casing",
  "courses-line",
  "courses-highlight-casing",
  "courses-highlight",
  "courses-label",
  "courses-hit",
];
const NO_MATCH = "__none__";

/** 선택된 코스만 강조(굵은 흰 테두리+선명), 나머지는 흐릿하게. id 가 null 이면 전체 평상. */
function applyHighlight(map: mapboxgl.Map, highlightId: string | null) {
  if (!map.getLayer("courses-highlight")) return;
  const id = highlightId ?? NO_MATCH;
  const on = Boolean(highlightId);
  map.setFilter("courses-highlight", ["==", ["get", "id"], id]);
  map.setFilter("courses-highlight-casing", ["==", ["get", "id"], id]);
  map.setPaintProperty(
    "courses-line",
    "line-opacity",
    on ? ["case", ["==", ["get", "id"], id], 0.95, 0.18] : 0.9
  );
  map.setPaintProperty("courses-casing", "line-opacity", on ? 0.1 : 0.35);
  map.setPaintProperty(
    "courses-label",
    "text-opacity",
    on ? ["case", ["==", ["get", "id"], id], 1, 0.25] : 1
  );
}

/** 구글맵에서 해당 좌표를 핀으로 새 탭에 연다(항상 동작 · 스트리트뷰는 거기서 전환). */
function openGoogleMaps(lng: number, lat: number) {
  const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
}

/** 코스 출발점마다 클릭 가능한 핀(🏃) 마커 렌더. 클릭 시 그 지점 구글맵.
 *  기존 마커는 모두 제거 후 다시 만든다(소스 갱신/토글 시 호출). */
function renderCourseMarkers(
  map: mapboxgl.Map,
  courses: Course[],
  show: boolean,
  existing: mapboxgl.Marker[]
): mapboxgl.Marker[] {
  for (const m of existing) m.remove();
  if (!show) return [];
  const markers: mapboxgl.Marker[] = [];
  for (const c of courses) {
    const start = c.coords[0];
    if (!start) continue;
    const el = document.createElement("button");
    el.type = "button";
    el.className = "course-pin";
    el.textContent = "🏃";
    el.title = `${c.name} · 구글맵에서 열기`;
    el.setAttribute("aria-label", `${c.name} 구글맵에서 열기`);
    el.style.setProperty("--pin-color", c.color);
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      openGoogleMaps(start[0], start[1]);
    });
    markers.push(
      new mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat(start).addTo(map)
    );
  }
  return markers;
}

function apply(map: mapboxgl.Map, territories: Territory[]) {
  const src = map.getSource("territory") as mapboxgl.GeoJSONSource | undefined;
  if (!src) return;
  src.setData(toFeatureCollection(territories));

  const bounds = new mapboxgl.LngLatBounds();
  let any = false;
  for (const t of territories) {
    for (const ring of t.polygon) {
      for (const p of ring) {
        bounds.extend(p as [number, number]);
        any = true;
      }
    }
  }
  if (any) map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 600 });
}

/** 코스 좌표 전체에 화면을 맞춘다(땅 없이 코스만 미리볼 때). */
function fitToCourses(map: mapboxgl.Map, courses: Course[]) {
  const bounds = new mapboxgl.LngLatBounds();
  let any = false;
  for (const c of courses) {
    for (const p of c.coords) {
      bounds.extend(p);
      any = true;
    }
  }
  if (any) map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 600 });
}

export default function CrewMap({
  territories,
  courses = [],
  showTerritory = true,
  showCourses = true,
  fitCourses = false,
  highlightedCourseId = null,
}: {
  territories: Territory[];
  courses?: Course[];
  showTerritory?: boolean;
  showCourses?: boolean;
  /** territory 대신 코스 좌표에 화면을 맞춤(코스 미리보기용). */
  fitCourses?: boolean;
  /** 이 id 의 코스만 강조하고 나머지는 흐릿하게(겹치는 경로 구분용). */
  highlightedCourseId?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const loadedRef = useRef(false);
  // load 콜백이 최신 값을 보도록 ref 로 보관(클로저 캡처 회피).
  const dataRef = useRef(territories);
  const coursesRef = useRef(courses);
  const showTerritoryRef = useRef(showTerritory);
  const showCoursesRef = useRef(showCourses);
  const highlightRef = useRef(highlightedCourseId);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  // 최초 1회 지도 초기화.
  useEffect(() => {
    if (!containerRef.current || !TOKEN || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: CHEONGNA,
      zoom: 11,
      attributionControl: true,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map.setLanguage("ko"); // 지도 라벨(지역명 등) 한글화
      map.addSource("territory", { type: "geojson", data: toFeatureCollection([]) });
      map.addLayer({
        id: "territory-fill",
        type: "fill",
        source: "territory",
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.4 },
      });
      map.addLayer({
        id: "territory-line",
        type: "line",
        source: "territory",
        layout: { "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 1.5, "line-opacity": 0.9 },
      });

      // 러닝 추천 경로(라인). 어두운 캐싱선 위에 밝은 색 라인 + 코스명 라벨.
      map.addSource("courses", {
        type: "geojson",
        data: coursesToFeatureCollection(coursesRef.current),
      });
      map.addLayer({
        id: "courses-casing",
        type: "line",
        source: "courses",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#000000", "line-width": 6, "line-opacity": 0.35 },
      });
      map.addLayer({
        id: "courses-line",
        type: "line",
        source: "courses",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 3.5 },
      });
      // 강조 레이어(선택 코스만). 흰 테두리 + 색 선이 맨 앞으로 떠 겹쳐도 구분됨.
      map.addLayer({
        id: "courses-highlight-casing",
        type: "line",
        source: "courses",
        filter: ["==", ["get", "id"], NO_MATCH],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.95 },
      });
      map.addLayer({
        id: "courses-highlight",
        type: "line",
        source: "courses",
        filter: ["==", ["get", "id"], NO_MATCH],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 5, "line-opacity": 1 },
      });
      map.addLayer({
        id: "courses-label",
        type: "symbol",
        source: "courses",
        layout: {
          "symbol-placement": "line-center",
          "text-field": [
            "concat",
            ["get", "name"],
            "  ",
            ["to-string", ["get", "distance"]],
            "km",
          ],
          "text-size": 12,
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#000000",
          "text-halo-width": 1.4,
        },
      });
      // 투명 굵은 선 — 라인 탭 영역 확대(모바일). 클릭 시 그 지점 스트리트뷰.
      map.addLayer({
        id: "courses-hit",
        type: "line",
        source: "courses",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#000000", "line-width": 22, "line-opacity": 0 },
      });
      map.on("click", "courses-hit", (e) => openGoogleMaps(e.lngLat.lng, e.lngLat.lat));
      map.on("mouseenter", "courses-hit", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "courses-hit", () => {
        map.getCanvas().style.cursor = "";
      });

      // 초기 표시 상태 반영.
      setVisible(map, TERRITORY_LAYERS, showTerritoryRef.current);
      setVisible(map, COURSE_LAYERS, showCoursesRef.current);
      markersRef.current = renderCourseMarkers(
        map,
        coursesRef.current,
        showCoursesRef.current,
        markersRef.current
      );
      applyHighlight(map, highlightRef.current);

      loadedRef.current = true;
      apply(map, dataRef.current);
      if (fitCourses) fitToCourses(map, coursesRef.current);
    });
    return () => {
      for (const m of markersRef.current) m.remove();
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, []);

  // territories 변경 시 갱신(지도 로드 완료 후에만).
  useEffect(() => {
    dataRef.current = territories;
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    apply(map, territories);
  }, [territories]);

  // courses 변경 시 소스 갱신.
  useEffect(() => {
    coursesRef.current = courses;
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const src = map.getSource("courses") as mapboxgl.GeoJSONSource | undefined;
    src?.setData(coursesToFeatureCollection(courses));
    markersRef.current = renderCourseMarkers(
      map,
      courses,
      showCoursesRef.current,
      markersRef.current
    );
    if (fitCourses) fitToCourses(map, courses);
  }, [courses, fitCourses]);

  // 레이어 표시 토글.
  useEffect(() => {
    showTerritoryRef.current = showTerritory;
    showCoursesRef.current = showCourses;
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    setVisible(map, TERRITORY_LAYERS, showTerritory);
    setVisible(map, COURSE_LAYERS, showCourses);
    markersRef.current = renderCourseMarkers(
      map,
      coursesRef.current,
      showCourses,
      markersRef.current
    );
  }, [showTerritory, showCourses]);

  // 강조 코스 변경 → 강조 적용 + 그 코스로 지도 이동.
  useEffect(() => {
    highlightRef.current = highlightedCourseId;
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    applyHighlight(map, highlightedCourseId);
    if (highlightedCourseId) {
      const c = coursesRef.current.find((x) => x.id === highlightedCourseId);
      if (c) fitToCourses(map, [c]);
    }
  }, [highlightedCourseId]);

  // 부모가 크기를 정한다(/map 은 풀스크린 컨테이너에서 inset-0 로 채움).
  return <div ref={containerRef} className="h-full w-full" />;
}
