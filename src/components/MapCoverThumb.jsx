import { useState } from "react"

/**
 * MapCoverThumb — 지도 카드 표지.
 * 실제 지도 썸네일(/api/map-thumb)을 깔고, 로딩 전·실패 시에는 미니맵 SVG를 보여준다.
 * (비공개 지도, 로컬 지도, 키 미설정 환경은 자동으로 SVG 폴백)
 */
export function MapCoverThumb({ mapId, version, fallbackSvg, className = "", alt = "" }) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const canTryThumb = Boolean(mapId) && /^[0-9a-fA-F-]{16,64}$/u.test(String(mapId))
  const src = canTryThumb
    ? `/api/map-thumb/${mapId}${version ? `?v=${encodeURIComponent(version)}` : ""}`
    : null

  return (
    <span className={`map-cover-thumb ${className}`.trim()}>
      <span
        className="map-cover-thumb__svg"
        dangerouslySetInnerHTML={{ __html: fallbackSvg || "" }}
        aria-hidden="true"
      />
      {src && !failed ? (
        <img
          className={`map-cover-thumb__img${loaded ? " is-loaded" : ""}`}
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
    </span>
  )
}
