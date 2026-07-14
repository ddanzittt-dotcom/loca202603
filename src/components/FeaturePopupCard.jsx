import { useMemo, useState } from "react"
import { Bookmark, Check, Edit3, FileText, Flag, MapPin, MapPinOff, Plus, Route, Shapes, Trash2, X } from "lucide-react"
import { FeatureEmoji, resolveFeatureEmoji } from "./FeatureEmoji"
import { PhotoViewer } from "./visuals/PhotoViewer"
import { useResolvedMediaUrl } from "../hooks/useResolvedMediaUrl"
import { categoryToEmoji } from "../data/pinIcons"
import { buildFeatureRecordGroups, formatRecordDate, summarizeRecordGroup } from "../lib/featureRecordGroups"

const EMPTY_LIST = []

function PopupPhotoThumb({ photo, onOpen }) {
  const { src, markRemoteFailed } = useResolvedMediaUrl(photo)
  return (
    <button
      type="button"
      className="fpc-diary-photo-thumb"
      onClick={(event) => {
        event.stopPropagation()
        onOpen?.()
      }}
      aria-label="사진 보기"
    >
      {src ? <img src={src} alt="" onError={markRemoteFailed} /> : null}
    </button>
  )
}

function typeCopy(type) {
  if (type === "route") return { label: "길", Icon: Route }
  if (type === "area") return { label: "영역", Icon: Shapes }
  return { label: "장소", Icon: MapPin }
}

function isPinLikeEmoji(emoji) {
  return emoji === "📍" || emoji === "📌"
}

function getFeaturePopupEmoji(feature) {
  const descriptor = resolveFeatureEmoji(feature)
  if (descriptor.kind !== "unicode") return descriptor

  const emoji = typeof descriptor.value === "string" ? descriptor.value.trim() : ""
  if (emoji && !isPinLikeEmoji(emoji)) return descriptor

  const category = typeof feature?.category === "string" ? feature.category.trim() : ""
  const categoryEmoji = category ? categoryToEmoji(category) : ""
  if (categoryEmoji && !isPinLikeEmoji(categoryEmoji)) {
    return { kind: "unicode", value: categoryEmoji }
  }

  return { kind: "unicode", value: "✨" }
}

function isToday(value) {
  if (!value) return false
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) return false
  return d.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)
}

function RecordMediaPreview({ group, onPhotoOpen }) {
  if (group.photos.length > 0) {
    return (
      <span className="fpc-diary-record-media fpc-diary-record-media--photos">
        {group.photos.slice(0, 2).map((photo, index) => (
          <PopupPhotoThumb
            key={photo.id || photo.localId || photo.url || `photo-${index}`}
            photo={photo}
            onOpen={() => onPhotoOpen?.(group.photos, index)}
          />
        ))}
        {group.photos.length > 2 ? (
          <button
            type="button"
            className="fpc-diary-photo-more"
            onClick={(event) => {
              event.stopPropagation()
              onPhotoOpen?.(group.photos, 2)
            }}
            aria-label={`추가 사진 ${group.photos.length - 2}장 보기`}
          >
            +{group.photos.length - 2}
          </button>
        ) : null}
      </span>
    )
  }

  return (
    <span className="fpc-diary-record-media">
      <FileText size={15} />
    </span>
  )
}

