import { formatFeedDate, mapThemeGradient } from "../lib/appUtils"
import { Home, Map, MapPin, Search, User, X, AlertTriangle, RefreshCw, Pencil, Trash2 } from "lucide-react"

export function BottomSheet({ open, title, subtitle, onClose, children }) {
  if (!open) return null
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <section className="sheet" role="dialog" aria-modal="true">
        <div className="sheet__handle" />
        <div className="sheet__header">
          <div>
            <h2 className="sheet__title">{title}</h2>
            {subtitle ? <p className="sheet__subtitle">{subtitle}</p> : null}
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </>
  )
}

const NAV_ICONS = { home: Home, maps: Map, places: MapPin, search: Search, profile: User }

export function BottomNav({ activeTab, onChange }) {
  const items = ["home", "maps", "places", "search", "profile"]

  return (
    <nav className="bottom-nav">
      {items.map((id) => {
        const Icon = NAV_ICONS[id]
        const isActive = activeTab === id
        return (
          <button key={id} className={`bottom-nav__item${isActive ? " is-active" : ""}`} type="button" onClick={() => onChange(id)}>
            <span className="bottom-nav__icon">
              <Icon size={20} strokeWidth={isActive ? 2.4 : 1.5} fill={isActive ? "currentColor" : "none"} />
            </span>
          </button>
        )
      })}
    </nav>
  )
}

export function Avatar({ user, size = "md", ring = false }) {
  return (
    <span className={`avatar avatar--${size}${ring ? " avatar--ring" : ""}`}>
      <span className="avatar__inner">{user.emoji}</span>
    </span>
  )
}

export function MapPreview({ title, emojis, placeCount, theme, gradient, variant = "hero", compact = false, caption }) {
  const [start, end] = gradient || mapThemeGradient(theme)
  const previewEmojis = (emojis.length > 0 ? emojis : ["📍", "☕", "🗺"]).slice(0, 6)

  return (
    <div className={`map-preview map-preview--${variant}${compact ? " map-preview--compact" : ""}`} style={{ "--preview-start": start, "--preview-end": end }}>
      <div className="map-preview__glow" />
      <div className="map-preview__emoji-row">
        {previewEmojis.map((emoji, index) => (
          <span key={`${emoji}-${index}`}>{emoji}</span>
        ))}
      </div>
      <div className="map-preview__footer">
        <div>
          <strong>{title}</strong>
          <small>{caption || `${placeCount}개의 장소`}</small>
        </div>
        <span className="map-preview__badge"><MapPin size={13} /> {placeCount}</span>
      </div>
    </div>
  )
}

// 핀 좌표 중심점 → 지역별 고유 단색
// 지역 기반 4단계 컬러 팔레트 [dark, mid, light, pale]
const REGION_PALETTES = {
  서울: ["#D4836B", "#D99580", "#E0A896", "#E8BCAD"],
  경기: ["#C48B4C", "#D4A06A", "#E0B585", "#ECCAA0"],
  인천: ["#C87F5A", "#D49572", "#E0AB8C", "#ECC2A8"],
  대전: ["#7A9E6B", "#92B284", "#AAC49D", "#C2D6B8"],
  세종: ["#6E9470", "#88AA89", "#A2BEA3", "#BCD3BD"],
  충북: ["#8A9B5E", "#9FB078", "#B4C492", "#C9D6AE"],
  충남: ["#7D9978", "#96AE91", "#AFC3AA", "#C8D8C4"],
  광주: ["#5A9E91", "#74B2A5", "#90C4B8", "#ACD6CC"],
  전북: ["#5B9485", "#76AA9C", "#92BEB2", "#AED2C8"],
  전남: ["#4E8E8A", "#6AA5A0", "#88BAB6", "#A6D0CC"],
  부산: ["#5B7EA5", "#7596B8", "#90AECA", "#ABC6DC"],
  대구: ["#7A7BA5", "#9495B8", "#AEAFCA", "#C8C9DC"],
  울산: ["#6B82A0", "#859AB4", "#9FB2C6", "#BACAD8"],
  경북: ["#6E7A9E", "#8894B2", "#A3AEC5", "#BEC8D8"],
  경남: ["#5E7E98", "#7896AE", "#94AEC2", "#B0C6D6"],
  강원: ["#4A7A60", "#649478", "#80AE92", "#9CC8AC"],
  제주: ["#C47A6E", "#D09488", "#DCAEA2", "#E8C8BE"],
}

