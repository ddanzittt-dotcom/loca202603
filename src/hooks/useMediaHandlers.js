import { useRef } from "react"
import { createId } from "../lib/appUtils"
import { saveMedia, deleteMedia, uploadMediaToCloud, deleteMediaFromCloud } from "../lib/mediaStore"
import { createMediaRecord, deleteMediaRecord } from "../lib/mapService"
import { MEDIA_POLICY, assertPhotoFileAllowed, assertStoredMediaAllowed } from "../lib/mediaPolicy"

export function useMediaHandlers({
  featureSheet,
  mediaTargetFeature = null,
  setFeatureSheet,
  updateFeatures,
  showToast,
  cloudMode = false,
}) {
  const photoInputRef = useRef(null)

  const updateFeatureSheetIfOpen = (featureId, patcher) => {
    setFeatureSheet((current) => {
      if (!current || current.id !== featureId) return current
      return patcher(current)
    })
  }

  const updateFeatureMedia = (featureId, mediaKey, listUpdater) => {
    updateFeatures((current) => current.map((feature) => (
      feature.id === featureId
        ? { ...feature, [mediaKey]: listUpdater(feature[mediaKey] || []) }
        : feature
    )))
    updateFeatureSheetIfOpen(featureId, (current) => ({
      ...current,
      [mediaKey]: listUpdater(current[mediaKey] || []),
    }))
  }

  const appendMediaEntry = (featureId, mediaKey, entry) => {
    updateFeatureMedia(featureId, mediaKey, (items = []) => [...items, entry])
  }

  const replaceMediaEntry = (featureId, mediaKey, localId, nextEntry) => {
    updateFeatureMedia(featureId, mediaKey, (items = []) => {
      let replaced = false
      const nextItems = items.map((item) => {
        const isMatch = item.id === localId || item.localId === localId || item.id === nextEntry.id
        if (!isMatch) return item
        replaced = true
        return {
          ...item,
          ...nextEntry,
          localId: nextEntry.localId || item.localId || localId,
        }
      })
      return replaced ? nextItems : [...nextItems, nextEntry]
    })
  }

  const handlePhotoSelected = async (event, options = {}) => {
    const file = event.target.files?.[0]
    const targetFeature = mediaTargetFeature || featureSheet
    if (!file || !targetFeature) return
    const recordId = `${options?.recordId || ""}`.trim()
    try {
      assertPhotoFileAllowed(file)
      const img = await new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = reject
        image.src = URL.createObjectURL(file)
      })
      const maxW = MEDIA_POLICY.photo.maxWidth
      let w = img.width
      let h = img.height
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW }
      const canvas = document.createElement("canvas")
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d")
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(img.src)
      const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", MEDIA_POLICY.photo.jpegQuality))
      assertStoredMediaAllowed(blob, "photo")
      const photoId = createId("photo")
      await saveMedia(photoId, blob)
      const featureId = targetFeature.id
      const photoEntry = {
        id: photoId,
        localId: photoId,
        date: new Date().toISOString(),
        mimeType: blob.type,
        sizeBytes: blob.size,
        recordId: recordId || null,
      }
      appendMediaEntry(featureId, "photos", photoEntry)
      if (cloudMode) {
        try {
          const cloudMeta = await uploadMediaToCloud(photoId, blob, "photos")
          if (cloudMeta?.publicUrl) {
            let syncedEntry = {
              ...photoEntry,
              url: cloudMeta.publicUrl,
              storagePath: cloudMeta.storagePath,
            }
            try {
              const record = await createMediaRecord(targetFeature.id, {
                storagePath: cloudMeta.storagePath,
                publicUrl: cloudMeta.publicUrl,
                mimeType: cloudMeta.mimeType,
                fileExt: cloudMeta.fileExt,
                sizeBytes: cloudMeta.sizeBytes,
                mediaType: "photo",
                recordId: recordId || undefined,
              })
              syncedEntry = {
                id: record.id,
                localId: photoId,
                date: record.date,
                url: record.url,
                storagePath: record.storagePath,
                mimeType: cloudMeta.mimeType,
                sizeBytes: cloudMeta.sizeBytes,
                recordId: recordId || record.recordId || null,
              }
            } catch (error) {
              console.warn("Photo cloud record failed; keeping upload metadata for retry", error)
            }
            replaceMediaEntry(featureId, "photos", photoId, syncedEntry)
          }
        } catch (error) {
          console.warn("Photo cloud upload failed; keeping local media for retry", error)
        }
      }
      showToast("사진을 추가했어요.")
    } catch (err) {
      console.error("Photo error", err)
      showToast(err?.message || "사진을 추가하지 못했어요.")
    }
    if (photoInputRef.current) photoInputRef.current.value = ""
  }

  const handleDeletePhoto = async (photoId, options = {}) => {
    const targetFeature = mediaTargetFeature || featureSheet
    const featureId = options?.featureId || targetFeature?.id
    if (!featureId) return
    if (!options?.skipConfirm && !window.confirm("이 사진을 삭제할까요?")) return
    const photo = (targetFeature?.photos || []).find((item) => item.id === photoId || item.localId === photoId)
    await deleteMedia(photoId)
    if (photo?.localId && photo.localId !== photoId) await deleteMedia(photo.localId)
    if (cloudMode) {
      const storagePath = await deleteMediaRecord(photoId).catch(() => null)
      deleteMediaFromCloud(photoId, "photos", storagePath || photo?.storagePath || null)
    }
    const filterPhotos = (photos = []) => photos.filter((item) => item.id !== photoId && item.localId !== photoId)
    const updater = (feature) => (
      feature.id === featureId ? { ...feature, photos: filterPhotos(feature.photos) } : feature
    )
    updateFeatures((current) => current.map(updater))
    updateFeatureSheetIfOpen(featureId, (current) => ({ ...current, photos: filterPhotos(current.photos) }))
    if (!options?.silent) showToast("사진을 삭제했어요.")
  }

  return {
    photoInputRef,
    handlePhotoSelected,
    handleDeletePhoto,
  }
}
