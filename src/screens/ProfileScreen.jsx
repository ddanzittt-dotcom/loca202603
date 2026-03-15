import { mapThemeGradient } from "../lib/appUtils"

const coverImages = {
  "map-seongsu": "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=300&fit=crop",
  "map-jeju": "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&h=300&fit=crop",
}

function ProfileMapCard({ map, pinFeatures, onClick }) {
  const [start, end] = mapThemeGradient(map.theme)
  const coverUrl = coverImages[map.id]

  return (
    <button className="profile-map-card" type="button" onClick={onClick}>
      <div className="profile-map-card__preview" style={{ "--card-start": start, "--card-end": end }}>
        {coverUrl ? (
          <img className="profile-map-card__cover" src={coverUrl} alt={map.title} />
        ) : (
          <div className="profile-map-card__emojis">
            {(pinFeatures.length > 0 ? pinFeatures.map((f) => f.emoji).slice(0, 4) : ["📍"]).map((emoji, i) => (
              <span key={`${emoji}-${i}`}>{emoji}</span>
            ))}
          </div>
        )}
      </div>
      <div className="profile-map-card__body">
        <strong>{map.title}</strong>
        <span>📍 {pinFeatures.length}</span>
      </div>
    </button>
  )
}

export function ProfileScreen({ user, shares, maps, features, followedCount, canInstall, isStandalone, installHint, onInstall, onPublishOpen, onSelectPost, onExport, onImportClick, onRestoreSeed, onClearAll }) {
  return (
    <section className="screen screen--scroll">
      <div className="profile-page">
        <div className="profile-page__header">
          <div><span className="avatar avatar--xl"><span className="avatar__inner">{user.emoji}</span></span></div>
          <div className="profile-page__body">
            <strong>{user.name}</strong>
            <span className="profile-hero__handle">{user.handle}</span>
            <p>{user.bio}</p>
          </div>
        </div>

        <div className="stats-row profile-stats-row">
          <article className="stat-card"><span className="stat-card__label">내 지도</span><strong className="stat-card__value">{maps.length}</strong></article>
          <article className="stat-card"><span className="stat-card__label">공유</span><strong className="stat-card__value">{shares.length}</strong></article>
          <article className="stat-card"><span className="stat-card__label">팔로우</span><strong className="stat-card__value">{followedCount}</strong></article>
        </div>

        <div className="profile-map-grid">
          {shares.map((share) => {
            const map = maps.find((item) => item.id === share.mapId)
            const mapFeatures = features.filter((item) => item.mapId === share.mapId && item.type === "pin")
            if (!map) return null
            return (
              <ProfileMapCard key={share.id} map={map} pinFeatures={mapFeatures} onClick={() => onSelectPost("own", share.id)} />
            )
          })}
        </div>
      </div>
    </section>
  )
}
