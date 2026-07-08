import { useCallback, useRef } from "react"
import { createId, tagsToText, sanitizePoints, sanitizeCoord } from "../lib/appUtils"
import { logEvent } from "../lib/analytics"
import { cleanupFeatureMedia } from "../lib/mediaCleanup"
import {
  addFeatureMemo as addFeatureMemoRecord,
  updateFeatureMemo as updateFeatureMemoRecord,
  deleteFeatureMemo as deleteFeatureMemoRecord,
  createFeature as createFeatureRecord,
  updateFeature as updateFeatureRecord,
  deleteFeature as deleteFeatureRecord,
} from "../lib/mapService"
import { createFeatureChangeRequest } from "../lib/mapService.write"
import { me } from "../data/sampleData"
import { uploadMediaToCloud } from "../lib/mediaStore"
import { getDefaultFeatureStyle, normalizeFeatureStyle } from "../lib/featureStyle"
import { triggerSelectionFeedback } from "../lib/haptics"

const toEditableFeature = (feature) => ({
  ...feature,
  style: normalizeFeatureStyle(feature?.style, feature?.type || "pin"),
  tagsText: tagsToText(feature.tags),
})

function preserveDraftFeatureFields(savedFeature, draftFeature) {
  const next = { ...savedFeature }
  for (const key of ["emoji", "emojiKind", "emojiPixelId", "emojiPhotoUrl", "category", "style"]) {
    if (Object.prototype.hasOwnProperty.call(draftFeature || {}, key)) {
      next[key] = draftFeature[key]
    }
  }
  return next
}

const getFeatureDefaultEmoji = (type) => {
  if (type === "route") return "\uD83D\uDEE3\uFE0F"
  if (type === "area") return "\uD83D\uDFE9"
  return "\uD83D\uDCCD"
}

import { getFeatureCenter } from "../lib/appUtils"

// 두 좌표 간 거리 (km) - haversine
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const toRad = (d) => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// 모두의 지도 — 현재 위치 기준 반경 2km 안에서만 기록한다.
// 보고서 11.2: "경험은 데이터가 아니라 몸이 그 자리에 있었던 흔적이다."
const COMMUNITY_DISTANCE_LIMIT_KM = 2

function checkCommunityDistance(activeMapSource, myLocation, lat, lng, showToast) {
  if (activeMapSource !== "community") return true
  if (!myLocation) {
    showToast("위치 권한을 허용하면 내 주변 장소만 남길 수 있어요.")
    return false
  }
  const dist = haversineKm(myLocation.lat, myLocation.lng, lat, lng)
  if (dist > COMMUNITY_DISTANCE_LIMIT_KM) {
    showToast(`내 위치에서 ${dist.toFixed(1)}km 떨어져 있어요. 2km 이내만 남길 수 있어요.`)
    return false
  }
  return true
}

function isSupabaseUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(`${value || ""}`)
}

/**
 * DB에서 반환된 feature(memos/photos/voices가 빈 배열일 수 있음)와
 * 로컬 state의 기존 feature를 병합한다.
 * DB 응답 메타(title, tags 등)를 우선하고, 미디어/메모는 비어있지 않은 쪽을 유지한다.
 */
function mergeFeatureMedia(saved, current) {
  return {
    ...saved,
    photos: saved.photos?.length ? saved.photos : (current?.photos || []),
    voices: saved.voices?.length ? saved.voices : (current?.voices || []),
    memos: saved.memos?.length ? saved.memos : (current?.memos || []),
  }
}

export { toEditableFeature, getFeatureDefaultEmoji, getFeatureCenter, mergeFeatureMedia }

function tagsFromText(tagsText) {
  return `${tagsText || ""}`
    .split(",")
    .map((tag) => tag.trim().slice(0, 50))
    .filter(Boolean)
    .slice(0, 20)
}

function mergePendingSheetDraft(savedFeature, currentSheet) {
  if (!currentSheet) return { ...savedFeature, cloudPending: false }
  const tags = typeof currentSheet.tagsText === "string"
    ? tagsFromText(currentSheet.tagsText)
    : (currentSheet.tags || savedFeature.tags || [])
  return mergeFeatureMedia({
    ...savedFeature,
    title: currentSheet.title ?? savedFeature.title,
    note: currentSheet.note ?? savedFeature.note,
    tags,
    emoji: Object.prototype.hasOwnProperty.call(currentSheet, "emoji") ? currentSheet.emoji : savedFeature.emoji,
    emojiKind: currentSheet.emojiKind ?? savedFeature.emojiKind,
    emojiPixelId: currentSheet.emojiPixelId ?? savedFeature.emojiPixelId,
    emojiPhotoUrl: currentSheet.emojiPhotoUrl ?? savedFeature.emojiPhotoUrl,
    category: currentSheet.category ?? savedFeature.category,
    style: currentSheet.style ?? savedFeature.style,
    highlight: currentSheet.highlight ?? savedFeature.highlight,
    cloudPending: false,
  }, currentSheet)
}

