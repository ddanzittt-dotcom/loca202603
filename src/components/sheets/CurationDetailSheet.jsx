import { useEffect, useState } from "react"
import { ExternalLink, MapPin, Phone, Plus, X } from "lucide-react"
import {
  curationContentRef,
  eventDdayBadge,
  eventToPrefill,
  fetchCurationDetail,
  formatDistanceKm,
  formatEventPeriod,
  formatRouteMeta,
  placeToPrefill,
  routeToPrefill,
  wildlifeToPrefill,
} from "../../lib/exploreCuration"
import { fetchCatalogDetail } from "../../lib/exploreCatalog"
import { isKorea } from "../mapRegion"
import { StaticMapPreview } from "../explore/StaticMapPreview"

// "2026-03-11" → "3.11" (접수기간 표기)
function shortDate(value) {
  const text = String(value || "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ""
  return `${Number(text.slice(5, 7))}.${Number(text.slice(8, 10))}`
}

// 탐색 큐레이션 카드 상세 시트 — 행사/공간 공용 간단 정보.
// TourAPI 소스면 상세(소개/시간/요금)를 추가 조회, 카카오 소스는 기본 정보 + 외부 링크.

// 히어로 지도 좌표 — 유효한 국내 좌표만 (카카오 StaticMap 은 국외 상세 타일이 없다).
// TourAPI 좌표 누락(0·null)도 isKorea 가 함께 걸러 준다.
function sheetMapCoords(data) {
  const lat = Number(data?.lat)
  const lng = Number(data?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return isKorea(lat, lng) ? { lat, lng } : null
}

// 히어로 — 사진 있으면 사진 기본 + [사진|지도] 토글, 사진 없으면 지도 기본 (좌표도 없으면 생략).
// 지도는 처음 볼 때 1회만 생성하고 이후 display 전환으로 유지한다 (SDK 쿼터 재집계 방지).
function SheetHero({ image, coords, title, level = 5, badge = null }) {
  const [view, setView] = useState("") // "" = 자동(사진 우선), "photo" | "map" = 사용자 선택
  // 지도가 처음 필요해지는 경로는 둘뿐 — 사진 없이 열림(초기값) 또는 지도 탭 클릭(핸들러)
  const [mapMounted, setMapMounted] = useState(() => Boolean(coords) && !image)
  const showMap = Boolean(coords) && (view === "map" || (view !== "photo" && !image))

  if (!image && !coords) return null

  const openMap = () => {
    setView("map")
    setMapMounted(true)
  }

  return (
    <div className="xdt-hero">
      {image ? <img src={image} alt="" loading="lazy" className={showMap ? "xdt-hero__off" : ""} /> : null}
      {coords && mapMounted ? (
        <div className={`xdt-hero__map${showMap ? "" : " xdt-hero__off"}`}>
          <StaticMapPreview lat={coords.lat} lng={coords.lng} title={title} level={level} />
        </div>
      ) : null}
      {badge}
      {image && coords ? (
        <div className="xdt-heroswitch" aria-label="사진·지도 전환">
          <button type="button" aria-pressed={!showMap} className={showMap ? "" : "is-on"} onClick={() => setView("photo")}>
            사진
          </button>
          <button type="button" aria-pressed={showMap} className={showMap ? "is-on" : ""} onClick={openMap}>
            지도
          </button>
        </div>
      ) : null}
    </div>
  )
}

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

  // 카탈로그 소스(강좌·도서관·체험마을 등) — 목록에서 뺀 부가정보(detail jsonb)를 시트에서만 조회
  const catalogId = data?.catalogId && !contentRef && !isWildlife ? data.catalogId : null
  const [catalogResult, setCatalogResult] = useState({ key: null, detail: null })

  useEffect(() => {
    if (!catalogId) return undefined
    let cancelled = false
    fetchCatalogDetail(catalogId)
      .then((detail) => { if (!cancelled) setCatalogResult({ key: catalogId, detail }) })
      .catch(() => { if (!cancelled) setCatalogResult({ key: catalogId, detail: null }) })
    return () => { cancelled = true }
  }, [catalogId])

  if (!data) return null

  if (isWildlife) {
    const wDistance = formatDistanceKm(data.distKm)
    const wCoords = sheetMapCoords(data)
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

          {/* 관측 좌표는 iNaturalist 흐림 처리 가능성이 있어 살짝 넓게(level 6) 보여 준다 */}
          {/* key: item 교체 시 뷰·지도 마운트 상태 이월 방지 (숨김 상태 재생성 = 0×0 지도) */}
          <SheetHero
            key={data.id || data.title}
            image={data.photoLarge || data.photo || ""}
            coords={wCoords}
            title={data.title}
            level={6}
            badge={<span className="xc-card__dday xc-card__dday--wild">{data.emoji} {data.category}</span>}
          />

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
                {data.source === "gbif" ? "GBIF" : "iNaturalist"}
              </a>
            ) : <span />}
            <button
              type="button"
              className="xdt-register"
              onClick={() => onRegister?.(wildlifeToPrefill(data))}
            >
              <Plus size={14} strokeWidth={2.6} aria-hidden="true" />
              발견 장소
            </button>
          </footer>
        </section>
      </div>
    )
  }

  const detailLoading = Boolean(detailKey) && detailResult.key !== detailKey
  const detail = detailKey && detailResult.key === detailKey ? detailResult.detail : null

  const isRoute = data.group === "route"
  const routeMeta = isRoute ? formatRouteMeta(data) : ""
  const catalogDetail = catalogId && catalogResult.key === catalogId ? catalogResult.detail : null
  const badge = isEvent ? eventDdayBadge(data) : null
  const period = isEvent ? formatEventPeriod(data) : ""
  const distance = formatDistanceKm(data.distKm)
  const image = data.image || detail?.image || ""
  const mapCoords = sheetMapCoords(data)
  // TourAPI 상세 소개가 없으면 카탈로그 요약(summary)으로 대체 (표준데이터·두루누비 소스)
  const overview = (detail?.overview || "").trim() || (data.summary || "").trim()
  const externalUrl = data.sourceUrl || detail?.homepage || ""
  const prefill = isEvent ? eventToPrefill(data) : isRoute ? routeToPrefill(data) : placeToPrefill(data)

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

        {/* 걷기길은 시작점 좌표라 동네 맥락이 보이게 한 단계 넓힌다(level 6) */}
        <SheetHero
          key={data.id || data.title}
          image={image}
          coords={mapCoords}
          title={data.title}
          level={isRoute ? 6 : 5}
          badge={badge ? <span className={`xc-card__dday xc-card__dday--${badge.kind}`}>{badge.label}</span> : null}
        />

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
            {isRoute ? <InfoRow label="코스" value={routeMeta} /> : null}
            <InfoRow label="장날" value={data.marketCycle} />
            {/* ② 배우기 — 강좌 기간·접수·기관·일정·수강료 / 도서관 휴관 / 체험마을 구분·시설 */}
            <InfoRow label="기간" value={data.coursePeriod} />
            {data.applyStart || data.applyEnd ? (
              <InfoRow
                label="접수"
                value={`${shortDate(data.applyStart)} ~ ${shortDate(data.applyEnd)}${data.applyClosing ? " (마감 임박)" : data.applyOpen ? " (접수중)" : ""}`}
              />
            ) : null}
            <InfoRow label="기관" value={catalogDetail?.institution} />
            <InfoRow label="대상" value={catalogDetail?.target} />
            {catalogDetail?.capacity != null ? (
              <InfoRow label="정원" value={`${Number(catalogDetail.capacity).toLocaleString()}명`} />
            ) : null}
            <InfoRow label="접수방법" value={catalogDetail?.receptMethod} />
            <InfoRow label="장소" value={!isEvent ? catalogDetail?.place : ""} />
            <InfoRow label="일정" value={[catalogDetail?.day, catalogDetail?.time].filter(Boolean).join(" ")} />
            {catalogDetail?.cost != null ? (
              <InfoRow label="수강료" value={Number(catalogDetail.cost) === 0 ? "무료" : `${Number(catalogDetail.cost).toLocaleString()}원`} />
            ) : null}
            {/* 박물관·미술관 — 관람시간·관람료(어른/청소년/어린이) */}
            <InfoRow label="관람" value={catalogDetail?.hours} />
            {catalogDetail?.adultFee || catalogDetail?.youthFee || catalogDetail?.childFee ? (
              <InfoRow
                label="관람료"
                value={[
                  catalogDetail.adultFee ? `어른 ${catalogDetail.adultFee}` : "",
                  catalogDetail.youthFee ? `청소년 ${catalogDetail.youthFee}` : "",
                  catalogDetail.childFee ? `어린이 ${catalogDetail.childFee}` : "",
                ].filter(Boolean).join(" · ")}
              />
            ) : null}
            <InfoRow label="교통" value={catalogDetail?.traffic} />
            <InfoRow label="휴관" value={catalogDetail?.closeDay} />
            <InfoRow label="체험" value={catalogDetail?.kind} />
            <InfoRow label="시설" value={catalogDetail?.facilities} />
            <InfoRow label="경유" value={catalogDetail?.course} />
            <InfoRow label="관리" value={catalogDetail?.admin} />
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
            {isRoute ? "길 카드로 담기" : "카드로 담기"}
          </button>
        </footer>
      </section>
    </div>
  )
}
