import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { StatusBar, Style } from "@capacitor/status-bar"
import { SplashScreen } from "@capacitor/splash-screen"
import { Capacitor } from "@capacitor/core"
import "./map-editor-overlays.css"
import "./map-labels.css"
import "./feature-popup-card.css"
import "./legacy/styles.css"
import App from "./App"
import { registerServiceWorker } from "./registerServiceWorker"

// 네이버 지도 API 키를 환경변수에서 주입 (index.html의 loadNaverMap에서 참조)
if (import.meta.env.VITE_NAVER_MAP_KEY) {
  window.__NAVER_MAP_KEY = import.meta.env.VITE_NAVER_MAP_KEY
}

// 첫 실행 시에만 시드 데이터 주입 — 기존 사용자 데이터는 절대 삭제하지 않음
if (!localStorage.getItem("loca.mobile.maps")) {
  // maps 키 자체가 없으면 완전 첫 실행 → useLocalStorageState가 sampleData seed를 자동 저장
  localStorage.setItem("loca.seed_initialized", "true")
}

registerServiceWorker()

if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: Style.Light }).catch(() => {})
  StatusBar.setBackgroundColor({ color: "#4f46e5" }).catch(() => {})
  SplashScreen.hide().catch(() => {})
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
