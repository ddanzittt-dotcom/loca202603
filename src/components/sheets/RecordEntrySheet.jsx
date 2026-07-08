import { useEffect, useMemo, useRef, useState } from "react"
import { Plus, X } from "lucide-react"
import { useResolvedMediaUrl } from "../../hooks/useResolvedMediaUrl"
import { PhotoViewer } from "../visuals/PhotoViewer"

const DAY_OF_WEEK_KO = ["일", "월", "화", "수", "목", "금", "토"]

function formatTodayBadge() {
  const d = new Date()
  return `오늘 · ${d.getMonth() + 1}월 ${d.getDate()}일 ${DAY_OF_WEEK_KO[d.getDay()]}요일`
}

function RecordPhotoThumb({ photo, onDelete, onOpen }) {
  const { src, markRemoteFailed } = useResolvedMediaUrl(photo)
  return (
    <div className="res-photo-thumb">
      <button type="button" className="res-photo-view" onClick={onOpen} aria-label="사진 보기">
        {src ? <img src={src} alt="" onError={markRemoteFailed} /> : null}
      </button>
      {onDelete ? (
        <button
          type="button"
          className="res-photo-rm"
          aria-label="사진 삭제"
          onClick={(event) => {
            event.stopPropagation()
            onDelete()
          }}
        >
          <X size={10} />
        </button>
      ) : null}
    </div>
  )
}

export function RecordEntrySheet({
  open,
  featureTitle,
  recordId = "",
  mode = "create",
  initialText = "",
  saveLabel,
  onClose,
  onSave,
  photos = [],
  voices = [],
  onPhotoSelected,
  onDeletePhoto,
  photoInputRef,
}) {
  const [text, setText] = useState("")
  const [viewerIndex, setViewerIndex] = useState(null)
  const textareaRef = useRef(null)
  const todayBadge = useMemo(() => formatTodayBadge(), [])
  const maxChars = 280

  useEffect(() => {
    if (!open) return undefined
    const timer = window.setTimeout(() => {
      setText(initialText || "")
      textareaRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [initialText, open])

  if (!open) return null

  const canSave = text.trim().length > 0 || photos.length > 0 || voices.length > 0
  const isEditMode = mode === "edit"
  const closeWithoutSave = () => onClose?.({ saved: false })

  return (
    <>
      <div className="res-backdrop" onClick={closeWithoutSave} />
      <section className="res-sheet" role="dialog" aria-modal="true" aria-label="오늘의 기록 남기기">
        <div className="res-handle" />

        <header className="res-head">
          <div>
            <span className="res-today">{todayBadge}</span>
            <h2 className="res-title">
              <span className="res-title__name">{featureTitle || "장소"}</span>
              <span className="res-title__rest">{isEditMode ? " 기록 수정" : " 기록하기"}</span>
            </h2>
            <p className="res-sub">{isEditMode ? "남겨둔 장면을 다시 정돈해요." : "사진과 메모를 오늘의 한 장면으로 묶어 저장해요."}</p>
          </div>
          <button type="button" className="res-close" onClick={closeWithoutSave} aria-label="닫기">
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
                <RecordPhotoThumb
                  key={photo.id || photo.localId || `photo-${index}`}
                  photo={photo}
                  onOpen={() => setViewerIndex(index)}
                  onDelete={onDeletePhoto ? () => onDeletePhoto(photo.id || photo.localId) : null}
                />
              ))}
              <button type="button" className="res-photo-add" onClick={() => photoInputRef?.current?.click()} aria-label="사진 추가">
                <Plus size={20} strokeWidth={1.8} />
                <span>추가</span>
              </button>
            </div>
          </section>
        </div>

        <div className="res-action">
          <button
            type="button"
            className="res-save"
            disabled={!canSave || text.length > maxChars}
            onClick={async () => {
              await onSave?.(text.trim(), { recordId, mode })
              setText("")
              onClose?.({ saved: true })
            }}
          >
            {saveLabel || (isEditMode ? "수정 저장" : "오늘의 기록 저장")}
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
              onPhotoSelected?.(event, { recordId })
              event.target.value = ""
            }}
          />
        ) : null}
        <PhotoViewer
          open={viewerIndex !== null}
          photos={photos}
          initialIndex={viewerIndex || 0}
          onClose={() => setViewerIndex(null)}
        />
      </section>
    </>
  )
}
