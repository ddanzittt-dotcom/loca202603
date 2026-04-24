import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, X, MapPin, Navigation, ChevronRight, Sparkles } from "lucide-react"
import { MapErrorBoundary } from "../components/MapErrorBoundary"
import { MapRenderer as NaverMap } from "../components/MapRenderer"
import { getLevelProgress, LEVELS } from "../data/gamification"
import { isEventMap } from "../lib/mapPlacement"

// "이어서 기록하기" 카드용 간단 상대시간 포맷 (ui.jsx 의 formatRelativeDate 와 동일)
function formatUpdatedAt(dateStr) {
  if (!dateStr) return ""
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (diff <= 0) return "오늘 수정"
  if (diff === 1) return "어제 수정"
  if (diff < 7) return `${diff}일 전 수정`
  if (diff < 30) return `${Math.floor(diff / 7)}주 전 수정`
  return `${Math.floor(diff / 30)}달 전 수정`
}

function formatCount(n) {
  if (n < 10000) return n.toString()
  if (n < 100000) return `${Math.floor(n / 10000)}만`
  return "10만+"
}

function HeroStatItem({ value, label, tip, isLast, activeTooltip, index, onTap }) {
  const isZero = !value || value === 0
  return (
    <button
      type="button"
      className={`hero-stat${isLast ? " hero-stat--last" : ""}${isZero ? " hero-stat--zero" : " hero-stat--active"}`}
      onClick={() => onTap(index)}
    >
      <span className={`hero-stat__num${activeTooltip === index ? " is-active" : ""}`}>{formatCount(value)}</span>
      <span className="hero-stat__label">{label}</span>
      <span className={`hero-stat__tip${activeTooltip === index ? " is-visible" : ""}`}>
        {tip}
        <span className="hero-stat__tip-arrow" />
      </span>
    </button>
  )
}

