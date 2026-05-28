import { useEffect, useRef, useState } from "react"
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
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const mediaRecorderRef = useRef(null)
  const recordingTimerRef = useRef(null)
  const photoInputRef = useRef(null)
  const activeFeatureRef = useRef(mediaTargetFeature || featureSheet)
  const activeRecordIdRef = useRef(null)

  useEffect(() => {
    activeFeatureRef.current = mediaTargetFeature || featureSheet
  }, [featureSheet, mediaTargetFeature])

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

  const startRecording = async (options = {}) => {
    if (!activeFeatureRef.current) return
    activeRecordIdRef.current = `${options?.recordId || ""}`.trim() || null
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeCandidates = ["audio/webm", "audio/mp4", "audio/ogg", "audio/wav"]
      const mimeType = mimeCandidates.find((type) => MediaRecorder.isTypeSupported(type)) || ""
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      const chunks = []
      let secs = 0
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        clearInterval(recordingTimerRef.current)
        setIsRecording(false)
        const duration = secs
        setRecordingSeconds(0)
        const currentTarget = activeFeatureRef.current
        const recordId = activeRecordIdRef.current
        activeRecordIdRef.current = null
        if (!currentTarget) return
        const actualMime = recorder.mimeType || mimeType || "audio/webm"
        const blob = new Blob(chunks, { type: actualMime })
        try {
          assertStoredMediaAllowed(blob, "voice")
        } catch (error) {
          showToast(error.message)
          return
        }
        const voiceId = createId("voice")
        await saveMedia(voiceId, blob)
        const featureId = currentTarget.id
        const voiceEntry = {
          id: voiceId,
          localId: voiceId,
          duration,
          date: new Date().toISOString(),
          mimeType: blob.type,
          sizeBytes: blob.size,
          recordId: recordId || null,
        }
        appendMediaEntry(featureId, "voices", voiceEntry)
        if (cloudMode) {
          try {
            const cloudMeta = await uploadMediaToCloud(voiceId, blob, "voices")
            if (cloudMeta?.publicUrl) {
              let syncedEntry = {
                ...voiceEntry,
                url: cloudMeta.publicUrl,
                storagePath: cloudMeta.storagePath,
              }
              try {
                const record = await createMediaRecord(currentTarget.id, {
                  storagePath: cloudMeta.storagePath,
                  publicUrl: cloudMeta.publicUrl,
                  mimeType: cloudMeta.mimeType,
                  fileExt: cloudMeta.fileExt,
                  sizeBytes: cloudMeta.sizeBytes,
                  mediaType: "voice",
                  duration,
                  recordId: recordId || undefined,
                })
                syncedEntry = {
                  id: record.id,
                  localId: voiceId,
                  duration: record.duration ?? duration,
                  date: record.date,
                  url: record.url,
                  storagePath: record.storagePath,
                  mimeType: cloudMeta.mimeType,
                  sizeBytes: cloudMeta.sizeBytes,
                  recordId: recordId || record.recordId || null,
                }
              } catch (error) {
                console.warn("Voice cloud record failed; keeping upload metadata for retry", error)
              }
              replaceMediaEntry(featureId, "voices", voiceId, syncedEntry)
            }
          } catch (error) {
            console.warn("Voice cloud upload failed; keeping local media for retry", error)
          }
        }
        showToast("음성을 저장했어요.")
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
      setRecordingSeconds(0)
      recordingTimerRef.current = setInterval(() => {
        secs += 1
        setRecordingSeconds(secs)
        if (secs >= MEDIA_POLICY.voice.maxDurationSeconds) {
          recorder.stop()
        }
      }, 1000)
    } catch (err) {
      activeRecordIdRef.current = null
      console.error("Recording error", err)
      showToast("마이크를 사용할 수 없어요.")
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop()
    }
  }

  const handleDeleteVoice = async (voiceId, options = {}) => {
    const targetFeature = mediaTargetFeature || featureSheet
    const featureId = options?.featureId || targetFeature?.id
    if (!featureId) return
    if (!options?.skipConfirm && !window.confirm("이 음성을 삭제할까요?")) return
    const voice = (targetFeature?.voices || []).find((item) => item.id === voiceId || item.localId === voiceId)
    await deleteMedia(voiceId)
    if (voice?.localId && voice.localId !== voiceId) await deleteMedia(voice.localId)
    if (cloudMode) {
      const storagePath = await deleteMediaRecord(voiceId).catch(() => null)
      deleteMediaFromCloud(voiceId, "voices", storagePath || voice?.storagePath || null)
    }
    const filterVoices = (voices = []) => voices.filter((item) => item.id !== voiceId && item.localId !== voiceId)
    const updater = (feature) => (
      feature.id === featureId ? { ...feature, voices: filterVoices(feature.voices) } : feature
    )
    updateFeatures((current) => current.map(updater))
    updateFeatureSheetIfOpen(featureId, (current) => ({ ...current, voices: filterVoices(current.voices) }))
    if (!options?.silent) showToast("음성을 삭제했어요.")
  }

  return {
    photoInputRef,
    isRecording,
    recordingSeconds,
    handlePhotoSelected,
    handleDeletePhoto,
    startRecording,
    stopRecording,
    handleDeleteVoice,
  }
}
