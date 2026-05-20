import { useEffect, useMemo, useState } from "react"
import { Bell, ChevronRight, MapPin } from "lucide-react"
import { isEventMap } from "../lib/mapPlacement"
import { buildGreetingContext, getDailyGreeting } from "../lib/greeting"
import { PhotoBlock, SectionHead } from "../components/visuals"

/*
 * HomeScreen v2 — Cream & Ember 리디자인.
 *
 * 시안: 참고자료/design-source/screen-home.jsx
 * 토큰: src/styles/tokens-v2.css
 * 스타일: src/styles/home-v2.css
 *
 * 섹션 (위 → 아래):
 *   1) 헤더 — loca. 로고 + 알림 벨
 *   2) 인사 — 날짜 메타 + 큰 타이틀 (greeting message)
 *   3) 이어서 쓰기 카드 — 가장 최근 작성 중인 지도
 *   4) 이번 주 기록 — 7일 트래커
 *   5) 모두의 지도 — 동네 공동 지도 프리뷰 (커뮤니티 맵)
 *
 * 기존 v9 의 레벨 콤보 카드 / 연·월 히트맵 다이얼로그는 v2 에서 빠진다.
 * 레벨/XP UI 는 Step 6 프로필 탭으로 이동.
 */

const DAY_MS = 86400000
const WEEK_LABELS = ["일", "월", "화", "수", "목", "금", "토"]

