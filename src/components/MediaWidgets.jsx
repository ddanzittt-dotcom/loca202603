import { useEffect, useRef, useState } from "react"
import { getMedia } from "../lib/mediaStore"

export function MediaPhoto({ mediaId, date, onDelete }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    let url = null
    getMedia(mediaId).then((blob) => {
      if (blob) {
        url = URL.createObjectURL(blob)
        setSrc(url)
      }
    })
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [mediaId])
  if (!src) return null
  const formattedDate = date ? new Date(date).toLocaleDateString("ko-KR", { month: "long", day: "numeric" }) : ""
  return (
    <div className="feature-photo-thumb-wrap">
      <img src={src} alt="" className="feature-photo-thumb" />
      {onDelete ? <button className="feature-photo-delete" type="button" onClick={onDelete}>&times;</button> : null}
      {formattedDate ? <span className="feature-photo-date">{formattedDate}</span> : null}
    </div>
  )
}

export function MediaVoice({ mediaId, duration, date, onDelete }) {
  const [src, setSrc] = useState(null)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef(null)
  useEffect(() => {
    let url = null
    getMedia(mediaId).then((blob) => {
      if (blob) {
        url = URL.createObjectURL(blob)
        setSrc(url)
      }
    })
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [mediaId])
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
