// 서버리스 공용 — 행사 큐레이션 정규화/집계 헬퍼.
// 여러 소스(TourAPI, 문화포털 등)의 원본을 아래 "공통 스키마"로 맞춘 뒤,
// dedupe/활성필터/정렬을 소스와 무관하게 한 곳에서 처리한다.
//
// 공통 스키마(normalized event):
//   { id, source, title, addr, image, lat, lng,
//     startDate(YYYYMMDD), endDate(YYYYMMDD), tel, contentTypeId, sourceUrl }
//
// (`_` 로 시작하는 폴더는 Vercel 라우트가 아니므로 공용 모듈로 안전.)

export function toNumber(value) {
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

export function toYYYYMMDD(date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`
}

// 임의 날짜 문자열("2026-07-01", "20260701", "2026.7.1")을 YYYYMMDD 8자리로.
// 클라이언트(eventDdayBadge/formatEventPeriod)가 /^\d{8}$/ 만 파싱하므로 반드시 통일.
export function normalizeDateStr(value) {
  const digits = String(value || "").replace(/\D/g, "")
  return digits.length >= 8 ? digits.slice(0, 8) : ""
}

export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371
  const toRad = (deg) => deg * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// 진행중이거나 앞으로 시작하는 행사만 true (끝난 행사 제외)
export function isActiveEvent(item, todayStr) {
  if (item.endDate) return item.endDate >= todayStr
  if (item.startDate) return item.startDate >= todayStr
  return false
}

// 정보 충실도 점수 — dedupe 시 더 알찬 레코드를 남기는 기준
export function eventQualityScore(item) {
  return [item.image, item.startDate, item.endDate, item.addr, item.tel].filter(Boolean).length
}

// 정규화된 행사 목록을 제목+주소 기준으로 중복 제거(소스 간 병합).
// 같은 행사가 여러 소스에 있으면 충실도 높은 쪽만 남긴다.
export function dedupeEvents(items) {
  const byKey = new Map()
  for (const item of items) {
    if (!item?.title) continue
    const key = `${item.title.replace(/\s+/g, "").toLowerCase()}|${String(item.addr || "").slice(0, 20)}`
    const prev = byKey.get(key)
    if (!prev || eventQualityScore(item) > eventQualityScore(prev)) {
      byKey.set(key, item)
    }
  }
  return [...byKey.values()]
}

// 위치가 있으면 거리순, 없으면 시작일→제목순
export function sortEvents(items, location = null) {
  return [...items].sort((a, b) => {
    if (location) return (a.distKm ?? Infinity) - (b.distKm ?? Infinity)
    const aStart = a.startDate || "99999999"
    const bStart = b.startDate || "99999999"
    return aStart.localeCompare(bStart) || a.title.localeCompare(b.title)
  })
}
