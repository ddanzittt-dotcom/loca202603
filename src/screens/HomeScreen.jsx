import { useEffect, useMemo, useState } from "react"
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
  souvenirs = [],
}) {
  const xp = userStats?.xp || 0
  const levelInfo = useMemo(() => getLevelProgress(xp), [xp])
  const earnedBadges = useMemo(() => getEarnedBadges(userStats || {}), [userStats])
  const nextBadge = useMemo(() => getNextEarnableBadge(userStats || {}), [userStats])
  const streak = userStats?.streak || 0
  const nickname = viewerProfile?.name || "탐험가"

  // 근처 이벤트 가져오기
  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const SAMPLE_EVENTS = [
      { id: "s1", title: "2026 서울 봄꽃축제", addr: "서울특별시 종로구 사직로 161", image: "", startDate: "20260401", endDate: "20260415", lat: 37.5711, lng: 126.9767 },
      { id: "s2", title: "수원화성 문화제", addr: "경기도 수원시 팔달구 정조로 825", image: "", startDate: "20260405", endDate: "20260407", lat: 37.2866, lng: 127.0101 },
      { id: "s3", title: "부산 해운대 모래축제", addr: "부산광역시 해운대구 해운대해변로 264", image: "", startDate: "20260410", endDate: "20260420", lat: 35.1587, lng: 129.1604 },
      { id: "s4", title: "제주 유채꽃 페스티벌", addr: "제주특별자치도 서귀포시 표선면", image: "", startDate: "20260401", endDate: "20260430", lat: 33.3253, lng: 126.8428 },
      { id: "s5", title: "경주 벚꽃 마라톤", addr: "경상북도 경주시 보문로 544-1", image: "", startDate: "20260412", endDate: "20260412", lat: 35.8428, lng: 129.2267 },
    ]

    async function fetchEvents(lat, lng) {
      try {
        const params = lat && lng ? `?lat=${lat}&lng=${lng}` : ""
        const resp = await fetch(`/api/events${params}`)
        const data = await resp.json()
        const items = data.items || []
        if (!cancelled) setEvents(items.length > 0 ? items : SAMPLE_EVENTS)
      } catch {
        if (!cancelled) setEvents(SAMPLE_EVENTS)
      } finally {
        if (!cancelled) setEventsLoading(false)
      }
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchEvents(pos.coords.latitude, pos.coords.longitude),
        () => fetchEvents(null, null),
        { timeout: 5000 },
      )
    } else {
      fetchEvents(null, null)
    }

    return () => { cancelled = true }
  }, [])

  // 날짜 포맷 (20260403 → 4.3)
  const formatEventDate = (dateStr) => {
    if (!dateStr || dateStr.length !== 8) return ""
    return `${parseInt(dateStr.slice(4, 6))}.${parseInt(dateStr.slice(6, 8))}`
  }

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

        {/* 최근 배지/수비니어 + 다음 목표 */}
        <div className="home-reward-row">
          {earnedBadges.length > 0 ? (
            <span className="home-reward-chip">{earnedBadges[earnedBadges.length - 1].emoji} {earnedBadges[earnedBadges.length - 1].name}</span>
          ) : souvenirs.length > 0 ? (
            <span className="home-reward-chip">{souvenirs[0].meta?.emoji || "🏆"} {souvenirs[0].meta?.title || souvenirs[0].souvenir_code}</span>
          ) : null}
          {nextBadge ? (
            <span className="home-next-goal">다음: {nextBadge.emoji} {nextBadge.desc}</span>
          ) : null}
        </div>

        {/* 오늘의 성장 (매일 리셋) */}
        {(() => {
          const cap = userStats?.dailyCap || 30
          const axes = [
            { key: "creator", label: "제작", daily: userStats?.dailyCreator || 0, emoji: "🛠", color: "#635BFF" },
            { key: "explorer", label: "탐험", daily: userStats?.dailyExplorer || 0, emoji: "🧭", color: "#10B981" },
            { key: "influence", label: "영향력", daily: userStats?.dailyInfluence || 0, emoji: "📢", color: "#F97316" },
            { key: "trust", label: "신뢰", daily: userStats?.dailyTrust || 0, emoji: "🤝", color: "#0EA5E9" },
          ]
          const quests = [
            { axis: "creator", name: "지도 만들기", xp: 20 },
            { axis: "creator", name: "핀 추가", xp: 5 },
            { axis: "creator", name: "경로 추가", xp: 10 },
            { axis: "explorer", name: "체크인", xp: 15 },
            { axis: "explorer", name: "행사 완주", xp: 50 },
            { axis: "explorer", name: "지도 가져오기", xp: 10 },
            { axis: "influence", name: "지도 발행", xp: 30 },
            { axis: "trust", name: "메모 보강", xp: 1 },
            { axis: "trust", name: "설문 제출", xp: 5 },
          ]
          const dailyByKey = { creator: userStats?.dailyCreator || 0, explorer: userStats?.dailyExplorer || 0, influence: userStats?.dailyInfluence || 0, trust: userStats?.dailyTrust || 0 }
          const todayTotal = axes.reduce((s, a) => s + a.daily, 0)

          return (
            <div className="home-spec-axes">
              {axes.map((axis) => {
                const pct = Math.min(100, Math.round((axis.daily / cap) * 100))
                const done = axis.daily >= cap
                return (
                  <div key={axis.key} className={`home-spec-axis${done ? " is-done" : ""}`}>
                    <span className="home-spec-axis__label">{axis.emoji} {axis.label}</span>
                    <div className="home-spec-axis__bar">
                      <div className="home-spec-axis__fill" style={{ width: `${pct}%`, background: axis.color }} />
                    </div>
                    <span className="home-spec-axis__pct">{done ? "✓" : `${axis.daily}/${cap}`}</span>
                  </div>
                )
              })}
              <div className="home-quest-row">
                {quests.map((q) => {
                  const done = dailyByKey[q.axis] >= cap
                  return (
                    <span key={q.name} className={`home-quest-chip${done ? " is-done" : ""}`}>
                      {done ? "✓ " : ""}{q.name} +{q.xp}
                    </span>
                  )
                })}
              </div>
              <span className="home-spec-daily-total">오늘 +{todayTotal} / {cap * 4} XP</span>
            </div>
          )
        })()}
      </div>

      {/* ─── 수비니어 컬렉션 ─── */}
      {souvenirs.length > 0 ? (
        <div className="home-section">
          <div className="home-section__head">
            <h2>🏆 수비니어</h2>
          </div>
          <div className="home-souvenir-row">
            {souvenirs.map((s) => (
              <div key={s.id || s.souvenir_id} className="souvenir-chip">
                <span className="souvenir-chip__emoji">{s.emoji || "🏆"}</span>
                <span className="souvenir-chip__title">{s.title}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
          <div>
            <h2>🗺 모두의 지도</h2>
            <p className="home-section__desc">나만 아는 장소를 공유하고, 다른 사람의 추천도 만나보세요!</p>
          </div>
          <button className="home-section__link" type="button" onClick={onOpenCommunityEditor}>
            참여 →
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
        {eventsLoading ? (
          <div className="home-section__empty">이벤트를 불러오는 중...</div>
        ) : events.length === 0 ? (
          <div className="home-section__empty">근처 진행 중인 이벤트가 없어요</div>
        ) : (
          <div className="home-event-list">
            {events.map((event) => (
              <article key={event.id} className="event-card">
                {event.image ? (
                  <div className="event-card__img" style={{ backgroundImage: `url(${event.image})` }} />
                ) : (
                  <div className="event-card__img event-card__img--empty">🎪</div>
                )}
                <div className="event-card__body">
                  <strong className="event-card__title">{event.title}</strong>
                  {event.startDate ? (
                    <span className="event-card__date">
                      {formatEventDate(event.startDate)}~{formatEventDate(event.endDate)}
                    </span>
                  ) : null}
                  {event.addr ? <span className="event-card__addr">{event.addr}</span> : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
