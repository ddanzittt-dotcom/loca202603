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
    let observer = null
    window.loadKakaoMap((ok) => {
      if (cancelled || !boxRef.current) return
      const kakaoMaps = window.kakao?.maps
      if (!ok || !kakaoMaps || typeof kakaoMaps.StaticMap !== "function") {
        setFailed(true)
        return
      }
      const create = () => {
        const box = boxRef.current
        if (cancelled || !box) return
        try {
          const center = new kakaoMaps.LatLng(lat, lng)
          box.innerHTML = ""
          new kakaoMaps.StaticMap(box, {
            center,
            level,
            marker: { position: center },
          })
        } catch (e) {
          console.warn("정적 지도 생성 실패:", e)
          setFailed(true)
        }
      }
      const box = boxRef.current
      // display:none 등 크기 0 상태에서 생성하면 0×0 이미지(IW=0&IH=0)를 요청한다
      // — 크기가 잡힐 때까지 생성을 미룬다 (ResizeObserver 미지원 구형 브라우저는 지도 생략)
      if (box.offsetWidth > 0 && box.offsetHeight > 0) {
        create()
      } else if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() => {
          const el = boxRef.current
          if (!el || el.offsetWidth < 1 || el.offsetHeight < 1) return
          observer?.disconnect()
          observer = null
          create()
        })
        observer.observe(box)
      }
    })
    return () => {
      cancelled = true
      observer?.disconnect()
    }
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
