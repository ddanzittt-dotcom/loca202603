import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { ArrowLeft, MapPin, Minus, Navigation, Plus, Route, Shapes, Share2, X } from "lucide-react"
import { MapErrorBoundary } from "../components/MapErrorBoundary"
import { FeatureEmoji, resolvePlaceMarkerEmoji } from "../components/FeatureEmoji"
import { MapRenderer } from "../components/MapRenderer"
import { hasSupabaseEnv } from "../lib/supabase"
import { logEvent } from "../lib/analytics"
import { getFeatureCenter } from "../lib/appUtils"
import { triggerSelectionFeedback } from "../lib/haptics"
import { saveMap as saveMapRecord } from "../lib/mapService"
import { BrandLogo } from "../components/BrandLogo"
import "../styles/shared-viewer-v3.css"

// ============================================================
// 공유 뷰어 v3 — Focused Map (2026-07)
// 풀블리드 지도 + 플로팅 아일랜드:
//   데스크톱: 좌 지도 카드(제목·설명·목록) + 우상 저장 CTA·공유 + 우상 요약 정보창
//   모바일:   상단 타이틀 필 + 하단 스냅 시트(peek 요약 / 목록 / 피처 요약)
// 정보창은 요약 전용 — 기록(개인 메모·사진)은 공유 지도에 노출되지 않는다.
// 선택 시 오프셋 패닝으로 정보창·시트가 피처를 가리지 않게 한다.
// ============================================================

// 길 길이 (haversine) — 요약 정보의 거리 표기용
function computeRouteLengthKm(points) {
  if (!Array.isArray(points) || points.length < 2) return null
  const R = 6371
  const toRad = (deg) => (deg * Math.PI) / 180
  let km = 0
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]
    const b = points[i]
    const lat1 = Number(a?.lat ?? a?.[1] ?? a?.y)
    const lng1 = Number(a?.lng ?? a?.[0] ?? a?.x)
    const lat2 = Number(b?.lat ?? b?.[1] ?? b?.y)
    const lng2 = Number(b?.lng ?? b?.[0] ?? b?.x)
    if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) continue
    const dLat = toRad(lat2 - lat1)
    const dLng = toRad(lng2 - lng1)
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
    km += 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
  }
  return km > 0 ? km : null
}