const greetingStorage = {
  async get(key) {
    try { return window.localStorage?.getItem(key) || null } catch { return null }
  },
  async set(key, value) {
    try { window.localStorage?.setItem(key, value) } catch { /* private mode */ }
  },
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function getDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function getFeatureDate(feature) {
  const value = feature?.createdAt || feature?.created_at || feature?.updatedAt || feature?.updated_at
  const date = value ? new Date(value) : null
  return date && Number.isFinite(date.getTime()) ? date : null
}

function getFeatureMapId(feature) {
  return feature?.mapId || feature?.map_id || feature?.map?.id || null
}

function getMapTime(map) {
  const value = map?.updatedAt || map?.updated_at || map?.createdAt || map?.created_at
  const time = value ? new Date(value).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

function getFeatureTime(feature) {
  const value = feature?.updatedAt || feature?.updated_at || feature?.createdAt || feature?.created_at
  const time = value ? new Date(value).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

function toValidDate(value) {
  const date = value ? new Date(value) : null
  return date && Number.isFinite(date.getTime()) ? date : null
}

function formatDateUpperMeta(date = new Date()) {
  const m = date.getMonth() + 1
  const d = date.getDate()
  const dow = WEEK_LABELS[date.getDay()]
  // ex: "5월 20일 · 수요일" but in uppercase meta style → 카카오/한글 그대로
  return `${m}월 ${d}일 · ${dow}요일`
}

function buildActivityIndex(features) {
  const map = new Map()
  for (const feature of features) {
    const date = getFeatureDate(feature)
    if (!date) continue
    const key = getDateKey(date)
    map.set(key, (map.get(key) || 0) + 1)
  }
  return map
}

function buildWeekData(today, activityByDate) {
  const start = new Date(today)
  start.setDate(today.getDate() - today.getDay()) // 일요일 시작
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(start.getTime() + i * DAY_MS)
    const key = getDateKey(date)
    const count = activityByDate.get(key) || 0
    const future = date > today
    return {
      key,
      dow: WEEK_LABELS[date.getDay()],
      d: date.getDate(),
      count,
      future,
      today: key === getDateKey(today),
    }
  })
}

function buildResumeContext(personalMaps, featuresByMapId) {
  for (const map of personalMaps) {
    const list = featuresByMapId.get(map.id) || []
    if (list.length === 0) continue
    const sorted = [...list].sort((a, b) => getFeatureTime(b) - getFeatureTime(a))
    const lastFeature = sorted[0]
    return {
      mapId: map.id,
      mapTitle: map.title || "내 지도",
      featureId: lastFeature?.id || null,
      featureTitle: lastFeature?.title || lastFeature?.name || "최근 기록",
      photoCount: Array.isArray(lastFeature?.photos) ? lastFeature.photos.length : 0,
      regionLabel: lastFeature?.regionName || lastFeature?.region_name || map?.description || "",
    }
  }
  return null
}

// 카테고리 분류 — feature 의 category 필드 우선, 없으면 type 별 기본값.
function classifyFeatureCategory(feature) {
  const raw = (feature?.category || "").toString().toLowerCase()
  if (raw.includes("food") || raw.includes("cafe") || raw.includes("음식") || raw.includes("맛집")) return "food"
  if (raw.includes("culture") || raw.includes("문화") || raw.includes("전시") || raw.includes("공연")) return "culture"
  if (raw) return "etc"
  // 폴백: 타입 기반 — pin = food (가장 흔함), route/area = etc
  if (feature?.type === "pin") return "food"
  return "etc"
}

function buildCommunityPreview(maps, recommendedMaps, features) {
  // 우선 community-map 슬러그 또는 isCommunity 플래그를 가진 지도를 찾는다.
  const all = [...maps, ...recommendedMaps]
  const communityMap = all.find((m) => m?.slug === "community-map" || m?.isCommunity)
  if (!communityMap) return null

  const mapId = communityMap.id || communityMap.mapId
  const communityFeatures = features.filter((f) => getFeatureMapId(f) === mapId)
  // 이번 주 새로 기록된 핀 수
  const today = startOfDay(new Date())
  const weekAgo = new Date(today.getTime() - 7 * DAY_MS)
  const isRecent = (f) => {
    const d = getFeatureDate(f)
    return d && d >= weekAgo
  }
  const newCount = communityFeatures.filter(isRecent).length

  // lat/lng 가 있는 pin 타입 feature 만 5:2 뷰포트(250×100)에 정사영.
  // bounding box 기반 균등 스케일 + 18px 패딩.
  const coords = communityFeatures
    .map((f) => {
      const lat = Number(f.lat)
      const lng = Number(f.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
      if (lat === 0 && lng === 0) return null
      return { f, lat, lng }
    })
    .filter(Boolean)
    .slice(0, 24) // 너무 많으면 가독성 해침

  let pins = []
  if (coords.length === 0) {
    // 좌표가 없으면 빈 상태 — Caller 에서 빈 상태 UI 분기
    pins = []
  } else if (coords.length === 1) {
    pins = [{
      x: 125,
      y: 50,
      cat: classifyFeatureCategory(coords[0].f),
      recent: isRecent(coords[0].f),
    }]
  } else {
    const lats = coords.map((c) => c.lat)
    const lngs = coords.map((c) => c.lng)
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
    const latRange = maxLat - minLat || 0.001
    const lngRange = maxLng - minLng || 0.001
    const padX = 18
    const padY = 12
    const usableW = 250 - padX * 2
    const usableH = 100 - padY * 2
    // 동일 스케일 (지도 비율 보존) — 한 축만 가득 채움
    const scale = Math.min(usableW / lngRange, usableH / latRange)
    const drawnW = lngRange * scale
    const drawnH = latRange * scale
    const offsetX = padX + (usableW - drawnW) / 2
    const offsetY = padY + (usableH - drawnH) / 2
    pins = coords.map(({ f, lat, lng }) => ({
      x: Math.round(offsetX + (lng - minLng) * scale),
      y: Math.round(offsetY + (maxLat - lat) * scale), // 위도 반전 (북=위)
      cat: classifyFeatureCategory(f),
      recent: isRecent(f),
    }))
  }

  return {
    neighborhood: communityMap.title || "모두의 지도",
    newCount,
    pinCount: communityFeatures.length,
    pins,
  }
}

// 호환을 위해 App.jsx 가 전달하는 모든 props 를 받지만, v2 화면에서 사용하지 않는 일부
// (onNavigateToExplore, onOpenExploreSearch, userStats, levelEmoji)는 추후 단계에서
// 다른 탭으로 이전 예정이므로 여기서는 본문에서 참조하지 않는다.
export function HomeScreen(props) {
  const {
    onResumeMyMap,
    onOpenFeatureInMap,
    onOpenMap,
    onOpenNotifications,
    hasUnread = false,
    maps = [],
    features = [],
    recommendedMaps = [],
    viewerProfile = null,
  } = props
  const today = useMemo(() => startOfDay(new Date()), [])
  const [greetingMessage, setGreetingMessage] = useState("")

  const personalMaps = useMemo(() => (
    maps
      .filter((map) => !isEventMap(map))
      .slice()
      .sort((a, b) => getMapTime(b) - getMapTime(a))
  ), [maps])

  const featuresByMapId = useMemo(() => {
    const groups = new Map()
    for (const feature of features) {
      const mapId = getFeatureMapId(feature)
      if (!mapId) continue
      if (!groups.has(mapId)) groups.set(mapId, [])
      groups.get(mapId).push(feature)
    }
    return groups
  }, [features])

  const activityByDate = useMemo(() => buildActivityIndex(features), [features])
  const weekData = useMemo(() => buildWeekData(today, activityByDate), [activityByDate, today])
  const weekTotal = weekData.reduce((sum, item) => sum + (item.future ? 0 : item.count || 0), 0)
  const resumeContext = useMemo(
    () => buildResumeContext(personalMaps, featuresByMapId),
    [featuresByMapId, personalMaps],
  )
  const communityPreview = useMemo(
    () => buildCommunityPreview(maps, recommendedMaps, features),
    [features, maps, recommendedMaps],
  )

  const firstRecordAt = useMemo(() => (
    features.reduce((oldest, feature) => {
      const date = getFeatureDate(feature)
      if (!date) return oldest
      return !oldest || date.getTime() < oldest.getTime() ? date : oldest
    }, null)
  ), [features])
  const lastVisitAt = useMemo(() => toValidDate(
    viewerProfile?.lastVisitAt
      || viewerProfile?.last_visit_at
      || viewerProfile?.lastSeenAt
      || viewerProfile?.last_seen_at
      || viewerProfile?.updatedAt
      || viewerProfile?.updated_at,
  ), [viewerProfile])
  const greetingContext = useMemo(() => buildGreetingContext({
    user: { lastVisitAt, firstRecordAt },
    inProgressMap: resumeContext ? { id: resumeContext.mapId } : null,
  }), [firstRecordAt, lastVisitAt, resumeContext])

  useEffect(() => {
    let alive = true
    getDailyGreeting(greetingContext, greetingStorage).then((message) => {
      if (alive) setGreetingMessage(message)
    })
    return () => { alive = false }
  }, [greetingContext])

  const userName = viewerProfile?.name || viewerProfile?.nickname || "LOCA"
  const greetingLine1 = greetingMessage || "오늘은 어디로 걸어볼까요,"
  const handleResume = () => {
    if (!resumeContext) return
    if (resumeContext.featureId && onOpenFeatureInMap) {
      onOpenFeatureInMap(resumeContext.mapId, resumeContext.featureId)
    } else {
      onResumeMyMap?.(resumeContext.mapId)
    }
  }
  const handleOpenCommunity = () => {
    const all = [...maps, ...recommendedMaps]
    const cm = all.find((m) => m?.slug === "community-map" || m?.isCommunity)
    if (cm && onOpenMap) onOpenMap(cm.id || cm.mapId)
  }

  return (
    <section className="screen screen--scroll home-v2">
      <header className="home-v2__header">
        <strong className="home-v2__brand">
          loca<span className="home-v2__brand-dot">.</span>
        </strong>
        <button
          type="button"
          className="home-v2__icon-btn"
          aria-label="알림"
          title="알림"
          onClick={onOpenNotifications}
        >
          <Bell size={17} strokeWidth={1.8} aria-hidden="true" />
          {hasUnread ? <span className="home-v2__icon-dot" /> : null}
        </button>
      </header>

      <div className="home-v2__greeting">
        <time className="home-v2__meta">{formatDateUpperMeta(today)}</time>
        <h1>
          {greetingLine1}<br />{userName}님.
        </h1>
      </div>

      {resumeContext ? (
        <button
          type="button"
          className="home-v2__resume"
          onClick={handleResume}
          aria-label={`이어서 쓰기 — ${resumeContext.mapTitle}`}
        >
          <PhotoBlock
            tone="d"
            width={60}
            height={60}
            radius={9}
            className="home-v2__resume-thumb"
          />
          <div className="home-v2__resume-body">
            <span className="home-v2__resume-cap">이어서 쓰기 · 어제</span>
            <span className="home-v2__resume-title">{resumeContext.featureTitle}</span>
            {resumeContext.regionLabel || resumeContext.photoCount > 0 ? (
              <span className="home-v2__resume-meta">
                {resumeContext.regionLabel}
                {resumeContext.regionLabel && resumeContext.photoCount > 0 ? " · " : ""}
                {resumeContext.photoCount > 0 ? `사진 ${resumeContext.photoCount}장` : ""}
              </span>
            ) : null}
          </div>
          <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      ) : null}

      <SectionHead title="이번 주 기록" />
      <div className="home-v2__tracker">
        <div className="home-v2__tracker-head">
          <span className="home-v2__tracker-range">
            {weekData[0] ? `${weekData[0].d}일 — ${weekData[6]?.d ?? ""}일` : ""}
          </span>
          <span className="home-v2__tracker-total">
            <strong className="loca-v2-num">{weekTotal}</strong>
            <span>기록</span>
          </span>
        </div>
        <div className="home-v2__tracker-grid">
          {weekData.map((d) => (
            <div
              key={d.key}
              className={`home-v2__tracker-cell${d.today ? " is-today" : ""}${d.future ? " is-future" : ""}`}
            >
              <span className="home-v2__tracker-dow">{d.dow}</span>
              <span className="home-v2__tracker-day loca-v2-num">{d.d}</span>
              <span
                className={`home-v2__tracker-dot${d.count > 0 ? " has-record" : ""}${d.today && d.count === 0 ? " is-today-empty" : ""}`}
                aria-hidden="true"
              />
            </div>
          ))}
        </div>
      </div>

      {communityPreview ? (
        <>
          <div className="home-v2__community-cap">
            <span className="home-v2__community-title">모두의 지도</span>
            <span className="home-v2__community-sub">동네 사람들이 함께 그려가는 한 장의 지도</span>
          </div>
          <button
            type="button"
            className="home-v2__community-card"
            onClick={handleOpenCommunity}
            aria-label={`모두의 지도 ${communityPreview.neighborhood} 열기`}
          >
            <div className="home-v2__community-map">
              <svg viewBox="0 0 250 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
                <g stroke="var(--map-grid)" strokeWidth="0.4" opacity="0.6">
                  {[50, 100, 150, 200].map((x) => (
                    <line key={`v${x}`} x1={x} y1="0" x2={x} y2="100" />
                  ))}
                  {[33, 66].map((y) => (
                    <line key={`h${y}`} x1="0" y1={y} x2="250" y2={y} />
                  ))}
                </g>
                <ellipse cx="62" cy="38" rx="42" ry="20" fill="var(--accent-soft)" opacity="0.35" />
                <ellipse cx="190" cy="72" rx="48" ry="22" fill="var(--second-soft)" opacity="0.45" />
                <path
                  d="M 5 60 Q 60 50 110 65 Q 170 80 245 50"
                  stroke="var(--map-grid)"
                  strokeWidth="1.2"
                  fill="none"
                  opacity="0.55"
                />
                {communityPreview.pins.length > 0 ? (
                  communityPreview.pins.map((p, i) => {
                    const catVar = p.cat === "food"
                      ? "var(--cat-food)"
                      : p.cat === "culture"
                        ? "var(--cat-culture)"
                        : "var(--cat-etc)"
                    return (
                      <g key={i} transform={`translate(${p.x} ${p.y})`}>
                        {p.recent ? (
                          <circle
                            r="3.5"
                            fill={catVar}
                            opacity="0.45"
                            className="home-v2__pin-pulse"
                            style={{ animationDelay: `${(i * 0.35) % 2}s` }}
                          />
                        ) : null}
                        <circle
                          r="2.6"
                          fill={catVar}
                          stroke="#fff"
                          strokeWidth="0.8"
                          className={p.recent ? "home-v2__pin-bob" : ""}
                          style={p.recent ? { animationDelay: `${(i * 0.2) % 1.8}s` } : undefined}
                        />
                      </g>
                    )
                  })
                ) : (
                  <g>
                    <text x="125" y="46" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--ink-soft)" letterSpacing="-0.02em">
                      아직 아무 기록도 없어요
                    </text>
                    <text x="125" y="62" textAnchor="middle" fontSize="9" fontWeight="500" fill="var(--ink-mute)" letterSpacing="-0.01em">
                      당신의 첫 핀이 모두의 지도를 시작합니다
                    </text>
                  </g>
                )}
              </svg>
              <span className="home-v2__community-chip">
                <span className="home-v2__community-chip-dot" />
                {communityPreview.neighborhood}
              </span>
            </div>
            <div className="home-v2__community-footer">
              <div className="home-v2__community-info">
                {communityPreview.pinCount > 0 ? (
                  <>
                    <span className="home-v2__community-line">
                      이번 주 <span className="home-v2__community-num">{communityPreview.newCount}곳</span> 새로 기록됐어요
                    </span>
                    <span className="home-v2__community-legend">
                      <span><i style={{ background: "var(--cat-food)" }} />음식</span>
                      <span><i style={{ background: "var(--cat-culture)" }} />문화</span>
                      <span><i style={{ background: "var(--cat-etc)" }} />기타</span>
                    </span>
                  </>
                ) : (
                  <span className="home-v2__community-line">
                    {communityPreview.neighborhood} · 첫 기록자가 되어보세요
                  </span>
                )}
              </div>
              <span className="home-v2__community-chev" aria-hidden="true">
                <ChevronRight size={13} strokeWidth={2.2} />
              </span>
            </div>
          </button>
        </>
      ) : (
        <div className="home-v2__community-cap">
          <span className="home-v2__community-title">모두의 지도</span>
          <span className="home-v2__community-sub">동네 사람들이 함께 그려가는 한 장의 지도</span>
        </div>
      )}

      {!communityPreview ? (
        <button
          type="button"
          className="home-v2__community-empty"
          onClick={handleOpenCommunity}
        >
          <span className="home-v2__community-empty-icon" aria-hidden="true">
            <MapPin size={20} strokeWidth={1.8} />
          </span>
          <div className="home-v2__community-empty-body">
            <span className="home-v2__community-empty-title">동네를 먼저 설정해주세요</span>
            <span className="home-v2__community-empty-desc">동네를 정하면 같은 곳을 기록하는 사람들의 지도가 열려요.</span>
          </div>
          <ChevronRight size={14} strokeWidth={1.8} aria-hidden="true" />
        </button>
      ) : null}
    </section>
  )
}
