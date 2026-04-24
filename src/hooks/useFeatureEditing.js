import { useCallback, useRef } from "react"
import { createId, tagsToText, sanitizePoints, sanitizeCoord } from "../lib/appUtils"
import { logEvent } from "../lib/analytics"
import { cleanupFeatureMedia } from "../lib/mediaCleanup"
import {
  addFeatureMemo as addFeatureMemoRecord,
  createFeature as createFeatureRecord,
  getFeatureOperatorNote,
  saveFeatureOperatorNote,
  updateFeature as updateFeatureRecord,
  deleteFeature as deleteFeatureRecord,
} from "../lib/mapService"
import { createFeatureChangeRequest } from "../lib/mapService.write"
import { recordMapAction } from "../lib/gamificationService"
import { getMapCompletionSnapshot } from "../lib/mapCompletion"
import { me } from "../data/sampleData"
import { uploadMediaToCloud } from "../lib/mediaStore"
import { getDefaultFeatureStyle, normalizeFeatureStyle } from "../lib/featureStyle"

const toEditableFeature = (feature) => ({
  ...feature,
  style: normalizeFeatureStyle(feature?.style, feature?.type || "pin"),
  tagsText: tagsToText(feature.tags),
})

const getFeatureDefaultEmoji = (type) => {
  if (type === "route") return "\uD83D\uDEE3\uFE0F"
  if (type === "area") return "\uD83D\uDFE9"
  return "\uD83D\uDCCD"
}

import { getFeatureCenter } from "../lib/appUtils"

// 좌표 -> 주소 역지오코딩 (국내=네이버, 해외=Google)
function isKoreaCoord(lat, lng) {
  return lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132
}

