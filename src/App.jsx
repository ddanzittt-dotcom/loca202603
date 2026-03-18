import { useCallback, useEffect, useMemo, useState } from "react"
import { Avatar, BottomNav, BottomSheet, MapPreview, Toast } from "./components/ui"
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
  tagsToText,
  themePalette,
} from "./lib/appUtils"
import { getCurrentSession, onAuthStateChange, signOut } from "./lib/auth"
import { hasSupabaseEnv } from "./lib/supabase"
import {
  createFeature as createFeatureRecord,
  createMap as createMapRecord,
  deleteFeature as deleteFeatureRecord,
  deleteMap as deleteMapRecord,
  followUser as followUserRecord,
  getMyAppData,
  getProfile as getProfileRecord,
  publishMap as publishMapRecord,
  unfollowUser as unfollowUserRecord,
  unpublishMap as unpublishMapRecord,
  updateFeature as updateFeatureRecord,
  updateMap as updateMapRecord,
} from "./lib/mapService"
import { AuthScreen } from "./screens/AuthScreen"
import { HomeScreen } from "./screens/HomeScreen"
import { MapEditorScreen } from "./screens/MapEditorScreen"
import { MapsListScreen } from "./screens/MapsListScreen"
import { PlacesScreen } from "./screens/PlacesScreen"
import { ProfileScreen } from "./screens/ProfileScreen"
import { SearchScreen } from "./screens/SearchScreen"

const toEditableFeature = (feature) => ({ ...feature, tagsText: tagsToText(feature.tags) })

const getFeatureDefaultEmoji = (type) => {
  if (type === "route") return "\uD83D\uDEE3\uFE0F"
  if (type === "area") return "\uD83D\uDFE9"
  return "\uD83D\uDCCD"
}

const getFeatureSheetTitle = (feature) => {
  if (!feature) return "장소 상세"
  if (feature.type === "route") return "경로 상세"
  if (feature.type === "area") return "범위 상세"
  return "장소 상세"
}

