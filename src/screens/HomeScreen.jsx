import { useMemo } from "react"
import { MapErrorBoundary } from "../components/MapErrorBoundary"
import { NaverMap } from "../components/NaverMap"
import { getLevelProgress, getEarnedBadges, getNextEarnableBadge, BADGES } from "../data/gamification"

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
      <div className="section-head" style={{ marginTop: 8 }}>
        <div>
          <h2 className="section-head__title">인기 지도</h2>
          <p className="section-head__subtitle">사람들이 많이 찾는 지도</p>
        </div>
      </div>

      {recommendedMaps.length > 0 ? (
        <div className="recommended-scroller">
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
        <p style={{ textAlign: "center", color: "#999", fontSize: "0.82rem", padding: "16px" }}>
          아직 발행된 지도가 없어요.
        </p>
      )}

      {/* ─── 3. 모두의 지도 ─── */}
      <div className="section-head" style={{ marginTop: 8 }}>
        <div>
          <h2 className="section-head__title">모두의 지도</h2>
          <p className="section-head__subtitle">모두가 함께 만드는 지도</p>
        </div>
        <button className="button button--primary" type="button" onClick={onOpenCommunityEditor}>
          지도 열기
        </button>
      </div>

      <div className="community-map-wrap">
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

      {/* ─── 4. 내 근처 이벤트 (placeholder) ─── */}
      <div className="section-head" style={{ marginTop: 8 }}>
        <div>
          <h2 className="section-head__title">내 근처 이벤트</h2>
          <p className="section-head__subtitle">참여할 수 있는 이벤트를 찾아보세요</p>
        </div>
      </div>

      <div className="home-events-empty">
        <span>🎪</span>
        <p>근처 진행 중인 이벤트가 없어요</p>
      </div>
    </section>
  )
}
