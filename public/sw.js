// Minimal service worker — no precaching to avoid stale builds
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((name) => caches.delete(name)))
    ).then(() => self.clients.claim())
  )
})
self.addEventListener("fetch", (event) => {
  // Network-first for navigation, passthrough for everything else
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("index.html"))
    )
  }
})