async function reverseGeocode(lat, lng) {
  try {
    if (isKoreaCoord(lat, lng)) {
      // 네이버 Reverse Geocode
      const naverMaps = window.naver?.maps
      if (naverMaps?.Service) {
        return new Promise((resolve) => {
          naverMaps.Service.reverseGeocode(
            { coords: new naverMaps.LatLng(lat, lng), orders: "roadaddr,addr" },
            (status, response) => {
              if (status !== naverMaps.Service.Status.OK || !response.v2?.results?.length) {
                resolve(null)
                return
              }
              const result = response.v2.results[0]
              const region = result.region || {}
              const land = result.land || {}
              const area1 = region.area1?.name || ""
              const area2 = region.area2?.name || ""
              const area3 = region.area3?.name || ""
              const roadName = land.name || ""
              const roadNum = land.number1 || ""
              if (roadName) {
                resolve({ address: `${area1} ${area2} ${roadName} ${roadNum}`.trim(), province: area1, district: area2 })
              } else {
                resolve({ address: `${area1} ${area2} ${area3}`.trim(), province: area1, district: area2 })
              }
            },
          )
        })
      }
    }
    // Google Reverse Geocode (해외 + 네이버 미응답)
    const googleKey = import.meta.env.VITE_GOOGLE_MAPS_KEY
    if (googleKey) {
      const resp = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${googleKey}&language=ko`)
      const data = await resp.json()
      if (data.status === "OK" && data.results?.length) {
        return { address: data.results[0].formatted_address || "", province: "", district: "" }
      }
    }
  } catch { /* 실패 시 null */ }
  return null
}

// 두 좌표 간 거리 (km) - haversine
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const toRad = (d) => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
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
  isEventMap = false,
  activeMapRole = "owner",
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
  refreshGameProfile,
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
  const isLocalEventMap = activeMapSource === "local" && isEventMap
  const canUseOperatorNote = isLocalEventMap && (activeMapRole === "owner" || activeMapRole === "operator")
  const shouldRequestApproval = cloudMode && isLocalEventMap && activeMapRole === "editor"

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
    if (selectedFeatureSummaryId === featureId) {
      // open detail on second tap
      setSelectedFeatureId(featureId)
      setSelectedFeatureSummaryId(featureId)
      setFeatureSheet(toEditableFeature(feature))
      if (cloudMode && canUseOperatorNote) {
        getFeatureOperatorNote(featureId)
          .then((operatorNote) => {
            setFeatureSheet((current) => {
              if (!current || current.id !== featureId) return current
              return { ...current, operatorNote: operatorNote || "" }
            })
          })
          .catch(() => {})
      }
      return
    }
    setSelectedFeatureId(featureId)
    setSelectedFeatureSummaryId(featureId)
  }, [activeFeaturePool, canUseOperatorNote, cloudMode, selectedFeatureSummaryId, setFeatureSheet, setSelectedFeatureId, setSelectedFeatureSummaryId])

  const focusFeatureOnly = useCallback((featureId) => {
    const feature = activeFeaturePool.find((item) => item.id === featureId)
    if (!feature) return
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
    setSelectedFeatureId(featureId)
    setSelectedFeatureSummaryId(featureId)
    setFeatureSheet(toEditableFeature(feature))
    if (cloudMode && canUseOperatorNote) {
      getFeatureOperatorNote(featureId)
        .then((operatorNote) => {
          setFeatureSheet((current) => {
            if (!current || current.id !== featureId) return current
            return { ...current, operatorNote: operatorNote || "" }
          })
        })
        .catch(() => {})
    }
  }, [activeFeaturePool, canUseOperatorNote, cloudMode, setFeatureSheet, setSelectedFeatureId, setSelectedFeatureSummaryId])

  // 지도 완성도 마일스톤 체크 (cloud mode only)
  const checkCompletionMilestone = useCallback((mapId) => {
    if (!cloudMode || !mapId) return
    const map = maps?.find((m) => m.id === mapId)
    const mapFeatures = features?.filter((f) => f.mapId === mapId) || []
    if (!map || mapFeatures.length === 0) return
    const { score } = getMapCompletionSnapshot(map, mapFeatures)
    if (score >= 90) {
      recordMapAction({ actionType: "map_completion_90", eventKey: `comp90:${mapId}`, mapId }).catch(() => {})
    } else if (score >= 70) {
      recordMapAction({ actionType: "map_completion_70", eventKey: `comp70:${mapId}`, mapId }).catch(() => {})
    }
  }, [cloudMode, maps, features])

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
    const operatorNote = `${featureSheet?.operatorNote || ""}`.slice(0, 4000)
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
          setCommunityMapFeatures((current) => current.map((feature) => {
            if (feature.id !== nextFeature.id) return feature
            return mergeFeatureMedia(savedFeature, feature)
          }))
          setFeatureSheet((current) => {
            const merged = toEditableFeature(mergeFeatureMedia(savedFeature, current))
            return { ...merged, operatorNote: current?.operatorNote || "" }
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
        if (shouldRequestApproval) {
          const requested = await submitFeatureRequest("update", nextFeature.id, {
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
            operatorNote,
            createdByName: currentUserName || me.name,
          })
          if (requested) return
          return
        }
        try {
          const savedFeature = await updateFeatureRecord(nextFeature.id, {
            ...nextFeature,
            mapId: nextFeature.mapId,
            lastKnownUpdatedAt,
          })
          setFeatures((current) => current.map((feature) => {
            if (feature.id !== nextFeature.id) return feature
            return mergeFeatureMedia(savedFeature, feature)
          }))
          setFeatureSheet((current) => {
            const merged = toEditableFeature(mergeFeatureMedia(savedFeature, current))
            return { ...merged, operatorNote: current?.operatorNote || "" }
          })
          setMaps((current) => current.map((mapItem) => (
            mapItem.id === savedFeature.mapId
              ? { ...mapItem, updatedAt: new Date().toISOString() }
              : mapItem
          )))
          // feature_enrich: note/photo/voice가 있으면 보상
          if (nextFeature.note?.trim() || nextFeature.photos?.length > 0 || nextFeature.voices?.length > 0) {
            recordMapAction({
              actionType: "feature_enrich",
              eventKey: `enrich:${nextFeature.id}`,
              mapId: nextFeature.mapId,
              featureId: nextFeature.id,
            }).catch(() => {})
          }
          checkCompletionMilestone(nextFeature.mapId)
          if (canUseOperatorNote) {
            await saveFeatureOperatorNote(nextFeature.id, operatorNote)
          }
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
    canUseOperatorNote,
    activeMapSource,
    canPersistCommunityInCloud,
    cloudMode,
    currentUserId,
    currentUserName,
    featureSheet,
    shouldRequestApproval,
    setCommunityMapFeatures,
    setFeatureSheet,
    setFeatures,
    setMaps,
    showToast,
    submitFeatureRequest,
    touchMap,
    checkCompletionMilestone,
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
        if (shouldRequestApproval) {
          const requested = await submitFeatureRequest("delete", featureSheet.id, {
            title: featureSheet.title || "",
            type: featureSheet.type || "pin",
          })
          if (requested) {
            setFeatureSheet(null)
            setSelectedFeatureId(null)
            setSelectedFeatureSummaryId(null)
          }
          return
        }
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
    shouldRequestApproval,
    setCommunityMapFeatures,
    setFeatureSheet,
    setFeatures,
    setSelectedFeatureId,
    setSelectedFeatureSummaryId,
    showToast,
    submitFeatureRequest,
    touchMap,
  ])

  const addMemo = useCallback(async (featureId, text, photoFiles = []) => {
    const trimmedText = `${text || ""}`.trim()
    const selectedFiles = Array.isArray(photoFiles) ? photoFiles : []
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
        memo = await addFeatureMemoRecord(featureId, trimmedText, currentUserName || me.name, uploadedPhotoUrls)
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
      }
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

  const createHandleMapTap = (editorMode) => async ({ lat, lng }) => {
    if (!activeMapId) return
    const sc = sanitizeCoord(lat, lng)

    // 핀 위치 재지정 모드
    if (editorMode === "relocate" && relocatingRef.current) {
      const featureId = relocatingRef.current
      relocatingRef.current = null
      setEditorMode("browse")

      if (cloudMode) {
        if (shouldRequestApproval && activeMapSource === "local") {
          await submitFeatureRequest("update", featureId, {
            lat: sc.lat,
            lng: sc.lng,
            title: activeFeaturePool.find((feature) => feature.id === featureId)?.title || "",
            type: "pin",
          })
          return showToast("위치 변경 요청을 보냈어요. 승인 후 반영돼요.")
        }
        const currentFeature = activeFeaturePool.find((feature) => feature.id === featureId)
        try {
          const saved = await updateFeatureRecord(featureId, {
            lat: sc.lat,
            lng: sc.lng,
            mapId: activeMapId,
            lastKnownUpdatedAt: currentFeature?.updatedAt || null,
          })
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
        if (activeMapSource === "community") {
          setCommunityMapFeatures(updateFn)
        } else {
          setFeatures(updateFn)
          touchMap(activeMapId)
        }
      }

      setSelectedFeatureId(featureId)
      const updated = activeFeaturePool.find((feature) => feature.id === featureId)
      if (updated) {
        setFeatureSheet(toEditableFeature({ ...updated, lat: sc.lat, lng: sc.lng }))
      }
      return showToast("위치를 변경했어요.")
    }

    if (editorMode === "pin") {
      // 커뮤니티 모드: 내 위치 1km 이내만 핀 추가 가능
      if (activeMapSource === "community") {
        if (!myLocation) {
          return showToast("위치 권한을 허용하면 내 주변 장소만 추가할 수 있어요.")
        }
        const dist = haversineKm(myLocation.lat, myLocation.lng, sc.lat, sc.lng)
        if (dist > 1) {
          return showToast(`내 위치에서 ${dist.toFixed(1)}km 떨어져 있어요. 1km 이내만 추가할 수 있어요.`)
        }
      }

      let nextFeature = {
        id: createId("feat"),
        mapId: activeMapId,
        type: "pin",
        title: "새 장소",
        emoji: "\uD83D\uDCCD",
        style: getDefaultFeatureStyle("pin"),
        lat: sc.lat,
        lng: sc.lng,
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
          try {
            nextFeature = await createFeatureRecord(activeMapId, {
              ...nextFeature,
              mapId: activeMapId,
            })
          } catch (error) {
            console.error("Failed to create community pin", error)
            return showToast("장소를 추가하지 못했어요.")
          }
        }
        setCommunityMapFeatures((current) => [nextFeature, ...current])
      } else {
        if (cloudMode) {
          if (shouldRequestApproval) {
            await submitFeatureRequest("insert", null, {
              type: nextFeature.type,
              title: nextFeature.title,
              emoji: nextFeature.emoji,
              tags: nextFeature.tags || [],
              note: nextFeature.note || "",
              highlight: Boolean(nextFeature.highlight),
              style: nextFeature.style,
              lat: nextFeature.lat,
              lng: nextFeature.lng,
              points: null,
              sortOrder: 0,
              createdByName: currentUserName || me.name,
            })
            setEditorMode("browse")
            setSelectedFeatureId(null)
            setFeatureSheet(null)
            return
          }
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

      logEvent("feature_create", { map_id: activeMapId, meta: { feature_type: "pin" } })
      if (cloudMode) {
        recordMapAction({
          actionType: "feature_create_pin",
          eventKey: `pin:${nextFeature.id}`,
          mapId: activeMapId,
          featureId: nextFeature.id,
        }).then(() => refreshGameProfile?.()).catch(() => {})
      }

      setEditorMode("browse")
      setSelectedFeatureId(nextFeature.id)
      setFeatureSheet(toEditableFeature(nextFeature))
      showToast("핀을 추가했어요.")

      // 비동기 지오코딩으로 주소 자동 채움
      reverseGeocode(sc.lat, sc.lng).then((geo) => {
        if (!geo) return
        const updateFn = (current) =>
          current.map((feature) => (
            feature.id === nextFeature.id
              ? { ...feature, address: geo.address, province: geo.province, district: geo.district }
              : feature
          ))
        if (activeMapSource === "community") {
          setCommunityMapFeatures(updateFn)
        } else {
          setFeatures(updateFn)
        }
        setFeatureSheet((current) => (
          current && current.id === nextFeature.id
            ? { ...current, address: geo.address }
            : current
        ))
      })
      return
    }

    if (editorMode === "route" || editorMode === "area") {
      setDraftPoints((current) => [...current, [sc.lng, sc.lat]])
    }
  }

  const completeRoute = async (draftPoints) => {
    if (!activeMapId || draftPoints.length < 2) return showToast("경로는 최소 2개 지점이 필요해요.")
    let nextFeature = {
      id: createId("feat"),
      mapId: activeMapId,
      type: "route",
      title: "새 경로",
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
        try {
          nextFeature = await createFeatureRecord(activeMapId, {
            ...nextFeature,
            mapId: activeMapId,
          })
        } catch (error) {
          console.error("Failed to create community route", error)
          return showToast("경로를 저장하지 못했어요.")
        }
      }
      setCommunityMapFeatures((current) => [nextFeature, ...current])
    } else {
      if (cloudMode) {
        if (shouldRequestApproval) {
          await submitFeatureRequest("insert", null, {
            type: nextFeature.type,
            title: nextFeature.title,
            emoji: nextFeature.emoji,
            tags: nextFeature.tags || [],
            note: nextFeature.note || "",
            highlight: Boolean(nextFeature.highlight),
            style: nextFeature.style,
            points: nextFeature.points || [],
            sortOrder: 0,
            createdByName: currentUserName || me.name,
          })
          setDraftPoints([])
          setEditorMode("browse")
          setSelectedFeatureId(null)
          setFeatureSheet(null)
          return
        }
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

    logEvent("feature_create", { map_id: activeMapId, meta: { feature_type: "route", point_count: draftPoints.length } })
    if (cloudMode) {
      recordMapAction({
        actionType: "feature_create_route",
        eventKey: `route:${nextFeature.id}`,
        mapId: activeMapId,
        featureId: nextFeature.id,
      }).then(() => refreshGameProfile?.()).catch(() => {})
    }
    setDraftPoints([])
    setEditorMode("browse")
    setSelectedFeatureId(nextFeature.id)
    setFeatureSheet(toEditableFeature(nextFeature))
    showToast("경로를 저장했어요.")
  }

  const completeArea = async (draftPoints) => {
    if (!activeMapId || draftPoints.length < 3) return showToast("범위는 최소 3개 꼭짓점이 필요해요.")
    let nextFeature = {
      id: createId("feat"),
      mapId: activeMapId,
      type: "area",
      title: "새 범위",
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
        try {
          nextFeature = await createFeatureRecord(activeMapId, {
            ...nextFeature,
            mapId: activeMapId,
          })
        } catch (error) {
          console.error("Failed to create community area", error)
          return showToast("범위를 저장하지 못했어요.")
        }
      }
      setCommunityMapFeatures((current) => [nextFeature, ...current])
    } else {
      if (cloudMode) {
        if (shouldRequestApproval) {
          await submitFeatureRequest("insert", null, {
            type: nextFeature.type,
            title: nextFeature.title,
            emoji: nextFeature.emoji,
            tags: nextFeature.tags || [],
            note: nextFeature.note || "",
            highlight: Boolean(nextFeature.highlight),
            style: nextFeature.style,
            points: nextFeature.points || [],
            sortOrder: 0,
            createdByName: currentUserName || me.name,
          })
          setDraftPoints([])
          setEditorMode("browse")
          setSelectedFeatureId(null)
          setFeatureSheet(null)
          return
        }
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

    logEvent("feature_create", { map_id: activeMapId, meta: { feature_type: "area", point_count: draftPoints.length } })
    if (cloudMode) {
      recordMapAction({
        actionType: "feature_create_area",
        eventKey: `area:${nextFeature.id}`,
        mapId: activeMapId,
        featureId: nextFeature.id,
      }).then(() => refreshGameProfile?.()).catch(() => {})
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
    requestCommunityFeatureUpdate,
    requestCommunityFeatureUpdateById,
    deleteFeature,
    addMemo,
    createHandleMapTap,
    completeRoute,
    completeArea,
    startRelocatePin,
    importCommunityFeatureToMine,
    unimportCommunityFeature,
  }
}
