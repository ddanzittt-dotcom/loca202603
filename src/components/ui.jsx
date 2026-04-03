import { formatFeedDate, mapThemeGradient } from "../lib/appUtils"

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
            ✕
          </button>
        </div>
        {children}
      </section>
    </>
  )
}

export function BottomNav({ activeTab, onChange }) {
  const items = [
    ["home", "⌂", "홈"],
    ["maps", "🗺", "지도"],
    ["places", "📍", "장소"],
    ["search", "⌕", "검색"],
    ["profile", "☺", "프로필"],
  ]

  return (
    <nav className="bottom-nav">
      {items.map(([id, icon, label]) => (
        <button key={id} className={`bottom-nav__item${activeTab === id ? " is-active" : ""}`} type="button" onClick={() => onChange(id)}>
          <span className="bottom-nav__icon">{icon}</span>
          <span className="bottom-nav__label">{label}</span>
        </button>
      ))}
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
        <span className="map-preview__badge">📍 {placeCount}</span>
      </div>
    </div>
  )
}

export function MapCard({ map, features, onOpen, onEdit, onDelete }) {
  const pins = features.filter((feature) => feature.type === "pin")
  const [start, end] = mapThemeGradient(map.theme)

  return (
    <article className="map-card">
      <button className="map-card__preview" type="button" style={{ "--card-start": start, "--card-end": end }} onClick={() => onOpen(map.id)}>
        <span className={`map-card__badge${map.importedFrom ? " map-card__badge--imported" : ""}`}>
          {map.importedFrom ? `${map.importedFrom}의 지도` : "EDITOR"}
        </span>
        <div className="map-card__emoji-row">
          {(pins.length > 0 ? pins : [{ emoji: "📍" }]).slice(0, 4).map((item, index) => (
            <span key={`${item.emoji}-${index}`}>{item.emoji}</span>
          ))}
        </div>
      </button>
      <div className="map-card__body">
        <div className="map-card__header">
          <div>
            <h2>{map.title}</h2>
            <p>{map.description || "설명이 아직 없어요."}</p>
          </div>
          <div className="map-card__actions">
            <button className="icon-button" type="button" onClick={() => onEdit(map.id)}>
              ✏️
            </button>
            {onDelete ? (
              <button className="icon-button" type="button" onClick={() => onDelete(map.id, map.title)}>
                🗑️
              </button>
            ) : null}
          </div>
        </div>
        <button className="button button--primary map-card__open" type="button" onClick={() => onOpen(map.id)}>
          지도 열기
        </button>
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
      <strong>문제가 발생했어요</strong>
      <p>{message || "네트워크 연결을 확인해주세요."}</p>
      {onRetry ? (
        <button className="button button--secondary" type="button" onClick={onRetry}>다시 시도</button>
      ) : null}
    </article>
  )
}
