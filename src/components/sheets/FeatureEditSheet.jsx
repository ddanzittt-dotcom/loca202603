import { useMemo, useState } from "react"
import { X as XIcon, Camera, Mic, FileText, Play } from "lucide-react"
import { FeatureEmojiPicker } from "../FeatureEmojiPicker"
import { lookupEmojiName } from "../../lib/emojiCatalog"
import {
  FEATURE_LINE_STYLE_ITEMS,
  FEATURE_LINE_STYLE_SOLID,
  FEATURE_LINE_STYLE_SHORT_DASH,
  FEATURE_LINE_STYLE_SHORT_DOT,
  normalizeFeatureStyle,
} from "../../lib/featureStyle"

/*
 * FeatureEditSheet — 장소 · 경로 · 범위 편집 바텀시트 (작성자 편집 전용).
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

// 핀 색상 팔레트 — 공통 6색 (장소·경로·범위 전부 동일). 시안 기준.
const PIN_COLOR_PALETTE = [
  "#FF6B35", // orange
  "#2D4A3E", // green
  "#3B82F6", // blue
  "#EF4444", // red
  "#854F0B", // brown
  "#A855F7", // purple
]

const DEFAULT_EMOJI_BY_TYPE = {
  pin: "📍",
  route: "🛣️",
  area: "🟩",
}

// 태그 칩 액센트 톤 3종 — 시안의 warm/mint/amber 순환
const TAG_TONES = ["", "mint", "amber"]
function tagToneByIndex(idx) { return TAG_TONES[idx % TAG_TONES.length] }

// 지도 기본 이름 ("새 장소" 등) 탐지 — 빈 상태 UI 분기용
const DEFAULT_TITLE_TOKENS = new Set(["", "새 장소", "새 경로", "새 범위"])
function isCreatingState(feature) {
  const t = (feature?.title || "").trim()
  return DEFAULT_TITLE_TOKENS.has(t)
}

// 경로 길이 (km) — haversine 합산
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

function formatMMdd(dateStr) {
  const d = dateStr ? new Date(dateStr) : null
  if (!d || Number.isNaN(d.getTime())) return ""
  const mm = `${d.getMonth() + 1}`.padStart(2, "0")
  const dd = `${d.getDate()}`.padStart(2, "0")
  return `${mm}.${dd}`
}

function formatDuration(sec) {
  if (!Number.isFinite(sec)) return ""
  const m = Math.floor(sec / 60)
  const s = Math.round(sec - m * 60)
  return `${m}:${`${s}`.padStart(2, "0")}`
}

// ---------- 공통 필드 UI ----------

function FieldLabel({ children, hint }) {
  return (
    <div className="fes-label">
      <span>{children}</span>
      {hint ? <span className="fes-hint">· {hint}</span> : null}
    </div>
  )
}

function ColorPalette({ value, onChange }) {
  const isPreset = PIN_COLOR_PALETTE.includes(value)
  return (
    <div className="fes-color-row" role="radiogroup" aria-label="색상 선택">
      {PIN_COLOR_PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={`${color} 선택${value === color ? " 됨" : ""}`}
          className={`fes-color-chip${value === color ? " is-selected" : ""}`}
          style={{ background: color }}
          onClick={() => onChange(color)}
        />
      ))}
      <label className="fes-color-chip-custom">
        <span>직접</span>
        <span className="fes-swatch" style={{ background: isPreset ? value : value }} />
        <input
          type="color"
          value={value || "#FF6B35"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          aria-label="커스텀 색상 선택"
        />
      </label>
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

function LineStylePicker({ value, onChange }) {
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
          >
            <span className="fes-line-preview"><LinePreviewSvg lineStyle={item.value} /></span>
            {item.label}
          </button>
        )
      })}
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
    // 권역(도보 N분) — 반경 기반 근사
    const radiusKm = sqm ? Math.sqrt(sqm / Math.PI) / 1000 : 0
    const mins = walkingMinutes(radiusKm * 2) // 지름 기준 통과 시간
    return (
      <div className="fes-measure">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="3 2">
          <rect x="4" y="4" width="16" height="16" rx="3" />
        </svg>
        <span>
          범위 면적 <strong>{label}</strong>
          {mins ? <> · 도보 {mins}분 권역</> : null}
        </span>
      </div>
    )
  }
  return null
}

// ---------- 미디어 / 메모 블록 ----------

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
        {photos.map((p) => (
          <div key={p.id} className="fes-photo-thumb">
            {p.url ? <img src={p.url} alt="" /> : null}
            {canEdit ? (
              <button
                type="button"
                className="fes-photo-rm"
                aria-label="사진 삭제"
                onClick={() => onDelete?.(p.id)}
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

function VoiceBar({ voice, onDelete, canEdit }) {
  const bars = useMemo(() => {
    // 12개 고정, 의사-랜덤 높이 (voice id 기반)
    const seed = `${voice.id}`.split("").reduce((s, c) => s + c.charCodeAt(0), 0)
    return Array.from({ length: 12 }, (_, i) => {
      const n = ((seed * (i + 3)) % 60) + 30
      return n
    })
  }, [voice.id])

  return (
    <div className="fes-audio-bar">
      <button type="button" className="fes-audio-play" aria-label="재생">
        <Play size={10} fill="#fff" />
      </button>
      <div className="fes-audio-wave" aria-hidden>
        {bars.map((h, i) => <span key={i} style={{ height: `${h}%` }} />)}
      </div>
      <span className="fes-audio-time">{formatDuration(voice.duration || 0)}</span>
      <span className="fes-audio-date">{formatMMdd(voice.date)}</span>
      {canEdit ? (
        <button
          type="button"
          className="fes-audio-rm"
          aria-label="음성 삭제"
          onClick={() => onDelete?.(voice.id)}
        >
          <XIcon size={8} />
        </button>
      ) : null}
    </div>
  )
}

function VoiceBlock({ voices, canEdit, onDeleteVoice }) {
  if (!voices?.length) return null
  return (
    <div className="fes-media">
      <div className="fes-media-head">
        <Mic size={11} />
        <span>음성</span>
        <span className="fes-count">{voices.length}</span>
      </div>
      <div className="fes-audio-list">
        {voices.map((v) => (
          <VoiceBar key={v.id} voice={v} canEdit={canEdit} onDelete={onDeleteVoice} />
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

function AttachToolbar({ counts, onPhoto, onVoice, onMemo, isRecording, recordingSeconds, showHint }) {
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
        className={`fes-attach-btn${isRecording ? " is-recording" : ""}`}
        title={isRecording ? "녹음 중지" : "음성 녹음"}
        aria-label={isRecording ? "녹음 중지" : "음성 녹음"}
        onClick={onVoice}
      >
        <Mic size={16} />
        {isRecording
          ? <span className="fes-attach-dot">{recordingSeconds}</span>
          : counts.voices > 0
            ? <span className="fes-attach-dot">{counts.voices}</span>
            : null}
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
      {showHint ? <span className="fes-attach-hint">사진 · 음성 · 메모 추가</span> : null}
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
      <section className="fes-memo-sheet" role="dialog" aria-modal="true" aria-label="메모 추가">
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
  onClose,
  onSave,
  onDelete,
  onRelocatePin,
  // 미디어
  photoInputRef,
  isRecording,
  recordingSeconds,
  onPhotoSelected,
  onDeletePhoto,
  onStartRecording,
  onStopRecording,
  onDeleteVoice,
  // 메모
  onAddMemo,
  onDeleteMemo,
}) {
  const open = Boolean(featureSheet)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [memoSheetOpen, setMemoSheetOpen] = useState(false)

  if (!open) return null

  const type = featureSheet.type || "pin"
  const isPersonal = mapMode === "personal"
  const isCommunity = mapMode === "community"
  const creating = isCreatingState(featureSheet)
  const style = normalizeFeatureStyle(featureSheet.style, type)

  const sheetTitle = type === "route" ? "경로" : type === "area" ? "범위" : "장소"
  const metaLine = (() => {
    if (isCommunity) {
      const authorName = featureSheet.createdByName
      return authorName ? `작성자 · ${authorName}` : "모두의 지도"
    }
    if (mapTitle) return creating ? mapTitle : `${mapTitle} · 편집 중`
    return creating ? "새로 만드는 중" : "편집 중"
  })()

  const photos = featureSheet.photos || []
  const voices = featureSheet.voices || []
  const memos = featureSheet.memos || []

  const updateStyle = (patch) => {
    setFeatureSheet((current) => {
      const nextType = current?.type || type
      const merged = { ...normalizeFeatureStyle(current?.style, nextType), ...patch }
      return { ...current, style: normalizeFeatureStyle(merged, nextType) }
    })
  }

  const setEmoji = (emoji) => {
    setFeatureSheet((current) => ({
      ...current,
      emoji,
      category: null, // 이모지 직접 선택 시 아이콘 카테고리 해제
    }))
    setEmojiPickerOpen(false)
  }

  const handlePhotoClick = () => {
    if (!photoInputRef?.current) return
    photoInputRef.current.click()
  }

  const handleVoiceClick = () => {
    if (isRecording) onStopRecording?.()
    else onStartRecording?.()
  }

  const handleMemoSave = (text) => {
    if (!featureSheet?.id) return
    onAddMemo?.(featureSheet.id, text)
  }

  const canDelete = !readOnly && !creating && typeof onDelete === "function"

  const emojiForPin = featureSheet.emoji || DEFAULT_EMOJI_BY_TYPE.pin
  const emojiName = lookupEmojiName(emojiForPin)

  return (
    <>
      <div className="fes-backdrop" onClick={onClose} />
      <section className="fes-sheet" role="dialog" aria-modal="true" aria-label={`${sheetTitle} 편집`}>
        <div className="fes-handle" />

        <div className="fes-head">
          <div className="fes-title-wrap">
            <div className="fes-title">{sheetTitle}</div>
            <div className="fes-meta">{metaLine}</div>
          </div>
          <button className="fes-close" type="button" onClick={onClose} aria-label="닫기">
            <XIcon size={12} />
          </button>
        </div>

        {/* --- 이모지 (장소만) --- */}
        {type === "pin" ? (
          <div className="fes-field">
            <FieldLabel hint="장소를 대표하는 아이콘">이모지</FieldLabel>
            <div className="fes-emoji-row">
              <button
                type="button"
                className="fes-emoji-btn"
                onClick={() => setEmojiPickerOpen(true)}
                aria-label="이모지 변경"
                disabled={readOnly}
              >
                <span className="fes-emoji-glyph">{emojiForPin}</span>
              </button>
              <div className="fes-emoji-hint">
                <strong>{emojiName || "이모지"}</strong>
                <span>{readOnly ? "읽기 전용" : "탭해서 다른 이모지로 변경"}</span>
              </div>
            </div>
          </div>
        ) : null}

        {/* --- 색상 --- */}
        <div className="fes-field">
          <FieldLabel hint={
            type === "route" ? "지도에 표시될 경로 색"
              : type === "area" ? "지도에 표시될 범위 색"
                : "지도에 표시될 장소 색"
          }>색상</FieldLabel>
          <ColorPalette value={style.color} onChange={(color) => updateStyle({ color })} />
        </div>

        {/* --- 선 종류 (경로·범위만) --- */}
        {type === "route" || type === "area" ? (
          <div className="fes-field">
            <FieldLabel hint={type === "area" ? "범위 외곽선 스타일" : "경로의 선 스타일"}>선 종류</FieldLabel>
            <LineStylePicker value={style.lineStyle} onChange={(lineStyle) => updateStyle({ lineStyle })} />
          </div>
        ) : null}

        {/* --- 이름 --- */}
        <div className="fes-field">
          <FieldLabel>이름</FieldLabel>
          <input
            className="fes-input fes-input--bold"
            // 기본 placeholder 이름("새 장소" 등)은 빈 상태로 렌더해 사용자가 바로 타이핑하도록.
            // 저장 시 useFeatureEditing.saveFeatureSheet 가 `title.trim()` 검증.
            value={DEFAULT_TITLE_TOKENS.has(featureSheet.title || "") ? "" : featureSheet.title}
            placeholder={
              type === "pin" ? "장소 이름"
                : type === "route" ? "경로 이름"
                  : "범위 이름"
            }
            onChange={(e) => setFeatureSheet((c) => ({ ...c, title: e.target.value }))}
            disabled={readOnly}
            maxLength={100}
          />
        </div>

        {/* --- 태그 (내 지도만) --- */}
        {isPersonal ? (
          <div className="fes-field">
            <FieldLabel hint="엔터로 추가">태그</FieldLabel>
            <TagInput
              tagsText={featureSheet.tagsText || ""}
              onChange={(val) => setFeatureSheet((c) => ({ ...c, tagsText: val }))}
            />
          </div>
        ) : null}

        {/* --- 설명 (모두의 지도) / 한 줄 소개 (내 지도) --- */}
        <div className="fes-field">
          {isCommunity ? (
            <FieldLabel>설명</FieldLabel>
          ) : (
            <FieldLabel hint={
              type === "route" ? "어떤 경로인지 짧게"
                : type === "area" ? "어떤 범위인지 짧게"
                  : "어떤 장소인지 짧게"
            }>한 줄 소개</FieldLabel>
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
                  : type === "route" ? "예: 회사 → 중앙시장 → 집, 저녁 산책"
                    : "예: 베이커리·독립서점이 모인 골목"
            }
            disabled={readOnly}
            maxLength={2000}
          />
        </div>

        {/* --- 위치 (장소만) --- */}
        {type === "pin" && featureSheet.lat != null && featureSheet.lng != null
          && (featureSheet.lat !== 0 || featureSheet.lng !== 0) ? (
          <div className="fes-field">
            <FieldLabel hint="장소가 지도에 남겨진 좌표">위치</FieldLabel>
            <div className="fes-location">
              <div className="fes-location-info">
                <div className="fes-location-addr">{featureSheet.address || "주소를 불러오는 중..."}</div>
                <div className="fes-location-coords">
                  {Number(featureSheet.lat).toFixed(6)}, {Number(featureSheet.lng).toFixed(6)}
                </div>
              </div>
              {onRelocatePin && !readOnly ? (
                <button
                  type="button"
                  className="fes-location-change"
                  onClick={() => onRelocatePin(featureSheet.id)}
                >
                  변경
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* --- 미디어 블록 (내 지도만) --- */}
        {isPersonal ? (
          <>
            <PhotoBlock
              photos={photos}
              canEdit={!readOnly}
              onDelete={onDeletePhoto}
            />
            <VoiceBlock
              voices={voices}
              canEdit={!readOnly}
              onDeleteVoice={onDeleteVoice}
            />
            <MemoBlock
              memos={memos}
              canEdit={!readOnly}
              onDeleteMemo={onDeleteMemo}
            />
          </>
        ) : null}

        {/* --- 측정 정보 (경로·범위) --- */}
        {type === "route" || type === "area" ? (
          <div className="fes-field">
            <MeasureInfo type={type} feature={featureSheet} />
          </div>
        ) : null}

        {/* --- 퀵 첨부 툴바 (내 지도만) --- */}
        {isPersonal && !readOnly ? (
          <>
            <AttachToolbar
              counts={{ photos: photos.length, voices: voices.length, memos: memos.length }}
              onPhoto={handlePhotoClick}
              onVoice={handleVoiceClick}
              onMemo={() => setMemoSheetOpen(true)}
              isRecording={isRecording}
              recordingSeconds={recordingSeconds}
              showHint={creating && photos.length === 0 && voices.length === 0 && memos.length === 0}
            />
            {photoInputRef ? (
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={onPhotoSelected}
              />
            ) : null}
          </>
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
            disabled={readOnly}
          >
            저장
          </button>
        </div>
      </section>

      {emojiPickerOpen ? (
        <FeatureEmojiPicker
          selectedEmoji={emojiForPin}
          onSelect={setEmoji}
          onClose={() => setEmojiPickerOpen(false)}
        />
      ) : null}

      {memoSheetOpen ? (
        <MemoComposeSheet
          onClose={() => setMemoSheetOpen(false)}
          onSave={handleMemoSave}
        />
      ) : null}
    </>
  )
}
