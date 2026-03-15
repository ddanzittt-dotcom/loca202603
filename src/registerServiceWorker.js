export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("서비스 워커 등록에 실패했어요.", error)
    })
  })
}
