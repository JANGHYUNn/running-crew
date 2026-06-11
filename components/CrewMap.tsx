"use client";

// Mapbox GL JS 지도 — 땅따먹기 점령 영역을 소유자 색 폴리곤(fill+outline)으로 렌더.
// territories 가 바뀌면 단일 GeoJSON 소스를 갱신하고 전체 영역에 맞춰 화면을 맞춘다(fitBounds).
import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { FeatureCollection } from "geojson";
import type { Poly } from "@/lib/territory";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
/** 토큰 설정 여부(페이지 분기용) */
export const mapboxConfigured = Boolean(TOKEN);

/** 한 소유자의 점령 폴리곤(합쳐진 영역, 소유자 색) */
export interface Territory {
  /** GeoJSON Polygon coordinates: [외곽링, 구멍링...] */
  polygon: Poly;
  color: string;
}

const SEOUL: [number, number] = [127.0, 37.55]; // 기본 중심

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
  if (any) map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 600 });
}

export default function CrewMap({ territories }: { territories: Territory[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const loadedRef = useRef(false);
  // load 콜백이 최신 territories 를 보도록 ref 로 보관(클로저 캡처 회피).
  const dataRef = useRef(territories);

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
      loadedRef.current = true;
      apply(map, dataRef.current);
    });
    return () => {
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

  // 부모가 크기를 정한다(/map 은 풀스크린 컨테이너에서 inset-0 로 채움).
  return <div ref={containerRef} className="h-full w-full" />;
}
