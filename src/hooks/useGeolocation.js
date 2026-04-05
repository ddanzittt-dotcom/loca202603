import { useCallback, useEffect, useRef, useState } from "react"
import { Geolocation } from "@capacitor/geolocation"

export function useGeolocation({ setFocusPoint, showToast }) {
  const [myLocation, setMyLocation] = useState(null)
  const watchIdRef = useRef(null)
  const prevLocationRef = useRef(null)

  const calcBearing = useCallback((from, to) => {
    const toRad = (d) => (d * Math.PI) / 180
    const toDeg = (r) => (r * 180) / Math.PI
    const dLng = toRad(to.lng - from.lng)
    const y = Math.sin(dLng) * Math.cos(toRad(to.lat))
    const x = Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
      Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(dLng)
    return (toDeg(Math.atan2(y, x)) + 360) % 360
  }, [])

  const handlePositionUpdate = useCallback((position) => {
    const coords = { lat: position.coords.latitude, lng: position.coords.longitude }
    const prev = prevLocationRef.current
    let heading = myLocation?.heading ?? 0
    if (position.coords.heading != null && !isNaN(position.coords.heading)) {
      heading = position.coords.heading
    } else if (prev) {
      const dist = Math.abs(coords.lat - prev.lat) + Math.abs(coords.lng - prev.lng)
      if (dist > 0.00005) {
        heading = calcBearing(prev, coords)
      }
    }
    prevLocationRef.current = coords
    setMyLocation({ ...coords, heading })
  }, [calcBearing, myLocation?.heading])

  const locateMe = async () => {
    if (watchIdRef.current != null && myLocation) {
      setFocusPoint({ lat: myLocation.lat, lng: myLocation.lng, zoom: 16 })
      showToast("현재 위치로 이동했어요.")
      return
    }
    try {
      let firstCoords
      try {
        const permStatus = await Geolocation.checkPermissions()
        if (permStatus.location === "denied") {
          const req = await Geolocation.requestPermissions()
          if (req.location === "denied") throw new Error("denied")
        }
        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000,
        })
        firstCoords = { lat: position.coords.latitude, lng: position.coords.longitude }
      } catch {
        if (!navigator.geolocation) throw new Error("no-geo")
        const position = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true, timeout: 10000, maximumAge: 30000,
          })
        )
        firstCoords = { lat: position.coords.latitude, lng: position.coords.longitude }
      }
      prevLocationRef.current = firstCoords
      setMyLocation({ ...firstCoords, heading: 0 })
      setFocusPoint({ ...firstCoords, zoom: 16 })
      showToast("현재 위치로 이동했어요.")

      if (navigator.geolocation && watchIdRef.current == null) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          handlePositionUpdate,
          () => {},
          { enableHighAccuracy: true, maximumAge: 5000 },
        )
      }
    } catch {
      showToast("위치를 가져올 수 없어요. 권한을 확인해주세요.")
    }
  }

  // 언마운트 시 watch 정리
  useEffect(() => () => {
    if (watchIdRef.current != null) {
      navigator.geolocation?.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [])

  return { myLocation, locateMe }
}
