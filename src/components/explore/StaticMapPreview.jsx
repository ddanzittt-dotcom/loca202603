import { useEffect, useRef, useState } from "react"
import { MapPin } from "lucide-react"

// 탐색 상세 시트 히어로용 정적 지도 (카카오 StaticMap — 이미지 조합이라 시트 스크롤과 충돌 없음).
// StaticMap 은 relayout 이 없어 컨테이너 크기가 확정된(보이는) 상태에서 생성해야 한다.
export function StaticMapPreview({ lat, lng, title, level = 5 }) {
  const boxRef = useRef(null)
  // 로더 부재(스크립트 미주입)는 마운트 시점에 확정 — effect 내 동기 setState 회피
  const [failed, setFailed] = useState(() => typeof window.loadKakaoMap !== "function")

  useEffect(() => {
    if (typeof window.loadKakaoMap !== "function") return undefined
    let cancelled = false
    window.loadKakaoMap((ok) => {
      if (cancelled || !boxRef.current) return
      const kakaoMaps = window.kakao?.maps
      if (!ok || !kakaoMaps || typeof kakaoMaps.StaticMap !== "function") {
        setFailed(true)
        return
      }
      try {
        const center = new kakaoMaps.LatLng(lat, lng)
        boxRef.current.innerHTML = ""
        new kakaoMaps.StaticMap(boxRef.current, {
          center,
          level,
          marker: { position: center },
        })
      } catch (e) {
        console.warn("정적 지도 생성 실패:", e)
        setFailed(true)
      }
    })
    return () => { cancelled = true }
  }, [lat, lng, level])

  if (failed) {
    return (
      <div className="xdt-map xdt-map--error">
        <MapPin size={16} strokeWidth={2.4} aria-hidden="true" />
        <span>지도를 불러오지 못했어요</span>
      </div>
    )
  }

  return (
    <div className="xdt-map">
      <div ref={boxRef} className="xdt-map__canvas" role="img" aria-label={`${title || "선택한 장소"} 위치 지도`} />
      <a
        className="xdt-map__open"
        href={`https://map.kakao.com/link/map/${encodeURIComponent(title || "위치")},${lat},${lng}`}
        target="_blank"
        rel="noreferrer noopener"
      >
        크게 보기
      </a>
    </div>
  )
}
