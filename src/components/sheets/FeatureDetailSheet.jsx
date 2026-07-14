import { useMemo, useState } from "react"
import { CalendarDays, Edit3, FileText, MapPin, Plus, Route, Shapes, X } from "lucide-react"
import { BottomSheet } from "../ui"
import { FeatureEmoji } from "../FeatureEmoji"
import { DiaryBanner } from "../visuals/DiaryBanner"
import { RecordEntrySheet } from "./RecordEntrySheet"
import { createId } from "../../lib/appUtils"
import { buildFeatureRecordGroups, summarizeRecordGroup } from "../../lib/featureRecordGroups"

const DAY_OF_WEEK_KO = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"]

function photoSrc(photo) {
  return photo?.url || photo?.thumbnail || photo?.src || photo?.cloudUrl || ""
}

function groupToDiaryEntry(group, todayIso) {
  let d = new Date(group.dateValue || Date.now())
  if (!Number.isFinite(d.getTime())) d = new Date()
  const date = `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`
  const dateKey = Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : ""
  const memo = group.memos
    .map((item) => `${item?.text || ""}`.trim())
    .filter(Boolean)
    .join("\n\n")

  return {
    isToday: dateKey === todayIso,
    date,
    day: DAY_OF_WEEK_KO[d.getDay()],
    photos: group.photos.map((item) => ({ ...item, src: photoSrc(item) })),
    memo,
  }
}

function uniqueMedia(items = []) {
  const seen = new Set()
  const next = []
  for (const item of items) {
    const key = item?.id || item?.localId || item?.url || item?.storagePath
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    next.push(item)
  }
  return next
}

function routeLengthKm(points) {
  if (!Array.isArray(points) || points.length < 2) return null
  const toRad = (deg) => (deg * Math.PI) / 180
  let km = 0
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]
    const b = points[i]
    const lat1 = Number(a?.lat ?? a?.[1] ?? a?.y)
    const lng1 = Number(a?.lng ?? a?.[0] ?? a?.x)
    const lat2 = Number(b?.lat ?? b?.[1] ?? b?.y)
    const lng2 = Number(b?.lng ?? b?.[0] ?? b?.x)
    if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) continue
    const dLat = toRad(lat2 - lat1)
    const dLng = toRad(lng2 - lng1)
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
    km += 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)))
  }
  return km > 0 ? km : null
}

function polygonAreaSqm(points) {
  if (!Array.isArray(points) || points.length < 3) return null
  const coords = points
    .map((point) => [Number(point?.lat ?? point?.[1] ?? point?.y), Number(point?.lng ?? point?.[0] ?? point?.x)])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng))
  if (coords.length < 3) return null
  const latMean = coords.reduce((sum, [lat]) => sum + lat, 0) / coords.length
  const metersPerDegLat = 111320
  const metersPerDegLng = 111320 * Math.cos((latMean * Math.PI) / 180)
  let area2 = 0
  for (let i = 0; i < coords.length; i += 1) {
    const [lat1, lng1] = coords[i]
    const [lat2, lng2] = coords[(i + 1) % coords.length]
    area2 += (lng1 * metersPerDegLng) * (lat2 * metersPerDegLat) - (lng2 * metersPerDegLng) * (lat1 * metersPerDegLat)
  }
  return Math.abs(area2) / 2
}

