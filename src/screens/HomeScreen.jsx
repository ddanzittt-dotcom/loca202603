import { useMemo } from "react"
import { Bell, Compass, Layers, MapPin, Plus, Search } from "lucide-react"
import { isEventMap } from "../lib/mapPlacement"
import { getLevelForXp, getLevelProgress } from "../data/gamification"

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

function formatKoreanDate(date = new Date()) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date)
}

function formatAgo(dateStr) {
  if (!dateStr) return "최근"
  const time = new Date(dateStr).getTime()
  if (!Number.isFinite(time)) return "최근"
  const diff = Math.floor((Date.now() - time) / 86400000)
  if (diff <= 0) return "오늘"
  if (diff === 1) return "어제"
  if (diff < 30) return `${diff}일 전`
  if (diff < 365) return `${Math.floor(diff / 30)}개월 전`
  return `${Math.floor(diff / 365)}년 전`
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
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
    gradient: item.gradient || (index === 0 ? ["#C8D0BD", "#5C7461"] : ["#FAE3D2", "#E26F3C"]),
  }))

  return [
    ...picked,
    {
      kind: "public_changes",
      id: "public-changes",
      title: "공공데이터로 본 변화",
      sub: "폐점·이전 정보",
      gradient: ["#FAEAD9", "#F2A57B"],
    },
  ]
}

function HomeSection({ title, actionLabel, onAction, children }) {
  const sectionId = `home-section-${title.replace(/\s+/g, "-")}`
  return (
    <section className="home-v2-section" aria-labelledby={sectionId}>
      <div className="home-v2-section__head">
        <h2 id={sectionId}>{title}</h2>
        {actionLabel ? (
          <button type="button" onClick={onAction} className="home-v2-section__link">
            {actionLabel}
          </button>
        ) : null}
      </div>
      {children}
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
  const personalMaps = useMemo(() => (
    maps
      .filter((map) => !isEventMap(map))
      .slice()
      .sort((a, b) => getMapTime(b) - getMapTime(a))
  ), [maps])

  const featuresByMapId = useMemo(() => {
    const groups = new Map()
    for (const feature of features) {
      if (!feature?.mapId) continue
      if (!groups.has(feature.mapId)) groups.set(feature.mapId, [])
      groups.get(feature.mapId).push(feature)
    }
    return groups
  }, [features])

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

  return (
    <section className="screen screen--scroll home-screen home-v2">
      <div className="home-v2-shell">
        <header className="home-v2-header">
          <div className="home-v2-wordmark" aria-label="LOCA">
            <span aria-hidden="true" />
            <strong>LOCA</strong>
          </div>
          <div className="home-v2-header__actions">
            <button type="button" className="home-v2-icon-btn" aria-label="탐색" onClick={onNavigateToExplore}>
              <Search size={17} strokeWidth={1.9} aria-hidden="true" />
            </button>
            <button type="button" className="home-v2-icon-btn" aria-label="알림" onClick={onOpenNotifications}>
              <Bell size={17} strokeWidth={1.9} aria-hidden="true" />
              {hasUnread ? <span className="home-v2-icon-btn__dot" /> : null}
            </button>
          </div>
        </header>

        <div className="home-v2-greeting">
          <time>{formatKoreanDate()}</time>
          <h1>
            {userName}님,
            <br />
            오늘은 <span>어디</span> 가실래요?
          </h1>
        </div>

        <section className="home-v2-profile" aria-label="내 프로필 요약">
          <span className="home-v2-profile__orb" aria-hidden="true" />
          <div className="home-v2-profile__main">
            <div className="home-v2-avatar" aria-hidden="true">
              {levelEmoji ? <img src={levelEmoji} alt="" /> : <span>{levelInfo.emoji || "☁️"}</span>}
            </div>
            <div className="home-v2-profile__copy">
              <div className="home-v2-name-row">
                <strong>{userName}</strong>
                <span>Lv {levelInfo.level}</span>
              </div>
              <span className="home-v2-badge">
                <Compass size={10} strokeWidth={2.2} aria-hidden="true" />
                {levelInfo.title || "동네 탐험가"}
              </span>
            </div>
          </div>

          <div className="home-v2-xp">
            <div className="home-v2-xp__meta">
              <span>{levelProgress.next ? "다음 모험 뱃지까지" : "최고 레벨 달성"}</span>
              <strong>{levelProgress.next ? `${remainingXp} XP` : "MAX"}</strong>
            </div>
            <div className="home-v2-xp__bar" aria-hidden="true">
              <span style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          <div className="home-v2-stats" aria-label="내 기록 통계">
            <div className="home-v2-stat">
              <MapPin size={13} strokeWidth={2.1} aria-hidden="true" />
              <strong className="num">{placeCountStat}</strong>
              <span>장소</span>
            </div>
            <i aria-hidden="true" />
            <div className="home-v2-stat home-v2-stat--moss">
              <Layers size={13} strokeWidth={2.1} aria-hidden="true" />
              <strong className="num">{mapCountStat}</strong>
              <span>지도</span>
            </div>
            <i aria-hidden="true" />
            <div className="home-v2-stat home-v2-stat--fire">
              <span aria-hidden="true">🔥</span>
              <strong className="num">{streakStat}일</strong>
              <span>연속</span>
            </div>
          </div>
        </section>

        {resumeMap ? (
          <HomeSection title="이어서 기록하기">
            <button type="button" className="home-v2-resume" onClick={() => onResumeMyMap?.(resumeMap.id)}>
              <span className="home-v2-resume__thumb" aria-hidden="true">
                <span>{resumeMap.visited}/{resumeMap.total}</span>
              </span>
              <span className="home-v2-resume__body">
                <strong>{resumeMap.title}</strong>
                <small>{resumeMap.startedAgoLabel} 시작 · 마지막 {resumeMap.lastPlaceName}</small>
                <span className="home-v2-resume__cta">
                  <Plus size={11} strokeWidth={2.8} aria-hidden="true" />
                  이어서 쓰기
                </span>
              </span>
            </button>
          </HomeSection>
        ) : null}

        <HomeSection title="함께 보는 지도" actionLabel="탐색 →" onAction={onOpenExploreSearch || onNavigateToExplore}>
          <div className="home-v2-shared-strip" aria-label="함께 보는 지도">
            {sharedMaps.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`home-v2-shared-card${item.kind === "public_changes" ? " home-v2-shared-card--public" : ""}`}
                onClick={() => {
                  if (item.kind === "public_changes") onNavigateToExplore?.()
                  else onOpenMap?.(item.mapId || item.id)
                }}
              >
                <span
                  className="home-v2-shared-card__thumb"
                  style={{ "--card-a": item.gradient?.[0], "--card-b": item.gradient?.[1] }}
                  aria-hidden="true"
                >
                  {item.kind === "public_changes" ? <em>🌐 모두의 지도</em> : null}
                  {item.kind !== "public_changes" ? <i style={{ left: `${22 + index * 16}%`, top: "34%" }} /> : null}
                  {item.kind !== "public_changes" ? <i style={{ left: "62%", top: `${28 + index * 12}%` }} /> : null}
                </span>
                <strong>{item.title}</strong>
                <small>
                  {item.kind === "public_changes" ? item.sub : `@${item.ownerHandle} · ${item.placeCount}곳`}
                </small>
              </button>
            ))}
          </div>
        </HomeSection>
      </div>
    </section>
  )
}
