import { useMemo, useState } from "react"
import { Bell, ChevronLeft, ChevronRight, Layers, MapPin, X } from "lucide-react"
import { isEventMap } from "../lib/mapPlacement"
import { getLevelForXp, getLevelProgress } from "../data/gamification"

const DAY_MS = 86400000
const WEEK_LABELS = ["일", "월", "화", "수", "목", "금", "토"]
const MONTH_LABELS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"]

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

function formatKoreanDate(date = new Date()) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date)
}

function formatWeekRange(weekData) {
  if (!weekData.length) return ""
  const first = weekData[0].rawDate
  const last = weekData[weekData.length - 1].rawDate
  if (!first || !last) return ""
  return `${first.getMonth() + 1}/${first.getDate()} - ${last.getMonth() + 1}/${last.getDate()}`
}

function formatAgo(dateStr) {
  if (!dateStr) return "최근"
  const time = new Date(dateStr).getTime()
  if (!Number.isFinite(time)) return "최근"
  const diff = Math.floor((Date.now() - time) / DAY_MS)
  if (diff <= 0) return "오늘"
  if (diff === 1) return "어제"
  if (diff < 30) return `${diff}일 전`
  if (diff < 365) return `${Math.floor(diff / 30)}개월 전`
  return `${Math.floor(diff / 365)}년 전`
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function getActivityLevel(count) {
  if (!count) return 0
  if (count <= 2) return 1
  if (count <= 4) return 2
  if (count <= 6) return 3
  return 4
}

function buildActivityIndex(features) {
  const byDate = new Map()
  for (const feature of features) {
    const date = getFeatureDate(feature)
    if (!date) continue
    const key = getDateKey(date)
    byDate.set(key, (byDate.get(key) || 0) + 1)
  }
  return byDate
}

function buildWeekData(today, activityByDate) {
  const base = startOfDay(today)
  const mondayOffset = (base.getDay() + 6) % 7
  const monday = new Date(base.getTime() - mondayOffset * DAY_MS)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday.getTime() + index * DAY_MS)
    const future = date > base
    const count = activityByDate.get(getDateKey(date)) || 0
    return {
      key: getDateKey(date),
      dow: WEEK_LABELS[date.getDay()],
      date: date.getDate(),
      count,
      future,
      today: getDateKey(date) === getDateKey(base),
      rawDate: date,
    }
  })
}

function sumRange(startDate, days, activityByDate) {
  let total = 0
  for (let i = 0; i < days; i += 1) {
    const date = new Date(startDate.getTime() + i * DAY_MS)
    total += activityByDate.get(getDateKey(date)) || 0
  }
  return total
}

function getRangeEnd(startDate, days) {
  return new Date(startDate.getTime() + days * DAY_MS)
}

function getMonthRange(year, month) {
  return {
    start: new Date(year, month, 1),
    end: new Date(year, month + 1, 1),
  }
}

function formatRecordDate(date) {
  if (!date) return "날짜 없음"
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(date)
}

function getFeatureKindLabel(feature) {
  if (feature?.type === "route") return "동선"
  if (feature?.type === "area") return "구역"
  return "장소"
}

function getFeatureSummary(feature) {
  const bits = []
  if (feature?.note?.trim()) bits.push(feature.note.trim())
  if (Array.isArray(feature?.memos) && feature.memos.some((memo) => memo.text?.trim())) bits.push("메모")
  if (Array.isArray(feature?.photos) && feature.photos.length > 0) bits.push(`사진 ${feature.photos.length}`)
  if (Array.isArray(feature?.voices) && feature.voices.length > 0) bits.push(`음성 ${feature.voices.length}`)
  return bits.slice(0, 2).join(" · ")
}

