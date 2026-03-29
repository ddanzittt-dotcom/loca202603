import { useRef, useState } from "react"
import { createId } from "../lib/appUtils"
import { saveMedia, deleteMedia } from "../lib/mediaStore"

export function useMediaHandlers({ featureSheet, setFeatureSheet, updateFeatures, showToast }) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const mediaRecorderRef = useRef(null)
  const recordingTimerRef = useRef(null)
  const photoInputRef = useRef(null)

  const handlePhotoSelected = async (event) => {
    const file = event.target.files?.[0]
    if (!file || !featureSheet) return
    try {
      const img = await new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = reject
        image.src = URL.createObjectURL(file)
      })
      const maxW = 800
      let w = img.width
      let h = img.height
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW }
      const canvas = document.createElement("canvas")
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d")
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(img.src)
      const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.7))
      const photoId = createId("photo")
      await saveMedia(photoId, blob)
      const photoEntry = { id: photoId, date: new Date().toISOString() }
      const featureId = featureSheet.id
      const updater = (f) => f.id === featureId ? { ...f, photos: [...(f.photos || []), photoEntry] } : f
      updateFeatures((c) => c.map(updater))
      setFeatureSheet((c) => ({ ...c, photos: [...(c.photos || []), photoEntry] }))
      showToast("사진을 추가했어요.")
    } catch (err) {
      console.error("Photo error", err)
      showToast("사진을 추가하지 못했어요.")
    }
    if (photoInputRef.current) photoInputRef.current.value = ""
  }

  const handleDeletePhoto = async (photoId) => {
    if (!featureSheet || !window.confirm("이 사진을 삭제할까요?")) return
    await deleteMedia(photoId)
    const featureId = featureSheet.id
    const updater = (f) => f.id === featureId ? { ...f, photos: (f.photos || []).filter((p) => p.id !== photoId) } : f
    updateFeatures((c) => c.map(updater))
    setFeatureSheet((c) => ({ ...c, photos: (c.photos || []).filter((p) => p.id !== photoId) }))
    showToast("사진을 삭제했어요.")
  }

  const startRecording = async () => {
    if (!featureSheet) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" })
      const chunks = []
      let secs = 0
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        clearInterval(recordingTimerRef.current)
        setIsRecording(false)
        const duration = secs
        setRecordingSeconds(0)
        const blob = new Blob(chunks, { type: "audio/webm" })
        const voiceId = createId("voice")
        await saveMedia(voiceId, blob)
        const voiceEntry = { id: voiceId, duration, date: new Date().toISOString() }
        const featureId = featureSheet.id
        const updater = (f) => f.id === featureId ? { ...f, voices: [...(f.voices || []), voiceEntry] } : f
        updateFeatures((c) => c.map(updater))
        setFeatureSheet((c) => ({ ...c, voices: [...(c.voices || []), voiceEntry] }))
        showToast("음성을 저장했어요.")
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
      setRecordingSeconds(0)
      recordingTimerRef.current = setInterval(() => {
        secs++
        setRecordingSeconds(secs)
        if (secs >= 10) {
          recorder.stop()
        }
      }, 1000)
    } catch (err) {
      console.error("Recording error", err)
      showToast("마이크를 사용할 수 없어요.")
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop()
    }
  }

  const handleDeleteVoice = async (voiceId) => {
    if (!featureSheet || !window.confirm("이 음성을 삭제할까요?")) return
    await deleteMedia(voiceId)
    const featureId = featureSheet.id
    const updater = (f) => f.id === featureId ? { ...f, voices: (f.voices || []).filter((v) => v.id !== voiceId) } : f
    updateFeatures((c) => c.map(updater))
    setFeatureSheet((c) => ({ ...c, voices: (c.voices || []).filter((v) => v.id !== voiceId) }))
    showToast("음성을 삭제했어요.")
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
