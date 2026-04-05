import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, X, MapPin, Target, Medal, Map as MapIcon, Flame, Navigation, ChevronRight, Trophy } from "lucide-react"
import { MapErrorBoundary } from "../components/MapErrorBoundary"
import { MapRenderer as NaverMap } from "../components/MapRenderer"
import { getLevelProgress, getEarnedBadges, getNextEarnableBadge, LEVELS } from "../data/gamification"

export function HomeScreen({
  recommendedMaps,
  communityMapFeatures,
  onOpenMap,
  onOpenCommunityEditor,
  userStats,
  viewerProfile,
  souvenirs = [],
}) {
  const xp = userStats?.xp || 0
  const levelInfo = useMemo(() => getLevelProgress(xp), [xp])
  const earnedBadges = useMemo(() => getEarnedBadges(userStats || {}), [userStats])
  const nextBadge = useMemo(() => getNextEarnableBadge(userStats || {}), [userStats])
  const streak = userStats?.streak || 0
  const nickname = viewerProfile?.name || "탐험가"

  // 내 위치
  const [myLocation, setMyLocation] = useState(null)
  const [mapFitTrigger, setMapFitTrigger] = useState(0)

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
          setMapFitTrigger((t) => t + 1)
        },
        () => {},
        { timeout: 5000 },
      )
    }
  }, [])

  // 근처 이벤트 가져오기
  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [eventsNearby, setEventsNearby] = useState(false)
  const [eventsRadiusKm, setEventsRadiusKm] = useState(null)

  // 이벤트 상세
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [eventDetail, setEventDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [overviewExpanded, setOverviewExpanded] = useState(false)
  const [showEventList, setShowEventList] = useState(false)
  const [showLevelChart, setShowLevelChart] = useState(false)

  const applyFetchResult = (data) => {
    setEvents(data.items?.length > 0 ? data.items : [])
    setEventsRadiusKm(data.radiusKm || null)
  }

  const fetchEvents = async (lat, lng) => {
    const url = lat && lng
      ? `/api/events?lat=${lat}&lng=${lng}&_t=${Date.now()}`
      : `/api/events?_t=${Date.now()}`
    const resp = await fetch(url, { cache: "no-store" })
    return resp.json()
  }

  useEffect(() => {
    let cancelled = false
    // eventsLoading 초기값이 true이므로 여기서 재설정 불필요
    fetchEvents(null, null)
      .then((data) => { if (!cancelled) applyFetchResult(data) })
      .catch(() => { if (!cancelled) { setEvents([]); setEventsRadiusKm(null) } })
      .finally(() => { if (!cancelled) setEventsLoading(false) })
    return () => { cancelled = true }
  }, [])

  const loadNearbyEvents = () => {
    const go = (lat, lng) => {
      setEventsNearby(true)
      setEventsLoading(true)
      fetchEvents(lat, lng)
        .then(applyFetchResult)
        .catch(() => { setEvents([]); setEventsRadiusKm(null) })
        .finally(() => setEventsLoading(false))
    }
    if (myLocation) return go(myLocation.lat, myLocation.lng)
    if (!navigator.geolocation) return
    setEventsLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        go(pos.coords.latitude, pos.coords.longitude)
      },
      () => { setEventsLoading(false) },
      { timeout: 8000 },
    )
  }

  const loadAllEvents = () => {
    setEventsNearby(false)
    setEventsLoading(true)
    fetchEvents(null, null)
      .then(applyFetchResult)
      .catch(() => { setEvents([]); setEventsRadiusKm(null) })
      .finally(() => setEventsLoading(false))
  }

  const openEventDetail = async (event) => {
    setSelectedEvent(event)
    setEventDetail(null)
    setDetailLoading(true)
    setOverviewExpanded(false)
    try {
      const resp = await fetch(`/api/event-detail?contentId=${event.id}`)
      const data = await resp.json()
      if (data.detail) setEventDetail(data.detail)
    } catch { /* 폴백: 기본 정보만 표시 */ }
    setDetailLoading(false)
  }

  // 날짜 포맷 (20260403 → 4.3)
  const formatEventDate = (dateStr) => {
    if (!dateStr || dateStr.length !== 8) return ""
    return `${parseInt(dateStr.slice(4, 6))}.${parseInt(dateStr.slice(6, 8))}`
  }

  // 행사 상태 뱃지
  const now = new Date()
  const todayStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`
  const getEventStatus = (startDate, endDate) => {
    if (!startDate || !endDate) return null
    const todayNum = parseInt(todayStr)
    const start = parseInt(startDate)
    const end = parseInt(endDate)
    if (todayNum >= start && todayNum <= end) return { label: "진행 중", className: "event-badge--active" }
    if (start > todayNum) {
      const s = new Date(parseInt(startDate.slice(0, 4)), parseInt(startDate.slice(4, 6)) - 1, parseInt(startDate.slice(6, 8)))
      const diff = Math.ceil((s - now) / (1000 * 60 * 60 * 24))
      return { label: `D-${diff}`, className: "event-badge--upcoming" }
    }
    return null
  }

  return (
    <section className="screen screen--scroll">
      {/* ─── 1. 프로필 카드 ─── */}
      <div className="home-profile-simple">
        <div className="home-profile-simple__header">
          <span className="home-profile-simple__emoji" style={{ background: levelInfo.current.bgColor || "#E6F1FB" }}>
            <img src={levelInfo.current.icon} alt={levelInfo.current.cloudName} className="home-profile-simple__cloud" />
          </span>
          <div className="home-profile-simple__info">
            <div className="home-profile-simple__top">
              <strong>{nickname}</strong>
              <span className="home-profile-simple__tag" style={{ background: levelInfo.current.badgeBg, color: levelInfo.current.badgeText }}>{levelInfo.current.title}</span>
              <button className="home-profile-simple__level-btn" type="button" onClick={() => setShowLevelChart(true)}>등급표</button>
            </div>
            <div className="home-profile-simple__xp-row">
              <div className="home-profile-simple__bar">
                <div className="home-profile-simple__fill" style={{ width: `${Math.round(levelInfo.progress * 100)}%` }} />
              </div>
              <span className="home-profile-simple__xp">{levelInfo.next ? `${xp}/${levelInfo.next.minXp}` : `${xp} MAX`}</span>
            </div>
          </div>
        </div>

        <div className="home-profile-simple__stats">
          <span><MapPin size={13} /> {userStats?.pins || 0}</span>
          <span><Target size={13} /> {userStats?.checkins || 0}</span>
          <span><Medal size={13} /> {userStats?.completions || 0}</span>
          <span><MapIcon size={13} /> {userStats?.maps || 0}</span>
          {streak > 0 ? <span className="home-profile-simple__streak"><Flame size={13} /> {streak}일</span> : null}
        </div>

      </div>

      {/* ─── 업적 배너 ─── */}
      {earnedBadges.length > 0 || nextBadge ? (
        <div className="home-achievement-banner">
          <div className="home-achievement-banner__icon">
            <Trophy size={18} />
          </div>
          <div className="home-achievement-banner__text">
            {earnedBadges.length > 0 ? (
              <strong>{earnedBadges[earnedBadges.length - 1].emoji} {earnedBadges[earnedBadges.length - 1].name} 달성!</strong>
            ) : null}
            {nextBadge ? (
              <span>다음 목표: {nextBadge.emoji} {nextBadge.desc}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ─── 수비니어 컬렉션 ─── */}
      {souvenirs.length > 0 ? (
        <div className="home-section">
          <div className="home-section__head">
            <h2>수비니어</h2>
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
          <h2>인기 지도</h2>
        </div>
        {recommendedMaps.length > 0 ? (
          <div className="home-map-scroller">
            {recommendedMaps.map((item) => {
              const tags = (item.tags || []).slice(0, 2)
              return (
                <button
                  key={item.id}
                  className="rec-card"
                  type="button"
                  onClick={() => onOpenMap(item.mapId || item.id)}
                  style={{ "--rec-start": item.gradient?.[0] || "#E1F5EE", "--rec-end": item.gradient?.[1] || "#FFF4EB" }}
                >
                  <div className="rec-card__minimap">
                    {(item.emojis || []).slice(0, 5).map((e, i) => (
                      <span key={`${e}-${i}`} className="rec-card__pin-dot" style={{ left: `${15 + i * 18}%`, top: `${20 + (i % 3) * 25}%` }} />
                    ))}
                  </div>
                  <div className="rec-card__body">
                    {tags.length > 0 ? (
                      <div className="rec-card__tags">
                        {tags.map((t) => <span key={t} className="rec-card__tag">{t}</span>)}
                      </div>
                    ) : null}
                    <strong className="rec-card__title">{item.title}</strong>
                    <div className="rec-card__meta">
                      {item.creator ? <span>{item.creator}</span> : null}
                      <span><MapPin size={11} /> {item.placeCount || 0}</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="home-section__empty">아직 발행된 지도가 없어요</div>
        )}
      </div>

      {/* ─── 3. 모두의 지도 ─── */}
      <div className="home-section">
        <div className="home-section__head">
          <div>
            <h2>모두의 지도</h2>
            <p className="home-section__desc">내 근처 추천 장소를 공유해보세요</p>
          </div>
          <button className="home-section__cta" type="button" onClick={onOpenCommunityEditor}>
            참여하기
          </button>
        </div>
        <div className="home-community-map">
          <MapErrorBoundary>
            <NaverMap
              features={communityMapFeatures}
              selectedFeatureId={null}
              draftPoints={[]}
              draftMode="browse"
              focusPoint={myLocation}
              fitTrigger={mapFitTrigger}
              onMapTap={undefined}
              onFeatureTap={() => {}}
              showLabels={true}
              myLocation={myLocation}
              levelEmoji={levelInfo.current.icon}
            />
          </MapErrorBoundary>
        </div>
      </div>

      {/* ─── 4. 내 근처 이벤트 ─── */}
      <div className="home-section">
        <div className="home-section__head">
          <h2>{eventsNearby ? `내 근처 이벤트${eventsRadiusKm ? ` (${eventsRadiusKm}km)` : ""}` : "진행 중인 이벤트"}</h2>
          <button className={`home-event-locate${eventsNearby ? " is-active" : ""}`} type="button" onClick={eventsNearby ? loadAllEvents : loadNearbyEvents}>
            <Navigation size={12} /> {eventsNearby ? "내 근처" : "내 위치"}
          </button>
        </div>
        {eventsLoading ? (
          <div className="home-section__empty">이벤트를 불러오는 중...</div>
        ) : events.length === 0 ? (
          <div className="home-section__empty">{eventsNearby ? "100km 이내 진행 중인 이벤트가 없어요" : "진행 중인 이벤트가 없어요"}</div>
        ) : (
          <>
            <div className="home-event-list">
              {events.slice(0, 4).map((event) => (
                <article key={event.id} className="event-card" onClick={() => openEventDetail(event)} style={{ cursor: "pointer" }}>
                  {event.image ? (
                    <div className="event-card__img" style={{ backgroundImage: `url(${event.image})` }} />
                  ) : (
                    <div className="event-card__img event-card__img--empty">🎪</div>
                  )}
                  <div className="event-card__body">
                    <div className="event-card__title-row">
                      <strong className="event-card__title">{event.title}</strong>
                      {(() => {
                        const status = getEventStatus(event.startDate, event.endDate)
                        return status ? <span className={`event-badge ${status.className}`}>{status.label}</span> : null
                      })()}
                    </div>
                    {event.startDate ? (
                      <span className="event-card__date">
                        {formatEventDate(event.startDate)}~{formatEventDate(event.endDate)}
                      </span>
                    ) : null}
                    {event.addr ? <span className="event-card__addr">{event.distKm != null ? `${event.distKm}km · ` : ""}{event.addr}</span> : null}
                  </div>
                </article>
              ))}
            </div>
            {events.length > 4 ? (
              <button className="home-event-more" type="button" onClick={() => setShowEventList(true)}>
                더보기 ({events.length - 4}개)
              </button>
            ) : null}
          </>
        )}
      </div>
      {/* ─── 이벤트 전체 목록 화면 ─── */}
      {showEventList ? (
        <div className="event-list-screen">
          <div className="event-list-screen__header">
            <button className="event-list-screen__back" type="button" onClick={() => setShowEventList(false)}><ArrowLeft size={20} /></button>
            <h2>이벤트 목록</h2>
            <span className="event-list-screen__count">{events.length}건</span>
          </div>
          <div className="event-list-screen__body">
            {events.map((event) => (
              <article key={event.id} className="event-card" onClick={() => { setShowEventList(false); openEventDetail(event) }} style={{ cursor: "pointer" }}>
                {event.image ? (
                  <div className="event-card__img" style={{ backgroundImage: `url(${event.image})` }} />
                ) : (
                  <div className="event-card__img event-card__img--empty">🎪</div>
                )}
                <div className="event-card__body">
                  <div className="event-card__title-row">
                    <strong className="event-card__title">{event.title}</strong>
                    {(() => {
                      const status = getEventStatus(event.startDate, event.endDate)
                      return status ? <span className={`event-badge ${status.className}`}>{status.label}</span> : null
                    })()}
                  </div>
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
        </div>
      ) : null}

      {/* ─── 등급표 모달 ─── */}
      {showLevelChart ? (
        <div className="level-chart-overlay" onClick={() => setShowLevelChart(false)}>
          <div className="level-chart-modal" onClick={(e) => e.stopPropagation()}>
            <div className="level-chart-modal__header">
              <h3>등급표</h3>
              <button type="button" onClick={() => setShowLevelChart(false)}><X size={18} /></button>
            </div>
            <div className="level-chart-modal__list">
              {LEVELS.map((lvl) => {
                const isCurrent = lvl.level === levelInfo.current.level
                const isLocked = lvl.level > levelInfo.current.level
                return (
                  <div key={lvl.level} className={`level-chart-item${isCurrent ? " is-current" : ""}${isLocked ? " is-locked" : ""}`}>
                    <span className="level-chart-item__emoji" style={{ background: lvl.bgColor }}>
                      <img src={lvl.icon} alt={lvl.cloudName} className="level-chart-item__cloud" />
                    </span>
                    <div className="level-chart-item__info">
                      <strong>Lv.{lvl.level} {lvl.cloudName || lvl.title}</strong>
                      <span>{lvl.title} · {lvl.minXp === 0 ? "시작" : `${lvl.minXp} XP`}</span>
                    </div>
                    {isCurrent ? <span className="level-chart-item__current">현재</span> : null}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}

      {/* ─── 이벤트 상세 바텀시트 ─── */}
      {selectedEvent ? (
        <div className="event-detail-overlay" onClick={() => setSelectedEvent(null)}>
          <div className="event-detail-sheet" onClick={(e) => e.stopPropagation()}>
            <button className="event-detail-sheet__close" type="button" onClick={() => setSelectedEvent(null)}><X size={18} /></button>

            {/* 이미지 */}
            {(eventDetail?.image || selectedEvent.image) ? (
              <div className="event-detail-sheet__hero" style={{ backgroundImage: `url(${eventDetail?.image || selectedEvent.image})` }} />
            ) : (
              <div className="event-detail-sheet__hero event-detail-sheet__hero--empty">🎪</div>
            )}

            <div className="event-detail-sheet__body">
              <h2 className="event-detail-sheet__title">{eventDetail?.title || selectedEvent.title}</h2>

              {detailLoading ? (
                <p className="event-detail-sheet__loading">정보를 불러오는 중...</p>
              ) : eventDetail ? (
                <>
                  {/* 기본 정보 */}
                  <div className="event-detail-sheet__info-grid">
                    {eventDetail.eventStartDate ? (
                      <div className="event-detail-sheet__info-row">
                        <span className="event-detail-sheet__label">📅 기간</span>
                        <span>{formatEventDate(eventDetail.eventStartDate)} ~ {formatEventDate(eventDetail.eventEndDate)}</span>
                      </div>
                    ) : null}
                    {eventDetail.eventPlace ? (
                      <div className="event-detail-sheet__info-row">
                        <span className="event-detail-sheet__label">📍 장소</span>
                        <span>{eventDetail.eventPlace}</span>
                      </div>
                    ) : null}
                    {eventDetail.addr ? (
                      <div className="event-detail-sheet__info-row">
                        <span className="event-detail-sheet__label">🗺 주소</span>
                        <span>{eventDetail.addr} {eventDetail.addrDetail}</span>
                      </div>
                    ) : null}
                    {eventDetail.playTime ? (
                      <div className="event-detail-sheet__info-row">
                        <span className="event-detail-sheet__label">⏰ 시간</span>
                        <span>{eventDetail.playTime}</span>
                      </div>
                    ) : null}
                    {eventDetail.useTimeFestival ? (
                      <div className="event-detail-sheet__info-row">
                        <span className="event-detail-sheet__label">💰 이용요금</span>
                        <span>{eventDetail.useTimeFestival}</span>
                      </div>
                    ) : null}
                    {eventDetail.ageLimit ? (
                      <div className="event-detail-sheet__info-row">
                        <span className="event-detail-sheet__label">👤 이용대상</span>
                        <span>{eventDetail.ageLimit}</span>
                      </div>
                    ) : null}
                    {eventDetail.sponsor ? (
                      <div className="event-detail-sheet__info-row">
                        <span className="event-detail-sheet__label">🏢 주최</span>
                        <span>{eventDetail.sponsor}</span>
                      </div>
                    ) : null}
                    {eventDetail.tel || eventDetail.sponsorTel ? (
                      <div className="event-detail-sheet__info-row">
                        <span className="event-detail-sheet__label">📞 연락처</span>
                        <span>{eventDetail.tel || eventDetail.sponsorTel}</span>
                      </div>
                    ) : null}
                  </div>

                  {/* 프로그램 */}
                  {eventDetail.program ? (
                    <div className="event-detail-sheet__section">
                      <h3>프로그램</h3>
                      <p>{eventDetail.program}</p>
                    </div>
                  ) : null}

                  {/* 개요 */}
                  {eventDetail.overview ? (
                    <div className="event-detail-sheet__section">
                      <h3>소개</h3>
                      <p className={overviewExpanded ? "" : "event-detail-sheet__overview-clamp"}>{eventDetail.overview}</p>
                      {eventDetail.overview.length > 120 ? (
                        <button className="event-detail-sheet__more-btn" type="button" onClick={() => setOverviewExpanded(!overviewExpanded)}>
                          {overviewExpanded ? "접기" : "더보기"}
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {/* 홈페이지 */}
                  {eventDetail.homepage ? (
                    <a className="event-detail-sheet__link" href={eventDetail.homepage} target="_blank" rel="noopener noreferrer">
                      🔗 홈페이지 바로가기
                    </a>
                  ) : null}
                </>
              ) : (
                /* API 실패 시 기본 정보 */
                <div className="event-detail-sheet__info-grid">
                  {selectedEvent.startDate ? (
                    <div className="event-detail-sheet__info-row">
                      <span className="event-detail-sheet__label">📅 기간</span>
                      <span>{formatEventDate(selectedEvent.startDate)} ~ {formatEventDate(selectedEvent.endDate)}</span>
                    </div>
                  ) : null}
                  {selectedEvent.addr ? (
                    <div className="event-detail-sheet__info-row">
                      <span className="event-detail-sheet__label">🗺 주소</span>
                      <span>{selectedEvent.addr}</span>
                    </div>
                  ) : null}
                  {selectedEvent.tel ? (
                    <div className="event-detail-sheet__info-row">
                      <span className="event-detail-sheet__label">📞 연락처</span>
                      <span>{selectedEvent.tel}</span>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
