import { StrictMode } from "react"
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
import "./styles/home-v2.css"
import "./styles/maps-v2.css"
import "./styles/explore-v2.css"
import "./styles/profile-v2.css"
import "./styles/map-detail-v2.css"
import "./styles/feature-detail-v2.css"
import "./styles/feature-sheets-v2.css"
import "./styles/record-entry-sheet.css"
import "./styles/public-community.css"
import "./styles/admin-moderation.css"
import "./styles/animations.css"
import App from "./App"
import { PublicCommunityPage } from "./screens/PublicCommunityPage"
import { AdminCommunityModerationScreen } from "./screens/AdminCommunityModerationScreen"
import { publicRecommendMaps } from "./data/publicRecommendMaps"
import {
  applyPublicOgMeta,
  getCommunitySearchOgMeta,
  getRecommendMapOgMeta,
  getRecommendSearchOgMeta,
} from "./lib/publicOgMeta"
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
    : publicPath === "/admin/community-moderation"
      ? <AdminCommunityModerationScreen />
      : <App />

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {publicPage}
  </StrictMode>,
)