const REGION_GEO = [
  { name: "서울", lat: 37.56, lng: 126.98 },
  { name: "경기", lat: 37.27, lng: 127.01 },
  { name: "인천", lat: 37.45, lng: 126.70 },
  { name: "강원", lat: 37.87, lng: 128.20 },
  { name: "대전", lat: 36.35, lng: 127.38 },
  { name: "충북", lat: 36.63, lng: 127.49 },
  { name: "충남", lat: 36.50, lng: 126.80 },
  { name: "대구", lat: 35.87, lng: 128.60 },
  { name: "경북", lat: 36.25, lng: 128.96 },
  { name: "부산", lat: 35.18, lng: 129.07 },
  { name: "경남", lat: 35.23, lng: 128.68 },
  { name: "울산", lat: 35.54, lng: 129.31 },
  { name: "광주", lat: 35.16, lng: 126.85 },
  { name: "전북", lat: 35.82, lng: 127.15 },
  { name: "전남", lat: 34.81, lng: 126.46 },
  { name: "제주", lat: 33.49, lng: 126.53 },
  { name: "세종", lat: 36.48, lng: 127.26 },
]

function getRegionInfo(pins) {
  const valid = pins.filter((p) => p.lat && p.lng)
  if (valid.length === 0) return { name: "서울", palette: REGION_PALETTES["서울"] }
  const avgLat = valid.reduce((s, p) => s + p.lat, 0) / valid.length
  const avgLng = valid.reduce((s, p) => s + p.lng, 0) / valid.length
  let closest = REGION_GEO[0]
  let minDist = Infinity
  for (const r of REGION_GEO) {
    const d = (r.lat - avgLat) ** 2 + (r.lng - avgLng) ** 2
    if (d < minDist) { minDist = d; closest = r }
  }
  return { name: closest.name, palette: REGION_PALETTES[closest.name] || REGION_PALETTES["서울"] }
}

function formatRelativeDate(dateStr) {
  if (!dateStr) return ""
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (diff <= 0) return "오늘"
  if (diff === 1) return "어제"
  if (diff < 7) return `${diff}일 전`
  if (diff < 30) return `${Math.floor(diff / 7)}주 전`
  return `${Math.floor(diff / 30)}달 전`
}

export function MapCard({ map, features, onOpen, onEdit, onDelete }) {
  const pins = features.filter((f) => f.type === "pin")
  const routes = features.filter((f) => f.type === "route")
  const areas = features.filter((f) => f.type === "area")
  const region = getRegionInfo(pins)
  const pal = region.palette // [dark, mid, light, pale]

  const isEvent = map.category === "event"
  const cardType = isEvent ? "event" : "editor"
  const lastMod = formatRelativeDate(map.updatedAt)

  // blob 위치에 약간의 변주
  const hash = (map.title || "").length % 4
  const blobOffsets = [hash * 5, (hash + 1) * 4, (hash + 2) * 3]

  return (
    <article className="mc" onClick={() => onOpen(map.id)} style={{ background: pal[3] }}>
      {/* Blobs */}
      <div className="mc__blob" style={{ left: -15 + blobOffsets[0], bottom: -15, width: 160, height: 100, background: `${pal[0]}73` }} />
      <div className="mc__blob" style={{ right: -10 + blobOffsets[1], top: -10, width: 130, height: 85, background: `${pal[3]}80` }} />
      <div className="mc__blob" style={{ left: `${35 + blobOffsets[2]}%`, top: "30%", width: 90, height: 60, background: `${pal[1]}4D` }} />

      {/* 좌상단: 지역 칩 */}
      <div className="mc__region">
        <span className="mc__region-dot" style={{ background: `${pal[0]}66` }} />
        <span className="mc__region-label">{region.name}</span>
      </div>

      {/* 우상단: 타입 뱃지 */}
      <div className="mc__badges">
        <span className="mc__badge" style={{ background: isEvent ? "#FF6B35" : "#2D4A3E", color: isEvent ? "#fff" : "#E1F5EE" }}>
          {isEvent ? "Event" : "Editor"}
        </span>
      </div>

      {/* 하단 오버레이 */}
      <div className="mc__bottom">
        <p className="mc__title">{map.title}</p>
        <div className="mc__meta">
          <span><MapPin size={10} fill="#fff" stroke="#fff" /> {pins.length}</span>
          <span><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polyline points="1,8 4,3 7,6 9,2" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg> {routes.length}</span>
          <span><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="1" y="1" width="8" height="8" rx="2" stroke="#fff" strokeWidth="1" strokeDasharray="2 1.5"/></svg> {areas.length}</span>
          <span className="mc__meta-sep">· {lastMod}</span>
        </div>
      </div>

      {/* 편집/삭제 (카드 외부에서 접근) */}
      <div className="mc__actions">
        <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(map.id) }}><Pencil size={12} color="#fff" /></button>
        {onDelete ? <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(map.id, map.title) }}><Trash2 size={12} color="#fff" /></button> : null}
      </div>
    </article>
  )
}

