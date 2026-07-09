import { forwardRef, useCallback, useMemo, useState } from "react"
import { KoreaMap } from "./koreaMap"
import { GoogleMap } from "./GoogleMap"
import { detectRegion, regionOf } from "./mapRegion"

export const MapRenderer = forwardRef(function MapRenderer(props, ref) {
  const { features, focusPoint, myLocation, onViewportChange, fitTrigger } = props

  // 초기 렌더러: 좌표 기반 (focusPoint → myLocation → features)
  const baseRegion = useMemo(
    () => detectRegion(features, focusPoint, myLocation),
    [features, focusPoint, myLocation],
  )

  // 사용자가 지도를 드래그해 국경을 넘으면 렌더러를 전환한다.
  // panRegion 이 있으면 baseRegion 보다 우선. handoffFocus 로 전환 후 위치를 유지.
  const [panRegion, setPanRegion] = useState(null)
  const [handoffFocus, setHandoffFocus] = useState(null)

  // 외부에서 명시적으로 지도를 이동(focusPoint 변경/fit)하면 팬 오버라이드를 해제해
  // baseRegion(부모 의도)이 다시 우선하도록 한다.
  // (React 공식 "렌더 중 이전 props 비교" 패턴 — effect 없이 즉시 반영)
  const focusKey = `${focusPoint?.lat ?? ""}|${focusPoint?.lng ?? ""}|${fitTrigger ?? ""}`
  const [prevFocusKey, setPrevFocusKey] = useState(focusKey)
  let effectivePanRegion = panRegion
  let effectiveHandoff = handoffFocus
  if (prevFocusKey !== focusKey) {
    setPrevFocusKey(focusKey)
    setPanRegion(null)
    setHandoffFocus(null)
    effectivePanRegion = null
    effectiveHandoff = null
  }

  const region = effectivePanRegion || baseRegion

  const handleViewportChange = useCallback((info) => {
    const lat = Number(info?.center?.lat)
    const lng = Number(info?.center?.lng)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const nextRegion = regionOf(lat, lng)
      const currentRegion = effectivePanRegion || baseRegion
      if (nextRegion !== currentRegion) {
        // 국경을 넘었다 → 렌더러 전환 + 넘은 지점을 새 지도의 중심으로 넘겨준다.
        setHandoffFocus({ lat, lng, zoom: info?.zoom })
        setPanRegion(nextRegion)
      }
    }
    if (typeof onViewportChange === "function") onViewportChange(info)
  }, [onViewportChange, baseRegion, effectivePanRegion])

  const childProps = {
    ...props,
    onViewportChange: handleViewportChange,
    focusPoint: effectiveHandoff || focusPoint,
  }

  if (region === "global") {
    return <GoogleMap ref={ref} {...childProps} />
  }
  return <KoreaMap ref={ref} {...childProps} />
})
