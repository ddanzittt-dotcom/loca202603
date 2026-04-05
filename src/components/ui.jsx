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
  const items = [
    ["home", "홈"],
    ["maps", "지도"],
    ["places", "장소"],
    ["search", "검색"],
    ["profile", "프로필"],
  ]

  return (
    <nav className="bottom-nav">
      {items.map(([id, label]) => {
        const Icon = NAV_ICONS[id]
        const isActive = activeTab === id
        return (
          <button key={id} className={`bottom-nav__item${isActive ? " is-active" : ""}`} type="button" onClick={() => onChange(id)}>
            <span className="bottom-nav__icon"><Icon size={22} strokeWidth={isActive ? 2.2 : 1.8} /></span>
            <span className="bottom-nav__label">{label}</span>
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
const REGION_COLORS = [
  { name: "서울", lat: 37.56, lng: 126.98, color: "#4F46E5" },  // 보라
  { name: "경기", lat: 37.27, lng: 127.01, color: "#3B82F6" },  // 파랑
  { name: "인천", lat: 37.45, lng: 126.70, color: "#06B6D4" },  // 시안
  { name: "강원", lat: 37.87, lng: 128.20, color: "#10B981" },  // 초록
  { name: "대전", lat: 36.35, lng: 127.38, color: "#F59E0B" },  // 노랑
  { name: "충북", lat: 36.63, lng: 127.49, color: "#84CC16" },  // 라임
  { name: "충남", lat: 36.50, lng: 126.80, color: "#14B8A6" },  // 틸
  { name: "대구", lat: 35.87, lng: 128.60, color: "#EF4444" },  // 빨강
  { name: "경북", lat: 36.25, lng: 128.96, color: "#F97316" },  // 주황
  { name: "부산", lat: 35.18, lng: 129.07, color: "#EC4899" },  // 핑크
  { name: "경남", lat: 35.23, lng: 128.68, color: "#E11D48" },  // 로즈
  { name: "울산", lat: 35.54, lng: 129.31, color: "#F43F5E" },  // 코랄
  { name: "광주", lat: 35.16, lng: 126.85, color: "#8B5CF6" },  // 바이올렛
  { name: "전북", lat: 35.82, lng: 127.15, color: "#A855F7" },  // 퍼플
  { name: "전남", lat: 34.81, lng: 126.46, color: "#6366F1" },  // 인디고
  { name: "제주", lat: 33.49, lng: 126.53, color: "#0EA5E9" },  // 스카이
  { name: "세종", lat: 36.48, lng: 127.26, color: "#22D3EE" },  // 라이트시안
]

function locationColor(pins) {
  const validPins = pins.filter((p) => p.lat && p.lng)
  if (validPins.length === 0) return "#98A2B3" // 기본 회색

  const avgLat = validPins.reduce((s, p) => s + p.lat, 0) / validPins.length
  const avgLng = validPins.reduce((s, p) => s + p.lng, 0) / validPins.length

  // 가장 가까운 지역 찾기
  let closest = REGION_COLORS[0]
  let minDist = Infinity
  for (const region of REGION_COLORS) {
    const dist = (region.lat - avgLat) ** 2 + (region.lng - avgLng) ** 2
    if (dist < minDist) { minDist = dist; closest = region }
  }
  return closest.color
}

export function MapCard({ map, features, onOpen, onEdit, onDelete }) {
  const pins = features.filter((feature) => feature.type === "pin")
  const color = locationColor(pins)

  const mapType = map.category === "event" ? "event map" : map.importedFrom ? "viewer" : "editor"
  const badgeClass = mapType === "event map" ? "map-type-badge--event" : mapType === "viewer" ? "map-type-badge--viewer" : "map-type-badge--editor"

  return (
    <article className="map-card" onClick={() => onOpen(map.id)}>
      <div className="map-card__preview" style={{ background: color }}>
        <span className={`map-type-badge ${badgeClass}`}>{mapType}</span>
      </div>
      <div className="map-card__body">
        <div className="map-card__header">
          <div className="map-card__info">
            <h2>{map.title}</h2>
            <span className="map-card__count">{pins.length}곳</span>
          </div>
          <div className="map-card__btns">
            <button className="map-card__icon-btn" type="button" onClick={(e) => { e.stopPropagation(); onEdit(map.id) }}><Pencil size={15} /></button>
            {onDelete ? (
              <button className="map-card__icon-btn map-card__icon-btn--del" type="button" onClick={(e) => { e.stopPropagation(); onDelete(map.id, map.title) }}><Trash2 size={15} /></button>
            ) : null}
          </div>
        </div>
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