export function CreatorCard({ user, isFollowed, onToggleFollow, onSelect }) {
  return (
    <article className="creator-card">
      <button className="creator-card__tap" type="button" onClick={() => onSelect(user.id)}>
        <Avatar user={user} size="lg" ring={user.verified} />
        <strong>{user.name}</strong>
        <span>{user.handle}</span>
      </button>
      <button className={`button ${isFollowed ? "button--secondary" : "button--primary"} creator-card__follow`} type="button" onClick={() => onToggleFollow(user.id)}>
        {isFollowed ? "팔로잉" : "팔로우"}
      </button>
    </article>
  )
}

export function UserRowCard({ user, isFollowed, onToggleFollow, onSelect }) {
  return (
    <article className="user-row-card">
      <button className="user-row-card__tap" type="button" onClick={() => onSelect(user.id)}>
        <Avatar user={user} size="md" ring={user.verified} />
        <span className="user-row-card__meta">
          <strong>{user.name}</strong>
          <small>{user.bio}</small>
        </span>
      </button>
      <button className={`button ${isFollowed ? "button--secondary" : "button--primary"}`} type="button" onClick={() => onToggleFollow(user.id)}>
        {isFollowed ? "팔로잉" : "팔로우"}
      </button>
    </article>
  )
}

export function FeedCard({ post, isFollowed, onToggleFollow, onSelectUser, onSelectPost, onLike, onOpenMap }) {
  return (
    <article className="feed-card">
      <div className="feed-card__header">
        <button className="feed-card__author" type="button" onClick={() => onSelectUser(post.user.id)}>
          <Avatar user={post.user} size="md" ring={post.user.verified} />
          <span className="feed-card__author-meta">
            <strong>
              {post.user.name}
              {post.user.verified ? <span className="verified-badge">✓</span> : null}
            </strong>
            <small>{post.user.handle} · {formatFeedDate(post.date)}</small>
          </span>
        </button>
        {post.user.id !== "me" ? (
          <button className={`button ${isFollowed ? "button--secondary" : "button--primary"} feed-card__follow`} type="button" onClick={() => onToggleFollow(post.user.id)}>
            {isFollowed ? "팔로잉" : "팔로우"}
          </button>
        ) : null}
      </div>
      <button className="feed-card__preview" type="button" onClick={() => (onOpenMap && post.mapId ? onOpenMap(post.mapId, post.source) : onSelectPost(post.source, post.id))}>
        <MapPreview title={post.title} emojis={post.emojis} placeCount={post.placeCount} gradient={post.gradient} theme={post.theme} variant="card" caption={post.description} />
      </button>
      <div className="feed-card__body">
        <div className="feed-card__actions">
          <button className="icon-link" type="button" onClick={() => onLike(post.source, post.id)}>좋아요 {post.likes}</button>
          <span className="icon-link icon-link--static">저장 {post.saves}</span>
          <span className="icon-link icon-link--static">장소 {post.placeCount}</span>
        </div>
        <p className="feed-card__caption">
          <strong>{post.title}</strong> {post.caption}
        </p>
      </div>
    </article>
  )
}

export function Toast({ message }) {
  return message ? <div className="toast">{message}</div> : null
}

export function Spinner({ size = 20 }) {
  return (
    <span
      className="loca-spinner"
      style={{ width: size, height: size }}
    />
  )
}

export function SkeletonCard({ count = 1 }) {
  return Array.from({ length: count }, (_, i) => (
    <div key={i} className="skeleton-card">
      <div className="skeleton-card__preview skeleton-pulse" />
      <div className="skeleton-card__body">
        <div className="skeleton-line skeleton-line--title skeleton-pulse" />
        <div className="skeleton-line skeleton-line--text skeleton-pulse" />
      </div>
    </div>
  ))
}

export function EmptyState({ icon = "📭", title, description, action, onAction }) {
  return (
    <article className="empty-state-card">
      <span className="empty-state-card__icon">{icon}</span>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action && onAction ? (
        <button className="button button--primary" type="button" onClick={onAction}>{action}</button>
      ) : null}
    </article>
  )
}

export function ErrorCard({ message, onRetry }) {
  return (
    <article className="error-card">
      <span className="error-card__icon"><AlertTriangle size={20} /></span>
      <strong>문제가 발생했어요</strong>
      <p>{message || "네트워크 연결을 확인해주세요."}</p>
      {onRetry ? (
        <button className="button button--secondary" type="button" onClick={onRetry}><RefreshCw size={14} /> 다시 시도</button>
      ) : null}
    </article>
  )
}
