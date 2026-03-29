import { useCallback } from "react"
import { createId, tagsToText, sanitizePoints, sanitizeCoord } from "../lib/appUtils"
import { deleteMedia } from "../lib/mediaStore"
import {
  createFeature as createFeatureRecord,
  updateFeature as updateFeatureRecord,
  deleteFeature as deleteFeatureRecord,
} from "../lib/mapService"
import { me } from "../data/sampleData"

const toEditableFeature = (feature) => ({ ...feature, tagsText: tagsToText(feature.tags) })

const getFeatureDefaultEmoji = (type) => {
  if (type === "route") return "\uD83D\uDEE3\uFE0F"
  if (type === "area") return "\uD83D\uDFE9"
  return "\uD83D\uDCCD"
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

export { toEditableFeature, getFeatureDefaultEmoji, getFeatureCenter }

export function useFeatureEditing({
  activeMapId,
  activeMapSource,
  cloudMode,
  setFeatures,
  featureSheet,
  setFeatureSheet,
  selectedFeatureSummaryId,
  setSelectedFeatureId,
  setSelectedFeatureSummaryId,
  setEditorMode,
  setDraftPoints,
  setMemoText,
  activeFeaturePool,
  communityMapFeatures,
  setCommunityMapFeatures,
  touchMap,
  showToast,
  setMaps,
}) {
  const focusFeature = useCallback((featureId) => {
    const feature = activeFeaturePool.find((item) => item.id === featureId)
    if (!feature) return
    if (selectedFeatureSummaryId === featureId) {
      // open detail on second tap
      setSelectedFeatureId(featureId)
      setSelectedFeatureSummaryId(featureId)
      setFeatureSheet(toEditableFeature(feature))
      return
    }
    setSelectedFeatureId(featureId)
    setSelectedFeatureSummaryId(featureId)
  }, [activeFeaturePool, selectedFeatureSummaryId, setFeatureSheet, setSelectedFeatureId, setSelectedFeatureSummaryId])

  const focusFeatureOnly = useCallback((featureId) => {
    const feature = activeFeaturePool.find((item) => item.id === featureId)
    if (!feature) return
    setSelectedFeatureId(featureId)
    setSelectedFeatureSummaryId(featureId)
  }, [activeFeaturePool, setSelectedFeatureId, setSelectedFeatureSummaryId])

  const openFeatureDetail = useCallback((featureId) => {
    const feature = activeFeaturePool.find((item) => item.id === featureId)
    if (!feature) return
    setSelectedFeatureId(featureId)
    setSelectedFeatureSummaryId(featureId)
    setFeatureSheet(toEditableFeature(feature))
  }, [activeFeaturePool, setFeatureSheet, setSelectedFeatureId, setSelectedFeatureSummaryId])

  const saveFeatureSheet = useCallback(async () => {
    if (!featureSheet?.title.trim()) return showToast("이름을 입력하세요.")
    const trimmedTitle = featureSheet.title.trim().slice(0, 100)
    const nextFeature = {
      ...featureSheet,
      title: trimmedTitle,
      emoji: featureSheet.emoji || getFeatureDefaultEmoji(featureSheet.type),
      tags: featureSheet.tagsText.split(",").map((tag) => tag.trim().slice(0, 50)).filter(Boolean).slice(0, 20),
      note: (featureSheet.note || "").slice(0, 2000),
      updatedAt: new Date().toISOString(),
    }
    if (nextFeature.type === "pin" && nextFeature.lat != null) {
      const sc = sanitizeCoord(nextFeature.lat, nextFeature.lng)
      nextFeature.lat = sc.lat
      nextFeature.lng = sc.lng
    }
    if (nextFeature.points) {
      nextFeature.points = sanitizePoints(nextFeature.points)
    }
    delete nextFeature.tagsText
    // Merge: keep photos/voices/memos from the live features array to avoid overwriting
    const mergeMediaFromCurrent = (current) => current.map((f) => {
      if (f.id !== nextFeature.id) return f
      return { ...nextFeature, photos: f.photos || nextFeature.photos, voices: f.voices || nextFeature.voices, memos: f.memos || nextFeature.memos }
    })
    if (activeMapSource === "community") {
      setCommunityMapFeatures(mergeMediaFromCurrent)
    } else {
      if (cloudMode) {
        try {
          const savedFeature = await updateFeatureRecord(nextFeature.id, {
            ...nextFeature,
            mapId: nextFeature.mapId,
          })
          setFeatures((current) => current.map((feature) => {
            if (feature.id !== nextFeature.id) return feature
            return { ...savedFeature, photos: feature.photos || [], voices: feature.voices || [], memos: feature.memos || [] }
          }))
          setFeatureSheet((c) => toEditableFeature({ ...savedFeature, photos: c?.photos || [], voices: c?.voices || [], memos: c?.memos || [] }))
          setMaps((current) => current.map((mapItem) => (mapItem.id === savedFeature.mapId ? { ...mapItem, updatedAt: new Date().toISOString() } : mapItem)))
          showToast("정보를 저장했어요.")
          return
        } catch (error) {
          console.error("Failed to update feature", error)
          showToast("항목을 저장하지 못했어요.")
          return
        }
      }

      setFeatures(mergeMediaFromCurrent)
      touchMap(nextFeature.mapId)
    }
    setFeatureSheet((c) => toEditableFeature({ ...nextFeature, photos: c?.photos || [], voices: c?.voices || [], memos: c?.memos || [] }))
    showToast("정보를 저장했어요.")
  }, [activeMapSource, cloudMode, featureSheet, setCommunityMapFeatures, setFeatureSheet, setFeatures, setMaps, showToast, touchMap])

  const deleteFeature = useCallback(async () => {
    if (!featureSheet?.id || !window.confirm("이 항목을 삭제할까요?")) return
    if (activeMapSource === "community") {
      setCommunityMapFeatures((current) => current.filter((f) => f.id !== featureSheet.id))
    } else {
      if (cloudMode) {
        try {
          await deleteFeatureRecord(featureSheet.id, featureSheet.mapId)
        } catch (error) {
          console.error("Failed to delete feature", error)
          showToast("항목을 삭제하지 못했어요.")
          return
        }
      }
      setFeatures((current) => current.filter((feature) => feature.id !== featureSheet.id))
      touchMap(featureSheet.mapId)
    }
    for (const photo of (featureSheet.photos || [])) { try { await deleteMedia(photo.id) } catch { /* ignore */ } }
    for (const voice of (featureSheet.voices || [])) { try { await deleteMedia(voice.id) } catch { /* ignore */ } }
    setFeatureSheet(null)
    setSelectedFeatureId(null)
    setSelectedFeatureSummaryId(null)
    showToast("항목을 삭제했어요.")
  }, [activeMapSource, cloudMode, featureSheet, setCommunityMapFeatures, setFeatureSheet, setFeatures, setSelectedFeatureId, setSelectedFeatureSummaryId, showToast, touchMap])

  const addMemo = useCallback((featureId, text) => {
    if (!text.trim()) return
    const memo = {
      id: createId("memo"),
      userId: me.id,
      userName: me.name,
      date: new Date().toISOString(),
      text: text.trim(),
    }
    const isCommunityFeature = communityMapFeatures.some((f) => f.id === featureId)
    if (isCommunityFeature) {
      setCommunityMapFeatures((current) =>
        current.map((f) => (f.id === featureId ? { ...f, memos: [...(f.memos || []), memo] } : f)),
      )
    } else {
      setFeatures((current) =>
        current.map((f) => (f.id === featureId ? { ...f, memos: [...(f.memos || []), memo] } : f)),
      )
    }
    setMemoText("")
    if (featureSheet && featureSheet.id === featureId) {
      setFeatureSheet((current) => ({ ...current, memos: [...(current.memos || []), memo] }))
    }
    showToast("메모를 저장했어요.")
  }, [communityMapFeatures, featureSheet, setCommunityMapFeatures, setFeatureSheet, setFeatures, setMemoText, showToast])

  const createHandleMapTap = (editorMode) => async ({ lat, lng }) => {
    if (!activeMapId) return
    const sc = sanitizeCoord(lat, lng)
    if (editorMode === "pin") {
      let nextFeature = {
        id: createId("feat"),
        mapId: activeMapId,
        type: "pin",
        title: "새 장소",
        emoji: "\uD83D\uDCCD",
        lat: sc.lat,
        lng: sc.lng,
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
            return showToast("핀을 추가하지 못했어요.")
          }
        }
        setFeatures((current) => [nextFeature, ...current])
        touchMap(activeMapId)
      }
      setEditorMode("browse")
      setSelectedFeatureId(nextFeature.id)
      setFeatureSheet(toEditableFeature(nextFeature))
      return showToast("핀을 추가했어요.")
    }
    if (editorMode === "route" || editorMode === "area") {
      setDraftPoints((current) => [...current, [sc.lng, sc.lat]])
    }
  }

  const completeRoute = async (draftPoints) => {
    if (!activeMapId || draftPoints.length < 2) return showToast("경로는 두 점 이상 필요해요.")
    let nextFeature = {
      id: createId("feat"),
      mapId: activeMapId,
      type: "route",
      title: "새 경로",
      emoji: "\uD83D\uDEE3\uFE0F",
      points: sanitizePoints(draftPoints),
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
          return showToast("경로를 저장하지 못했어요.")
        }
      }
      setFeatures((current) => [nextFeature, ...current])
      touchMap(activeMapId)
    }
    setDraftPoints([])
    setEditorMode("browse")
    setSelectedFeatureId(nextFeature.id)
    setFeatureSheet(toEditableFeature(nextFeature))
    showToast("경로를 저장했어요.")
  }

  const completeArea = async (draftPoints) => {
    if (!activeMapId || draftPoints.length < 3) return showToast("범위는 세 점 이상 필요해요.")
    let nextFeature = {
      id: createId("feat"),
      mapId: activeMapId,
      type: "area",
      title: "새 범위",
      emoji: "\uD83D\uDFE9",
      points: sanitizePoints(draftPoints),
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
          return showToast("범위를 저장하지 못했어요.")
        }
      }
      setFeatures((current) => [nextFeature, ...current])
      touchMap(activeMapId)
    }
    setDraftPoints([])
    setEditorMode("browse")
    setSelectedFeatureId(nextFeature.id)
    setFeatureSheet(toEditableFeature(nextFeature))
    showToast("범위를 저장했어요.")
  }

  return {
    focusFeature,
    focusFeatureOnly,
    openFeatureDetail,
    saveFeatureSheet,
    deleteFeature,
    addMemo,
    createHandleMapTap,
    completeRoute,
    completeArea,
  }
}
