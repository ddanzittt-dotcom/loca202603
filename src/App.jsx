import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CheckCircle2, Database, Map as MapIcon, MapPin, PenLine, Plus, User } from "lucide-react"
import { Toast } from "./components/ui"
import { BottomNavV2 } from "./components/BottomNav.v2"
import { PlaceCardPop } from "./components/PlaceCardPop"
import { NotificationPanel, NotificationBanner } from "./components/NotificationPanel"
import { useNotifications } from "./hooks/useNotifications"
import {
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
  placeEmojis,
  themePalette,
} from "./lib/appUtils"
import { hasSupabaseEnv, supabase } from "./lib/supabase"
import { logEvent } from "./lib/analytics"
import { ensureCommunityMap, getCommunityMapBundle, getMapBundle, getPublishedMapBySlug, respondCollaborationInvite, saveMap as saveMapRecord } from "./lib/mapService"
import { listFeatureChangeRequests } from "./lib/mapService.read"
import { createMap as createMapRecord } from "./lib/mapService.write"
import { createId } from "./lib/appUtils"
import { add as addNotification, NOTI_TYPES } from "./lib/notificationStore"
// 라우트별 코드 스플리팅 - 라이트웹(/s/:slug)은 SharedMapViewer 청크만 로딩
const AuthScreen = lazy(() => import("./screens/AuthScreen").then((m) => ({ default: m.AuthScreen })))
const ExplorePublicScreen = lazy(() => import("./screens/ExplorePublicScreen").then((m) => ({ default: m.ExplorePublicScreen })))
const MapEditorScreen = lazy(() => import("./screens/MapEditorScreen").then((m) => ({ default: m.MapEditorScreen })))
const MapsListScreen = lazy(() => import("./screens/MapsListScreen").then((m) => ({ default: m.MapsListScreen })))
const PlacesScreen = lazy(() => import("./screens/PlacesScreen").then((m) => ({ default: m.PlacesScreen })))
const ProfileScreen = lazy(() => import("./screens/ProfileScreen").then((m) => ({ default: m.ProfileScreen })))
const SharedMapViewer = lazy(() => import("./screens/SharedMapViewer").then((m) => ({ default: m.SharedMapViewer })))
import { useFeaturePool } from "./hooks/useFeaturePool"
import { useMediaHandlers } from "./hooks/useMediaHandlers"
import { useFeatureEditing } from "./hooks/useFeatureEditing"
import { useMapCRUD } from "./hooks/useMapCRUD"
import { useAppSession } from "./hooks/useAppSession"
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
import { findPlacementForMap, resetLegacyProfileCuration } from "./lib/mapPlacement"
import { isCoachmarkSeen, markCoachmarkSeen, resetCoachmark, isFirstPinCelebrated, markFirstPinCelebrated } from "./lib/onboarding"
import { CoachMark } from "./components/CoachMark"
import { mergeFeatureListWithLocalMedia } from "./lib/featureMediaMerge"
import { getPendingFeatureMediaSyncKeys, syncFeatureListLocalMediaToCloud } from "./lib/mediaCloudSync"
const MapShareEditor = lazy(() => import("./screens/MapShareEditor").then((m) => ({ default: m.MapShareEditor })))
import "./shared-viewer.css"
import "./map-share-editor.css"

function ScreenFallback() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", color: "#999" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>LOCA</div>
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

const EMPTY_WEB_CUE_ITEMS = []

function WebSocialCue({ label, items = EMPTY_WEB_CUE_ITEMS }) {
  if (!label && !items.length) return null

  return (
    <div className="web-social-cue" aria-label="저장함 분위기">
      <div className="web-social-cue__swatches" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="web-social-cue__copy">
        {label ? <strong>{label}</strong> : null}
        {items.length ? (
          <span>{items.join(" · ")}</span>
        ) : null}
      </div>
    </div>
  )
}