function formatKm(km) {
  if (!Number.isFinite(km) || km <= 0) return ""
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`
}

const TYPE_META = {
  pin: { label: "장소", Icon: MapPin, cls: "pin" },
  route: { label: "길", Icon: Route, cls: "route" },
  area: { label: "영역", Icon: Shapes, cls: "area" },
}

const getTypeMeta = (feature) => TYPE_META[feature?.type] || TYPE_META.pin

const isDesktopViewport = () => (
  typeof window !== "undefined" && window.matchMedia("(min-width: 960px)").matches
)

export function SharedMapViewer({ map, features, onSaveToApp, onBack, savingToApp = false }) {
  const [selectedId, setSelectedId] = useState(null)
  const [fitTrigger] = useState(1)
  const [focusPoint, setFocusPoint] = useState(null)
  const [listExpanded, setListExpanded] = useState(false)
  const [myLocation, setMyLocation] = useState(null)
  const mapApiRef = useRef(null)
  // 진입 연출: 첫 2초 동안만 핀 드롭/라벨 페이드인 (이후 재렌더에는 미적용)
  const [introPlaying, setIntroPlaying] = useState(true)
  useEffect(() => {
    const timer = window.setTimeout(() => setIntroPlaying(false), 2000)
    return () => window.clearTimeout(timer)
  }, [])

  const featureCounts = useMemo(() => {
    const counts = { pin: 0, route: 0, area: 0 }
    features.forEach((f) => {
      if (counts[f.type] !== undefined) counts[f.type] += 1
    })
    return counts
  }, [features])

  const routeKmById = useMemo(() => {
    const table = {}
    features.forEach((f) => {
      if (f.type === "route") table[f.id] = computeRouteLengthKm(f.points)
    })
    return table
  }, [features])

  const featureViewStart = useRef(null)
  const prevSelectedId = useRef(null)
  const [toastMsg, setToastMsg] = useState("")

  const showViewerToast = useCallback((msg) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(""), 2500)
  }, [])

  // 공유
  const [shareOpen, setShareOpen] = useState(false)
  const shareUrl = useMemo(() => {
    if (map.slug) return `${window.location.origin}/s/${map.slug}`
    return window.location.href
  }, [map.slug])

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      logEvent("share_click", { map_id: map.id, meta: { method: "link" } })
      showViewerToast("링크를 복사했어요!")
    } catch {
      prompt("주소를 복사해 주세요", shareUrl)
    }
    setShareOpen(false)
  }, [shareUrl, map.id, showViewerToast])

  const handleKakaoShare = useCallback(async () => {
    logEvent("share_click", { map_id: map.id, meta: { method: "kakao" } })
    const kakaoUrl = shareUrl + (shareUrl.includes("?") ? "&" : "?") + "utm_source=kakao"

    // 카카오 SDK 로드
    const sdkReady = await new Promise((resolve) => {
      if (window.Kakao?.Share) {
        if (!window.Kakao.isInitialized()) {
          const key = import.meta.env.VITE_KAKAO_JS_KEY
          if (key) window.Kakao.init(key)
        }
        resolve(true)
        return
      }
      const key = import.meta.env.VITE_KAKAO_JS_KEY
      if (!key) { resolve(false); return }
      const s = document.createElement("script")
      s.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js"
      s.onload = () => {
        if (window.Kakao && !window.Kakao.isInitialized()) window.Kakao.init(key)
        resolve(!!window.Kakao?.Share)
      }
      s.onerror = () => resolve(false)
      document.head.appendChild(s)
    })

    if (sdkReady && window.Kakao?.Share) {
      try {
        const ogImageUrl = `${window.location.origin}/api/og-image/${encodeURIComponent(map.slug || "loca")}`
        window.Kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title: map.title || "LOCA 지도",
            description: map.description || `${map.title || "LOCA"} 지도를 열어보세요`,
            imageUrl: ogImageUrl,
            imageWidth: 800,
            imageHeight: 400,
            link: { mobileWebUrl: kakaoUrl, webUrl: kakaoUrl },
          },
          buttons: [{ title: "지도 열기", link: { mobileWebUrl: kakaoUrl, webUrl: kakaoUrl } }],
        })
        setShareOpen(false)
        return
      } catch { /* fallback */ }
    }
    // 카카오 SDK가 없으면 클립보드 복사로 대체
    try {
      await navigator.clipboard.writeText(shareUrl)
      showViewerToast("링크를 복사했어요. 카카오톡에 붙여넣어 주세요.")
    } catch {
      prompt("카카오톡에 붙여넣어 주세요:", shareUrl)
    }
    setShareOpen(false)
  }, [shareUrl, map, showViewerToast])

  const selectedFeature = selectedId ? features.find((f) => f.id === selectedId) : null

  // 장소 선택 이벤트 로깅과 장소별 체류 시간 추적
  const handleFeatureSelect = useCallback((featureId) => {
    triggerSelectionFeedback()
    // 이전 feature 체류 시간 기록
    if (prevSelectedId.current && featureViewStart.current && hasSupabaseEnv && map.id) {
      const duration = Date.now() - featureViewStart.current
      if (duration > 500) {
        logEvent("feature_view_end", { map_id: map.id, feature_id: prevSelectedId.current, meta: { duration_ms: duration } })
      }
    }

    setSelectedId(featureId)
    setListExpanded(false)
    prevSelectedId.current = featureId
    featureViewStart.current = featureId ? Date.now() : null

    if (hasSupabaseEnv && map.id && featureId) {
      logEvent("feature_click", { map_id: map.id, feature_id: featureId })
      logEvent("feature_view", { map_id: map.id, feature_id: featureId })
    }
  }, [map.id])

  // 선택 + 오프셋 패닝 — 정보창(데스크톱 우측 카드/모바일 하단 시트)이
  // 가리지 않는 영역의 중심으로 피처를 이동시킨다.
  const selectAndFocus = useCallback((feature) => {
    if (!feature) return
    handleFeatureSelect(feature.id)
    const center = getFeatureCenter(feature)
    if (!center) return
    const desktop = isDesktopViewport()
    setFocusPoint({
      ...center,
      offsetX: desktop ? 48 : 0,
      offsetY: desktop ? 0 : Math.round(window.innerHeight * 0.19),
    })
  }, [handleFeatureSelect])

  const handleMapFeatureTap = useCallback((featureId) => {
    const feature = features.find((f) => f.id === featureId)
    if (feature) selectAndFocus(feature)
  }, [features, selectAndFocus])

  const clearSelection = useCallback(() => {
    handleFeatureSelect(null)
  }, [handleFeatureSelect])

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) {
      showViewerToast("이 브라우저에서는 위치 기능을 사용할 수 없어요.")
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude, zoom: 15 }
        setMyLocation({ lat: point.lat, lng: point.lng })
        setFocusPoint(point)
      },
      () => showViewerToast("현재 위치를 가져오지 못했어요."),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }, [showViewerToast])

  const handleSave = useCallback(async () => {
    if (savingToApp || !onSaveToApp) return
    if (hasSupabaseEnv && map.id) {
      logEvent("map_save", { map_id: map.id })
      try {
        await saveMapRecord(map.id, { source: "viewer_save" })
      } catch {
        // Do not block save UX when save conversion sync fails.
      }
    }
    onSaveToApp()
  }, [map.id, onSaveToApp, savingToApp])

  const saveLabel = savingToApp ? "저장 중..." : "내 라이브러리에 저장"
  const selectedMeta = selectedFeature ? getTypeMeta(selectedFeature) : null
  const selectedKm = selectedFeature?.type === "route" ? routeKmById[selectedFeature.id] : null
  const selectedTags = Array.isArray(selectedFeature?.tags) ? selectedFeature.tags : []
  const selectedNote = String(selectedFeature?.note || "").trim()

  // 목록 행 (좌 카드 · 모바일 확장 목록 공용)
  const renderFeatureRow = (feature) => {
    const meta = getTypeMeta(feature)
    const km = feature.type === "route" ? formatKm(routeKmById[feature.id]) : ""
    const sub = km ? `${meta.label} · ${km}` : meta.label
    return (
      <button
        key={feature.id}
        type="button"
        className={`sv-frow${feature.id === selectedId ? " is-active" : ""}`}
        onClick={() => selectAndFocus(feature)}
      >
        <span className={`sv-frow__icon sv-tile--${meta.cls}`} aria-hidden="true">
          <FeatureEmoji emoji={resolvePlaceMarkerEmoji(feature)} size={16} />
        </span>
        <span className="sv-frow__body">
          <span className="sv-frow__name">{feature.title || meta.label}</span>
          <span className="sv-frow__sub">{sub}</span>
        </span>
      </button>
    )
  }

  // 요약 정보 본문 (데스크톱 정보창 · 모바일 시트 공용) — 기록 미노출, 상단 요약만
  const renderSummaryBody = () => (
    <>
      {(selectedKm || selectedTags.length > 0) ? (
        <div className="sv-info__chips">
          {selectedKm ? <span className="sv-chip sv-chip--meta">{formatKm(selectedKm)}</span> : null}
          {selectedTags.slice(0, 4).map((tag) => (
            <span key={tag} className="sv-chip sv-chip--tag">#{tag}</span>
          ))}
        </div>
      ) : null}
      {selectedNote ? <p className="sv-info__note">{selectedNote}</p> : null}
    </>
  )

  return (
    <div className="sv-viewer">
      {/* 풀블리드 지도 */}
      <div className={`sv-map${introPlaying ? " sv-map-intro" : ""}`}>
        <MapErrorBoundary>
          <MapRenderer
            ref={mapApiRef}
            features={features}
            selectedFeatureId={selectedId}
            draftPoints={[]}
            draftMode="browse"
            focusPoint={focusPoint}
            fitTrigger={fitTrigger}
            onFeatureTap={handleMapFeatureTap}
            showLabels
            myLocation={myLocation}
          />
        </MapErrorBoundary>
      </div>

      {/* 상단 아일랜드 — 뒤로 · 브랜드/타이틀 필 · (데스크톱) 저장 CTA · 공유 */}
      <div className="sv-top">
        {onBack ? (
          <button type="button" className="sv-round" onClick={onBack} aria-label="뒤로">
            <ArrowLeft size={16} />
          </button>
        ) : null}

        {/* 데스크톱: LOCA 브랜드 필 */}
        <div className="sv-brand" aria-label="LOCA 공유된 지도">
          <BrandLogo as="span" className="sv-brand__logo" dotClassName="sv-brand__logo-dot" />
          <span className="sv-brand__kicker">공유된 지도</span>
        </div>

        {/* 모바일: 타이틀 필 */}
        <div className="sv-title-pill">
          <b>{map.title}</b>
          <span>공유된 지도</span>
        </div>

        <div className="sv-top__spacer" />

        {onSaveToApp ? (
          <button type="button" className="sv-cta sv-cta--top" onClick={handleSave} disabled={savingToApp}>
            📍 {saveLabel}
          </button>
        ) : null}

        <div className="sv-share-anchor">
          <button
            type="button"
            className="sv-round"
            aria-label="공유"
            onClick={() => setShareOpen((v) => !v)}
          >
            <Share2 size={15} />
          </button>
          {shareOpen ? (
            <>
              <button type="button" className="sv-share-overlay" aria-label="공유 닫기" onClick={() => setShareOpen(false)} />
              <div className="sv-share-drop">
                <button type="button" className="sv-share-item" onClick={handleCopyLink}>
                  <span aria-hidden="true">🔗</span> 링크 복사
                </button>
                <button type="button" className="sv-share-item" onClick={handleKakaoShare}>
                  <span aria-hidden="true">💬</span> 카카오톡
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* 데스크톱 — 좌측 지도 카드: 제목·설명·카운터 + 목록 */}
      <aside className="sv-card" aria-label="지도 정보">
        <div className="sv-card__head">
          <span className="sv-badge">공유된 지도</span>
          <h1 className="sv-card__title">{map.title}</h1>
          {map.description ? <p className="sv-card__desc">{map.description}</p> : null}
          <div className="sv-counts">
            {featureCounts.pin > 0 ? <span className="sv-chip sv-chip--pin"><i />장소 {featureCounts.pin}</span> : null}
            {featureCounts.route > 0 ? <span className="sv-chip sv-chip--route"><i />길 {featureCounts.route}</span> : null}
            {featureCounts.area > 0 ? <span className="sv-chip sv-chip--area"><i />영역 {featureCounts.area}</span> : null}
          </div>
        </div>
        <div className="sv-card__list">
          {features.length > 0 ? (
            <>
              <span className="sv-list-label">이 지도의 기록</span>
              {features.map(renderFeatureRow)}
            </>
          ) : (
            <p className="sv-empty">아직 담긴 기록이 없어요.</p>
          )}
        </div>
      </aside>

      {/* 데스크톱 — 우측 요약 정보창 (기록 미노출) */}
      {selectedFeature && selectedMeta ? (
        <aside className="sv-info" aria-label={`${selectedFeature.title || selectedMeta.label} 요약`}>
          <div className="sv-info__head">
            <span className={`sv-info__icon sv-tile--${selectedMeta.cls}`} aria-hidden="true">
              <selectedMeta.Icon size={17} />
            </span>
            <span className="sv-info__titles">
              <em className={`sv-kind sv-kind--${selectedMeta.cls}`}>{selectedMeta.label}</em>
              <b>{selectedFeature.title || selectedMeta.label}</b>
            </span>
            <button type="button" className="sv-info__close" onClick={clearSelection} aria-label="닫기">
              <X size={14} />
            </button>
          </div>
          {renderSummaryBody()}
        </aside>
      ) : null}

      {/* 데스크톱 — 우하단 보기 컨트롤 */}
      <div className="sv-ctl">
        <div className="sv-ctl__group">
          <button type="button" onClick={() => mapApiRef.current?.zoomIn?.()} aria-label="확대"><Plus size={16} /></button>
          <button type="button" onClick={() => mapApiRef.current?.zoomOut?.()} aria-label="축소"><Minus size={16} /></button>
        </div>
        <div className="sv-ctl__group">
          <button type="button" onClick={handleLocate} aria-label="내 위치"><Navigation size={15} /></button>
        </div>
      </div>

      {/* 모바일 — 내 위치 (우중단, 시트 회피) */}
      <button type="button" className="sv-round sv-locate-m" onClick={handleLocate} aria-label="내 위치">
        <Navigation size={15} />
      </button>

      {/* 모바일 — 하단 시트: peek 요약 / 목록 전체 / 피처 요약 */}
      <div className={`sv-sheet${selectedFeature ? " is-detail" : listExpanded ? " is-expanded" : ""}`}>
        <button
          type="button"
          className="sv-sheet__handle"
          aria-label={listExpanded ? "목록 접기" : "목록 전체 보기"}
          onClick={() => {
            if (selectedFeature) clearSelection()
            else setListExpanded((v) => !v)
          }}
        />
        {selectedFeature && selectedMeta ? (
          <>
            <div className="sv-sheet__feature-head">
              <span className={`sv-info__icon sv-tile--${selectedMeta.cls}`} aria-hidden="true">
                <selectedMeta.Icon size={17} />
              </span>
              <span className="sv-info__titles">
                <em className={`sv-kind sv-kind--${selectedMeta.cls}`}>{selectedMeta.label}</em>
                <b>{selectedFeature.title || selectedMeta.label}</b>
              </span>
              <button type="button" className="sv-info__close" onClick={clearSelection} aria-label="닫기">
                <X size={14} />
              </button>
            </div>
            {renderSummaryBody()}
          </>
        ) : listExpanded ? (
          <div className="sv-sheet__list">
            <span className="sv-list-label">기록 목록 ({features.length})</span>
            {features.map(renderFeatureRow)}
          </div>
        ) : (
          <>
            <div className="sv-sheet__head">
              <b>{map.title}</b>
              {map.description ? <span>{map.description}</span> : null}
            </div>
            {features.length > 0 ? (
              <div className="sv-sheet__chips">
                {features.map((feature) => {
                  const meta = getTypeMeta(feature)
                  return (
                    <button
                      key={feature.id}
                      type="button"
                      className="sv-fchip"
                      onClick={() => selectAndFocus(feature)}
                    >
                      <i className={`sv-dot--${meta.cls}`} aria-hidden="true" />
                      {feature.title || meta.label}
                    </button>
                  )
                })}
              </div>
            ) : null}
          </>
        )}
        {onSaveToApp ? (
          <button type="button" className="sv-cta sv-cta--sheet" onClick={handleSave} disabled={savingToApp}>
            📍 {saveLabel}
          </button>
        ) : null}
      </div>

      {toastMsg ? <div className="sv-toast">{toastMsg}</div> : null}
    </div>
  )
}
