import { useEffect, useRef, useState } from "react"
import { X as XIcon, Camera, FileText } from "lucide-react"
import { FeatureEmojiPicker } from "../FeatureEmojiPicker"
import { FeatureEmoji, resolveFeatureEmoji, descriptorToDisplayText } from "../FeatureEmoji"
import { RecordEntrySheet } from "./RecordEntrySheet"
import { useResolvedMediaUrl } from "../../hooks/useResolvedMediaUrl"
import { lookupEmojiName } from "../../lib/emojiCatalog"
import {
  FEATURE_LINE_STYLE_ITEMS,
  FEATURE_LINE_STYLE_SOLID,
  FEATURE_LINE_STYLE_SHORT_DASH,
  FEATURE_LINE_STYLE_SHORT_DOT,
  getFeatureColorPresets,
  normalizeFeatureStyle,
} from "../../lib/featureStyle"

/*
 * FeatureEditSheet — 장소 · 길 · 영역 편집 바텀시트 (작성자 편집 전용).
 *
 * 시안: design/2.loca_place_card_proposal_v5.html
 * 브리프: design/2.CLAUDE_CODE_BRIEF_PLACE_CARD.md
 *
 * 분기:
 *   type    : "pin" | "route" | "area"
 *   mapMode : "personal" | "community"   (내 지도 / 모두의 지도)
 *
 * 비작성자 열람 모드는 이 레이어에 없음 — 팝업 카드(v8)가 담당.
 *
 * 기존 useFeatureEditing 훅의 save/delete/addMemo 핸들러를 그대로 재사용한다.
 */

const DEFAULT_EMOJI_BY_TYPE = {
  pin: "📍",
  route: "🛣️",
  area: "🟩",
}

// 태그 칩 액센트 톤 3종 — 시안의 warm/mint/amber 순환
const TAG_TONES = ["", "mint", "amber"]
function tagToneByIndex(idx) { return TAG_TONES[idx % TAG_TONES.length] }

const LEGACY_ROUTE_DEFAULT_TITLE = `새 ${"\uACBD\uB85C"}`
// 지도 기본 이름 ("새 장소" 등) 탐지 — 빈 상태 UI 분기용
const DEFAULT_TITLE_TOKENS = new Set(["", "새 장소", "새 길", "새 영역", LEGACY_ROUTE_DEFAULT_TITLE])
function isCreatingState(feature) {
  const t = (feature?.title || "").trim()
  return DEFAULT_TITLE_TOKENS.has(t)
}

// 길 길이 (km) — haversine 합산
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.min(1, Math.sqrt(s)))
}
function pickLatLng(pt) {
  const lat = Number(pt?.lat ?? pt?.[1] ?? pt?.y)
  const lng = Number(pt?.lng ?? pt?.[0] ?? pt?.x)
  return [lat, lng]
}
function routeLengthKm(points) {
  if (!Array.isArray(points) || points.length < 2) return null
  let km = 0
  for (let i = 1; i < points.length; i += 1) {
    const [lat1, lng1] = pickLatLng(points[i - 1])
    const [lat2, lng2] = pickLatLng(points[i])
    if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) continue
    km += haversineKm(lat1, lng1, lat2, lng2)
  }
  return km > 0 ? km : null
}

// 폴리곤 면적 (㎡) — shoelace + 위도 보정. 대략값이므로 '약 12,400㎡' 표기 사용.
function polygonAreaSqm(points) {
  if (!Array.isArray(points) || points.length < 3) return null
  const coords = points.map(pickLatLng).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng))
  if (coords.length < 3) return null
  const latMean = coords.reduce((sum, [lat]) => sum + lat, 0) / coords.length
  const metersPerDegLat = 111320
  const metersPerDegLng = 111320 * Math.cos((latMean * Math.PI) / 180)
  let area2 = 0
  for (let i = 0; i < coords.length; i += 1) {
    const [lat1, lng1] = coords[i]
    const [lat2, lng2] = coords[(i + 1) % coords.length]
    const x1 = lng1 * metersPerDegLng
    const y1 = lat1 * metersPerDegLat
    const x2 = lng2 * metersPerDegLng
    const y2 = lat2 * metersPerDegLat
    area2 += x1 * y2 - x2 * y1
  }
  return Math.abs(area2) / 2
}