// 29CM/핀터레스트 문법: 큰 제목 + 여백. 레이블·설명문·통계 스트립은 걷어냈다.
function WebPageFrame({
  className = "",
  title,
  action,
  children,
}) {
  const frameClassName = ["screen screen--scroll web-section", className].filter(Boolean).join(" ")

  return (
    <section className={frameClassName}>
      <div className="web-section__inner">
        <div className="web-section__head">
          <div className="web-section__headline">
            <h1 className="web-section__title">{title}</h1>
          </div>
          {action ? <div className="web-section__actions">{action}</div> : null}
        </div>
        <div className="web-section__workspace">
          {children}
        </div>
      </div>
    </section>
  )
}

function WebAuthLayout({ children }) {
  return (
    <section className="screen screen--scroll web-auth-screen">
      <div className="web-auth-workspace">
        <aside className="web-auth-workspace__intro" aria-label="LOCA 웹 소개">
          <span className="web-section__eyebrow">SOFT SOCIAL PLACES</span>
          <h1>같이 가고 싶은 곳을 지도에 모아요.</h1>
          <p>친구와 저장한 장소와 내가 만든 지도를 한 화면에서 가볍게 이어갑니다.</p>
          <WebSocialCue label="이런 지도를 만들 수 있어요" items={["주말 산책", "카페 후보", "같이 갈 곳"]} />
          <div className="web-auth-workspace__flow" aria-label="주요 작업 흐름">
            <span><PenLine size={15} aria-hidden="true" />장소 저장</span>
            <span><MapIcon size={15} aria-hidden="true" />지도 공유</span>
            <span><MapPin size={15} aria-hidden="true" />프로필 공개</span>
          </div>
        </aside>
        <div className="web-auth-workspace__panel">
          {children}
        </div>
      </div>
    </section>
  )
}

