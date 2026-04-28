import { useEffect, useRef, useState } from "react"
import { ArrowLeft, X, MapPin, Navigation, ChevronRight, Sparkles } from "lucide-react"
import { MapErrorBoundary } from "../components/MapErrorBoundary"
import { MapRenderer as NaverMap } from "../components/MapRenderer"

export function ExploreScreen({
  recommendedMaps = [],
  communityMapFeatures = [],
  communityRequestSummary = null,
  onOpenMap,
  onOpenCommunityEditor,
  levelEmoji,
}) {
  const myPendingRequests = communityRequestSummary?.mine || []
  const incomingRequests = communityRequestSummary?.incoming || []
  const hasRequestSummary = myPendingRequests.length > 0 || incomingRequests.length > 0

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

  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [eventsNearby, setEventsNearby] = useState(false)
  const [eventsError, setEventsError] = useState("")
  const eventsRequestRef = useRef(0)

  const [selectedEvent, setSelectedEvent] = useState(null)
  const [eventDetail, setEventDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState("")
  const detailAbortRef = useRef(null)
  const [overviewExpanded, setOverviewExpanded] = useState(false)
  const [showEventList, setShowEventList] = useState(false)

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
      throw new Error(typeof data?.error === "string" ? data.error : "지도를 불러오지 못했어요.")
    }
    return data
  }

  useEffect(() => {
    let cancelled = false
    const requestId = ++eventsRequestRef.current
    fetchEvents(null, null)
      .then((data) => {
        if (!cancelled && requestId === eventsRequestRef.current) applyFetchResult(data)
      })
      .catch((error) => {
        if (!cancelled && requestId === eventsRequestRef.current) {
          setEvents([])
          setEventsError(getApiErrorMessage(error, "지도를 불러오지 못했어요."))
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
            setEventsError(getApiErrorMessage(error, "근처 지도를 불러오지 못했어요."))
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
        setEventsError("위치 권한이 없어 근처 지도를 불러오지 못했어요.")
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
          setEventsError(getApiErrorMessage(error, "지도를 불러오지 못했어요."))
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

  useEffect(() => () => {
    detailAbortRef.current?.abort?.()
  }, [])

  const formatEventDate = (dateStr) => {
    if (!dateStr || dateStr.length !== 8) return ""
    return `${parseInt(dateStr.slice(4, 6))}.${parseInt(dateStr.slice(6, 8))}`
  }

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
                  onClick={() => onOpenMap?.(item.mapId || item.id)}
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
      </div>

      <div className="home-band home-band--community">
        <div className="home-band__head">
          <div className="home-band__head-left">
            <div className="home-band__eye">TOGETHER</div>
            <p className="home-band__t">함께 남긴 지도</p>
            <p className="home-band__s">다른 사람과 장소를 이어서 남겨보세요</p>
          </div>
          <button className="home-band__action--primary" type="button" onClick={onOpenCommunityEditor}>
            함께 남기기
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
              levelEmoji={levelEmoji || "/characters/cloud_lv1.svg"}
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
      </div>

      <div className="home-band home-band--nearby">
        <div className="home-band__head">
          <div className="home-band__head-left">
            <div className="home-band__eye">NEARBY</div>
            <p className="home-band__t">근처에서 열리는 지도</p>
            <p className="home-band__s">행사/팝업 기반 지도를 가볍게 둘러보세요</p>
          </div>
          <button className="home-band__action--ghost" type="button" onClick={eventsNearby ? loadAllEvents : loadNearbyEvents}>
            <Navigation size={11} /> {eventsNearby ? "전체 보기" : "내 위치"}
          </button>
        </div>
        {eventsLoading ? (
          <div className="home-section__empty">지도를 불러오는 중...</div>
        ) : eventsError ? (
          <div className="home-section__empty">
            <p>{eventsError}</p>
            <button className="button button--ghost" type="button" onClick={eventsNearby ? loadNearbyEvents : loadAllEvents}>
              다시 시도
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="home-section__empty">{eventsNearby ? "내 근처 열리는 지도가 없어요" : "열리는 지도가 없어요"}</div>
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
      </div>

      {showEventList ? (
        <div className="event-list-screen">
          <div className="event-list-screen__header">
            <button className="event-list-screen__back" type="button" onClick={() => setShowEventList(false)}><ArrowLeft size={20} /></button>
            <h2>근처에서 열리는 지도</h2>
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

      {selectedEvent ? (
        <div className="event-detail-overlay" onClick={() => setSelectedEvent(null)}>
          <div className="event-detail-sheet" onClick={(e) => e.stopPropagation()}>
            <button className="event-detail-sheet__close" type="button" onClick={() => setSelectedEvent(null)}><X size={18} /></button>
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

                  {eventDetail.program ? (
                    <div className="event-detail-sheet__section">
                      <h3>프로그램</h3>
                      <p>{eventDetail.program}</p>
                    </div>
                  ) : null}

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

                  {eventDetail.homepage ? (
                    <a className="event-detail-sheet__link" href={eventDetail.homepage} target="_blank" rel="noopener noreferrer">
                      🔗 홈페이지 바로가기
                    </a>
                  ) : null}
                </>
              ) : (
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