const getFeatureCenter = (feature) => {
  if (!feature) return null
  if (feature.type === "pin") return { lat: feature.lat, lng: feature.lng, zoom: 16 }
  if (!feature.points?.length) return null
  const total = feature.points.reduce(
    (acc, [lng, lat]) => ({ lat: acc.lat + lat, lng: acc.lng + lng }),
    { lat: 0, lng: 0 },
  )
  return {
    lat: total.lat / feature.points.length,
    lng: total.lng / feature.points.length,
    zoom: 15,
  }
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
  const [followed, setFollowed] = useLocalStorageState("loca.mobile.followed", followedSeed)
  const [communityPosts, setCommunityPosts] = useState(communityPostsSeed)
  const [communityMapFeatures, setCommunityMapFeatures] = useLocalStorageState("loca.mobile.communityMapFeatures", communityMapFeaturesSeed)
  const [authReady, setAuthReady] = useState(!hasSupabaseEnv)
  const [authUser, setAuthUser] = useState(null)
  const [viewerProfile, setViewerProfile] = useState(me)
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

  const importSharedMapToLocal = useCallback(async () => {
    if (!sharedMapData) return

    try {
      if (cloudMode) {
        const nextMap = await createMapRecord({
          title: sharedMapData.map.title,
          description: sharedMapData.map.description,
          theme: sharedMapData.map.theme,
        })
        const createdFeatures = await Promise.all(
          sharedMapData.features.map((feature) =>
            createFeatureRecord(nextMap.id, {
              ...feature,
              mapId: nextMap.id,
            }),
          ),
        )
        setMaps((current) => [nextMap, ...current])
        setFeatures((current) => [...createdFeatures, ...current])
        setActiveMapId(nextMap.id)
      } else {
        const nextMapId = createId("map")
        const updatedAt = new Date().toISOString()
        const nextMap = {
          ...sharedMapData.map,
          id: nextMapId,
          updatedAt,
        }
        const nextFeatures = sharedMapData.features.map((feature) => ({
          ...feature,
          id: createId("feat"),
          mapId: nextMapId,
          updatedAt,
        }))
        setMaps((current) => [nextMap, ...current])
        setFeatures((current) => [...nextFeatures, ...current])
        setActiveMapId(nextMapId)
      }

      setSharedMapData(null)
      setActiveTab("maps")
      setActiveMapSource("local")
      setMapsView("editor")
      setSelectedFeatureId(null)
      setSelectedFeatureSummaryId(null)
      setFeatureSheet(null)
      setEditorMode("browse")
      setDraftPoints([])
      setFitTrigger((value) => value + 1)
      showToast("공유 지도를 내 지도로 저장했어요.")
    } catch (error) {
      console.error("Failed to import shared map", error)
      showToast("공유 지도를 저장하지 못했어요.")
    }
  }, [cloudMode, setFeatures, setMaps, sharedMapData, showToast])

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

  const touchMap = (mapId) => {
    setMaps((current) =>
      current.map((mapItem) => (mapItem.id === mapId ? { ...mapItem, updatedAt: new Date().toISOString() } : mapItem)),
    )
  }

  const resetEditorState = () => {
    setSelectedFeatureId(null)
    setSelectedFeatureSummaryId(null)
    setFeatureSheet(null)
    setEditorMode("browse")
    setDraftPoints([])
  }

  const openMapEditor = (mapId) => {
    setActiveTab("maps")
    setActiveMapSource("local")
    setActiveMapId(mapId)
    setMapsView("editor")
    resetEditorState()
    setFitTrigger((value) => value + 1)
  }

  const openDemoMap = (mapId) => {
    setActiveTab("maps")
    setActiveMapSource("demo")
    setActiveMapId(mapId)
    setMapsView("editor")
    resetEditorState()
    setFitTrigger((value) => value + 1)
  }

  const openCommunityMapEditor = () => {
    setActiveTab("maps")
    setActiveMapSource("community")
    setActiveMapId("community-map")
    setMapsView("editor")
    resetEditorState()
    setFitTrigger((value) => value + 1)
  }

  const focusFeature = (featureId) => {
    const feature = activeFeaturePool.find((item) => item.id === featureId)
    if (!feature) return
    setSelectedFeatureId(featureId)
    setSelectedFeatureSummaryId(featureId)
    const center = getFeatureCenter(feature)
    if (center) setFocusPoint(center)
  }

  const openFeatureDetail = (featureId) => {
    const feature = activeFeaturePool.find((item) => item.id === featureId)
    if (!feature) return
    setSelectedFeatureId(featureId)
    setSelectedFeatureSummaryId(featureId)
    setFeatureSheet(toEditableFeature(feature))
    const center = getFeatureCenter(feature)
    if (center) setFocusPoint(center)
  }

  const saveMapSheet = async () => {
    if (!mapSheet?.title.trim()) return toast.show("지도 이름을 입력하세요.")

    try {
      if (mapSheet.mode === "create") {
        if (cloudMode) {
          const nextMap = await createMapRecord({
            title: mapSheet.title.trim(),
            description: mapSheet.description.trim(),
            theme: mapSheet.theme,
          })
          setMaps((current) => [nextMap, ...current])
          setMapSheet(null)
          openMapEditor(nextMap.id)
          return toast.show("지도를 만들었어요.")
        }

        const nextMap = {
          id: createId("map"),
          title: mapSheet.title.trim(),
          description: mapSheet.description.trim(),
          theme: mapSheet.theme,
          updatedAt: new Date().toISOString(),
        }
        setMaps((current) => [nextMap, ...current])
        setMapSheet(null)
        openMapEditor(nextMap.id)
        return toast.show("지도를 만들었어요.")
      }

      if (cloudMode) {
        const nextMap = await updateMapRecord(mapSheet.id, {
          title: mapSheet.title.trim(),
          description: mapSheet.description.trim(),
          theme: mapSheet.theme,
        })
        setMaps((current) => current.map((mapItem) => (mapItem.id === mapSheet.id ? nextMap : mapItem)))
      } else {
        setMaps((current) =>
          current.map((mapItem) =>
            mapItem.id === mapSheet.id
              ? {
                  ...mapItem,
                  title: mapSheet.title.trim(),
                  description: mapSheet.description.trim(),
                  theme: mapSheet.theme,
                  updatedAt: new Date().toISOString(),
                }
              : mapItem,
          ),
        )
      }

      setMapSheet(null)
      toast.show("지도를 수정했어요.")
    } catch (error) {
      console.error("Failed to save map", error)
      toast.show("지도를 저장하지 못했어요.")
    }
  }

  const deleteMap = async () => {
    if (!mapSheet?.id || !window.confirm("이 지도를 삭제할까요? 장소와 공유 정보도 함께 삭제됩니다.")) return

    try {
      if (cloudMode) {
        await deleteMapRecord(mapSheet.id)
      }
      setMaps((current) => current.filter((mapItem) => mapItem.id !== mapSheet.id))
      setFeatures((current) => current.filter((feature) => feature.mapId !== mapSheet.id))
      setShares((current) => current.filter((share) => share.mapId !== mapSheet.id))
      setMapSheet(null)
      setFeatureSheet(null)
      setMapsView("list")
      toast.show("지도를 삭제했어요.")
    } catch (error) {
      console.error("Failed to delete map", error)
      toast.show("지도를 삭제하지 못했어요.")
    }
  }

  const saveFeatureSheet = async () => {
    if (!featureSheet?.title.trim()) return toast.show("이름을 입력하세요.")
    const nextFeature = {
      ...featureSheet,
      title: featureSheet.title.trim(),
      emoji: featureSheet.emoji || getFeatureDefaultEmoji(featureSheet.type),
      tags: featureSheet.tagsText.split(",").map((tag) => tag.trim()).filter(Boolean),
      updatedAt: new Date().toISOString(),
    }
    delete nextFeature.tagsText
    if (activeMapSource === "community") {
      setCommunityMapFeatures((current) => current.map((f) => (f.id === nextFeature.id ? nextFeature : f)))
    } else {
      if (cloudMode) {
        try {
          const savedFeature = await updateFeatureRecord(nextFeature.id, {
            ...nextFeature,
            mapId: nextFeature.mapId,
          })
          setFeatures((current) => current.map((feature) => (feature.id === nextFeature.id ? savedFeature : feature)))
          setFeatureSheet(toEditableFeature(savedFeature))
          setMaps((current) => current.map((mapItem) => (mapItem.id === savedFeature.mapId ? { ...mapItem, updatedAt: new Date().toISOString() } : mapItem)))
          toast.show("정보를 저장했어요.")
          return
        } catch (error) {
          console.error("Failed to update feature", error)
          toast.show("항목을 저장하지 못했어요.")
          return
        }
      }

      setFeatures((current) => current.map((feature) => (feature.id === nextFeature.id ? nextFeature : feature)))
      touchMap(nextFeature.mapId)
    }
    setFeatureSheet(toEditableFeature(nextFeature))
    toast.show("정보를 저장했어요.")
  }

  const deleteFeature = async () => {
    if (!featureSheet?.id || !window.confirm("이 항목을 삭제할까요?")) return
    if (activeMapSource === "community") {
      setCommunityMapFeatures((current) => current.filter((f) => f.id !== featureSheet.id))
    } else {
      if (cloudMode) {
        try {
          await deleteFeatureRecord(featureSheet.id, featureSheet.mapId)
        } catch (error) {
          console.error("Failed to delete feature", error)
          toast.show("항목을 삭제하지 못했어요.")
          return
        }
      }
      setFeatures((current) => current.filter((feature) => feature.id !== featureSheet.id))
      touchMap(featureSheet.mapId)
    }
    setFeatureSheet(null)
    setSelectedFeatureId(null)
    setSelectedFeatureSummaryId(null)
    toast.show("항목을 삭제했어요.")
  }

  const addMemo = (featureId, text) => {
    if (!text.trim()) return
    const memo = {
      id: createId("memo"),
      userId: me.id,
      userName: me.name,
      date: new Date().toISOString(),
      text: text.trim(),
    }
    setCommunityMapFeatures((current) =>
      current.map((f) => (f.id === featureId ? { ...f, memos: [...(f.memos || []), memo] } : f)),
    )
    setMemoText("")
    if (featureSheet && featureSheet.id === featureId) {
      setFeatureSheet((current) => ({ ...current, memos: [...(current.memos || []), memo] }))
    }
    toast.show("메모를 추가했어요.")
  }

  const handleMapTap = async ({ lat, lng }) => {
    if (!activeMapId) return
    if (editorMode === "pin") {
      let nextFeature = {
        id: createId("feat"),
        mapId: activeMapId,
        type: "pin",
        title: "새 장소",
        emoji: "\uD83D\uDCCD",
        lat,
        lng,
        tags: [],
        note: "",
        highlight: false,
        updatedAt: new Date().toISOString(),
        ...(activeMapSource === "community" ? { memos: [], createdBy: me.id, createdByName: me.name } : {}),
      }
      if (activeMapSource === "community") {
        setCommunityMapFeatures((current) => [nextFeature, ...current])
      } else {
        if (cloudMode) {
          try {
            nextFeature = await createFeatureRecord(activeMapId, nextFeature)
          } catch (error) {
            console.error("Failed to create pin", error)
            return toast.show("핀을 추가하지 못했어요.")
          }
        }
        setFeatures((current) => [nextFeature, ...current])
        touchMap(activeMapId)
      }
      setEditorMode("browse")
      setSelectedFeatureId(nextFeature.id)
      setSelectedFeatureSummaryId(nextFeature.id)
      setFeatureSheet(toEditableFeature(nextFeature))
      return toast.show("핀을 추가했어요.")
    }
    if (editorMode === "route" || editorMode === "area") {
      setDraftPoints((current) => [...current, [lng, lat]])
    }
  }

  const completeRoute = async () => {
    if (!activeMapId || draftPoints.length < 2) return toast.show("경로는 두 점 이상 필요해요.")
    let nextFeature = {
      id: createId("feat"),
      mapId: activeMapId,
      type: "route",
      title: "새 경로",
      emoji: "\uD83D\uDEE3\uFE0F",
      points: draftPoints,
      tags: [],
      note: "",
      highlight: false,
      updatedAt: new Date().toISOString(),
      ...(activeMapSource === "community" ? { memos: [], createdBy: me.id, createdByName: me.name } : {}),
    }
    if (activeMapSource === "community") {
      setCommunityMapFeatures((current) => [nextFeature, ...current])
    } else {
      if (cloudMode) {
        try {
          nextFeature = await createFeatureRecord(activeMapId, nextFeature)
        } catch (error) {
          console.error("Failed to create route", error)
          return toast.show("경로를 저장하지 못했어요.")
        }
      }
      setFeatures((current) => [nextFeature, ...current])
      touchMap(activeMapId)
    }
    setDraftPoints([])
    setEditorMode("browse")
    setSelectedFeatureId(nextFeature.id)
    setSelectedFeatureSummaryId(nextFeature.id)
    setFeatureSheet(toEditableFeature(nextFeature))
    toast.show("경로를 저장했어요.")
  }

  const completeArea = async () => {
    if (!activeMapId || draftPoints.length < 3) return toast.show("범위는 세 점 이상 필요해요.")
    let nextFeature = {
      id: createId("feat"),
      mapId: activeMapId,
      type: "area",
      title: "새 범위",
      emoji: "\uD83D\uDFE9",
      points: draftPoints,
      tags: [],
      note: "",
      highlight: false,
      updatedAt: new Date().toISOString(),
      ...(activeMapSource === "community" ? { memos: [], createdBy: me.id, createdByName: me.name } : {}),
    }
    if (activeMapSource === "community") {
      setCommunityMapFeatures((current) => [nextFeature, ...current])
    } else {
      if (cloudMode) {
        try {
          nextFeature = await createFeatureRecord(activeMapId, nextFeature)
        } catch (error) {
          console.error("Failed to create area", error)
          return toast.show("범위를 저장하지 못했어요.")
        }
      }
      setFeatures((current) => [nextFeature, ...current])
      touchMap(activeMapId)
    }
    setDraftPoints([])
    setEditorMode("browse")
    setSelectedFeatureId(nextFeature.id)
    setSelectedFeatureSummaryId(nextFeature.id)
    setFeatureSheet(toEditableFeature(nextFeature))
    toast.show("범위를 저장했어요.")
  }

  const locateMe = () => {
    if (!navigator.geolocation) return toast.show("이 기기에서는 현재 위치를 사용할 수 없어요.")
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = { lat: position.coords.latitude, lng: position.coords.longitude }
        setFocusPoint({ ...nextLocation, zoom: 16 })
        toast.show("현재 위치로 이동했어요.")
      },
      () => toast.show("위치 권한을 확인해주세요."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
  }

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
      toast.show("팔로우 상태를 바꾸지 못했어요.")
    }
  }

  const likePost = (source, postId) => {
    if (source === "own") {
      return setShares((current) => current.map((share) => (share.id === postId ? { ...share, likes: share.likes + 1 } : share)))
    }
    setCommunityPosts((current) => current.map((post) => (post.id === postId ? { ...post, likes: post.likes + 1 } : post)))
  }

  const openFeatureFromPlaces = (featureId) => {
    const feature = features.find((item) => item.id === featureId)
    if (!feature) return
    setActiveTab("maps")
    setActiveMapSource("local")
    setActiveMapId(feature.mapId)
    setMapsView("editor")
    resetEditorState()
    setSelectedFeatureId(featureId)
    setSelectedFeatureSummaryId(featureId)
    const center = getFeatureCenter(feature)
    if (center) setFocusPoint(center)
    setFitTrigger((value) => value + 1)
  }

  const publishMap = async (mapId = publishSheet?.selectedMapId) => {
    if (!mapId) return toast.show("올릴 지도를 먼저 선택해 주세요.")
    if (shares.some((share) => share.mapId === mapId)) return toast.show("이미 프로필에 올라간 지도예요.")
    const caption = publishSheet?.caption?.trim() || ""

    try {
      if (cloudMode) {
        const mapItem = maps.find((item) => item.id === mapId)
        const { map: publishedMap, publication } = await publishMapRecord(mapId, {
          caption,
          title: mapItem?.title,
        })
        setMaps((current) => current.map((item) => (item.id === mapId ? publishedMap : item)))
        setShares((current) => [publication, ...current])
      } else {
        setShares((current) => [
          { id: createId("share"), mapId, caption, date: new Date().toISOString().slice(0, 10), likes: 0, saves: 0 },
          ...current,
        ])
      }
      setPublishSheet(null)
      toast.show("프로필 그리드에 지도를 올렸어요.")
    } catch (error) {
      console.error("Failed to publish map", error)
      toast.show("지도를 프로필에 올리지 못했어요.")
    }
  }

  const unpublish = async (postId) => {
    try {
      if (cloudMode) {
        const targetShare = shares.find((share) => share.id === postId)
        if (targetShare?.mapId) {
          await unpublishMapRecord(targetShare.mapId)
        }
      }
      setShares((current) => current.filter((share) => share.id !== postId))
      setSelectedPostRef((current) => (current?.source === "own" && current.id === postId ? null : current))
      toast.show("공유를 해제했어요.")
    } catch (error) {
      console.error("Failed to unpublish map", error)
      toast.show("공유를 해제하지 못했어요.")
    }
  }

  const featureEmojiChoices = featureSheet
    ? featureSheet.type === "route"
      ? [...placeEmojis, "\uD83D\uDEE3\uFE0F", "\uD83D\uDEB6", "\uD83D\uDE97"]
      : featureSheet.type === "area"
        ? ["\uD83D\uDFE9", "\uD83D\uDCD0", "\uD83C\uDFDE\uFE0F", "\uD83C\uDF33", "\uD83C\uDFD5\uFE0F"]
        : placeEmojis
    : []

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
            onUndoDraft={() => setDraftPoints((current) => current.slice(0, -1))}
            onCompleteRoute={completeRoute}
            onCompleteArea={completeArea}
            onCancelDraft={() => {
              setDraftPoints([])
              setEditorMode("browse")
            }}
            onToggleLabels={() => setShowMapLabels((current) => !current)}
            onOpenFeatureDetail={openFeatureDetail}
            onAddMemo={addMemo}
            onCloseFeatureSummary={() => {
              setSelectedFeatureId(null)
              setSelectedFeatureSummaryId(null)
            }}
          />
        ) : null}

        {!showPersonalLoading && !showPersonalGate && activeTab === "places" ? <PlacesScreen maps={maps} features={features} onOpenFeature={openFeatureFromPlaces} /> : null}
        {!showPersonalLoading && !showPersonalGate && activeTab === "search" ? <SearchScreen users={users} followed={followed} onToggleFollow={toggleFollow} onSelectUser={setSelectedUserId} /> : null}
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
          />
        ) : null}
      </main>

      <BottomNav
        activeTab={activeTab}
        onChange={(nextTab) => {
          setActiveTab(nextTab)
          if (nextTab !== "maps") {
            setMapsView("list")
            setEditorMode("browse")
            setDraftPoints([])
            if (activeMapSource === "shared") {
              setSharedMapData(null)
              setActiveMapSource("local")
              setActiveMapId(maps[0]?.id ?? null)
            }
          }
        }}
      />

      <BottomSheet
        open={Boolean(mapSheet)}
        title={mapSheet?.mode === "create" ? "새 지도 만들기" : "지도 수정"}
        subtitle="지도 이름, 설명, 테마 색상을 정할 수 있어요."
        onClose={() => setMapSheet(null)}
      >
        {mapSheet ? (
          <div className="form-stack">
            <label className="field">
              <span>지도 이름</span>
              <input
                value={mapSheet.title}
                onChange={(event) => setMapSheet((current) => ({ ...current, title: event.target.value }))}
                placeholder="예: 제주 2박 3일"
              />
            </label>
            <label className="field">
              <span>설명</span>
              <textarea
                rows="3"
                value={mapSheet.description}
                onChange={(event) => setMapSheet((current) => ({ ...current, description: event.target.value }))}
                placeholder="짧은 설명을 남겨두면 나중에 찾기 쉬워져요."
              />
            </label>
            <div className="field">
              <span>테마 색상</span>
              <div className="theme-row">
                {themePalette.map((theme) => (
                  <button
                    key={theme}
                    className={`theme-dot${mapSheet.theme === theme ? " is-active" : ""}`}
                    style={{ "--theme-color": theme }}
                    type="button"
                    onClick={() => setMapSheet((current) => ({ ...current, theme }))}
                  />
                ))}
              </div>
            </div>
            <div className="sheet-actions">
              {mapSheet.mode === "edit" ? (
                <button className="button button--danger" type="button" onClick={deleteMap}>
                  지도 삭제
                </button>
              ) : null}
              <button className="button button--primary" type="button" onClick={saveMapSheet}>
                저장
              </button>
            </div>
          </div>
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={Boolean(featureSheet)}
        title={getFeatureSheetTitle(featureSheet)}
        subtitle={activeMapSource === "community"
          ? undefined
          : activeMapSource === "demo"
            ? "데모 지도는 읽기 전용이에요."
            : activeMapSource === "shared"
              ? "공유된 지도는 읽기 전용이에요."
              : undefined}
        onClose={() => {
          setFeatureSheet(null)
          setSelectedFeatureId(null)
        }}
      >
        {featureSheet ? (() => {
          const isCommunity = activeMapSource === "community"
          const canEdit = activeMapSource === "local" || (isCommunity && featureSheet.createdBy === me.id)
          return (
          <div className="form-stack">
            {isCommunity && featureSheet.createdByName ? (
              <span className="memo-item__user" style={{ fontSize: "0.78rem" }}>작성자: {featureSheet.createdByName}</span>
            ) : null}
            {canEdit ? (
              <>
                <label className="field">
                  <span>이름</span>
                  <input value={featureSheet.title} onChange={(event) => setFeatureSheet((current) => ({ ...current, title: event.target.value }))} />
                </label>
                <label className="field">
                  <span>아이콘</span>
                  <div className="emoji-grid">
                    {featureEmojiChoices.map((emoji) => (
                      <button
                        key={emoji}
                        className={`emoji-chip${featureSheet.emoji === emoji ? " is-active" : ""}`}
                        type="button"
                        onClick={() => setFeatureSheet((current) => ({ ...current, emoji }))}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </label>
                <label className="field">
                  <span>태그</span>
                  <input
                    value={featureSheet.tagsText}
                    onChange={(event) => setFeatureSheet((current) => ({ ...current, tagsText: event.target.value }))}
                    placeholder="쉼표로 구분해서 입력"
                  />
                </label>
                <label className="field">
                  <span>메모</span>
                  <textarea
                    rows="4"
                    value={featureSheet.note}
                    onChange={(event) => setFeatureSheet((current) => ({ ...current, note: event.target.value }))}
                    placeholder="현장에서 바로 남기는 짧은 기록"
                  />
                </label>
              </>
            ) : (
              <div className="community-detail-readonly">
                <div className="community-detail-readonly__title">
                  <span className="community-detail-readonly__emoji">{featureSheet.emoji}</span>
                  <strong>{featureSheet.title}</strong>
                </div>
                {featureSheet.tags?.length ? (
                  <div className="community-detail-readonly__tags">
                    {featureSheet.tags.map((tag) => (
                      <span className="chip chip--small" key={tag}>#{tag}</span>
                    ))}
                  </div>
                ) : null}
                {featureSheet.note ? <p className="community-detail-readonly__note">{featureSheet.note}</p> : null}
              </div>
            )}
            {isCommunity ? (
              <div className="memo-section">
                <strong className="memo-section__title">메모 ({(featureSheet.memos || []).length})</strong>
                <div className="memo-list">
                  {(featureSheet.memos || []).length === 0 ? (
                    <p className="memo-empty">아직 메모가 없어요. 첫 메모를 남겨보세요!</p>
                  ) : (
                    (featureSheet.memos || []).map((m) => (
                      <div className="memo-item" key={m.id}>
                        <div className="memo-item__header">
                          <span className="memo-item__user">{m.userName}</span>
                          <span className="memo-item__date">{new Date(m.date).toLocaleDateString("ko-KR")}</span>
                        </div>
                        <p className="memo-item__text">{m.text}</p>
                      </div>
                    ))
                  )}
                </div>
                <div className="memo-input-row">
                  <textarea
                    className="memo-input"
                    rows="2"
                    value={memoText}
                    onChange={(e) => setMemoText(e.target.value)}
                    placeholder="메모를 남겨보세요..."
                  />
                  <button
                    className="button button--primary memo-submit"
                    type="button"
                    onClick={() => addMemo(featureSheet.id, memoText)}
                    disabled={!memoText.trim()}
                  >
                    추가
                  </button>
                </div>
              </div>
            ) : null}
            {canEdit ? (
              <div className="sheet-actions">
                <button className="button button--danger" type="button" onClick={deleteFeature}>
                  삭제
                </button>
                <button className="button button--primary" type="button" onClick={saveFeatureSheet}>
                  저장
                </button>
              </div>
            ) : null}
          </div>
          )
        })() : null}
      </BottomSheet>

      <BottomSheet
        open={Boolean(publishSheet)}
        title="프로필에 지도 올리기"
        subtitle="내가 만든 지도 중 프로필에 올릴 지도를 고르세요."
        onClose={() => setPublishSheet(null)}
      >
        {unpublishedMaps.length === 0 ? (
          <article className="empty-card">
            <strong>추가로 올릴 지도가 없어요.</strong>
            <p>새 지도를 만들거나 기존 게시물을 공유 해제해보세요.</p>
          </article>
        ) : (
          <div className="form-stack">
            <div className="card-list">
              {unpublishedMaps.map((mapItem) => {
                const mapPins = features.filter((feature) => feature.mapId === mapItem.id && feature.type === "pin")
                const isActive = publishSheet?.selectedMapId === mapItem.id
                return (
                  <button
                    className={`map-publish-row map-publish-row--select${isActive ? " is-active" : ""}`}
                    key={mapItem.id}
                    type="button"
                    onClick={() => setPublishSheet((current) => ({ ...(current || {}), selectedMapId: mapItem.id }))}
                  >
                    <MapPreview title={mapItem.title} emojis={mapPins.map((feature) => feature.emoji)} placeCount={mapPins.length} theme={mapItem.theme} variant="grid" compact />
                    <div className="map-publish-row__body">
                      <strong>{mapItem.title}</strong>
                      <span>{mapItem.description || "설명이 아직 없어요."}</span>
                    </div>
                    <span className={`map-publish-row__badge${isActive ? " is-active" : ""}`}>
                      {isActive ? "선택됨" : "선택"}
                    </span>
                  </button>
                )
              })}
            </div>

            <label className="field">
              <span>한마디</span>
              <textarea
                rows="3"
                value={publishSheet?.caption || ""}
                onChange={(event) => setPublishSheet((current) => ({ ...(current || {}), caption: event.target.value }))}
                placeholder="이 지도에 대한 짧은 소개를 남겨보세요."
              />
            </label>

            <div className="sheet-actions">
              <button className="button button--ghost" type="button" onClick={() => setPublishSheet(null)}>
                닫기
              </button>
              <button className="button button--primary" type="button" onClick={() => publishMap()}>
                프로필에 올리기
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      <BottomSheet
        open={Boolean(selectedUser)}
        title={selectedUser ? `${selectedUser.name} 프로필` : "프로필"}
        subtitle="추천 크리에이터와 기관의 데모 프로필 화면입니다."
        onClose={() => setSelectedUserId(null)}
      >
        {selectedUser ? (
          <div className="community-profile-sheet">
            <div className="profile-hero">
              <Avatar user={selectedUser} size="xl" ring={selectedUser.verified} />
              <div className="profile-hero__body">
                <div className="profile-hero__title-row">
                  <strong>{selectedUser.name}</strong>
                  {selectedUser.verified ? <span className="verified-badge">?</span> : null}
                </div>
                <span className="profile-hero__handle">{selectedUser.handle}</span>
                <p>{selectedUser.bio}</p>
              </div>
            </div>
            <div className="profile-actions-row">
              <button className={`button ${followed.includes(selectedUser.id) ? "button--secondary" : "button--primary"}`} type="button" onClick={() => toggleFollow(selectedUser.id)}>
                {followed.includes(selectedUser.id) ? "팔로잉" : "팔로우"}
              </button>
            </div>
            <div className="profile-grid">
              {selectedUserPosts.map((post) => (
                <button key={post.id} className="profile-grid__item" type="button" onClick={() => setSelectedPostRef({ source: "community", id: post.id })}>
                  <MapPreview title={post.title} emojis={post.emojis} placeCount={post.placeCount} gradient={post.gradient} variant="grid" />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={Boolean(selectedPost)}
        title={selectedPost?.title || "게시물"}
        subtitle="피드 게시물 상세 화면입니다."
        onClose={() => setSelectedPostRef(null)}
      >
        {selectedPost ? (
          <div className="post-detail-sheet">
            <div className="feed-card__header">
              <div className="feed-card__author">
                <Avatar user={selectedPost.user} size="md" ring={selectedPost.user.id !== "me"} />
                <span className="feed-card__author-meta">
                  <strong>
                    {selectedPost.user.name}
                    {selectedPost.user.verified ? <span className="verified-badge">?</span> : null}
                  </strong>
                  <small>{selectedPost.user.handle} · {selectedPost.date}</small>
                </span>
              </div>
            </div>
            <MapPreview title={selectedPost.title} emojis={selectedPost.emojis} placeCount={selectedPost.placeCount} gradient={selectedPost.gradient} theme={selectedPost.theme} variant="large" caption={selectedPost.description} />
            <div className="post-detail-sheet__meta">
              <button className="icon-link" type="button" onClick={() => likePost(selectedPost.source, selectedPost.id)}>
                좋아요 {selectedPost.likes}
              </button>
              <span className="icon-link">저장 {selectedPost.saves}</span>
              <span className="icon-link">장소 {selectedPost.placeCount}</span>
            </div>
            <p className="feed-card__caption">
              <strong>{selectedPost.title}</strong> {selectedPost.caption}
            </p>
            <div className="chips-row chips-row--compact">
              {selectedPost.tags.map((tag) => (
                <span className="chip chip--small" key={tag}>
                  #{tag}
                </span>
              ))}
            </div>
            {selectedPost.source === "own" ? (
              <div className="sheet-actions">
                <button className="button button--secondary" type="button" onClick={() => openMapEditor(selectedPost.mapId)}>
                  지도 열기
                </button>
                <button className="button button--danger" type="button" onClick={() => unpublish(selectedPost.id)}>
                  공유 해제
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </BottomSheet>
      <Toast message={toast.message} />
    </div>
  )
}

