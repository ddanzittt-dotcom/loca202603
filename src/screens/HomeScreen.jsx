import { useEffect, useMemo, useState } from "react"
import { Bell, ChevronLeft, ChevronRight, MapPin, X } from "lucide-react"
import { buildGreetingContext, getDailyGreeting } from "../lib/greeting"
import { PhotoBlock, SectionHead } from "../components/visuals"
import { BrandLogo } from "../components/BrandLogo"

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
const MONTH_LABELS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"]
const COMMUNITY_FALLBACK_PINS = [
  { x: 32, y: 24, cat: "food", recent: false },
  { x: 68, y: 34, cat: "culture", recent: false },
  { x: 101, y: 55, cat: "food", recent: true },
  { x: 138, y: 39, cat: "etc", recent: false },
  { x: 178, y: 58, cat: "food", recent: false },
  { x: 220, y: 29, cat: "food", recent: false },
  { x: 48, y: 72, cat: "culture", recent: false },
  { x: 92, y: 79, cat: "food", recent: false },
  { x: 126, y: 69, cat: "culture", recent: true },
  { x: 202, y: 78, cat: "etc", recent: false },
]

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

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1)
}

function formatMonthTitle(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 기록`
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
      rawDate: date,
      dow: WEEK_LABELS[date.getDay()],
      d: date.getDate(),
      count,
      future,
      today: key === getDateKey(today),
    }
  })
}

function getActivityLevel(count) {
  if (!count) return 0
  if (count === 1) return 1
  if (count <= 3) return 2
  if (count <= 6) return 3
  return 4
}

function buildMonthCells(monthDate, activityByDate, today = monthDate) {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const todayKey = getDateKey(today)
  const first = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < first.getDay(); i += 1) cells.push({ key: `empty-${i}`, empty: true })
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day)
    const key = getDateKey(date)
    cells.push({
      key,
      rawDate: date,
      date: day,
      count: activityByDate.get(key) || 0,
      today: key === todayKey,
      future: date > today,
    })
  }
  return cells
}

function buildYearCells(today, activityByDate) {
  const year = today.getFullYear()
  const jan1 = new Date(year, 0, 1)
  const daysInYear = new Date(year, 1, 29).getMonth() === 1 ? 366 : 365
  const cells = []
  for (let week = 0; week < 53; week += 1) {
    for (let dow = 0; dow < 7; dow += 1) {
      const doy = week * 7 + dow - jan1.getDay()
      if (doy < 0 || doy >= daysInYear) {
        cells.push({ key: `empty-${week}-${dow}`, empty: true })
        continue
      }
      const date = new Date(year, 0, doy + 1)
      const key = getDateKey(date)
      cells.push({
        key,
        rawDate: date,
        count: activityByDate.get(key) || 0,
        today: key === getDateKey(today),
        future: date > today,
      })
    }
  }
  return cells
}

function buildMonthlyTotals(today, activityByDate) {
  const year = today.getFullYear()
  return Array.from({ length: 12 }, (_, month) => {
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    let count = 0
    for (let day = 1; day <= daysInMonth; day += 1) {
      count += activityByDate.get(getDateKey(new Date(year, month, day))) || 0
    }
    return month > today.getMonth() ? 0 : count
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

function getFeatureId(feature) {
  return feature?.id || feature?.featureId || feature?.feature_id || null
}

function getFeatureKindLabel(feature) {
  if (feature?.type === "route") return "길"
  if (feature?.type === "area") return "영역"
  return "장소"
}

function getFeatureSummary(feature) {
  if (feature?.note) return feature.note
  if (feature?.memo) return feature.memo
  if (Array.isArray(feature?.tags) && feature.tags.length) return feature.tags.slice(0, 3).join(" · ")
  if (Array.isArray(feature?.photos) && feature.photos.length) return `사진 ${feature.photos.length}장`
  return "기록한 곳"
}

function formatRecordDate(date) {
  if (!date) return "선택한 날짜"
  return `${date.getMonth() + 1}월 ${date.getDate()}일`
}

function createRecordItem(feature, mapById, featureDate) {
  const mapId = getFeatureMapId(feature)
  const map = mapById.get(mapId)
  return {
    id: getFeatureId(feature) || `${mapId || "unknown"}-${featureDate.getTime()}`,
    featureId: getFeatureId(feature),
    mapId,
    mapTitle: map?.title || "분류 없는 지도",
    title: feature.title || feature.name || "이름 없는 기록",
    kind: getFeatureKindLabel(feature),
    summary: getFeatureSummary(feature),
    dateLabel: formatRecordDate(featureDate),
    time: featureDate.getTime(),
  }
}

function buildRecordsForDay(features, maps, date) {
  if (!date) return []
  const dayKey = getDateKey(date)
  const mapById = new Map(maps.map((map) => [map.id, map]))
  return features
    .map((feature) => {
      const featureDate = getFeatureDate(feature)
      if (!featureDate || getDateKey(featureDate) !== dayKey) return null
      return createRecordItem(feature, mapById, featureDate)
    })
    .filter(Boolean)
    .sort((a, b) => b.time - a.time)
}

function buildRecordsForMonth(features, maps, monthDate) {
  if (!monthDate) return []
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const mapById = new Map(maps.map((map) => [map.id, map]))
  return features
    .map((feature) => {
      const featureDate = getFeatureDate(feature)
      if (!featureDate) return null
      if (featureDate.getFullYear() !== year || featureDate.getMonth() !== month) return null
      return createRecordItem(feature, mapById, featureDate)
    })
    .filter(Boolean)
    .sort((a, b) => b.time - a.time)
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

function buildCommunityPreview(maps, recommendedMaps, features, communityMaps = [], communityFeatures = []) {
  // 우선 community-map 슬러그 또는 isCommunity 플래그를 가진 지도를 찾는다.
  const all = [...communityMaps, ...maps, ...recommendedMaps]
  const communityMap = all.find((m) => m?.slug === "community-map" || m?.isCommunity)

  const mapId = communityMap?.id || communityMap?.mapId
  const previewFeatures = communityFeatures.length > 0
    ? communityFeatures
    : mapId
      ? features.filter((f) => getFeatureMapId(f) === mapId)
      : []
  // 이번 주 새로 기록된 핀 수
  const today = startOfDay(new Date())
  const weekAgo = new Date(today.getTime() - 7 * DAY_MS)
  const isRecent = (f) => {
    const d = getFeatureDate(f)
    return d && d >= weekAgo
  }
  const newCount = previewFeatures.filter(isRecent).length

  // lat/lng 가 있는 pin 타입 feature 만 5:2 뷰포트(250×100)에 정사영.
  // bounding box 기반 균등 스케일 + 18px 패딩.
  const coords = previewFeatures
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
    pins = COMMUNITY_FALLBACK_PINS
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
    neighborhood: communityMap?.title || "모두의 지도",
    newCount: previewFeatures.length > 0 ? newCount : 12,
    pinCount: previewFeatures.length > 0 ? previewFeatures.length : COMMUNITY_FALLBACK_PINS.length,
    pins,
  }
}

function RecordDialogShell({ title, stat, onClose, children, wide = false }) {
  return (
    <section className={`home-v2-record-dialog${wide ? " home-v2-record-dialog--wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="home-v2-record-dialog__head">
        <div>
          <h3>{title}</h3>
          <p>{stat}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="닫기">
          <X size={16} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
      {children}
    </section>
  )
}

