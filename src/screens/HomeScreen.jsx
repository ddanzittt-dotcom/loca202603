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
      {/* ─── 1. 탐험가 프로필 카드 ─── */}
      <div className="home-profile-card">
        <div className="home-profile-card__top">
          <div className="home-profile-card__greeting">
            <span className="home-profile-card__level-emoji">{levelInfo.current.emoji}</span>
            <div>
              <strong className="home-profile-card__name">{nickname}</strong>
              <span className="home-profile-card__level-title">{levelInfo.current.title}</span>
            </div>
          </div>
          <div className="home-profile-card__xp-label">{xp} XP</div>
        </div>

        {/* 경험치 바 */}
        <div className="home-xp-bar">
          <div className="home-xp-bar__track">
            <div
              className="home-xp-bar__fill"
              style={{ width: `${Math.round(levelInfo.progress * 100)}%` }}
            />
          </div>
          {levelInfo.next ? (
            <span className="home-xp-bar__next">
              {levelInfo.next.emoji} {levelInfo.next.title}까지 {levelInfo.remaining} XP
            </span>
          ) : (
            <span className="home-xp-bar__next">최고 등급 달성!</span>
          )}
        </div>

        {/* 핵심 통계 */}
        <div className="home-stats-row">
          <div className="home-stat">
            <strong>{userStats?.pins || 0}</strong>
            <span>핀</span>
          </div>
          <div className="home-stat">
            <strong>{userStats?.checkins || 0}</strong>
            <span>체크인</span>
          </div>
          <div className="home-stat">
            <strong>{userStats?.completions || 0}</strong>
            <span>완주</span>
          </div>
          <div className="home-stat">
            <strong>{userStats?.maps || 0}</strong>
            <span>지도</span>
          </div>
          {streak > 0 ? (
            <div className="home-stat home-stat--streak">
              <strong>{streak}일</strong>
              <span>연속</span>
            </div>
          ) : null}
        </div>

        {/* 뱃지 미리보기 */}
        {earnedBadges.length > 0 || nextBadge ? (
          <div className="home-badges">
            {earnedBadges.slice(0, 4).map((b) => (
              <div key={b.id} className="home-badge is-earned" title={b.name}>
                <span>{b.emoji}</span>
              </div>
            ))}
            {BADGES.length - earnedBadges.length > 0 ? (
              <div className="home-badge home-badge--remaining">
                +{BADGES.length - earnedBadges.length}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* 넛지 메시지 */}
        {nextBadge ? (
          <div className="home-nudge">
            <span>{nextBadge.emoji}</span>
            <span>{nextBadge.desc}하면 <strong>"{nextBadge.name}"</strong> 뱃지를 받아요!</span>
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
