import { useEffect, useState } from "react"
import { ExternalLink, MapPin, Phone, Plus, X } from "lucide-react"
import {
  curationContentRef,
  eventDdayBadge,
  eventToPrefill,
  fetchCurationDetail,
  formatDistanceKm,
  formatEventPeriod,
  placeToPrefill,
  wildlifeToPrefill,
} from "../../lib/exploreCuration"

// 탐색 큐레이션 카드 상세 시트 — 행사/공간 공용 간단 정보.
// TourAPI 소스면 상세(소개/시간/요금)를 추가 조회, 카카오 소스는 기본 정보 + 외부 링크.

function InfoRow({ label, value }) {
  const text = String(value || "").trim()
  if (!text) return null
  return (
    <div className="xdt-row">
      <span className="xdt-row__label">{label}</span>
      <span className="xdt-row__value">{text}</span>
    </div>
  )
}

export function CurationDetailSheet({ item, onClose, onRegister }) {
  const data = item?.data || null
  const isEvent = item?.type === "event"
  const isWildlife = item?.type === "wildlife"
  // 생물(iNaturalist)은 TourAPI 상세가 없으므로 조회하지 않는다
  const contentRef = data && !isWildlife ? curationContentRef(data) : null
  const detailKey = contentRef ? `${contentRef.contentId}` : null
  // 상세를 요청 키와 함께 저장 — 키가 다르면 로딩 중 (effect 내 동기 setState 회피)
  const [detailResult, setDetailResult] = useState({ key: null, detail: null })

  useEffect(() => {
    if (!detailKey || !contentRef) return undefined
    let cancelled = false
    fetchCurationDetail(contentRef)
      .then((detail) => { if (!cancelled) setDetailResult({ key: detailKey, detail }) })
      .catch(() => { if (!cancelled) setDetailResult({ key: detailKey, detail: null }) })
    return () => { cancelled = true }
  }, [detailKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return null

  if (isWildlife) {
    const wDistance = formatDistanceKm(data.distKm)
    return (
      <div className="xdt-backdrop" onClick={onClose} role="presentation">
        <section
          className="xdt-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={`${data.title} 정보`}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" className="xdt-close" onClick={onClose} aria-label="닫기">
            <X size={15} strokeWidth={2.4} />
          </button>

          {data.photoLarge || data.photo ? (
            <div className="xdt-hero">
              <img src={data.photoLarge || data.photo} alt="" loading="lazy" />
              <span className="xc-card__dday xc-card__dday--wild">{data.emoji} {data.category}</span>
            </div>
          ) : null}

          <div className="xdt-body">
            <header className="xdt-head">
              <span className="xdt-kind">{data.emoji} {data.category} · 관측 기록</span>
              <strong className="xdt-title">{data.title}</strong>
              <span className="xdt-sub">
                {data.scientific ? <em>{data.scientific}</em> : null}
                {wDistance ? (
                  <span className="xdt-dist">
                    <MapPin size={11} strokeWidth={2.4} aria-hidden="true" />
                    {wDistance}
                  </span>
                ) : null}
              </span>
            </header>

            <div className="xdt-rows">
              <InfoRow label="관측지" value={data.place} />
              <InfoRow label="관측일" value={data.observedOn} />
            </div>

            <p className="xdt-note">
              이 근처에서 관측된 기록이에요. 늘 여기 있는 건 아니지만, 운이 좋으면 만날 수 있어요.
            </p>
            {data.attribution ? <p className="xdt-credit">사진 {data.attribution}</p> : null}
          </div>

          <footer className="xdt-foot">
            {data.uri ? (
              <a className="xdt-link" href={data.uri} target="_blank" rel="noreferrer noopener">
                <ExternalLink size={13} strokeWidth={2.4} aria-hidden="true" />
                iNaturalist
              </a>
            ) : <span />}
            <button
              type="button"
              className="xdt-register"
              onClick={() => onRegister?.(wildlifeToPrefill(data))}
            >
              <Plus size={14} strokeWidth={2.6} aria-hidden="true" />
              발견 기록
            </button>
          </footer>
        </section>
      </div>
    )
  }

  const detailLoading = Boolean(detailKey) && detailResult.key !== detailKey
  const detail = detailKey && detailResult.key === detailKey ? detailResult.detail : null

  const badge = isEvent ? eventDdayBadge(data) : null
  const period = isEvent ? formatEventPeriod(data) : ""
  const distance = formatDistanceKm(data.distKm)
  const image = data.image || detail?.image || ""
  const overview = (detail?.overview || "").trim()
  const externalUrl = data.sourceUrl || detail?.homepage || ""
  const prefill = isEvent ? eventToPrefill(data) : placeToPrefill(data)

  return (
    <div className="xdt-backdrop" onClick={onClose} role="presentation">
      <section
        className="xdt-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${data.title} 정보`}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="xdt-close" onClick={onClose} aria-label="닫기">
          <X size={15} strokeWidth={2.4} />
        </button>

        {image ? (
          <div className="xdt-hero">
            <img src={image} alt="" loading="lazy" />
            {badge ? <span className={`xc-card__dday xc-card__dday--${badge.kind}`}>{badge.label}</span> : null}
          </div>
        ) : null}

        <div className="xdt-body">
          <header className="xdt-head">
            <span className="xdt-kind">{isEvent ? "행사·축제" : (data.category || "공간")}</span>
            <strong className="xdt-title">{data.title}</strong>
            <span className="xdt-sub">
              {period ? <em>{period}</em> : null}
              {distance ? (
                <span className="xdt-dist">
                  <MapPin size={11} strokeWidth={2.4} aria-hidden="true" />
                  {distance}
                </span>
              ) : null}
            </span>
          </header>

          <div className="xdt-rows">
            <InfoRow label="주소" value={detail?.addr || data.addr} />
            {isEvent ? <InfoRow label="장소" value={detail?.eventPlace} /> : null}
            {isEvent ? <InfoRow label="시간" value={detail?.playTime} /> : <InfoRow label="이용" value={detail?.useTime} />}
            {isEvent ? <InfoRow label="요금" value={detail?.useTimeFestival} /> : <InfoRow label="요금" value={detail?.useFee} />}
            {!isEvent ? <InfoRow label="휴무" value={detail?.restDate} /> : null}
            <InfoRow label="문의" value={data.phone || data.tel || detail?.tel} />
          </div>

          {detailLoading ? (
            <p className="xdt-overview xdt-overview--loading">정보를 불러오는 중…</p>
          ) : overview ? (
            <p className="xdt-overview">{overview.length > 600 ? `${overview.slice(0, 600)}…` : overview}</p>
          ) : null}
        </div>

        <footer className="xdt-foot">
          {externalUrl ? (
            <a className="xdt-link" href={externalUrl} target="_blank" rel="noreferrer noopener">
              <ExternalLink size={13} strokeWidth={2.4} aria-hidden="true" />
              {data.source === "kakao" ? "카카오맵" : "자세히"}
            </a>
          ) : (data.phone || data.tel) ? (
            <a className="xdt-link" href={`tel:${String(data.phone || data.tel).replace(/[^0-9+]/g, "")}`}>
              <Phone size={13} strokeWidth={2.4} aria-hidden="true" />
              전화
            </a>
          ) : <span />}
          <button type="button" className="xdt-register" onClick={() => onRegister?.(prefill)}>
            <Plus size={14} strokeWidth={2.6} aria-hidden="true" />
            카드로 등록
          </button>
        </footer>
      </section>
    </div>
  )
}
