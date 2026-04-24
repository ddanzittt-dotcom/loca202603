import { useCallback, useEffect, useRef, useState } from "react"
import { getMedia } from "../lib/mediaStore"

/*
 * 음성 재생 훅 — 한 번에 하나만 재생.
 *
 * 사용:
 *   const voice = useVoicePlayback()
 *   <FeaturePopupCard
 *     onVoiceClick={(v, i) => voice.toggle(v, scopeKey, i)}
 *     currentPlayingVoiceId={voice.playingId}
 *   />
 *
 * 정책:
 *   - `scopeKey` (보통 feature.id + index) 로 음성 하나를 식별한다.
 *   - 같은 key 재토글 → 정지. 다른 key 호출 → 이전 정지 후 새로 재생.
 *   - cloudUrl 이 있으면 우선 사용, 없으면 IndexedDB(mediaStore) 에서 Blob 로드.
 *   - 언마운트/정지 시 ObjectURL 해제.
 */
export function useVoicePlayback() {
  const audioRef = useRef(null)
  const currentBlobUrlRef = useRef(null)
  const [playingId, setPlayingId] = useState(null)

  const releaseBlobUrl = useCallback(() => {
    if (currentBlobUrlRef.current) {
      try { URL.revokeObjectURL(currentBlobUrlRef.current) } catch { /* noop */ }
      currentBlobUrlRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      try { audio.pause() } catch { /* noop */ }
      try { audio.removeAttribute("src"); audio.load() } catch { /* noop */ }
    }
    releaseBlobUrl()
    setPlayingId(null)
  }, [releaseBlobUrl])

  const resolveSrc = useCallback(async (voice) => {
    if (!voice) return null
    if (voice.url) return { src: voice.url, isBlob: false }
    if (voice.cloudUrl) return { src: voice.cloudUrl, isBlob: false }
    const key = voice.localId || voice.id
    if (!key) return null
    try {
      const blob = await getMedia(key)
      if (!blob) return null
      return { src: URL.createObjectURL(blob), isBlob: true }
    } catch {
      return null
    }
  }, [])

  const play = useCallback(async (voice, scopeKey) => {
    if (!voice) return
    stop()
    const resolved = await resolveSrc(voice)
    if (!resolved) return
    if (resolved.isBlob) currentBlobUrlRef.current = resolved.src

    // 새 Audio 를 만들고 핸들러·src 를 전부 붙인 뒤 ref 에 저장 — ref 저장 이후 변이 금지.
    const audio = new Audio()
    const clearOnEnd = () => {
      if (currentBlobUrlRef.current) {
        try { URL.revokeObjectURL(currentBlobUrlRef.current) } catch { /* noop */ }
        currentBlobUrlRef.current = null
      }
      setPlayingId(null)
    }
    audio.onended = clearOnEnd
    audio.onerror = clearOnEnd
    audio.src = resolved.src

    audioRef.current = audio
    try {
      await audio.play()
      setPlayingId(scopeKey)
    } catch {
      clearOnEnd()
    }
  }, [resolveSrc, stop])

  const toggle = useCallback((voice, scopeKey) => {
    if (playingId === scopeKey) {
      stop()
    } else {
      play(voice, scopeKey)
    }
  }, [play, playingId, stop])

  useEffect(() => () => {
    const audio = audioRef.current
    if (audio) { try { audio.pause() } catch { /* noop */ } }
    releaseBlobUrl()
  }, [releaseBlobUrl])

  return { playingId, play, stop, toggle }
}

// 음성 key 생성 — feature.id + voice index 를 합쳐 안정적인 scope key 반환
export function makeVoiceScopeKey(featureId, voice, index) {
  const voiceId = voice?.id || voice?.localId || `idx-${index}`
  return `${featureId || "feat"}::${voiceId}`
}
