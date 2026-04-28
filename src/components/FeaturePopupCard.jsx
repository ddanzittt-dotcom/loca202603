import { useMemo, useRef, useState } from "react"
import { FullscreenGallery } from "./FullscreenGallery"

/*
 * 지도 마커 탭 시 열리는 팝업 카드.
 * 원본 시안: design/loca_popup_proposal_v8.html, design/CLAUDE_CODE_BRIEF.md
 *
 * 분기:
 *   mapMode    : "community" | "personal"   (모두의 지도 / 내 지도)
 *   isAuthor   : boolean                    (현재 사용자가 작성자인가)
 *   type       : "pin" | "route" | "area"   (feature.type)
 *
 * 모르는(선택) 정책(가져오기 엔드포인트·상세 라우트·메모 첨부 상한·음성 재생 단일/다중)은
 * 프로p 부재 = 기능 미노출 원칙으로 처리한다.
 */

// ---------- 타입 아이콘 ----------
function TypeIcon({ type }) {
  if (type === "route") {
    return (
      <span className="fpc-type-icon fpc-type-icon--route">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="1.8" strokeLinecap="round">
          <path d="M4 19L10 7L16 14L20 5" />
        </svg>
      </span>
    )
  }
  if (type === "area") {
    return (
      <span className="fpc-type-icon fpc-type-icon--area">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#854F0B" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="3 2">
          <rect x="4" y="4" width="16" height="16" rx="3" />
        </svg>
      </span>
    )
  }
  return (
    <span className="fpc-type-icon fpc-type-icon--pin">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="#FF6B35">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
        <circle cx="12" cy="10" r="2.5" fill="#FFF4EB" />
      </svg>
    </span>
  )
}

