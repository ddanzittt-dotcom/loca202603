import { useCallback, useEffect, useMemo, useState } from "react"
import { Geolocation } from "@capacitor/geolocation"
import { BottomNav, Toast } from "./components/ui"
import {
  collections,
  communityMapFeaturesSeed,
  communityPostsSeed,
  demoFeatures,
  demoMaps,
  featuresSeed,
  followedSeed,
  mapsSeed,
  me,
  sharesSeed,
  users,
} from "./data/sampleData"
import { useLocalStorageState, useToast } from "./hooks/useAppState"
import {
  buildCommunityPosts,
  buildMapRoutePath,
  buildMapSharePath,
  buildMapShareUrl,
  buildOwnPosts,
  createId,
  parseAppLocation,
  placeEmojis,
  themePalette,
} from "./lib/appUtils"
import { getCurrentSession, onAuthStateChange, signOut } from "./lib/auth"
import { hasSupabaseEnv } from "./lib/supabase"
import {
  createFeature as createFeatureRecord,
  createMap as createMapRecord,
  followUser as followUserRecord,
  getMyAppData,
  getProfile as getProfileRecord,
  publishMap as publishMapRecord,
  unfollowUser as unfollowUserRecord,
} from "./lib/mapService"
import { AuthScreen } from "./screens/AuthScreen"
import { HomeScreen } from "./screens/HomeScreen"
import { MapEditorScreen } from "./screens/MapEditorScreen"
import { MapsListScreen } from "./screens/MapsListScreen"
import { PlacesScreen } from "./screens/PlacesScreen"
import { ProfileScreen } from "./screens/ProfileScreen"
import { SearchScreen } from "./screens/SearchScreen"
import { SharedMapViewer } from "./screens/SharedMapViewer"
import { MapShareEditor } from "./screens/MapShareEditor"
import { useFeaturePool } from "./hooks/useFeaturePool"
import { useMediaHandlers } from "./hooks/useMediaHandlers"
import { useFeatureEditing, toEditableFeature } from "./hooks/useFeatureEditing"
import { useMapCRUD } from "./hooks/useMapCRUD"
import { FeatureDetailSheet } from "./components/sheets/FeatureDetailSheet"
import { MapFormSheet } from "./components/sheets/MapFormSheet"
import { PublishSheet } from "./components/sheets/PublishSheet"
import { UserProfileSheet } from "./components/sheets/UserProfileSheet"
import { PostDetailSheet } from "./components/sheets/PostDetailSheet"
import { SharePlaceSheet } from "./components/sheets/SharePlaceSheet"
import "./shared-viewer.css"
import "./map-share-editor.css"

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
  const [followed, setFollowed] = useLocalStorageState("loca.mobile.followed", followedSeed)
  const [communityPosts, setCommunityPosts] = useLocalStorageState("loca.mobile.communityPosts", communityPostsSeed)
  const [likedPosts, setLikedPosts] = useLocalStorageState("loca.mobile.likedPosts", [])
  const [communityMapFeatures, setCommunityMapFeatures] = useLocalStorageState("loca.mobile.communityMapFeatures", communityMapFeaturesSeed)
  const [authReady, setAuthReady] = useState(!hasSupabaseEnv)
  const [authUser, setAuthUser] = useState(null)
  const [viewerProfile, setViewerProfile] = useLocalStorageState("loca.mobile.viewerProfile", me)
  const [cloudLoading, setCloudLoading] = useState(false)
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
  const toast = useToast()
  const showToast = toast.show
  const [localImportSnapshot] = useState(() => {
    const readStored = (key, fallback) => {
      try {
        const raw = window.localStorage.getItem(key)
        if (!raw) return { exists: false, value: fallback }
        return { exists: true, value: JSON.parse(raw) }
      } catch (error) {
        console.error(`Failed to snapshot ${key}`, error)
        return { exists: false, value: fallback }
      }
    }

    const storedMaps = readStored("loca.mobile.maps", [])
    const storedFeatures = readStored("loca.mobile.features", [])
    const storedShares = readStored("loca.mobile.shares", [])
    const storedFollowed = readStored("loca.mobile.followed", [])

    return {
      maps: storedMaps.value,
      features: storedFeatures.value,
      shares: storedShares.value,
      followed: storedFollowed.value,
      hasAny:
        (storedMaps.exists && storedMaps.value.length > 0) ||
        (storedFeatures.exists && storedFeatures.value.length > 0) ||
        (storedShares.exists && storedShares.value.length > 0) ||
        (storedFollowed.exists && storedFollowed.value.length > 0),
    }
  })

  const cloudMode = hasSupabaseEnv && Boolean(authUser)
  const needsAuthForPersonalArea = hasSupabaseEnv && authReady && !authUser
  const requiresAuthForCurrentTab =
    activeTab === "profile" ||
    activeTab === "places" ||
    (activeTab === "maps" && (mapsView === "list" || activeMapSource === "local"))
  const showPersonalGate = needsAuthForPersonalArea && requiresAuthForCurrentTab
  const showPersonalLoading = hasSupabaseEnv && (!authReady || cloudLoading) && requiresAuthForCurrentTab

  const usersById = useMemo(() => {
    const mergedUsers = viewerProfile.id === me.id ? users : [viewerProfile, ...users]
    return Object.fromEntries(mergedUsers.map((user) => [user.id, user]))
  }, [viewerProfile])
  const communityMapMeta = useMemo(() => [{ id: "community-map", title: "모두의 지도", description: "모두가 함께 만드는 지도", theme: "#635bff", updatedAt: new Date().toISOString() }], [])
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
  const shareUrl = useMemo(
    () => (activeMap ? buildMapShareUrl(activeMap, activeFeatures) : ""),
    [activeFeatures, activeMap],
  )

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
  } = useMediaHandlers({ featureSheet, setFeatureSheet, updateFeatures, showToast })

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
  })

  const {
    focusFeature, focusFeatureOnly, openFeatureDetail,
    saveFeatureSheet, deleteFeature,
    addMemo, createHandleMapTap, completeRoute, completeArea,
  } = useFeatureEditing({
    activeMapId, activeMapSource, cloudMode,
    setFeatures, featureSheet, setFeatureSheet,
    selectedFeatureSummaryId,
    setSelectedFeatureId, setSelectedFeatureSummaryId,
    setEditorMode, setDraftPoints, setFocusPoint, setMemoText,
    activeFeaturePool, communityMapFeatures, setCommunityMapFeatures,
    touchMap, showToast, setMaps,
  })

  const handleMapTap = useMemo(() => createHandleMapTap(editorMode), [createHandleMapTap, editorMode])

  // --- Auth & Cloud ---

  const loadCloudData = useCallback(async (user) => {
    if (!hasSupabaseEnv || !user) return
    setCloudLoading(true)
    try {
      const [appData, profile] = await Promise.all([
        getMyAppData(),
        getProfileRecord(user.id),
      ])

      const nextProfile = {
        id: user.id,
        name: profile.nickname || user.user_metadata?.name || user.email?.split("@")[0] || "LOCA 사용자",
        handle: profile.slug ? `@${profile.slug}` : `@${(profile.nickname || user.email?.split("@")[0] || "loca").toLowerCase().replace(/\s+/g, "_")}`,
        emoji: me.emoji,
        bio: profile.bio || me.bio,
        followers: 0,
        following: appData.followed.length,
        verified: false,
        type: "creator",
      }

      setMaps(appData.maps)
      setFeatures(appData.features)
      setShares(appData.shares)
      setFollowed(appData.followed)
      setViewerProfile(nextProfile)
      setActiveMapId((current) => {
        if (current && appData.maps.some((mapItem) => mapItem.id === current)) return current
        return appData.maps[0]?.id ?? null
      })
      if (routeAtLoad?.type === "map" && appData.maps.some((mapItem) => mapItem.id === routeAtLoad.mapId)) {
        setActiveTab("maps")
        setMapsView("editor")
        setActiveMapSource("local")
        setActiveMapId(routeAtLoad.mapId)
      }
    } catch (error) {
      console.error("Failed to load Supabase app data", error)
      showToast("Supabase 데이터를 불러오지 못했어요.")
    } finally {
      setCloudLoading(false)
    }
  }, [routeAtLoad, setFeatures, setFollowed, setMaps, setShares, showToast])

  useEffect(() => {
    if (routeAtLoad?.type === "invalid-shared") {
      showToast("공유 링크를 열지 못했어요.")
    }
    if (routeAtLoad?.type === "map" && !initialStoredTarget && (!hasSupabaseEnv || authReady)) {
      showToast("이 기기에서 찾을 수 없는 지도예요.")
    }
  }, [authReady, initialStoredTarget, routeAtLoad?.type, showToast])

  useEffect(() => {
    if (!hasSupabaseEnv) return undefined

    let isMounted = true

    getCurrentSession()
      .then((session) => {
        if (!isMounted) return
        setAuthUser(session?.user ?? null)
        setAuthReady(true)
        if (session?.user) {
          loadCloudData(session.user)
        }
      })
      .catch((error) => {
        console.error("Failed to resolve initial auth session", error)
        if (isMounted) setAuthReady(true)
      })

    const { data: subscription } = onAuthStateChange((user) => {
      if (!isMounted) return
      setAuthUser(user)
      setAuthReady(true)
      if (user) {
        loadCloudData(user)
      } else {
        setViewerProfile(me)
      }
    })

    return () => {
      isMounted = false
      subscription.subscription.unsubscribe()
    }
  }, [loadCloudData])

  useEffect(() => {
    if (activeMapSource !== "local") return
    if (activeMapId && maps.some((mapItem) => mapItem.id === activeMapId)) return
    if (mapsView === "editor" && maps.length === 0) {
      setMapsView("list")
      return
    }
    if (maps.length > 0) {
      setActiveMapId(maps[0].id)
    }
  }, [activeMapId, activeMapSource, maps, mapsView])

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

  // --- Profile & Social ---

  const saveSharePlaceToMap = useCallback(async (targetMapId) => {
    if (!pendingSharePlace || !targetMapId) return
    const place = pendingSharePlace
    if (place.lat != null && place.lng != null) {
      const nextFeature = {
        id: createId("feat"),
        mapId: targetMapId,
        type: "pin",
        title: place.title || "공유 장소",
        emoji: "\uD83D\uDCCD",
        lat: place.lat,
        lng: place.lng,
        tags: [],
        note: place.source !== "unknown" ? `${place.source} 에서 공유됨` : "",
        highlight: false,
        updatedAt: new Date().toISOString(),
      }
      if (cloudMode) {
        try {
          const created = await createFeatureRecord(targetMapId, nextFeature)
          setFeatures((current) => [created, ...current])
        } catch (error) {
          console.error("Failed to create shared place pin", error)
          showToast("장소를 저장하지 못했어요.")
          return
        }
      } else {
        setFeatures((current) => [nextFeature, ...current])
      }
      touchMap(targetMapId)
      setPendingSharePlace(null)
      setActiveTab("maps")
      setMapsView("editor")
      setActiveMapId(targetMapId)
      setActiveMapSource("local")
      setSelectedFeatureId(nextFeature.id)
      setFeatureSheet(toEditableFeature(nextFeature))
      setEditorMode("browse")
      showToast("장소가 저장되었어요.")
    } else {
      setPendingSharePlace(null)
      setActiveTab("maps")
      setMapsView("editor")
      setActiveMapId(targetMapId)
      setActiveMapSource("local")
      setEditorMode("pin")
      showToast("지도를 탭해서 위치를 지정하세요")
    }
  }, [cloudMode, pendingSharePlace, setFeatures, showToast, touchMap])

  const handleUpdateProfile = useCallback(({ name, bio, emoji }) => {
    setViewerProfile((prev) => ({
      ...prev,
      name: name ?? prev.name,
      bio: bio ?? prev.bio,
      emoji: emoji ?? prev.emoji,
    }))
  }, [setViewerProfile])

  const toggleFollow = async (userId) => {
    const isFollowing = followed.includes(userId)
    try {
      if (cloudMode) {
        if (isFollowing) await unfollowUserRecord(userId)
        else await followUserRecord(userId)
      }
      setFollowed((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]))
    } catch (error) {
      console.error("Failed to toggle follow", error)
      showToast("팔로우 상태를 바꾸지 못했어요.")
    }
  }

  const likePost = (source, postId) => {
    const likeKey = `${source}:${postId}`
    if (likedPosts.includes(likeKey)) {
      showToast("이미 좋아요를 눌렀어요.")
      return
    }
    setLikedPosts((current) => [...current, likeKey])
    if (source === "own") {
      return setShares((current) => current.map((share) => (share.id === postId ? { ...share, likes: share.likes + 1 } : share)))
    }
    setCommunityPosts((current) => current.map((post) => (post.id === postId ? { ...post, likes: post.likes + 1 } : post)))
  }

  const importLocalDataToCloud = useCallback(async () => {
    if (!cloudMode) return showToast("먼저 로그인해 주세요.")
    if (!localImportSnapshot.hasAny) return showToast("이 기기에서 가져올 로컬 데이터가 없어요.")
    if (!window.confirm("이 기기에 저장된 로컬 지도를 현재 계정으로 가져올까요?")) return

    try {
      const mapIdMap = new Map()

      for (const localMap of localImportSnapshot.maps) {
        const createdMap = await createMapRecord({
          title: localMap.title,
          description: localMap.description,
          theme: localMap.theme,
          visibility: localMap.visibility || "private",
          tags: localMap.tags || [],
        })
        mapIdMap.set(localMap.id, createdMap)
      }

      for (const localFeature of localImportSnapshot.features) {
        const targetMap = mapIdMap.get(localFeature.mapId)
        if (!targetMap) continue
        await createFeatureRecord(targetMap.id, {
          ...localFeature,
          mapId: targetMap.id,
        })
      }

      for (const localShare of localImportSnapshot.shares) {
        const targetMap = mapIdMap.get(localShare.mapId)
        if (!targetMap) continue
        // publishMapRecord is used from useMapCRUD but we need direct import here
        await publishMapRecord(targetMap.id, {
          caption: localShare.caption || "",
        })
      }

      for (const userId of localImportSnapshot.followed) {
        try {
          await followUserRecord(userId)
        } catch (error) {
          console.warn("Skipping follow import", userId, error)
        }
      }

      await loadCloudData(authUser)
      showToast("이 기기의 로컬 데이터를 계정으로 가져왔어요.")
    } catch (error) {
      console.error("Failed to import local snapshot", error)
      showToast("로컬 데이터를 가져오지 못했어요.")
    }
  }, [authUser, cloudMode, loadCloudData, localImportSnapshot, showToast])

  const handleSignOut = useCallback(async () => {
    try {
      await signOut()
      showToast("로그아웃했어요.")
    } catch (error) {
      console.error("Failed to sign out", error)
      showToast("로그아웃하지 못했어요.")
    }
  }, [showToast])

  const locateMe = async () => {
    try {
      const permStatus = await Geolocation.checkPermissions()
      if (permStatus.location === "denied") {
        const req = await Geolocation.requestPermissions()
        if (req.location === "denied") {
          showToast("위치 권한을 확인해주세요.")
          return
        }
      }
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      })
      const nextLocation = { lat: position.coords.latitude, lng: position.coords.longitude }
      setFocusPoint({ ...nextLocation, zoom: 16 })
      showToast("현재 위치로 이동했어요.")
    } catch {
      showToast("위치를 가져올 수 없어요. 권한을 확인해주세요.")
    }
  }

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
          actionLabel: "맞춤 보기",
          onAction: () => setFitTrigger((value) => value + 1),
        }
      }
      return {
        subtitle: activeMap ? `${activeMap.title} · 편집 중` : "지도 편집",
        actionLabel: "맞춤 보기",
        onAction: () => setFitTrigger((value) => value + 1),
      }
    }
    if (activeTab === "maps") {
      return { subtitle: null, actionLabel: null, onAction: null }
    }
    if (activeTab === "profile") {
      return { subtitle: "내 프로필과 그리드", actionLabel: null, onAction: null }
    }
    if (activeTab === "places") {
      return { subtitle: "장소와 경로 목록", actionLabel: null, onAction: null }
    }
    if (activeTab === "search") {
      return { subtitle: null, actionLabel: null, onAction: null }
    }
    return { subtitle: null, actionLabel: null, onAction: null }
  }, [activeMap, activeMapSource, activeTab, importSharedMapToLocal, mapsView])

  // --- Render ---

  if (sharedMapData) {
    return (
      <>
        <SharedMapViewer
          map={sharedMapData.map}
          features={sharedMapData.features}
          onSaveToApp={importSharedMapToLocal}
        />
        <Toast message={toast.message} />
      </>
    )
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div>
          <strong className="brand">LOCA</strong>
          {!(activeTab === "maps" && mapsView === "list") && headerConfig.subtitle ? (
            <span className="top-bar__subtitle">{headerConfig.subtitle}</span>
          ) : null}
        </div>
        {!(activeTab === "maps" && mapsView === "list") && headerConfig.actionLabel ? (
          <button className={`button ${activeTab === "profile" ? "button--primary" : "button--ghost"}`} type="button" onClick={headerConfig.onAction}>
            {headerConfig.actionLabel}
          </button>
        ) : null}
      </header>

      <main className="content">
        {showPersonalLoading ? (
          <section className="screen screen--scroll">
            <article className="empty-card">
              <strong>내 지도를 불러오는 중이에요.</strong>
              <p>Supabase 계정과 연결된 데이터를 확인하고 있어요.</p>
            </article>
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
            onOpenMap={openDemoMap}
            onOpenCommunityEditor={openCommunityMapEditor}
          />
        ) : null}

        {!showPersonalLoading && !showPersonalGate && activeTab === "maps" && mapsView === "list" ? (
          <MapsListScreen
            maps={maps}
            features={features}
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
                })
              }
            }}
            onOpen={openMapEditor}
          />
        ) : null}

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
            readOnly={activeMapSource === "demo" || activeMapSource === "shared"}
            hideCount={activeMapSource === "community"}
            communityMode={activeMapSource === "community"}
            shareUrl={shareUrl}
            showLabels={showMapLabels}
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
            onEditMap={() =>
              setMapSheet({
                mode: "edit",
                id: activeMap.id,
                title: activeMap.title,
                description: activeMap.description,
                theme: activeMap.theme,
              })
            }
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
            canImportLocalData={cloudMode && localImportSnapshot.hasAny}
            onImportLocalData={importLocalDataToCloud}
            onSignOut={cloudMode ? handleSignOut : null}
            onPublishOpen={() => setPublishSheet({ caption: "", selectedMapId: unpublishedMaps[0]?.id ?? null })}
            onSelectPost={(source, id) => setSelectedPostRef({ source, id })}
            onUpdateProfile={handleUpdateProfile}
          />
        ) : null}
      </main>

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

      <MapFormSheet
        mapSheet={mapSheet}
        setMapSheet={setMapSheet}
        onSave={saveMapSheet}
        onDelete={deleteMapAction}
        onClose={() => setMapSheet(null)}
      />

      <FeatureDetailSheet
        featureSheet={featureSheet}
        setFeatureSheet={setFeatureSheet}
        activeMapSource={activeMapSource}
        featureEmojiChoices={featureEmojiChoices}
        onClose={() => {
          setFeatureSheet(null)
          setSelectedFeatureId(null)
        }}
        onSave={saveFeatureSheet}
        onDelete={deleteFeature}
        photoInputRef={photoInputRef}
        isRecording={isRecording}
        recordingSeconds={recordingSeconds}
        onPhotoSelected={handlePhotoSelected}
        onDeletePhoto={handleDeletePhoto}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onDeleteVoice={handleDeleteVoice}
        memoText={memoText}
        onMemoTextChange={setMemoText}
        onAddMemo={addMemo}
      />

      <PublishSheet
        publishSheet={publishSheet}
        setPublishSheet={setPublishSheet}
        unpublishedMaps={unpublishedMaps}
        features={features}
        onPublish={() => publishMap()}
        onClose={() => setPublishSheet(null)}
      />

      <UserProfileSheet
        user={selectedUser}
        userPosts={selectedUserPosts}
        isFollowing={selectedUser ? followed.includes(selectedUser.id) : false}
        onClose={() => setSelectedUserId(null)}
        onToggleFollow={toggleFollow}
        onSelectPost={setSelectedPostRef}
      />

      <PostDetailSheet
        post={selectedPost}
        onClose={() => setSelectedPostRef(null)}
        onLike={likePost}
        onOpenMap={openMapEditor}
        onUnpublish={unpublish}
      />

      {shareEditorImage ? (
        <MapShareEditor
          mapImage={shareEditorImage}
          mapTitle={activeMap?.title || "LOCA"}
          mapTheme={activeMap?.theme}
          mapFeatures={activeFeatures}
          shareUrl={shareUrl}
          onClose={() => setShareEditorImage(null)}
          showToast={showToast}
        />
      ) : null}

      <SharePlaceSheet
        pendingSharePlace={pendingSharePlace}
        maps={maps}
        features={features}
        onSaveToMap={saveSharePlaceToMap}
        onClose={() => setPendingSharePlace(null)}
      />

      <Toast message={toast.message} />
    </div>
  )
}
