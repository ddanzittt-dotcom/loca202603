import { useCallback, useEffect, useMemo, useState } from "react"
import { CalendarRange, Landmark, LocateFixed, MapPin, Plus, RotateCw } from "lucide-react"
import {
  DEFAULT_EXPLORE_LOCATION,
  EXPLORE_LOCATION_KEY,
  PLACE_KIND_FILTERS,
  eventDdayBadge,
  eventToPrefill,
  fetchNearbyEvents,
  fetchNearbyPlaces,
  formatDistanceKm,
  formatEventPeriod,
  placeToPrefill,
} from "../lib/exploreCuration"

// 탐색 — 내 위치 주변에서 기록할만한 행사/축제 + 공간 큐레이션.
// 공개 지도 검색(ExplorePublicScreen)은 데이터가 쌓일 때까지 진입점을 숨긴다.
// 카드 CTA [+ 카드로 등록] → CollectSheet 프리필 → 바인더에 꽂힌다.

function readStoredLocation() {
  try {
    const raw = localStorage.getItem(EXPLORE_LOCATION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Number.isFinite(parsed?.lat) || !Number.isFinite(parsed?.lng)) return null
    return { lat: parsed.lat, lng: parsed.lng, label: parsed.label || "내 위치 주변" }
  } catch {
    return null
  }
}

function EventCard({ event, onRegister }) {
  const badge = eventDdayBadge(event)
  const period = formatEventPeriod(event)
  const distance = formatDistanceKm(event.distKm)
  const shortAddr = (event.addr || "").split(" ").slice(0, 3).join(" ")

  return (
    <article className="xc-card">
      <div className="xc-card__art" aria-hidden="true">
        {event.image ? (
          <img src={event.image} alt="" loading="lazy" />
        ) : (
          <span className="xc-card__art-fallback">
            <CalendarRange size={28} strokeWidth={1.6} />
          </span>
        )}
        {badge ? (
          <span className={`xc-card__dday xc-card__dday--${badge.kind}`}>{badge.label}</span>
        ) : null}
      </div>
      <div className="xc-card__body">
        <strong className="xc-card__title">{event.title}</strong>
        <span className="xc-card__meta">
          {period ? <em>{period}</em> : null}
          {shortAddr ? <span>{shortAddr}</span> : null}
        </span>
      </div>
      <div className="xc-card__foot">
        {distance ? (
          <span className="xc-card__dist">
            <MapPin size={11} strokeWidth={2.4} aria-hidden="true" />
            {distance}
          </span>
        ) : <span />}
        <button type="button" className="xc-card__register" onClick={() => onRegister?.(eventToPrefill(event))}>
          <Plus size={13} strokeWidth={2.6} aria-hidden="true" />
          카드로 등록
        </button>
      </div>
    </article>
  )
}

function PlaceSpotCard({ place, onRegister }) {
  const distance = formatDistanceKm(place.distKm)
  const shortAddr = (place.addr || "").split(" ").slice(0, 3).join(" ")

  return (
    <article className="xc-card">
      <div className="xc-card__art xc-card__art--place" aria-hidden="true">
        {place.image ? (
          <img src={place.image} alt="" loading="lazy" />
        ) : (
          <span className="xc-card__art-fallback">
            <Landmark size={26} strokeWidth={1.6} />
          </span>
        )}
        {place.category ? (
          <span className="xc-card__dday xc-card__dday--place">{place.category}</span>
        ) : null}
      </div>
      <div className="xc-card__body">
        <strong className="xc-card__title">{place.title}</strong>
        <span className="xc-card__meta">
          {shortAddr ? <span>{shortAddr}</span> : null}
        </span>
      </div>
      <div className="xc-card__foot">
        {distance ? (
          <span className="xc-card__dist">
            <MapPin size={11} strokeWidth={2.4} aria-hidden="true" />
            {distance}
          </span>
        ) : <span />}
        <button type="button" className="xc-card__register" onClick={() => onRegister?.(placeToPrefill(place))}>
          <Plus size={13} strokeWidth={2.6} aria-hidden="true" />
          카드로 등록
        </button>
      </div>
    </article>
  )
}