// 대략 도보 시간 (분) — 보수적으로 4km/h 기준.
function walkingMinutes(km) {
  if (!Number.isFinite(km) || km <= 0) return null
  return Math.max(1, Math.round((km / 4) * 60))
}

function formatKm(km) {
  if (!Number.isFinite(km) || km <= 0) return null
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

function formatSqm(sqm) {
  if (!Number.isFinite(sqm) || sqm <= 0) return null
  if (sqm >= 1_000_000) return `약 ${(sqm / 1_000_000).toFixed(2)}㎢`
  return `약 ${Math.round(sqm).toLocaleString("ko-KR")}㎡`
}

function formatMemoTimestamp(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date()
  if (Number.isNaN(d.getTime())) return ""
  const mm = `${d.getMonth() + 1}`.padStart(2, "0")
  const dd = `${d.getDate()}`.padStart(2, "0")
  const days = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"]
  const day = days[d.getDay()] || ""
  const hour = d.getHours()
  let slot = ""
  if (hour < 6) slot = "새벽"
  else if (hour < 12) slot = "오전"
  else if (hour < 18) slot = "오후"
  else slot = "저녁"
  return `${mm}.${dd} · ${day} ${slot}`
}

// ---------- 공통 필드 UI ----------

function FieldLabel({ children, hint, hintVariant = "inline" }) {
  return (
    <div className="fes-label">
      <span>{children}</span>
      {hint ? (
        <span className={`fes-hint${hintVariant === "bubble" ? " fes-hint--bubble" : ""}`}>
          {hintVariant === "bubble" ? hint : `· ${hint}`}
        </span>
      ) : null}
    </div>
  )
}

function LinePreviewSvg({ lineStyle }) {
  if (lineStyle === FEATURE_LINE_STYLE_SHORT_DOT) {
    return (
      <svg viewBox="0 0 28 10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="0.1 4">
        <line x1="2" y1="5" x2="26" y2="5" />
      </svg>
    )
  }
  if (lineStyle === FEATURE_LINE_STYLE_SHORT_DASH) {
    return (
      <svg viewBox="0 0 28 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 3">
        <line x1="2" y1="5" x2="26" y2="5" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 28 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="2" y1="5" x2="26" y2="5" />
    </svg>
  )
}

function LineStylePicker({ value, onChange, disabled = false }) {
  return (
    <div className="fes-line-row">
      {FEATURE_LINE_STYLE_ITEMS.map((item) => {
        const active = value === item.value
        return (
          <button
            key={item.value}
            type="button"
            className={`fes-line-btn${active ? " is-active" : ""}`}
            onClick={() => onChange(item.value)}
            aria-pressed={active}
            disabled={disabled}
          >
            <span className="fes-line-preview"><LinePreviewSvg lineStyle={item.value} /></span>
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

function ColorPicker({ type, value, onChange, disabled = false }) {
  const presets = getFeatureColorPresets(type)
  const selectedColor = String(value || presets[0] || "#0A5A46").toUpperCase()
  const typeLabel = type === "area" ? "영역" : "길"

  return (
    <div className="fes-color-row" role="group" aria-label={`${typeLabel} 색상`}>
      {presets.map((color) => {
        const normalizedColor = color.toUpperCase()
        const active = selectedColor === normalizedColor
        return (
          <button
            key={normalizedColor}
            type="button"
            className={`fes-color-chip${active ? " is-selected" : ""}`}
            style={{ backgroundColor: normalizedColor }}
            onClick={() => onChange(normalizedColor)}
            aria-label={`${typeLabel} 색상 ${normalizedColor}`}
            aria-pressed={active}
            disabled={disabled}
          />
        )
      })}
      <label className={`fes-color-chip-custom${disabled ? " is-disabled" : ""}`}>
        <span className="fes-swatch" style={{ backgroundColor: selectedColor }} aria-hidden="true" />
        직접
        <input
          type="color"
          value={selectedColor.toLowerCase()}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          aria-label={`${typeLabel} 색상 직접 선택`}
          disabled={disabled}
        />
      </label>
    </div>
  )
}

function TagInput({ tagsText, onChange }) {
  const [input, setInput] = useState("")
  const tags = (tagsText || "").split(",").map((t) => t.trim()).filter(Boolean)

  const addTag = (raw) => {
    const next = (raw || "").trim().replace(/^#/, "")
    if (!next || tags.includes(next)) { setInput(""); return }
    onChange([...tags, next].join(", "))
    setInput("")
  }
  const removeTag = (idx) => {
    onChange(tags.filter((_, i) => i !== idx).join(", "))
  }
  const handleKey = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      addTag(input)
    }
    if (e.key === "Backspace" && !input && tags.length > 0) removeTag(tags.length - 1)
  }

  return (
    <div className="fes-tag-field">
      {tags.map((tag, i) => {
        const tone = tagToneByIndex(i)
        return (
          <span key={`${tag}-${i}`} className={`fes-tag-chip${tone ? ` fes-tag-chip--${tone}` : ""}`}>
            #{tag}
            <button
              type="button"
              className="fes-tag-x"
              onClick={() => removeTag(i)}
              aria-label={`태그 ${tag} 삭제`}
            >
              <XIcon size={8} />
            </button>
          </span>
        )
      })}
      <input
        className="fes-tag-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => { if (input.trim()) addTag(input) }}
        placeholder={tags.length === 0 ? "#태그 입력 후 Enter" : "#태그 추가"}
      />
    </div>
  )
}

function MeasureInfo({ type, feature }) {
  if (type === "route") {
    const km = routeLengthKm(feature?.points)
    const kmLabel = formatKm(km)
    const mins = walkingMinutes(km)
    if (!kmLabel) return null
    return (
      <div className="fes-measure">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19L10 7L16 14L20 5" />
        </svg>
        <span>
          전체 길이 <strong>{kmLabel}</strong>
          {mins ? <> · 도보 약 {mins}분</> : null}
        </span>
      </div>
    )
  }
  if (type === "area") {
    const sqm = polygonAreaSqm(feature?.points)
    const label = formatSqm(sqm)
    if (!label) return null
    // 영역 이동 시간 — 반경 기반 근사
    const radiusKm = sqm ? Math.sqrt(sqm / Math.PI) / 1000 : 0
    const mins = walkingMinutes(radiusKm * 2) // 지름 기준 통과 시간
    return (
      <div className="fes-measure">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="3 2">
          <rect x="4" y="4" width="16" height="16" rx="3" />
        </svg>
        <span>
          영역 면적 <strong>{label}</strong>
          {mins ? <> · 도보 {mins}분 영역</> : null}
        </span>
      </div>
    )
  }
  return null
}

// ---------- 미디어 / 메모 블록 ----------

function FeaturePhotoThumb({ photo, canEdit, onDelete }) {
  const { src, markRemoteFailed } = useResolvedMediaUrl(photo)
  return (
    <div className="fes-photo-thumb">
      {src ? <img src={src} alt="" onError={markRemoteFailed} /> : null}
      {canEdit ? (
        <button
          type="button"
          className="fes-photo-rm"
          aria-label="사진 삭제"
          onClick={() => onDelete?.(photo.id || photo.localId)}
        >
          <XIcon size={8} />
        </button>
      ) : null}
    </div>
  )
}

function PhotoBlock({ photos, canEdit, onDelete }) {
  if (!photos?.length) return null
  return (
    <div className="fes-media">
      <div className="fes-media-head">
        <Camera size={11} />
        <span>사진</span>
        <span className="fes-count">{photos.length}</span>
      </div>
      <div className="fes-photo-grid">
        {photos.map((p, index) => (
          <FeaturePhotoThumb
            key={p.id || p.localId || `photo-${index}`}
            photo={p}
            canEdit={canEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}

function MemoBlock({ memos, canEdit, onDeleteMemo }) {
  if (!memos?.length) return null
  const ordered = [...memos].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
  const showRm = canEdit && typeof onDeleteMemo === "function"
  return (
    <div className="fes-media">
      <div className="fes-media-head">
        <FileText size={11} />
        <span>메모</span>
        <span className="fes-count">{memos.length}</span>
      </div>
      <div className="fes-memo-list">
        {ordered.map((m) => (
          <div key={m.id} className="fes-memo-entry">
            <div className="fes-memo-date">{formatMemoTimestamp(m.date)}</div>
            <div className="fes-memo-text">{m.text}</div>
            {showRm ? (
              <button
                type="button"
                className="fes-memo-rm"
                aria-label="메모 삭제"
                onClick={() => onDeleteMemo(m.id)}
              >
                <XIcon size={8} />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function AttachToolbar({ counts, onPhoto, onMemo, showHint }) {
  return (
    <div className="fes-attach">
      <button
        type="button"
        className="fes-attach-btn"
        title="사진 추가"
        aria-label="사진 추가"
        onClick={onPhoto}
      >
        <Camera size={16} />
        {counts.photos > 0 ? <span className="fes-attach-dot">{counts.photos}</span> : null}
      </button>
      <button
        type="button"
        className="fes-attach-btn"
        title="메모 추가"
        aria-label="메모 추가"
        onClick={onMemo}
      >
        <FileText size={16} />
        {counts.memos > 0 ? <span className="fes-attach-dot">{counts.memos}</span> : null}
      </button>
      {showHint ? <span className="fes-attach-hint">사진 · 메모 추가</span> : null}
    </div>
  )
}

// ---------- 메모 입력 시트 ----------

function MemoComposeSheet({ onClose, onSave }) {
  const [text, setText] = useState("")
  const disabled = !text.trim()
  return (
    <>
      <div className="fes-picker-backdrop" onClick={onClose} />
      <section className="fes-memo-sheet fes-memo-sheet--v2" role="dialog" aria-modal="true" aria-label="메모 추가">
        <div className="fes-handle" />
        <div className="fes-memo-sheet-head">
          <span className="fes-memo-sheet-title">메모 추가</span>
          <button type="button" className="fes-close" onClick={onClose} aria-label="닫기">
            <XIcon size={12} />
          </button>
        </div>
        <textarea
          className="fes-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="이번 방문에서 남기고 싶은 메모를 적어주세요."
          autoFocus
        />
        <div className="fes-action">
          <button type="button" className="fes-btn fes-btn--ghost" onClick={onClose}>취소</button>
          <button
            type="button"
            className="fes-btn fes-btn--primary"
            disabled={disabled}
            onClick={() => { if (!disabled) { onSave?.(text.trim()); onClose?.() } }}
          >
            저장
          </button>
        </div>
      </section>
    </>
  )
}

// ---------- 메인 컴포넌트 ----------

export function FeatureEditSheet({
  featureSheet,
  setFeatureSheet,
  mapMode = "personal",
  mapTitle = "",
  readOnly = false,
  cloudMode = false,
  userId = "",
  onClose,
  onSave,
  onDelete,
  onRelocatePin,
  // 미디어
  photoInputRef,
  onPhotoSelected,
  onDeletePhoto,
  // 메모
  onAddMemo,
  // onDeleteMemo prop 은 v2 에서 RecordEntrySheet 가 직접 호출하지 않으므로 미사용 (호환을 위해 받지 않음).
}) {
  const open = Boolean(featureSheet)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [memoSheetOpen, setMemoSheetOpen] = useState(false)
  // v2 (2026-05): B8 RecordEntrySheet — 메모+사진 통합 입력.
  // FeatureEditSheet 는 메타데이터만 다루고, 미디어/메모 입력은 이 시트로 분리.
  const [recordSheetOpen, setRecordSheetOpen] = useState(false)
  const nameInputRef = useRef(null)
  const focusNameSignal = featureSheet?._focusName ? featureSheet?.id || true : null

  // 빈 이름 row에서 진입한 경우, 시트 열릴 때 이름 input에 포커스하고 플래그를 한 번만 소비.
  useEffect(() => {
    if (!focusNameSignal) return
    const timer = setTimeout(() => {
      nameInputRef.current?.focus()
      nameInputRef.current?.select?.()
    }, 80)
    setFeatureSheet((current) => {
      if (!current?._focusName) return current
      const { _focusName, ...rest } = current
      return rest
    })
    return () => clearTimeout(timer)
  }, [focusNameSignal, setFeatureSheet])

  if (!open) return null

  const type = featureSheet.type || "pin"
  const isPersonal = mapMode === "personal"
  const isCommunity = mapMode === "community"
  const creating = isCreatingState(featureSheet)
  const style = normalizeFeatureStyle(featureSheet.style, type)

  const sheetTitle = type === "route" ? "길" : type === "area" ? "영역" : "장소"
  const metaLine = (() => {
    if (isCommunity) {
      const authorName = featureSheet.createdByName
      return authorName ? `작성자 · ${authorName}` : "모두의 지도"
    }
    if (mapTitle) return creating ? mapTitle : `${mapTitle} · 편집 중`
    return creating ? "새로 만드는 중" : "편집 중"
  })()

  const photos = featureSheet.photos || []

  const updateStyle = (patch) => {
    setFeatureSheet((current) => {
      const nextType = current?.type || type
      const merged = { ...normalizeFeatureStyle(current?.style, nextType), ...patch }
      return { ...current, style: normalizeFeatureStyle(merged, nextType) }
    })
  }

  // descriptor 객체 {kind, value} 를 받아 form state 의 3개 필드로 전개한다.
  // - unicode: emoji=value, emojiKind='unicode', emojiPixelId=null, emojiPhotoUrl=null
  // - pixel:   emoji=null,  emojiKind='pixel',   emojiPixelId=value, emojiPhotoUrl=null
  // - photo:   emoji=null,  emojiKind='photo',   emojiPixelId=null,  emojiPhotoUrl=value
  // 레거시 string 입력도 받는다 (방어).
  const setEmoji = (input) => {
    const d = resolveFeatureEmoji(input)
    setFeatureSheet((current) => ({
      ...current,
      emoji: d.kind === "unicode" ? d.value : "",
      emojiKind: d.kind,
      emojiPixelId: d.kind === "pixel" ? d.value : null,
      emojiPhotoUrl: d.kind === "photo" ? d.value : null,
      category: null, // 이모지 직접 선택 시 아이콘 카테고리 해제
    }))
    setEmojiPickerOpen(false)
  }

  // v2: handlePhotoClick 폐기 — AttachToolbar 제거에 따라 RecordEntrySheet 내부에서 처리.

  const handleMemoSave = (text) => {
    if (!featureSheet?.id) return
    onAddMemo?.(featureSheet.id, text)
  }

  const canDelete = !readOnly && !creating && typeof onDelete === "function"
  const saveDisabled = readOnly || Boolean(featureSheet.cloudPending)
  const canRelocate = type === "pin"
    && featureSheet?.id
    && featureSheet.lat != null
    && featureSheet.lng != null
    && (featureSheet.lat !== 0 || featureSheet.lng !== 0)
    && typeof onRelocatePin === "function"
    && !readOnly

  // 현재 선택된 이모지 descriptor — 3개 새 필드를 우선, 없으면 레거시 emoji 문자열.
  const emojiDescriptor = resolveFeatureEmoji(featureSheet)
  const emojiName = emojiDescriptor.kind === "unicode"
    ? (lookupEmojiName(emojiDescriptor.value) || "이모지")
    : descriptorToDisplayText(emojiDescriptor)

  return (
    <>
      <div className="fes-backdrop" onClick={onClose} />
      <section className="fes-sheet fes-sheet--v2" role="dialog" aria-modal="true" aria-label={`${sheetTitle} 편집`}>
        <div className="fes-handle" />

        <div className="fes-head">
          <div className="fes-title-wrap">
            <div className="fes-title">{sheetTitle}</div>
            <div className="fes-meta">{metaLine}</div>
          </div>
          {canRelocate ? (
            <button
              className="fes-head-relocate"
              type="button"
              onClick={() => onRelocatePin(featureSheet.id)}
            >
              위치변경
            </button>
          ) : null}
          <button className="fes-close" type="button" onClick={onClose} aria-label="닫기">
            <XIcon size={12} />
          </button>
        </div>

        {/* --- 이모지 (장소만) --- */}
        {type === "pin" ? (
          <div className="fes-field">
            <div className="fes-emoji-row">
              <button
                type="button"
                className="fes-emoji-btn"
                onClick={() => setEmojiPickerOpen(true)}
                aria-label="이모지 변경"
                disabled={readOnly}
              >
                <FeatureEmoji emoji={emojiDescriptor} size={36} unicodeFontSize={26} />
              </button>
              <div className="fes-emoji-hint">
                <strong>{emojiName || "이모지"}</strong>
                <span>{readOnly ? "읽기 전용" : "탭해서 다른 이모지로 변경"}</span>
              </div>
            </div>
          </div>
        ) : null}

        {/* --- 색상 (길·영역만) --- */}
        {type === "route" || type === "area" ? (
          <div className="fes-field">
            <FieldLabel hint={type === "area" ? "영역 색상" : "길 색상"}>색상</FieldLabel>
            <ColorPicker
              type={type}
              value={style.color}
              onChange={(color) => updateStyle({ color })}
              disabled={readOnly}
            />
          </div>
        ) : null}

        {/* --- 선 종류 (길·영역만) --- */}
        {type === "route" || type === "area" ? (
          <div className="fes-field">
            <FieldLabel hint={type === "area" ? "영역 외곽선 스타일" : "길의 선 스타일"}>선 종류</FieldLabel>
            <LineStylePicker
              value={style.lineStyle}
              onChange={(lineStyle) => updateStyle({ lineStyle })}
              disabled={readOnly}
            />
          </div>
        ) : null}

        {/* --- 이름 --- */}
        <div className="fes-field">
          <FieldLabel>이름</FieldLabel>
          <input
            ref={nameInputRef}
            className="fes-input fes-input--bold"
            // 기본 placeholder 이름("새 장소" 등)은 빈 상태로 렌더해 사용자가 바로 타이핑하도록.
            // 저장 시 useFeatureEditing.saveFeatureSheet 가 `title.trim()` 검증.
            value={DEFAULT_TITLE_TOKENS.has(featureSheet.title || "") ? "" : featureSheet.title}
            placeholder={
              type === "pin" ? "장소 이름"
                : type === "route" ? "길 이름"
                  : "영역 이름"
            }
            onChange={(e) => setFeatureSheet((c) => ({ ...c, title: e.target.value }))}
            disabled={readOnly}
            maxLength={100}
          />
        </div>

        {/* --- 태그 (내 지도만) --- */}
        {isPersonal ? (
          <div className="fes-field">
            <FieldLabel hint="엔터로 추가" hintVariant="bubble">태그</FieldLabel>
            <TagInput
              tagsText={featureSheet.tagsText || ""}
              onChange={(val) => setFeatureSheet((c) => ({ ...c, tagsText: val }))}
            />
          </div>
        ) : null}

        {/* --- 한 줄 소개 --- */}
        <div className="fes-field">
          {isCommunity ? (
            <FieldLabel>설명</FieldLabel>
          ) : (
            <FieldLabel>한 줄 소개</FieldLabel>
          )}
          <textarea
            className="fes-textarea"
            rows={isCommunity ? 3 : 2}
            value={featureSheet.note || ""}
            onChange={(e) => setFeatureSheet((c) => ({ ...c, note: e.target.value }))}
            placeholder={
              isCommunity
                ? "이 장소에 대해 알려주세요"
                : type === "pin" ? "예: 창가 자리 좋은 카페"
                  : type === "route" ? "예: 회사에서 집까지 걷기 좋은 길"
                    : "예: 베이커리와 독립서점이 모인 골목"
            }
            disabled={readOnly}
            maxLength={2000}
          />
        </div>

        {/* --- 측정 정보 (길·영역) --- */}
        {type === "route" || type === "area" ? (
          <div className="fes-field">
            <MeasureInfo type={type} feature={featureSheet} />
          </div>
        ) : null}

        {/* --- 액션 --- */}
        <div className="fes-action">
          {canDelete ? (
            <button type="button" className="fes-btn fes-btn--danger" onClick={onDelete}>삭제</button>
          ) : (
            <button type="button" className="fes-btn fes-btn--ghost" onClick={onClose}>닫기</button>
          )}
          <button
            type="button"
            className="fes-btn fes-btn--primary"
            onClick={onSave}
            disabled={saveDisabled}
          >
            {featureSheet.cloudPending ? "준비 중" : "저장"}
          </button>
        </div>
      </section>

      {emojiPickerOpen ? (
        <FeatureEmojiPicker
          selectedEmoji={emojiDescriptor}
          onSelect={setEmoji}
          onClose={() => setEmojiPickerOpen(false)}
          cloudMode={cloudMode}
          userId={userId}
        />
      ) : null}

      {memoSheetOpen ? (
        <MemoComposeSheet
          onClose={() => setMemoSheetOpen(false)}
          onSave={handleMemoSave}
        />
      ) : null}

      <RecordEntrySheet
        open={recordSheetOpen}
        featureTitle={featureSheet?.title || sheetTitle}
        onClose={() => setRecordSheetOpen(false)}
        onSave={(text) => {
          if (text && featureSheet?.id) onAddMemo?.(featureSheet.id, text)
        }}
        photos={photos}
        onPhotoSelected={onPhotoSelected}
        onDeletePhoto={onDeletePhoto}
        photoInputRef={photoInputRef}
      />
    </>
  )
}