function RecordGroupItem({ group, onPhotoOpen, onOpenRecord, panel = false }) {
  const summary = summarizeRecordGroup(group)
  const title = isToday(group.dateValue) ? "오늘 기록" : (formatRecordDate(group.dateValue) || "기록")
  const primaryText = summary.text || summary.assetLabel || "기록을 남겼어요."
  const showAssetLabel = Boolean(summary.assetLabel && summary.text)

  return (
    <div
      className={`fpc-diary-record-item fpc-diary-record-item--bundle${panel ? " fpc-diary-record-item--panel" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpenRecord?.(group)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onOpenRecord?.(group)
        }
      }}
    >
      <RecordMediaPreview
        group={group}
        onPhotoOpen={onPhotoOpen}
      />
      <span className="fpc-diary-record-copy">
        <span>{title}</span>
        <strong>{primaryText}</strong>
        {showAssetLabel ? <em>{summary.assetLabel}</em> : null}
      </span>
    </div>
  )
}

function RecordDetailCard({
  group,
  featureTitle,
  canEdit = false,
  onClose,
  onEdit,
  onDelete,
  onPhotoOpen,
}) {
  if (!group) return null
  const summary = summarizeRecordGroup(group)
  const title = isToday(group.dateValue) ? "오늘 기록" : (formatRecordDate(group.dateValue) || "기록")
  const memoText = summary.text || ""

  return (
    <div className="fpc-record-detail-layer">
      <button type="button" className="fpc-record-detail__scrim" onClick={onClose} aria-label="기록 닫기" />
      <section className="fpc-record-detail" role="dialog" aria-modal="true" aria-label={`${featureTitle || "장소"} 기록`}>
        <header className="fpc-record-detail__head">
          <div>
            <span>{title}</span>
            <strong>{featureTitle || "기록"}</strong>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기">
            <X size={15} />
          </button>
        </header>

        <div className="fpc-record-detail__body">
          {memoText ? (
            <p className="fpc-record-detail__memo">{memoText}</p>
          ) : (
            <p className="fpc-record-detail__empty">메모 없이 남긴 기록이에요.</p>
          )}

          {group.photos.length > 0 ? (
            <div className="fpc-record-detail__section">
              <span>사진 {group.photos.length}</span>
              <div className="fpc-record-detail__photos">
                {group.photos.map((photo, index) => (
                  <PopupPhotoThumb
                    key={photo.id || photo.localId || photo.url || `detail-photo-${index}`}
                    photo={photo}
                    onOpen={() => onPhotoOpen?.(group.photos, index)}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {canEdit ? (
          <footer className="fpc-record-detail__actions">
            {onDelete ? (
              <button type="button" className="fpc-record-detail__danger" onClick={() => onDelete(group)}>
                <Trash2 size={13} /> 삭제
              </button>
            ) : null}
            {onEdit ? (
              <button type="button" className="fpc-record-detail__primary" onClick={() => onEdit(group)}>
                <Edit3 size={13} /> 수정
              </button>
            ) : null}
          </footer>
        ) : null}
      </section>
    </div>
  )
}

export function FeaturePopupCard({
  feature,
  mapMode = "community",
  isAuthor = false,
  routeLengthKm = null,
  imported = false,
  onClose,
  onEdit,
  onRequestEdit,
  onImport,
  onUnimport,
  onAddRecord,
  onEditRecord,
  onDeleteRecord,
  onRemoveFromMap,
  busyImport = false,
}) {
  const [recordsBannerFeatureId, setRecordsBannerFeatureId] = useState(null)
  const [photoViewer, setPhotoViewer] = useState(null)
  const [recordDetailGroup, setRecordDetailGroup] = useState(null)
  const type = feature?.type || "pin"
  const copy = typeCopy(type)
  const TypeIcon = copy.Icon
  const tags = Array.isArray(feature?.tags) ? feature.tags : []
  const recordGroups = useMemo(() => buildFeatureRecordGroups(feature), [feature])
  const visibleRecords = recordGroups.slice(0, 2)
  const hasMoreRecords = recordGroups.length > 2
  const recordsBannerOpen = Boolean(feature?.id && recordsBannerFeatureId === feature.id)

  if (!feature) return null

  const metric = type === "route" && Number.isFinite(routeLengthKm) && routeLengthKm > 0
    ? `${routeLengthKm < 1 ? `${Math.round(routeLengthKm * 1000)} m` : `${routeLengthKm.toFixed(1)} km`}`
    : `${recordGroups.length}개 기록`
  const latestRecordLabel = recordGroups[0]?.dateValue ? formatRecordDate(recordGroups[0].dateValue) : ""
  const canWriteRecord = mapMode === "personal" && isAuthor && typeof onAddRecord === "function"
  const canManageRecord = mapMode === "personal" && isAuthor && (typeof onEditRecord === "function" || typeof onDeleteRecord === "function")
  const popupEmoji = getFeaturePopupEmoji(feature)

  const openPhotoViewer = (photos, index = 0) => {
    setPhotoViewer({ photos: Array.isArray(photos) ? photos : [], index })
  }
  const openRecordDetail = (group) => setRecordDetailGroup(group)
  const editRecord = (group) => {
    setRecordDetailGroup(null)
    setRecordsBannerFeatureId(null)
    onEditRecord?.(group)
  }
  const deleteRecord = (group) => {
    setRecordDetailGroup(null)
    setRecordsBannerFeatureId(null)
    onDeleteRecord?.(group)
  }

  return (
    <>
    <article className={`fpc fpc--diary fpc--${type}`} role="dialog" aria-label={`${feature.title || copy.label} 미리보기`}>
      <header className="fpc-diary-head">
        <div className="fpc-diary-type">
          <span className={`fpc-diary-icon fpc-diary-icon--${type}`}>
            {type === "pin" ? (
              <FeatureEmoji emoji={popupEmoji} size={28} unicodeFontSize={22} className="fpc-diary-feature-emoji" />
            ) : (
              <TypeIcon size={18} />
            )}
          </span>
          <div>
            <span>{copy.label}</span>
            <strong>{feature.title || copy.label}</strong>
          </div>
        </div>

        <div className="fpc-diary-actions">
          {onEdit ? (
            <button type="button" className="fpc-diary-edit-banner" onClick={onEdit}>
              <Edit3 size={13} /> 편집
            </button>
          ) : null}
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
          {latestRecordLabel ? <span>최근 {latestRecordLabel}</span> : null}
        </div>

        {feature.note ? <p className="fpc-diary-desc">{feature.note}</p> : null}

        {tags.length > 0 ? (
          <div className="fpc-diary-tags">
            {tags.slice(0, 4).map((tag) => <span key={tag}>#{tag}</span>)}
          </div>
        ) : null}

        {recordGroups.length > 0 ? (
          <div className="fpc-diary-records">
            <div className="fpc-diary-records-head">
              <span className="fpc-diary-records-label">기록</span>
              {hasMoreRecords ? (
                <button type="button" className="fpc-diary-more-link" onClick={() => setRecordsBannerFeatureId(feature.id)}>
                  더보기
                </button>
              ) : null}
            </div>
            {visibleRecords.map((group) => (
              <RecordGroupItem
                key={group.id}
                group={group}
                onPhotoOpen={openPhotoViewer}
                onOpenRecord={openRecordDetail}
              />
            ))}
          </div>
        ) : (
          <div className="fpc-diary-empty">
            <FileText size={15} />
            <span>아직 기록이 없어요</span>
          </div>
        )}
      </div>

      {(canWriteRecord || typeof onRemoveFromMap === "function") ? (
        <footer className="fpc-diary-foot">
          {canWriteRecord ? (
            <button type="button" className="fpc-diary-cta fpc-diary-cta--record" onClick={onAddRecord}>
              <Plus size={15} /> 오늘 기록
            </button>
          ) : null}
          {typeof onRemoveFromMap === "function" ? (
            <button type="button" className="fpc-diary-cta fpc-diary-cta--remove" onClick={onRemoveFromMap}>
              <MapPinOff size={15} /> 지도에서 빼기
            </button>
          ) : null}
        </footer>
      ) : null}
    </article>
    {recordsBannerOpen ? (
      <div className="fpc-record-banner-layer">
        <button
          type="button"
          className="fpc-record-banner__scrim"
          onClick={() => setRecordsBannerFeatureId(null)}
          aria-label="기록 전체 보기 닫기"
        />
        <section className="fpc-record-banner" role="dialog" aria-modal="true" aria-label={`${feature.title || copy.label} 기록 전체 보기`}>
          <header className="fpc-record-banner__head">
            <div>
              <span>기록</span>
              <strong>{feature.title || copy.label}</strong>
            </div>
            <button type="button" onClick={() => setRecordsBannerFeatureId(null)} aria-label="닫기">
              <X size={15} />
            </button>
          </header>
          <div className="fpc-record-banner__list">
            {recordGroups.map((group) => (
              <RecordGroupItem
                key={group.id}
                group={group}
                panel
                onPhotoOpen={openPhotoViewer}
                onOpenRecord={openRecordDetail}
              />
            ))}
          </div>
        </section>
      </div>
    ) : null}
    <RecordDetailCard
      group={recordDetailGroup}
      featureTitle={feature.title || copy.label}
      canEdit={canManageRecord}
      onClose={() => setRecordDetailGroup(null)}
      onEdit={typeof onEditRecord === "function" ? editRecord : null}
      onDelete={typeof onDeleteRecord === "function" ? deleteRecord : null}
      onPhotoOpen={openPhotoViewer}
    />
    <PhotoViewer
      open={Boolean(photoViewer?.photos?.length)}
      photos={photoViewer?.photos || EMPTY_LIST}
      initialIndex={photoViewer?.index || 0}
      onClose={() => setPhotoViewer(null)}
    />
    </>
  )
}
