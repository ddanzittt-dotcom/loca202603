import { useCallback } from "react"
import { createId } from "../lib/appUtils"
import { logEvent } from "../lib/analytics"
import { friendlySupabaseError } from "../lib/mapService"
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
import { toEditableFeature } from "./useFeatureEditing"
import { createShortShareSlug } from "../lib/mapService.utils"
import { syncFeatureListLocalMediaToCloud } from "../lib/mediaCloudSync"

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
    // 초기 뷰를 마커가 가장 조밀한 지역으로 자동 fit — 이전 focusPoint 가 남아 있으면 우선돼 버려서 비운다.
    setFocusPoint(null)
    setFitTrigger((value) => value + 1)
  }, [resetEditorState, setActiveMapId, setActiveMapSource, setActiveTab, setFitTrigger, setFocusPoint, setMapsView])

  const openDemoMap = useCallback((mapId) => {
    setActiveTab("maps")
    setActiveMapSource("demo")
    setActiveMapId(mapId)
    setMapsView("editor")
    resetEditorState()
    // 초기 뷰를 마커가 가장 조밀한 지역으로 자동 fit — 이전 focusPoint 가 남아 있으면 우선돼 버려서 비운다.
    setFocusPoint(null)
    setFitTrigger((value) => value + 1)
  }, [resetEditorState, setActiveMapId, setActiveMapSource, setActiveTab, setFitTrigger, setFocusPoint, setMapsView])

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
  }, [cloudMode, mapSheet, openMapEditor, setMapSheet, setMaps, showToast])

  const deleteMap = useCallback(async (directMapId) => {
    const targetId = directMapId || mapSheet?.id
    if (!targetId) return
    if (!directMapId && !window.confirm("이 지도를 삭제할까요? 지도에 담긴 장소 카드는 '내 장소'에 그대로 남고, 발행·공유만 해제돼요.")) return

    try {
      if (cloudMode) {
        await deleteMapRecord(targetId)
      }
      // 채집-우선(050): 지도를 지워도 장소 카드는 보존한다. 서버는 maps 행만 지우고
      // map_features.map_id 는 SET NULL, 배치(map_feature_placements)는 CASCADE 로 정리한다.
      // 클라 상태도 동일하게 — 이 지도 소속 카드를 mapless 로 전환(제거·미디어삭제 아님)해 바인더에 남긴다.
      setMaps((current) => current.filter((mapItem) => mapItem.id !== targetId))
      setFeatures((current) => current.map((feature) => (
        feature.mapId === targetId ? { ...feature, mapId: null } : feature
      )))
      setShares((current) => current.filter((share) => share.mapId !== targetId))
      if (mapSheet?.id === targetId) setMapSheet(null)
      setFeatureSheet(null)
      setMapsView("list")
      showToast("지도를 삭제했어요. 담긴 장소는 '내 장소'에 남아 있어요.")
    } catch (error) {
      console.error("Failed to delete map", error)
      showToast(friendlySupabaseError(error))
    }
  }, [cloudMode, mapSheet, setFeatureSheet, setFeatures, setMapSheet, setMaps, setMapsView, setShares, showToast])

  const reorderMaps = useCallback(async (orderedIds = []) => {
    const orderById = new Map(orderedIds.map((id, index) => [id, index]))
    const previousMaps = maps
    const applyOrder = (mapItem) => {
      if (!orderById.has(mapItem.id)) return mapItem
      return {
        ...mapItem,
        config: {
          ...(mapItem.config || {}),
          listOrder: orderById.get(mapItem.id),
        },
      }
    }

    setMaps((current) => current.map(applyOrder))

    try {
      if (cloudMode) {
        await Promise.all(
          orderedIds.map((mapId, index) => {
            const mapItem = maps.find((item) => item.id === mapId)
            if (!mapItem) return null
            return updateMapRecord(mapId, {
              config: {
                ...(mapItem.config || {}),
                listOrder: index,
              },
            })
          }).filter(Boolean),
        )
      }
      showToast("지도 순서를 변경했어요.")
    } catch (error) {
      console.error("Failed to reorder maps", error)
      setMaps(previousMaps)
      showToast(friendlySupabaseError(error))
    }
  }, [cloudMode, maps, setMaps, showToast])

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
    }, [cloudMode, setFeatures, setMaps, showToast, setSharedMapData, setActiveTab, setActiveMapSource, setMapsView, setActiveMapId, setSelectedFeatureId, setSelectedFeatureSummaryId, setFeatureSheet, setEditorMode, setDraftPoints, setFitTrigger])

  const importSharedMapToLocal = useCallback(async () => {
    if (!sharedMapData) return
    await importMapBundleToLocal(sharedMapData, { toastMessage: "공유 지도를 내 라이브러리에 저장했어요." })
  }, [importMapBundleToLocal, sharedMapData])

  // 링크 공유 켜기 = 짧은 랜덤 링크(/s/xxxxxxx) 를 가진 상태로 전환.
  // visibility 는 unlisted — 링크를 아는 사람만 볼 수 있고, 검색·탐색·사이트맵에는 노출되지 않는다.
  // (공개 전환·프로필 노출은 별도 액션)
  const publishMap = useCallback(async (mapId) => {
    const effectiveMapId = mapId ?? publishSheet?.selectedMapId
    if (!effectiveMapId) return showToast("링크를 켤 지도를 먼저 선택해 주세요.")
    const targetMap = maps.find((item) => item.id === effectiveMapId)
    if (targetMap?.isPublished) return showToast("이미 링크 공유 중인 지도예요.")
    const mapFeatures = features.filter((f) => f.mapId === effectiveMapId)
    const mapFeatureCount = mapFeatures.length
    if (mapFeatureCount === 0) return showToast("장소를 추가해야 링크를 켤 수 있어요.")

    try {
      if (cloudMode) {
        const mediaSync = await syncFeatureListLocalMediaToCloud(mapFeatures, { throwOnFailure: true })
        if (mediaSync.syncedCount > 0) {
          const syncedById = new Map(mediaSync.features.map((feature) => [feature.id, feature]))
          setFeatures((current) => current.map((feature) => {
            const synced = syncedById.get(feature.id)
            return synced ? { ...feature, photos: synced.photos } : feature
          }))
        }
        // 링크를 껐다 다시 켜면 새 slug 가 발급된다(회수한 옛 링크는 되살아나지 않음).
        const { map: publishedMap } = await publishMapRecord(effectiveMapId, {
          slug: createShortShareSlug(),
          visibility: "unlisted",
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
      setPublishSheet(null)
      showToast("공유 링크를 만들었어요. 링크를 아는 사람만 볼 수 있어요.")
      return effectiveMapId
    } catch (error) {
      console.error("Failed to publish map", error)
      showToast(friendlySupabaseError(error))
      return null
    }
  }, [cloudMode, features, maps, publishSheet, setFeatures, setMaps, setPublishSheet, showToast])

  // 링크 공유 중인 지도의 스냅샷을 조용히 갱신한다 (주소 유지, 내용만 최신화).
  // 공유 시트를 열 때마다 호출 — 실패해도 사용자 흐름을 막지 않는다.
  const refreshShareSnapshot = useCallback(async (mapId) => {
    if (!cloudMode || !mapId) return
    const targetMap = maps.find((item) => item.id === mapId)
    if (!targetMap?.slug || !targetMap?.isPublished) return
    try {
      const { map: refreshedMap } = await publishMapRecord(mapId, {
        slug: targetMap.slug,
        visibility: targetMap.visibility || "unlisted",
      })
      setMaps((current) => current.map((item) => (item.id === mapId ? refreshedMap : item)))
    } catch (error) {
      console.warn("Failed to refresh share snapshot", error)
    }
  }, [cloudMode, maps, setMaps])

  // 발행 중단 = is_published=false + publication row 삭제(프로필에서도 내려감).
  // 인자: mapId 또는 postId(shares 항목의 id). 두 경로 모두 지원한다.
  const unpublish = useCallback(async (idOrPostId) => {
    try {
      const targetShare = shares.find((share) => share.id === idOrPostId)
      const targetMapId = targetShare?.mapId || idOrPostId
      if (!targetMapId) return
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
      showToast("링크 공유를 중지했어요. 프로필에서도 내려갔어요.")
    } catch (error) {
      console.error("Failed to unpublish map", error)
      showToast(friendlySupabaseError(error))
    }
  }, [cloudMode, setMaps, setSelectedPostRef, setShares, shares, showToast])

  // 프로필에 올리기 = publication row 생성 (링크 공유 중인 지도 한정).
  // options.assumePublished: 같은 호출 안에서 방금 링크를 만들어 maps state 가 아직 낡았을 때(공개 토글) 가드 우회.
  // options.silent: 공개 토글에 흡수되어 호출될 때 개별 토스트 생략.
  const addMapToProfile = useCallback(async (mapId, { assumePublished = false, silent = false } = {}) => {
    if (!mapId) return false
    const targetMap = maps.find((item) => item.id === mapId)
    if (!targetMap) return false
    if (!assumePublished && !targetMap.isPublished) {
      showToast("먼저 링크 공유를 켜 주세요.")
      return false
    }
    if (shares.some((share) => share.mapId === mapId)) {
      if (!silent) showToast("이미 프로필에 올라간 지도예요.")
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
      if (!silent) showToast("프로필에 올렸어요.")
      return true
    } catch (error) {
      console.error("Failed to add map to profile", error)
      showToast(friendlySupabaseError(error))
      return false
    }
  }, [cloudMode, maps, setShares, shares, showToast])

  const removeMapFromProfile = useCallback(async (mapId, { silent = false } = {}) => {
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
      if (!silent) showToast("프로필에서 내렸어요.")
      return true
    } catch (error) {
      console.error("Failed to remove map from profile", error)
      showToast(friendlySupabaseError(error))
      return false
    }
  }, [cloudMode, setSelectedPostRef, setShares, shares, showToast])

  // 공개 토글 = 검색·탐색·프로필 노출을 한 번에 켜고 끈다.
  // ON: visibility=public (링크 없으면 새로 생성) + 프로필 노출 + 스냅샷 갱신.
  // OFF: unlisted 로 강등 — 링크를 아는 사람은 계속 볼 수 있다(완전 차단은 링크 공유 끄기).
  const setMapPublic = useCallback(async (mapId, isPublic) => {
    if (!mapId) return false
    const targetMap = maps.find((item) => item.id === mapId)
    if (!targetMap) return false
    try {
      if (cloudMode) {
        const { map: updatedMap } = await publishMapRecord(mapId, {
          slug: targetMap.slug || createShortShareSlug(),
          visibility: isPublic ? "public" : "unlisted",
        })
        setMaps((current) => current.map((item) => (item.id === mapId ? updatedMap : item)))
      } else {
        const now = new Date().toISOString()
        setMaps((current) => current.map((item) => (
          item.id === mapId
            ? {
                ...item,
                visibility: isPublic ? "public" : "unlisted",
                isPublished: true,
                publishedAt: item.publishedAt || now,
                updatedAt: now,
                slug: item.slug || `local-${mapId}`,
              }
            : item
        )))
      }
      logEvent(isPublic ? "map_set_public" : "map_set_unlisted", { map_id: mapId })
      if (isPublic) {
        await addMapToProfile(mapId, { assumePublished: true, silent: true })
        showToast("지도를 공개했어요. 검색·탐색과 프로필에 노출돼요.")
      } else {
        await removeMapFromProfile(mapId, { silent: true })
        showToast("공개를 껐어요. 링크를 아는 사람은 계속 볼 수 있어요.")
      }
      return true
    } catch (error) {
      console.error("Failed to toggle map public visibility", error)
      showToast(friendlySupabaseError(error))
      return false
    }
  }, [addMapToProfile, cloudMode, maps, removeMapFromProfile, setMaps, showToast])

  const openFeatureFromPlaces = useCallback((featureId, options) => {
    const feature = features.find((item) => (item.id || item.feature_id) === featureId)
    if (!feature) return
    setActiveTab("maps")
    setActiveMapSource("local")
    setActiveMapId(feature.mapId || feature.map_id)
    setMapsView("editor")
    resetEditorState()
    setSelectedFeatureId(featureId)
    setSelectedFeatureSummaryId(featureId)
    // 빈 이름 row에서 진입한 경우, 편집 시트를 즉시 열어 이름 입력으로 유도.
    if (options?.focusName) {
      setFeatureSheet({ ...toEditableFeature(feature), _focusName: true })
    }
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
  }, [features, resetEditorState, setActiveMapId, setActiveMapSource, setActiveTab, setFeatureSheet, setFitTrigger, setFocusPoint, setMapsView, setSelectedFeatureId, setSelectedFeatureSummaryId])

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
    reorderMaps,
    importMapBundleToLocal,
    importSharedMapToLocal,
    publishMap,
    refreshShareSnapshot,
    setMapPublic,
    unpublish,
    addMapToProfile,
    removeMapFromProfile,
    openFeatureFromPlaces,
    handleTabChange,
  }
}
