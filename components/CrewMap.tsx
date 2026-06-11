"use client";

// Mapbox GL JS 지도 — intervals.icu 활동 경로(LineString)를 레이어로 렌더.
// routes 가 바뀌면 단일 GeoJSON 소스를 갱신하고 전체 경로에 맞춰 화면을 맞춘다(fitBounds).
import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { FeatureCollection } from "geojson";
import { crew } from "@/lib/crew";
import { cellPolygon } from "@/lib/territory";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
/** 토큰 설정 여부(페이지 분기용) */
export const mapboxConfigured = Boolean(TOKEN);

export interface Route {
  id: string;
  /** [lng, lat] 순서(GeoJSON) */
  coords: [number, number][];
}

/** 점령된 셀 1칸(소유자 색 포함) — 땅따먹기 fill 레이어용 */
export interface TerritoryCell {
  x: number;
  y: number;
  color: string;
}

const SEOUL: [number, number] = [127.0, 37.55]; // 기본 중심

function toFeatureCollection(routes: Route[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: routes
      .filter((r) => r.coords.length > 1)
      .map((r) => ({
        type: "Feature",
        geometry: { type: "LineString", coordinates: r.coords },
        properties: { id: r.id },
      })),
  };
}

function toCellCollection(cells: TerritoryCell[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: cells.map((c) => ({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [cellPolygon(c.x, c.y)] },
      properties: { color: c.color },
    })),
  };
}

function apply(map: mapboxgl.Map, routes: Route[]) {
  const src = map.getSource("routes") as mapboxgl.GeoJSONSource | undefined;
  if (!src) return;
  src.setData(toFeatureCollection(routes));

  const all = routes.flatMap((r) => r.coords);
  if (all.length === 0) return;
  const bounds = new mapboxgl.LngLatBounds();
  for (const c of all) bounds.extend(c);
  map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 600 });
}

function applyCells(map: mapboxgl.Map, cells: TerritoryCell[], fitIfNoRoute: boolean) {
  const src = map.getSource("territory") as mapboxgl.GeoJSONSource | undefined;
  if (!src) return;
  src.setData(toCellCollection(cells));

  if (!fitIfNoRoute || cells.length === 0) return;
  const bounds = new mapboxgl.LngLatBounds();
  for (const c of cells) for (const p of cellPolygon(c.x, c.y)) bounds.extend(p);
  map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 600 });
}

export default function CrewMap({
  routes,
  cells = [],
}: {
  routes: Route[];
  cells?: TerritoryCell[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const loadedRef = useRef(false);
  // load 콜백이 최신 routes/cells 를 보도록 ref 로 보관(클로저 캡처 회피).
  const routesRef = useRef(routes);
  const cellsRef = useRef(cells);

  // 최초 1회 지도 초기화.
  useEffect(() => {
    if (!containerRef.current || !TOKEN || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: SEOUL,
      zoom: 10,
      attributionControl: true,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      // 점령 셀(fill)을 먼저 깔고 경로(line)를 위에 → 경로가 색칠 위로 보인다.
      map.addSource("territory", { type: "geojson", data: toCellCollection([]) });
      map.addLayer({
        id: "territory-fill",
        type: "fill",
        source: "territory",
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.45 },
      });
      map.addSource("routes", { type: "geojson", data: toFeatureCollection([]) });
      map.addLayer({
        id: "routes-line",
        type: "line",
        source: "routes",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": crew.primary, "line-width": 3.5, "line-opacity": 0.9 },
      });
      loadedRef.current = true;
      applyCells(map, cellsRef.current, routesRef.current.length === 0);
      apply(map, routesRef.current);
    });
    return () => {
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, []);

  // routes 변경 시 갱신(지도 로드 완료 후에만). load 콜백이 읽을 ref 도 여기서 동기화.
  useEffect(() => {
    routesRef.current = routes;
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    apply(map, routes);
  }, [routes]);

  // cells 변경 시 갱신. 경로가 없을 때만 점령 영역으로 화면을 맞춘다(경로 보기와 충돌 방지).
  useEffect(() => {
    cellsRef.current = cells;
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    applyCells(map, cells, routes.length === 0);
  }, [cells, routes.length]);

  // 부모가 크기를 정한다(/map 은 풀스크린 컨테이너에서 inset-0 로 채움).
  return <div ref={containerRef} className="h-full w-full" />;
}