export function ExploreCurationScreen({ onRegister, showToast }) {
  const [location, setLocation] = useState(() => readStoredLocation())
  const [locating, setLocating] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [placeKind, setPlaceKind] = useState("all")
  // 결과를 요청 키와 함께 저장 — 키가 다르면 로딩 중 (effect 내 동기 setState 회피)
  const [result, setResult] = useState({ key: null, items: [], error: "" })
  const [placesResult, setPlacesResult] = useState({ key: null, items: [], error: "" })

  const effectiveLocation = location || DEFAULT_EXPLORE_LOCATION
  const requestKey = `${effectiveLocation.lat},${effectiveLocation.lng}|${reloadKey}`

  useEffect(() => {
    let cancelled = false
    fetchNearbyEvents(effectiveLocation)
      .then((items) => { if (!cancelled) setResult({ key: requestKey, items, error: "" }) })
      .catch(() => {
        if (cancelled) return
        setResult({ key: requestKey, items: [], error: "주변 행사를 불러오지 못했어요. 잠시 후 다시 시도해주세요." })
      })
    return () => { cancelled = true }
  }, [effectiveLocation, requestKey])

  useEffect(() => {
    let cancelled = false
    fetchNearbyPlaces(effectiveLocation)
      .then((items) => { if (!cancelled) setPlacesResult({ key: requestKey, items, error: "" }) })
      .catch(() => {
        if (cancelled) return
        setPlacesResult({ key: requestKey, items: [], error: "주변 공간을 불러오지 못했어요." })
      })
    return () => { cancelled = true }
  }, [effectiveLocation, requestKey])

  const loading = result.key !== requestKey
  const events = loading ? null : result.items
  const error = loading ? "" : result.error

  const placesLoading = placesResult.key !== requestKey
  const placesError = placesLoading ? "" : placesResult.error

  const locateMe = useCallback(() => {
    if (!navigator.geolocation) {
      showToast?.("이 브라우저는 위치를 지원하지 않아요.")
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: "내 위치 주변",
        }
        setLocation(next)
        setLocating(false)
        try { localStorage.setItem(EXPLORE_LOCATION_KEY, JSON.stringify(next)) } catch { /* 무시 */ }
      },
      () => {
        setLocating(false)
        showToast?.("위치를 가져오지 못했어요. 위치 권한을 확인해주세요.")
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 },
    )
  }, [showToast])

  const { ongoing, upcoming } = useMemo(() => {
    const list = Array.isArray(events) ? events : []
    const result = { ongoing: [], upcoming: [] }
    for (const event of list) {
      const badge = eventDdayBadge(event)
      if (!badge) continue
      if (badge.kind === "ongoing") result.ongoing.push(event)
      else result.upcoming.push(event)
    }
    return result
  }, [events])

  const visiblePlaces = useMemo(() => {
    const list = placesLoading ? [] : placesResult.items
    if (placeKind === "all") return list
    return list.filter((place) => place.kind === placeKind)
  }, [placeKind, placesLoading, placesResult.items])

  return (
    <div className="xc-view">
      <div className="xc-locbar">
        <button
          type="button"
          className={`xc-locchip${location ? " is-set" : ""}`}
          onClick={locateMe}
          disabled={locating}
        >
          <LocateFixed size={13} strokeWidth={2.4} aria-hidden="true" />
          {locating ? "위치 찾는 중…" : effectiveLocation.label}
        </button>
        <button
          type="button"
          className="xc-reload"
          onClick={() => setReloadKey((value) => value + 1)}
          aria-label="새로고침"
          disabled={loading}
        >
          <RotateCw size={13} strokeWidth={2.4} />
        </button>
      </div>

      <section className="xc-section" aria-label="지금 열린 행사">
        <header className="xc-section__head">
          <strong>지금 열린 행사</strong>
          {!loading && ongoing.length > 0 ? <span className="xc-section__count">{ongoing.length}</span> : null}
        </header>

        {loading ? (
          <div className="xc-grid" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <div className="xc-card xc-card--skeleton" key={index} />
            ))}
          </div>
        ) : error ? (
          <div className="xc-empty">
            <strong>행사 정보를 불러오지 못했어요</strong>
            <span>{error}</span>
            <button type="button" onClick={() => setReloadKey((value) => value + 1)}>다시 시도</button>
          </div>
        ) : ongoing.length === 0 ? (
          <div className="xc-empty">
            <strong>지금 주변에 열린 행사가 없어요</strong>
            <span>위치를 바꾸거나, 곧 시작하는 행사를 기다려보세요.</span>
          </div>
        ) : (
          <div className="xc-grid">
            {ongoing.slice(0, 24).map((event) => (
              <EventCard key={event.id} event={event} onRegister={onRegister} />
            ))}
          </div>
        )}
      </section>

      {!loading && !error && upcoming.length > 0 ? (
        <section className="xc-section" aria-label="곧 시작하는 행사">
          <header className="xc-section__head">
            <strong>곧 시작해요</strong>
            <span className="xc-section__count">{upcoming.length}</span>
          </header>
          <div className="xc-grid">
            {upcoming.slice(0, 12).map((event) => (
              <EventCard key={event.id} event={event} onRegister={onRegister} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="xc-section" aria-label="기록할만한 공간">
        <header className="xc-section__head">
          <strong>기록할만한 공간</strong>
          {!placesLoading && visiblePlaces.length > 0 ? (
            <span className="xc-section__count">{visiblePlaces.length}</span>
          ) : null}
        </header>

        <div className="xc-chips" role="radiogroup" aria-label="공간 종류 필터">
          {PLACE_KIND_FILTERS.map((filterItem) => (
            <button
              key={filterItem.id}
              type="button"
              className={`xc-chip${placeKind === filterItem.id ? " is-active" : ""}`}
              aria-pressed={placeKind === filterItem.id}
              onClick={() => setPlaceKind(filterItem.id)}
            >
              {filterItem.label}
            </button>
          ))}
        </div>

        {placesLoading ? (
          <div className="xc-grid" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <div className="xc-card xc-card--skeleton" key={index} />
            ))}
          </div>
        ) : placesError ? (
          <div className="xc-empty">
            <strong>공간 정보를 불러오지 못했어요</strong>
            <span>{placesError}</span>
            <button type="button" onClick={() => setReloadKey((value) => value + 1)}>다시 시도</button>
          </div>
        ) : visiblePlaces.length === 0 ? (
          <div className="xc-empty">
            <strong>조건에 맞는 공간이 없어요</strong>
            <span>다른 종류를 골라보거나 위치를 바꿔보세요.</span>
          </div>
        ) : (
          <div className="xc-grid">
            {visiblePlaces.slice(0, 18).map((place) => (
              <PlaceSpotCard key={place.id} place={place} onRegister={onRegister} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