function MonthRecordDialog({
  visibleMonth,
  monthCells,
  monthTotal,
  canGoPreviousMonth,
  canGoNextMonth,
  onPreviousMonth,
  onNextMonth,
  onOpenDate,
  onOpenMonthRecords,
  onClose,
}) {
  return (
    <RecordDialogShell title={formatMonthTitle(visibleMonth)} stat={`${monthTotal}개 기록`} onClose={onClose}>
      <div className="home-v2-month-nav" aria-label="월 선택">
        <button type="button" className="home-v2-month-nav__arrow" onClick={onPreviousMonth} disabled={!canGoPreviousMonth} aria-label="이전 달">
          <ChevronLeft size={16} strokeWidth={2.3} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="home-v2-month-nav__label"
          onClick={() => onOpenMonthRecords(visibleMonth)}
          aria-live="polite"
          aria-label={`${visibleMonth.getFullYear()}년 ${visibleMonth.getMonth() + 1}월 전체 기록 보기`}
        >
          <strong>{visibleMonth.getMonth() + 1}월</strong>
        </button>
        <button type="button" className="home-v2-month-nav__arrow" onClick={onNextMonth} disabled={!canGoNextMonth} aria-label="다음 달">
          <ChevronRight size={16} strokeWidth={2.3} aria-hidden="true" />
        </button>
      </div>
      <div className="home-v2-month-dows">
        {WEEK_LABELS.map((label) => <span key={label}>{label}</span>)}
      </div>
      <div className="home-v2-month-grid">
        {monthCells.map((cell) => (
          <button
            type="button"
            key={cell.key}
            className={`home-v2-month-cell${cell.empty ? " is-empty" : ""}${cell.today ? " is-today" : ""}${cell.future ? " is-future" : ""}${cell.count ? " has-records" : ""}`}
            disabled={cell.empty || cell.future}
            onClick={() => onOpenDate(cell.rawDate, cell.count)}
          >
            <span>{cell.date}</span>
            <i data-lvl={getActivityLevel(cell.count)} />
          </button>
        ))}
      </div>
    </RecordDialogShell>
  )
}