// 우상단 내 계정 버튼 — 로그인 후 계정 탭 대신 사용 (로그아웃 등 간단한 동작)
function AccountMenu({ email, onOpenAccount, onSignOut }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="account-menu">
      <button
        type="button"
        className="account-menu__trigger"
        onClick={() => setOpen((current) => !current)}
        aria-label="내 계정"
        aria-expanded={open}
      >
        <User size={17} strokeWidth={2.1} aria-hidden="true" />
      </button>
      {open ? (
        <>
          <div className="account-menu__backdrop" onClick={() => setOpen(false)} role="presentation" />
          <div className="account-menu__pop" role="menu" aria-label="계정 메뉴">
            <p className="account-menu__email">{email || "내 계정"}</p>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onOpenAccount?.()
              }}
            >
              계정 화면
            </button>
            {onSignOut ? (
              <button
                type="button"
                role="menuitem"
                className="account-menu__signout"
                onClick={() => {
                  setOpen(false)
                  onSignOut()
                }}
              >
                로그아웃
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}

function SignedInScreen({ user, onOpenMaps, onOpenProfile, onSignOut }) {
  return (
    <WebAuthLayout>
      <div className="web-auth-screen__inner">
        <div className="web-auth-card">
          <CheckCircle2 size={26} strokeWidth={2.2} aria-hidden="true" />
          <div>
            <strong>로그인되어 있어요</strong>
            <span>{user?.email || "현재 계정"}</span>
          </div>
        </div>

        <div className="web-auth-actions" aria-label="계정 바로가기">
          <button type="button" onClick={onOpenMaps}>
            <MapIcon size={17} strokeWidth={2.1} aria-hidden="true" />
            지도 목록
          </button>
          <button type="button" onClick={onOpenProfile}>
            <User size={17} strokeWidth={2.1} aria-hidden="true" />
            프로필
          </button>
          {onSignOut ? (
            <button type="button" className="is-ghost" onClick={onSignOut}>
              로그아웃
            </button>
          ) : null}
        </div>
      </div>
    </WebAuthLayout>
  )
}

const resolveStoredMapTarget = (mapId, maps) => {
  if (!mapId) return null
  if (mapId === "community-map") return { source: "community", mapId }
  if (demoMaps.some((map) => map.id === mapId)) return { source: "demo", mapId }
  if (maps.some((map) => map.id === mapId)) return { source: "local", mapId }
  return null
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
  // 첫 진입은 로그인 없이 구경할 수 있는 탐색 탭으로
  const [activeTab, setActiveTab] = useState(initialSharedMapData || initialStoredTarget ? "maps" : "explore")
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
  const [importTargetSheet, setImportTargetSheet] = useState(null) // { featureId } | null
  const [importTargetBusy, setImportTargetBusy] = useState(false)
  const [publishSheet, setPublishSheet] = useState(null)
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [selectedUserProfile, setSelectedUserProfile] = useState(null)
  const [selectedPostRef, setSelectedPostRef] = useState(null)
  const [memoText, setMemoText] = useState("")
  const [shareEditorImage, setShareEditorImage] = useState(null)
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
    activeTab === "places" ||
    (activeTab === "maps" && (mapsView === "list" || activeMapSource === "local"))
  const showPersonalGate = needsAuthForPersonalArea && requiresAuthForCurrentTab
  const showPersonalLoading = hasSupabaseEnv && (!authReady || isFirstCloudLoadForUser) && requiresAuthForCurrentTab

  const requestLoginBanner = useCallback(() => {
    setActiveTab("login")
  }, [])

  const handleAuthSuccess = useCallback((mode) => {
    showToast(mode === "signup" ? "회원가입이 완료되었어요." : "로그인했어요.")
    setActiveTab("maps")
    setMapsView("list")
    setActiveMapSource("local")
  }, [setActiveMapSource, setActiveTab, setMapsView, showToast])

  useEffect(() => {
    if (!showPersonalGate) return
    if (activeTab !== "login") setActiveTab("login")
    if (mapsView !== "list") setMapsView("list")
    if (activeMapSource !== "local") setActiveMapSource("local")
  }, [activeMapSource, activeTab, mapsView, showPersonalGate])

  const openCreateMapSheet = useCallback(() => {
    if (needsAuthForPersonalArea) {
      requestLoginBanner()
      return
    }
    setActiveTab("maps")
    setMapsView("list")
    setMapSheet({ mode: "create", id: null, title: "", description: "", theme: themePalette[0] })
  }, [needsAuthForPersonalArea, requestLoginBanner])

  // --- Geolocation ---

  const { myLocation, locateMe } = useGeolocation({ setFocusPoint, showToast })

  // --- Notifications ---

  const [notiPanelOpen, setNotiPanelOpen] = useState(false)
  const {
    notifications: notiList,
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
  const b2cMaps = maps
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
    openMapEditor,
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
    communityMapId,
  })

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
    activeMapRole: activeMap?.userRole || "owner",
    setFeatures, featureSheet, setFeatureSheet,
    selectedFeatureSummaryId,
    setSelectedFeatureId, setSelectedFeatureSummaryId,
    setEditorMode, setDraftPoints, setMemoText,
    activeFeaturePool, communityMapFeatures, setCommunityMapFeatures,
    touchMap, showToast, setMaps,
    maps, features, myLocation, setFocusPoint,
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
    if (!targetMap || targetMap.isCommunity) return
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

  const handleImportPickMap = useCallback(async (targetMapId) => {
    const featureId = importTargetSheet?.featureId
    if (!targetMapId || !featureId) return
    const ok = importCommunityFeatureToMine(featureId, targetMapId)
    if (ok) setImportTargetSheet(null)
  }, [importTargetSheet, importCommunityFeatureToMine])

  const handleImportCreateMap = useCallback(async (title) => {
    const featureId = importTargetSheet?.featureId
    const trimmed = `${title || ""}`.trim()
    if (!featureId || !trimmed) return
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
      const ok = importCommunityFeatureToMine(featureId, nextMap)
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
  }, [cloudMode, importTargetSheet, setMaps, importCommunityFeatureToMine, showToast])

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

  const hasUnsavedEditorDraft = activeTab === "maps"
    && mapsView === "editor"
    && activeMapSource === "local"
    && (draftPoints.length > 0 || ["pin", "route", "area", "relocate"].includes(editorMode))

  const confirmDiscardEditorDraft = useCallback(() => {
    if (!hasUnsavedEditorDraft) return true
    return window.confirm("작성 중인 내용이 저장되지 않습니다. 이동할까요?")
  }, [hasUnsavedEditorDraft])

  const handleMapEditorBack = useCallback(() => {
    if (!confirmDiscardEditorDraft()) return
    if (activeMapSource === "community" || activeMapSource === "shared") {
      setActiveTab("maps")
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
    setActiveTab("maps")
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
    const targetMap = maps.find((mapItem) => mapItem.id === mapId)
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

  // 장소 목록에서 장소를 누르면 지도 이동 대신 카드로 먼저 보여준다
  const [placeCardFeature, setPlaceCardFeature] = useState(null)

  const handleBottomNavChange = useCallback((nextTab) => {
    if (nextTab === "login") {
      if (activeTab !== "login" && !confirmDiscardEditorDraft()) return
      handleTabChange("login")
      return
    }
    if (needsAuthForPersonalArea && (nextTab === "maps" || nextTab === "places" || nextTab === "profile")) {
      requestLoginBanner()
      return
    }
    if (nextTab !== activeTab && !confirmDiscardEditorDraft()) return
    handleTabChange(nextTab)
    if (nextTab === "maps") {
      setMapsView("list")
      setActiveMapSource("local")
    }
    if (nextTab !== "maps" && activeMapSource === "shared") {
      setSharedMapData(null)
      setActiveMapSource("local")
      setActiveMapId(maps[0]?.id ?? null)
    }
  }, [
    activeMapSource,
    activeTab,
    confirmDiscardEditorDraft,
    handleTabChange,
    maps,
    needsAuthForPersonalArea,
    requestLoginBanner,
    setActiveMapSource,
    setMapsView,
  ])

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
  const showLoginLoading = hasSupabaseEnv && activeTab === "login" && !authReady
  const shouldRenderLoginScreen = !showLoginLoading && !showPersonalLoading && activeTab === "login"
  const shouldRenderMissingMapRecovery = !showPersonalLoading
    && !showPersonalGate
    && activeTab === "maps"
    && mapsView === "editor"
    && !activeMap
  const bottomNavTab = showPersonalGate ? "login" : activeTab
  const shouldHideBottomNav = keyboardVisible || Boolean(featureSheet)
  const shellClassName = [
    "app-shell",
    " app-shell--soft-social",
    isMapEditorLayout ? " app-shell--map-editor" : "",
    ` app-shell--tab-${bottomNavTab}`,
  ].join("")

  return (
    <div className={shellClassName}>
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

      <main className="content">
      <AppErrorBoundary>
      <Suspense fallback={<ScreenFallback />}>
        {showPersonalLoading ? (
          <section className="screen screen--scroll" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
            <div style={{ textAlign: "center", color: "#aaa", fontSize: 13 }}>불러오는 중...</div>
          </section>
        ) : null}

        {showLoginLoading ? (
          <section className="screen screen--scroll" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
            <div style={{ textAlign: "center", color: "#aaa", fontSize: 13 }}>로그인 상태 확인 중...</div>
          </section>
        ) : null}

        {shouldRenderLoginScreen ? (
          authUser ? (
            <SignedInScreen
              user={authUser}
              onOpenMaps={() => {
                setActiveTab("maps")
                setMapsView("list")
                setActiveMapSource("local")
              }}
              onOpenProfile={() => setActiveTab("profile")}
              onSignOut={cloudMode ? handleSignOut : null}
            />
          ) : (
            <WebAuthLayout>
                <AuthScreen
                  title="로그인"
                  subtitle="내 지도와 친구와 모은 장소를 웹에서 이어보세요"
                  onSuccess={handleAuthSuccess}
                />
            </WebAuthLayout>
          )
        ) : null}

        {/* 탐색 — 발행된 공개 지도, 로그인 불필요 */}
        {activeTab === "explore" ? (
          <WebPageFrame
            className="web-section--explore"
            title="탐색"
          >
            <ExplorePublicScreen
              onOpenMap={(slug) => {
                window.location.href = `/s/${encodeURIComponent(slug)}`
              }}
            />
          </WebPageFrame>
        ) : null}

        {!showPersonalLoading && !showPersonalGate && activeTab === "maps" && mapsView === "list" ? (
          <WebPageFrame
            className="web-section--maps maps-library-screen--v2"
            title="내 지도"
            action={(
              <button className="web-section__action" type="button" onClick={openCreateMapSheet}>
                <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
                새 지도
              </button>
            )}
          >
            <MapsListScreen
              maps={b2cMaps}
              features={b2cFeatures}
              shares={b2cShares}
              loading={cloudLoading}
              characterImage="/characters/cloud_lv1.svg"
              onCreate={openCreateMapSheet}
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
              collaborationInvites={collaborationInvites}
              onAcceptCollaborationInvite={(inviteId) => handleCollaborationInviteResponse(inviteId, "accepted")}
              onRejectCollaborationInvite={(inviteId) => handleCollaborationInviteResponse(inviteId, "rejected")}
            />
          </WebPageFrame>
        ) : null}

        {!showPersonalLoading && !showPersonalGate && activeTab === "places" ? (
          <WebPageFrame
            className="web-section--places maps-library-screen--v2"
            title="내 장소"
            action={(
              <button className="web-section__action" type="button" onClick={openRecordFlow}>
                <Database size={16} strokeWidth={2.2} aria-hidden="true" />
                기록 추가
              </button>
            )}
          >
            <PlacesScreen
              maps={b2cMaps}
              features={b2cFeatures}
              characterImage="/characters/cloud_lv1.svg"
              onOpenFeature={(featureId) => {
                const feature = b2cFeatures.find((item) => (item.id || item.feature_id) === featureId)
                if (feature) setPlaceCardFeature(feature)
              }}
              onCreateRecord={openRecordFlow}
              embedded
            />
          </WebPageFrame>
        ) : null}

        {/* 지도 편집기 (MapEditorScreen) */}
        {!showPersonalLoading && !showPersonalGate && activeTab === "maps" && mapsView === "editor" && activeMap ? (
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
            onOpenCollaborators={activeMapSource === "local" && cloudMode && activeMap
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
            message="탭 이동 중 이전 지도 상태가 남아 있었어요. 지도 목록으로 돌아가면 바로 다시 사용할 수 있어요."
            actionLabel="지도 목록으로 돌아가기"
            onRetry={recoverToHome}
          />
        ) : null}

        {!showPersonalLoading && !showPersonalGate && activeTab === "profile" ? (
          <WebPageFrame
            className="web-section--profile"
            title="프로필"
            action={(
              <button
                className="web-section__action"
                type="button"
                onClick={() => setPublishSheet({ caption: "", selectedMapId: profileUploadCandidates[0]?.id ?? null })}
              >
                <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
                지도 올리기
              </button>
            )}
          >
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
            />
          </WebPageFrame>
        ) : null}
      </Suspense>
      </AppErrorBoundary>
      </main>

      {/* 로그인 후 우상단 내 계정 버튼 (지도 편집 중에는 숨김) */}
      {authUser && !isMapEditorLayout ? (
        <AccountMenu
          email={authUser.email}
          onOpenAccount={() => handleBottomNavChange("login")}
          onSignOut={cloudMode ? handleSignOut : null}
        />
      ) : null}

      {/* 공유 지도 viewer / feature 편집 시트 / 키보드 표시 중에는 BottomNav 숨김 */}
      {shouldHideBottomNav ? null : (
      <BottomNavV2
        tab={bottomNavTab}
        onTabChange={handleBottomNavChange}
        authed={Boolean(authUser)}
      />
      )}

      {placeCardFeature ? (
        <PlaceCardPop
          feature={placeCardFeature}
          mapTitle={b2cMaps.find((mapItem) => mapItem.id === (placeCardFeature.mapId || placeCardFeature.map_id))?.title || ""}
          onClose={() => setPlaceCardFeature(null)}
          onOpenOnMap={() => {
            const featureId = placeCardFeature.id || placeCardFeature.feature_id
            setPlaceCardFeature(null)
            openFeatureFromPlaces(featureId)
          }}
        />
      ) : null}

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
      <Toast message={toast.message} />
    </div>
  )
}

