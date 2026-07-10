import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { ArrowLeft, Share2 } from "lucide-react"
import { MapErrorBoundary } from "../components/MapErrorBoundary"
import { FeatureEmoji, resolvePlaceMarkerEmoji } from "../components/FeatureEmoji"
import { MapRenderer as NaverMap } from "../components/MapRenderer"
import { hasSupabaseEnv } from "../lib/supabase"
import { logEvent } from "../lib/analytics"
import { getFeatureCenter } from "../lib/appUtils"
import { triggerSelectionFeedback } from "../lib/haptics"
import { saveMap as saveMapRecord } from "../lib/mapService"
import { FeaturePopupCard } from "../components/FeaturePopupCard"
import { useVoicePlayback, makeVoiceScopeKey } from "../hooks/useVoicePlayback"
import { BrandLogo } from "../components/BrandLogo"

// 길 길이 (haversine) — FeaturePopupCard 의 routeLengthKm prop 으로 전달
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

// Pin SVG icon for save button
function PinSvg() {
  return (
    <svg width="12" height="14" viewBox="0 0 10 12" fill="none" aria-hidden="true">
      <path d="M5 0C2.24 0 0 2.24 0 5c0 3.5 5 7 5 7s5-3.5 5-7c0-2.76-2.24-5-5-5zm0 6.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" fill="currentColor"/>
    </svg>
  )
}

// Save button component
function SaveButton({ onClick, loading = false }) {
  return (
    <button className="lw-save-btn" type="button" onClick={onClick} disabled={loading}>
      <PinSvg />
      <span className="lw-save-btn__text">{loading ? "저장 중..." : "내 라이브러리에 저장"}</span>
    </button>
  )
}

// 피처 카드 보조 텍스트: 제작자의 한 줄 메모 우선, 없으면 첫 태그
function getFeatureCardNote(feature) {
  const note = String(feature.note || "").trim()
  if (note) return note
  if (feature.tags?.length) return `#${feature.tags[0]}`
  return ""
}

const FEATURE_TYPE_META = {
  pin: { label: "장소", modifier: "pin" },
  route: { label: "길", modifier: "route" },
  area: { label: "영역", modifier: "area" },
}

function getFeatureTypeMeta(feature) {
  return FEATURE_TYPE_META[feature.type] || FEATURE_TYPE_META.pin
}

