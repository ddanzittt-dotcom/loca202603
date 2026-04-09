import { useCallback } from "react"
import { createId } from "../lib/appUtils"
import { logEvent } from "../lib/analytics"
import { cleanupFeatureMedia } from "../lib/mediaCleanup"
import { friendlySupabaseError } from "../lib/mapService"
import {
  createMap as createMapRecord,
  updateMap as updateMapRecord,
  deleteMap as deleteMapRecord,
  createFeature as createFeatureRecord,
  publishMap as publishMapRecord,
  unpublishMap as unpublishMapRecord,
  linkMapLineage as linkMapLineageRecord,
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
    setActiveMapId("community-map")
    setMapsView("editor")
    resetEditorState()
    setFitTrigger((value) => value + 1)
  }, [resetEditorState, setActiveMapId, setActiveMapSource, setActiveTab, setFitTrigger, setMapsView])

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
    const toastMessage = options.toastMessage || "발행 지도를 내 라이브러리에 저장했어요."

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
    await importMapBundleToLocal(sharedMapData, { toastMessage: "발행 지도를 내 라이브러리에 저장했어요." })
  }, [importMapBundleToLocal, sharedMapData])

  const publishMap = useCallback(async (mapId) => {
    const effectiveMapId = mapId ?? publishSheet?.selectedMapId
    if (!effectiveMapId) return showToast("발행할 지도를 먼저 선택해 주세요.")
    if (shares.some((share) => share.mapId === effectiveMapId && share.visibility === "public")) return showToast("이미 쇼케이스에 발행된 지도예요.")
    const mapFeatureCount = features.filter((f) => f.mapId === effectiveMapId).length
    if (mapFeatureCount === 0) return showToast("장소를 추가해야 발행할 수 있어요.")
    const caption = publishSheet?.caption?.trim() || ""

    try {
      if (cloudMode) {
        const mapItem = maps.find((item) => item.id === effectiveMapId)
        const { map: publishedMap, publication } = await publishMapRecord(effectiveMapId, {
          caption,
          title: mapItem?.title,
          visibility: "public",
        })
        setMaps((current) => current.map((item) => (item.id === effectiveMapId ? publishedMap : item)))
        setShares((current) => [publication, ...current])
      } else {
        setShares((current) => [
          { id: createId("share"), mapId: effectiveMapId, caption, date: new Date().toISOString().slice(0, 10), likes: 0, saves: 0 },
          ...current,
        ])
      }
      logEvent("map_publish", { map_id: effectiveMapId })
      if (cloudMode) recordMapAction({ actionType: "map_publish", eventKey: `publish:${effectiveMapId}`, mapId: effectiveMapId }).then(() => refreshGameProfile?.()).catch(() => {})
      setPublishSheet(null)
      showToast("쇼케이스에 지도를 발행했어요.")
    } catch (error) {
      console.error("Failed to publish map", error)
      showToast(friendlySupabaseError(error))
    }
  }, [cloudMode, features, maps, publishSheet, setMaps, setPublishSheet, setShares, shares, showToast, refreshGameProfile])

  const unpublish = useCallback(async (postId) => {
    try {
      if (cloudMode) {
        const targetShare = shares.find((share) => share.id === postId)
        if (targetShare?.mapId) {
          await unpublishMapRecord(targetShare.mapId)
        }
      }
      const targetShareForLog = shares.find((share) => share.id === postId)
      logEvent("map_unpublish", { map_id: targetShareForLog?.mapId })
      setShares((current) => current.filter((share) => share.id !== postId))
      setSelectedPostRef((current) => (current?.source === "own" && current.id === postId ? null : current))
      showToast("지도 발행을 중단했어요.")
    } catch (error) {
      console.error("Failed to unpublish map", error)
      showToast(friendlySupabaseError(error))
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
    openFeatureFromPlaces,
    handleTabChange,
  }
}
