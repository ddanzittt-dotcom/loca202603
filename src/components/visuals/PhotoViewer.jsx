import { useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { useResolvedMediaUrl } from "../../hooks/useResolvedMediaUrl"

function clampIndex(value, length) {
  if (!length) return 0
  return Math.min(Math.max(value, 0), length - 1)
}

function ViewerSlide({ photo, active }) {
  const { src, markRemoteFailed } = useResolvedMediaUrl(photo)
  return (
    <div className="loca-photo-viewer__slide" aria-hidden={!active}>
      {src ? (
        <img src={src} alt="" draggable="false" onError={markRemoteFailed} />
      ) : (
        <div className="loca-photo-viewer__empty">사진을 불러오고 있어요</div>
      )}
    </div>
  )
}

function getPhotoKey(photo, photoIndex) {
  return photo?.id || photo?.localId || photo?.url || photoIndex
}

function PhotoViewerDialog({ photos, initialIndex, onClose }) {
  const photoCount = Array.isArray(photos) ? photos.length : 0
  const [index, setIndex] = useState(() => clampIndex(initialIndex, photoCount))
  const dragRef = useRef(null)
  const canMove = photoCount > 1

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.()
      if (event.key === "ArrowRight") setIndex((current) => clampIndex(current + 1, photoCount))
      if (event.key === "ArrowLeft") setIndex((current) => clampIndex(current - 1, photoCount))
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose, photoCount])

  const goPrev = () => setIndex((current) => clampIndex(current - 1, photoCount))
  const goNext = () => setIndex((current) => clampIndex(current + 1, photoCount))
  const handlePointerDown = (event) => {
    dragRef.current = { x: event.clientX, y: event.clientY }
  }
  const handlePointerUp = (event) => {
    const start = dragRef.current
    dragRef.current = null
    if (!start || !canMove) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.abs(dx) < 36 || Math.abs(dx) < Math.abs(dy)) return
    if (dx < 0) goNext()
    else goPrev()
  }

  return (
    <div className="loca-photo-viewer" role="dialog" aria-modal="true" aria-label="사진 보기">
      <button type="button" className="loca-photo-viewer__backdrop" onClick={onClose} aria-label="닫기" />
      <div className="loca-photo-viewer__panel">
        <header className="loca-photo-viewer__top">
          <span className="loca-photo-viewer__count">{index + 1} / {photoCount}</span>
          <button type="button" className="loca-photo-viewer__close" onClick={onClose} aria-label="닫기">
            <X size={20} />
          </button>
        </header>

        <div
          className="loca-photo-viewer__stage"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
        >
          <div
            className="loca-photo-viewer__track"
            style={{ transform: `translateX(${-index * 100}%)` }}
          >
            {photos.map((photo, photoIndex) => (
              <ViewerSlide
                key={getPhotoKey(photo, photoIndex)}
                photo={photo}
                active={photoIndex === index}
              />
            ))}
          </div>
        </div>

        {canMove ? (
          <>
            <button
              type="button"
              className="loca-photo-viewer__nav loca-photo-viewer__nav--prev"
              onClick={goPrev}
              disabled={index === 0}
              aria-label="이전 사진"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              className="loca-photo-viewer__nav loca-photo-viewer__nav--next"
              onClick={goNext}
              disabled={index === photoCount - 1}
              aria-label="다음 사진"
            >
              <ChevronRight size={22} />
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}

export function PhotoViewer({ open, photos = [], initialIndex = 0, onClose }) {
  const photoCount = Array.isArray(photos) ? photos.length : 0
  if (!open || !photoCount) return null

  const clampedInitialIndex = clampIndex(initialIndex, photoCount)
  const activePhoto = photos[clampedInitialIndex]
  const viewerKey = `${photoCount}-${clampedInitialIndex}-${getPhotoKey(activePhoto, clampedInitialIndex)}`

  return (
    <PhotoViewerDialog
      key={viewerKey}
      photos={photos}
      initialIndex={clampedInitialIndex}
      onClose={onClose}
    />
  )
}
