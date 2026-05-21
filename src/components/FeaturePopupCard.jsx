import { useMemo } from "react"
import { Bookmark, Check, ChevronRight, Edit3, FileText, Flag, MapPin, Mic, Plus, Route, Shapes, X } from "lucide-react"
import { FeatureEmoji } from "./FeatureEmoji"

const EMPTY_LIST = []

function formatDate(value) {
  if (!value) return ""
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) return ""
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric" })
}

function photoSrc(photo) {
  return photo?.url || photo?.thumbnail || photo?.src || photo?.cloudUrl || ""
}

function typeCopy(type) {
  if (type === "route") return { label: "길", Icon: Route }
  if (type === "area") return { label: "영역", Icon: Shapes }
  return { label: "장소", Icon: MapPin }
}

function latestDate(feature) {
  const dates = [
    ...(feature?.memos || []).map((item) => item.date || item.createdAt),
    ...(feature?.photos || []).map((item) => item.date || item.createdAt),
    ...(feature?.voices || []).map((item) => item.date || item.createdAt),
  ]
    .map((value) => new Date(value || 0).getTime())
    .filter(Number.isFinite)
  if (dates.length === 0) return ""
  return formatDate(Math.max(...dates))
}

export function FeaturePopupCard({
  feature,
  mapMode = "community",
  isAuthor = false,
  routeLengthKm = null,
  imported = false,
  onClose,
  onOpenDetail,
  onEdit,
  onRequestEdit,
  onImport,
  onUnimport,
  onAddRecord,
  busyImport = false,
}) {
  const type = feature?.type || "pin"
  const copy = typeCopy(type)
  const TypeIcon = copy.Icon
  const tags = Array.isArray(feature?.tags) ? feature.tags : []
  const photos = Array.isArray(feature?.photos) ? feature.photos : []
  const voices = Array.isArray(feature?.voices) ? feature.voices : []
  const memos = Array.isArray(feature?.memos) ? feature.memos : EMPTY_LIST
  const recordCount = photos.length + voices.length + memos.length
  const latestMemo = useMemo(() => (
    memos
      .slice()
      .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0))[0] || null
  ), [memos])

  if (!feature) return null

  const metric = type === "route" && Number.isFinite(routeLengthKm) && routeLengthKm > 0
    ? `${routeLengthKm < 1 ? `${Math.round(routeLengthKm * 1000)} m` : `${routeLengthKm.toFixed(1)} km`}`
    : `${recordCount}개 기록`
  const canWriteRecord = mapMode === "personal" && isAuthor && typeof onAddRecord === "function"

  return (
    <article className={`fpc fpc--diary fpc--${type}`} role="dialog" aria-label={`${feature.title || copy.label} 미리보기`}>
      <header className="fpc-diary-head">
        <div className="fpc-diary-type">
          <span className={`fpc-diary-icon fpc-diary-icon--${type}`}>
            {type === "pin" ? <FeatureEmoji feature={feature} size={24} unicodeFontSize={18} /> : <TypeIcon size={18} />}
          </span>
          <div>
            <span>{copy.label}</span>
            <strong>{feature.title || copy.label}</strong>
          </div>
        </div>

        <div className="fpc-diary-actions">
          {mapMode === "community" && (onImport || onUnimport) ? (
            imported ? (
              <button type="button" className="fpc-diary-small is-saved" onClick={onUnimport} disabled={busyImport}>
                <Check size={12} /> 저장됨
              </button>
            ) : (
              <button type="button" className="fpc-diary-small" onClick={onImport} disabled={busyImport}>
                <Bookmark size={12} /> 가져오기
              </button>
            )
          ) : null}
          {mapMode === "community" && isAuthor && onEdit ? (
            <button type="button" className="fpc-diary-icon-btn" onClick={onEdit} aria-label="편집">
              <Edit3 size={14} />
            </button>
          ) : null}
          {mapMode === "community" && !isAuthor && onRequestEdit ? (
            <button type="button" className="fpc-diary-icon-btn" onClick={onRequestEdit} aria-label="수정 제안">
              <Flag size={14} />
            </button>
          ) : null}
          {onClose ? (
            <button type="button" className="fpc-diary-icon-btn" onClick={onClose} aria-label="닫기">
              <X size={14} />
            </button>
          ) : null}
        </div>
      </header>

      <div className="fpc-diary-body">
        <div className="fpc-diary-meta">
          <span>{metric}</span>
          {latestDate(feature) ? <span>최근 {latestDate(feature)}</span> : null}
        </div>

        {feature.note ? <p className="fpc-diary-desc">{feature.note}</p> : null}

        {tags.length > 0 ? (
          <div className="fpc-diary-tags">
            {tags.slice(0, 4).map((tag) => <span key={tag}>#{tag}</span>)}
          </div>
        ) : null}

        {(photos.length > 0 || voices.length > 0 || latestMemo) ? (
          <div className="fpc-diary-record">
            {photos.length > 0 ? (
              <div className="fpc-diary-photos">
                {photos.slice(0, 3).map((photo, index) => (
                  <span key={photo.id || photo.localId || `photo-${index}`}>
                    {photoSrc(photo) ? <img src={photoSrc(photo)} alt="" /> : null}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="fpc-diary-record-copy">
              <span>
                {voices.length > 0 ? <><Mic size={12} /> 음성 {voices.length}</> : <><FileText size={12} /> 최근 기록</>}
              </span>
              <strong>{latestMemo?.text || (photos.length > 0 ? "사진으로 남긴 기록이 있어요." : "기록을 이어서 확인해 보세요.")}</strong>
            </div>
          </div>
        ) : (
          <div className="fpc-diary-empty">
            <FileText size={15} />
            <span>아직 기록이 없어요.</span>
          </div>
        )}
      </div>

      <footer className="fpc-diary-foot">
        {canWriteRecord ? (
          <button type="button" className="fpc-diary-cta fpc-diary-cta--record" onClick={onAddRecord}>
            <Plus size={15} /> 오늘 기록
          </button>
        ) : null}
        {onOpenDetail ? (
          <button type="button" className="fpc-diary-cta" onClick={onOpenDetail}>
            상세 보기 <ChevronRight size={15} />
          </button>
        ) : null}
      </footer>
    </article>
  )
}
