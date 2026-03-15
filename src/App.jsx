import { useMemo, useRef, useState } from "react"
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
import { useInstallPrompt, useLocalStorageState, useToast } from "./hooks/useAppState"
import {
  buildCommunityPosts,
  buildOwnPosts,
  createId,
  exportBackup,
  importBackup,
  placeEmojis,
  tagsToText,
  themePalette,
} from "./lib/appUtils"
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

export default function App() {
  const [maps, setMaps] = useLocalStorageState("loca.mobile.maps", mapsSeed)
  const [features, setFeatures] = useLocalStorageState("loca.mobile.features", featuresSeed)
  const [shares, setShares] = useLocalStorageState("loca.mobile.shares", sharesSeed)
  const [followed, setFollowed] = useLocalStorageState("loca.mobile.followed", followedSeed)
  const [communityPosts, setCommunityPosts] = useState(communityPostsSeed)
  const [communityMapFeatures, setCommunityMapFeatures] = useLocalStorageState("loca.mobile.communityMapFeatures", communityMapFeaturesSeed)
  const [activeTab, setActiveTab] = useState("home")
  const [mapsView, setMapsView] = useState("list")
  const [activeMapId, setActiveMapId] = useState(mapsSeed[0]?.id ?? null)
  const [activeMapSource, setActiveMapSource] = useState("local")
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
  const fileInputRef = useRef(null)
  const toast = useToast()
  const install = useInstallPrompt()

  const usersById = useMemo(() => Object.fromEntries(users.map((user) => [user.id, user])), [])
  const communityMapMeta = useMemo(() => [{ id: "community-map", title: "모두의 지도", description: "모두가 함께 만드는 지도", theme: "#635bff", updatedAt: new Date().toISOString() }], [])
  const activeMapPool = activeMapSource === "community" ? communityMapMeta : activeMapSource === "demo" ? demoMaps : maps
  const activeFeaturePool = activeMapSource === "community" ? communityMapFeatures : activeMapSource === "demo" ? demoFeatures : features
  const activeMap = activeMapPool.find((map) => map.id === activeMapId) || null
  const activeFeatures = useMemo(
    () => (activeMapId ? activeFeaturePool.filter((feature) => feature.mapId === activeMapId) : []),
    [activeFeaturePool, activeMapId],
  )
  const ownPosts = useMemo(() => buildOwnPosts(shares, maps, features, me), [shares, maps, features])
  const communityFeed = useMemo(() => buildCommunityPosts(communityPosts, usersById), [communityPosts, usersById])
  const feedPosts = useMemo(
    () => [...ownPosts, ...communityFeed].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [communityFeed, ownPosts],
  )
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

  const addCommunityPin = ({ lat, lng }) => {
    const pin = {
      id: createId("cm"),
      mapId: "community-map",
      type: "pin",
      title: "새 핀",
      emoji: "📍",
      lat,
      lng,
      tags: [],
      note: "",
      highlight: false,
      updatedAt: new Date().toISOString(),
      createdBy: me.id,
      createdByName: me.name,
      memos: [],
    }
    setCommunityMapFeatures((prev) => [pin, ...prev])
    toast.show("모두의 지도에 핀을 추가했어요!")
  }

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

  const headerConfig = useMemo(() => {
    if (activeTab === "maps" && mapsView === "editor") {
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
      return { subtitle: "내 프로필과 그리드", actionLabel: "지도 올리기", onAction: () => setPublishSheet({ caption: "" }) }
    }
    if (activeTab === "places") {
      return { subtitle: "장소와 경로 목록", actionLabel: null, onAction: null }
    }
    if (activeTab === "search") {
      return { subtitle: null, actionLabel: null, onAction: null }
    }
    return { subtitle: null, actionLabel: null, onAction: null }
  }, [activeMap, activeTab, mapsView])

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

  const saveMapSheet = () => {
    if (!mapSheet?.title.trim()) return toast.show("지도 이름을 입력하세요.")
    if (mapSheet.mode === "create") {
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
    setMapSheet(null)
    toast.show("지도를 수정했어요.")
  }

  const deleteMap = () => {
    if (!mapSheet?.id || !window.confirm("이 지도를 삭제할까요? 장소와 공유 정보도 함께 삭제됩니다.")) return
    setMaps((current) => current.filter((mapItem) => mapItem.id !== mapSheet.id))
    setFeatures((current) => current.filter((feature) => feature.mapId !== mapSheet.id))
    setShares((current) => current.filter((share) => share.mapId !== mapSheet.id))
    setMapSheet(null)
    setFeatureSheet(null)
    setMapsView("list")
    toast.show("지도를 삭제했어요.")
  }

  const saveFeatureSheet = () => {
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
      setFeatures((current) => current.map((feature) => (feature.id === nextFeature.id ? nextFeature : feature)))
      touchMap(nextFeature.mapId)
    }
    setFeatureSheet(toEditableFeature(nextFeature))
    toast.show("정보를 저장했어요.")
  }

  const deleteFeature = () => {
    if (!featureSheet?.id || !window.confirm("이 항목을 삭제할까요?")) return
    if (activeMapSource === "community") {
      setCommunityMapFeatures((current) => current.filter((f) => f.id !== featureSheet.id))
    } else {
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

  const handleMapTap = ({ lat, lng }) => {
    if (!activeMapId) return
    if (editorMode === "pin") {
      const nextFeature = {
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

  const completeRoute = () => {
    if (!activeMapId || draftPoints.length < 2) return toast.show("경로는 두 점 이상 필요해요.")
    const nextFeature = {
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

  const completeArea = () => {
    if (!activeMapId || draftPoints.length < 3) return toast.show("범위는 세 점 이상 필요해요.")
    const nextFeature = {
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

  const toggleFollow = (userId) => {
    setFollowed((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]))
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
    openMapEditor(feature.mapId)
    window.setTimeout(() => focusFeature(featureId), 80)
  }

  const publishMap = (mapId) => {
    if (shares.some((share) => share.mapId === mapId)) return toast.show("이미 프로필에 올라간 지도예요.")
    const caption = publishSheet?.caption?.trim() || ""
    setShares((current) => [
      { id: createId("share"), mapId, caption, date: new Date().toISOString().slice(0, 10), likes: 0, saves: 0 },
      ...current,
    ])
    setPublishSheet(null)
    toast.show("프로필 그리드에 지도를 올렸어요.")
  }

  const unpublish = (postId) => {
    setShares((current) => current.filter((share) => share.id !== postId))
    setSelectedPostRef((current) => (current?.source === "own" && current.id === postId ? null : current))
    toast.show("공유를 해제했어요.")
  }

  const restoreSeed = () => {
    if (!window.confirm("샘플 데이터로 되돌릴까요?")) return
    setMaps(mapsSeed)
    setFeatures(featuresSeed)
    setShares(sharesSeed)
    setFollowed(followedSeed)
    setCommunityPosts(communityPostsSeed)
    setCommunityMapFeatures(communityMapFeaturesSeed)
    setActiveMapId(mapsSeed[0]?.id ?? null)
    setMapsView("list")
    setFeatureSheet(null)
    setMapSheet(null)
    setSelectedFeatureSummaryId(null)
    setSelectedPostRef(null)
    setSelectedUserId(null)
    setPublishSheet(null)
    toast.show("샘플 데이터를 복원했어요.")
  }

  const clearAll = () => {
    if (!window.confirm("모든 데이터를 삭제할까요? 이 작업은 되돌릴 수 없어요.")) return
    setMaps([])
    setFeatures([])
    setShares([])
    setFollowed([])
    setCommunityMapFeatures([])
    setActiveMapId(null)
    setMapsView("list")
    setFeatureSheet(null)
    setMapSheet(null)
    setSelectedFeatureSummaryId(null)
    setSelectedPostRef(null)
    setSelectedUserId(null)
    setPublishSheet(null)
    toast.show("모든 데이터를 삭제했어요.")
  }

  const importFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const restored = importBackup(JSON.parse(await file.text()), followedSeed)
      setMaps(restored.maps)
      setFeatures(restored.features)
      setShares(restored.shares)
      setFollowed(restored.followed)
      setCommunityPosts(communityPostsSeed)
      setActiveMapId(restored.maps[0]?.id ?? null)
      setMapsView("list")
      setFeatureSheet(null)
      setMapSheet(null)
      setSelectedPostRef(null)
      toast.show("백업 파일을 불러왔어요.")
    } catch (error) {
      console.error(error)
      toast.show("파일을 불러오지 못했어요.")
    } finally {
      event.target.value = ""
    }
  }

  const featureEmojiChoices = featureSheet
    ? featureSheet.type === "route"
      ? [...placeEmojis, "\uD83D\uDEE3\uFE0F", "\uD83D\uDEB6", "\uD83D\uDE97"]
      : featureSheet.type === "area"
        ? ["\uD83D\uDFE9", "\uD83D\uDCD0", "\uD83C\uDFDE\uFE0F", "\uD83C\uDF33", "\uD83C\uDFD5\uFE0F"]
        : placeEmojis
    : []

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
        {activeTab === "home" ? (
          <HomeScreen
            recommendedMaps={recommendedMaps}
            communityMapFeatures={communityMapFeatures}
            onOpenMap={openDemoMap}
            onOpenCommunityEditor={openCommunityMapEditor}
          />
        ) : null}

        {activeTab === "maps" && mapsView === "list" ? (
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

        {activeTab === "maps" && mapsView === "editor" && activeMap ? (
          <MapEditorScreen
            map={activeMap}
            features={activeFeatures}
            selectedFeatureId={selectedFeatureId}
            selectedFeatureSummary={selectedFeatureSummary}
            editorMode={editorMode}
            draftPoints={draftPoints}
            focusPoint={focusPoint}
            fitTrigger={fitTrigger}
            readOnly={activeMapSource === "demo"}
            hideCount={activeMapSource === "community"}
            communityMode={activeMapSource === "community"}
            showLabels={showMapLabels}
            onBack={() => {
              if (activeMapSource === "community") {
                setActiveTab("home")
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
            onHighlightTap={focusFeature}
            onToggleLabels={() => setShowMapLabels((current) => !current)}
            onOpenFeatureDetail={openFeatureDetail}
            onAddUserNote={(featureId, noteText) => {
              setCommunityMapFeatures((current) =>
                current.map((f) =>
                  f.id === featureId ? { ...f, userNotes: [...(f.userNotes || []), noteText] } : f,
                ),
              )
            }}
            onCloseFeatureSummary={() => {
              setSelectedFeatureId(null)
              setSelectedFeatureSummaryId(null)
            }}
          />
        ) : null}

        {activeTab === "places" ? <PlacesScreen maps={maps} features={features} onOpenFeature={openFeatureFromPlaces} /> : null}
        {activeTab === "search" ? <SearchScreen users={users} followed={followed} onToggleFollow={toggleFollow} onSelectUser={setSelectedUserId} /> : null}
        {activeTab === "profile" ? (
          <ProfileScreen
            user={me}
            shares={shares}
            maps={maps}
            features={features}
            followedCount={followed.length}
            canInstall={install.canInstall}
            isStandalone={install.isStandalone}
            installHint={install.installHint}
            onInstall={async () => {
              const accepted = await install.promptInstall()
              toast.show(accepted ? "앱을 설치했어요." : "설치를 취소했어요.")
            }}
            onPublishOpen={() => setPublishSheet({ caption: "" })}
            onSelectPost={(source, id) => setSelectedPostRef({ source, id })}
            onExport={() => exportBackup(maps, features, shares, followed)}
            onImportClick={() => fileInputRef.current?.click()}
            onRestoreSeed={restoreSeed}
            onClearAll={clearAll}
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
        subtitle={activeMapSource === "community" ? undefined : "이름, 태그, 메모를 저장해두면 휴대폰에서 바로 찾기 쉬워집니다."}
        onClose={() => {
          setFeatureSheet(null)
          setSelectedFeatureId(null)
        }}
      >
        {featureSheet ? (() => {
          const isCommunity = activeMapSource === "community"
          const isAuthor = !isCommunity || featureSheet.createdBy === me.id
          return (
          <div className="form-stack">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {isCommunity && featureSheet.createdByName ? (
                <span className="memo-item__user" style={{ fontSize: "0.78rem" }}>작성자: {featureSheet.createdByName}</span>
              ) : <span />}
              <button
                className="icon-button"
                type="button"
                onClick={() => {
                  setFeatureSheet(null)
                  setSelectedFeatureId(null)
                }}
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            {isAuthor ? (
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
                {!isCommunity ? (
                  <label className="toggle-row">
                    <span>하이라이트로 표시</span>
                    <input
                      type="checkbox"
                      checked={featureSheet.highlight}
                      onChange={(event) => setFeatureSheet((current) => ({ ...current, highlight: event.target.checked }))}
                    />
                  </label>
                ) : null}
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
            <div className="sheet-actions">
              {isAuthor ? (
                <button className="button button--danger" type="button" onClick={deleteFeature}>
                  삭제
                </button>
              ) : null}
              <button
                className="button button--ghost"
                type="button"
                onClick={() => {
                  setFeatureSheet(null)
                  setSelectedFeatureId(null)
                }}
              >
                닫기
              </button>
              {isAuthor ? (
                <button className="button button--primary" type="button" onClick={saveFeatureSheet}>
                  저장
                </button>
              ) : null}
            </div>
          </div>
          )
        })() : null}
      </BottomSheet>

      <BottomSheet
        open={Boolean(publishSheet)}
        title="프로필에 지도 올리기"
        subtitle="내 지도 중 아직 공유하지 않은 지도를 선택하세요."
        onClose={() => setPublishSheet(null)}
      >
        <div className="form-stack">
          <label className="field">
            <span>한마디</span>
            <textarea
              rows="3"
              value={publishSheet?.caption || ""}
              onChange={(event) => setPublishSheet((current) => ({ ...(current || {}), caption: event.target.value }))}
              placeholder="이 지도에 대한 짧은 소개를 남겨보세요."
            />
          </label>
          {unpublishedMaps.length === 0 ? (
            <article className="empty-card">
              <strong>추가로 올릴 지도가 없어요.</strong>
              <p>새 지도를 만들거나 기존 게시물을 공유 해제해보세요.</p>
            </article>
          ) : (
            <div className="card-list">
              {unpublishedMaps.map((mapItem) => {
                const mapPins = features.filter((feature) => feature.mapId === mapItem.id && feature.type === "pin")
                return (
                  <article className="map-publish-row" key={mapItem.id}>
                    <MapPreview title={mapItem.title} emojis={mapPins.map((feature) => feature.emoji)} placeCount={mapPins.length} theme={mapItem.theme} variant="grid" compact />
                    <div className="map-publish-row__body">
                      <strong>{mapItem.title}</strong>
                      <span>{mapItem.description || "설명이 아직 없어요."}</span>
                    </div>
                    <button className="button button--primary" type="button" onClick={() => publishMap(mapItem.id)}>
                      올리기
                    </button>
                  </article>
                )
              })}
            </div>
          )}
        </div>
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

      <input ref={fileInputRef} type="file" hidden accept="application/json" onChange={importFile} />
      <Toast message={toast.message} />
    </div>
  )
}

