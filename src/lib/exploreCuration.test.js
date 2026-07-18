import { describe, expect, it } from "vitest"
import {
  curationSourceLabel,
  dedupeWalkItems,
  eventDdayBadge,
  eventTimeKey,
  formatObservedAgo,
  formatRouteMeta,
  interleaveByKind,
  routeToPrefill,
  wildlifeSortKey,
} from "./exploreCuration"

// 오늘 기준 상대 날짜 (탐색 정렬/배지는 전부 오늘 기준 판정)
function ymd(offsetDays) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`
}

function iso(offsetDays) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

describe("eventDdayBadge", () => {
  it("종료 7일 이내 진행중 → 마감 임박", () => {
    expect(eventDdayBadge({ startDate: ymd(-10), endDate: ymd(3) }))
      .toEqual({ kind: "closing", label: "마감 임박" })
  })

  it("종료가 여유로운 진행중 → 진행중", () => {
    expect(eventDdayBadge({ startDate: ymd(-10), endDate: ymd(30) }).kind).toBe("ongoing")
  })

  it("시작 전 → D-N", () => {
    expect(eventDdayBadge({ startDate: ymd(5), endDate: ymd(9) }))
      .toEqual({ kind: "upcoming", label: "D-5" })
  })

  it("종료일 미상 + 시작 지남 → 진행중", () => {
    expect(eventDdayBadge({ startDate: ymd(-3), endDate: "" }).kind).toBe("ongoing")
  })

  it("이미 끝난 행사 → null", () => {
    expect(eventDdayBadge({ startDate: ymd(-9), endDate: ymd(-1) })).toBeNull()
  })
})

describe("eventTimeKey (① 시간순 — 마감 임박 먼저)", () => {
  it("마감 임박이 여유 진행중보다 앞", () => {
    const closing = { startDate: ymd(-10), endDate: ymd(2) }
    const ongoing = { startDate: ymd(-10), endDate: ymd(40) }
    expect(eventTimeKey(closing)).toBeLessThan(eventTimeKey(ongoing))
  })

  it("곧 시작이 한참 남은 진행중보다 앞", () => {
    const startingSoon = { startDate: ymd(3), endDate: ymd(10) }
    const longRunning = { startDate: ymd(-10), endDate: ymd(60) }
    expect(eventTimeKey(startingSoon)).toBeLessThan(eventTimeKey(longRunning))
  })

  it("종료일 미상 진행중은 날짜 있는 항목 뒤, 날짜 전무는 맨 뒤", () => {
    const dated = { startDate: ymd(-1), endDate: ymd(20) }
    const openEnded = { startDate: ymd(-1), endDate: "" }
    const unknown = { startDate: "", endDate: "" }
    expect(eventTimeKey(dated)).toBeLessThan(eventTimeKey(openEnded))
    expect(eventTimeKey(unknown)).toBe(Infinity)
  })
})

describe("wildlifeSortKey (④ 2단계 — 관측 6개월 이내는 거리순, 그 이후는 최신순)", () => {
  it("최근 그룹(6개월 이내)끼리는 신선도 무관 거리순", () => {
    const nearOlder = { distKm: 1, observedOn: iso(-170) }
    const farToday = { distKm: 10, observedOn: iso(0) }
    expect(wildlifeSortKey(nearOlder)).toBeLessThan(wildlifeSortKey(farToday))
  })

  it("6개월 넘은 관측은 아무리 가까워도 최근 그룹 뒤", () => {
    const nearOld = { distKm: 1, observedOn: iso(-300) }
    const farRecent = { distKm: 30, observedOn: iso(-10) }
    expect(wildlifeSortKey(farRecent)).toBeLessThan(wildlifeSortKey(nearOld))
  })

  it("오래된 그룹끼리는 거리 무관 최신순, 날짜 미상은 맨 뒤", () => {
    const old300 = { distKm: 20, observedOn: iso(-300) }
    const old400 = { distKm: 1, observedOn: iso(-400) }
    const unknown = { distKm: 1, observedOn: "" }
    expect(wildlifeSortKey(old300)).toBeLessThan(wildlifeSortKey(old400))
    expect(wildlifeSortKey(old400)).toBeLessThan(wildlifeSortKey(unknown))
  })
})

describe("formatObservedAgo", () => {
  it("오늘 → 최근 관측 강조", () => {
    expect(formatObservedAgo({ observedOn: iso(0) })).toEqual({ recent: true, label: "오늘 관측" })
  })

  it("30일 이내 → N일 전 관측 (recent)", () => {
    expect(formatObservedAgo({ observedOn: iso(-5) })).toEqual({ recent: true, label: "5일 전 관측" })
  })

  it("30일 초과 → 날짜 표기 (recent 아님)", () => {
    const result = formatObservedAgo({ observedOn: iso(-40) })
    expect(result.recent).toBe(false)
    expect(result.label).toContain("관측")
  })

  it("파싱 불가 → null", () => {
    expect(formatObservedAgo({ observedOn: "" })).toBeNull()
  })
})

describe("dedupeWalkItems (③ TourAPI + 카탈로그 병합 중복 제거)", () => {
  it("같은 제목 + 500m 이내 → 하나만, 이미지 있는 쪽 우선", () => {
    const tour = { title: "남산 공원", lat: 37.5512, lng: 126.9882, image: "http://img" }
    const catalog = { title: "남산공원", lat: 37.5514, lng: 126.9884, image: "" }
    const result = dedupeWalkItems([catalog, tour])
    expect(result).toHaveLength(1)
    expect(result[0].image).toBe("http://img")
  })

  it("같은 제목이라도 멀리 떨어져 있으면 둘 다 유지", () => {
    const a = { title: "중앙공원", lat: 37.55, lng: 126.98, image: "" }
    const b = { title: "중앙공원", lat: 36.80, lng: 127.15, image: "" }
    expect(dedupeWalkItems([a, b])).toHaveLength(2)
  })

  it("다른 제목은 그대로", () => {
    const a = { title: "덕수궁", lat: 37.5658, lng: 126.9751, image: "" }
    const b = { title: "남산공원", lat: 37.5512, lng: 126.9882, image: "" }
    expect(dedupeWalkItems([a, b])).toHaveLength(2)
  })

  it("포함관계 + 200m 이내 → 병합, 짧은 제목(상위 개념) 우선", () => {
    const palace = { title: "덕수궁", lat: 37.5658, lng: 126.9751, image: "" }
    const hall = { title: "덕수궁 함녕전", lat: 37.5661, lng: 126.9753, image: "" }
    const result = dedupeWalkItems([hall, palace])
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe("덕수궁")
  })

  it("포함관계라도 이미지 있는 쪽이 대표", () => {
    const palace = { title: "덕수궁", lat: 37.5658, lng: 126.9751, image: "" }
    const hall = { title: "덕수궁 함녕전", lat: 37.5661, lng: 126.9753, image: "http://img" }
    const result = dedupeWalkItems([palace, hall])
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe("덕수궁 함녕전")
  })

  it("포함관계라도 200m 넘게 떨어지면 둘 다 유지 (완전 일치 500m 보다 보수적)", () => {
    const palace = { title: "덕수궁", lat: 37.5658, lng: 126.9751, image: "" }
    const far = { title: "덕수궁 돌담길", lat: 37.5695, lng: 126.9751, image: "" } // 약 400m
    expect(dedupeWalkItems([palace, far])).toHaveLength(2)
  })

  it("짧은 쪽 제목이 3자 미만이면 포함관계 병합 스킵", () => {
    const forest = { title: "숲", lat: 37.5443, lng: 127.0374, image: "" }
    const seoulForest = { title: "서울숲", lat: 37.5444, lng: 127.0375, image: "" }
    expect(dedupeWalkItems([forest, seoulForest])).toHaveLength(2)
  })
})

describe("interleaveByKind (③ 같은 종류 연속 제한 — 도심 공원 도배 방지)", () => {
  const kindOf = (item) => item.kind

  it("연속 3개째부터 가장 가까운 다른 종류에 양보, 밀린 항목은 바로 재진입", () => {
    const items = [
      { id: "p1", kind: "park" }, { id: "p2", kind: "park" }, { id: "p3", kind: "park" },
      { id: "m1", kind: "market" }, { id: "p4", kind: "park" },
    ]
    expect(interleaveByKind(items, kindOf).map((i) => i.id)).toEqual(["p1", "p2", "m1", "p3", "p4"])
  })

  it("다른 종류가 없으면 순서 그대로", () => {
    const items = [{ id: "p1", kind: "park" }, { id: "p2", kind: "park" }, { id: "p3", kind: "park" }]
    expect(interleaveByKind(items, kindOf).map((i) => i.id)).toEqual(["p1", "p2", "p3"])
  })

  it("항목을 잃지 않는다 (재배치만)", () => {
    const items = [
      { id: "p1", kind: "park" }, { id: "p2", kind: "park" }, { id: "p3", kind: "park" },
      { id: "r1", kind: "trail" }, { id: "m1", kind: "market" }, { id: "p4", kind: "park" },
    ]
    const out = interleaveByKind(items, kindOf)
    expect(out).toHaveLength(6)
    expect(new Set(out.map((i) => i.id)).size).toBe(6)
  })

  it("종류가 번갈아 나오면 개입하지 않는다", () => {
    const items = [
      { id: "p1", kind: "park" }, { id: "m1", kind: "market" },
      { id: "p2", kind: "park" }, { id: "h1", kind: "history" },
    ]
    expect(interleaveByKind(items, kindOf).map((i) => i.id)).toEqual(["p1", "m1", "p2", "h1"])
  })
})

describe("routeToPrefill / formatRouteMeta (둘레길 채집)", () => {
  const course = {
    catalogId: "durunubi:T_CRS_MNG0000000001",
    title: "해파랑길 1코스",
    category: "둘레길",
    addr: "부산 남구",
    lat: 35.1531,
    lng: 129.1187,
    routeDistanceKm: 17.7,
    routeDurationMin: 390,
    routeLevel: "보통",
  }

  it("프리필에 routeCatalogId 와 시작점이 실린다", () => {
    const prefill = routeToPrefill(course)
    expect(prefill.routeCatalogId).toBe("durunubi:T_CRS_MNG0000000001")
    expect(prefill.category).toBe("route")
    expect(prefill.lat).toBe(35.1531)
    expect(prefill.tagLabel).toBe("둘레길")
  })

  it("메타 문구 — 거리·시간·난이도", () => {
    expect(formatRouteMeta(course)).toBe("17.7km · 6시간 30분 · 보통")
    expect(formatRouteMeta({ routeDistanceKm: 5 })).toBe("5km")
    expect(formatRouteMeta({})).toBe("")
  })
})

describe("curationSourceLabel", () => {
  it("행사 소스 매핑", () => {
    expect(curationSourceLabel("event", { source: "tourapi" })).toBe("관광공사")
    expect(curationSourceLabel("event", { source: "culture" })).toBe("문화포털")
    expect(curationSourceLabel("event", { source: "kopis" })).toBe("KOPIS")
  })

  it("공간은 매핑 우선, 없으면 sourceLabel 폴백", () => {
    expect(curationSourceLabel("place", { source: "tourapi", sourceLabel: "TourAPI" })).toBe("관광공사")
    expect(curationSourceLabel("place", { source: "unknown", sourceLabel: "커스텀" })).toBe("커스텀")
  })

  it("생물은 iNaturalist 고정", () => {
    expect(curationSourceLabel("wildlife", {})).toBe("iNaturalist")
  })
})
