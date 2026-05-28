import { useEffect, useRef, useState } from "react"
import { useResolvedMediaUrl } from "../hooks/useResolvedMediaUrl"

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
  const [viewerOpen, setViewerOpen] = useState(false)
  const { src, markRemoteFailed } = useResolvedMediaUrl({ id: mediaId, localId, url: cloudUrl })
  if (!src) return null
  const formattedDate = date ? new Date(date).toLocaleDateString("ko-KR", { month: "long", day: "numeric" }) : ""
  return (
    <div className="feature-photo-thumb-wrap">
      <img src={src} alt="" className="feature-photo-thumb" onClick={() => setViewerOpen(true)} onError={markRemoteFailed} style={{ cursor: "pointer" }} />
      {onDelete ? <button className="feature-photo-delete" type="button" onClick={onDelete}>&times;</button> : null}
      {formattedDate ? <span className="feature-photo-date">{formattedDate}</span> : null}
      {viewerOpen ? <PhotoViewer src={src} onClose={() => setViewerOpen(false)} /> : null}
    </div>
  )
}

export function MediaVoice({ mediaId, localId, duration, onDelete, cloudUrl }) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef(null)
  const { src, markRemoteFailed } = useResolvedMediaUrl({ id: mediaId, localId, url: cloudUrl }, { preferLocal: true })
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
  return (
    <div className="feature-voice-card">
      {src ? <audio ref={audioRef} src={src} onEnded={() => setPlaying(false)} onError={markRemoteFailed} /> : null}
      <button className="feature-voice-card__play" type="button" onClick={togglePlay} disabled={!src}>
        {playing ? "⏸" : "▶"}
      </button>
      <span className="feature-voice-card__dur">
        {duration != null ? `${Math.round(duration)}초` : ""}
      </span>
      {onDelete ? <button className="feature-voice-card__delete" type="button" onClick={onDelete}>&times;</button> : null}
    </div>
  )
}
