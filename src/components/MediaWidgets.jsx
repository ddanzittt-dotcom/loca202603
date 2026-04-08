import { useEffect, useRef, useState } from "react"
import { getMedia } from "../lib/mediaStore"

function PhotoViewer({ src, onClose }) {
  useEffect(() => {
    const handleKey = (e) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [onClose])
  return (
    <div className="photo-viewer-overlay" onClick={onClose}>
      <img src={src} alt="" className="photo-viewer-img" onClick={(e) => e.stopPropagation()} />
      <button className="photo-viewer-close" type="button" onClick={onClose}>&times;</button>
    </div>
  )
}

export function MediaPhoto({ mediaId, localId, date, onDelete, cloudUrl }) {
  const [localSrc, setLocalSrc] = useState(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  useEffect(() => {
    if (cloudUrl) return
    let url = null
    let cancelled = false
    const tryLoad = async () => {
      // localId → mediaId 순으로 시도
      for (const key of [localId, mediaId].filter(Boolean)) {
        try {
          const blob = await getMedia(key)
          if (blob && !cancelled) {
            url = URL.createObjectURL(blob)
            setLocalSrc(url)
            return
          }
        } catch { /* continue */ }
      }
      if (!cancelled) setLoadFailed(true)
    }
    tryLoad()
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [mediaId, localId, cloudUrl])
  const src = cloudUrl || localSrc
  if (!src && loadFailed) {
    return (
      <div className="feature-photo-thumb-wrap">
        <div className="feature-photo-thumb feature-photo-thumb--lost">
          <span>사진 손실</span>
        </div>
        {onDelete ? <button className="feature-photo-delete" type="button" onClick={onDelete}>&times;</button> : null}
      </div>
    )
  }
  if (!src) return null
  const formattedDate = date ? new Date(date).toLocaleDateString("ko-KR", { month: "long", day: "numeric" }) : ""
  return (
    <div className="feature-photo-thumb-wrap">
      <img src={src} alt="" className="feature-photo-thumb" onClick={() => setViewerOpen(true)} style={{ cursor: "pointer" }} />
      {onDelete ? <button className="feature-photo-delete" type="button" onClick={onDelete}>&times;</button> : null}
      {formattedDate ? <span className="feature-photo-date">{formattedDate}</span> : null}
      {viewerOpen ? <PhotoViewer src={src} onClose={() => setViewerOpen(false)} /> : null}
    </div>
  )
}

export function MediaVoice({ mediaId, localId, duration, date, onDelete, cloudUrl }) {
  const [localSrc, setLocalSrc] = useState(null)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef(null)
  useEffect(() => {
    if (cloudUrl) return
    let url = null
    const key = localId || mediaId
    getMedia(key).then((blob) => {
      if (blob) {
        url = URL.createObjectURL(blob)
        setLocalSrc(url)
      }
    })
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [mediaId, localId, cloudUrl])
  const src = cloudUrl || localSrc
  const togglePlay = () => {
    if (!audioRef.current) return
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
    } else {
      audioRef.current.play()
      setPlaying(true)
    }
  }
  const formattedDate = date ? new Date(date).toLocaleDateString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""
  return (
    <div className="feature-voice-item">
      {src ? <audio ref={audioRef} src={src} onEnded={() => setPlaying(false)} /> : null}
      <button className="feature-voice-play" type="button" onClick={togglePlay} disabled={!src}>
        {playing ? "⏸" : "▶"}
      </button>
      <span className="feature-voice-info">
        {duration != null ? `${Math.round(duration)}초` : ""} {formattedDate}
      </span>
      {onDelete ? <button className="feature-photo-delete" type="button" onClick={onDelete}>&times;</button> : null}
    </div>
  )
}