function YearRecordDialog({ today, yearCells, monthlyTotals, yearTotal, activeDays, onOpenDate, onOpenMonthRecords, onClose }) {
  const maxMonth = Math.max(1, ...monthlyTotals)
  return (
    <RecordDialogShell title={`${today.getFullYear()}년 기록`} stat={`${yearTotal}개 기록 · ${activeDays}일 활동`} onClose={onClose} wide>
      <div className="home-v2-year-months">
        {MONTH_LABELS.map((label) => <span key={label}>{label.replace("월", "")}</span>)}
      </div>
      <div className="home-v2-year-row">
        <div className="home-v2-year-dows" aria-hidden="true">
          <span />
          <span>월</span>
          <span />
          <span>수</span>
          <span />
          <span>금</span>
          <span />
        </div>
        <div className="home-v2-year-grid">
          {yearCells.map((cell) => (
            <button
              type="button"
              key={cell.key}
              className={`home-v2-year-cell${cell.empty ? " is-empty" : ""}${cell.today ? " is-today" : ""}${cell.future ? " is-future" : ""}`}
              data-lvl={getActivityLevel(cell.count)}
              disabled={cell.empty || cell.future}
              onClick={() => onOpenDate(cell.rawDate, cell.count)}
              aria-label={cell.rawDate ? `${formatRecordDate(cell.rawDate)} ${cell.count || 0}개 기록` : undefined}
            />
          ))}
        </div>
      </div>
      <div className="home-v2-monthly" aria-label="월간 기록 수">
        <h4>월간 기록</h4>
        <div className="home-v2-monthly__list">
        {monthlyTotals.map((count, index) => {
          const future = index > today.getMonth()
          const pct = future || count === 0 ? 0 : (count / maxMonth) * 100
          return (
            <button
              key={MONTH_LABELS[index]}
              type="button"
              className={`home-v2-monthly__row${future ? " is-future" : ""}${count ? " has-records" : ""}`}
              onClick={() => onOpenMonthRecords(new Date(today.getFullYear(), index, 1))}
              disabled={future}
              aria-label={`${today.getFullYear()}년 ${index + 1}월 ${count || 0}개 기록`}
            >
              <span>{index + 1}월</span>
              <b><i style={{ width: `${pct}%` }} /></b>
              <strong>{future || count === 0 ? "·" : count}</strong>
            </button>
          )
        })}
        </div>
      </div>
    </RecordDialogShell>
  )
}

