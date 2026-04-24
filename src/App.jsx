import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Bell, Settings as SettingsIcon } from "lucide-react"
import { BottomNav, Toast } from "./components/ui"
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
  placeEmojis,
  themePalette,
} from "./lib/appUtils"
import { hasSupabaseEnv, supabase } from "./lib/supabase"
import { logEvent } from "./lib/analytics"
import { ensureCommunityMap, getCommunityMapBundle, getMapBundle, getPublishedMapBySlug, saveMap as saveMapRecord } from "./lib/mapService"
import { listFeatureChangeRequests } from "./lib/mapService.read"
import { createMap as createMapRecord } from "./lib/mapService.write"
import { createId } from "./lib/appUtils"
import { add as addNotification, NOTI_TYPES } from "./lib/notificationStore"
// 라우트별 코드 스플리팅 - 라이트웹(/s/:slug)은 SharedMapViewer 청크만 로딩
const WelcomeScreen = lazy(() => import("./screens/WelcomeScreen").then((m) => ({ default: m.WelcomeScreen })))
const AuthScreen = lazy(() => import("./screens/AuthScreen").then((m) => ({ default: m.AuthScreen })))
const HomeScreen = lazy(() => import("./screens/HomeScreen").then((m) => ({ default: m.HomeScreen })))
const MapEditorScreen = lazy(() => import("./screens/MapEditorScreen").then((m) => ({ default: m.MapEditorScreen })))
const MapsListScreen = lazy(() => import("./screens/MapsListScreen").then((m) => ({ default: m.MapsListScreen })))
const PlacesScreen = lazy(() => import("./screens/PlacesScreen").then((m) => ({ default: m.PlacesScreen })))
const ProfileScreen = lazy(() => import("./screens/ProfileScreen").then((m) => ({ default: m.ProfileScreen })))
const SearchScreen = lazy(() => import("./screens/SearchScreen").then((m) => ({ default: m.SearchScreen })))
const SharedMapViewer = lazy(() => import("./screens/SharedMapViewer").then((m) => ({ default: m.SharedMapViewer })))
import { useFeaturePool } from "./hooks/useFeaturePool"
import { useMediaHandlers } from "./hooks/useMediaHandlers"
import { useFeatureEditing } from "./hooks/useFeatureEditing"
import { useMapCRUD } from "./hooks/useMapCRUD"
import { useAppSession } from "./hooks/useAppSession"
import { useGamification } from "./hooks/useGamification"
import { useGeolocation } from "./hooks/useGeolocation"
import { useSocialProfile } from "./hooks/useSocialProfile"
import { cleanupOrphanedMedia } from "./lib/mediaStore"
import { FeatureDetailSheet } from "./components/sheets/FeatureDetailSheet"
import { FeatureEditSheet } from "./components/sheets/FeatureEditSheet"
import { ImportTargetMapSheet } from "./components/sheets/ImportTargetMapSheet"
import { MapFormSheet } from "./components/sheets/MapFormSheet"
import { PublishSheet } from "./components/sheets/PublishSheet"
import { UserProfileSheet } from "./components/sheets/UserProfileSheet"
import { PostDetailSheet } from "./components/sheets/PostDetailSheet"
import { SharePlaceSheet } from "./components/sheets/SharePlaceSheet"
import { ProfilePlacementConfirmSheet } from "./components/sheets/ProfilePlacementConfirmSheet"
import { resolveEventAccess } from "./lib/eventAccess"
import { findPlacementForMap, isEventMap, resetLegacyProfileCuration } from "./lib/mapPlacement"
import { isWelcomeSeen, isCoachmarkSeen, markCoachmarkSeen, resetCoachmark, isFirstPinCelebrated, markFirstPinCelebrated } from "./lib/onboarding"
import { CoachMark } from "./components/CoachMark"
import { mergeFeatureListWithLocalMedia } from "./lib/featureMediaMerge"
const MapShareEditor = lazy(() => import("./screens/MapShareEditor").then((m) => ({ default: m.MapShareEditor })))
const ImportMapSheet = lazy(() => import("./components/sheets/ImportMapSheet").then((m) => ({ default: m.ImportMapSheet })))
import "./shared-viewer.css"
import "./map-share-editor.css"

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
  const [communityMapFeatures, setCommunityMapFeatures] = useLocalStorageState("loca.mobile.communityMapFeatures", communityMapFeaturesSeed)
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
  const [featureSheet, setFeatureSheet] = useState(null)
  // 모두의 지도 → 내 지도 가져오기 타겟 선택 시트
  const [importTargetSheet, setImportTargetSheet] = useState(null) // { featureId } | null
  const [importTargetBusy, setImportTargetBusy] = useState(false)
  const [publishSheet, setPublishSheet] = useState(null)
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [selectedPostRef, setSelectedPostRef] = useState(null)
  const [memoText, setMemoText] = useState("")
  const [shareEditorImage, setShareEditorImage] = useState(null)
  const [importSheetOpen, setImportSheetOpen] = useState(false)
  // 프로필 올리기/내리기 공통 confirm 시트 상태
  const [profilePlacementSheet, setProfilePlacementSheet] = useState(null) // { mode: 'add'|'remove', mapId, onSuccess? }
  const [profilePlacementSubmitting, setProfilePlacementSubmitting] = useState(false)
  const [characterStyle, setCharacterStyle] = useLocalStorageState("loca.mobile.characterStyle", "m3")
  const [publishSubmitting, setPublishSubmitting] = useState(false)
  const [savingPostMapId, setSavingPostMapId] = useState(null)
  const [savingSharedMap, setSavingSharedMap] = useState(false)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [welcomeDismissed, setWelcomeDismissed] = useState(() => isWelcomeSeen())
  const [coachmarkStep, setCoachmarkStep] = useState(0) // 0=off, 1~3=active step
  const [firstPinHintVisible, setFirstPinHintVisible] = useState(false)
  const [communityPendingRequests, setCommunityPendingRequests] = useState([])

  const isOnline = useOnlineStatus()
  const toast = useToast()
  const showToast = toast.show

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
    authReady, authUser, cloudMode, cloudLoading,
    hasB2BAccess, setHasB2BAccess,
    gameProfile, setGameProfile,
    readLocalImportData,
    handleSignOut, importLocalDataToCloud,
  } = useAppSession({
    setMaps, setFeatures, setShares, setFollowed, setViewerProfile,
    setActiveTab, setMapsView, setActiveMapSource, setActiveMapId,
    setSelectedFeatureId, setSelectedFeatureSummaryId,
    setFeatureSheet, setEditorMode, setDraftPoints,
    setMapSheet, setPublishSheet, setSelectedUserId, setSelectedPostRef,
    setSharedMapData, setShareEditorImage,
    showToast, routeAtLoad,
  })

  const needsAuthForPersonalArea = hasSupabaseEnv && authReady && !authUser
  const requiresAuthForCurrentTab =
    activeTab === "profile" ||
    activeTab === "places" ||
    (activeTab === "maps" && (mapsView === "list" || activeMapSource === "local"))
  const showPersonalGate = needsAuthForPersonalArea && requiresAuthForCurrentTab
  const showPersonalLoading = hasSupabaseEnv && (!authReady || cloudLoading) && requiresAuthForCurrentTab

  // --- Gamification ---

  const { refreshGameProfile, userStats, levelEmoji, souvenirs } = useGamification({
    cloudMode, authUser,
    gameProfile, setGameProfile,
    maps, features,
  })

  // --- Geolocation ---

  const { myLocation, locateMe } = useGeolocation({ setFocusPoint, showToast })

  // --- Notifications ---

  const [notiPanelOpen, setNotiPanelOpen] = useState(false)
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(false)
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
  const activeMap = activeMapPool.find((map) => map.id === activeMapId) || null
  const activeFeatures = useMemo(
    () => (activeMapId ? activeFeaturePool.filter((feature) => feature.mapId === activeMapId) : []),
    [activeFeaturePool, activeMapId],
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
        creator: m.creatorName || "", emojis: [], placeCount: m.featureCount || 0,
        gradient: m.gradient, tags: m.tags,
      }))
    }
    // 폴백: 기존 컬렉션 + 커뮤니티
    const fromCollections = collections.map((c) => ({
      id: c.id, mapId: c.mapId, title: c.title,
      creator: c.creator, emojis: c.emojis, placeCount: c.places,
      gradient: c.gradient,
    }))
    const fromPosts = communityFeed.slice(0, 6).map((p) => ({
      id: p.id, mapId: p.mapId, title: p.title,
      creator: p.user.name, emojis: p.emojis, placeCount: p.placeCount,
      gradient: p.gradient,
    }))
    return [...fromCollections, ...fromPosts]
  }, [communityFeed, curatedMaps])

  const selectedUser = selectedUserId ? users.find((user) => user.id === selectedUserId) : null
  const selectedUserPosts = useMemo(
    () => communityFeed.filter((post) => post.user.id === selectedUserId),
    [communityFeed, selectedUserId],
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

  // "지도 올리기" 시트 후보 = 아직 프로필에 올라가지 않은 지도.
  // - non-event: 저장용이면 발행 후 올리기 / 이미 발행됐으면 바로 올리기.
  // - event: 메인 앱에서 발행은 못 하지만, 대시보드에서 이미 발행된 event map 이면 프로필에 올릴 수 있다.
  const onProfileMapIds = useMemo(() => new Set(shares.map((share) => share.mapId)), [shares])
  const profileUploadCandidates = useMemo(() => (
    maps.filter((mapItem) => {
      if (onProfileMapIds.has(mapItem.id)) return false
      if (isEventMap(mapItem)) return Boolean(mapItem.isPublished)
      return true
    })
  ), [maps, onProfileMapIds])
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

  // --- Hooks ---

  const { updateFeatures } = useFeaturePool(activeMapSource, setFeatures, setCommunityMapFeatures)

  const {
    photoInputRef, isRecording, recordingSeconds,
    handlePhotoSelected, handleDeletePhoto,
    startRecording, stopRecording, handleDeleteVoice,
  } = useMediaHandlers({ featureSheet, setFeatureSheet, updateFeatures, showToast, cloudMode })

  const {
    touchMap, resetEditorState,
    openMapEditor, openDemoMap, openCommunityMapEditor,
    saveMapSheet, deleteMap: deleteMapAction,
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

  const handleImportMap = useCallback(async (slugCode) => {
    if (!hasSupabaseEnv) throw new Error("클라우드 연결이 필요해요.")
    const bundle = await getPublishedMapBySlug(slugCode)
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
    addMemo, createHandleMapTap, completeRoute, completeArea,
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

  // --- 모두의 지도 가져오기: 지도 선택 시트 트리거 + 핸들러 ---
  // 팝업의 [가져오기] 탭 → 타겟 지도 선택 시트 열기.
  // 사용자가 기존 지도를 고르거나 '새 지도 만들기'로 신규 지도를 만들고 바로 import 한다.
  const handleImportCommunityFeatureRequest = useCallback((sourceFeatureId) => {
    if (!sourceFeatureId) return
    setImportTargetSheet({ featureId: sourceFeatureId })
  }, [])

  const handleImportPickMap = useCallback((targetMapId) => {
    const featureId = importTargetSheet?.featureId
    if (!featureId || !targetMapId) return
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

  const handleBottomNavChange = useCallback((nextTab) => {
    if (nextTab !== activeTab && !confirmDiscardEditorDraft()) return
    handleTabChange(nextTab)
    if (nextTab !== "maps" && activeMapSource === "shared") {
      setSharedMapData(null)
      setActiveMapSource("local")
      setActiveMapId(maps[0]?.id ?? null)
    }
  }, [activeMapSource, activeTab, confirmDiscardEditorDraft, handleTabChange, maps])

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

  // 프로필 올리기/내리기 공통 confirm 진입점.
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
        : await addMapToProfile(profilePlacementSheet.mapId)
      if (ok) {
        profilePlacementSheet.onSuccess?.()
        setProfilePlacementSheet(null)
      }
    } finally {
      setProfilePlacementSubmitting(false)
    }
  }, [addMapToProfile, profilePlacementSheet, removeMapFromProfile])

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
          // 대시보드/로컬 상태와 동기화. 화면에 남아있는 shares 가 있을 수 있으므로 비운다.
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

    const channel = supabase
      .channel(`loca-map-sync:${mapId}:${activeMapSource}:${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "map_features", filter: `map_id=eq.${mapId}` },
        scheduleSync,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feature_memos" },
        (payload) => {
          const featureId = payload?.new?.feature_id || payload?.old?.feature_id
          if (featureId && featureIds.has(featureId)) {
            scheduleSync()
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feature_media" },
        (payload) => {
          const featureId = payload?.new?.feature_id || payload?.old?.feature_id
          if (featureId && featureIds.has(featureId)) {
            scheduleSync()
          }
        },
      )

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

  // --- Header Config ---

  const headerConfig = useMemo(() => {
    if (activeTab === "maps" && mapsView === "editor") {
      if (activeMapSource === "shared") {
        return {
          subtitle: activeMap ? `${activeMap.title} · 공유 지도` : "공유 지도",
          actionLabel: savingSharedMap ? "저장 중..." : "내 라이브러리에 저장",
          onAction: handleSaveSharedMap,
          actionDisabled: savingSharedMap,
        }
      }
      if (activeMapSource === "demo") {
        return {
          subtitle: activeMap ? `${activeMap.title} · 둘러보기` : "지도 보기",
          actionLabel: null,
          onAction: null,
        }
      }
      if (activeMapSource === "community") {
        return {
          subtitle: "모두의 지도",
          actionLabel: null,
          onAction: null,
        }
      }
      return {
        subtitle: activeMap ? `${activeMap.title} · 편집 중` : "지도 편집",
        actionLabel: null,
        onAction: null,
      }
    }
    return { subtitle: null, actionLabel: null, onAction: null }
  }, [activeMap, activeMapSource, activeTab, handleSaveSharedMap, mapsView, savingSharedMap])

  // --- Render ---

  // 웰컴 화면: 공유 링크 아님 + 미인증 + 웰컴 안 봄
  const showWelcome = !sharedMapData && hasSupabaseEnv && authReady && !authUser && !welcomeDismissed
  if (showWelcome) {
    return (
      <Suspense fallback={<ScreenFallback />}>
        <WelcomeScreen onStart={() => setWelcomeDismissed(true)} />
      </Suspense>
    )
  }

  if (sharedMapData) {
    return (
      <Suspense fallback={<ScreenFallback />}>
        <SharedMapViewer
          map={sharedMapData.map}
          features={sharedMapData.features}
          onSaveToApp={handleSaveSharedMap}
          savingToApp={savingSharedMap}
        />
        <Toast message={toast.message} />
      </Suspense>
    )
  }

  return (
    <div className="app-shell">
      {!isOnline ? (
        <div className="offline-banner">오프라인 모드 - 데이터가 자동 저장됩니다</div>
      ) : null}
      <header className="top-bar">
        <div>
          <strong className="brand">LOCA</strong>
          {!(activeTab === "maps" && mapsView === "list") && headerConfig.subtitle ? (
            <span className="top-bar__subtitle">{headerConfig.subtitle}</span>
          ) : null}
        </div>
        <div className="top-bar__actions">
          {!(activeTab === "maps" && mapsView === "list") && headerConfig.actionLabel ? (
            <button
              className={`button ${activeTab === "profile" ? "button--primary" : "button--ghost"}`}
              type="button"
              onClick={headerConfig.onAction}
              disabled={Boolean(headerConfig.actionDisabled)}
            >
              {headerConfig.actionLabel}
            </button>
          ) : null}
          {activeTab === "profile" ? (
            <button
              className="top-bar__noti-btn"
              type="button"
              aria-label="설정"
              onClick={() => setProfileSettingsOpen(true)}
            >
              <SettingsIcon size={18} />
            </button>
          ) : !(activeTab === "maps" && mapsView === "editor") ? (
            <button
              className="top-bar__noti-btn"
              type="button"
              aria-label="알림"
              onClick={() => setNotiPanelOpen(true)}
            >
              <Bell size={18} />
              {notiHasUnread && <span className="top-bar__noti-dot" />}
            </button>
          ) : null}
        </div>
      </header>

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
      <Suspense fallback={<ScreenFallback />}>
        {showPersonalLoading ? (
          <section className="screen screen--scroll" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
            <div style={{ textAlign: "center", color: "#aaa", fontSize: 13 }}>불러오는 중...</div>
          </section>
        ) : null}

        {showPersonalGate ? (
          <AuthScreen
            onSuccess={(mode) => showToast(mode === "signup" ? "회원가입이 완료됐어요." : "로그인했어요.")}
          />
        ) : null}

        {!showPersonalLoading && !showPersonalGate && activeTab === "home" ? (
          <HomeScreen
            recommendedMaps={recommendedMaps}
            communityMapFeatures={communityMapFeatures}
            communityRequestSummary={communityRequestSummary}
            userStats={userStats}
            viewerProfile={viewerProfile}
            maps={maps}
            features={features}
            followedCount={followed.length}
            onOpenMap={openDemoMap}
            onOpenCommunityEditor={openCommunityMapEditor}
            onResumeMyMap={openMapEditor}
            onCreateMap={() => {
              setActiveTab("maps")
              setMapSheet({ mode: "create", id: null, title: "", description: "", theme: themePalette[0] })
            }}
          />
        ) : null}

        {!showPersonalLoading && !showPersonalGate && activeTab === "maps" && mapsView === "list" ? (
          <MapsListScreen
            maps={maps}
            features={features}
            shares={shares}
            loading={cloudLoading}
            characterImage={levelEmoji}
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
            onOpen={openMapEditor}
            onDelete={(mapId, mapTitle) => {
              if (!window.confirm(`"${mapTitle}" 지도를 삭제할까요?`)) return
              deleteMapAction(mapId)
            }}
            onShare={(mapId) => {
              // MapsList 에서 공유 호출 시 해당 지도로 에디터를 열고, 에디터의 ShareSheet 를 사용한다.
              openMapEditor(mapId)
            }}
            onPublish={(mapId) => setPublishSheet({ caption: "", selectedMapId: mapId })}
            onUnpublish={(mapId) => {
              if (!window.confirm("발행을 중단할까요?\n발행을 중단하면 프로필에서도 내려가요.")) return
              unpublish(mapId)
            }}
            onAddToProfile={(mapId) => requestProfilePlacement("add", mapId)}
            onRemoveFromProfile={(mapId) => requestProfilePlacement("remove", mapId)}
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
            characterStyle={characterStyle}
            levelEmoji={levelEmoji}
            onBack={handleMapEditorBack}
            onFit={() => setFitTrigger((value) => value + 1)}
            onSearchLocation={(loc) => setFocusPoint(loc)}
            onCreatePinAtLocation={handleCreatePinAtLocation}
            onLocate={locateMe}
            onModeChange={(mode) => {
              setEditorMode(mode)
              setDraftPoints([])
              setFocusPoint(null)
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
            onOpenFeatureDetail={openFeatureDetail}
            onAddMemo={addMemo}
            importedCommunityFeatureIds={importedCommunityFeatureIds}
            onImportCommunityFeature={handleImportCommunityFeatureRequest}
            onUnimportCommunityFeature={unimportCommunityFeature}
            onRequestCommunityUpdateFromSummary={requestCommunityFeatureUpdateById}
            onOpenShareEditor={(canvas) => setShareEditorImage(canvas)}
            placementRow={findPlacementForMap(activeMap?.id, shares)}
            onPublishMap={(mapId) => setPublishSheet({ caption: "", selectedMapId: mapId })}
            onUnpublishMap={(mapId) => {
              if (!window.confirm("발행을 중단할까요?\n발행을 중단하면 프로필에서도 내려가요.")) return
              unpublish(mapId)
            }}
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
                  setFocusPoint(null)
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

        {!showPersonalLoading && !showPersonalGate && activeTab === "places" ? <PlacesScreen maps={maps} features={features} characterImage={levelEmoji} onOpenFeature={openFeatureFromPlaces} /> : null}
        {!showPersonalLoading && !showPersonalGate && activeTab === "search" ? <SearchScreen users={users.filter((u) => u.id !== "me")} followed={followed} onToggleFollow={toggleFollow} onSelectUser={setSelectedUserId} /> : null}
        {!showPersonalLoading && !showPersonalGate && activeTab === "profile" ? (
          <ProfileScreen
            user={viewerProfile}
            shares={shares}
            maps={maps}
            features={features}
            followedCount={followed.length}
            cloudMode={cloudMode}
            cloudEmail={authUser?.email || ""}
            characterImage={levelEmoji}
            settingsOpen={profileSettingsOpen}
            onSettingsOpenChange={setProfileSettingsOpen}
            canImportLocalData={cloudMode && readLocalImportData().hasAny}
            onImportLocalData={importLocalDataToCloud}
            onSignOut={cloudMode ? handleSignOut : null}
            onPublishOpen={() => setPublishSheet({ caption: "", selectedMapId: profileUploadCandidates[0]?.id ?? null })}
            onSelectPost={(source, id) => setSelectedPostRef({ source, id })}
            onUpdateProfile={handleUpdateProfile}
            onBatchAddToProfile={async (mapIds) => {
              const results = await Promise.allSettled(mapIds.map((id) => addMapToProfile(id)))
              const succeeded = results.filter((r) => r.status === "fulfilled").length
              if (succeeded === mapIds.length) {
                showToast(`${succeeded}개 지도를 프로필에 올렸어요`)
              } else if (succeeded > 0) {
                showToast(`${succeeded}/${mapIds.length}개 지도를 프로필에 올렸어요`)
              } else {
                showToast("프로필에 올리지 못했어요")
              }
            }}
            onNavigateToMaps={() => setActiveTab("maps")}
            onResetCoachmark={() => {
              resetCoachmark()
              showToast("다음 편집기 진입 시 가이드가 다시 표시돼요")
            }}
            characterStyle={characterStyle}
            onChangeCharacter={setCharacterStyle}
            hasB2BAccess={hasB2BAccess}
            onB2BAccessChange={setHasB2BAccess}
            userStats={userStats}
            souvenirs={souvenirs}
          />
        ) : null}
      </Suspense>
      </main>

      {/* 행사 지도 참여 중이거나 폼 입력 중에는 BottomNav 숨김 */}
      {(activeTab === "maps" && mapsView === "editor" && shouldOpenEventViewer) || keyboardVisible ? null : (
      <BottomNav
        activeTab={activeTab}
        onChange={handleBottomNavChange}
      />
      )}

      {/* Sheets */}
      <MapFormSheet
        mapSheet={mapSheet} setMapSheet={setMapSheet}
        onSave={saveMapSheet} onDelete={deleteMapAction}
        onClose={() => setMapSheet(null)}
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
        if (canDirectlyEdit) {
          return (
            <FeatureEditSheet
              featureSheet={featureSheet}
              setFeatureSheet={setFeatureSheet}
              mapMode={isCommunityFeature ? "community" : "personal"}
              mapTitle={activeMap?.title || ""}
              readOnly={mapEditorReadOnly}
              onClose={() => { setFeatureSheet(null); setSelectedFeatureId(null) }}
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
            onClose={() => { setFeatureSheet(null); setSelectedFeatureId(null) }}
            onSave={saveFeatureSheet} onDelete={deleteFeature}
            onRelocatePin={activeMapSource === "local" && !mapEditorReadOnly ? startRelocatePin : undefined}
            photoInputRef={photoInputRef} isRecording={isRecording} recordingSeconds={recordingSeconds}
            onPhotoSelected={handlePhotoSelected} onDeletePhoto={handleDeletePhoto}
            onStartRecording={startRecording} onStopRecording={stopRecording} onDeleteVoice={handleDeleteVoice}
            memoText={memoText} onMemoTextChange={setMemoText} onAddMemo={addMemo}
            onRequestCommunityUpdate={requestCommunityFeatureUpdate}
          />
        )
      })()}
      <ImportTargetMapSheet
        open={Boolean(importTargetSheet)}
        maps={maps}
        features={features}
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
        candidates={profileUploadCandidates} features={features}
        onPublish={handlePublishSubmit}
        onAddToProfile={(mapId) => {
          // 이미 발행된 지도: 공통 confirm 으로 바로 전환.
          setPublishSheet(null)
          requestProfilePlacement("add", mapId)
        }}
        onOfferAddToProfile={(mapId) => {
          // 발행 성공 후 공통 confirm 시트로 전환.
          setPublishSheet(null)
          requestProfilePlacement("add", mapId)
        }}
        publishing={publishSubmitting}
        onClose={() => setPublishSheet(null)}
      />
      <UserProfileSheet
        user={selectedUser} userPosts={selectedUserPosts}
        isFollowing={selectedUser ? followed.includes(selectedUser.id) : false}
        onClose={() => setSelectedUserId(null)}
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

      <Toast message={toast.message} />
    </div>
  )
}