export function HomeScreen({
  recommendedMaps,
  communityMapFeatures,
  communityRequestSummary = null,
  onOpenMap,
  onOpenCommunityEditor,
  onResumeMyMap,
  onCreateMap,
  userStats,
  viewerProfile,
  maps = [],
  features = [],
  followedCount = 0,
}) {
  const xp = userStats?.xp || 0
  const levelInfo = useMemo(() => getLevelProgress(xp), [xp])
  const nickname = viewerProfile?.name || "탐험가"

  // 히어로 카드 통계
  const placeCount = features.length
  const mapCount = maps.length
  const recordCount = userStats?.records || userStats?.memos || 0
  const followerCount = viewerProfile?.followers || 0
  const followingCount = followedCount
  const myPendingRequests = communityRequestSummary?.mine || []
  const incomingRequests = communityRequestSummary?.incoming || []
  const hasRequestSummary = myPendingRequests.length > 0 || incomingRequests.length > 0

  // "이어서 기록하기" / "첫 기록 시작하기" 분기 계산
  //   분기 A: 내 지도(non-event) 0개                       → 첫 기록 시작하기 카드
  //   분기 B: 피처 보유 + 30일 이내 수정된 non-event 지도   → 이어서 기록하기 카드 (가장 최근 1개)
  //   분기 C: 그 외                                        → 섹션 숨김
  const resumeState = useMemo(() => {
    const myMaps = maps.filter((map) => !isEventMap(map))
    if (myMaps.length === 0) {
      return { mode: "first" }
    }

    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000
    const now = Date.now()
    // 피처가 1개 이상 있는 지도만 후보로 추린다 — 제목만 수정된 빈 지도 제외.
    const featureCountByMapId = new Map()
    for (const feature of features) {
      if (!feature.mapId) continue
      featureCountByMapId.set(feature.mapId, (featureCountByMapId.get(feature.mapId) || 0) + 1)
    }

    const withFeatures = myMaps.filter((map) => (featureCountByMapId.get(map.id) || 0) > 0)
    if (withFeatures.length === 0) {
      return { mode: "hidden" }
    }

    const recent = withFeatures
      .filter((map) => {
        const updated = new Date(map.updatedAt || 0).getTime()
        return Number.isFinite(updated) && now - updated <= THIRTY_DAYS
      })
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))

    if (recent.length === 0) {
      return { mode: "hidden" }
    }
    const picked = recent[0]
    return {
      mode: "resume",
      map: picked,
      placeCount: featureCountByMapId.get(picked.id) || 0,
    }
  }, [maps, features])

  // 히어로 카드 툴팁
  const [activeTooltip, setActiveTooltip] = useState(null)
  const handleStatTap = (index) => {
    setActiveTooltip(activeTooltip === index ? null : index)
  }

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
  const [eventsError, setEventsError] = useState("")
  const eventsRequestRef = useRef(0)

  // 이벤트 상세
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [eventDetail, setEventDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState("")
  const detailAbortRef = useRef(null)
  const [overviewExpanded, setOverviewExpanded] = useState(false)
  const [showEventList, setShowEventList] = useState(false)
  const [showLevelChart, setShowLevelChart] = useState(false)

  const applyFetchResult = (data) => {
    setEvents(data.items?.length > 0 ? data.items : [])
    setEventsError("")
  }

  const getApiErrorMessage = (error, fallbackMessage) => {
    if (typeof error?.message === "string" && error.message.trim()) return error.message
    return fallbackMessage
  }

  const fetchEvents = async (lat, lng) => {
    const url = lat && lng
      ? `/api/events?lat=${lat}&lng=${lng}&_t=${Date.now()}`
      : `/api/events?_t=${Date.now()}`
    const resp = await fetch(url, { cache: "no-store" })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      throw new Error(typeof data?.error === "string" ? data.error : "이벤트를 불러오지 못했어요.")
    }
    return data
  }

  useEffect(() => {
    let cancelled = false
    const requestId = ++eventsRequestRef.current
    // eventsLoading 초기값이 true이므로 여기서 재설정 불필요
    fetchEvents(null, null)
      .then((data) => {
        if (!cancelled && requestId === eventsRequestRef.current) applyFetchResult(data)
      })
      .catch((error) => {
        if (!cancelled && requestId === eventsRequestRef.current) {
          setEvents([])
          setEventsError(getApiErrorMessage(error, "이벤트를 불러오지 못했어요."))
        }
      })
      .finally(() => {
        if (!cancelled && requestId === eventsRequestRef.current) setEventsLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const loadNearbyEvents = () => {
    const go = (lat, lng) => {
      const requestId = ++eventsRequestRef.current
      setEventsNearby(true)
      setEventsLoading(true)
      setEventsError("")
      fetchEvents(lat, lng)
        .then((data) => {
          if (requestId === eventsRequestRef.current) applyFetchResult(data)
        })
        .catch((error) => {
          if (requestId === eventsRequestRef.current) {
            setEvents([])
            setEventsError(getApiErrorMessage(error, "근처 이벤트를 불러오지 못했어요."))
          }
        })
        .finally(() => {
          if (requestId === eventsRequestRef.current) setEventsLoading(false)
        })
    }
    if (myLocation) return go(myLocation.lat, myLocation.lng)
    if (!navigator.geolocation) return
    setEventsLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        go(pos.coords.latitude, pos.coords.longitude)
      },
      () => {
        setEventsLoading(false)
        setEventsError("위치 권한이 없어 근처 이벤트를 불러오지 못했어요.")
      },
      { timeout: 8000 },
    )
  }

  const loadAllEvents = () => {
    const requestId = ++eventsRequestRef.current
    setEventsNearby(false)
    setEventsLoading(true)
    setEventsError("")
    fetchEvents(null, null)
      .then((data) => {
        if (requestId === eventsRequestRef.current) applyFetchResult(data)
      })
      .catch((error) => {
        if (requestId === eventsRequestRef.current) {
          setEvents([])
          setEventsError(getApiErrorMessage(error, "이벤트를 불러오지 못했어요."))
        }
      })
      .finally(() => {
        if (requestId === eventsRequestRef.current) setEventsLoading(false)
      })
  }

  const openEventDetail = async (event) => {
    detailAbortRef.current?.abort?.()
    const controller = new AbortController()
    detailAbortRef.current = controller
    setSelectedEvent(event)
    setEventDetail(null)
    setDetailLoading(true)
    setDetailError("")
    setOverviewExpanded(false)
    try {
      const typeParam = event.contentTypeId ? `&contentTypeId=${event.contentTypeId}` : ""
      const resp = await fetch(`/api/event-detail?contentId=${event.id}${typeParam}`, { signal: controller.signal })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "상세 정보를 불러오지 못했어요.")
      }
      if (detailAbortRef.current !== controller) return
      if (data.detail) setEventDetail(data.detail)
      else setDetailError("상세 정보가 비어 있어 기본 정보만 보여줄게요.")
    } catch (error) {
      if (error?.name === "AbortError") return
      if (detailAbortRef.current === controller) {
        setDetailError(getApiErrorMessage(error, "상세 정보를 불러오지 못했어요."))
      }
    } finally {
      if (detailAbortRef.current === controller) {
        setDetailLoading(false)
        detailAbortRef.current = null
      }
    }
  }

  // 날짜 포맷 (20260403 → 4.3)
  // Detail request cleanup on unmount.
  useEffect(() => () => {
    detailAbortRef.current?.abort?.()
  }, [])

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
    <section className="screen screen--scroll home-screen">
      {/* ═══ Band 1: MY RECORDS (forest full-bleed) ═══ */}
      <div className="home-band home-band--mine">
        <div className="home-band__head">
          <div className="home-band__head-left">
            <div className="home-band__eye">MY RECORDS</div>
            <p className="home-band__t">오늘은 어디를 기록해볼까요?</p>
            <p className="home-band__s">내가 남긴 장소가 하나의 지도가 돼요</p>
          </div>
        </div>

      {/* ─── 히어로 카드 ─── */}
      <div className="hero-card" onClick={() => setActiveTooltip(null)} role="presentation">
        {/* blob 장식 */}
        <span className="hero-card__blob hero-card__blob--tr" />
        <span className="hero-card__blob hero-card__blob--bl" />

        {/* 캐릭터 */}
        <div className="hero-card__avatar" style={{ background: levelInfo.current.bgColor || "#E6F1FB" }}>
          <img src={levelInfo.current.icon} alt={levelInfo.current.cloudName} className="hero-card__cloud" />
        </div>

        {/* 정보 */}
        <div className="hero-card__info">
          {/* Row 1: 이름 + 레벨 + 등급표 */}
          <div className="hero-card__row1">
            <span className="hero-card__name">{nickname}</span>
            <span className="hero-card__lv">Lv.{levelInfo.current.level}</span>
            <button className="hero-card__grade-btn" type="button" onClick={(e) => { e.stopPropagation(); setShowLevelChart(true) }}>등급표</button>
          </div>

          {/* Row 2: 등급명 + 프로그레스 + XP */}
          <div className="hero-card__row2">
            <span className="hero-card__title">{levelInfo.current.title}</span>
            <div className="hero-card__bar">
              <div className="hero-card__bar-fill" style={{ width: `${Math.round(levelInfo.progress * 100)}%` }} />
            </div>
            <span className="hero-card__xp">
              {xp}<span className="hero-card__xp-max">/{levelInfo.next ? levelInfo.next.minXp : "MAX"}</span>
            </span>
          </div>

          {/* Row 3: 통계 5칸 */}
          <div className="hero-card__stats" onClick={(e) => e.stopPropagation()} role="presentation">
            <HeroStatItem value={placeCount} label="장소" tip="핀, 경로, 영역 등 맵핑한 장소 수" index={0} activeTooltip={activeTooltip} onTap={handleStatTap} />
            <HeroStatItem value={mapCount} label="지도" tip="내가 만든 지도 개수" index={1} activeTooltip={activeTooltip} onTap={handleStatTap} />
            <HeroStatItem value={recordCount} label="기록" tip="사진, 메모, 음성 등 남긴 기록 수" index={2} activeTooltip={activeTooltip} onTap={handleStatTap} />
            <HeroStatItem value={followerCount} label="팔로워" tip="나를 팔로우하는 사람 수" index={3} activeTooltip={activeTooltip} onTap={handleStatTap} />
            <HeroStatItem value={followingCount} label="팔로잉" tip="내가 팔로우하는 사람 수" index={4} activeTooltip={activeTooltip} onTap={handleStatTap} isLast />
          </div>
        </div>
      </div>

        {/* 이어서 기록하기 / 첫 기록 시작하기 — band-mine 내부 카드 */}
        {resumeState.mode === "first" ? (
          <article
            role="button"
            tabIndex={0}
            className="home-first-card"
            onClick={() => onCreateMap?.()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onCreateMap?.() }}
          >
            <p className="home-first-card__title">첫 지도를 만들어볼까요?</p>
            <p className="home-first-card__sub">내 장소를 모아 하나의 지도로 남겨보세요</p>
            <button
              className="home-first-card__cta"
              type="button"
              onClick={(e) => { e.stopPropagation(); onCreateMap?.() }}
            >
              지도 만들기
            </button>
          </article>
        ) : null}

        {resumeState.mode === "resume" ? (
          <article
            role="button"
            tabIndex={0}
            className="home-mine-card"
            onClick={() => onResumeMyMap?.(resumeState.map.id)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onResumeMyMap?.(resumeState.map.id) }}
          >
            <div className="home-mine-card__icon" aria-hidden="true">
              <MapPin size={19} />
            </div>
            <div className="home-mine-card__info">
              <p className="home-mine-card__title">{resumeState.map.title || "내 지도"}</p>
              <p className="home-mine-card__meta">
                {formatUpdatedAt(resumeState.map.updatedAt)}
                {resumeState.placeCount > 0 ? ` · 장소 ${resumeState.placeCount}개` : ""}
              </p>
            </div>
            <button
              className="home-mine-card__cta"
              type="button"
              onClick={(e) => { e.stopPropagation(); onResumeMyMap?.(resumeState.map.id) }}
            >
              계속 편집
            </button>
          </article>
        ) : null}
      </div>{/* /band-mine */}

      {/* ═══ Band 2: EXPLORE (warm) ═══ */}
      <div className="home-band home-band--explore">
        <div className="home-band__head">
          <div className="home-band__head-left">
            <div className="home-band__eye">EXPLORE</div>
            <p className="home-band__t">둘러보기 좋은 지도</p>
            <p className="home-band__s">다른 사람이 남긴 지도에서 영감을 얻어보세요</p>
          </div>
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
          <div className="home-curated-empty">
            <div className="home-curated-empty__icon">
              <Sparkles size={22} color="#FF6B35" />
            </div>
            <p className="home-curated-empty__title">추천 지도를 준비 중이에요</p>
            <p className="home-curated-empty__desc">곧 만나볼 수 있어요</p>
          </div>
        )}
      </div>{/* /band-explore */}

      {/* ═══ Band 3: COMMUNITY (mint) — 모두의 지도 독립 ═══ */}
      <div className="home-band home-band--community">
        <div className="home-band__head">
          <div className="home-band__head-left">
            <div className="home-band__eye">COMMUNITY</div>
            <p className="home-band__t">모두의 지도</p>
            <p className="home-band__s">내 근처 추천 장소를 공유해보세요</p>
          </div>
          <button className="home-band__action--primary" type="button" onClick={onOpenCommunityEditor}>
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
        {hasRequestSummary ? (
          <div className="home-community-requests">
            {incomingRequests.length > 0 ? (
              <div className="home-community-requests__group">
                <div className="home-community-requests__head">
                  <strong>{"\uB0B4 \uC7A5\uC18C \uC218\uC815 \uC694\uCCAD"}</strong>
                  <span>{incomingRequests.length}건</span>
                </div>
                <ul className="home-community-requests__list">
                  {incomingRequests.slice(0, 3).map((request) => (
                    <li key={`incoming-${request.id}`}>
                      <strong>{request.featureTitle}</strong>
                      <span>{request.requestedByName} · {request.requestedAtLabel}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {myPendingRequests.length > 0 ? (
              <div className="home-community-requests__group">
                <div className="home-community-requests__head">
                  <strong>{"\uB0B4\uAC00 \uBCF4\uB0B8 \uC218\uC815 \uC694\uCCAD"}</strong>
                  <span>{myPendingRequests.length}건</span>
                </div>
                <ul className="home-community-requests__list">
                  {myPendingRequests.slice(0, 3).map((request) => (
                    <li key={`mine-${request.id}`}>
                      <strong>{request.featureTitle}</strong>
                      <span>{request.requestedAtLabel}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <button className="home-community-requests__cta" type="button" onClick={onOpenCommunityEditor}>
              {"\uC694\uCCAD \uD655\uC778\uD558\uAE30"}
              <ChevronRight size={14} />
            </button>
          </div>
        ) : null}
      </div>{/* /band-community */}

      {/* ═══ Band 4: NEARBY (page bg) — 근처 소식 ═══ */}
      <div className="home-band home-band--nearby">
        <div className="home-band__head">
          <div className="home-band__head-left">
            <div className="home-band__eye">NEARBY</div>
            <p className="home-band__t">근처 소식</p>
            <p className="home-band__s">가까이에서 열리는 행사를 살펴보세요</p>
          </div>
          <button className="home-band__action--ghost" type="button" onClick={eventsNearby ? loadAllEvents : loadNearbyEvents}>
            <Navigation size={11} /> {eventsNearby ? "내 근처" : "내 위치"}
          </button>
        </div>
        {eventsLoading ? (
          <div className="home-section__empty">이벤트를 불러오는 중...</div>
        ) : eventsError ? (
          <div className="home-section__empty">
            <p>{eventsError}</p>
            <button className="button button--ghost" type="button" onClick={eventsNearby ? loadNearbyEvents : loadAllEvents}>
              다시 시도
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="home-section__empty">{eventsNearby ? "내 근처 진행 중인 행사가 없어요" : "진행 중인 행사가 없어요"}</div>
        ) : (
          <>
            <div className="home-event-list">
              {events.slice(0, 2).map((event) => {
                const status = getEventStatus(event.startDate, event.endDate)
                const isUpcoming = status && /^D-/.test(status.label)
                const dayNumber = isUpcoming ? status.label.replace(/^D-/, "") : null
                return (
                  <article key={event.id} className="event-card" onClick={() => openEventDetail(event)} style={{ cursor: "pointer" }}>
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
                    {status ? (
                      <div
                        aria-label={status.label}
                        style={{
                          flexShrink: 0,
                          marginLeft: "auto",
                          alignSelf: "center",
                          background: isUpcoming ? "#2D4A3E" : "#E1F5EE",
                          color: isUpcoming ? "#F4C55F" : "#085041",
                          padding: "8px 10px",
                          borderRadius: 10,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          minWidth: 48,
                          lineHeight: 1,
                        }}
                      >
                        {isUpcoming ? (
                          <>
                            <span style={{ fontSize: 13, fontWeight: 500 }}>D-{dayNumber}</span>
                            <span style={{ fontSize: 8, fontWeight: 400, opacity: 0.7, marginTop: 2, letterSpacing: "0.04em" }}>DAYS</span>
                          </>
                        ) : (
                          <span style={{ fontSize: 10, fontWeight: 500 }}>진행 중</span>
                        )}
                      </div>
                    ) : null}
                  </article>
                )
              })}
            </div>
            {events.length > 2 ? (
              <button className="home-event-more" type="button" onClick={() => setShowEventList(true)}>
                더보기 ({events.length - 2}개)
              </button>
            ) : null}
          </>
        )}
      </div>{/* /band-nearby */}

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
              ) : detailError ? (
                <p className="event-detail-sheet__loading">{detailError}</p>
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