const isFeatureConflictError = (error) => {
  if (!error) return false
  if (error.code === "LOCA_CONFLICT") return true
  const message = `${error.message || ""}`.toLowerCase()
  return message.includes("conflict") || message.includes("stale")
}

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
  maps,
  features,
  myLocation,
  setFocusPoint,
  currentUserId = me.id,
  currentUserName = me.name,
  onCommunityRequestSubmitted = null,
}) {
  const canPersistCommunityInCloud = activeMapSource === "community"
    && cloudMode
    && Boolean(activeMapId)
    && activeMapId !== "community-map"
    && isSupabaseUuid(activeMapId)
  const canPersistLocalInCloud = cloudMode && activeMapSource === "local" && isSupabaseUuid(activeMapId)

  const submitFeatureRequest = useCallback(async (action, featureId, payload = {}) => {
    if (!activeMapId) return false
    try {
      await createFeatureChangeRequest(activeMapId, action, featureId, payload)
      if (action === "insert") {
        showToast("추가 요청을 보냈어요. 승인 후 지도에 반영돼요.")
      } else if (action === "update") {
        showToast("수정 요청을 보냈어요. 승인 후 지도에 반영돼요.")
      } else {
        showToast("삭제 요청을 보냈어요. 승인 후 지도에서 제거돼요.")
      }
      return true
    } catch (error) {
      console.error("Failed to submit feature request", error)
      showToast("승인 요청을 보내지 못했어요.")
      return false
    }
  }, [activeMapId, showToast])

  const focusFeature = useCallback((featureId) => {
    const feature = activeFeaturePool.find((item) => item.id === featureId)
    if (!feature) return
    triggerSelectionFeedback()
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
    triggerSelectionFeedback()
    setSelectedFeatureId(featureId)
    setSelectedFeatureSummaryId(featureId)
    const center = getFeatureCenter(feature)
    if (center && setFocusPoint && (center.lat !== 0 || center.lng !== 0)) {
      setFocusPoint({ lat: center.lat, lng: center.lng, zoom: 16 })
    }
  }, [activeFeaturePool, setSelectedFeatureId, setSelectedFeatureSummaryId, setFocusPoint])

  const openFeatureDetail = useCallback((featureId) => {
    const feature = activeFeaturePool.find((item) => item.id === featureId)
    if (!feature) return
    triggerSelectionFeedback()
    setSelectedFeatureId(featureId)
    setSelectedFeatureSummaryId(featureId)
    setFeatureSheet(toEditableFeature(feature))
  }, [activeFeaturePool, setFeatureSheet, setSelectedFeatureId, setSelectedFeatureSummaryId])

  const buildCommunityRequestPayload = useCallback((sourceFeature, requestMessage = "") => {
    if (!sourceFeature?.id) return null
    const trimmedTitle = `${sourceFeature.title || ""}`.trim().slice(0, 100)
    if (!trimmedTitle) return null
    const nextFeature = {
      ...sourceFeature,
      title: trimmedTitle,
      emoji: sourceFeature.emoji || getFeatureDefaultEmoji(sourceFeature.type),
      style: normalizeFeatureStyle(sourceFeature.style, sourceFeature.type),
      tags: (sourceFeature.tagsText || "")
        .split(",")
        .map((tag) => tag.trim().slice(0, 50))
        .filter(Boolean)
        .slice(0, 20),
      note: (sourceFeature.note || "").slice(0, 2000),
    }
    if (nextFeature.type === "pin" && nextFeature.lat != null) {
      const sc = sanitizeCoord(nextFeature.lat, nextFeature.lng)
      nextFeature.lat = sc.lat
      nextFeature.lng = sc.lng
    }
    if (nextFeature.points) {
      nextFeature.points = sanitizePoints(nextFeature.points)
    }
    return {
      feature: nextFeature,
      payload: {
        type: nextFeature.type,
        title: nextFeature.title,
        emoji: nextFeature.emoji,
        tags: nextFeature.tags || [],
        note: nextFeature.note || "",
        highlight: Boolean(nextFeature.highlight),
        style: nextFeature.style,
        lat: nextFeature.lat,
        lng: nextFeature.lng,
        points: nextFeature.points || null,
        sortOrder: nextFeature.sortOrder || 0,
        requestMessage: `${requestMessage || ""}`.slice(0, 400),
        createdByName: currentUserName || me.name,
      },
    }
  }, [currentUserName])

  const requestCommunityFeatureUpdateById = useCallback(async (featureId, requestMessage = "", draftFeature = null) => {
    if (activeMapSource !== "community") return false
    if (!featureId) return false
    if (!cloudMode || !canPersistCommunityInCloud || !activeMapId) {
      showToast("수정 요청을 보낼 수 없는 상태예요. 잠시 후 다시 시도해 주세요.")
      return false
    }

    const sourceFeature = draftFeature || activeFeaturePool.find((item) => item.id === featureId)
    if (!sourceFeature) {
      showToast("장소 정보를 찾을 수 없어요.")
      return false
    }
    if ((sourceFeature.createdBy || null) === (currentUserId || me.id)) {
      showToast("내가 등록한 장소는 바로 수정할 수 있어요.")
      return false
    }

    const requestBody = buildCommunityRequestPayload(sourceFeature, requestMessage)
    if (!requestBody?.feature?.title) {
      showToast("이름을 입력해 주세요.")
      return false
    }

    const requested = await submitFeatureRequest("update", requestBody.feature.id, requestBody.payload)
    if (!requested) return false
    onCommunityRequestSubmitted?.({
      mapId: activeMapId,
      featureId: requestBody.feature.id,
      featureTitle: requestBody.feature.title,
      requestMessage: `${requestMessage || ""}`.slice(0, 400),
      requestedBy: currentUserId || me.id,
      requestedByName: currentUserName || me.name,
    })
    return true
  }, [
    activeFeaturePool,
    activeMapId,
    activeMapSource,
    buildCommunityRequestPayload,
    canPersistCommunityInCloud,
    cloudMode,
    currentUserId,
    currentUserName,
    onCommunityRequestSubmitted,
    showToast,
    submitFeatureRequest,
  ])

  const requestCommunityFeatureUpdate = useCallback(async (requestMessage = "") => {
    if (!featureSheet?.id) return false
    const requested = await requestCommunityFeatureUpdateById(featureSheet.id, requestMessage, featureSheet)
    if (!requested) return false
    setFeatureSheet(null)
    setSelectedFeatureId(null)
    setSelectedFeatureSummaryId(null)
    return true
  }, [
    featureSheet,
    requestCommunityFeatureUpdateById,
    setFeatureSheet,
    setSelectedFeatureId,
    setSelectedFeatureSummaryId,
  ])

  const saveFeatureSheet = useCallback(async () => {
    const lastKnownUpdatedAt = featureSheet?.updatedAt || null
    if (featureSheet?.cloudPending) return showToast("저장 준비 중이에요. 잠시 후 다시 눌러 주세요.")
    if (!featureSheet?.title.trim()) return showToast("이름을 입력해 주세요.")
    if (activeMapSource === "community" && (featureSheet.createdBy || null) !== (currentUserId || me.id)) {
      showToast("내가 등록한 장소만 직접 수정할 수 있어요. 수정 요청을 이용해 주세요.")
      return
    }
    const trimmedTitle = featureSheet.title.trim().slice(0, 100)
    const nextFeature = {
      ...featureSheet,
      title: trimmedTitle,
      emoji: featureSheet.emoji || getFeatureDefaultEmoji(featureSheet.type),
      style: normalizeFeatureStyle(featureSheet.style, featureSheet.type),
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

    // Merge: DB 응답 메타를 우선하고, 미디어/메모는 비어있지 않은 쪽을 유지
    const mergeMediaFromCurrent = (current) => current.map((feature) => {
      if (feature.id !== nextFeature.id) return feature
      return mergeFeatureMedia(nextFeature, feature)
    })

    if (activeMapSource === "community") {
      if (canPersistCommunityInCloud) {
        try {
          const savedFeature = await updateFeatureRecord(nextFeature.id, {
            ...nextFeature,
            mapId: activeMapId,
            lastKnownUpdatedAt,
          })
          const displayFeature = preserveDraftFeatureFields(savedFeature, nextFeature)
          setCommunityMapFeatures((current) => current.map((feature) => {
            if (feature.id !== nextFeature.id) return feature
            return mergeFeatureMedia(displayFeature, feature)
          }))
          setFeatureSheet((current) => {
            return toEditableFeature(mergeFeatureMedia(displayFeature, current))
          })
          showToast("정보를 저장했어요.")
          return
        } catch (error) {
          console.error("Failed to update community feature", error)
          if (isFeatureConflictError(error)) {
            showToast("다른 사용자가 먼저 수정했어요. 최신 내용을 불러와 다시 시도해 주세요.")
            return
          }
          showToast("항목을 저장하지 못했어요.")
          return
        }
      }
      setCommunityMapFeatures(mergeMediaFromCurrent)
    } else {
      if (cloudMode) {
        try {
          const savedFeature = await updateFeatureRecord(nextFeature.id, {
            ...nextFeature,
            mapId: nextFeature.mapId,
            lastKnownUpdatedAt,
          })
          const displayFeature = preserveDraftFeatureFields(savedFeature, nextFeature)
          setFeatures((current) => current.map((feature) => {
            if (feature.id !== nextFeature.id) return feature
            return mergeFeatureMedia(displayFeature, feature)
          }))
          setFeatureSheet((current) => {
            return toEditableFeature(mergeFeatureMedia(displayFeature, current))
          })
          setMaps((current) => current.map((mapItem) => (
            mapItem.id === savedFeature.mapId
              ? { ...mapItem, updatedAt: new Date().toISOString() }
              : mapItem
          )))
          showToast("정보를 저장했어요.")
          return
        } catch (error) {
          console.error("Failed to update feature", error)
          if (isFeatureConflictError(error)) {
            showToast("다른 사용자가 먼저 수정했어요. 최신 내용을 불러와 다시 시도해 주세요.")
            return
          }
          showToast("항목을 저장하지 못했어요.")
          return
        }
      }

      setFeatures(mergeMediaFromCurrent)
      touchMap(nextFeature.mapId)
    }

    setFeatureSheet((current) => toEditableFeature(mergeFeatureMedia(nextFeature, current)))
    showToast("정보를 저장했어요.")
  }, [
    activeMapId,
    activeMapSource,
    canPersistCommunityInCloud,
    cloudMode,
    currentUserId,
    featureSheet,
    setCommunityMapFeatures,
    setFeatureSheet,
    setFeatures,
    setMaps,
    showToast,
    touchMap,
  ])

  const deleteFeature = useCallback(async () => {
    if (!featureSheet?.id || !window.confirm("이 항목을 삭제할까요?")) return
    if (activeMapSource === "community" && (featureSheet.createdBy || null) !== (currentUserId || me.id)) {
      showToast("내가 등록한 장소만 삭제할 수 있어요.")
      return
    }
    if (activeMapSource === "community") {
      if (canPersistCommunityInCloud) {
        try {
          await deleteFeatureRecord(featureSheet.id, activeMapId, {
            lastKnownUpdatedAt: featureSheet.updatedAt || null,
          })
        } catch (error) {
          console.error("Failed to delete community feature", error)
          if (isFeatureConflictError(error)) {
            showToast("이미 다른 사용자가 변경했어요. 최신 상태를 확인해 주세요.")
            return
          }
          showToast("항목을 삭제하지 못했어요.")
          return
        }
      }
      setCommunityMapFeatures((current) => current.filter((feature) => feature.id !== featureSheet.id))
    } else {
      if (cloudMode) {
        try {
          await deleteFeatureRecord(featureSheet.id, featureSheet.mapId, {
            lastKnownUpdatedAt: featureSheet.updatedAt || null,
          })
        } catch (error) {
          console.error("Failed to delete feature", error)
          if (isFeatureConflictError(error)) {
            showToast("이미 다른 사용자가 변경했어요. 최신 상태를 확인해 주세요.")
            return
          }
          showToast("항목을 삭제하지 못했어요.")
          return
        }
      }
      setFeatures((current) => current.filter((feature) => feature.id !== featureSheet.id))
      touchMap(featureSheet.mapId)
    }
    await cleanupFeatureMedia(featureSheet, cloudMode)
    setFeatureSheet(null)
    setSelectedFeatureId(null)
    setSelectedFeatureSummaryId(null)
    showToast("항목을 삭제했어요.")
  }, [
    activeMapId,
    activeMapSource,
    canPersistCommunityInCloud,
    cloudMode,
    currentUserId,
    featureSheet,
    setCommunityMapFeatures,
    setFeatureSheet,
    setFeatures,
    setSelectedFeatureId,
    setSelectedFeatureSummaryId,
    showToast,
    touchMap,
  ])

  const addMemo = useCallback(async (featureId, text, photoFiles = [], options = {}) => {
    const trimmedText = `${text || ""}`.trim()
    const selectedFiles = Array.isArray(photoFiles) ? photoFiles : []
    const recordId = `${options?.recordId || ""}`.trim()
    if (!trimmedText && selectedFiles.length === 0) return

    let uploadedPhotoUrls = []
    if (selectedFiles.length > 0) {
      if (cloudMode) {
        const uploadResults = await Promise.all(
          selectedFiles.map(async (file) => {
            try {
              const uploadId = createId("memo_photo")
              const cloudMeta = await uploadMediaToCloud(uploadId, file, "memo-photos")
              return cloudMeta?.publicUrl || null
            } catch (error) {
              console.error("Failed to upload memo photo", error)
              return null
            }
          }),
        )
        uploadedPhotoUrls = uploadResults.filter(Boolean)
      } else {
        uploadedPhotoUrls = selectedFiles
          .map((file) => {
            try {
              return URL.createObjectURL(file)
            } catch {
              return null
            }
          })
          .filter(Boolean)
      }
    }

    let memo
    if (cloudMode) {
      try {
        memo = await addFeatureMemoRecord(featureId, trimmedText, currentUserName || me.name, uploadedPhotoUrls, { recordId })
      } catch (error) {
        console.error("Failed to save memo to cloud", error)
        showToast("메모 저장에 실패했어요.")
        return
      }
    } else {
      memo = {
        id: createId("memo"),
        userId: currentUserId || me.id,
        userName: currentUserName || me.name,
        date: new Date().toISOString(),
        text: trimmedText,
        photos: uploadedPhotoUrls,
        recordId: recordId || null,
      }
    }
    if (recordId && !memo.recordId) {
      memo = { ...memo, recordId }
    }
    if (uploadedPhotoUrls.length > 0 && (!memo.photos || memo.photos.length === 0)) {
      memo = { ...memo, photos: uploadedPhotoUrls }
    }

    const isCommunityFeature = communityMapFeatures.some((feature) => feature.id === featureId)
    if (isCommunityFeature) {
      setCommunityMapFeatures((current) =>
        current.map((feature) => (
          feature.id === featureId
            ? { ...feature, memos: [...(feature.memos || []), memo] }
            : feature
        )),
      )
    } else {
      setFeatures((current) =>
        current.map((feature) => (
          feature.id === featureId
            ? { ...feature, memos: [...(feature.memos || []), memo] }
            : feature
        )),
      )
    }

    setMemoText("")
    if (featureSheet && featureSheet.id === featureId) {
      setFeatureSheet((current) => ({ ...current, memos: [...(current.memos || []), memo] }))
    }
    showToast(uploadedPhotoUrls.length > 0 ? "메모와 사진을 저장했어요." : "메모를 저장했어요.")
  }, [
    cloudMode,
    currentUserId,
    currentUserName,
    featureSheet,
    setCommunityMapFeatures,
    setFeatureSheet,
    setFeatures,
    setMemoText,
    showToast,
    communityMapFeatures,
  ])

  const updateMemo = useCallback(async (featureId, memoId, text, options = {}) => {
    if (!featureId || !memoId) return null
    const trimmedText = `${text || ""}`.trim()
    const recordId = `${options?.recordId || ""}`.trim()
    let savedMemo = null

    if (cloudMode) {
      try {
        savedMemo = await updateFeatureMemoRecord(memoId, trimmedText, { recordId })
      } catch (error) {
        console.error("Failed to update memo", error)
        showToast("기록 수정에 실패했어요.")
        return null
      }
    }

    const updateMemoList = (memos = []) => memos.map((memo) => (
      memo.id === memoId
        ? { ...memo, ...(savedMemo || {}), text: savedMemo?.text ?? trimmedText, recordId: savedMemo?.recordId || recordId || memo.recordId || null }
        : memo
    ))
    const isCommunityFeature = communityMapFeatures.some((feature) => feature.id === featureId)
    if (isCommunityFeature) {
      setCommunityMapFeatures((current) =>
        current.map((feature) => (
          feature.id === featureId ? { ...feature, memos: updateMemoList(feature.memos) } : feature
        )),
      )
    } else {
      setFeatures((current) =>
        current.map((feature) => (
          feature.id === featureId ? { ...feature, memos: updateMemoList(feature.memos) } : feature
        )),
      )
    }

    if (featureSheet && featureSheet.id === featureId) {
      setFeatureSheet((current) => current ? { ...current, memos: updateMemoList(current.memos) } : current)
    }
    showToast("기록을 수정했어요.")
    return savedMemo || { id: memoId, text: trimmedText, recordId: recordId || null }
  }, [
    cloudMode,
    communityMapFeatures,
    featureSheet,
    setCommunityMapFeatures,
    setFeatureSheet,
    setFeatures,
    showToast,
  ])

  const deleteMemo = useCallback(async (featureId, memoId, options = {}) => {
    if (!featureId || !memoId) return false

    if (cloudMode) {
      try {
        await deleteFeatureMemoRecord(memoId)
      } catch (error) {
        console.error("Failed to delete memo", error)
        showToast("기록 삭제에 실패했어요.")
        return false
      }
    }

    const removeMemoFromList = (memos = []) => memos.filter((memo) => memo.id !== memoId)
    const isCommunityFeature = communityMapFeatures.some((feature) => feature.id === featureId)
    if (isCommunityFeature) {
      setCommunityMapFeatures((current) =>
        current.map((feature) => (
          feature.id === featureId ? { ...feature, memos: removeMemoFromList(feature.memos) } : feature
        )),
      )
    } else {
      setFeatures((current) =>
        current.map((feature) => (
          feature.id === featureId ? { ...feature, memos: removeMemoFromList(feature.memos) } : feature
        )),
      )
    }

    if (featureSheet && featureSheet.id === featureId) {
      setFeatureSheet((current) => current ? { ...current, memos: removeMemoFromList(current.memos) } : current)
    }
    if (!options?.silent) showToast("기록을 삭제했어요.")
    return true
  }, [
    cloudMode,
    communityMapFeatures,
    featureSheet,
    setCommunityMapFeatures,
    setFeatureSheet,
    setFeatures,
    showToast,
  ])

  // 모두의 지도 → 내 지도 가져오기 / 취소
  //
  // 정책:
  //   - 타겟 지도: targetMapId 명시 우선, 없으면 maps[0] 폴백.
  //   - 복제 필드: type, title, emoji, tags, note, highlight, style, lat/lng, points.
  //     memos/photos/voices 는 원본(커뮤니티)에 남겨두고 복제본은 빈 상태로 시작.
  //   - sourceFeatureId 에 원본 id 저장 — '저장됨' 상태 판별과 언임포트 매칭에 사용.
  //   - 현재는 localStorage 상태에만 반영. 클라우드 동기화는 별도 마이그레이션 필요.
  const importCommunityFeatureToMine = useCallback((sourceFeatureId, targetMapInput = null) => {
    if (!sourceFeatureId) return false
    const source = (communityMapFeatures || []).find((f) => f.id === sourceFeatureId)
    if (!source) { showToast("원본 장소를 찾을 수 없어요."); return false }

    const alreadyImported = (features || []).some((f) => f.sourceFeatureId === sourceFeatureId)
    if (alreadyImported) { showToast("이미 내 지도에 저장되어 있어요."); return true }

    // targetMapInput 은 mapId(string) 또는 map 객체를 받는다.
    // map 객체를 직접 받는 케이스는 maps state 업데이트가 아직 반영되지 않은 상황에서
    // 새로 만든 지도로 바로 import 하기 위함 (App.jsx 의 handleImportCreateMap).
    let targetMap = null
    if (targetMapInput && typeof targetMapInput === "object") {
      targetMap = targetMapInput
    } else if (typeof targetMapInput === "string") {
      targetMap = (maps || []).find((m) => m.id === targetMapInput)
    } else {
      targetMap = (maps || [])[0]
    }
    if (!targetMap) { showToast("먼저 내 지도를 만들어 주세요."); return false }

    const cloned = {
      id: createId("feat"),
      mapId: targetMap.id,
      type: source.type,
      title: source.title,
      emoji: source.emoji,
      category: source.category || null,
      tags: Array.isArray(source.tags) ? [...source.tags] : [],
      note: source.note || "",
      highlight: Boolean(source.highlight),
      style: normalizeFeatureStyle(source.style, source.type),
      lat: source.lat,
      lng: source.lng,
      points: Array.isArray(source.points) ? source.points.map((p) => ({ ...p })) : null,
      sortOrder: 0,
      memos: [],
      photos: [],
      voices: [],
      createdBy: currentUserId || me.id,
      createdByName: currentUserName || me.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceFeatureId,
      sourceMapId: source.mapId || null,
    }
    setFeatures((current) => [...current, cloned])
    touchMap?.(targetMap.id)
    showToast(`'${targetMap.title || "내 지도"}'에 저장했어요.`)
    return true
  }, [communityMapFeatures, features, maps, setFeatures, touchMap, showToast, currentUserId, currentUserName])

  const unimportCommunityFeature = useCallback((sourceFeatureId) => {
    if (!sourceFeatureId) return false
    const matching = (features || []).filter((f) => f.sourceFeatureId === sourceFeatureId)
    if (matching.length === 0) { showToast("저장된 항목을 찾지 못했어요."); return false }
    const affectedMapIds = new Set(matching.map((f) => f.mapId).filter(Boolean))
    setFeatures((current) => current.filter((f) => f.sourceFeatureId !== sourceFeatureId))
    affectedMapIds.forEach((id) => touchMap?.(id))
    showToast("저장을 취소했어요.")
    return true
  }, [features, setFeatures, touchMap, showToast])

  // 핀 위치 재지정
  const relocatingRef = useRef(null)

  const startRelocatePin = useCallback((featureId) => {
    relocatingRef.current = featureId
    setFeatureSheet(null)
    setEditorMode("relocate")
    showToast("지도를 탭해서 새 위치를 지정해 주세요.")
  }, [setEditorMode, setFeatureSheet, showToast])

  const replacePendingFeature = useCallback((tempId, savedFeature, setPool) => {
    const savedReadyFeature = { ...savedFeature, cloudPending: false }
    setPool((current) => current.map((feature) => (
      feature.id === tempId ? mergeFeatureMedia(savedReadyFeature, feature) : feature
    )))
    setSelectedFeatureId((current) => (current === tempId ? savedFeature.id : current))
    setSelectedFeatureSummaryId((current) => (current === tempId ? savedFeature.id : current))
    setFeatureSheet((current) => {
      if (!current || current.id !== tempId) return current
      return toEditableFeature(mergePendingSheetDraft(savedReadyFeature, current))
    })
  }, [setFeatureSheet, setSelectedFeatureId, setSelectedFeatureSummaryId])

  const removePendingFeature = useCallback((tempId, setPool, message) => {
    setPool((current) => current.filter((feature) => feature.id !== tempId))
    setSelectedFeatureId((current) => (current === tempId ? null : current))
    setSelectedFeatureSummaryId((current) => (current === tempId ? null : current))
    setFeatureSheet((current) => (current?.id === tempId ? null : current))
    showToast(message)
  }, [setFeatureSheet, setSelectedFeatureId, setSelectedFeatureSummaryId, showToast])

  const createFeatureOptimistically = useCallback((draftFeature, {
    setPool,
    successToast,
    failureToast,
    onBeforeOpen = null,
    onCreated = null,
  }) => {
    const tempId = draftFeature.id
    const pendingFeature = { ...draftFeature, cloudPending: true }
    onBeforeOpen?.()
    setPool((current) => [pendingFeature, ...current])
    setEditorMode("browse")
    setSelectedFeatureId(tempId)
    setFeatureSheet(toEditableFeature(pendingFeature))
    showToast(successToast)

    createFeatureRecord(activeMapId, {
      ...draftFeature,
      mapId: activeMapId,
    }, {
      // region 태깅으로 DB updated_at 이 바뀌면 로컬 캐시도 맞춰, 방금 만든 카드
      // 편집이 가짜 저장충돌("다른 사용자가 먼저 수정")로 막히지 않게 한다.
      onRegionTagged: (featureId, { regionName, updatedAt } = {}) => {
        if (!updatedAt) return
        setPool((current) => current.map((feature) => (
          feature.id === featureId
            ? { ...feature, updatedAt, regionName: regionName || feature.regionName }
            : feature
        )))
        setFeatureSheet((current) => (
          current && current.id === featureId ? { ...current, updatedAt } : current
        ))
      },
    })
      .then((savedFeature) => {
        const displayFeature = preserveDraftFeatureFields(savedFeature, draftFeature)
        replacePendingFeature(tempId, displayFeature, setPool)
        onCreated?.(displayFeature)
      })
      .catch((error) => {
        console.error("Failed to create feature", error)
        removePendingFeature(tempId, setPool, failureToast)
      })
  }, [
    activeMapId,
    removePendingFeature,
    replacePendingFeature,
    setEditorMode,
    setFeatureSheet,
    setSelectedFeatureId,
    showToast,
  ])

  const createHandleMapTap = (editorMode) => async ({ lat, lng, title, note } = {}) => {
    if (!activeMapId) return
    const sc = sanitizeCoord(lat, lng)

    // 핀 위치 재지정 모드
    if (editorMode === "relocate" && relocatingRef.current) {
      const featureId = relocatingRef.current
      relocatingRef.current = null
      setEditorMode("browse")
      let relocatedFeature = null

      if (cloudMode) {
        const currentFeature = activeFeaturePool.find((feature) => feature.id === featureId)
        try {
          const saved = await updateFeatureRecord(featureId, {
            lat: sc.lat,
            lng: sc.lng,
            mapId: activeMapId,
            lastKnownUpdatedAt: currentFeature?.updatedAt || null,
          })
          relocatedFeature = mergeFeatureMedia(saved, currentFeature)
          const updateFn = (current) => current.map((feature) => (
            feature.id === featureId
              ? mergeFeatureMedia(saved, feature)
              : feature
          ))
          if (activeMapSource === "community") {
            setCommunityMapFeatures(updateFn)
          } else {
            setFeatures(updateFn)
          }
        } catch (error) {
          console.error("Failed to relocate pin", error)
          if (isFeatureConflictError(error)) {
            return showToast("다른 사용자가 먼저 수정했어요. 최신 상태를 확인해 주세요.")
          }
          return showToast("위치를 변경하지 못했어요.")
        }
      } else {
        const updateFn = (current) => current.map((feature) => (
          feature.id === featureId
            ? { ...feature, lat: sc.lat, lng: sc.lng, updatedAt: new Date().toISOString() }
            : feature
        ))
        relocatedFeature = {
          ...(activeFeaturePool.find((feature) => feature.id === featureId) || {}),
          lat: sc.lat,
          lng: sc.lng,
          updatedAt: new Date().toISOString(),
        }
        if (activeMapSource === "community") {
          setCommunityMapFeatures(updateFn)
        } else {
          setFeatures(updateFn)
          touchMap(activeMapId)
        }
      }

      setSelectedFeatureId(featureId)
      const updated = relocatedFeature || activeFeaturePool.find((feature) => feature.id === featureId)
      if (updated) {
        setFeatureSheet(toEditableFeature({ ...updated, lat: sc.lat, lng: sc.lng }))
      }
      return showToast("위치를 변경했어요.")
    }

    if (editorMode === "pin") {
      // 모두의 지도: 내 위치 2km 이내만 핀 추가 가능 (보고서 11.2)
      if (!checkCommunityDistance(activeMapSource, myLocation, sc.lat, sc.lng, showToast)) return

      let nextFeature = {
        id: createId("feat"),
        mapId: activeMapId,
        type: "pin",
        title: `${title || ""}`.trim() || "새 장소",
        emoji: "\uD83D\uDCCD",
        style: getDefaultFeatureStyle("pin"),
        lat: sc.lat,
        lng: sc.lng,
        tags: [],
        note: `${note || ""}`.trim(),
        highlight: false,
        updatedAt: new Date().toISOString(),
        ...(activeMapSource === "community"
          ? { memos: [], createdBy: currentUserId || me.id, createdByName: currentUserName || me.name }
          : {}),
      }

      if (activeMapSource === "community") {
        if (canPersistCommunityInCloud) {
          createFeatureOptimistically(nextFeature, {
            setPool: setCommunityMapFeatures,
            successToast: "장소를 추가했어요.",
            failureToast: "장소를 추가하지 못했어요.",
            onCreated: () => {
              logEvent("feature_create", { map_id: activeMapId, meta: { feature_type: "pin" } })
            },
          })
          return
        }
        setCommunityMapFeatures((current) => [nextFeature, ...current])
      } else {
        if (canPersistLocalInCloud) {
          createFeatureOptimistically(nextFeature, {
            setPool: setFeatures,
            successToast: "핀을 추가했어요.",
            failureToast: "핀을 추가하지 못했어요.",
          })
          logEvent("feature_create", { map_id: activeMapId, meta: { feature_type: "pin" } })
          return
        }
        setFeatures((current) => [nextFeature, ...current])
        touchMap(activeMapId)
      }

      logEvent("feature_create", { map_id: activeMapId, meta: { feature_type: "pin" } })

      setEditorMode("browse")
      setSelectedFeatureId(nextFeature.id)
      setFeatureSheet(toEditableFeature(nextFeature))
      showToast("핀을 추가했어요.")

      return
    }

    if (editorMode === "route" || editorMode === "area") {
      // 모두의 지도: 길/영역의 각 점도 2km 이내여야 한다 (보고서 11.2)
      if (!checkCommunityDistance(activeMapSource, myLocation, sc.lat, sc.lng, showToast)) return
      setDraftPoints((current) => [...current, [sc.lng, sc.lat]])
    }
  }

  const completeRoute = async (draftPoints) => {
    if (!activeMapId || draftPoints.length < 2) return showToast("길은 최소 2개 지점이 필요해요.")
    let nextFeature = {
      id: createId("feat"),
      mapId: activeMapId,
      type: "route",
      title: "새 길",
      emoji: "\uD83D\uDEE3\uFE0F",
      style: getDefaultFeatureStyle("route"),
      points: sanitizePoints(draftPoints),
      tags: [],
      note: "",
      highlight: false,
      updatedAt: new Date().toISOString(),
      ...(activeMapSource === "community"
        ? { memos: [], createdBy: currentUserId || me.id, createdByName: currentUserName || me.name }
        : {}),
    }

    if (activeMapSource === "community") {
      if (canPersistCommunityInCloud) {
        createFeatureOptimistically(nextFeature, {
          setPool: setCommunityMapFeatures,
          successToast: "길을 저장했어요.",
          failureToast: "길을 저장하지 못했어요.",
          onBeforeOpen: () => setDraftPoints([]),
          onCreated: () => {
            logEvent("feature_create", { map_id: activeMapId, meta: { feature_type: "route", point_count: draftPoints.length } })
          },
        })
        return
      }
      setCommunityMapFeatures((current) => [nextFeature, ...current])
    } else {
      if (canPersistLocalInCloud) {
        createFeatureOptimistically(nextFeature, {
          setPool: setFeatures,
          successToast: "길을 저장했어요.",
          failureToast: "길을 저장하지 못했어요.",
          onBeforeOpen: () => setDraftPoints([]),
        })
        logEvent("feature_create", { map_id: activeMapId, meta: { feature_type: "route", point_count: draftPoints.length } })
        return
      }
      setFeatures((current) => [nextFeature, ...current])
      touchMap(activeMapId)
    }

    logEvent("feature_create", { map_id: activeMapId, meta: { feature_type: "route", point_count: draftPoints.length } })
    setDraftPoints([])
    setEditorMode("browse")
    setSelectedFeatureId(nextFeature.id)
    setFeatureSheet(toEditableFeature(nextFeature))
    showToast("길을 저장했어요.")
  }

  const completeArea = async (draftPoints) => {
    if (!activeMapId || draftPoints.length < 3) return showToast("영역은 최소 3개 꼭짓점이 필요해요.")
    let nextFeature = {
      id: createId("feat"),
      mapId: activeMapId,
      type: "area",
      title: "새 영역",
      emoji: "\uD83D\uDFE9",
      style: getDefaultFeatureStyle("area"),
      points: sanitizePoints(draftPoints),
      tags: [],
      note: "",
      highlight: false,
      updatedAt: new Date().toISOString(),
      ...(activeMapSource === "community"
        ? { memos: [], createdBy: currentUserId || me.id, createdByName: currentUserName || me.name }
        : {}),
    }

    if (activeMapSource === "community") {
      if (canPersistCommunityInCloud) {
        createFeatureOptimistically(nextFeature, {
          setPool: setCommunityMapFeatures,
          successToast: "영역을 저장했어요.",
          failureToast: "영역을 저장하지 못했어요.",
          onBeforeOpen: () => setDraftPoints([]),
          onCreated: () => {
            logEvent("feature_create", { map_id: activeMapId, meta: { feature_type: "area", point_count: draftPoints.length } })
          },
        })
        return
      }
      setCommunityMapFeatures((current) => [nextFeature, ...current])
    } else {
      if (canPersistLocalInCloud) {
        createFeatureOptimistically(nextFeature, {
          setPool: setFeatures,
          successToast: "영역을 저장했어요.",
          failureToast: "영역을 저장하지 못했어요.",
          onBeforeOpen: () => setDraftPoints([]),
        })
        logEvent("feature_create", { map_id: activeMapId, meta: { feature_type: "area", point_count: draftPoints.length } })
        return
      }
      setFeatures((current) => [nextFeature, ...current])
      touchMap(activeMapId)
    }

    logEvent("feature_create", { map_id: activeMapId, meta: { feature_type: "area", point_count: draftPoints.length } })
    setDraftPoints([])
    setEditorMode("browse")
    setSelectedFeatureId(nextFeature.id)
    setFeatureSheet(toEditableFeature(nextFeature))
    showToast("영역을 저장했어요.")
  }

  return {
    focusFeature,
    focusFeatureOnly,
    openFeatureDetail,
    saveFeatureSheet,
    requestCommunityFeatureUpdate,
    requestCommunityFeatureUpdateById,
    deleteFeature,
    addMemo,
    updateMemo,
    deleteMemo,
    createHandleMapTap,
    completeRoute,
    completeArea,
    startRelocatePin,
    importCommunityFeatureToMine,
    unimportCommunityFeature,
  }
}
