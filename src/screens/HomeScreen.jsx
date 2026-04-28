import { useMemo } from "react"
import { ChevronRight, MapPin, PlusCircle, Sparkles } from "lucide-react"
import { isEventMap } from "../lib/mapPlacement"

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

  const curatedMaps = recommendedMaps.slice(0, 3)

  return (
    <section className="screen screen--scroll home-screen home-record-home">
      <div className="home-record-shell">
        <section className="home-start-hero" aria-labelledby="home-start-title">
          <div className="home-start-hero__copy">
            <span className="home-start-hero__eyebrow">MY LOG</span>
            <h1 id="home-start-title">오늘 남기고 싶은 장소가 있나요?</h1>
            <p>좋았던 장소를 하나씩 남기면, 나만의 지도가 됩니다.</p>
          </div>
          <button className="home-start-hero__cta" type="button" onClick={onCreateMap}>
            <PlusCircle size={18} />
            기록하기
          </button>
        </section>

        {resumeState.mode === "resume" ? (
          <section className="home-section-lite" aria-labelledby="home-resume-title">
            <div className="home-section-lite__head">
              <div>
                <span className="home-section-lite__eyebrow">RESUME</span>
                <h2 id="home-resume-title">이어서 기록하기</h2>
              </div>
            </div>
            <button
              className="home-resume-card"
              type="button"
              onClick={() => onResumeMyMap?.(resumeState.map.id)}
            >
              <span className="home-resume-card__icon" aria-hidden="true">
                <MapPin size={18} />
              </span>
              <span className="home-resume-card__body">
                <strong>{resumeState.map.title || "내 지도"}</strong>
                <small>{buildMapMeta(resumeState.map, resumeState.placeCount)}</small>
              </span>
              <span className="home-resume-card__action">
                계속 남기기
                <ChevronRight size={15} />
              </span>
            </button>
          </section>
        ) : null}

        <section className="home-section-lite" aria-labelledby="home-curated-title">
          <div className="home-section-lite__head">
            <div>
              <span className="home-section-lite__eyebrow">PICKED</span>
              <h2 id="home-curated-title">LOCA가 고른 지도</h2>
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
