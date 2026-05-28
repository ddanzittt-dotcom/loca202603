import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LogIn, X } from "lucide-react"
import { Toast } from "./components/ui"
import { BottomNavV2 } from "./components/BottomNav.v2"
import { NotificationPanel, NotificationBanner } from "./components/NotificationPanel"
import { useNotifications } from "./hooks/useNotifications"
import {
  collections,
  communityMapFeaturesSeed,
  communityPostsSeed,
  demoFeatures,
  demoMaps,
  featuresSeed,
  mapsSeed,
  me,
  sharesSeed,
  users,
} from "./data/sampleData"
import { useLocalStorageState, useOnlineStatus, useToast, setStorageWarningCallback } from "./hooks/useAppState"
import {
  buildCommunityPosts,
  buildMapRoutePath,
  buildMapSharePath,
  buildMapShareUrl,
  buildOwnPosts,
  buildSlugShareUrl,
  parseAppLocation,
  parseMapImportTarget,
  parseMapSharePayload,
  placeEmojis,
  themePalette,
} from "./lib/appUtils"
import { hasSupabaseEnv, supabase } from "./lib/supabase"
import { logEvent } from "./lib/analytics"
import { ensureCommunityMap, getCommunityMapBundle, getMapBundle, getPublishedMapBySlug, respondCollaborationInvite, saveMap as saveMapRecord } from "./lib/mapService"
import { listFeatureChangeRequests } from "./lib/mapService.read"
import { createFeature as createFeatureRecord, createMap as createMapRecord } from "./lib/mapService.write"
import { createId } from "./lib/appUtils"
import { add as addNotification, NOTI_TYPES } from "./lib/notificationStore"
// 라우트별 코드 스플리팅 - 라이트웹(/s/:slug)은 SharedMapViewer 청크만 로딩
const WelcomeScreen = lazy(() => import("./screens/WelcomeScreen").then((m) => ({ default: m.WelcomeScreen })))
const AuthScreen = lazy(() => import("./screens/AuthScreen").then((m) => ({ default: m.AuthScreen })))
const HomeScreen = lazy(() => import("./screens/HomeScreen").then((m) => ({ default: m.HomeScreen })))
const ExploreScreen = lazy(() => import("./screens/ExploreScreen").then((m) => ({ default: m.ExploreScreen })))
const MapEditorScreen = lazy(() => import("./screens/MapEditorScreen").then((m) => ({ default: m.MapEditorScreen })))
const MyArchiveScreen = lazy(() => import("./screens/MyArchiveScreen").then((m) => ({ default: m.MyArchiveScreen })))
const ProfileScreen = lazy(() => import("./screens/ProfileScreen").then((m) => ({ default: m.ProfileScreen })))
const SharedMapViewer = lazy(() => import("./screens/SharedMapViewer").then((m) => ({ default: m.SharedMapViewer })))
import { useFeaturePool } from "./hooks/useFeaturePool"
import { useMediaHandlers } from "./hooks/useMediaHandlers"
import { useFeatureEditing } from "./hooks/useFeatureEditing"
import { useMapCRUD } from "./hooks/useMapCRUD"
import { useAppSession } from "./hooks/useAppSession"
// 레벨/XP 시스템 폐기 (2026-05). useGamification 훅은 호출하지 않으며,
// recordMapAction 호출은 useMapCRUD / useFeatureEditing 에서 stub 함수로 처리.
import { useGeolocation } from "./hooks/useGeolocation"
import { useSocialProfile } from "./hooks/useSocialProfile"
import { cleanupOrphanedMedia } from "./lib/mediaStore"
import { FeatureDetailSheet } from "./components/sheets/FeatureDetailSheet"
import { FeatureEditSheet } from "./components/sheets/FeatureEditSheet"
import { ImportTargetMapSheet } from "./components/sheets/ImportTargetMapSheet"
import { MapFormSheet } from "./components/sheets/MapFormSheet"
import { AddRecordSheet } from "./components/sheets/AddRecordSheet"
import { PublishSheet } from "./components/sheets/PublishSheet"
import { UserProfileSheet } from "./components/sheets/UserProfileSheet"
import { PostDetailSheet } from "./components/sheets/PostDetailSheet"
import { SharePlaceSheet } from "./components/sheets/SharePlaceSheet"
import { ProfilePlacementConfirmSheet } from "./components/sheets/ProfilePlacementConfirmSheet"
import { CollaboratorsSheet } from "./components/sheets/CollaboratorsSheet"
import { resolveEventAccess } from "./lib/eventAccess"
import { findPlacementForMap, isEventMap, resetLegacyProfileCuration } from "./lib/mapPlacement"
import { isCoachmarkSeen, markCoachmarkSeen, resetCoachmark, isFirstPinCelebrated, markFirstPinCelebrated } from "./lib/onboarding"
import { CoachMark } from "./components/CoachMark"
import { mergeFeatureListWithLocalMedia } from "./lib/featureMediaMerge"
import { getPendingFeatureMediaSyncKeys, syncFeatureListLocalMediaToCloud } from "./lib/mediaCloudSync"
const MapShareEditor = lazy(() => import("./screens/MapShareEditor").then((m) => ({ default: m.MapShareEditor })))
const ImportMapSheet = lazy(() => import("./components/sheets/ImportMapSheet").then((m) => ({ default: m.ImportMapSheet })))
import "./shared-viewer.css"
import "./map-share-editor.css"

const STARTUP_AUTO_DISMISS_MS = 2600

function ScreenFallback() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", color: "#999" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🗺️</div>
        <span style={{ fontSize: 14 }}>로딩 중...</span>
      </div>
    </div>
  )
}

function AppRecoveryScreen({
  title = "화면을 다시 불러올게요",
  message = "탭 이동 중 화면 상태가 엉켰어요. 아래 버튼으로 바로 복구할 수 있어요.",
  actionLabel = "다시 불러오기",
  onRetry,
}) {
  return (
    <section className="app-recovery-screen" role="alert">
      <div className="app-recovery-screen__mark" aria-hidden="true">LOCA</div>
      <strong>{title}</strong>
      <p>{message}</p>
      <button type="button" onClick={onRetry}>
        {actionLabel}
      </button>
    </section>
  )
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error("LOCA 화면 렌더링 오류", error)
  }

  render() {
    if (this.state.error) {
      return <AppRecoveryScreen onRetry={() => window.location.reload()} />
    }
    return this.props.children
  }
}

function AuthPromptBanner({ onLogin, onDismiss }) {
  return (
    <aside className="auth-prompt-banner" aria-label="로그인 안내">
      <div className="auth-prompt-banner__copy">
        <strong>로그인이 필요한 기능이에요</strong>
        <span>내 지도와 프로필은 로그인 후 사용할 수 있어요.</span>
      </div>
      <div className="auth-prompt-banner__actions">
        <button className="auth-prompt-banner__primary" type="button" onClick={onLogin}>
          <LogIn size={16} strokeWidth={2.2} />
          로그인
        </button>
        <button className="auth-prompt-banner__ghost" type="button" onClick={onDismiss}>
          나중에
        </button>
      </div>
    </aside>
  )
}

function AuthPromptSheet({ children, onClose }) {
  return (
    <div className="auth-sheet-backdrop" role="presentation">
      <section className="auth-sheet-panel" role="dialog" aria-modal="true" aria-label="로그인">
        <button className="auth-sheet-close" type="button" onClick={onClose} aria-label="로그인 닫기">
          <X size={19} strokeWidth={2.2} />
        </button>
        {children}
      </section>
    </div>
  )
}

const resolveStoredMapTarget = (mapId, maps) => {
  if (!mapId) return null
  if (mapId === "community-map") return { source: "community", mapId }
  if (demoMaps.some((map) => map.id === mapId)) return { source: "demo", mapId }
  if (maps.some((map) => map.id === mapId)) return { source: "local", mapId }
  return null
}

const isUuidLike = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(`${value || ""}`)

