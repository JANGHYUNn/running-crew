"use client";

// Mapbox GL JS 지도 — intervals.icu 활동 경로(LineString)를 레이어로 렌더.
// routes 가 바뀌면 단일 GeoJSON 소스를 갱신하고 전체 경로에 맞춰 화면을 맞춘다(fitBounds).
import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { FeatureCollection } from "geojson";
import { crew } from "@/lib/crew";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
/** 토큰 설정 여부(페이지 분기용) */
export const mapboxConfigured = Boolean(TOKEN);

export interface Route {
  id: string;
  /** [lng, lat] 순서(GeoJSON) */
  coords: [number, number][];
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

export default function CrewMap({ routes }: { routes: Route[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const loadedRef = useRef(false);
  // load 콜백이 최신 routes 를 보도록 ref 로 보관(클로저 캡처 회피).
  const routesRef = useRef(routes);

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
      map.addSource("routes", { type: "geojson", data: toFeatureCollection([]) });
      map.addLayer({
        id: "routes-line",
        type: "line",
        source: "routes",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": crew.primary, "line-width": 3.5, "line-opacity": 0.9 },
      });
      loadedRef.current = true;
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

  return <div ref={containerRef} className="h-[60vh] w-full overflow-hidden rounded-2xl" />;
}
