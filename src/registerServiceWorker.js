export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return

  window.addEventListener("load", async () => {
    // Unregister any existing service workers and clear all caches first
    const registrations = await navigator.serviceWorker.getRegistrations()
    for (const registration of registrations) {
      await registration.unregister()
    }
    const cacheNames = await caches.keys()
    for (const name of cacheNames) {
      await caches.delete(name)
    }

    // Register the new minimal SW
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("서비스 워커 등록에 실패했어요.", error)
    })
  })
}