const toFiniteNumber = (value) => {
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

function formatEventFeatureDate(dateStr) {
  if (!dateStr || `${dateStr}`.length !== 8) return ""
  return `${Number(`${dateStr}`.slice(4, 6))}.${Number(`${dateStr}`.slice(6, 8))}`
}

function buildEventFeatureDraft(event, mapId) {
  const lat = toFiniteNumber(event?.lat)
  const lng = toFiniteNumber(event?.lng)
  if (lat === null || lng === null) return null
  const title = `${event?.title || "행사"}`.trim() || "행사"
  const startDate = event?.startDate || event?.eventStartDate || ""
  const endDate = event?.endDate || event?.eventEndDate || ""
  const period = startDate ? `${formatEventFeatureDate(startDate)}${endDate ? ` ~ ${formatEventFeatureDate(endDate)}` : ""}` : ""
  const address = [event?.addr, event?.addrDetail].filter(Boolean).join(" ").trim()
  const place = event?.eventPlace || event?.place || ""
  const noteLines = [
    period ? `기간: ${period}` : "",
    place ? `장소: ${place}` : "",
    address ? `주소: ${address}` : "",
    event?.tel ? `연락처: ${event.tel}` : "",
    event?.overview ? `${event.overview}`.slice(0, 500) : "",
  ].filter(Boolean)

  return {
    id: createId("feat"),
    mapId,
    type: "pin",
    title,
    emoji: "🎪",
    tags: ["행사"].concat(period ? [period] : []),
    note: noteLines.join("\n"),
    highlight: true,
    lat,
    lng,
    sortOrder: 0,
    memos: [],
    photos: [],
    voices: [],
    address,
    category: "event",
    sourceProvider: "tourapi",
    sourceEventId: event?.id ? `tourapi:${event.id}` : `tourapi:${title}:${lat}:${lng}`,
    sourceUrl: event?.homepage || "",
    image: event?.image || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export default function App() {
  const [maps, setMaps] = useLocalStorageState("loca.mobile.maps", mapsSeed)
  const [features, setFeatures] = useLocalStorageState("loca.mobile.features", featuresSeed)
  const [shares, setShares] = useLocalStorageState("loca.mobile.shares", sharesSeed)
  const [followed, setFollowed] = useLocalStorageState("loca.mobile.followed", [])
  const [communityPosts, setCommunityPosts] = useLocalStorageState("loca.mobile.communityPosts", communityPostsSeed)
  const [likedPosts, setLikedPosts] = useLocalStorageState("loca.mobile.likedPosts", [])
  const [communityMapFeatures, setCommunityMapFeatures] = useState(communityMapFeaturesSeed)
  const [communityMapId, setCommunityMapId] = useState("community-map")
  const [viewerProfile, setViewerProfile] = useLocalStorageState("loca.mobile.viewerProfile", me)

  const routeAtLoad = useMemo(() => {
    try {
      return parseAppLocation(window.location)
    } catch (error) {
      console.error("공유 링크를 해석하지 못했어요.", error)
      return { type: "invalid-shared" }
    }
  }, [])
  const initialStoredTarget = routeAtLoad?.type === "map" ? resolveStoredMapTarget(routeAtLoad.mapId, maps) : null
  const initialSharedMapData = routeAtLoad?.type === "shared" ? routeAtLoad.payload : null
  const [sharedMapData, setSharedMapData] = useState(initialSharedMapData)
  const [pendingSharePlace, setPendingSharePlace] = useState(routeAtLoad?.type === "share-target" ? routeAtLoad.place : null)
  const [activeTab, setActiveTab] = useState(initialSharedMapData || initialStoredTarget ? "maps" : "home")
  const [exploreSearchRequestId, setExploreSearchRequestId] = useState(0)
  const [mapsView, setMapsView] = useState(initialSharedMapData || initialStoredTarget ? "editor" : "list")
  const [activeMapId, setActiveMapId] = useState(initialSharedMapData?.map.id ?? initialStoredTarget?.mapId ?? maps[0]?.id ?? null)
  const [activeMapSource, setActiveMapSource] = useState(initialSharedMapData ? "shared" : initialStoredTarget?.source ?? "local")
  const [selectedFeatureId, setSelectedFeatureId] = useState(null)
  const [selectedFeatureSummaryId, setSelectedFeatureSummaryId] = useState(null)
  const [editorMode, setEditorMode] = useState("browse")
  const [showMapLabels, setShowMapLabels] = useState(true)
  const [draftPoints, setDraftPoints] = useState([])
  const [fitTrigger, setFitTrigger] = useState(1)
  const [focusPoint, setFocusPoint] = useState(null)
  const [mapSheet, setMapSheet] = useState(null)
  const [collaboratorsSheet, setCollaboratorsSheet] = useState(null)
  const [featureSheet, setFeatureSheet] = useState(null)
  const [inlineRecordFeatureId, setInlineRecordFeatureId] = useState(null)
  const [featureSheetMode, setFeatureSheetMode] = useState("detail")
  // 모두의 지도 → 내 지도 가져오기 타겟 선택 시트
  const [importTargetSheet, setImportTargetSheet] = useState(null) // { featureId } | { externalEvent } | null
  const [importTargetBusy, setImportTargetBusy] = useState(false)
  const [publishSheet, setPublishSheet] = useState(null)
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [selectedUserProfile, setSelectedUserProfile] = useState(null)
  const [selectedPostRef, setSelectedPostRef] = useState(null)
  const [memoText, setMemoText] = useState("")
  const [shareEditorImage, setShareEditorImage] = useState(null)
  const [importSheetOpen, setImportSheetOpen] = useState(false)
  const [recordSheetOpen, setRecordSheetOpen] = useState(false)
  const [recordSheetInitialView, setRecordSheetInitialView] = useState("target")
  const [recordTargetMapId, setRecordTargetMapId] = useState(null)
  const [pendingRecordAfterMapCreate, setPendingRecordAfterMapCreate] = useState(false)
  // 프로필 공개/내리기 공통 confirm 시트 상태
  const [profilePlacementSheet, setProfilePlacementSheet] = useState(null) // { mode: 'add'|'remove'|'removeForUnpublish', mapId, onSuccess? }
  const [profilePlacementSubmitting, setProfilePlacementSubmitting] = useState(false)
  // characterStyle 폐기 (2026-05) — 레벨/XP 위젯 제거에 따라 캐릭터 마커도 제거.
  const [publishSubmitting, setPublishSubmitting] = useState(false)
  const [savingPostMapId, setSavingPostMapId] = useState(null)
  const [savingSharedMap, setSavingSharedMap] = useState(false)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [startupDismissed, setStartupDismissed] = useState(() => Boolean(initialSharedMapData || initialStoredTarget || routeAtLoad?.type))
  const [welcomeIntent, setWelcomeIntent] = useState(null)
  const [authPromptVisible, setAuthPromptVisible] = useState(false)
  const [authSheetOpen, setAuthSheetOpen] = useState(false)
  const [coachmarkStep, setCoachmarkStep] = useState(0) // 0=off, 1~3=active step
  const [firstPinHintVisible, setFirstPinHintVisible] = useState(false)
  const [communityPendingRequests, setCommunityPendingRequests] = useState([])
  const [collaborationInvites, setCollaborationInvites] = useState([])
  const [storedCloudUserId] = useState(() => {
    try { return window.localStorage?.getItem("loca.mobile.cloudUserId") || "" } catch { return "" }
  })

  const isOnline = useOnlineStatus()
  const toast = useToast()
  const showToast = toast.show

  useEffect(() => {
    try {
      window.localStorage?.removeItem("loca.mobile.communityMapFeatures")
    } catch {
      // Ignore storage cleanup failures.
    }
  }, [])

  useEffect(() => {
    const handlePreloadError = (event) => {
      event.preventDefault()
      window.location.reload()
    }
    window.addEventListener("vite:preloadError", handlePreloadError)
    return () => window.removeEventListener("vite:preloadError", handlePreloadError)
  }, [])

  useEffect(() => { setStorageWarningCallback(showToast) }, [showToast])
  useEffect(() => {
    const isEditableElement = (el) => {
      if (!(el instanceof HTMLElement)) return false
      const tag = el.tagName
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable
    }

    const detectKeyboard = () => {
      const compactScreen = window.innerWidth <= 900
      const focusedInput = isEditableElement(document.activeElement)
      const vv = window.visualViewport
      const viewportShrunk = Boolean(vv && vv.height < window.innerHeight * 0.82)
      setKeyboardVisible(compactScreen && (focusedInput || viewportShrunk))
    }

    const handleFocusChange = () => window.setTimeout(detectKeyboard, 30)
    detectKeyboard()
    document.addEventListener("focusin", handleFocusChange)
    document.addEventListener("focusout", handleFocusChange)
    window.addEventListener("resize", detectKeyboard)
    window.visualViewport?.addEventListener("resize", detectKeyboard)
    return () => {
      document.removeEventListener("focusin", handleFocusChange)
      document.removeEventListener("focusout", handleFocusChange)
      window.removeEventListener("resize", detectKeyboard)
      window.visualViewport?.removeEventListener("resize", detectKeyboard)
    }
  }, [])

  useEffect(() => {
    cleanupOrphanedMedia([...features, ...communityMapFeatures])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // --- 온보딩: 편집기 코치마크 트리거 ---
  useEffect(() => {
    if (mapsView === "editor" && activeTab === "maps" && !isCoachmarkSeen()) {
      setCoachmarkStep(1)
    }
  }, [mapsView, activeTab])

  // 코치마크 3: FeatureDetailSheet 처음 열릴 때 (코치마크 진행 중이었으면)
  useEffect(() => {
    if (featureSheet && !isCoachmarkSeen() && coachmarkStep === 0) {
      // 코치마크 2가 끝나고(step=0) 아직 seen 안 됐으면 step 3
      setCoachmarkStep(3)
    }
  }, [featureSheet, coachmarkStep])

  // --- 온보딩: 첫 핀 저장 축하 ---
  const prevPinCountRef = useRef(features.filter((f) => f.type === "pin").length)
  useEffect(() => {
    const pinCount = features.filter((f) => f.type === "pin").length
    if (pinCount > prevPinCountRef.current && !isFirstPinCelebrated()) {
      markFirstPinCelebrated()
      showToast("첫 장소를 기록했어요")
      // 토스트 후 힌트 카드 표시
      const timer = setTimeout(() => setFirstPinHintVisible(true), 2500)
      return () => clearTimeout(timer)
    }
    prevPinCountRef.current = pinCount
  }, [features, showToast])

  // --- Session / Auth ---

  const {
    authReady, authUser, cloudMode, cloudLoading, cloudDataReady, cloudLoadedUserId,
    hasB2BAccess, setHasB2BAccess,
    readLocalImportData,
    reloadCloudData, handleSignOut, importLocalDataToCloud,
  } = useAppSession({
    setMaps, setFeatures, setShares, setFollowed, setViewerProfile,
    setCollaborationInvites,
    setActiveTab, setMapsView, setActiveMapSource, setActiveMapId,
    setSelectedFeatureId, setSelectedFeatureSummaryId,
    setFeatureSheet, setEditorMode, setDraftPoints,
    setMapSheet, setPublishSheet, setSelectedUserId, setSelectedPostRef,
    setSharedMapData, setShareEditorImage,
    showToast, routeAtLoad,
  })

  const needsAuthForPersonalArea = hasSupabaseEnv && authReady && !authUser
  const hasStoredPersonalCacheForUser = Boolean(authUser?.id && storedCloudUserId === authUser.id)
  const isFirstCloudLoadForUser = cloudLoading && !cloudDataReady && cloudLoadedUserId !== authUser?.id && !hasStoredPersonalCacheForUser
  const requiresAuthForCurrentTab =
    activeTab === "profile" ||
    (activeTab === "maps" && (mapsView === "list" || activeMapSource === "local"))
  const showPersonalGate = needsAuthForPersonalArea && requiresAuthForCurrentTab
  const showPersonalLoading = hasSupabaseEnv && (!authReady || isFirstCloudLoadForUser) && requiresAuthForCurrentTab
  const showStartup = !sharedMapData && !startupDismissed

  const openAuthSheet = useCallback(() => {
    setAuthPromptVisible(true)
    setAuthSheetOpen(true)
  }, [])

  const closeAuthPrompt = useCallback(() => {
    setAuthPromptVisible(false)
    setAuthSheetOpen(false)
  }, [])

  const requestLoginBanner = useCallback(() => {
    setAuthPromptVisible(true)
    setAuthSheetOpen(false)
  }, [])

  const handleAuthSuccess = useCallback((mode) => {
    showToast(mode === "signup" ? "회원가입이 완료되었어요." : "로그인했어요.")
    setStartupDismissed(true)
    closeAuthPrompt()
  }, [closeAuthPrompt, showToast])

  useEffect(() => {
    if (startupDismissed || sharedMapData) return undefined
    if (hasSupabaseEnv && !authReady) return undefined
    if (hasSupabaseEnv && !authUser) return undefined

    const timer = window.setTimeout(() => setStartupDismissed(true), STARTUP_AUTO_DISMISS_MS)
    return () => window.clearTimeout(timer)
  }, [authReady, authUser, sharedMapData, startupDismissed])

  useEffect(() => {
    if (!authUser) return
    setAuthPromptVisible(false)
    setAuthSheetOpen(false)
  }, [authUser])

  useEffect(() => {
    if (!showPersonalGate || showStartup) return
    setAuthPromptVisible(true)
    setAuthSheetOpen(false)
    if (activeTab !== "home") setActiveTab("home")
    if (mapsView !== "list") setMapsView("list")
    if (activeMapSource !== "local") setActiveMapSource("local")
  }, [activeMapSource, activeTab, mapsView, showPersonalGate, showStartup])

  const openExploreTab = useCallback(() => {
    setActiveTab("explore")
  }, [])

  const openExploreSearch = useCallback(() => {
    setActiveTab("explore")
    setExploreSearchRequestId((current) => current + 1)
  }, [])

  const openCreateMapSheet = useCallback(() => {
    if (needsAuthForPersonalArea) {
      requestLoginBanner()
      return
    }
    setActiveTab("maps")
    setMapsView("list")
    setMapSheet({ mode: "create", id: null, title: "", description: "", theme: themePalette[0] })
  }, [needsAuthForPersonalArea, requestLoginBanner])

  const handleWelcomeBrowse = useCallback(() => {
    setStartupDismissed(true)
    setWelcomeIntent(null)
    setActiveTab("home")
  }, [])

  const handleWelcomeAddFirstPlace = useCallback(() => {
    setStartupDismissed(true)
    setWelcomeIntent("first-place")
    setActiveTab("maps")
    setMapsView("list")
    setActiveMapSource("local")
  }, [])

  useEffect(() => {
    if (welcomeIntent !== "first-place") return
    if (!authReady) return
    if (hasSupabaseEnv && !authUser) return
    openCreateMapSheet()
    setWelcomeIntent(null)
  }, [authReady, authUser, openCreateMapSheet, welcomeIntent])

  // --- Gamification ---

  // 레벨/XP 위젯 제거 (2026-05). useMapCRUD / useFeatureEditing 이 받는
  // refreshGameProfile 콜백은 stub 으로 유지 (서비스 호출은 살아있어도 위젯이 없어 가시 효과 없음).
  const refreshGameProfile = () => {}

  // --- Geolocation ---

  const { myLocation, locateMe } = useGeolocation({ setFocusPoint, showToast })

  // --- Notifications ---

  const [notiPanelOpen, setNotiPanelOpen] = useState(false)
  const {
    notifications: notiList,
    hasUnread: notiHasUnread,
    bannerItem: notiBanner,
    dismissBanner: notiDismissBanner,
    markRead: notiMarkRead,
    markAllRead: notiMarkAllRead,
    removeItem: notiRemove,
    refresh: notiRefresh,
  } = useNotifications()

  // --- Derived data ---

  const usersById = useMemo(() => {
    const mergedUsers = viewerProfile.id === me.id ? users : [viewerProfile, ...users]
    return Object.fromEntries(mergedUsers.map((user) => [user.id, user]))
  }, [viewerProfile])
  const canEditCommunityMap = !(hasSupabaseEnv && authReady && !authUser)
  const importedCommunityFeatureIds = useMemo(() => {
    const set = new Set()
    for (const f of features) {
      if (f?.sourceFeatureId) set.add(f.sourceFeatureId)
    }
    return set
  }, [features])
  const communityMapMeta = useMemo(() => [{
    id: communityMapId,
    title: "모두의 지도",
    description: "모두가 함께 만드는 지도",
    theme: "#4F46E5",
    updatedAt: communityMapFeatures[0]?.updatedAt || new Date().toISOString(),
    canEditFeatures: canEditCommunityMap,
  }], [canEditCommunityMap, communityMapFeatures, communityMapId])
  const sharedMapPool = useMemo(() => (sharedMapData ? [sharedMapData.map] : []), [sharedMapData])
  const sharedFeaturePool = useMemo(() => sharedMapData?.features || [], [sharedMapData])
  const activeMapPool = activeMapSource === "community"
    ? communityMapMeta
    : activeMapSource === "demo"
      ? demoMaps
      : activeMapSource === "shared"
        ? sharedMapPool
        : maps
  const activeFeaturePool = activeMapSource === "community"
    ? communityMapFeatures
    : activeMapSource === "demo"
      ? demoFeatures
      : activeMapSource === "shared"
        ? sharedFeaturePool
        : features
  const effectiveActiveMapId = activeMapSource === "community"
    && activeMapId === "community-map"
    && communityMapId
    && communityMapId !== "community-map"
    ? communityMapId
    : activeMapId
  const activeMap = activeMapPool.find((map) => map.id === effectiveActiveMapId)
    || (activeMapSource === "community" ? activeMapPool[0] || null : null)
  const activeFeatures = useMemo(
    () => (effectiveActiveMapId ? activeFeaturePool.filter((feature) => feature.mapId === effectiveActiveMapId) : []),
    [activeFeaturePool, effectiveActiveMapId],
  )
  useEffect(() => {
    if (activeMapSource !== "community" || activeMapId !== "community-map") return
    if (!communityMapId || communityMapId === "community-map") return
    setActiveMapId(communityMapId)
  }, [activeMapId, activeMapSource, communityMapId, setActiveMapId])
  const b2cMaps = useMemo(
    () => maps.filter((mapItem) => !isEventMap(mapItem)),
    [maps],
  )
  const b2cMapIds = useMemo(
    () => new Set(b2cMaps.map((mapItem) => mapItem.id)),
    [b2cMaps],
  )
  const b2cFeatures = useMemo(
    () => features.filter((feature) => b2cMapIds.has(feature.mapId)),
    [b2cMapIds, features],
  )
  const b2cShares = useMemo(
    () => shares.filter((share) => b2cMapIds.has(share.mapId)),
    [b2cMapIds, shares],
  )
  const pendingMediaSyncFeatures = useMemo(() => features, [features])
  const pendingMediaSyncSignature = useMemo(
    () => getPendingFeatureMediaSyncKeys(pendingMediaSyncFeatures).sort().join("|"),
    [pendingMediaSyncFeatures],
  )
  const mediaSyncInFlightRef = useRef("")

  useEffect(() => {
    if (!cloudMode || !pendingMediaSyncSignature) return undefined
    if (mediaSyncInFlightRef.current === pendingMediaSyncSignature) return undefined

    let cancelled = false
    mediaSyncInFlightRef.current = pendingMediaSyncSignature

    syncFeatureListLocalMediaToCloud(pendingMediaSyncFeatures)
      .then((result) => {
        if (cancelled) return
        if (result.syncedCount > 0) {
          const syncedById = new Map(result.features.map((feature) => [feature.id, feature]))
          const applySyncedMedia = (feature) => {
            const synced = syncedById.get(feature.id)
            return synced ? { ...feature, photos: synced.photos, voices: synced.voices } : feature
          }
          setFeatures((current) => current.map(applySyncedMedia))
          setCommunityMapFeatures((current) => current.map(applySyncedMedia))
          setFeatureSheet((current) => (current ? applySyncedMedia(current) : current))
        }
        if (result.failedCount > 0 || result.missingCount > 0) {
          showToast("일부 사진/음성은 아직 웹에 동기화되지 않았어요. 원래 저장한 기기에서 다시 열면 재시도돼요.")
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Failed to sync local media to cloud", error)
        }
      })
      .finally(() => {
        if (!cancelled) mediaSyncInFlightRef.current = ""
      })

    return () => {
      cancelled = true
    }
  }, [
    cloudMode,
    pendingMediaSyncFeatures,
    pendingMediaSyncSignature,
    setCommunityMapFeatures,
    setFeatureSheet,
    setFeatures,
    showToast,
  ])

  const personalRecordMaps = useMemo(
    () => b2cMaps
      .slice()
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)),
    [b2cMaps],
  )
  const ownPosts = useMemo(() => buildOwnPosts(shares, maps, features, viewerProfile), [features, maps, shares, viewerProfile])
  const communityFeed = useMemo(() => buildCommunityPosts(communityPosts, usersById), [communityPosts, usersById])
  const communityRequestSummary = useMemo(() => {
    const currentUserId = viewerProfile?.id || me.id
    const featureById = new Map(communityMapFeatures.map((feature) => [feature.id, feature]))
    const myFeatureIds = new Set(
      communityMapFeatures
        .filter((feature) => (feature.createdBy || null) === currentUserId)
        .map((feature) => feature.id),
    )
    const mine = []
    const incoming = []
    for (const request of communityPendingRequests) {
      if (!request || request.status !== "pending") continue
      const featureId = request.featureId || null
      const feature = featureId ? featureById.get(featureId) : null
      const title = request.payload?.title || feature?.title || "장소"
      const item = {
        ...request,
        featureTitle: title,
        requestedAtLabel: new Date(request.createdAt).toLocaleString("ko-KR"),
      }
      if (request.requestedBy === currentUserId) {
        mine.push(item)
      }
      if (featureId && myFeatureIds.has(featureId) && request.requestedBy !== currentUserId) {
        incoming.push(item)
      }
    }
    return {
      mine,
      incoming,
      mineCount: mine.length,
      incomingCount: incoming.length,
    }
  }, [communityMapFeatures, communityPendingRequests, viewerProfile?.id])

  // 인기 지도: is_curated 우선 → 폴백으로 기존 collections + communityFeed
  const [curatedMaps, setCuratedMaps] = useState([])
  useEffect(() => {
    if (!cloudMode) return
    let cancelled = false
    import("./lib/mapService").then((svc) => svc.getCuratedMaps(12))
      .then((result) => { if (!cancelled) setCuratedMaps(result) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [cloudMode])

  const recommendedMaps = useMemo(() => {
    // 큐레이션 지도가 있으면 우선 사용
    if (curatedMaps.length > 0) {
      return curatedMaps.map((m) => ({
        id: m.id, mapId: m.id, title: m.title,
        description: m.description || "",
        creator: m.creatorName || "", emojis: [], placeCount: m.featureCount || 0,
        gradient: m.gradient, tags: m.tags,
        placeNames: Array.isArray(m.placeNames) ? m.placeNames : [],
      }))
    }
    // 폴백: 기존 컬렉션 + 커뮤니티
    const fromCollections = collections.map((c) => {
      const demoMap = demoMaps.find((mapItem) => mapItem.id === c.mapId)
      const relatedDemoFeatures = demoFeatures.filter((feature) => feature.mapId === c.mapId)
      const placeNames = relatedDemoFeatures.map((feature) => feature.title)
      const tags = [...new Set(relatedDemoFeatures.flatMap((feature) => feature.tags || []))].slice(0, 4)
      return {
        id: c.id, mapId: c.mapId, title: c.title,
        description: demoMap?.description || "",
        creator: c.creator, emojis: c.emojis, placeCount: c.places,
        tags,
        gradient: c.gradient,
        placeNames,
      }
    })
    const fromPosts = communityFeed.slice(0, 6).map((p) => ({
      id: p.id, mapId: p.mapId, title: p.title,
      description: p.description || p.caption || "",
      creator: p.user.name, emojis: p.emojis, placeCount: p.placeCount,
      tags: p.tags,
      gradient: p.gradient,
      placeNames: Array.isArray(p.placeNames) ? p.placeNames : [],
    }))
    return [...fromCollections, ...fromPosts]
  }, [communityFeed, curatedMaps])

  const selectedUser = selectedUserProfile?.id === selectedUserId
    ? selectedUserProfile
    : selectedUserId
      ? users.find((user) => user.id === selectedUserId) || null
      : null
  const selectedUserPosts = useMemo(
    () => communityFeed.filter((post) => post.user.id === selectedUser?.id),
    [communityFeed, selectedUser?.id],
  )
  const selectedPost = useMemo(() => {
    if (!selectedPostRef) return null
    const pool = selectedPostRef.source === "own" ? ownPosts : communityFeed
    return pool.find((post) => post.id === selectedPostRef.id) || null
  }, [communityFeed, ownPosts, selectedPostRef])
  const selectedFeatureSummary = useMemo(() => {
    if (!selectedFeatureSummaryId) return null
    return activeFeaturePool.find((feature) => feature.id === selectedFeatureSummaryId) || null
  }, [activeFeaturePool, selectedFeatureSummaryId])
  const inlineRecordFeature = useMemo(() => {
    if (!inlineRecordFeatureId) return null
    return activeFeaturePool.find((feature) => feature.id === inlineRecordFeatureId) || null
  }, [activeFeaturePool, inlineRecordFeatureId])

  // "지도 공개" 시트 후보 = 아직 프로필에 공개되지 않은 B2C 지도.
  const onProfileMapIds = useMemo(() => new Set(shares.map((share) => share.mapId)), [shares])
  const profileUploadCandidates = useMemo(() => (
    b2cMaps.filter((mapItem) => {
      if (onProfileMapIds.has(mapItem.id)) return false
      return true
    })
  ), [b2cMaps, onProfileMapIds])
  const shareUrl = useMemo(() => {
    if (!activeMap) return ""
    if (activeMap.slug) {
      return buildSlugShareUrl(activeMap.slug, "link")
    }
    return buildMapShareUrl(activeMap, activeFeatures)
  }, [activeFeatures, activeMap])

  const featureEmojiChoices = featureSheet
    ? featureSheet.type === "route"
      ? [...placeEmojis, "🚶", "🚲", "🛵", "🚗", "🚌", "🚇", "⛴️", "✈️"]
      : featureSheet.type === "area"
        ? ["🏙️", "🌳", "🏞️", "🏝️", "🏕️", "🏟️", "🛍️", "🏛️", "🏠", "📌"]
        : placeEmojis
    : []
  const isDraftFeatureSheet = Boolean(featureSheet && ["새 장소", "새 길", "새 영역", `새 ${"\uACBD\uB85C"}`].includes((featureSheet.title || "").trim()))

  useEffect(() => {
    if (isDraftFeatureSheet || featureSheet?.cloudPending) {
      setFeatureSheetMode("edit")
    }
  }, [featureSheet?.cloudPending, isDraftFeatureSheet])

  // --- Hooks ---

  const { updateFeatures } = useFeaturePool(activeMapSource, setFeatures, setCommunityMapFeatures)

  const {
    photoInputRef, isRecording, recordingSeconds,
    handlePhotoSelected, handleDeletePhoto,
    startRecording, stopRecording, handleDeleteVoice,
  } = useMediaHandlers({ featureSheet, mediaTargetFeature: inlineRecordFeature, setFeatureSheet, updateFeatures, showToast, cloudMode })

  const {
    touchMap, resetEditorState,
    openMapEditor, openDemoMap, openCommunityMapEditor,
    saveMapSheet, deleteMap: deleteMapAction, reorderMaps,
    importSharedMapToLocal, importMapBundleToLocal,
    publishMap, unpublish, addMapToProfile, removeMapFromProfile,
    openFeatureFromPlaces, handleTabChange,
  } = useMapCRUD({
    maps, setMaps, features, setFeatures, shares, setShares,
    cloudMode, mapSheet, setMapSheet, setFeatureSheet,
    setMapsView, setActiveTab, setActiveMapSource, setActiveMapId,
    setSelectedFeatureId, setSelectedFeatureSummaryId,
    setEditorMode, setDraftPoints, setFitTrigger, setFocusPoint,
    showToast, sharedMapData, setSharedMapData,
    publishSheet, setPublishSheet, setSelectedPostRef,
    refreshGameProfile,
    communityMapId,
  })

  const handleImportMap = useCallback(async (importInput) => {
    const target = typeof importInput === "object" && importInput
      ? importInput
      : parseMapImportTarget(importInput)
    if (!target) throw new Error("공유 코드나 링크를 확인해 주세요.")

    if (target.type === "shared") {
      const bundle = target.payload || parseMapSharePayload(target.data)
      await importMapBundleToLocal(bundle, {
        toastMessage: `"${bundle.map.title}" 지도를 내 라이브러리에 저장했어요.`,
      })
      return
    }

    if (!hasSupabaseEnv) throw new Error("클라우드 연결이 필요해요.")
    const bundle = await getPublishedMapBySlug(target.slug)
    if (!bundle) throw new Error("해당 코드의 지도를 찾을 수 없어요.")
    const { map: importedMap } = bundle
    if (maps.some((m) => m.id === importedMap.id)) {
      showToast("이미 라이브러리에 있는 지도예요.")
      openMapEditor(importedMap.id)
      return
    }
    await importMapBundleToLocal(bundle, {
      toastMessage: `"${importedMap.title}" 지도를 내 라이브러리에 저장했어요.`,
    })
  }, [importMapBundleToLocal, maps, openMapEditor, showToast])

  const refreshCommunityPendingRequests = useCallback(async () => {
    if (!hasSupabaseEnv || !authUser || !communityMapId || communityMapId === "community-map") return
    try {
      const requests = await listFeatureChangeRequests(communityMapId, "pending")
      setCommunityPendingRequests(requests)
    } catch (error) {
      console.error("Failed to refresh community feature requests", error)
    }
  }, [authUser, communityMapId])

  const {
    focusFeature, focusFeatureOnly, openFeatureDetail,
    saveFeatureSheet, requestCommunityFeatureUpdate, requestCommunityFeatureUpdateById, deleteFeature,
    addMemo, updateMemo, deleteMemo, createHandleMapTap, completeRoute, completeArea,
    startRelocatePin, importCommunityFeatureToMine, unimportCommunityFeature,
  } = useFeatureEditing({
    activeMapId, activeMapSource, cloudMode,
    isEventMap: isEventMap(activeMap),
    activeMapRole: activeMap?.userRole || "owner",
    setFeatures, featureSheet, setFeatureSheet,
    selectedFeatureSummaryId,
    setSelectedFeatureId, setSelectedFeatureSummaryId,
    setEditorMode, setDraftPoints, setMemoText,
    activeFeaturePool, communityMapFeatures, setCommunityMapFeatures,
    touchMap, showToast, setMaps,
    maps, features, refreshGameProfile, myLocation, setFocusPoint,
    currentUserId: viewerProfile.id,
    currentUserName: viewerProfile.name,
    onCommunityRequestSubmitted: refreshCommunityPendingRequests,
  })

  const handleMapTap = useMemo(() => createHandleMapTap(editorMode), [createHandleMapTap, editorMode])
  const handleCreatePinAtLocation = useCallback(async ({ lat, lng }) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    setDraftPoints([])
    return createHandleMapTap("pin")({ lat, lng })
  }, [createHandleMapTap])

  const openCollaboratorsForMap = useCallback((mapId) => {
    const targetMap = maps.find((item) => item.id === mapId)
    if (!targetMap || isEventMap(targetMap) || targetMap.isCommunity) return
    if (!cloudMode) {
      showToast("로그인 후 내 지도 협업자를 초대할 수 있어요.")
      return
    }
    setCollaboratorsSheet({ mapId })
  }, [cloudMode, maps, showToast])

  const handleCollaboratorsChanged = useCallback((nextCollaborators = []) => {
    const mapId = collaboratorsSheet?.mapId
    if (!mapId) return
    const count = nextCollaborators.filter((item) => (item.status || "accepted") === "accepted").length
    setMaps((current) => current.map((mapItem) => (
      mapItem.id === mapId
        ? { ...mapItem, collabCount: count, collaboratorCount: count }
        : mapItem
    )))
  }, [collaboratorsSheet?.mapId, setMaps])

  const handleCollaborationInviteResponse = useCallback(async (inviteId, decision) => {
    if (!inviteId) return
    try {
      await respondCollaborationInvite(inviteId, decision)
      setCollaborationInvites((current) => current.filter((invite) => invite.id !== inviteId))
      showToast(decision === "accepted" ? "지도 초대를 수락했어요." : "지도 초대를 거절했어요.")
      if (decision === "accepted") {
        await reloadCloudData?.()
      }
    } catch (error) {
      console.error("Failed to respond collaboration invite", error)
      showToast(error?.message || "초대를 처리하지 못했어요.")
    }
  }, [reloadCloudData, showToast])

  // --- 모두의 지도 가져오기: 지도 선택 시트 트리거 + 핸들러 ---
  // 팝업의 [가져오기] 탭 → 타겟 지도 선택 시트 열기.
  // 사용자가 기존 지도를 고르거나 '새 지도 만들기'로 신규 지도를 만들고 바로 import 한다.
  const handleImportCommunityFeatureRequest = useCallback((sourceFeatureId) => {
    if (!sourceFeatureId) return
    setImportTargetSheet({ featureId: sourceFeatureId })
  }, [])

  const addExternalEventToMap = useCallback(async (event, targetMapInput = null) => {
    const targetMap = typeof targetMapInput === "object" && targetMapInput
      ? targetMapInput
      : maps.find((mapItem) => mapItem.id === targetMapInput)
    if (!targetMap || isEventMap(targetMap) || targetMap.canEditFeatures === false) {
      showToast("추가할 내 지도를 찾지 못했어요.")
      return false
    }

    const draft = buildEventFeatureDraft(event, targetMap.id)
    if (!draft) {
      showToast("행사 위치 정보가 없어 내 지도에 추가하지 못했어요.")
      return false
    }

    const alreadyAdded = (features || []).some((feature) => {
      if (feature.mapId !== targetMap.id) return false
      if (feature.sourceEventId && feature.sourceEventId === draft.sourceEventId) return true
      const lat = toFiniteNumber(feature.lat)
      const lng = toFiniteNumber(feature.lng)
      return feature.title === draft.title
        && lat !== null
        && lng !== null
        && Math.abs(lat - draft.lat) < 0.0001
        && Math.abs(lng - draft.lng) < 0.0001
    })
    if (alreadyAdded) {
      showToast("이미 이 지도에 추가된 행사예요.")
      return true
    }

    const draftFeature = {
      ...draft,
      createdBy: viewerProfile.id || me.id,
      createdByName: viewerProfile.name || me.name,
    }

    try {
      let nextFeature = draftFeature
      if (cloudMode && isUuidLike(targetMap.id)) {
        const saved = await createFeatureRecord(targetMap.id, draftFeature)
        nextFeature = {
          ...draftFeature,
          ...saved,
          address: draftFeature.address,
          category: draftFeature.category,
          sourceProvider: draftFeature.sourceProvider,
          sourceEventId: draftFeature.sourceEventId,
          sourceUrl: draftFeature.sourceUrl,
          image: draftFeature.image,
        }
      }
      setFeatures((current) => [nextFeature, ...current])
      touchMap?.(targetMap.id)
      showToast(`'${targetMap.title || "내 지도"}'에 행사를 추가했어요.`)
      return true
    } catch (error) {
      console.error("Failed to add event to map", error)
      showToast("행사를 내 지도에 추가하지 못했어요.")
      return false
    }
  }, [cloudMode, features, maps, setFeatures, showToast, touchMap, viewerProfile.id, viewerProfile.name])

  const handleAddEventToMapRequest = useCallback((event) => {
    if (!event) return
    setImportTargetSheet({ externalEvent: event })
  }, [])

  const handleImportPickMap = useCallback(async (targetMapId) => {
    const featureId = importTargetSheet?.featureId
    const externalEvent = importTargetSheet?.externalEvent
    if (!targetMapId || (!featureId && !externalEvent)) return
    if (externalEvent) {
      setImportTargetBusy(true)
      try {
        const ok = await addExternalEventToMap(externalEvent, targetMapId)
        if (ok) setImportTargetSheet(null)
      } finally {
        setImportTargetBusy(false)
      }
      return
    }
    const ok = importCommunityFeatureToMine(featureId, targetMapId)
    if (ok) setImportTargetSheet(null)
  }, [addExternalEventToMap, importTargetSheet, importCommunityFeatureToMine])

  const handleImportCreateMap = useCallback(async (title) => {
    const featureId = importTargetSheet?.featureId
    const externalEvent = importTargetSheet?.externalEvent
    const trimmed = `${title || ""}`.trim()
    if ((!featureId && !externalEvent) || !trimmed) return
    setImportTargetBusy(true)
    try {
      let nextMap
      if (cloudMode) {
        nextMap = await createMapRecord({
          title: trimmed,
          description: "",
          theme: "pastel",
          category: "personal",
          config: {},
        })
      } else {
        nextMap = {
          id: createId("map"),
          title: trimmed,
          description: "",
          theme: "pastel",
          category: "personal",
          config: {},
          updatedAt: new Date().toISOString(),
        }
      }
      setMaps((current) => [nextMap, ...current])
      // maps state 업데이트 이전에도 import 할 수 있도록 map 객체를 그대로 전달.
      const ok = externalEvent
        ? await addExternalEventToMap(externalEvent, nextMap)
        : importCommunityFeatureToMine(featureId, nextMap)
      if (ok) {
        showToast(`'${trimmed}' 지도를 만들고 저장했어요.`)
        setImportTargetSheet(null)
      }
    } catch (error) {
      console.error("Failed to create map for import", error)
      showToast("지도를 만들지 못했어요.")
    } finally {
      setImportTargetBusy(false)
    }
  }, [addExternalEventToMap, cloudMode, importTargetSheet, setMaps, importCommunityFeatureToMine, showToast])

  // --- Social / Profile ---

  const {
    handleUpdateProfile, toggleFollow, saveSharePlaceToMap,
  } = useSocialProfile({
    cloudMode, authUser,
    followed, setFollowed,
    likedPosts, setLikedPosts,
    setShares, setCommunityPosts,
    setViewerProfile,
    setFeatures, setActiveTab, setMapsView, setActiveMapId, setActiveMapSource,
    setSelectedFeatureId, setFeatureSheet, setEditorMode,
    pendingSharePlace, setPendingSharePlace,
    touchMap, showToast,
  })

  const mapEditorReadOnly = activeMapSource === "demo"
    || activeMapSource === "shared"
    || (activeMapSource === "local" && activeMap?.canEditFeatures === false)
    || (activeMapSource === "community" && !canEditCommunityMap)

  const { shouldOpenEventViewer } = resolveEventAccess({ activeMap })

  const hasUnsavedEditorDraft = activeTab === "maps"
    && mapsView === "editor"
    && activeMapSource === "local"
    && !shouldOpenEventViewer
    && (draftPoints.length > 0 || ["pin", "route", "area", "relocate"].includes(editorMode))

  const confirmDiscardEditorDraft = useCallback(() => {
    if (!hasUnsavedEditorDraft) return true
    return window.confirm("작성 중인 내용이 저장되지 않습니다. 이동할까요?")
  }, [hasUnsavedEditorDraft])

  const handleMapEditorBack = useCallback(() => {
    if (!confirmDiscardEditorDraft()) return
    if (activeMapSource === "community" || activeMapSource === "shared") {
      setActiveTab("home")
    }
    if (activeMapSource === "shared") {
      setSharedMapData(null)
      setActiveMapId(maps[0]?.id ?? null)
    }
    setMapsView("list")
    resetEditorState()
    setActiveMapSource("local")
  }, [activeMapSource, confirmDiscardEditorDraft, maps, resetEditorState, setActiveMapId, setActiveMapSource, setActiveTab, setMapsView])

  const recoverToHome = useCallback(() => {
    setSharedMapData(null)
    setActiveTab("home")
    setMapsView("list")
    setActiveMapSource("local")
    setActiveMapId(maps[0]?.id ?? null)
    resetEditorState()
  }, [maps, resetEditorState, setActiveMapId, setActiveMapSource, setActiveTab, setMapsView])

  const getRecordToast = useCallback((recordMethod) => {
    if (recordMethod === "search") return "장소를 검색해 찾은 뒤 지도에 남겨보세요."
    if (recordMethod === "current") return "현재 위치 주변에 장소를 남겨보세요."
    return "지도를 탭해 장소를 남겨보세요."
  }, [])

  const startRecordInMap = useCallback(async (mapId, recordMethod = "map") => {
    const targetMap = maps.find((mapItem) => mapItem.id === mapId && !isEventMap(mapItem))
    if (!targetMap) {
      showToast("기록할 지도를 선택해 주세요.")
      return false
    }
    if (!confirmDiscardEditorDraft()) return false

    setRecordSheetOpen(false)
    setRecordSheetInitialView("target")
    setRecordTargetMapId(null)

    if (activeMapSource === "shared") {
      setSharedMapData(null)
      setActiveMapSource("local")
    }
    if (
      !(activeTab === "maps"
        && mapsView === "editor"
        && activeMapSource === "local"
        && activeMapId === mapId)
    ) {
      openMapEditor(mapId)
    }

    setFeatureSheet(null)
    setSelectedFeatureId(null)
    setSelectedFeatureSummaryId(null)
    setDraftPoints([])
    setEditorMode("pin")
    if (recordMethod === "current") await locateMe()
    showToast(getRecordToast(recordMethod))
    return true
  }, [
    activeMapId, activeMapSource, activeTab, confirmDiscardEditorDraft, getRecordToast,
    locateMe, maps, mapsView, openMapEditor, setActiveMapSource, setDraftPoints,
    setEditorMode, setFeatureSheet, setSelectedFeatureId, setSelectedFeatureSummaryId,
    setSharedMapData, showToast,
  ])

  const openRecordFlow = useCallback(() => {
    if (needsAuthForPersonalArea) {
      requestLoginBanner()
      return
    }
    setRecordSheetInitialView("target")
    setRecordTargetMapId(null)
    setRecordSheetOpen(true)
  }, [needsAuthForPersonalArea, requestLoginBanner])

  const openRecordMapCreateFlow = useCallback(() => {
    setPendingRecordAfterMapCreate(true)
    setRecordSheetOpen(false)
    setRecordSheetInitialView("target")
    setRecordTargetMapId(null)
    setActiveTab("maps")
    setMapsView("list")
    setActiveMapSource("local")
    setMapSheet({
      mode: "create",
      id: null,
      title: "새 장소 지도",
      description: "",
      theme: themePalette[0],
      category: "personal",
      config: {},
    })
  }, [setActiveMapSource, setActiveTab, setMapSheet, setMapsView])

  useEffect(() => {
    if (!pendingRecordAfterMapCreate) return
    if (mapSheet) return
    if (activeTab !== "maps" || mapsView !== "editor" || activeMapSource !== "local" || !activeMapId) return

    setPendingRecordAfterMapCreate(false)
    setRecordTargetMapId(activeMapId)
    setRecordSheetInitialView("method")
    setRecordSheetOpen(true)
  }, [activeMapId, activeMapSource, activeTab, mapSheet, mapsView, pendingRecordAfterMapCreate])

  const handleMapFormClose = useCallback(() => {
    if (pendingRecordAfterMapCreate && mapSheet?.mode === "create") {
      setPendingRecordAfterMapCreate(false)
    }
    setMapSheet(null)
  }, [mapSheet, pendingRecordAfterMapCreate])

  const handleBottomNavChange = useCallback((nextTab) => {
    if (needsAuthForPersonalArea && (nextTab === "add-record" || nextTab === "maps" || nextTab === "profile")) {
      requestLoginBanner()
      return
    }
    if (nextTab === "add-record") {
      openRecordFlow()
      return
    }
    if (nextTab !== activeTab && !confirmDiscardEditorDraft()) return
    handleTabChange(nextTab)
    if (nextTab !== "maps" && activeMapSource === "shared") {
      setSharedMapData(null)
      setActiveMapSource("local")
      setActiveMapId(maps[0]?.id ?? null)
    }
  }, [activeMapSource, activeTab, confirmDiscardEditorDraft, handleTabChange, maps, needsAuthForPersonalArea, openRecordFlow, requestLoginBanner])

  const handleSavePostMap = useCallback(async (post) => {
    if (!post?.mapId) return
    if (savingPostMapId === post.mapId) return
    if (maps.some((mapItem) => mapItem.id === post.mapId)) {
      showToast("이미 내 라이브러리에 있는 지도예요.")
      setSelectedPostRef(null)
      openMapEditor(post.mapId)
      return
    }
    if (!hasSupabaseEnv) {
      showToast("이 지도는 온라인 상태에서만 저장할 수 있어요.")
      return
    }
    try {
      setSavingPostMapId(post.mapId)
      // 저장 진입점(공유 뷰어/피드)을 동일 기준으로 집계한다.
      logEvent("map_save", { map_id: post.mapId })
      try {
        await saveMapRecord(post.mapId, { source: "post_save" })
      } catch {
        // map_saves가 아직 없거나 RPC가 실패해도 실제 가져오기 흐름은 유지
      }
      const { getMapBundle } = await import("./lib/mapService.read")
      const bundle = await getMapBundle(post.mapId)
      await importMapBundleToLocal(bundle, { toastMessage: "지도를 내 라이브러리에 저장했어요." })
      setSelectedPostRef(null)
    } catch (error) {
      console.error("Failed to save post map", error)
      showToast("지도 저장에 실패했어요. 잠시 후 다시 시도해 주세요.")
    } finally {
      setSavingPostMapId(null)
    }
  }, [importMapBundleToLocal, maps, openMapEditor, savingPostMapId, setSelectedPostRef, showToast])

  const handlePublishSubmit = useCallback(async () => {
    if (publishSubmitting) return
    setPublishSubmitting(true)
    try {
      return await publishMap()
    } finally {
      setPublishSubmitting(false)
    }
  }, [publishMap, publishSubmitting])

  // 프로필 공개/내리기 공통 confirm 진입점.
  // 호출부: MapsList / MapEditor / PublishSheet 성공 후속 / ProfileScreen 내부.
  const requestProfilePlacement = useCallback((mode, mapId, onSuccess) => {
    if (!mapId) return
    setProfilePlacementSheet({ mode, mapId, onSuccess: onSuccess || null })
  }, [])

  const handleProfilePlacementCancel = useCallback(() => {
    if (profilePlacementSubmitting) return
    setProfilePlacementSheet(null)
  }, [profilePlacementSubmitting])

  const handleProfilePlacementConfirm = useCallback(async () => {
    if (!profilePlacementSheet) return
    setProfilePlacementSubmitting(true)
    try {
      const ok = profilePlacementSheet.mode === "remove"
        ? await removeMapFromProfile(profilePlacementSheet.mapId)
        : profilePlacementSheet.mode === "removeForUnpublish"
          ? (await unpublish(profilePlacementSheet.mapId), true)
          : await addMapToProfile(profilePlacementSheet.mapId)
      if (ok) {
        profilePlacementSheet.onSuccess?.()
        setProfilePlacementSheet(null)
      }
    } finally {
      setProfilePlacementSubmitting(false)
    }
  }, [addMapToProfile, profilePlacementSheet, removeMapFromProfile, unpublish])

  const handleMapEditorPublish = useCallback(async (mapId) => {
    const publishedMapId = await publishMap(mapId)
    if (publishedMapId) {
      requestProfilePlacement("add", publishedMapId)
    }
    return publishedMapId
  }, [publishMap, requestProfilePlacement])

  const handleMapEditorUnpublish = useCallback(async (mapId) => {
    if (!mapId) return false
    const isOnProfile = shares.some((share) => share.mapId === mapId)
    if (isOnProfile) {
      requestProfilePlacement("removeForUnpublish", mapId)
      return false
    }
    await unpublish(mapId)
    return true
  }, [requestProfilePlacement, shares, unpublish])

  const handleSaveSharedMap = useCallback(async () => {
    if (savingSharedMap) return
    setSavingSharedMap(true)
    try {
      await importSharedMapToLocal()
    } finally {
      setSavingSharedMap(false)
    }
  }, [importSharedMapToLocal, savingSharedMap])

  // 배포 후 최초 1회: 레거시 "발행=자동 프로필 노출" 시절의 publication row 를 정리한다.
  // cloudMode 가 true 가 되는 순간에 시도하고, 성공 시 localStorage flag 로 재실행을 막는다.
  useEffect(() => {
    if (!cloudMode) return
    let cancelled = false
    resetLegacyProfileCuration()
      .then((result) => {
        if (cancelled) return
        if (result?.deleted) {
          // 외부 관리 화면/로컬 상태와 동기화. 화면에 남아있는 shares 가 있을 수 있으므로 비운다.
          setShares([])
        }
      })
      .catch((error) => {
        console.warn("[profile curation reset] failed (will retry next session):", error)
      })
    return () => { cancelled = true }
  }, [cloudMode, setShares])

  useEffect(() => {
    if (!supabase || !cloudMode) return
    if (activeTab !== "maps" || mapsView !== "editor") return
    if (activeMapSource === "shared" || activeMapSource === "demo") return

    const mapId = activeMapSource === "community" ? communityMapId : activeMapId
    if (!mapId || mapId === "community-map") return

    const featureIds = new Set(
      activeFeaturePool
        .filter((feature) => feature.mapId === mapId)
        .map((feature) => feature.id),
    )

    let cancelled = false
    let pendingTimer = null
    let syncRunning = false

    const syncMapBundle = async () => {
      if (cancelled || syncRunning) return
      syncRunning = true
      try {
        if (activeMapSource === "community") {
          const bundle = await getCommunityMapBundle()
          if (cancelled || !bundle?.map || bundle.map.id !== mapId) return

          setCommunityMapId(bundle.map.id)
          setCommunityMapFeatures((current) => (
            mergeFeatureListWithLocalMedia(Array.isArray(bundle.features) ? bundle.features : [], current)
          ))
          setActiveMapId((current) => (
            current === "community-map" || current === mapId
              ? bundle.map.id
              : current
          ))
          return
        }

        const bundle = await getMapBundle(mapId)
        if (cancelled || !bundle?.map || bundle.map.id !== mapId) return

        const nextFeatures = Array.isArray(bundle.features) ? bundle.features : []
        setFeatures((current) => [
          ...current.filter((feature) => feature.mapId !== mapId),
          ...mergeFeatureListWithLocalMedia(
            nextFeatures,
            current.filter((feature) => feature.mapId === mapId),
          ),
        ])
        setMaps((current) => current.map((mapItem) => (
          mapItem.id === mapId ? { ...mapItem, ...bundle.map } : mapItem
        )))
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to sync map changes in realtime", error)
        }
      } finally {
        syncRunning = false
      }
    }

    const scheduleSync = () => {
      if (cancelled) return
      if (pendingTimer) window.clearTimeout(pendingTimer)
      pendingTimer = window.setTimeout(() => {
        syncMapBundle()
      }, 120)
    }

    let channel = supabase
      .channel(`loca-map-sync:${mapId}:${activeMapSource}:${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "map_features", filter: `map_id=eq.${mapId}` },
        scheduleSync,
      )

    if (activeMapSource === "community") {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_records" },
        scheduleSync,
      )
    } else {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feature_memos" },
        (payload) => {
          const featureId = payload?.new?.feature_id || payload?.old?.feature_id
          if (featureId && featureIds.has(featureId)) {
            scheduleSync()
          }
        },
      )
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feature_media" },
        (payload) => {
          const featureId = payload?.new?.feature_id || payload?.old?.feature_id
          if (featureId && featureIds.has(featureId)) {
            scheduleSync()
          }
        },
      )
    }

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.warn("Realtime channel error", { mapId, source: activeMapSource })
      }
    })

    return () => {
      cancelled = true
      if (pendingTimer) window.clearTimeout(pendingTimer)
      supabase.removeChannel(channel)
    }
  }, [
    activeFeaturePool,
    activeMapId,
    activeMapSource,
    activeTab,
    cloudMode,
    communityMapId,
    mapsView,
    setActiveMapId,
    setCommunityMapId,
    setCommunityMapFeatures,
    setFeatures,
    setMaps,
  ])

  // --- Route effects ---

  useEffect(() => {
    if (!hasSupabaseEnv || !authReady) return
    let cancelled = false

    const hydrateCommunityMap = async () => {
      try {
        if (authUser) {
          await ensureCommunityMap()
        }
        const bundle = await getCommunityMapBundle()
        if (cancelled || !bundle?.map) return

        setCommunityMapId(bundle.map.id)
        setCommunityMapFeatures((current) => (
          mergeFeatureListWithLocalMedia(Array.isArray(bundle.features) ? bundle.features : [], current)
        ))
        setActiveMapId((current) => (current === "community-map" ? bundle.map.id : current))

        if (routeAtLoad?.type === "map" && (routeAtLoad.mapId === "community-map" || routeAtLoad.mapId === bundle.map.id)) {
          setActiveTab("maps")
          setMapsView("editor")
          setActiveMapSource("community")
          setActiveMapId(bundle.map.id)
        }
      } catch (error) {
        console.error("Failed to hydrate community map", error)
      }
    }

    hydrateCommunityMap()
    return () => { cancelled = true }
  }, [authReady, authUser, routeAtLoad, setActiveMapId, setActiveMapSource, setActiveTab, setMapsView, setCommunityMapFeatures])

  useEffect(() => {
    if (!hasSupabaseEnv || !authReady || !authUser || !communityMapId || communityMapId === "community-map") {
      setCommunityPendingRequests([])
      return undefined
    }
    let cancelled = false
    const fetchRequests = async () => {
      try {
        const requests = await listFeatureChangeRequests(communityMapId, "pending")
        if (!cancelled) {
          setCommunityPendingRequests(requests)
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load community feature requests", error)
        }
      }
    }
    fetchRequests()
    const timer = window.setInterval(fetchRequests, 45000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [authReady, authUser, communityMapId])

  useEffect(() => {
    if (!authUser || communityRequestSummary.incoming.length === 0) return
    let added = false
    for (const request of communityRequestSummary.incoming) {
      const next = addNotification({
        type: NOTI_TYPES.FEATURE_UPDATE_REQUEST,
        mapId: request.mapId,
        title: `${request.featureTitle || "장소"} 수정 요청`,
        body: `${request.requestedByName || "사용자"}님이 변경을 제안했어요.`,
        meta: {
          dedup: `community-feature-request:${request.id}`,
          requestId: request.id,
          featureId: request.featureId,
        },
      })
      if (next) added = true
    }
    if (added) {
      notiRefresh()
    }
  }, [authUser, communityRequestSummary.incoming, notiRefresh])

  useEffect(() => {
    if (routeAtLoad?.type === "invalid-shared") {
      showToast("공유 링크를 열지 못했어요.")
    }
    if (
      routeAtLoad?.type === "map"
      && !initialStoredTarget
      && routeAtLoad.mapId !== "community-map"
      && routeAtLoad.mapId !== communityMapId
      && (!hasSupabaseEnv || (authReady && communityMapId !== "community-map"))
    ) {
      showToast("이 기기에서 찾을 수 없는 지도예요.")
    }
  }, [authReady, communityMapId, initialStoredTarget, routeAtLoad, showToast])

  // 슬러그 기반 공유 URL 로딩 (/s/:slug)
  useEffect(() => {
    if (routeAtLoad?.type !== "slug" || !hasSupabaseEnv) return
    let isMounted = true
    getPublishedMapBySlug(routeAtLoad.slug)
      .then((result) => {
        if (!isMounted) return
        if (result) {
          setSharedMapData({ map: result.map, features: result.features })
          setActiveTab("maps")
          setMapsView("editor")
          setActiveMapSource("shared")
          setActiveMapId(result.map.id)
        } else {
          showToast("존재하지 않는 지도예요.")
        }
      })
      .catch(() => {
        if (isMounted) showToast("지도를 불러오지 못했어요.")
      })
    return () => { isMounted = false }
  }, [routeAtLoad, showToast])

  // 로컬 모드에서 현재 activeMapId가 maps에 없으면 보정
  useEffect(() => {
    if (activeMapSource !== "local") return
    if (mapsView === "editor" && maps.length === 0 && activeMapId) {
      setMapsView("list")
      return
    }
    if (activeMapId && !maps.some((mapItem) => mapItem.id === activeMapId) && maps.length > 0) {
      setActiveMapId(maps[0].id)
    }
  }, [activeMapId, activeMapSource, maps, mapsView])

  useEffect(() => {
    const sharedMapPath = activeMapSource === "shared" && sharedMapData
      ? routeAtLoad?.type === "slug" && routeAtLoad.slug
        ? `/s/${encodeURIComponent(routeAtLoad.slug)}`
        : buildMapSharePath(sharedMapData.map, sharedMapData.features)
      : null

    const routeMapId = activeMapSource === "community" ? "community-map" : activeMapId
    const nextPath = activeTab === "maps" && mapsView === "editor" && routeMapId
      ? sharedMapPath ?? buildMapRoutePath(routeMapId)
      : "/"
    const currentPath = `${window.location.pathname}${window.location.search}`
    if (currentPath !== nextPath) {
      window.history.replaceState(null, "", nextPath)
    }
  }, [activeMapId, activeMapSource, activeTab, mapsView, routeAtLoad, sharedMapData])

  // --- Render ---

  // 웰컴 화면: 공유 링크 아님 + 미인증 + 웰컴 안 봄
  if (showStartup) {
    return (
      <AppErrorBoundary>
      <Suspense fallback={<ScreenFallback />}>
        <WelcomeScreen
          showLoginBanner={needsAuthForPersonalArea}
          onStart={handleWelcomeBrowse}
          onAddFirstPlace={handleWelcomeAddFirstPlace}
          onLogin={openAuthSheet}
        />
        {authSheetOpen ? (
          <AuthPromptSheet onClose={closeAuthPrompt}>
            <AuthScreen
              title="로그인"
              onSuccess={handleAuthSuccess}
            />
          </AuthPromptSheet>
        ) : null}
      </Suspense>
      </AppErrorBoundary>
    )
  }

  if (sharedMapData) {
    return (
      <AppErrorBoundary>
      <Suspense fallback={<ScreenFallback />}>
        <SharedMapViewer
          map={sharedMapData.map}
          features={sharedMapData.features}
          onSaveToApp={handleSaveSharedMap}
          savingToApp={savingSharedMap}
        />
        <Toast message={toast.message} />
      </Suspense>
      </AppErrorBoundary>
    )
  }

  const isMapEditorLayout = activeTab === "maps" && mapsView === "editor"
  const shouldRenderHomeScreen = !showPersonalLoading && (activeTab === "home" || showPersonalGate)
  const shouldRenderMissingMapRecovery = !showPersonalLoading
    && !showPersonalGate
    && activeTab === "maps"
    && mapsView === "editor"
    && !activeMap
  const bottomNavTab = showPersonalGate ? "home" : activeTab
  const shouldHideBottomNav = (!showPersonalGate && activeTab === "maps" && mapsView === "editor")
    || keyboardVisible
    || Boolean(featureSheet)

  return (
    <div className={`app-shell${isMapEditorLayout ? " app-shell--map-editor" : ""}`}>
      {!isOnline ? (
        <div className="offline-banner">오프라인 모드 - 데이터가 자동 저장됩니다</div>
      ) : null}
      {/* 인앱 배너 */}
      <NotificationBanner
        notification={notiBanner}
        onTap={() => { notiDismissBanner(); setNotiPanelOpen(true) }}
        onDismiss={notiDismissBanner}
      />

      {/* 알림 패널 */}
      {notiPanelOpen && (
        <NotificationPanel
          notifications={notiList}
          onMarkRead={notiMarkRead}
          onMarkAllRead={notiMarkAllRead}
          onRemove={notiRemove}
          onClose={() => setNotiPanelOpen(false)}
          onTap={() => setNotiPanelOpen(false)}
        />
      )}

      {authPromptVisible && needsAuthForPersonalArea && !authSheetOpen ? (
        <AuthPromptBanner
          onLogin={openAuthSheet}
          onDismiss={closeAuthPrompt}
        />
      ) : null}

      <main className="content">
      <AppErrorBoundary>
      <Suspense fallback={<ScreenFallback />}>
        {showPersonalLoading ? (
          <section className="screen screen--scroll" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
            <div style={{ textAlign: "center", color: "#aaa", fontSize: 13 }}>불러오는 중...</div>
          </section>
        ) : null}

        {shouldRenderHomeScreen ? (
          <HomeScreen
            maps={b2cMaps}
            features={b2cFeatures}
            recommendedMaps={recommendedMaps}
            communityMaps={communityMapMeta}
            communityFeatures={communityMapFeatures}
            viewerProfile={viewerProfile}
            onResumeMyMap={openMapEditor}
            onOpenFeatureInMap={(_, featureId) => openFeatureFromPlaces(featureId)}
            onCreateMap={openRecordFlow}
            onOpenMap={openDemoMap}
            onOpenCommunityEditor={openCommunityMapEditor}
            onNavigateToExplore={openExploreTab}
            onOpenExploreSearch={openExploreSearch}
            onOpenNotifications={() => setNotiPanelOpen(true)}
            hasUnread={notiHasUnread}
          />
        ) : null}

        {!showPersonalLoading && !showPersonalGate && activeTab === "explore" ? (
          <ExploreScreen
            recommendedMaps={recommendedMaps}
            onOpenMap={openDemoMap}
            onOpenCommunityEditor={openCommunityMapEditor}
            onAddEventToMap={handleAddEventToMapRequest}
            users={users}
            followed={followed}
            onSelectUser={(profile) => {
              setSelectedUserProfile(profile)
              setSelectedUserId(profile.id)
            }}
            searchRequestId={exploreSearchRequestId}
          />
        ) : null}

        {!showPersonalLoading && !showPersonalGate && activeTab === "maps" && mapsView === "list" ? (
          <MyArchiveScreen
            key={`archive-${activeTab}`}
            maps={b2cMaps}
            features={b2cFeatures}
            shares={b2cShares}
            loading={cloudLoading}
            characterImage="/characters/cloud_lv1.svg"
            initialArchiveView="maps"
            onImport={() => setImportSheetOpen(true)}
            onCreate={() => setMapSheet({ mode: "create", id: null, title: "", description: "", theme: themePalette[0] })}
            onEdit={(mapId) => {
              const mapItem = maps.find((item) => item.id === mapId)
              if (mapItem) {
                setMapSheet({
                  mode: "edit",
                  id: mapItem.id,
                  title: mapItem.title,
                  description: mapItem.description,
                  theme: mapItem.theme,
                  category: mapItem.category || "personal",
                  config: mapItem.config || {},
                })
              }
            }}
            onCollaborate={openCollaboratorsForMap}
            onOpen={openMapEditor}
            onDelete={(mapId, mapTitle) => {
              if (!window.confirm(`"${mapTitle}" 지도를 삭제할까요?`)) return
              deleteMapAction(mapId)
            }}
            onReorder={reorderMaps}
            onShare={(mapId) => {
              // MapsList 에서 공유 호출 시 해당 지도로 에디터를 열고, 에디터의 ShareSheet 를 사용한다.
              openMapEditor(mapId)
            }}
            onPublish={(mapId) => setPublishSheet({ caption: "", selectedMapId: mapId })}
            onUnpublish={(mapId) => {
              if (!window.confirm("링크 공유를 중지할까요?\n링크 공유를 중지하면 프로필에서도 내려가요.")) return
              unpublish(mapId)
            }}
            onAddToProfile={(mapId) => requestProfilePlacement("add", mapId)}
            onRemoveFromProfile={(mapId) => requestProfilePlacement("remove", mapId)}
            collaborationInvites={collaborationInvites}
            onAcceptCollaborationInvite={(inviteId) => handleCollaborationInviteResponse(inviteId, "accepted")}
            onRejectCollaborationInvite={(inviteId) => handleCollaborationInviteResponse(inviteId, "rejected")}
            onOpenFeature={openFeatureFromPlaces}
            onCreateRecord={openRecordFlow}
            recommendedMaps={recommendedMaps}
            onOpenDemoMap={openDemoMap}
            onOpenCommunityEditor={openCommunityMapEditor}
            users={users}
            followed={followed}
            onSelectUser={(profile) => {
              setSelectedUserProfile(profile)
              setSelectedUserId(profile.id)
            }}
          />
        ) : null}

        {/* 행사 지도는 역할과 무관하게 항상 participant shell (SharedMapViewer) 로 렌더 */}
        {!showPersonalLoading && !showPersonalGate && activeTab === "maps" && mapsView === "editor" && shouldOpenEventViewer ? (
          <SharedMapViewer
            map={activeMap}
            features={activeFeatures}
            onSaveToApp={null}
            onBack={handleMapEditorBack}
          />
        ) : null}

        {/* 일반 지도 MapEditorScreen (non-event only) */}
        {!showPersonalLoading && !showPersonalGate && activeTab === "maps" && mapsView === "editor" && activeMap && !shouldOpenEventViewer ? (
          <MapEditorScreen
            map={activeMap}
            features={activeFeatures}
            selectedFeatureId={selectedFeatureId}
            selectedFeatureSummary={selectedFeatureSummary}
            editorMode={editorMode}
            draftPoints={draftPoints}
            focusPoint={focusPoint}
            fitTrigger={fitTrigger}
            myLocation={myLocation}
            currentUserId={viewerProfile.id}
            readOnly={mapEditorReadOnly}
            hideCount={activeMapSource === "community"}
            communityMode={activeMapSource === "community"}
            shareUrl={shareUrl}
            showLabels={showMapLabels}
            onBack={handleMapEditorBack}
            onFit={() => setFitTrigger((value) => value + 1)}
            onSearchLocation={(loc) => setFocusPoint(loc)}
            onCreatePinAtLocation={handleCreatePinAtLocation}
            onLocate={locateMe}
            onModeChange={(mode) => {
              setEditorMode(mode)
              setDraftPoints([])
              setSelectedFeatureId(null)
              setSelectedFeatureSummaryId(null)
            }}
            onMapTap={handleMapTap}
            onFeatureTap={focusFeature}
            onStripFeatureTap={focusFeatureOnly}
            onUndoDraft={() => setDraftPoints((current) => current.slice(0, -1))}
            onCompleteRoute={() => completeRoute(draftPoints)}
            onCompleteArea={() => completeArea(draftPoints)}
            onCancelDraft={() => {
              setDraftPoints([])
              setEditorMode("browse")
            }}
            onToggleLabels={() => setShowMapLabels((current) => !current)}
            onOpenCollaborators={activeMapSource === "local" && cloudMode && activeMap && !isEventMap(activeMap)
              ? () => openCollaboratorsForMap(activeMap.id)
              : undefined}
            onOpenFeatureDetail={(featureId) => {
              setFeatureSheetMode("detail")
              openFeatureDetail(featureId)
            }}
            onOpenFeatureEdit={(featureId) => {
              setFeatureSheetMode("edit")
              openFeatureDetail(featureId)
            }}
            onAddMemo={addMemo}
            photoInputRef={photoInputRef}
            isRecording={isRecording}
            recordingSeconds={recordingSeconds}
            onPhotoSelected={handlePhotoSelected}
            onDeletePhoto={handleDeletePhoto}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            onDeleteVoice={handleDeleteVoice}
            onBeginFeatureRecord={(featureId) => setInlineRecordFeatureId(featureId)}
            onEndFeatureRecord={() => setInlineRecordFeatureId(null)}
            importedCommunityFeatureIds={importedCommunityFeatureIds}
            onImportCommunityFeature={handleImportCommunityFeatureRequest}
            onUnimportCommunityFeature={unimportCommunityFeature}
            onRequestCommunityUpdateFromSummary={requestCommunityFeatureUpdateById}
            onOpenShareEditor={(canvas) => setShareEditorImage(canvas)}
            onUpdateMemo={updateMemo}
            onDeleteMemo={deleteMemo}
            placementRow={findPlacementForMap(activeMap?.id, shares)}
            onPublishMap={handleMapEditorPublish}
            onUnpublishMap={handleMapEditorUnpublish}
            onAddMapToProfile={(mapId) => requestProfilePlacement("add", mapId)}
            onRemoveMapFromProfile={(mapId) => requestProfilePlacement("remove", mapId)}
            onCloseFeatureSummary={() => {
              setSelectedFeatureId(null)
              setSelectedFeatureSummaryId(null)
            }}
            showToast={showToast}
            coachmarkStep={coachmarkStep}
            onCoachmarkNext={(nextStep) => {
              if (nextStep === 2) {
                // 코치마크 1 → 핀 모드 자동 설정 + 코치마크 2
                if (editorMode !== "pin") {
                  setEditorMode("pin")
                  setDraftPoints([])
                  setSelectedFeatureId(null)
                  setSelectedFeatureSummaryId(null)
                }
                setCoachmarkStep(2)
              } else if (nextStep === 0) {
                // 코치마크 2 확인 → dismiss, 사용자가 실제 탭할 때까지 대기
                setCoachmarkStep(0)
              }
            }}
            onCoachmarkSkip={() => {
              markCoachmarkSeen()
              setCoachmarkStep(0)
            }}
            firstPinHintVisible={firstPinHintVisible}
            onDismissFirstPinHint={() => {
              markFirstPinCelebrated()
              setFirstPinHintVisible(false)
            }}
          />
        ) : null}

        {shouldRenderMissingMapRecovery ? (
          <AppRecoveryScreen
            title="지도를 다시 찾지 못했어요"
            message="탭 이동 중 이전 지도 상태가 남아 있었어요. 홈으로 돌아가면 바로 다시 사용할 수 있어요."
            actionLabel="홈으로 돌아가기"
            onRetry={recoverToHome}
          />
        ) : null}

        {!showPersonalLoading && !showPersonalGate && activeTab === "profile" ? (
          <ProfileScreen
            user={viewerProfile}
            shares={b2cShares}
            maps={b2cMaps}
            features={b2cFeatures}
            users={users}
            cloudMode={cloudMode}
            cloudEmail={authUser?.email || ""}
            characterImage="/characters/cloud_lv1.svg"
            canImportLocalData={cloudMode && readLocalImportData().hasAny}
            onImportLocalData={importLocalDataToCloud}
            onSignOut={cloudMode ? handleSignOut : null}
            onPublishOpen={() => setPublishSheet({ caption: "", selectedMapId: profileUploadCandidates[0]?.id ?? null })}
            onSelectPost={(source, id) => setSelectedPostRef({ source, id })}
            onSelectUser={(profile) => {
              setSelectedUserProfile(profile)
              setSelectedUserId(profile.id)
            }}
            onUpdateProfile={handleUpdateProfile}
            onBatchAddToProfile={async (mapIds) => {
              const results = await Promise.allSettled(mapIds.map((id) => addMapToProfile(id)))
              const succeeded = results.filter((r) => r.status === "fulfilled").length
              if (succeeded === mapIds.length) {
                showToast(`${succeeded}개 지도를 프로필에 공개했어요`)
              } else if (succeeded > 0) {
                showToast(`${succeeded}/${mapIds.length}개 지도를 프로필에 공개했어요`)
              } else {
                showToast("프로필에 공개하지 못했어요")
              }
            }}
            onNavigateToMaps={() => setActiveTab("maps")}
            onResetCoachmark={() => {
              resetCoachmark()
              showToast("다음 편집기 진입 시 가이드가 다시 표시돼요")
            }}
            hasB2BAccess={hasB2BAccess}
            onB2BAccessChange={setHasB2BAccess}
          />
        ) : null}
      </Suspense>
      </AppErrorBoundary>
      </main>

      {/* 공유 지도 viewer / feature 편집 시트 / 키보드 표시 중에는 BottomNav 숨김 */}
      {shouldHideBottomNav ? null : (
      <BottomNavV2
        tab={bottomNavTab}
        onTabChange={handleBottomNavChange}
        onFabClick={() => handleBottomNavChange("add-record")}
      />
      )}

      {/* Sheets */}
      <AddRecordSheet
        key={recordSheetOpen ? `${recordSheetInitialView}-${recordTargetMapId || "none"}` : "closed"}
        open={recordSheetOpen}
        maps={personalRecordMaps}
        initialView={recordSheetInitialView}
        selectedMapId={recordTargetMapId}
        onClose={() => setRecordSheetOpen(false)}
        onCreateMap={openRecordMapCreateFlow}
        onStartRecord={startRecordInMap}
      />
      <MapFormSheet
        mapSheet={mapSheet} setMapSheet={setMapSheet}
        onSave={saveMapSheet} onDelete={deleteMapAction}
        onClose={handleMapFormClose}
      />
      <CollaboratorsSheet
        open={Boolean(collaboratorsSheet)}
        mapId={collaboratorsSheet?.mapId}
        mapRole={maps.find((item) => item.id === collaboratorsSheet?.mapId)?.userRole || "owner"}
        onClose={() => setCollaboratorsSheet(null)}
        onChanged={handleCollaboratorsChanged}
        showToast={showToast}
      />
      {(() => {
        // 시안 v5 신규 편집 시트 (FeatureEditSheet)는 '작성자 편집 전용'.
        // 비작성자의 커뮤니티 수정 요청은 기존 FeatureDetailSheet가 담당.
        if (!featureSheet) return null
        const isCommunityFeature = activeMapSource === "community"
        const canDirectlyEdit = !mapEditorReadOnly && (
          activeMapSource === "local"
          || (isCommunityFeature && (featureSheet.createdBy || null) === viewerProfile.id)
        )
        const shouldShowEditor = canDirectlyEdit && (featureSheetMode === "edit" || isDraftFeatureSheet || featureSheet?._focusName)
        if (shouldShowEditor) {
          return (
            <FeatureEditSheet
              featureSheet={featureSheet}
              setFeatureSheet={setFeatureSheet}
              mapMode={isCommunityFeature ? "community" : "personal"}
              mapTitle={activeMap?.title || ""}
              readOnly={mapEditorReadOnly}
              onClose={() => { setFeatureSheet(null); setSelectedFeatureId(null); setFeatureSheetMode("detail") }}
              onSave={saveFeatureSheet}
              onDelete={deleteFeature}
              onRelocatePin={activeMapSource === "local" && !mapEditorReadOnly ? startRelocatePin : undefined}
              photoInputRef={photoInputRef}
              isRecording={isRecording}
              recordingSeconds={recordingSeconds}
              onPhotoSelected={handlePhotoSelected}
              onDeletePhoto={handleDeletePhoto}
              onStartRecording={startRecording}
              onStopRecording={stopRecording}
              onDeleteVoice={handleDeleteVoice}
              onAddMemo={addMemo}
            />
          )
        }
        return (
          <FeatureDetailSheet
            featureSheet={featureSheet} setFeatureSheet={setFeatureSheet}
            activeMapSource={activeMapSource} featureEmojiChoices={featureEmojiChoices}
            readOnly={mapEditorReadOnly}
            currentUserId={viewerProfile.id}
            onClose={() => { setFeatureSheet(null); setSelectedFeatureId(null); setFeatureSheetMode("detail") }}
            onEdit={canDirectlyEdit ? () => setFeatureSheetMode("edit") : undefined}
            onSave={saveFeatureSheet} onDelete={deleteFeature}
            onRelocatePin={activeMapSource === "local" && !mapEditorReadOnly ? startRelocatePin : undefined}
            photoInputRef={photoInputRef} isRecording={isRecording} recordingSeconds={recordingSeconds}
            onPhotoSelected={handlePhotoSelected} onDeletePhoto={handleDeletePhoto}
            onStartRecording={startRecording} onStopRecording={stopRecording} onDeleteVoice={handleDeleteVoice}
            memoText={memoText} onMemoTextChange={setMemoText} onAddMemo={addMemo} onUpdateMemo={updateMemo}
            onRequestCommunityUpdate={requestCommunityFeatureUpdate}
          />
        )
      })()}
      <ImportTargetMapSheet
        open={Boolean(importTargetSheet)}
        maps={b2cMaps}
        features={b2cFeatures}
        busy={importTargetBusy}
        onPick={handleImportPickMap}
        onCreate={handleImportCreateMap}
        onClose={() => { if (!importTargetBusy) setImportTargetSheet(null) }}
      />
      {coachmarkStep === 3 ? (
        <CoachMark
          step={3}
          totalSteps={3}
          title="이름과 메모를 적으면 기록이 완성돼요"
          description="간단한 메모만 남겨도 괜찮아요. 사진이나 음성도 나중에 추가할 수 있어요."
          nextLabel="이해했어요"
          onNext={() => {
            markCoachmarkSeen()
            setCoachmarkStep(0)
          }}
          onSkip={() => {
            markCoachmarkSeen()
            setCoachmarkStep(0)
          }}
        />
      ) : null}
      <PublishSheet
        publishSheet={publishSheet} setPublishSheet={setPublishSheet}
        candidates={profileUploadCandidates} features={b2cFeatures}
        onPublish={handlePublishSubmit}
        onAddToProfile={(mapId) => {
          // 이미 링크 공유 중인 지도: 공통 confirm 으로 바로 전환.
          setPublishSheet(null)
          requestProfilePlacement("add", mapId)
        }}
        onOfferAddToProfile={(mapId) => {
          // 링크 공유 성공 후 공통 confirm 시트로 전환.
          setPublishSheet(null)
          requestProfilePlacement("add", mapId)
        }}
        publishing={publishSubmitting}
        onClose={() => setPublishSheet(null)}
      />
      <UserProfileSheet
        user={selectedUser} userPosts={selectedUserPosts}
        isFollowing={selectedUser ? followed.includes(selectedUser.id) : false}
        onClose={() => {
          setSelectedUserId(null)
          setSelectedUserProfile(null)
        }}
        onToggleFollow={toggleFollow} onSelectPost={setSelectedPostRef}
      />
      <PostDetailSheet
        post={selectedPost}
        onClose={() => setSelectedPostRef(null)}
        onOpenMap={(mapId) => { setSelectedPostRef(null); openMapEditor(mapId) }}
        onRemoveFromProfile={(mapId) => {
          setSelectedPostRef(null)
          requestProfilePlacement("remove", mapId)
        }}
        onSaveMap={handleSavePostMap}
        saving={savingPostMapId === selectedPost?.mapId}
        isFollowing={selectedPost?.user ? followed.includes(selectedPost.user.id) : false}
        onToggleFollow={toggleFollow}
        mapFeatures={selectedPost ? features.filter((f) => f.mapId === selectedPost.mapId) : []}
      />
      {shareEditorImage ? (
        <Suspense fallback={null}>
          <MapShareEditor
            mapImage={shareEditorImage} mapTitle={activeMap?.title || "LOCA"}
            mapTheme={activeMap?.theme} mapFeatures={activeFeatures}
            shareUrl={shareUrl} onClose={() => setShareEditorImage(null)} showToast={showToast}
          />
        </Suspense>
      ) : null}
      <SharePlaceSheet
        pendingSharePlace={pendingSharePlace} maps={maps} features={features}
        onSaveToMap={saveSharePlaceToMap} onClose={() => setPendingSharePlace(null)}
      />
      <ProfilePlacementConfirmSheet
        open={Boolean(profilePlacementSheet)}
        mode={profilePlacementSheet?.mode}
        mapTitle={maps.find((item) => item.id === profilePlacementSheet?.mapId)?.title || ""}
        submitting={profilePlacementSubmitting}
        onConfirm={handleProfilePlacementConfirm}
        onCancel={handleProfilePlacementCancel}
      />
      {importSheetOpen ? (
        <Suspense fallback={null}>
          <ImportMapSheet
            open={importSheetOpen} onClose={() => setImportSheetOpen(false)}
            onImport={handleImportMap} showToast={showToast}
          />
        </Suspense>
      ) : null}

      {authSheetOpen ? (
        <Suspense fallback={null}>
          <AuthPromptSheet onClose={closeAuthPrompt}>
            <AuthScreen
              title="로그인"
              onSuccess={handleAuthSuccess}
            />
          </AuthPromptSheet>
        </Suspense>
      ) : null}

      <Toast message={toast.message} />
    </div>
  )
}

