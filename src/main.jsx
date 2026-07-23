if (import.meta.env.DEV && import.meta.env.VITE_REACT_SCAN === "1") {
  import("react-scan").then(({ scan }) => {
    scan({ enabled: true, trackUnnecessaryRenders: true })
  })
}

if (import.meta.env.DEV && import.meta.env.VITE_REACT_GRAB === "1") {
  import("react-grab")
}

// ⚠️ 최상단 유지 — supabase 클라이언트(detectSessionInUrl)가 OAuth 복귀 해시를 지우기 전에
// 현재 URL 을 동기 스냅샷해야 한다. 아래 import 들보다 먼저 평가되어야 함.
import "./lib/authReturn"

import { StrictMode, Suspense } from "react"
import { createRoot } from "react-dom/client"
import { StatusBar, Style } from "@capacitor/status-bar"
import { SplashScreen } from "@capacitor/splash-screen"
import { Capacitor } from "@capacitor/core"
import "./map-editor-overlays.css"
import "./map-labels.css"
import "./feature-popup-card.css"
import "./feature-edit-sheet.css"
import "./legacy/styles.css"
import "./styles/tokens.css"
import "./styles/tokens-v2.css"
import "./styles/app-shell.css"
import "./styles/start-screen.css"
import "./styles/visuals.css"
import "./styles/maps-v2.css"
import "./styles/map-detail-v2.css"
import "./styles/feature-detail-v2.css"
import "./styles/feature-sheets-v2.css"
import "./styles/record-entry-sheet.css"
import "./styles/public-community.css"
import "./styles/animations.css"
import "./styles/editor-banner-dock.css"
import "./styles/editor-chrome-hard.css"
import "./styles/editor-banner-hard.css"
import "./styles/editor-tray-hard.css"
import "./styles/editor-redesign-fixes.css"
import "./styles/editor-focused.css"
import "./styles/admin.css"
import App from "./App"
// /community-web · /admin 은 lazy (진입 경로가 맞을 때만 청크 로드) — 상세는 lazyRoutes.jsx 주석 참조.
// App 은 기본 경로라 정적 유지.
import { AdminScreen, BootFallback, PublicCommunityPage } from "./lazyRoutes"
import { publicRecommendMaps } from "./data/publicRecommendMaps"
import {
  applyPublicOgMeta,
  getCommunitySearchOgMeta,
  getRecommendMapOgMeta,
  getRecommendSearchOgMeta,
} from "./lib/publicOgMeta"
import { registerServiceWorker } from "./registerServiceWorker"
import { installChunkReloadGuard } from "./lib/chunkReloadGuard"
import { initMonitoring } from "./lib/monitoring"

// 배포 직후 stale 청크 로드 실패 시 캐시 비우고 1회 자동 새로고침 (흰 화면 방지)
installChunkReloadGuard()

// 에러 추적 초기화 (VITE_SENTRY_DSN 있을 때만 활성화, 없으면 no-op)
initMonitoring()

// 네이버 지도 API 키를 환경변수에서 주입 (index.html의 loadNaverMap에서 참조)
if (import.meta.env.VITE_NAVER_MAP_KEY) {
  window.__NAVER_MAP_KEY = import.meta.env.VITE_NAVER_MAP_KEY
}

// 카카오맵 JS 키 주입 (index.html의 loadKakaoMap에서 참조)
if (import.meta.env.VITE_KAKAO_JS_KEY) {
  window.__KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY
}

// 첫 실행 시에만 시드 데이터 주입 — 기존 사용자 데이터는 절대 삭제하지 않음
if (!localStorage.getItem("loca.mobile.maps")) {
  // maps 키 자체가 없으면 완전 첫 실행 → useLocalStorageState가 sampleData seed를 자동 저장
  localStorage.setItem("loca.seed_initialized", "true")
}

registerServiceWorker()

if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: Style.Light }).catch(() => {})
  StatusBar.setBackgroundColor({ color: "#FAF8F2" }).catch(() => {})
  SplashScreen.hide().catch(() => {})
}

const publicPath = window.location.pathname.replace(/\/+$/u, "") || "/"
const recommendMatch = publicPath.match(/^\/recommend\/([^/]+)$/u)
const initialRecommendMap = recommendMatch
  ? publicRecommendMaps.find((map) => map.slug === decodeURIComponent(recommendMatch[1]))
  : null

if (initialRecommendMap) {
  applyPublicOgMeta(getRecommendMapOgMeta(initialRecommendMap))
} else if (publicPath === "/maps/search") {
  applyPublicOgMeta(getRecommendSearchOgMeta(new URLSearchParams(window.location.search).get("q") || ""))
} else if (publicPath === "/community-web") {
  applyPublicOgMeta(getCommunitySearchOgMeta(new URLSearchParams(window.location.search).get("q") || ""))
}

const publicPage = recommendMatch
  ? <PublicCommunityPage page="recommend" recommendSlug={decodeURIComponent(recommendMatch[1])} />
  : publicPath === "/maps/search"
  ? <PublicCommunityPage page="search" />
  : publicPath === "/community-web"
    ? <PublicCommunityPage page="community" />
    : publicPath === "/admin"
      ? <AdminScreen />
      : <App />

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Suspense fallback={<BootFallback />}>
      {publicPage}
    </Suspense>
  </StrictMode>,
)