function buildRecordGroups(features, maps, range) {
  if (!range) return []
  const mapById = new Map(maps.map((map) => [map.id, map]))
  const groups = new Map()

  features
    .map((feature) => ({ feature, date: getFeatureDate(feature) }))
    .filter(({ date }) => date && date >= range.start && date < range.end)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .forEach(({ feature, date }) => {
      const mapId = getFeatureMapId(feature) || "unknown"
      const map = mapById.get(mapId)
      if (!groups.has(mapId)) {
        groups.set(mapId, {
          mapId,
          mapTitle: map?.title || "분류 없는 기록",
          records: [],
        })
      }
      groups.get(mapId).records.push({
        id: feature.id || `${mapId}-${date.getTime()}`,
        title: feature.title || feature.name || "이름 없는 기록",
        kind: getFeatureKindLabel(feature),
        date,
        summary: getFeatureSummary(feature),
        mapId,
      })
    })

  return [...groups.values()]
}

function buildMonthCells(today, activityByDate) {
  const year = today.getFullYear()
  const month = today.getMonth()
  const first = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < first.getDay(); i += 1) cells.push({ key: `empty-${i}`, empty: true })
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day)
    const key = getDateKey(date)
    cells.push({
      key,
      date: day,
      count: activityByDate.get(key) || 0,
      today: key === getDateKey(today),
      future: date > startOfDay(today),
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
        cells.push({ key: `empty-${week}-${dow}`, future: true, empty: true })
        continue
      }
      const date = new Date(year, 0, doy + 1)
      const key = getDateKey(date)
      cells.push({
        key,
        count: activityByDate.get(key) || 0,
        today: key === getDateKey(today),
        future: date > startOfDay(today),
        rawDate: date,
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

function buildResumeMap(personalMaps, featuresByMapId) {
  const map = personalMaps.find((item) => (featuresByMapId.get(item.id) || []).length > 0)
  if (!map) return null

  const mapFeatures = [...(featuresByMapId.get(map.id) || [])].sort((a, b) => getFeatureTime(b) - getFeatureTime(a))
  const lastFeature = mapFeatures[0]
  const visited = mapFeatures.length
  const targetTotal = Number(map?.config?.targetPlaceCount || map?.targetPlaceCount || map?.placeGoal || 14)
  return {
    id: map.id,
    title: map.title || "내 지도",
    visited,
    total: Math.max(visited, Number.isFinite(targetTotal) ? targetTotal : 14),
    startedAgoLabel: formatAgo(map.createdAt || map.created_at || map.updatedAt || map.updated_at),
    lastPlaceName: lastFeature?.title || lastFeature?.name || "최근 기록",
  }
}

function buildSharedMaps(recommendedMaps) {
  const picked = recommendedMaps.slice(0, 2).map((item, index) => ({
    kind: "user",
    id: item.id || item.mapId || `picked-${index}`,
    mapId: item.mapId || item.id,
    title: item.title || "동네 지도",
    ownerHandle: String(item.creator || item.creatorName || (index === 0 ? "minji" : "hye")).replace(/^@/, ""),
    placeCount: item.placeCount || item.featureCount || 0,
    gradient: item.gradient || (index === 0 ? ["#F9C56B", "#F4A53C"] : ["#A48BD9", "#7E66BD"]),
  }))

  return [
    ...picked,
    {
      kind: "public_changes",
      id: "public-changes",
      title: "공공데이터로 본 변화",
      sub: "상점·이전 정보",
      gradient: ["#FFB58F", "#FF8654"],
    },
  ].slice(0, 3)
}

function HomeSection({ title, actionLabel, onAction, children }) {
  const sectionId = `home-section-${title.replace(/\s+/g, "-")}`
  return (
    <section className="home-v9-section" aria-labelledby={sectionId}>
      <div className="home-v9-section__head">
        <h2 id={sectionId}>{title}</h2>
        {actionLabel ? (
          <button type="button" onClick={onAction} className="home-v9-section__link">
            {actionLabel}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function WeekTracker({ weekData, weekDelta, onOpenDay, onOpenMonth, onOpenYear }) {
  const weekTotal = weekData.reduce((sum, item) => sum + (item.future ? 0 : item.count || 0), 0)
  const range = formatWeekRange(weekData)

  return (
    <section className="home-v9-tracker" aria-label="주간 기록">
      <div className="home-v9-tracker__head">
        <div>
          <strong>이번 주</strong>
          <span>· {range}</span>
        </div>
        <div>
          <strong>{weekTotal}</strong>
          <span>기록</span>
          <em>+{Math.max(0, weekDelta)}</em>
        </div>
      </div>

      <div className="home-v9-week-grid">
        {weekData.map((item) => (
          <button
            type="button"
            key={item.key}
            className={`home-v9-day${item.today ? " is-today" : ""}${item.future ? " is-future" : ""}${item.count ? " has-records" : ""}`}
            aria-label={`${item.dow} ${item.date} ${item.count || 0}`}
            disabled={!item.count}
            onClick={() => onOpenDay(item)}
          >
            <span className="home-v9-day__dow">{item.dow}</span>
            <span className="home-v9-day__date">{item.date}</span>
            <span className="home-v9-day__dot" data-lvl={getActivityLevel(item.count)} />
          </button>
        ))}
      </div>

      <div className="home-v9-tracker__actions">
        <button type="button" onClick={onOpenMonth}>
          <span>월간 보기</span>
          <ChevronRight size={13} aria-hidden="true" />
        </button>
        <button type="button" onClick={onOpenYear}>
          <span>연간 보기</span>
          <ChevronRight size={13} aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}

function MonthDialog({ today, monthCells, monthTotal, prevMonthDelta, onOpenDate, onClose }) {
  return (
    <section className="home-v9-dialog home-v9-dialog--month is-open" role="dialog" aria-modal="true" aria-label="월간 기록">
      <DialogHeader
        title={`${today.getMonth() + 1}월 ${today.getFullYear()}`}
        stat={<><strong>{monthTotal}</strong>개 <span className="home-v9-dialog__trend">↑ +{Math.max(0, prevMonthDelta)} 지난달</span></>}
        onClose={onClose}
      />
      <div className="home-v9-dialog__nav">
        <button type="button" aria-label="이전 달"><ChevronLeft size={14} aria-hidden="true" /></button>
        <strong>{today.getFullYear()}년 {today.getMonth() + 1}월</strong>
        <button type="button" aria-label="다음 달"><ChevronRight size={14} aria-hidden="true" /></button>
      </div>
      <div className="home-v9-month-dows">
        {WEEK_LABELS.map((label) => <span key={label}>{label}</span>)}
      </div>
      <div className="home-v9-month-grid">
        {monthCells.map((cell) => (
          <button
            type="button"
            key={cell.key}
            className={`home-v9-month-cell${cell.empty ? " is-empty" : ""}${cell.today ? " is-today" : ""}${cell.future ? " is-future" : ""}${cell.count ? " has-records" : ""}`}
            disabled={cell.empty || !cell.count}
            onClick={() => onOpenDate(cell)}
          >
            <span>{cell.date}</span>
            <i data-lvl={getActivityLevel(cell.count)} />
          </button>
        ))}
      </div>
    </section>
  )
}

function YearDialog({ today, yearCells, monthlyTotals, activeDays, yearTotal, onOpenDate, onOpenMonth, onClose }) {
  const maxMonth = Math.max(1, ...monthlyTotals)
  return (
    <section className="home-v9-dialog home-v9-dialog--year is-open" role="dialog" aria-modal="true" aria-label="연간 기록">
      <DialogHeader
        title={`${today.getFullYear()}`}
        stat={<><strong>{yearTotal}</strong>개 · <strong>{activeDays}</strong>일 활동</>}
        onClose={onClose}
      />
      <div className="home-v9-year-months">
        {MONTH_LABELS.map((label) => <span key={label}>{label.replace("월", "")}</span>)}
      </div>
      <div className="home-v9-year-row">
        <div className="home-v9-year-dows" aria-hidden="true">
          <span />
          <span>월</span>
          <span />
          <span>수</span>
          <span />
          <span>금</span>
          <span />
        </div>
        <div className="home-v9-year-grid">
          {yearCells.map((cell) => (
            <button
              type="button"
              key={cell.key}
              className={`home-v9-year-cell${cell.today ? " is-today" : ""}${cell.future ? " is-future" : ""}${cell.count ? " has-records" : ""}`}
              data-lvl={getActivityLevel(cell.count)}
              disabled={cell.empty || !cell.count}
              onClick={() => onOpenDate(cell)}
            />
          ))}
        </div>
      </div>
      <div className="home-v9-year-legend" aria-hidden="true">
        <span>적음</span>
        {[0, 1, 2, 3, 4].map((level) => <i key={level} data-lvl={level} />)}
        <span>많음</span>
      </div>
      <div className="home-v9-monthly">
        <h4>월별 활동</h4>
        <div className="home-v9-monthly__list">
          {monthlyTotals.map((count, index) => {
            const future = index > today.getMonth()
            const pct = future || count === 0 ? 0 : (count / maxMonth) * 100
            return (
              <button
                type="button"
                key={MONTH_LABELS[index]}
                className={`home-v9-monthly__row${future ? " is-future" : ""}${count ? " has-records" : ""}`}
                disabled={future || !count}
                onClick={() => onOpenMonth(index, count)}
              >
                <span>{index + 1}월</span>
                <b><i style={{ width: `${pct}%` }} /></b>
                <strong>{future || count === 0 ? "·" : count}</strong>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function DialogHeader({ title, stat, onClose }) {
  return (
    <div className="home-v9-dialog__head">
      <div>
        <h3>{title}</h3>
        <p>{stat}</p>
      </div>
      <button type="button" onClick={onClose} aria-label="닫기">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  )
}

function RecordListDialog({ range, groups, onOpenMap, onClose }) {
  const total = groups.reduce((sum, group) => sum + group.records.length, 0)

  return (
    <section className="home-v9-dialog home-v9-dialog--records is-open" role="dialog" aria-modal="true" aria-label="기간별 기록">
      <DialogHeader
        title={range?.title || "기록 모아보기"}
        stat={<><strong>{total}</strong>개 · {range?.subtitle || "선택한 기간"}</>}
        onClose={onClose}
      />
      {groups.length ? (
        <div className="home-v9-record-groups">
          {groups.map((group) => (
            <article className="home-v9-record-group" key={group.mapId}>
              <button type="button" className="home-v9-record-group__head" onClick={() => onOpenMap?.(group.mapId)}>
                <span>
                  <strong>{group.mapTitle}</strong>
                  <em>{group.records.length}개 기록</em>
                </span>
                <ChevronRight size={14} aria-hidden="true" />
              </button>
              <div className="home-v9-record-list">
                {group.records.map((record) => (
                  <button
                    type="button"
                    className="home-v9-record-item"
                    key={record.id}
                    onClick={() => onOpenMap?.(record.mapId)}
                  >
                    <span className="home-v9-record-item__marker">{record.kind}</span>
                    <span className="home-v9-record-item__body">
                      <strong>{record.title}</strong>
                      <em>{formatRecordDate(record.date)}{record.summary ? ` · ${record.summary}` : ""}</em>
                    </span>
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="home-v9-record-empty">
          <strong>이 기간에는 아직 기록이 없어요</strong>
          <span>기록이 있는 날짜나 월을 누르면 지도별로 모아볼 수 있어요.</span>
        </div>
      )}
    </section>
  )
}

export function HomeScreen({
  onResumeMyMap,
  onOpenMap,
  onNavigateToExplore,
  onOpenExploreSearch,
  onOpenNotifications,
  hasUnread = false,
  maps = [],
  features = [],
  recommendedMaps = [],
  viewerProfile = null,
  userStats = null,
  levelEmoji = "",
}) {
  const [openDialog, setOpenDialog] = useState(null)
  const [recordRange, setRecordRange] = useState(null)
  const today = useMemo(() => startOfDay(new Date()), [])

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
  const monthCells = useMemo(() => buildMonthCells(today, activityByDate), [activityByDate, today])
  const yearCells = useMemo(() => buildYearCells(today, activityByDate), [activityByDate, today])
  const monthlyTotals = useMemo(() => buildMonthlyTotals(today, activityByDate), [activityByDate, today])

  const resumeMap = useMemo(() => buildResumeMap(personalMaps, featuresByMapId), [featuresByMapId, personalMaps])
  const sharedMaps = useMemo(() => buildSharedMaps(recommendedMaps), [recommendedMaps])

  const xp = userStats?.xp || 0
  const levelInfo = useMemo(() => getLevelForXp(xp), [xp])
  const levelProgress = useMemo(() => getLevelProgress(xp), [xp])
  const progressPct = clamp(Math.round((levelProgress.progress || 0) * 100), 0, 100)
  const remainingXp = levelProgress.remaining || 0
  const userName = viewerProfile?.name || "LOCA"
  const placeCountStat = userStats?.pins || features.filter((feature) => feature.type === "pin").length
  const mapCountStat = userStats?.maps ?? personalMaps.length
  const streakStat = userStats?.streak || 0
  const monthTotal = monthlyTotals[today.getMonth()] || 0
  const prevMonthTotal = monthlyTotals[Math.max(0, today.getMonth() - 1)] || 0
  const currentWeekStart = weekData[0]?.rawDate || today
  const prevWeekTotal = useMemo(
    () => sumRange(new Date(currentWeekStart.getTime() - 7 * DAY_MS), 7, activityByDate),
    [activityByDate, currentWeekStart],
  )
  const weekTotal = weekData.reduce((sum, item) => sum + (item.future ? 0 : item.count || 0), 0)
  const activeDays = yearCells.filter((cell) => !cell.future && (cell.count || 0) > 0).length
  const yearTotal = monthlyTotals.reduce((sum, count) => sum + count, 0)
  const recordGroups = useMemo(() => buildRecordGroups(features, maps, recordRange), [features, maps, recordRange])
  const openRecordRange = (range) => {
    setRecordRange(range)
    setOpenDialog("records")
  }
  const openDayRecords = (date, count) => {
    const day = startOfDay(date)
    openRecordRange({
      type: "day",
      title: `${day.getMonth() + 1}월 ${day.getDate()}일 기록`,
      subtitle: `${count || 0}개 기록`,
      start: day,
      end: getRangeEnd(day, 1),
    })
  }
  const openMonthRecords = (monthIndex, count) => {
    const { start, end } = getMonthRange(today.getFullYear(), monthIndex)
    openRecordRange({
      type: "month",
      title: `${monthIndex + 1}월 기록`,
      subtitle: `${count || 0}개 기록`,
      start,
      end,
    })
  }
  const openMapFromRecords = (mapId) => {
    setOpenDialog(null)
    if (!mapId || mapId === "unknown") return
    onResumeMyMap?.(mapId)
  }

  return (
    <section className="screen screen--scroll home-screen home-v9">
      <div className="home-v9-shell">
        <header className="home-v9-header">
          <strong aria-label="LOCA">LOCA</strong>
          <button type="button" className="home-v9-icon-btn" aria-label="알림" onClick={onOpenNotifications}>
            <Bell size={20} strokeWidth={1.9} aria-hidden="true" />
            {hasUnread ? <span /> : null}
          </button>
        </header>

        <div className="home-v9-greeting">
          <time>{formatKoreanDate(today)}</time>
          <h1>{userName}님, 안녕하세요.</h1>
        </div>

        <section className="home-v9-combo" aria-label="내 기록 요약">
          <div className="home-v9-combo__profile">
            <div className="home-v9-avatar" aria-hidden="true">
              {levelEmoji ? <img src={levelEmoji} alt="" /> : <span>{levelInfo.emoji || "🥚"}</span>}
            </div>
            <div className="home-v9-profile-copy">
              <div className="home-v9-name-row">
                <strong>{userName}</strong>
                <span>Lv {levelInfo.level}</span>
              </div>
              <span className="home-v9-title-pill">거리 달리기</span>
              <div className="home-v9-next-row">
                <span>다음 모험 뱃지까지</span>
                <strong>{remainingXp || xp} XP</strong>
              </div>
              <div className="home-v9-xp" aria-hidden="true"><i style={{ width: `${progressPct}%` }} /></div>
              <div className="home-v9-stats">
                <span><MapPin size={10} aria-hidden="true" /> <b>{placeCountStat}</b>장소</span>
                <span><Layers size={10} aria-hidden="true" /> <b>{mapCountStat}</b>지도</span>
                <span><b>{streakStat}일</b>연속</span>
              </div>
            </div>
          </div>

          <div className="home-v9-combo__divider" />

          {resumeMap ? (
            <button type="button" className="home-v9-continue" onClick={() => onResumeMyMap?.(resumeMap.id)}>
              <span className="home-v9-continue__thumb" aria-hidden="true"><b>{resumeMap.visited}/{resumeMap.total}</b></span>
              <span className="home-v9-continue__body">
                <small>이어 기록하기</small>
                <strong>{resumeMap.title}</strong>
                <em>{resumeMap.startedAgoLabel} 시작 · 마지막 {resumeMap.lastPlaceName}</em>
              </span>
              <span className="home-v9-continue__progress">+ 이어서</span>
            </button>
          ) : (
            <button type="button" className="home-v9-continue" onClick={onNavigateToExplore}>
              <span className="home-v9-continue__thumb" aria-hidden="true"><b>0/1</b></span>
              <span className="home-v9-continue__body">
                <small>첫 기록 시작하기</small>
                <strong>오늘의 장소를 남겨보세요</strong>
                <em>사진, 메모, 음성으로 가볍게 시작</em>
              </span>
              <span className="home-v9-continue__progress">+ 시작</span>
            </button>
          )}
        </section>

        <HomeSection title="내 기록">
          <WeekTracker
            weekData={weekData}
            weekDelta={weekTotal - prevWeekTotal}
            onOpenDay={(item) => openDayRecords(item.rawDate, item.count)}
            onOpenMonth={() => setOpenDialog("month")}
            onOpenYear={() => setOpenDialog("year")}
          />
        </HomeSection>

        <HomeSection title="함께 보는 지도" actionLabel="탐색 →" onAction={onOpenExploreSearch || onNavigateToExplore}>
          <div className="home-v9-shared" aria-label="함께 보는 지도">
            {sharedMaps.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className="home-v9-map-card"
                onClick={() => {
                  if (item.kind === "public_changes") onNavigateToExplore?.()
                  else onOpenMap?.(item.mapId || item.id)
                }}
              >
                <span
                  className="home-v9-map-card__thumb"
                  style={{ "--card-a": item.gradient?.[0], "--card-b": item.gradient?.[1] }}
                  aria-hidden="true"
                >
                  {item.kind === "public_changes" ? <em>모두의 지도</em> : null}
                  <i style={{ left: `${28 + index * 10}%`, top: "42%" }} />
                  <i style={{ left: "62%", top: `${52 - index * 8}%` }} />
                </span>
                <strong>{item.title}</strong>
                <small>{item.kind === "public_changes" ? item.sub : `@${item.ownerHandle} · ${item.placeCount}곳`}</small>
              </button>
            ))}
          </div>
        </HomeSection>
      </div>

      <div
        className={`home-v9-overlay${openDialog ? " is-open" : ""}`}
        onClick={() => setOpenDialog(null)}
        aria-hidden={!openDialog}
      >
        <div onClick={(event) => event.stopPropagation()}>
          {openDialog === "month" ? (
            <MonthDialog
              today={today}
              monthCells={monthCells}
              monthTotal={monthTotal}
              prevMonthDelta={monthTotal - prevMonthTotal}
              onOpenDate={(cell) => openDayRecords(new Date(today.getFullYear(), today.getMonth(), cell.date), cell.count)}
              onClose={() => setOpenDialog(null)}
            />
          ) : null}
          {openDialog === "year" ? (
            <YearDialog
              today={today}
              yearCells={yearCells}
              monthlyTotals={monthlyTotals}
              activeDays={activeDays}
              yearTotal={yearTotal}
              onOpenDate={(cell) => openDayRecords(cell.rawDate, cell.count)}
              onOpenMonth={openMonthRecords}
              onClose={() => setOpenDialog(null)}
            />
          ) : null}
          {openDialog === "records" ? (
            <RecordListDialog
              range={recordRange}
              groups={recordGroups}
              onOpenMap={openMapFromRecords}
              onClose={() => setOpenDialog(null)}
            />
          ) : null}
        </div>
      </div>
    </section>
  )
}
