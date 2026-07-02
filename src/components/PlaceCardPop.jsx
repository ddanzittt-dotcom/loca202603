import { useEffect, useMemo, useState } from "react"
import { MapPin, X } from "lucide-react"
import { FeatureEmoji } from "./FeatureEmoji"
import { buildFeatureRecordGroups } from "../lib/featureRecordGroups"

// 카드 상단 지도의 중심 좌표 (핀: 자기 좌표, 길/영역: 점들의 평균)
function getFeatureCenterPoint(feature) {
  const lat = Number(feature?.lat)
  const lng = Number(feature?.lng)
  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
    return { lat, lng }
  }
  const points = Array.isArray(feature?.points) ? feature.points : []
  const coords = points
    .map((point) => {
      if (Array.isArray(point)) return { lat: Number(point[1]), lng: Number(point[0]) }
      return { lat: Number(point?.lat ?? point?.y), lng: Number(point?.lng ?? point?.x) }
    })
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  if (!coords.length) return null
  return {
    lat: coords.reduce((sum, p) => sum + p.lat, 0) / coords.length,
    lng: coords.reduce((sum, p) => sum + p.lng, 0) / coords.length,
  }
}

const TYPE_LABELS = { pin: "장소", route: "길", area: "영역" }

function photoSrc(photo) {
  return photo?.url || photo?.thumbnail || photo?.src || photo?.cloudUrl || ""
}

function formatDate(value) {
  const date = new Date(value || NaN)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`
}

/**
 * PlaceCardPop — 장소 목록에서 장소를 누르면 뿅 하고 뜨는 장소 카드.
 * 사진·메모 등 그 장소에 남긴 기록을 카드 한 장으로 모아 보여준다.
 */
export function PlaceCardPop({ feature, mapTitle, onClose, onOpenOnMap }) {
  // 지도 이미지 로드 실패 기록 (feature 별로 추적 — 다른 장소를 열면 자동 초기화)
  const [mapFailedFor, setMapFailedFor] = useState(null)
  const mapFailed = mapFailedFor === (feature?.id || feature?.feature_id)

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === "Escape") onClose?.()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [onClose])

  const recordGroups = useMemo(() => {
    if (!feature) return []
    const groups = buildFeatureRecordGroups(feature)
    return [...groups].sort((a, b) => new Date(b.dateValue || 0) - new Date(a.dateValue || 0))
  }, [feature])

  const photos = useMemo(() => {
    const seen = new Set()
    const next = []
    for (const group of recordGroups) {
      for (const photo of group.photos || []) {
        const src = photoSrc(photo)
        if (!src || seen.has(src)) continue
        seen.add(src)
        next.push({ ...photo, src })
      }
    }
    return next
  }, [recordGroups])

  const records = useMemo(() => (
    recordGroups
      .map((group) => {
        const text = (group.memos || [])
          .map((memo) => `${memo?.text || memo?.memo || memo?.content || ""}`.trim())
          .filter(Boolean)
          .join("\n")
        const extras = []
        if (group.photos?.length) extras.push(`사진 ${group.photos.length}`)
        if (group.voices?.length) extras.push(`음성 ${group.voices.length}`)
        if (!text && !extras.length) return null
        return {
          id: group.id,
          date: formatDate(group.dateValue),
          text,
          extras: extras.join(" · "),
        }
      })
      .filter(Boolean)
  ), [recordGroups])

  if (!feature) return null

  const title = (feature.title || "").trim() || "이름 없는 장소"
  const typeLabel = TYPE_LABELS[feature.type] || "장소"
  const tags = Array.isArray(feature.tags) ? feature.tags.filter(Boolean).slice(0, 4) : []
  const note = (feature.note || "").trim()
  const savedLabel = formatDate(feature.updatedAt)
  const restPhotos = photos.slice(0, 7)
  const center = getFeatureCenterPoint(feature)
  const mapSrc = center && !mapFailed
    ? `/api/map-thumb?lat=${center.lat.toFixed(5)}&lng=${center.lng.toFixed(5)}`
    : null

  return (
    <div className="pcp-backdrop" onClick={onClose} role="presentation">
      <article
        className="pcp-card"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} 장소 카드`}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="pcp-close" onClick={onClose} aria-label="닫기">
          <X size={16} strokeWidth={2.2} />
        </button>

        {mapSrc ? (
          <div className="pcp-card__hero">
            <img
              src={mapSrc}
              alt={`${title} 위치 지도`}
              onError={() => setMapFailedFor(feature?.id || feature?.feature_id)}
            />
            <span className="pcp-card__hero-emoji" aria-hidden="true">
              <FeatureEmoji feature={feature} size={34} unicodeFontSize={20} />
            </span>
          </div>
        ) : (
          <div className="pcp-card__stage">
            <FeatureEmoji feature={feature} size={72} unicodeFontSize={44} ariaLabel={title} />
          </div>
        )}

        <div className="pcp-card__meta">
          <span className="pcp-card__type">{typeLabel}</span>
          {savedLabel ? <span className="pcp-card__date">{savedLabel}</span> : null}
        </div>

        <h2 className="pcp-card__title">{title}</h2>

        {tags.length ? (
          <div className="pcp-card__tags">
            {tags.map((tag) => <span key={tag}>#{tag}</span>)}
          </div>
        ) : null}

        {note ? <p className="pcp-card__note">{note}</p> : null}

        {restPhotos.length ? (
          <div className="pcp-card__photos" aria-label="사진">
            {restPhotos.map((photo) => (
              <img key={photo.src} src={photo.src} alt="" loading="lazy" />
            ))}
          </div>
        ) : null}

        {records.length ? (
          <section className="pcp-card__records" aria-label="기록">
            <h3>기록 {records.length}</h3>
            <ul>
              {records.slice(0, 5).map((record) => (
                <li key={record.id}>
                  <div className="pcp-card__record-head">
                    {record.date ? <time>{record.date}</time> : <span />}
                    {record.extras ? <em>{record.extras}</em> : null}
                  </div>
                  {record.text ? <p>{record.text}</p> : null}
                </li>
              ))}
            </ul>
            {records.length > 5 ? (
              <p className="pcp-card__records-more">기록 {records.length - 5}개 더 — 지도에서 전체 보기</p>
            ) : null}
          </section>
        ) : null}

        <footer className="pcp-card__foot">
          {mapTitle ? (
            <span className="pcp-card__mapname">
              <MapPin size={13} strokeWidth={2.2} aria-hidden="true" />
              {mapTitle}
            </span>
          ) : <span />}
          <button type="button" className="pcp-card__open" onClick={onOpenOnMap}>
            지도에서 보기
          </button>
        </footer>
      </article>
    </div>
  )
}
