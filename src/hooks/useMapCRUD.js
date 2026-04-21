import { useCallback } from "react"
import { createId } from "../lib/appUtils"
import { logEvent } from "../lib/analytics"
import { cleanupFeatureMedia } from "../lib/mediaCleanup"
import { friendlySupabaseError } from "../lib/mapService"
import { isEventMap } from "../lib/mapPlacement"
import {
  createMap as createMapRecord,
  updateMap as updateMapRecord,
  deleteMap as deleteMapRecord,
  createFeature as createFeatureRecord,
  publishMap as publishMapRecord,
  unpublishMap as unpublishMapRecord,
  linkMapLineage as linkMapLineageRecord,
  addMapToProfile as addMapToProfileRecord,
  removeMapFromProfile as removeMapFromProfileRecord,
} from "../lib/mapService"
import { recordMapAction } from "../lib/gamificationService"

export function useMapCRUD({
  maps,
  setMaps,
  features,
  setFeatures,
  shares,
  setShares,
  cloudMode,
  mapSheet,
  setMapSheet,
  setFeatureSheet,
  setMapsView,
  setActiveTab,
  setActiveMapSource,
  setActiveMapId,
  setSelectedFeatureId,
  setSelectedFeatureSummaryId,
  setEditorMode,
  setDraftPoints,
  setFitTrigger,
  setFocusPoint,
  showToast,
  sharedMapData,
  setSharedMapData,
  publishSheet,
  setPublishSheet,
  setSelectedPostRef,
  refreshGameProfile,
  communityMapId = "community-map",
}) {
  const touchMap = useCallback((mapId) => {
    setMaps((current) =>
      current.map((mapItem) => (mapItem.id === mapId ? { ...mapItem, updatedAt: new Date().toISOString() } : mapItem)),
    )
  }, [setMaps])

  const resetEditorState = useCallback(() => {
    setSelectedFeatureId(null)
    setSelectedFeatureSummaryId(null)
    setFeatureSheet(null)
    setEditorMode("browse")
    setDraftPoints([])
  }, [setDraftPoints, setEditorMode, setFeatureSheet, setSelectedFeatureId, setSelectedFeatureSummaryId])

  const openMapEditor = useCallback((mapId) => {
    setActiveTab("maps")
    setActiveMapSource("local")
    setActiveMapId(mapId)
    setMapsView("editor")
    resetEditorState()
    setFitTrigger((value) => value + 1)
  }, [resetEditorState, setActiveMapId, setActiveMapSource, setActiveTab, setFitTrigger, setMapsView])

  const openDemoMap = useCallback((mapId) => {
    setActiveTab("maps")
    setActiveMapSource("demo")
    setActiveMapId(mapId)
    setMapsView("editor")
    resetEditorState()
    setFitTrigger((value) => value + 1)
  }, [resetEditorState, setActiveMapId, setActiveMapSource, setActiveTab, setFitTrigger, setMapsView])

  const openCommunityMapEditor = useCallback(() => {
    setActiveTab("maps")
    setActiveMapSource("community")
    setActiveMapId(communityMapId || "community-map")
    setMapsView("editor")
    resetEditorState()
    setFitTrigger((value) => value + 1)
  }, [communityMapId, resetEditorState, setActiveMapId, setActiveMapSource, setActiveTab, setFitTrigger, setMapsView])

  const saveMapSheet = useCallback(async () => {
    if (!mapSheet?.title.trim()) return showToast("지도 이름을 입력하세요.")

    try {
      if (mapSheet.mode === "create") {
        if (cloudMode) {
          const nextMap = await createMapRecord({
            title: mapSheet.title.trim(),
            description: mapSheet.description.trim(),
            theme: mapSheet.theme,
            category: mapSheet.category || "personal",
            config: mapSheet.config || {},
          })

          setMaps((current) => [nextMap, ...current])

          setMapSheet(null)
          openMapEditor(nextMap.id)
          recordMapAction({ actionType: "map_create", eventKey: `map:${nextMap.id}`, mapId: nextMap.id }).then(() => refreshGameProfile?.()).catch(() => {})
          return showToast("지도를 만들었어요.")
        }

        const nextMapId = createId("map")
        const updatedAt = new Date().toISOString()
        const nextMap = {
          id: nextMapId,
          title: mapSheet.title.trim(),
          description: mapSheet.description.trim(),
          theme: mapSheet.theme,
          category: mapSheet.category || "personal",
          config: mapSheet.config || {},
          updatedAt,
        }

        setMaps((current) => [nextMap, ...current])
        setMapSheet(null)
        openMapEditor(nextMapId)
        return showToast("지도를 만들었어요.")
      }

      const editPayload = {
        title: mapSheet.title.trim(),
        description: mapSheet.description.trim(),
        theme: mapSheet.theme,
        category: mapSheet.category || "personal",
        config: mapSheet.config || {},
      }

      if (cloudMode) {
        const nextMap = await updateMapRecord(mapSheet.id, editPayload)
        setMaps((current) => current.map((mapItem) => (mapItem.id === mapSheet.id ? nextMap : mapItem)))
      } else {
        setMaps((current) =>
          current.map((mapItem) =>
            mapItem.id === mapSheet.id
              ? { ...mapItem, ...editPayload, updatedAt: new Date().toISOString() }
              : mapItem,
          ),
        )
      }

      setMapSheet(null)
      showToast("지도를 수정했어요.")
    } catch (error) {
      console.error("Failed to save map", error)
      showToast(friendlySupabaseError(error))
    }
  }, [cloudMode, mapSheet, openMapEditor, setMapSheet, setMaps, showToast, refreshGameProfile])

  const deleteMap = useCallback(async (directMapId) => {
    const targetId = directMapId || mapSheet?.id
    if (!targetId) return
    if (!directMapId && !window.confirm("이 지도를 삭제할까요? 장소와 공유 정보도 함께 삭제됩니다.")) return

    try {
      if (cloudMode) {
        await deleteMapRecord(targetId)
      }
      const mapFeatures = features.filter((f) => f.mapId === targetId)
      for (const f of mapFeatures) {
        await cleanupFeatureMedia(f, cloudMode, false)
      }
      setMaps((current) => current.filter((mapItem) => mapItem.id !== targetId))
      setFeatures((current) => current.filter((feature) => feature.mapId !== targetId))
      setShares((current) => current.filter((share) => share.mapId !== targetId))
      if (mapSheet?.id === targetId) setMapSheet(null)
      setFeatureSheet(null)
      setMapsView("list")
      showToast("지도를 삭제했어요.")
    } catch (error) {
      console.error("Failed to delete map", error)
      showToast(friendlySupabaseError(error))
    }
  }, [cloudMode, features, mapSheet, setFeatureSheet, setFeatures, setMapSheet, setMaps, setMapsView, setShares, showToast])

  const importMapBundleToLocal = useCallback(async (bundle, options = {}) => {
    if (!bundle?.map) return
    const sourceMap = bundle.map
    const sourceFeatures = Array.isArray(bundle.features) ? bundle.features : []
    const toastMessage = options.toastMessage || "공유 지도를 내 라이브러리에 저장했어요."

    try {
        if (cloudMode) {
          const nextMap = await createMapRecord({
            title: sourceMap.title,
            description: sourceMap.description,
            theme: sourceMap.theme,
            category: sourceMap.category || "personal",
            config: sourceMap.config || {},
          })
          const createdFeatures = await Promise.all(
            sourceFeatures.map((feature) =>
              createFeatureRecord(nextMap.id, {
                ...feature,
                mapId: nextMap.id,
              }),
            ),
          )
          try {
            await linkMapLineageRecord(sourceMap.id, nextMap.id, "import")
          } catch (lineageError) {
            console.warn("Failed to persist map lineage", lineageError)
          }
          nextMap.importedFrom = sourceMap.creatorHandle || sourceMap.title
          setMaps((current) => [nextMap, ...current])
          setFeatures((current) => [...createdFeatures, ...current])
          setActiveMapId(nextMap.id)
        } else {
        const nextMapId = createId("map")
        const updatedAt = new Date().toISOString()
        const nextMap = {
          ...sourceMap,
          id: nextMapId,
          updatedAt,
          importedFrom: sourceMap.creatorHandle || sourceMap.title,
        }
        const nextFeatures = sourceFeatures.map((feature) => ({
          ...feature,
          id: createId("feat"),
          mapId: nextMapId,
          updatedAt,
        }))
        setMaps((current) => [nextMap, ...current])
        setFeatures((current) => [...nextFeatures, ...current])
        setActiveMapId(nextMapId)
      }

      logEvent("map_import", { map_id: sourceMap.id, meta: { feature_count: sourceFeatures.length || 0 } })
      if (cloudMode) recordMapAction({ actionType: "map_import", eventKey: `import:${sourceMap.id}`, mapId: sourceMap.id }).then(() => refreshGameProfile?.()).catch(() => {})
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
      showToast(toastMessage)
    } catch (error) {
      console.error("Failed to import shared map", error)
      showToast(friendlySupabaseError(error))
    }
    }, [cloudMode, setFeatures, setMaps, showToast, setSharedMapData, setActiveTab, setActiveMapSource, setMapsView, setActiveMapId, setSelectedFeatureId, setSelectedFeatureSummaryId, setFeatureSheet, setEditorMode, setDraftPoints, setFitTrigger, refreshGameProfile])

  const importSharedMapToLocal = useCallback(async () => {
    if (!sharedMapData) return
    await importMapBundleToLocal(sharedMapData, { toastMessage: "공유 지도를 내 라이브러리에 저장했어요." })
  }, [importMapBundleToLocal, sharedMapData])

  // 발행 = 공개 링크(/s/:slug) 를 가진 상태로 전환. 프로필 노출을 자동으로 하지 않는다.
  const publishMap = useCallback(async (mapId) => {
    const effectiveMapId = mapId ?? publishSheet?.selectedMapId
    if (!effectiveMapId) return showToast("발행할 지도를 먼저 선택해 주세요.")
    const targetMap = maps.find((item) => item.id === effectiveMapId)
    // 행사지도 발행은 대시보드 전용 — 메인 앱 발행 흐름에서 차단
    if (isEventMap(targetMap)) {
      setPublishSheet(null)
      return null
    }
    if (targetMap?.isPublished) return showToast("이미 발행된 지도예요.")
    const mapFeatureCount = features.filter((f) => f.mapId === effectiveMapId).length
    if (mapFeatureCount === 0) return showToast("장소를 추가해야 발행할 수 있어요.")

    try {
      if (cloudMode) {
        const { map: publishedMap } = await publishMapRecord(effectiveMapId, {
          title: targetMap?.title,
          visibility: "public",
        })
        setMaps((current) => current.map((item) => (item.id === effectiveMapId ? publishedMap : item)))
      } else {
        const now = new Date().toISOString()
        setMaps((current) => current.map((item) => (
          item.id === effectiveMapId
            ? { ...item, isPublished: true, publishedAt: now, updatedAt: now, slug: item.slug || `local-${effectiveMapId}` }
            : item
        )))
      }
      logEvent("map_publish", { map_id: effectiveMapId })
      if (cloudMode) recordMapAction({ actionType: "map_publish", eventKey: `publish:${effectiveMapId}`, mapId: effectiveMapId }).then(() => refreshGameProfile?.()).catch(() => {})
      setPublishSheet(null)
      showToast("지도를 발행했어요.")
      return effectiveMapId
    } catch (error) {
      console.error("Failed to publish map", error)
      showToast(friendlySupabaseError(error))
      return null
    }
  }, [cloudMode, features, maps, publishSheet, setMaps, setPublishSheet, showToast, refreshGameProfile])

  // 발행 중단 = is_published=false + publication row 삭제(프로필에서도 내려감).
  // 인자: mapId 또는 postId(shares 항목의 id). 두 경로 모두 지원한다.
  const unpublish = useCallback(async (idOrPostId) => {
    try {
      const targetShare = shares.find((share) => share.id === idOrPostId)
      const targetMapId = targetShare?.mapId || idOrPostId
      if (!targetMapId) return
      const targetMap = maps.find((item) => item.id === targetMapId)
      // 행사지도는 대시보드에서만 발행 중단한다.
      if (isEventMap(targetMap)) return
      if (cloudMode) {
        await unpublishMapRecord(targetMapId)
      }
      logEvent("map_unpublish", { map_id: targetMapId })
      setShares((current) => current.filter((share) => share.mapId !== targetMapId))
      setMaps((current) => current.map((item) => (
        item.id === targetMapId
          ? { ...item, isPublished: false, publishedAt: null, slug: null, publication: null }
          : item
      )))
      setSelectedPostRef((current) => {
        if (!current) return current
        if (current.source === "own" && (current.id === idOrPostId || current.id === targetMapId)) return null
        return current
      })
      showToast("발행을 중단했어요. 프로필에서도 내려갔어요.")
    } catch (error) {
      console.error("Failed to unpublish map", error)
      showToast(friendlySupabaseError(error))
    }
  }, [cloudMode, maps, setMaps, setSelectedPostRef, setShares, shares, showToast])

  // 프로필에 올리기 = publication row 생성 (발행된 지도 한정).
  const addMapToProfile = useCallback(async (mapId) => {
    if (!mapId) return false
    const targetMap = maps.find((item) => item.id === mapId)
    if (!targetMap) return false
    if (!targetMap.isPublished) {
      showToast("먼저 지도를 발행해 주세요.")
      return false
    }
    if (shares.some((share) => share.mapId === mapId)) {
      showToast("이미 프로필에 올라간 지도예요.")
      return false
    }
    try {
      if (cloudMode) {
        const row = await addMapToProfileRecord(mapId, { caption: "" })
        const publication = {
          id: row.id,
          mapId: row.map_id,
          caption: row.caption || "",
          date: (row.published_at || row.created_at || "").slice(0, 10),
          likes: row.likes_count || 0,
          saves: row.saves_count || 0,
          publishedAt: row.published_at || row.created_at || null,
        }
        setShares((current) => [publication, ...current])
      } else {
        setShares((current) => [
          { id: createId("share"), mapId, caption: "", date: new Date().toISOString().slice(0, 10), likes: 0, saves: 0 },
          ...current,
        ])
      }
      logEvent("map_add_to_profile", { map_id: mapId })
      showToast("프로필에 올렸어요.")
      return true
    } catch (error) {
      console.error("Failed to add map to profile", error)
      showToast(friendlySupabaseError(error))
      return false
    }
  }, [cloudMode, maps, setShares, shares, showToast])

  const removeMapFromProfile = useCallback(async (mapId) => {
    if (!mapId) return false
    const shareRow = shares.find((share) => share.mapId === mapId)
    if (!shareRow) return false
    try {
      if (cloudMode) {
        await removeMapFromProfileRecord(mapId)
      }
      logEvent("map_remove_from_profile", { map_id: mapId })
      setShares((current) => current.filter((share) => share.mapId !== mapId))
      setSelectedPostRef((current) => {
        if (!current) return current
        if (current.source === "own" && current.id === shareRow.id) return null
        return current
      })
      showToast("프로필에서 내렸어요.")
      return true
    } catch (error) {
      console.error("Failed to remove map from profile", error)
      showToast(friendlySupabaseError(error))
      return false
    }
  }, [cloudMode, setSelectedPostRef, setShares, shares, showToast])

  const openFeatureFromPlaces = useCallback((featureId) => {
    const feature = features.find((item) => item.id === featureId)
    if (!feature) return
    setActiveTab("maps")
    setActiveMapSource("local")
    setActiveMapId(feature.mapId)
    setMapsView("editor")
    resetEditorState()
    setSelectedFeatureId(featureId)
    setSelectedFeatureSummaryId(featureId)
    // Cannot call getFeatureCenter here - import it
    if (feature.type === "pin") {
      setFocusPoint({ lat: feature.lat, lng: feature.lng, zoom: 16 })
    } else if (feature.points?.length) {
      const total = feature.points.reduce(
        (acc, [lng, lat]) => ({ lat: acc.lat + lat, lng: acc.lng + lng }),
        { lat: 0, lng: 0 },
      )
      setFocusPoint({
        lat: total.lat / feature.points.length,
        lng: total.lng / feature.points.length,
        zoom: 15,
      })
    }
    setFitTrigger((value) => value + 1)
  }, [features, resetEditorState, setActiveMapId, setActiveMapSource, setActiveTab, setFitTrigger, setFocusPoint, setMapsView, setSelectedFeatureId, setSelectedFeatureSummaryId])

  const handleTabChange = useCallback((nextTab) => {
    setActiveTab(nextTab)
    if (nextTab !== "maps") {
      setMapsView("list")
      setEditorMode("browse")
      setDraftPoints([])
    }
  }, [setActiveTab, setDraftPoints, setEditorMode, setMapsView])

  return {
    touchMap,
    resetEditorState,
    openMapEditor,
    openDemoMap,
    openCommunityMapEditor,
    saveMapSheet,
    deleteMap,
    importMapBundleToLocal,
    importSharedMapToLocal,
    publishMap,
    unpublish,
    addMapToProfile,
    removeMapFromProfile,
    openFeatureFromPlaces,
    handleTabChange,
  }
}
