import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { Bell } from "lucide-react"
import { BottomNav, Toast } from "./components/ui"
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
import { hasSupabaseEnv } from "./lib/supabase"
import { getPublishedMapBySlug } from "./lib/mapService"
// 라우트별 코드 스플리팅 — 라이트웹(/s/:slug)은 SharedMapViewer 청크만 로딩
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
import { AppSheets } from "./components/AppSheets"
import "./shared-viewer.css"
import "./map-share-editor.css"

function ScreenFallback() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", color: "#999" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🗺</div>
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
  const [publishSheet, setPublishSheet] = useState(null)
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [selectedPostRef, setSelectedPostRef] = useState(null)
  const [memoText, setMemoText] = useState("")
  const [shareEditorImage, setShareEditorImage] = useState(null)
  const [importSheetOpen, setImportSheetOpen] = useState(false)
  const [characterStyle, setCharacterStyle] = useLocalStorageState("loca.mobile.characterStyle", "m3")

  const isOnline = useOnlineStatus()
  const toast = useToast()
  const showToast = toast.show

  useEffect(() => { setStorageWarningCallback(showToast) }, [showToast])
  useEffect(() => {
    cleanupOrphanedMedia([...features, ...communityMapFeatures])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  // --- Derived data ---

  const usersById = useMemo(() => {
    const mergedUsers = viewerProfile.id === me.id ? users : [viewerProfile, ...users]
    return Object.fromEntries(mergedUsers.map((user) => [user.id, user]))
  }, [viewerProfile])
  const communityMapMeta = useMemo(() => [{ id: "community-map", title: "모두의 지도", description: "모두가 함께 만드는 지도", theme: "#4f46e5", updatedAt: new Date().toISOString() }], [])
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
  const recommendedMaps = useMemo(() => {
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
  }, [communityFeed])

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

  const unpublishedMaps = maps.filter((mapItem) => !shares.some((share) => share.mapId === mapItem.id))
  const shareUrl = useMemo(() => {
    if (!activeMap) return ""
    if (activeMap.slug && activeMap.isPublished) {
      return buildSlugShareUrl(activeMap.slug, "link")
    }
    return buildMapShareUrl(activeMap, activeFeatures)
  }, [activeFeatures, activeMap])

  const featureEmojiChoices = featureSheet
    ? featureSheet.type === "route"
      ? [...placeEmojis, "🛣️", "🚶", "🚗", "🚲", "🏃", "🛤️", "🧭", "🗺️"]
      : featureSheet.type === "area"
        ? ["🟩", "📐", "🏞️", "🌳", "🏕️", "🏟️", "🌊", "🏔️", "🗾", "🌾"]
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
    importSharedMapToLocal, publishMap, unpublish,
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
  })

  const handleImportMap = useCallback(async (slugCode) => {
    if (!hasSupabaseEnv) throw new Error("클라우드 연결이 필요해요.")
    const bundle = await getPublishedMapBySlug(slugCode)
    if (!bundle) throw new Error("해당 코드의 지도를 찾을 수 없어요.")
    const { map: importedMap, features: importedFeatures } = bundle
    if (maps.some((m) => m.id === importedMap.id)) {
      showToast("이미 목록에 있는 지도예요.")
      openMapEditor(importedMap.id)
      return
    }
    setMaps((prev) => [importedMap, ...prev])
    setFeatures((prev) => [...prev, ...importedFeatures])
    showToast(`"${importedMap.title}" 지도를 가져왔어요!`)
    openMapEditor(importedMap.id)
  }, [maps, setMaps, setFeatures, showToast, openMapEditor])

  const {
    focusFeature, focusFeatureOnly, openFeatureDetail,
    saveFeatureSheet, deleteFeature,
    addMemo, createHandleMapTap, completeRoute, completeArea,
    startRelocatePin,
  } = useFeatureEditing({
    activeMapId, activeMapSource, cloudMode,
    setFeatures, featureSheet, setFeatureSheet,
    selectedFeatureSummaryId,
    setSelectedFeatureId, setSelectedFeatureSummaryId,
    setEditorMode, setDraftPoints, setMemoText,
    activeFeaturePool, communityMapFeatures, setCommunityMapFeatures,
    touchMap, showToast, setMaps,
    maps, features, refreshGameProfile, myLocation,
  })

  const handleMapTap = useMemo(() => createHandleMapTap(editorMode), [createHandleMapTap, editorMode])

  // --- Social / Profile ---

  const {
    handleUpdateProfile, toggleFollow, likePost, saveSharePlaceToMap,
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

  // --- Route effects ---

  useEffect(() => {
    if (routeAtLoad?.type === "invalid-shared") {
      showToast("공유 링크를 열지 못했어요.")
    }
    if (routeAtLoad?.type === "map" && !initialStoredTarget && (!hasSupabaseEnv || authReady)) {
      showToast("이 기기에서 찾을 수 없는 지도예요.")
    }
  }, [authReady, initialStoredTarget, routeAtLoad?.type, showToast])

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

  // 로컬 모드에서 현재 activeMapId가 maps에 없으면 보정 (렌더 중 조건부 setState — React 공식 패턴)
  if (activeMapSource === "local") {
    if (mapsView === "editor" && maps.length === 0 && activeMapId) {
      setMapsView("list")
    } else if (activeMapId && !maps.some((mapItem) => mapItem.id === activeMapId) && maps.length > 0) {
      setActiveMapId(maps[0].id)
    }
  }

  useEffect(() => {
    const nextPath = activeTab === "maps" && mapsView === "editor" && activeMapId
      ? activeMapSource === "shared" && sharedMapData
        ? buildMapSharePath(sharedMapData.map, sharedMapData.features)
        : buildMapRoutePath(activeMapId)
      : "/"
    const currentPath = `${window.location.pathname}${window.location.search}`
    if (currentPath !== nextPath) {
      window.history.replaceState(null, "", nextPath)
    }
  }, [activeMapId, activeMapSource, activeTab, mapsView, sharedMapData])

  // --- Header Config ---

  const headerConfig = useMemo(() => {
    if (activeTab === "maps" && mapsView === "editor") {
      if (activeMapSource === "shared") {
        return {
          subtitle: activeMap ? `${activeMap.title} · 공유 지도` : "공유 지도",
          actionLabel: "내 지도로 저장",
          onAction: importSharedMapToLocal,
        }
      }
      if (activeMapSource === "demo") {
        return {
          subtitle: activeMap ? `${activeMap.title} · 둘러보기` : "지도 보기",
          actionLabel: "맞춤 보기",
          onAction: () => setFitTrigger((value) => value + 1),
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
        actionLabel: "맞춤 보기",
        onAction: () => setFitTrigger((value) => value + 1),
      }
    }
    return { subtitle: null, actionLabel: null, onAction: null }
  }, [activeMap, activeMapSource, activeTab, importSharedMapToLocal, mapsView])

  // --- Render ---

  if (sharedMapData) {
    return (
      <Suspense fallback={<ScreenFallback />}>
        <SharedMapViewer
          map={sharedMapData.map}
          features={sharedMapData.features}
          onSaveToApp={importSharedMapToLocal}
        />
        <Toast message={toast.message} />
      </Suspense>
    )
  }

  return (
    <div className="app-shell">
      {!isOnline ? (
        <div className="offline-banner">오프라인 모드 — 데이터가 자동 저장됩니다</div>
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
            <button className={`button ${activeTab === "profile" ? "button--primary" : "button--ghost"}`} type="button" onClick={headerConfig.onAction}>
              {headerConfig.actionLabel}
            </button>
          ) : null}
          <button className="top-bar__noti-btn" type="button" aria-label="알림">
            <Bell size={18} />
          </button>
        </div>
      </header>

      <main className="content">
      <Suspense fallback={<ScreenFallback />}>
        {showPersonalLoading ? (
          <section className="screen screen--scroll" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
            <div style={{ textAlign: "center", color: "#aaa", fontSize: 13 }}>불러오는 중...</div>
          </section>
        ) : null}

        {showPersonalGate ? (
          <AuthScreen
            title="LOCA 계정 연결"
            subtitle="내 지도와 프로필을 기기마다 불러오려면 먼저 로그인해 주세요."
            onSuccess={(mode) => showToast(mode === "signup" ? "회원가입이 완료됐어요." : "로그인했어요.")}
          />
        ) : null}

        {!showPersonalLoading && !showPersonalGate && activeTab === "home" ? (
          <HomeScreen
            recommendedMaps={recommendedMaps}
            communityMapFeatures={communityMapFeatures}
            userStats={userStats}
            viewerProfile={viewerProfile}
            souvenirs={souvenirs}
            onOpenMap={openDemoMap}
            onOpenCommunityEditor={openCommunityMapEditor}
          />
        ) : null}

        {!showPersonalLoading && !showPersonalGate && activeTab === "maps" && mapsView === "list" ? (
          <MapsListScreen
            maps={maps}
            features={features}
            loading={cloudLoading}
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
          />
        ) : null}

        {/* 행사 지도 → participant shell (SharedMapViewer) */}
        {!showPersonalLoading && !showPersonalGate && activeTab === "maps" && mapsView === "editor" && activeMap && activeMap.category === "event" ? (
          <SharedMapViewer
            map={activeMap}
            features={activeFeatures}
            onSaveToApp={null}
            onBack={() => {
              setMapsView("list")
              resetEditorState()
              setActiveMapSource("local")
            }}
          />
        ) : null}

        {/* 일반 지도 → MapEditorScreen */}
        {!showPersonalLoading && !showPersonalGate && activeTab === "maps" && mapsView === "editor" && activeMap && activeMap.category !== "event" ? (
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
            readOnly={activeMapSource === "demo" || activeMapSource === "shared"}
            hideCount={activeMapSource === "community"}
            communityMode={activeMapSource === "community"}
            shareUrl={shareUrl}
            showLabels={showMapLabels}
            characterStyle={characterStyle}
            levelEmoji={levelEmoji}
            onBack={() => {
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
            }}
            onFit={() => setFitTrigger((value) => value + 1)}
            onSearchLocation={(loc) => setFocusPoint(loc)}
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
            onOpenShareEditor={(canvas) => setShareEditorImage(canvas)}
            onCloseFeatureSummary={() => {
              setSelectedFeatureId(null)
              setSelectedFeatureSummaryId(null)
            }}
            showToast={showToast}
          />
        ) : null}

        {!showPersonalLoading && !showPersonalGate && activeTab === "places" ? <PlacesScreen maps={maps} features={features} onOpenFeature={openFeatureFromPlaces} /> : null}
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
            canImportLocalData={cloudMode && readLocalImportData().hasAny}
            onImportLocalData={importLocalDataToCloud}
            onSignOut={cloudMode ? handleSignOut : null}
            onPublishOpen={() => setPublishSheet({ caption: "", selectedMapId: unpublishedMaps[0]?.id ?? null })}
            onSelectPost={(source, id) => setSelectedPostRef({ source, id })}
            onUpdateProfile={handleUpdateProfile}
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

      {/* 행사 지도 참여 중에는 BottomNav 숨김 */}
      {activeTab === "maps" && mapsView === "editor" && activeMap?.category === "event" ? null : (
      <BottomNav
        activeTab={activeTab}
        onChange={(nextTab) => {
          handleTabChange(nextTab)
          if (nextTab !== "maps" && activeMapSource === "shared") {
            setSharedMapData(null)
            setActiveMapSource("local")
            setActiveMapId(maps[0]?.id ?? null)
          }
        }}
      />
      )}

      <AppSheets
        mapSheet={mapSheet} setMapSheet={setMapSheet} saveMapSheet={saveMapSheet} deleteMapAction={deleteMapAction}
        featureSheet={featureSheet} setFeatureSheet={setFeatureSheet} activeMapSource={activeMapSource}
        featureEmojiChoices={featureEmojiChoices} setSelectedFeatureId={setSelectedFeatureId}
        saveFeatureSheet={saveFeatureSheet} deleteFeature={deleteFeature} startRelocatePin={startRelocatePin}
        photoInputRef={photoInputRef} isRecording={isRecording} recordingSeconds={recordingSeconds}
        handlePhotoSelected={handlePhotoSelected} handleDeletePhoto={handleDeletePhoto}
        startRecording={startRecording} stopRecording={stopRecording} handleDeleteVoice={handleDeleteVoice}
        memoText={memoText} setMemoText={setMemoText} addMemo={addMemo}
        publishSheet={publishSheet} setPublishSheet={setPublishSheet} unpublishedMaps={unpublishedMaps}
        features={features} publishMap={publishMap}
        selectedUser={selectedUser} selectedUserPosts={selectedUserPosts} followed={followed}
        setSelectedUserId={setSelectedUserId} toggleFollow={toggleFollow} setSelectedPostRef={setSelectedPostRef}
        selectedPost={selectedPost} likePost={likePost} openMapEditor={openMapEditor} unpublish={unpublish}
        shareEditorImage={shareEditorImage} setShareEditorImage={setShareEditorImage}
        activeMap={activeMap} activeFeatures={activeFeatures} shareUrl={shareUrl} showToast={showToast}
        pendingSharePlace={pendingSharePlace} setPendingSharePlace={setPendingSharePlace}
        maps={maps} saveSharePlaceToMap={saveSharePlaceToMap}
        importSheetOpen={importSheetOpen} setImportSheetOpen={setImportSheetOpen} handleImportMap={handleImportMap}
      />

      <Toast message={toast.message} />
    </div>
  )
}
