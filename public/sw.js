// 서비스워커: 설치 가능 조건 충족 + 오프라인 기본 캐시(앱 셸).
// 정적 export라 서버 없음 → 순수 캐시 전략만 사용.
const CACHE = "running-crew-v1";

// 설치 즉시 활성화
self.addEventListener("install", () => {
  self.skipWaiting();
});

// 오래된 캐시 정리 + 즉시 제어권 확보
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// 네트워크 우선, 실패 시 캐시 폴백(오프라인 대비). GET만 캐시.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  // 외부 도메인(지도 타일 등)은 워커가 건드리지 않고 브라우저에 맡긴다.
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      try {
        const res = await fetch(request);
        if (res.ok) {
          const cache = await caches.open(CACHE);
          cache.put(request, res.clone());
        }
        return res;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw new Error("offline and not cached");
      }
    })()
  );
});
