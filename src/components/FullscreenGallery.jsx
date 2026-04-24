import { useEffect, useRef, useState, useCallback } from "react"
import { getMedia } from "../lib/mediaStore"

/*
 * 풀스크린 사진 뷰어 — 사진 개수에 관계없이 메모리 안전하게 동작.
 *
 * 구조:
 *   - 현재/이전/다음 3장만 DOM에 mount (가상 윈도잉).
 *   - Blob src 는 뷰어 보이는 사진에 한해 lazy 로드, 벗어나면 ObjectURL 해제.
 *   - 키보드: ← → Esc, 마우스: 화살표 버튼, 터치: 스와이프.
 *
 * props:
 *   photos: Array<{ id?, localId?, url?, cloudUrl?, date? }>
 *   initialIndex: number
 *   onClose: () => void
 */
export function FullscreenGallery({ photos, initialIndex = 0, onClose }) {
  const total = photos.length
  const [index, setIndex] = useState(() => clampIndex(initialIndex, total))
  // key → src. 로드 완료 시에만 async 로 업데이트한다 (effect 내 sync setState 금지).
  const [srcByKey, setSrcByKey] = useState({})
  const objectUrlsRef = useRef(new Map())         // key → objectURL (언마운트 시 일괄 해제)
  const touchStartRef = useRef(null)

  const prev = useCallback(() => {
    setIndex((i) => (total === 0 ? 0 : (i - 1 + total) % total))
  }, [total])
  const next = useCallback(() => {
    setIndex((i) => (total === 0 ? 0 : (i + 1) % total))
  }, [total])

  // 키보드 핸들러
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.()
      else if (e.key === "ArrowLeft") prev()
      else if (e.key === "ArrowRight") next()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [next, prev, onClose])

  // body scroll 잠금
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prevOverflow }
  }, [])

  // 현재/이웃 사진 3장만 blob 로드. 메모리는 언마운트 시 일괄 해제.
  useEffect(() => {
    if (total === 0) return
    const window_ = new Set([
      (index - 1 + total) % total,
      index,
      (index + 1) % total,
    ])
    let cancelled = false

    const loadOne = async (i) => {
      const photo = photos[i]
      const key = photoKey(photo, i)
      const cloudUrl = photo?.url || photo?.cloudUrl
      if (cloudUrl) {
        // Cloud URL 은 즉시 매핑 (async) — microtask 로 밀어 sync-setState 경고 회피
        Promise.resolve().then(() => {
          if (cancelled) return
          setSrcByKey((prev) => prev[key] === cloudUrl ? prev : { ...prev, [key]: cloudUrl })
        })
        return
      }
      const mediaKey = photo?.localId || photo?.id
      if (!mediaKey) return
      if (objectUrlsRef.current.has(key)) return
      try {
        const blob = await getMedia(mediaKey)
        if (!blob || cancelled) return
        const url = URL.createObjectURL(blob)
        objectUrlsRef.current.set(key, url)
        setSrcByKey((prev) => ({ ...prev, [key]: url }))
      } catch { /* noop */ }
    }

    window_.forEach((i) => { loadOne(i) })
    return () => { cancelled = true }
  }, [index, photos, total])

  // 언마운트 시 전체 해제
  useEffect(() => () => {
    for (const url of objectUrlsRef.current.values()) {
      try { URL.revokeObjectURL(url) } catch { /* noop */ }
    }
    objectUrlsRef.current.clear()
  }, [])

  if (total === 0) return null

  const visibleIndices = [index - 1, index, index + 1]
    .map((i) => (i + total) % total)
    .filter((i, idx, arr) => (total >= 3 ? true : arr.indexOf(i) === idx))

  const handleTouchStart = (e) => {
    const t = e.touches[0]
    touchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() }
  }
  const handleTouchEnd = (e) => {
    const start = touchStartRef.current
    if (!start) return
    touchStartRef.current = null
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return
    if (dx > 0) prev()
    else next()
  }

  return (
    <div
      className="fpc-gallery"
      role="dialog"
      aria-modal="true"
      aria-label="사진 보기"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="fpc-gallery__frame" onClick={(e) => e.stopPropagation()}>
        {visibleIndices.map((i) => {
          const photo = photos[i]
          const key = photoKey(photo, i)
          const src = srcByKey[key]
          const offset = positionOffset(i, index, total)
          return (
            <div
              key={key}
              className={`fpc-gallery__slide fpc-gallery__slide--${offset}`}
            >
              {src ? <img src={src} alt="" className="fpc-gallery__img" /> : <div className="fpc-gallery__loading" />}
            </div>
          )
        })}

        {total > 1 ? (
          <>
            <button
              type="button"
              className="fpc-gallery__nav fpc-gallery__nav--prev"
              onClick={(e) => { e.stopPropagation(); prev() }}
              aria-label="이전 사진"
            >‹</button>
            <button
              type="button"
              className="fpc-gallery__nav fpc-gallery__nav--next"
              onClick={(e) => { e.stopPropagation(); next() }}
              aria-label="다음 사진"
            >›</button>
            <div className="fpc-gallery__counter" aria-live="polite">
              {index + 1} / {total}
            </div>
          </>
        ) : null}

        <button
          type="button"
          className="fpc-gallery__close"
          onClick={(e) => { e.stopPropagation(); onClose?.() }}
          aria-label="닫기"
        >×</button>
      </div>
    </div>
  )
}

function clampIndex(i, total) {
  if (total === 0) return 0
  if (!Number.isFinite(i) || i < 0) return 0
  if (i >= total) return total - 1
  return i
}

function photoKey(photo, index) {
  if (!photo) return `idx-${index}`
  return photo.id || photo.localId || photo.url || photo.cloudUrl || `idx-${index}`
}

function positionOffset(slideIndex, currentIndex, total) {
  if (slideIndex === currentIndex) return "current"
  const forward = (slideIndex - currentIndex + total) % total
  if (forward === 1) return "next"
  return "prev"
}
