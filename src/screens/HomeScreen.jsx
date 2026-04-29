import { useMemo } from "react"
import { ChevronRight, MapPin, PlusCircle, Sparkles, Layers, Flame, Star } from "lucide-react"
import { isEventMap } from "../lib/mapPlacement"
import { getLevelForXp, getLevelProgress } from "../data/gamification"

function getMapTime(map) {
  const value = map?.updatedAt || map?.updated_at || map?.createdAt || map?.created_at
  const time = value ? new Date(value).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

function formatUpdatedAt(dateStr) {
  if (!dateStr) return ""
  const time = new Date(dateStr).getTime()
  if (!Number.isFinite(time)) return ""
  const diff = Math.floor((Date.now() - time) / 86400000)
  if (diff <= 0) return "오늘 수정"
  if (diff === 1) return "어제 수정"
  if (diff < 7) return `${diff}일 전 수정`
  if (diff < 30) return `${Math.floor(diff / 7)}주 전 수정`
  return `${Math.floor(diff / 30)}달 전 수정`
}

function buildMapMeta(map, placeCount) {
  const updatedLabel = formatUpdatedAt(map?.updatedAt || map?.updated_at)
  const placeLabel = placeCount > 0 ? `장소 ${placeCount}개` : "아직 남긴 장소 없음"
  return [updatedLabel, placeLabel].filter(Boolean).join(" · ")
}

export function HomeScreen({
  onResumeMyMap,
  onCreateMap,
  onOpenMap,
  onNavigateToExplore,
  maps = [],
  features = [],
  recommendedMaps = [],
  viewerProfile = null,
  userStats = null,
  levelEmoji = "",
}) {
  const featureCountByMapId = useMemo(() => {
    const counts = new Map()
    for (const feature of features) {
      if (!feature.mapId) continue
      counts.set(feature.mapId, (counts.get(feature.mapId) || 0) + 1)
    }
    return counts
  }, [features])

  const personalMaps = useMemo(() => (
    maps
      .filter((map) => !isEventMap(map))
      .slice()
      .sort((a, b) => getMapTime(b) - getMapTime(a))
  ), [maps])

  const resumeState = useMemo(() => {
    if (personalMaps.length === 0) {
      return { mode: "first" }
    }

    const withFeatures = personalMaps.filter((map) => (featureCountByMapId.get(map.id) || 0) > 0)
    if (withFeatures.length === 0) {
      return { mode: "hidden" }
    }

    const picked = withFeatures[0]
    return {
      mode: "resume",
      map: picked,
      placeCount: featureCountByMapId.get(picked.id) || 0,
    }
  }, [featureCountByMapId, personalMaps])

  const xp = userStats?.xp || 0
  const levelInfo = useMemo(() => getLevelForXp(xp), [xp])
  const levelProgress = useMemo(() => getLevelProgress(xp), [xp])
  const isFirstStep = levelInfo.level === 1
  const placeCountStat = userStats?.pins || 0
  const mapCountStat = userStats?.maps ?? personalMaps.length
  const streakStat = userStats?.streak || 0
  const progressPct = Math.max(isFirstStep ? 4 : 8, Math.round((levelProgress.progress || 0) * 100))
  const remainingXp = levelProgress.remaining || 0
  const nextCloudName = levelProgress.next?.cloudName || ""
  const userName = viewerProfile?.name || ""
  const userHandle = viewerProfile?.handle || ""
  const greetingName = userName ? `${userName} 님,` : ""

  const curatedMaps = recommendedMaps.slice(0, 4)

  return (
    <section className="screen screen--scroll home-screen home-record-home">
      <div className="home-record-shell">
        {/* 프로필 카드 */}
        <section className={`pc${isFirstStep ? " pc--new" : ""}`} aria-label="내 프로필 요약">
          <div className={`pc-glow${isFirstStep ? " new" : ""}`} aria-hidden="true" />

          <div className="pc-top">
            <div className="pc-char">
              <div className={`pc-cloud${isFirstStep ? " new" : ""}`}>
                {levelEmoji ? (
                  <img src={levelEmoji} alt="" className="pc-cloud-img" />
                ) : (
                  <span className="pc-cloud-emoji" aria-hidden="true">{levelInfo.emoji || "☁️"}</span>
                )}
              </div>
              <span className={`pc-cloud-name${isFirstStep ? " new" : ""}`}>{levelInfo.cloudName}</span>
            </div>

            <div className="pc-info">
              {isFirstStep ? (
                <div className="pc-greet"><span className="greet-dot" aria-hidden="true" />WELCOME</div>
              ) : null}
              <div className="pc-name">{isFirstStep ? greetingName : userName}</div>
              {userHandle ? <div className="pc-handle">{userHandle}</div> : null}
              <div className="pc-tier">
                <span className="pc-lv">Lv {levelInfo.level}</span>
                <span className="pc-title">{levelInfo.title}</span>
              </div>
            </div>
          </div>

          <div className="pc-xp">
            <div className="pc-xp-bar">
              <div
                className={`pc-xp-fill${isFirstStep ? " is-empty" : ""}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="pc-xp-meta">
              <span className="pc-xp-meta-l">
                {nextCloudName ? `다음 ${nextCloudName}까지` : "최고 레벨"}
              </span>
              <span className="pc-xp-meta-r">
                {nextCloudName ? (
                  <>
                    <span className="xp-num">{remainingXp} XP</span> 남음
                  </>
                ) : (
                  <span className="xp-num">MAX</span>
                )}
              </span>
            </div>
          </div>

          <div className="pc-divider" aria-hidden="true" />

          <div className="pc-stats">
            <div className="pc-stat">
              <span className="pc-stat-ico"><MapPin size={13} /></span>
              <span className="pc-stat-num">{placeCountStat}</span>
              <span className="pc-stat-label">장소</span>
            </div>
            <div className="pc-stat">
              <span className="pc-stat-ico"><Layers size={13} /></span>
              <span className="pc-stat-num">{mapCountStat}</span>
              <span className="pc-stat-label">지도</span>
            </div>
            <div className="pc-stat">
              <span className="pc-stat-ico pc-stat-ico--fire"><Flame size={13} /></span>
              <span className="pc-stat-num">{streakStat}일</span>
              <span className="pc-stat-label">연속</span>
            </div>
          </div>

          <div className="pc-divider" aria-hidden="true" />

          {resumeState.mode === "resume" ? (
            <button
              className="pc-resume"
              type="button"
              onClick={() => onResumeMyMap?.(resumeState.map.id)}
            >
              <span className="pc-resume-ico" aria-hidden="true">
                <MapPin size={16} />
              </span>
              <span className="pc-resume-tx">
                <span className="pc-resume-l1">RESUME</span>
                <span className="pc-resume-name">
                  {resumeState.map.title || "내 지도"} · {buildMapMeta(resumeState.map, resumeState.placeCount).split(" · ").slice(-1)[0]}
                </span>
              </span>
              <span className="pc-resume-cta">계속 →</span>
            </button>
          ) : (
            <button className="pc-resume" type="button" onClick={onCreateMap}>
              <span className="pc-resume-ico new" aria-hidden="true">
                <Star size={16} />
              </span>
              <span className="pc-resume-tx">
                <span className="pc-resume-l1">FIRST STEP</span>
                <span className="pc-resume-name">첫 장소를 남겨볼까요?</span>
              </span>
              <span className="pc-resume-cta">시작 →</span>
            </button>
          )}
        </section>

        <section className="home-start-hero" aria-labelledby="home-start-title">
          <span className="home-start-hero__blob1" aria-hidden="true" />
          <span className="home-start-hero__blob2" aria-hidden="true" />
          <span className="home-start-hero__blob3" aria-hidden="true" />
          <div className="home-start-hero__copy">
            <span className="home-start-hero__eyebrow">MY LOG</span>
            <h1 id="home-start-title">
              {isFirstStep ? "오늘부터 나만의 지도" : "오늘은 어디에 다녀왔어요?"}
            </h1>
            {isFirstStep ? <p>좋았던 장소 한 곳부터 시작해요</p> : null}
          </div>
          <button className="home-start-hero__cta" type="button" onClick={onCreateMap}>
            <PlusCircle size={18} />
            {isFirstStep ? "시작하기" : "기록하기"}
          </button>
        </section>

        <section className="home-section-lite" aria-labelledby="home-curated-title">
          <div className="home-section-lite__head">
            <div>
              <span className="home-section-lite__eyebrow">PICKED</span>
              <h2 id="home-curated-title">
                {isFirstStep ? "이런 지도부터 둘러볼까요" : "LOCA가 고른 지도"}
              </h2>
            </div>
            <button className="home-section-lite__link" type="button" onClick={onNavigateToExplore}>
              더보기
              <ChevronRight size={14} />
            </button>
          </div>

          {curatedMaps.length > 0 ? (
            <div className="home-curated-strip">
              {curatedMaps.map((item) => {
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
                      {(item.emojis || [""]).slice(0, 5).map((emoji, index) => (
                        <span
                          key={`${emoji}-${index}`}
                          className="rec-card__pin-dot"
                          style={{ left: `${16 + index * 17}%`, top: `${22 + (index % 3) * 22}%` }}
                        />
                      ))}
                    </div>
                    <div className="rec-card__body">
                      {tags.length > 0 ? (
                        <div className="rec-card__tags">
                          {tags.map((tag) => <span key={tag} className="rec-card__tag">{tag}</span>)}
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
            <div className="home-quiet-empty home-quiet-empty--curated">
              <Sparkles size={18} aria-hidden="true" />
              <strong>추천 지도를 준비 중이에요</strong>
              <span>곧 가볍게 둘러볼 지도를 보여드릴게요.</span>
            </div>
          )}
        </section>
      </div>
    </section>
  )
}