export function SharedMapViewer({ map, features, onSaveToApp, onBack, savingToApp = false }) {
  const [selectedId, setSelectedId] = useState(null)
  const [fitTrigger] = useState(1)
  const [focusPoint, setFocusPoint] = useState(null)
  const [sheetExpanded, setSheetExpanded] = useState(false)
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
  const featureViewStart = useRef(null)
  const prevSelectedId = useRef(null)
  const voicePlayback = useVoicePlayback()
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
      showViewerToast("링크가 복사되었어요!")
    } catch {
      prompt("복사하세요", shareUrl)
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
      showViewerToast("링크가 복사되었어요. 카카오톡에 붙여넣어 주세요.")
    } catch {
      prompt("카카오톡에 붙여넣으세요:", shareUrl)
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
    setSheetExpanded(false)
    prevSelectedId.current = featureId
    featureViewStart.current = featureId ? Date.now() : null

    if (hasSupabaseEnv && map.id && featureId) {
      logEvent("feature_click", { map_id: map.id, feature_id: featureId })
      logEvent("feature_view", { map_id: map.id, feature_id: featureId })
    }
  }, [map.id])

  const handleSpotTap = (feature) => {
    handleFeatureSelect(feature.id)
    setFocusPoint(getFeatureCenter(feature))
  }

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

  const orgName = map.title
  // unified shared viewer shell
  return (
    <div className="lw-viewer lw-viewer--v2">
      {/* Hero card header */}
      <div className="lw-hero">
        <div className="lw-hero__blob" />
        <div className="lw-hero__row1">
          {onBack ? (
            <button type="button" onClick={onBack} className="lw-back-btn" aria-label="뒤로">
              <ArrowLeft size={20} />
            </button>
          ) : null}
          <div className="lw-ci-logo">
            {orgName.slice(0, 2)}
          </div>
          <span className="lw-ci-kicker">공유된 지도</span>
          <div className="lw-ci-actions">
            <button
              className="lw-noti-btn"
              type="button"
              aria-label="공유"
              onClick={() => setShareOpen((v) => !v)}
            >
              <Share2 size={14} />
            </button>
          </div>

          {/* 공유 드롭다운 */}
          {shareOpen && (
            <>
              <div className="lw-share-overlay" onClick={() => setShareOpen(false)} />
              <div className="lw-share-dropdown">
                <button type="button" className="lw-share-item" onClick={handleCopyLink}>
                  <span className="lw-share-icon">🔗</span>
                  <span>링크 복사</span>
                </button>
                <button type="button" className="lw-share-item lw-share-item--kakao" onClick={handleKakaoShare}>
                  <span className="lw-share-icon">💬</span>
                  <span>카카오톡</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Hero head — 지도가 자기소개를 하는 영역 */}
        <div className="lw-hero__head">
          <h1 className="lw-hero__big-title">{map.title}</h1>
          {map.description ? <p className="lw-hero__big-desc">{map.description}</p> : null}
          <div className="lw-hero__counts">
            {featureCounts.pin > 0 ? (
              <span className="lw-count-chip lw-count-chip--pin"><i />장소 {featureCounts.pin}</span>
            ) : null}
            {featureCounts.route > 0 ? (
              <span className="lw-count-chip lw-count-chip--route"><i />길 {featureCounts.route}</span>
            ) : null}
            {featureCounts.area > 0 ? (
              <span className="lw-count-chip lw-count-chip--area"><i />영역 {featureCounts.area}</span>
            ) : null}
          </div>
        </div>

        {/* Inner content area */}
        <div className="lw-ci-inner">
          {/* Map area */}
          <div className={`lw-event-map${introPlaying ? " lw-map-intro" : ""}`}>
            <MapErrorBoundary>
              <NaverMap
                features={features}
                selectedFeatureId={selectedId}
                draftPoints={[]}
                draftMode="browse"
                focusPoint={focusPoint}
                fitTrigger={fitTrigger}
                onFeatureTap={handleFeatureSelect}
                showLabels
              />
            </MapErrorBoundary>

            {/* Pin tap card — FeaturePopupCard (subscriber view) */}
            {selectedFeature ? (
              <div className="lw-spot-detail-wrap">
                <FeaturePopupCard
                  feature={selectedFeature}
                  mapMode="personal"
                  isAuthor={false}
                  currentUserId={null}
                  routeLengthKm={
                    selectedFeature.type === "route"
                      ? computeRouteLengthKm(selectedFeature.points)
                      : null
                  }
                  onClose={() => { voicePlayback.stop(); setSelectedId(null) }}
                  currentPlayingVoiceId={voicePlayback.playingId}
                  onVoiceClick={(voice, index) => {
                    const key = makeVoiceScopeKey(selectedFeature.id, voice, index)
                    voicePlayback.toggle(voice, key)
                  }}
                />
              </div>
            ) : null}

            {/* Bottom sheet */}
            {!selectedFeature ? (
              <div className={`lw-sheet${sheetExpanded ? " is-expanded" : ""}`}>
                <div className="lw-sheet__handle" onClick={() => setSheetExpanded((v) => !v)} />
                {!sheetExpanded ? (
                  <div className="lw-sheet__scroll">
                    {features.map((f) => {
                      const meta = getFeatureTypeMeta(f)
                      const note = getFeatureCardNote(f)
                      return (
                        <button key={f.id} className="lw-sheet__card" type="button" onClick={() => handleSpotTap(f)}>
                          <span className={`lw-sheet__card-emoji lw-sheet__card-emoji--${meta.modifier}`} aria-hidden="true">
                            <FeatureEmoji emoji={resolvePlaceMarkerEmoji(f)} size={18} />
                          </span>
                          <span className="lw-sheet__card-main">
                            <span className="lw-sheet__card-name">{f.title}</span>
                            <span className="lw-sheet__card-sub">{note || meta.label}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <>
                    <div className="lw-sheet__header">기록 목록 ({features.length}곳)</div>
                    <div className="lw-sheet__list">
                      {features.map((f) => {
                        const meta = getFeatureTypeMeta(f)
                        const note = getFeatureCardNote(f)
                        return (
                          <button
                            key={f.id}
                            className="lw-sheet__row"
                            type="button"
                            onClick={() => handleSpotTap(f)}
                          >
                            <span className={`lw-sheet__row-icon lw-sheet__card-emoji--${meta.modifier}`} aria-hidden="true">
                              <FeatureEmoji emoji={resolvePlaceMarkerEmoji(f)} size={20} />
                            </span>
                            <span className="lw-sheet__row-info">
                              <span className="lw-sheet__row-name">{f.title}</span>
                              <span className="lw-sheet__row-sub">{note || meta.label}</span>
                            </span>
                            <span className={`lw-sheet__row-badge lw-sheet__row-badge--${meta.modifier}`}>{meta.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {/* Save CTA — 뷰어의 유일한 강조 버튼 */}
        {onSaveToApp ? (
          <div className="lw-cta-row">
            <SaveButton onClick={handleSave} loading={savingToApp} />
          </div>
        ) : null}

        {/* Bottom frame */}
        <div className="lw-ci-bottom">
          <span className="lw-ci-powered">Powered by</span>
          <BrandLogo as="span" className="lw-ci-powered-logo" dotClassName="lw-ci-powered-logo__dot" />
        </div>
      </div>

      {toastMsg ? <div className="lw-toast">{toastMsg}</div> : null}
    </div>
  )
}
