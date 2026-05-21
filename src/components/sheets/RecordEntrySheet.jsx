import { useEffect, useMemo, useRef, useState } from "react"
import { Mic, Plus, Square, Trash2, X } from "lucide-react"

const DAY_OF_WEEK_KO = ["일", "월", "화", "수", "목", "금", "토"]

function formatTodayBadge() {
  const d = new Date()
  return `오늘 · ${d.getMonth() + 1}월 ${d.getDate()}일 ${DAY_OF_WEEK_KO[d.getDay()]}요일`
}

function formatTime(sec) {
  const n = Math.max(0, Math.round(sec || 0))
  const m = Math.floor(n / 60)
  const s = n % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

function photoSrc(photo) {
  return photo?.url || photo?.thumbnail || photo?.src || photo?.cloudUrl || ""
}

export function RecordEntrySheet({
  open,
  featureTitle,
  onClose,
  onSave,
  photos = [],
  voices = [],
  onPhotoSelected,
  onDeletePhoto,
  onStartRecording,
  onStopRecording,
  onDeleteVoice,
  isRecording = false,
  recordingSeconds = 0,
  photoInputRef,
}) {
  const [text, setText] = useState("")
  const textareaRef = useRef(null)
  const todayBadge = useMemo(() => formatTodayBadge(), [])
  const maxChars = 280

  useEffect(() => {
    if (!open) return undefined
    const timer = window.setTimeout(() => {
      setText("")
      textareaRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [open])

  if (!open) return null

  const bars = Array.from({ length: 14 }, (_, index) => {
    const seed = (index * 19 + Math.floor((recordingSeconds || 0) * 13)) % 100
    return isRecording ? 28 + (seed % 58) : 22 + ((index * 7) % 26)
  })
  const canSave = text.trim().length > 0 || photos.length > 0 || voices.length > 0

  return (
    <>
      <div className="res-backdrop" onClick={onClose} />
      <section className="res-sheet" role="dialog" aria-modal="true" aria-label="오늘의 기록 남기기">
        <div className="res-handle" />

        <header className="res-head">
          <div>
            <span className="res-today">{todayBadge}</span>
            <h2 className="res-title">
              <span className="res-title__name">{featureTitle || "장소"}</span>
              <span className="res-title__rest"> 기록하기</span>
            </h2>
            <p className="res-sub">사진, 음성, 메모를 오늘의 한 장면으로 묶어 저장해요.</p>
          </div>
          <button type="button" className="res-close" onClick={onClose} aria-label="닫기">
            <X size={13} />
          </button>
        </header>

        <div className="res-body">
          <section className="res-section">
            <div className="res-section-label">
              <span>메모</span>
              <span className="res-char-count">
                <span className={text.length > maxChars ? "is-over" : ""}>{text.length}</span> / {maxChars}
              </span>
            </div>
            <textarea
              ref={textareaRef}
              className="res-textarea"
              rows={4}
              maxLength={maxChars + 40}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="이 장소에서 좋았던 순간, 다시 찾고 싶은 이유, 함께 기억할 이야기를 적어보세요."
            />
          </section>

          <section className="res-section">
            <div className="res-section-label">
              <span>사진</span>
              {photos.length > 0 ? <span className="res-count">{photos.length}</span> : null}
            </div>
            <div className="res-photo-row">
              {photos.map((photo, index) => (
                <div key={photo.id || photo.localId || `photo-${index}`} className="res-photo-thumb">
                  {photoSrc(photo) ? <img src={photoSrc(photo)} alt="" /> : null}
                  {onDeletePhoto ? (
                    <button type="button" className="res-photo-rm" aria-label="사진 삭제" onClick={() => onDeletePhoto(photo.id || photo.localId)}>
                      <X size={10} />
                    </button>
                  ) : null}
                </div>
              ))}
              <button type="button" className="res-photo-add" onClick={() => photoInputRef?.current?.click()} aria-label="사진 추가">
                <Plus size={20} strokeWidth={1.8} />
                <span>추가</span>
              </button>
            </div>
          </section>

          <section className="res-section">
            <div className="res-section-label">
              <span>음성</span>
              {voices.length > 0 ? <span className="res-count">{voices.length}</span> : null}
            </div>
            <div className="res-voice-card">
              <button
                type="button"
                className={`res-voice-mic${isRecording ? " is-recording" : ""}`}
                onClick={() => { if (isRecording) onStopRecording?.(); else onStartRecording?.() }}
                aria-label={isRecording ? "녹음 정지" : "음성 녹음 시작"}
              >
                {isRecording ? <Square size={17} fill="currentColor" /> : <Mic size={20} />}
              </button>
              <div className="res-voice-wave" aria-hidden="true">
                {bars.map((height, index) => (
                  <span key={index} style={{ height: `${height}%`, opacity: isRecording ? 1 : 0.36 }} />
                ))}
              </div>
              <div className="res-voice-meta">
                {isRecording ? <span className="res-voice-time">{formatTime(recordingSeconds)}</span> : <span className="res-voice-hint">탭해서 녹음</span>}
              </div>
            </div>

            {voices.length > 0 ? (
              <div className="res-voice-list">
                {voices.map((voice, index) => (
                  <span key={voice.id || voice.localId || `voice-${index}`} className="res-voice-chip">
                    <Mic size={11} strokeWidth={2} />
                    <span className="loca-v2-num">{formatTime(voice.duration || 0)}</span>
                    {onDeleteVoice ? (
                      <button type="button" className="res-voice-chip-rm" aria-label="음성 삭제" onClick={() => onDeleteVoice(voice.id || voice.localId)}>
                        <Trash2 size={9} />
                      </button>
                    ) : null}
                  </span>
                ))}
              </div>
            ) : null}
          </section>
        </div>

        <div className="res-action">
          <button
            type="button"
            className="res-save"
            disabled={!canSave || isRecording || text.length > maxChars}
            onClick={() => {
              onSave?.(text.trim())
              setText("")
              onClose?.()
            }}
          >
            {isRecording ? "녹음을 멈춘 뒤 저장하세요" : "오늘의 기록 저장"}
          </button>
        </div>

        {photoInputRef ? (
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(event) => {
              onPhotoSelected?.(event)
              event.target.value = ""
            }}
          />
        ) : null}
      </section>
    </>
  )
}
