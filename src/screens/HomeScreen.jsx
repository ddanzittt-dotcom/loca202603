import { useMemo } from "react"
import { MapErrorBoundary } from "../components/MapErrorBoundary"
import { NaverMap } from "../components/NaverMap"
import { getLevelProgress, getEarnedBadges, getNextEarnableBadge } from "../data/gamification"

export function HomeScreen({
  recommendedMaps,
  communityMapFeatures,
  onOpenMap,
  onOpenCommunityEditor,
  userStats,
  viewerProfile,
  onOpenMaps,
}) {
  const xp = userStats?.xp || 0
  const levelInfo = useMemo(() => getLevelProgress(xp), [xp])
  const earnedBadges = useMemo(() => getEarnedBadges(userStats || {}), [userStats])
  const nextBadge = useMemo(() => getNextEarnableBadge(userStats || {}), [userStats])
  const streak = userStats?.streak || 0
  const nickname = viewerProfile?.name || "탐험가"

  return (
    <section className="screen screen--scroll">
      {/* ─── 1. 탐험가 프로필 카드 (컴팩트) ─── */}
      <div className="home-profile-card">
        <div className="home-profile-card__row">
          <span className="home-profile-card__level-emoji">{levelInfo.current.emoji}</span>
          <div className="home-profile-card__info">
            <div className="home-profile-card__name-line">
              <strong>{nickname}</strong>
              <span className="home-profile-card__level-tag">{levelInfo.current.title}</span>
            </div>
            <div className="home-xp-bar">
              <div className="home-xp-bar__track">
                <div className="home-xp-bar__fill" style={{ width: `${Math.round(levelInfo.progress * 100)}%` }} />
              </div>
              <span className="home-xp-bar__label">
                {levelInfo.next ? `${xp} / ${levelInfo.next.minXp} XP` : `${xp} XP ✦ MAX`}
              </span>
            </div>
          </div>
        </div>

        <div className="home-profile-card__bottom">
          <div className="home-stats-row">
            <span>📍{userStats?.pins || 0}</span>
            <span>🎯{userStats?.checkins || 0}</span>
            <span>🏅{userStats?.completions || 0}</span>
            <span>🗺{userStats?.maps || 0}</span>
            {streak > 0 ? <span className="home-stat--streak">🔥{streak}일</span> : null}
          </div>
        </div>

        {nextBadge ? (
          <div className="home-nudge">
            {nextBadge.emoji} {nextBadge.desc} → <strong>{nextBadge.name}</strong>
          </div>
        ) : null}
      </div>

      {/* ─── 2. 인기 지도 ─── */}
      <div className="home-section">
        <div className="home-section__head">
          <h2>🔥 인기 지도</h2>
        </div>
        {recommendedMaps.length > 0 ? (
          <div className="home-map-scroller">
            {recommendedMaps.map((item) => (
              <button
                key={item.id}
                className="rec-card"
                type="button"
                onClick={() => onOpenMap(item.mapId || item.id)}
                style={{ "--rec-start": item.gradient?.[0] || "#667eea", "--rec-end": item.gradient?.[1] || "#764ba2" }}
              >
                <div className="rec-card__emoji-row">
                  {(item.emojis || []).slice(0, 4).map((e, i) => (
                    <span key={`${e}-${i}`}>{e}</span>
                  ))}
                </div>
                <div className="rec-card__body">
                  <strong className="rec-card__title">{item.title}</strong>
                  {item.creator ? <span className="rec-card__creator">{item.creator}</span> : null}
                  <span className="rec-card__count">📍 {item.placeCount || 0}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="home-section__empty">아직 발행된 지도가 없어요</div>
        )}
      </div>

      {/* ─── 3. 모두의 지도 ─── */}
      <div className="home-section">
        <div className="home-section__head">
          <h2>🗺 모두의 지도</h2>
          <button className="home-section__link" type="button" onClick={onOpenCommunityEditor}>
            열기 →
          </button>
        </div>
        <div className="home-community-map">
          <MapErrorBoundary>
            <NaverMap
              features={communityMapFeatures}
              selectedFeatureId={null}
              draftPoints={[]}
              draftMode="browse"
              focusPoint={null}
              fitTrigger={0}
              onMapTap={undefined}
              onFeatureTap={() => {}}
              showLabels={true}
            />
          </MapErrorBoundary>
        </div>
      </div>

      {/* ─── 4. 내 근처 이벤트 ─── */}
      <div className="home-section">
        <div className="home-section__head">
          <h2>🎪 내 근처 이벤트</h2>
        </div>
        <div className="home-section__empty">근처 진행 중인 이벤트가 없어요</div>
      </div>
    </section>
  )
}