// ---------- 아이콘 SVG 모음 (lucide 대신 로컬 인라인 — 기존 시안 일치) ----------
function IconClose() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
function IconBookmarkOutline() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" /><line x1="12" y1="7" x2="12" y2="13" /><line x1="9" y1="10" x2="15" y2="10" />
    </svg>
  )
}
function IconBookmarkFilled() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
    </svg>
  )
}
function IconPen() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  )
}
function IconFlag() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  )
}
function IconChevronRight() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}
function IconPhotoAdd() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3" />
      <line x1="12" y1="10" x2="12" y2="14" /><line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  )
}
function IconCamera() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}
function IconXSmall() {
  return (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
function IconPlay() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
  )
}
function IconPause() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="#fff"><rect x="7" y="5" width="4" height="14" /><rect x="13" y="5" width="4" height="14" /></svg>
  )
}
function IconMemoDoc() {
  return (
    <svg className="fpc-memo-preview__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

// ---------- 날짜 유틸 ----------
function formatMMDD(value) {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${m}.${day}`
}

function formatRelativeTime(value, now = Date.now()) {
  if (!value) return ""
  const d = new Date(value)
  const t = d.getTime()
  if (Number.isNaN(t)) return ""
  const diff = Math.max(0, now - t)
  const min = Math.floor(diff / 60000)
  if (min < 1) return "방금"
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  if (day === 1) return "어제"
  if (day < 7) return `${day}일 전`
  if (day < 28) return `${Math.floor(day / 7)}주 전`
  return d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })
}

function formatFullDate(value) {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
}

function formatDurationMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "0:00"
  const totalSec = Math.round(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, "0")}`
}
function formatDurationSec(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00"
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, "0")}`
}
function formatVoiceDuration(v) {
  if (!v) return ""
  if (typeof v.duration === "number") {
    return v.duration > 1000 ? formatDurationMs(v.duration) : formatDurationSec(v.duration)
  }
  return ""
}

// ---------- 아바타 ----------
const AVATAR_PALETTE = [
  ["#C2D6B8", "#4a6b3a"],
  ["#E8BCAD", "#8a4a30"],
  ["#ACD6CC", "#2d6e5e"],
  ["#E0B585", "#6b4a20"],
  ["#C8C9DC", "#4a4a7a"],
]
function pickAvatarTone(seed = "") {
  let sum = 0
  for (let i = 0; i < seed.length; i += 1) sum = (sum + seed.charCodeAt(i)) % AVATAR_PALETTE.length
  return AVATAR_PALETTE[sum]
}
function MemoAvatar({ name, photoUrl }) {
  if (photoUrl) {
    return (
      <span className="fpc-memo-avatar" aria-hidden>
        <img src={photoUrl} alt="" />
      </span>
    )
  }
  const initial = (name || "?").trim().charAt(0) || "?"
  const [bg, fg] = pickAvatarTone(name || initial)
  return (
    <span className="fpc-memo-avatar" style={{ background: bg, color: fg }} aria-hidden>{initial}</span>
  )
}

// ---------- 웨이브 바 (음성 플레이어) ----------
const WAVE_HEIGHTS = [35, 60, 45, 80, 50, 70, 40, 85]
function VoiceWave({ played = 0 }) {
  return (
    <div className="fpc-voice-player__wave" aria-hidden>
      {WAVE_HEIGHTS.map((h, i) => (
        <span key={i} className={i < played ? "is-played" : ""} style={{ height: `${h}%` }} />
      ))}
    </div>
  )
}

// ---------- 사진 썸네일 ----------
function PhotoThumb({ photo, size = 56, overlayCount, onClick }) {
  const url = photo?.url || photo?.cloudUrl || photo?.src
  const dateMMDD = formatMMDD(photo?.date || photo?.createdAt)
  const cls = size === 76 ? "fpc-photo-hero" : "fpc-thumb"
  const content = (
    <>
      {url ? <img src={url} alt="" /> : null}
      {overlayCount ? <span className="fpc-thumb-count">+{overlayCount}</span> : null}
    </>
  )
  const Tag = onClick ? "button" : "div"
  return (
    <div className="fpc-media-item">
      <Tag
        className={cls}
        type={onClick ? "button" : undefined}
        onClick={onClick}
      >{content}</Tag>
      {dateMMDD ? <span className="fpc-date-label">{dateMMDD}</span> : null}
    </div>
  )
}

function PhotoHero({ photo, overlayCount, onClick }) {
  const url = photo?.url || photo?.cloudUrl || photo?.src
  const dateMMDD = formatMMDD(photo?.date || photo?.createdAt)
  return (
    <div className="fpc-media-item">
      <button type="button" className="fpc-photo-hero" onClick={onClick}>
        {url ? <img src={url} alt="" /> : null}
        {overlayCount ? <span className="fpc-photo-hero__overlay">+{overlayCount}</span> : null}
      </button>
      {dateMMDD ? <span className="fpc-date-label">{dateMMDD}</span> : null}
    </div>
  )
}

// ---------- 음성 플레이어 ----------
function VoicePlayer({ voice, playing, onToggle }) {
  return (
    <div className="fpc-media-item">
      <button
        type="button"
        className="fpc-voice-player"
        onClick={onToggle}
        aria-pressed={playing ? "true" : "false"}
        aria-label={playing ? "음성 정지" : "음성 재생"}
      >
        <span className="fpc-voice-player__play">{playing ? <IconPause /> : <IconPlay />}</span>
        <span className="fpc-voice-player__main">
          <VoiceWave played={playing ? 4 : 0} />
          <span className="fpc-voice-player__time">{formatVoiceDuration(voice) || "0:00"}</span>
        </span>
      </button>
      {formatMMDD(voice?.date || voice?.createdAt)
        ? <span className="fpc-date-label">{formatMMDD(voice?.date || voice?.createdAt)}</span>
        : null}
    </div>
  )
}

// ---------- 메모 input (모두의 지도) ----------
function MemoInput({ onSubmit, onPickPhoto, allowPhoto }) {
  const [text, setText] = useState("")
  const [attached, setAttached] = useState([]) // { file, previewUrl }
  const fileInputRef = useRef(null)

  const handleFiles = (fileList) => {
    if (!fileList) return
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"))
    if (files.length === 0) return
    const next = files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))
    setAttached((prev) => [...prev, ...next])
    onPickPhoto?.(files)
  }

  const removeAttached = (index) => {
    setAttached((prev) => {
      const copy = prev.slice()
      const [removed] = copy.splice(index, 1)
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
      return copy
    })
  }

  const canSubmit = text.trim().length > 0 || attached.length > 0

  const submit = () => {
    if (!canSubmit) return
    const files = attached.map((a) => a.file)
    onSubmit?.(text.trim(), files)
    attached.forEach((a) => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl) })
    setText("")
    setAttached([])
  }

  return (
    <div className="fpc-memo-input">
      <div className="fpc-memo-input__field">
        <div className="fpc-memo-input__row">
          {allowPhoto ? (
            <>
              <button
                type="button"
                className="fpc-memo-input__photo-btn"
                onClick={() => fileInputRef.current?.click()}
                title="사진 첨부"
                aria-label="사진 첨부"
              >
                <IconCamera />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={(e) => handleFiles(e.target.files)}
              />
            </>
          ) : null}
          <input
            className="fpc-memo-input__text"
            placeholder="메모 남기기…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit() }}
          />
        </div>
        {attached.length > 0 ? (
          <div className="fpc-memo-input__attach">
            {attached.map((a, i) => (
              <div key={`${a.previewUrl}-${i}`} className="fpc-memo-attach-thumb">
                <img src={a.previewUrl} alt="" />
                <button type="button" className="fpc-memo-attach-thumb__x" onClick={() => removeAttached(i)} aria-label="첨부 제거"><IconXSmall /></button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <button type="button" className="fpc-memo-submit" onClick={submit} disabled={!canSubmit}>추가</button>
    </div>
  )
}

// 메모 사진을 갤러리가 이해하는 객체 형태로 정규화 (string URL 도 허용)
function normalizeMemoPhotos(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((photo, i) => {
    if (typeof photo === "string") return { url: photo, id: `str-${i}` }
    return photo
  })
}

// ---------- 메모 리스트 아이템 ----------
function MemoItem({ memo, currentUserId, onMemoPhotoClick }) {
  const isMine = memo.userId && currentUserId && memo.userId === currentUserId
  const photos = normalizeMemoPhotos(memo.photos)
  const shown = photos.slice(0, 4)
  const extra = photos.length > shown.length ? photos.length - shown.length : 0
  return (
    <div className="fpc-memo-item">
      <MemoAvatar name={memo.userName} photoUrl={memo.userPhotoUrl} />
      <div className="fpc-memo-body">
        <div className="fpc-memo-meta">
          <span className="fpc-memo-author">{memo.userName || "익명"}</span>
          {isMine ? <span className="fpc-memo-mine-badge">내 메모</span> : null}
          <span className="fpc-memo-time">· {formatRelativeTime(memo.date || memo.createdAt)}</span>
        </div>
        {memo.text ? <div className="fpc-memo-text">{memo.text}</div> : null}
        {shown.length > 0 ? (
          <div className="fpc-memo-photos">
            {shown.map((photo, i) => {
              const isLastWithMore = i === shown.length - 1 && extra > 0
              const url = photo?.url || photo?.cloudUrl
              return (
                <button
                  key={photo?.id || photo?.localId || `photo-${i}`}
                  type="button"
                  className="fpc-memo-photo"
                  onClick={() => onMemoPhotoClick?.(photos, i)}
                >
                  {url ? <img src={url} alt="" /> : null}
                  {isLastWithMore ? <span className="fpc-memo-photo__more">+{extra}</span> : null}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ---------- 태그 컬러 자동 매핑 ----------
const TAG_COLOR_MAP = {
  "산책 코스": "mint", "산책": "mint", "여행": "mint", "바다": "mint",
  "카페": "warm", "한옥": "warm", "전시": "warm", "동네 탐험가": "warm",
  "맛집": "amber", "로컬 맛집": "amber", "빵지순례": "amber", "야경": "amber",
}
function resolveTagTone(tag) {
  const trimmed = `${tag || ""}`.trim()
  return TAG_COLOR_MAP[trimmed] || null
}

// ---------- 메인 컴포넌트 ----------
export function FeaturePopupCard({
  feature,
  mapMode = "community",            // "community" | "personal"
  isAuthor = false,
  currentUserId = null,
  routeLengthKm = null,              // 경로 타입일 때만 사용
  imported = false,                   // community 모드 가져오기 상태
  onClose,
  onOpenDetail,
  onEdit,
  onRequestEdit,
  onImport,
  onUnimport,
  onAddMemo,                          // (text, files) => void
  onAddPhoto,                         // () => void (author, community, header strip)
  onPhotoClick,                       // (photo, index) => void
  onVoiceClick,                       // (voice, index) => void  — 제공 안 되면 인라인 토글
  currentPlayingVoiceId = null,       // 외부 재생 상태 (useVoicePlayback 과 연동)
  onMemoPreviewClick,                 // () => void (내 지도 메모 프리뷰 '더보기')
  headerExtra = null,                  // 헤더 우측 action 버튼 열 뒤에 렌더 (닫기 이전)
  busyImport = false,
}) {
  const [localPlayingVoiceId, setLocalPlayingVoiceId] = useState(null)
  // 외부에서 onVoiceClick 을 제공하면 currentPlayingVoiceId 를 단일 진실원으로 본다.
  const playingVoiceId = onVoiceClick ? currentPlayingVoiceId : localPlayingVoiceId
  // 내부 갤러리 상태 ({ photos, index } | null). 외부 onPhotoClick 이 있으면 그쪽 위임.
  const [galleryState, setGalleryState] = useState(null)

  const openInternalGallery = (photos, index) => {
    if (!Array.isArray(photos) || photos.length === 0) return
    setGalleryState({ photos, index })
  }
  const closeInternalGallery = () => setGalleryState(null)

  const handleFeaturePhotoClick = (photo, index) => {
    if (onPhotoClick) { onPhotoClick(photo, index); return }
    openInternalGallery(feature?.photos || [], index)
  }
  const handleMemoPhotoClick = (photos, index) => {
    if (onPhotoClick) { onPhotoClick(photos[index], index); return }
    openInternalGallery(photos, index)
  }

  const type = feature?.type || "pin"
  const photos = useMemo(() => (Array.isArray(feature?.photos) ? feature.photos : []), [feature])
  const voices = useMemo(() => (Array.isArray(feature?.voices) ? feature.voices : []), [feature])
  const memos = useMemo(() => (Array.isArray(feature?.memos) ? feature.memos : []), [feature])
  const tags = useMemo(() => (Array.isArray(feature?.tags) ? feature.tags : []), [feature])
  const description = `${feature?.note || ""}`.trim()

  // ---------- Header actions ----------
  const headerActions = useMemo(() => {
    const list = []
    if (mapMode === "community") {
      if (onImport || onUnimport) {
        if (imported) {
          list.push({ key: "imported", el: (
            <button
              key="imported"
              type="button"
              className="fpc-btn fpc-btn--imported"
              onClick={onUnimport}
              disabled={busyImport}
            >
              <IconBookmarkFilled />저장됨
            </button>
          ) })
        } else {
          list.push({ key: "import", el: (
            <button
              key="import"
              type="button"
              className="fpc-btn fpc-btn--import"
              onClick={onImport}
              disabled={busyImport}
            >
              <IconBookmarkOutline />가져오기
            </button>
          ) })
        }
      }
      if (isAuthor && onEdit) {
        list.push({ key: "edit", el: (
          <button key="edit" type="button" className="fpc-btn fpc-btn--icon" onClick={onEdit} title="수정" aria-label="수정">
            <IconPen />
          </button>
        ) })
      } else if (!isAuthor && onRequestEdit) {
        list.push({ key: "request-edit", el: (
          <button key="request-edit" type="button" className="fpc-btn fpc-btn--icon" onClick={onRequestEdit} title="수정 제안" aria-label="수정 제안">
            <IconFlag />
          </button>
        ) })
      }
    } else {
      if (isAuthor && onOpenDetail) {
        list.push({ key: "detail", el: (
          <button key="detail" type="button" className="fpc-btn fpc-btn--detail" onClick={onOpenDetail}>
            상세보기<IconChevronRight />
          </button>
        ) })
      }
    }
    return list
  }, [mapMode, isAuthor, imported, busyImport, onImport, onUnimport, onEdit, onRequestEdit, onOpenDetail])

  // ---------- Tag row ----------
  const tagChips = useMemo(() => {
    const chips = []
    if (type === "route" && typeof routeLengthKm === "number" && !Number.isNaN(routeLengthKm) && routeLengthKm > 0) {
      chips.push({ key: "len", tone: "route-length", text: `${routeLengthKm.toFixed(1)}km` })
    }
    tags.forEach((tag, i) => {
      const trimmed = `${tag || ""}`.trim()
      if (!trimmed) return
      chips.push({ key: `tag-${i}-${trimmed}`, tone: resolveTagTone(trimmed), text: trimmed })
    })
    return chips
  }, [type, tags, routeLengthKm])

  const showTagRow = tagChips.length > 0 && (mapMode === "personal" || type === "route")
  // 모두의 지도: 경로 길이 칩만 노출 (태그는 숨김으로 유지 — v8 시안 기준)
  const communityTagRow = useMemo(() => (
    mapMode === "community" && type === "route"
      ? tagChips.filter((c) => c.key === "len")
      : null
  ), [mapMode, type, tagChips])

  // ---------- Photos ----------
  const photoStrip = useMemo(() => {
    if (mapMode === "community") {
      const maxInline = 3
      const shown = photos.slice(0, maxInline)
      const extra = photos.length > maxInline ? photos.length - maxInline : 0
      return { shown, extra }
    }
    const shown = photos.slice(0, 4)
    const extra = photos.length > 4 ? photos.length - 4 : 0
    return { shown, extra }
  }, [photos, mapMode])

  // ---------- 최신 메모 1건 (내 지도 프리뷰) ----------
  const latestMemo = useMemo(() => {
    if (memos.length === 0) return null
    return memos.slice().sort((a, b) => {
      const ta = new Date(a.date || a.createdAt || 0).getTime() || 0
      const tb = new Date(b.date || b.createdAt || 0).getTime() || 0
      return tb - ta
    })[0]
  }, [memos])

  const handleVoiceToggle = (voice, index) => {
    if (onVoiceClick) { onVoiceClick(voice, index); return }
    // onVoiceClick 이 없으면 인라인 시각 토글 fallback
    const id = voice?.id || voice?.localId || `idx-${index}`
    setLocalPlayingVoiceId((current) => (current === id ? null : id))
  }

  // voice 아이템 → 현재 재생 key 매칭 판별
  const isVoicePlaying = (voice, index) => {
    if (onVoiceClick) {
      const externalId = voice?.id || voice?.localId || `idx-${index}`
      if (typeof playingVoiceId === "string" && playingVoiceId.includes("::")) {
        return playingVoiceId.endsWith(`::${externalId}`) || playingVoiceId === externalId
      }
      return playingVoiceId === externalId
    }
    const fallbackId = voice?.id || voice?.localId || `idx-${index}`
    return playingVoiceId === fallbackId
  }

  if (!feature) return null

  return (
    <article className="fpc" role="dialog" aria-label={feature.title || "장소 팝업"}>
      {/* ===== Header ===== */}
      <div className="fpc-head">
        <TypeIcon type={type} />
        <div className="fpc-title-wrap">
          <div className="fpc-title">{feature.title || "제목 없음"}</div>
        </div>
        <div className="fpc-actions">
          {headerActions.map((a) => a.el)}
          {headerExtra}
          {onClose ? (
            <button type="button" className="fpc-close" onClick={onClose} aria-label="팝업 닫기">
              <IconClose />
            </button>
          ) : null}
        </div>
      </div>

      {/* ===== Community (모두의 지도) ===== */}
      {mapMode === "community" ? (
        <>
          {communityTagRow && communityTagRow.length > 0 ? (
            <div className="fpc-tag-row">
              {communityTagRow.map((c) => (
                <span key={c.key} className={`fpc-tag-chip fpc-tag-chip--${c.tone}`}>{c.text}</span>
              ))}
            </div>
          ) : null}

          {description ? <div className="fpc-desc">{description}</div> : null}

          {(photoStrip.shown.length > 0 || (isAuthor && onAddPhoto)) ? (
            <div className="fpc-media-strip">
              {photoStrip.shown.map((photo, i) => {
                const showCount = i === photoStrip.shown.length - 1 && photoStrip.extra > 0
                return (
                  <PhotoThumb
                    key={photo?.id || photo?.localId || `photo-${i}`}
                    photo={photo}
                    overlayCount={showCount ? photoStrip.extra : 0}
                    onClick={() => handleFeaturePhotoClick(photo, i)}
                  />
                )
              })}
              {isAuthor && onAddPhoto ? (
                <button type="button" className="fpc-photo-add" onClick={onAddPhoto} title="사진 추가" aria-label="사진 추가">
                  <IconPhotoAdd /><span className="fpc-photo-add__lb">추가</span>
                </button>
              ) : null}
            </div>
          ) : null}

          {onAddMemo || memos.length > 0 ? (
            <div className="fpc-memo-section">
              <div className="fpc-memo-head">
                <span className="fpc-memo-head__label">메모</span>
                <span className="fpc-memo-head__count">{memos.length}</span>
              </div>
              {onAddMemo ? (
                <MemoInput
                  allowPhoto
                  onSubmit={(text, files) => onAddMemo(text, files)}
                />
              ) : null}
              {memos.length > 0 ? (
                <div className="fpc-memo-list">
                  {memos.slice().sort((a, b) => {
                    const ta = new Date(a.date || a.createdAt || 0).getTime() || 0
                    const tb = new Date(b.date || b.createdAt || 0).getTime() || 0
                    return tb - ta
                  }).map((memo) => (
                    <MemoItem
                      key={memo.id || `${memo.userId}-${memo.date}`}
                      memo={memo}
                      currentUserId={currentUserId}
                      onMemoPhotoClick={handleMemoPhotoClick}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {/* ===== Personal (내 지도) ===== */}
      {mapMode === "personal" ? (
        <>
          {showTagRow ? (
            <div className="fpc-tag-row">
              {tagChips.map((c) => (
                <span
                  key={c.key}
                  className={`fpc-tag-chip${c.tone ? ` fpc-tag-chip--${c.tone}` : ""}`}
                >{c.text}</span>
              ))}
            </div>
          ) : null}

          {description ? <div className="fpc-content">{description}</div> : null}

          {photos.length > 0 || voices.length > 0 || latestMemo ? (
            <div className="fpc-media-stack">
              {photos.length > 0 ? (
                <div className="fpc-photos-row">
                  {photos.slice(0, 4).map((photo, i) => {
                    const isLast = i === Math.min(photos.length, 4) - 1
                    const overlay = isLast && photos.length > 4 ? photos.length - 4 : 0
                    return (
                      <PhotoHero
                        key={photo?.id || photo?.localId || `p-${i}`}
                        photo={photo}
                        overlayCount={overlay}
                        onClick={() => handleFeaturePhotoClick(photo, i)}
                      />
                    )
                  })}
                </div>
              ) : null}

              {voices.length > 0 ? (
                <div className="fpc-voices-row">
                  {voices.map((voice, i) => {
                    const id = voice?.id || voice?.localId || `v-${i}`
                    return (
                      <VoicePlayer
                        key={id}
                        voice={voice}
                        playing={isVoicePlaying(voice, i)}
                        onToggle={() => handleVoiceToggle(voice, i)}
                      />
                    )
                  })}
                </div>
              ) : null}

              {latestMemo ? (
                <button
                  type="button"
                  className="fpc-memo-preview"
                  onClick={onMemoPreviewClick || onOpenDetail || undefined}
                >
                  <IconMemoDoc />
                  <div className="fpc-memo-preview__text">{latestMemo.text || "(내용 없음)"}</div>
                  <div className="fpc-memo-preview__foot">
                    <span>{formatFullDate(latestMemo.date || latestMemo.createdAt)}</span>
                    {(onMemoPreviewClick || onOpenDetail) ? (
                      <span className="fpc-memo-preview__more">더보기 →</span>
                    ) : null}
                  </div>
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {galleryState ? (
        <FullscreenGallery
          photos={galleryState.photos}
          initialIndex={galleryState.index}
          onClose={closeInternalGallery}
        />
      ) : null}
    </article>
  )
}
