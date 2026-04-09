// LOCA Service Worker — network-first, 오프라인 fallback
const CACHE_VERSION = "loca-v1"

self.addEventListener("install", () => self.skipWaiting())

self.addEventListener("activate", (event) => {
  // 이전 버전 캐시만 정리 (현재 버전은 유지)
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_VERSION)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event

  // API, Supabase, 외부 CDN, 네이버 지도 등은 캐시하지 않음
  if (
    request.url.includes("/api/") ||
    request.url.includes("supabase") ||
    !request.url.startsWith(self.location.origin)
  ) return

  // navigation (HTML) — network-first, 오프라인 시 캐시 fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone()
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone))
          return response
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
    )
    return
  }

  // 정적 에셋 (JS, CSS, 이미지) — stale-while-revalidate
  if (request.destination === "script" || request.destination === "style" || request.destination === "image") {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request).then((response) => {
          const clone = response.clone()
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone))
          return response
        }).catch(() => cached)

        return cached || networkFetch
      })
    )
    return
  }

  // 그 외 — 네트워크 통과
})