function formatKm(km) {
  if (!Number.isFinite(km) || km <= 0) return null
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

function formatSqm(sqm) {
  if (!Number.isFinite(sqm) || sqm <= 0) return null
  if (sqm >= 1_000_000) return `${(sqm / 1_000_000).toFixed(2)} km²`
  return `${Math.round(sqm).toLocaleString("ko-KR")} m²`
}

function typeCopy(type) {
  if (type === "route") return { label: "길", title: "길 상세", Icon: Route }
  if (type === "area") return { label: "영역", title: "영역 상세", Icon: Shapes }
  return { label: "장소", title: "장소 상세", Icon: MapPin }
}

function FeatureMetric({ feature }) {
  if (feature.type === "route") {
    const km = routeLengthKm(feature.points)
    const label = formatKm(km)
    const minutes = km ? Math.max(1, Math.round((km / 4) * 60)) : null
    return label ? <span>{label}{minutes ? ` · 도보 ${minutes}분` : ""}</span> : <span>길 포인트 {feature.points?.length || 0}개</span>
  }
  if (feature.type === "area") {
    const label = formatSqm(polygonAreaSqm(feature.points))
    return <span>{label || `영역 포인트 ${feature.points?.length || 0}개`}</span>
  }
  if (feature.address) return <span>{feature.address}</span>
  if (Number.isFinite(feature.lat) && Number.isFinite(feature.lng) && (feature.lat !== 0 || feature.lng !== 0)) {
    return <span>{feature.lat.toFixed(5)}, {feature.lng.toFixed(5)}</span>
  }
  return <span>위치 정보 없음</span>
}

export function FeatureDetailSheet({
  featureSheet,
  activeMapSource,
  readOnly = false,
  currentUserId = "me",
  onClose,
  onEdit,
  photoInputRef,
  onPhotoSelected,
  onDeletePhoto,
  onAddMemo,
  onUpdateMemo,
  onRequestCommunityUpdate,
}) {
  const [recordOpen, setRecordOpen] = useState(false)
  const [activeRecord, setActiveRecord] = useState(null)
  const [requestingEdit, setRequestingEdit] = useState(false)
  const [requestMessage, setRequestMessage] = useState("")
  const feature = featureSheet
  const isCommunity = activeMapSource === "community"
  const isPublicCommunityRecord = feature?.sourceContext === "public_community_records"
  const canEdit = !readOnly && (activeMapSource === "local" || (isCommunity && feature?.createdBy === currentUserId))
  const canRequestEdit = isCommunity && !readOnly && !isPublicCommunityRecord && !canEdit && typeof onRequestCommunityUpdate === "function"

  const recordGroups = useMemo(() => {
    if (!feature) return []
    return buildFeatureRecordGroups(feature)
  }, [feature])

  if (!feature) return null

  const todayIso = new Date().toISOString().slice(0, 10)
  const todayGroups = recordGroups.filter((group) => {
    const d = new Date(group.dateValue || 0)
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === todayIso
  })
  const pastGroups = recordGroups.filter((group) => !todayGroups.includes(group))
  const totalRecords = recordGroups.length
  const copy = typeCopy(feature.type)
  const TypeIcon = copy.Icon
  const tags = Array.isArray(feature.tags) ? feature.tags : []

  const handleRequestEdit = async () => {
    const ok = await onRequestCommunityUpdate?.(requestMessage)
    if (ok) {
      setRequestingEdit(false)
      setRequestMessage("")
    }
  }

  const openNewRecord = () => {
    setActiveRecord({
      id: createId("record"),
      mode: "create",
      memoId: null,
      initialText: "",
      groupId: null,
    })
    setRecordOpen(true)
  }

  const openEditRecord = (group) => {
    const summary = summarizeRecordGroup(group)
    const memo = group.memos?.[0] || null
    setActiveRecord({
      id: group.recordId || group.id,
      mode: "edit",
      memoId: memo?.id || null,
      initialText: summary.text || "",
      groupId: group.id,
    })
    setRecordOpen(true)
  }

  const getActiveRecordGroups = () => {
    if (!activeRecord) return []
    return recordGroups.filter((group) => (
      group.recordId === activeRecord.id
      || group.id === activeRecord.id
      || group.id === activeRecord.groupId
    ))
  }

  const activeRecordGroups = getActiveRecordGroups()
  const activeRecordPhotos = uniqueMedia(activeRecordGroups.flatMap((group) => group.photos || []))

  const closeRecordSheet = ({ saved = false } = {}) => {
    if (!saved && activeRecord?.mode === "create") {
      activeRecordPhotos.forEach((photo) => {
        const id = photo.id || photo.localId
        if (id) onDeletePhoto?.(id, { skipConfirm: true })
      })
    }
    setRecordOpen(false)
    setActiveRecord(null)
  }

  const saveRecord = async (text, meta = {}) => {
    if (!feature?.id || !activeRecord) return
    const recordId = meta.recordId || activeRecord.id
    if (activeRecord.mode === "edit" && activeRecord.memoId) {
      await onUpdateMemo?.(feature.id, activeRecord.memoId, text, { recordId })
      return
    }
    if (text?.trim()) {
      await onAddMemo?.(feature.id, text, [], { recordId })
    }
  }

  const renderRecordGroup = (group) => (
    <div key={group.id} className="fd-detail__record-entry">
      <DiaryBanner entry={groupToDiaryEntry(group, todayIso)} />
      {canEdit ? (
        <button type="button" className="fd-detail__record-edit" onClick={() => openEditRecord(group)}>
          <Edit3 size={12} /> 수정
        </button>
      ) : null}
    </div>
  )

  return (
    <>
      <BottomSheet
        open={Boolean(feature)}
        title={copy.title}
        subtitle={isCommunity && feature.createdByName ? `작성자 · ${feature.createdByName}` : undefined}
        onClose={onClose}
        fullscreen
      >
        <div className="fd fd--v2 fd-detail">
          <section className={`fd-detail__hero fd-detail__hero--${feature.type || "pin"}`}>
            <div className="fd-detail__type">
              <span><TypeIcon size={13} /> {copy.label}</span>
              <FeatureMetric feature={feature} />
            </div>

            <div className="fd-detail__main">
              <div className="fd-detail__icon">
                {feature.type === "pin" ? (
                  <FeatureEmoji feature={feature} size={38} unicodeFontSize={28} />
                ) : (
                  <TypeIcon size={28} />
                )}
              </div>
              <div className="fd-detail__title-block">
                <h3>{feature.title || copy.label}</h3>
                {feature.note ? <p>{feature.note}</p> : <p className="fd-detail__empty-copy">아직 소개가 없어요.</p>}
              </div>
            </div>

            {tags.length > 0 ? (
              <div className="fd-detail__tags">
                {tags.map((tag) => <span key={tag}>#{tag}</span>)}
              </div>
            ) : null}

            <div className="fd-detail__actions">
              {canEdit ? (
                <button type="button" className="fd-detail__action fd-detail__action--primary" onClick={openNewRecord}>
                  <Plus size={15} /> 오늘 기록
                </button>
              ) : null}
              {canEdit && onEdit ? (
                <button type="button" className="fd-detail__action" onClick={onEdit}>
                  <Edit3 size={14} /> 편집
                </button>
              ) : null}
              {canRequestEdit ? (
                <button type="button" className="fd-detail__action" onClick={() => setRequestingEdit((value) => !value)}>
                  <Edit3 size={14} /> 수정 제안
                </button>
              ) : null}
            </div>

            {requestingEdit ? (
              <div className="fd-detail__request">
                <textarea
                  value={requestMessage}
                  onChange={(event) => setRequestMessage(event.target.value)}
                  placeholder="수정이 필요한 이유를 간단히 적어주세요."
                  rows={3}
                />
                <div>
                  <button type="button" onClick={() => { setRequestingEdit(false); setRequestMessage("") }}>취소</button>
                  <button type="button" onClick={handleRequestEdit}>보내기</button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="fd-detail__records">
            <header className="fd-detail__section-head">
              <div>
                <span><CalendarDays size={13} /> 기록</span>
                <strong>{totalRecords > 0 ? `${totalRecords}개의 흔적` : "아직 기록 없음"}</strong>
              </div>
              {canEdit ? (
                <button type="button" onClick={openNewRecord}>
                  <Plus size={13} /> 추가
                </button>
              ) : null}
            </header>

            {totalRecords === 0 ? (
              <div className="fd-detail__empty">
                <FileText size={24} />
                <strong>첫 기록을 남겨보세요</strong>
                <p>사진과 메모를 한 번에 묶어 이 장소의 기억으로 저장할 수 있어요.</p>
              </div>
            ) : (
              <div className="fd-detail__diary">
                {todayGroups.length > 0 ? (
                  <div className="fd-detail__diary-group">
                    <span className="fd-detail__diary-label">오늘 기록 {todayGroups.length}</span>
                    {todayGroups.map(renderRecordGroup)}
                  </div>
                ) : null}

                {pastGroups.length > 0 ? (
                  <div className="fd-detail__diary-group">
                    <span className="fd-detail__diary-label">지난 기록 {pastGroups.length}</span>
                    <ol className="fd-detail__timeline">
                      {pastGroups.map((group) => (
                        <li key={group.id}>
                          <span aria-hidden="true" />
                          {renderRecordGroup(group)}
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </BottomSheet>

      <RecordEntrySheet
        open={recordOpen}
        featureTitle={feature.title || copy.label}
        recordId={activeRecord?.id || ""}
        mode={activeRecord?.mode || "create"}
        initialText={activeRecord?.initialText || ""}
        saveLabel={activeRecord?.mode === "edit" ? "수정 저장" : undefined}
        onClose={closeRecordSheet}
        onSave={saveRecord}
        photos={activeRecordPhotos}
        onPhotoSelected={onPhotoSelected}
        onDeletePhoto={onDeletePhoto}
        photoInputRef={photoInputRef}
      />
    </>
  )
}