function RecordListDialog({
  title,
  date,
  records,
  onOpenRecord,
  onClose,
  emptyTitle = "이 날짜에는 아직 기록이 없어요",
  emptyText = "기록이 있는 날짜를 누르면 지도별 장소와 기록을 모아볼 수 있어요.",
  showDate = false,
}) {
  return (
    <RecordDialogShell title={title || `${formatRecordDate(date)} 기록`} stat={`${records.length}개 기록`} onClose={onClose}>
      {records.length ? (
        <div className="home-v2-record-list">
          {records.map((record) => (
            <button
              type="button"
              key={record.id}
              className="home-v2-record-item"
              onClick={() => onOpenRecord(record)}
            >
              <span className="home-v2-record-item__type">{record.kind}</span>
              <span className="home-v2-record-item__body">
                <strong>{record.title}</strong>
                <small>
                  {showDate ? `${record.dateLabel} · ` : ""}
                  {record.mapTitle} · {record.summary}
                </small>
              </span>
              <ChevronRight size={14} strokeWidth={2.2} aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : (
        <div className="home-v2-record-empty">
          <strong>{emptyTitle}</strong>
          <span>{emptyText}</span>
        </div>
      )}
    </RecordDialogShell>
  )
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
    communityMaps = [],
    communityFeatures = [],
    viewerProfile = null,
    onOpenCommunityEditor,
  } = props
  const today = useMemo(() => startOfDay(new Date()), [])
  const [greetingMessage, setGreetingMessage] = useState("")
  const [recordDialog, setRecordDialog] = useState(null)
  const [recordDialogReturnTo, setRecordDialogReturnTo] = useState(null)
  const [selectedRecordDate, setSelectedRecordDate] = useState(null)
  const [selectedRecordMonth, setSelectedRecordMonth] = useState(null)
  const [visibleRecordMonth, setVisibleRecordMonth] = useState(() => startOfMonth(today))

  const personalMaps = useMemo(() => (
    maps
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
  const monthCells = useMemo(() => buildMonthCells(visibleRecordMonth, activityByDate, today), [activityByDate, today, visibleRecordMonth])
  const yearCells = useMemo(() => buildYearCells(today, activityByDate), [activityByDate, today])
  const monthlyTotals = useMemo(() => buildMonthlyTotals(today, activityByDate), [activityByDate, today])
  const weekTotal = weekData.reduce((sum, item) => sum + (item.future ? 0 : item.count || 0), 0)
  const monthTotal = monthCells.reduce((sum, cell) => sum + (cell.empty || cell.future ? 0 : cell.count || 0), 0)
  const yearTotal = monthlyTotals.reduce((sum, count) => sum + count, 0)
  const activeDays = yearCells.filter((cell) => !cell.future && !cell.empty && (cell.count || 0) > 0).length
  const selectedRecords = useMemo(
    () => buildRecordsForDay(features, maps, selectedRecordDate),
    [features, maps, selectedRecordDate],
  )
  const selectedMonthRecords = useMemo(
    () => buildRecordsForMonth(features, maps, selectedRecordMonth),
    [features, maps, selectedRecordMonth],
  )
  const resumeContext = useMemo(
    () => buildResumeContext(personalMaps, featuresByMapId),
    [featuresByMapId, personalMaps],
  )
  const communityPreview = useMemo(
    () => buildCommunityPreview(maps, recommendedMaps, features, communityMaps, communityFeatures),
    [communityFeatures, communityMaps, features, maps, recommendedMaps],
  )

  const firstRecordAt = useMemo(() => (
    features.reduce((oldest, feature) => {
      const date = getFeatureDate(feature)
      if (!date) return oldest
      return !oldest || date.getTime() < oldest.getTime() ? date : oldest
    }, null)
  ), [features])
  const currentRecordMonth = useMemo(() => startOfMonth(today), [today])
  const oldestRecordMonth = useMemo(() => startOfMonth(firstRecordAt || today), [firstRecordAt, today])
  const canGoPreviousRecordMonth = visibleRecordMonth > oldestRecordMonth
  const canGoNextRecordMonth = visibleRecordMonth < currentRecordMonth
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
    if (onOpenCommunityEditor) {
      onOpenCommunityEditor()
      return
    }
    const all = [...maps, ...recommendedMaps]
    const cm = all.find((m) => m?.slug === "community-map" || m?.isCommunity)
    if (cm && onOpenMap) onOpenMap(cm.id || cm.mapId)
  }
  const openMonthDialog = () => {
    setVisibleRecordMonth(currentRecordMonth)
    setRecordDialog("month")
  }
  const showPreviousRecordMonth = () => {
    setVisibleRecordMonth((current) => {
      const next = addMonths(current, -1)
      return next < oldestRecordMonth ? oldestRecordMonth : next
    })
  }
  const showNextRecordMonth = () => {
    setVisibleRecordMonth((current) => {
      const next = addMonths(current, 1)
      return next > currentRecordMonth ? currentRecordMonth : next
    })
  }
  const openRecordDate = (date, returnTo = null) => {
    if (!date) return
    setSelectedRecordDate(date)
    setRecordDialogReturnTo(returnTo)
    setRecordDialog("records")
  }
  const openMonthRecordList = (monthDate, returnTo = null) => {
    if (!monthDate) return
    setSelectedRecordMonth(startOfMonth(monthDate))
    setRecordDialogReturnTo(returnTo)
    setRecordDialog("monthRecords")
  }
  const closeRecordList = () => {
    setRecordDialog(recordDialogReturnTo || null)
  }
  const openRecordItem = (record) => {
    setRecordDialogReturnTo(null)
    setRecordDialog(null)
    if (record.featureId && onOpenFeatureInMap) {
      onOpenFeatureInMap(record.mapId, record.featureId)
      return
    }
    if (record.mapId) onResumeMyMap?.(record.mapId)
  }

  return (
    <section className="screen screen--scroll home-v2">
      <header className="home-v2__header">
        <BrandLogo className="home-v2__brand" dotClassName="home-v2__brand-dot" />
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

      <SectionHead title="나의 기록" />
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
            <button
              type="button"
              key={d.key}
              className={`home-v2__tracker-cell${d.today ? " is-today" : ""}${d.future ? " is-future" : ""}`}
              onClick={() => openRecordDate(d.rawDate)}
              disabled={d.future}
              aria-label={`${formatRecordDate(d.rawDate)} ${d.count || 0}개 기록`}
            >
              <span className="home-v2__tracker-dow">{d.dow}</span>
              <span className="home-v2__tracker-day loca-v2-num">{d.d}</span>
              <span
                className={`home-v2__tracker-dot${d.count > 0 ? " has-record" : ""}${d.today && d.count === 0 ? " is-today-empty" : ""}`}
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
        <div className="home-v2__record-actions" aria-label="기록 보기">
          <button type="button" onClick={openMonthDialog}>
            월간 보기
            <ChevronRight size={12} strokeWidth={2.3} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setRecordDialog("year")}>
            연간 보기
            <ChevronRight size={12} strokeWidth={2.3} aria-hidden="true" />
          </button>
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
            <span className="home-v2__community-empty-title">모두의 지도 바로 들어가기</span>
            <span className="home-v2__community-empty-desc">동네 설정 없이 함께 기록하는 지도를 먼저 둘러볼 수 있어요.</span>
          </div>
          <ChevronRight size={14} strokeWidth={1.8} aria-hidden="true" />
        </button>
      ) : null}

      {recordDialog ? (
        <div className="home-v2-record-overlay" onClick={() => setRecordDialog(null)}>
          <div onClick={(event) => event.stopPropagation()}>
            {recordDialog === "month" ? (
              <MonthRecordDialog
                visibleMonth={visibleRecordMonth}
                monthCells={monthCells}
                monthTotal={monthTotal}
                canGoPreviousMonth={canGoPreviousRecordMonth}
                canGoNextMonth={canGoNextRecordMonth}
                onPreviousMonth={showPreviousRecordMonth}
                onNextMonth={showNextRecordMonth}
                onOpenDate={(date) => openRecordDate(date, "month")}
                onOpenMonthRecords={(monthDate) => openMonthRecordList(monthDate, "month")}
                onClose={() => setRecordDialog(null)}
              />
            ) : null}
            {recordDialog === "year" ? (
              <YearRecordDialog
                today={today}
                yearCells={yearCells}
                monthlyTotals={monthlyTotals}
                yearTotal={yearTotal}
                activeDays={activeDays}
                onOpenDate={(date) => openRecordDate(date, "year")}
                onOpenMonthRecords={(monthDate) => openMonthRecordList(monthDate, "year")}
                onClose={() => setRecordDialog(null)}
              />
            ) : null}
            {recordDialog === "records" ? (
              <RecordListDialog
                date={selectedRecordDate}
                records={selectedRecords}
                onOpenRecord={openRecordItem}
                onClose={closeRecordList}
              />
            ) : null}
            {recordDialog === "monthRecords" ? (
              <RecordListDialog
                title={formatMonthTitle(selectedRecordMonth || visibleRecordMonth)}
                records={selectedMonthRecords}
                onOpenRecord={openRecordItem}
                onClose={closeRecordList}
                showDate
                emptyTitle="이 달에는 아직 기록이 없어요"
                emptyText="기록이 쌓인 월을 누르면 그 달의 장소와 기록을 모아볼 수 있어요."
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
