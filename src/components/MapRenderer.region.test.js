import { describe, it, expect } from "vitest"
import { regionOf, detectRegion } from "./mapRegion"

describe("regionOf / isKorea", () => {
  it("국내 좌표는 kr", () => {
    expect(regionOf(37.5665, 126.978)).toBe("kr") // 서울
    expect(regionOf(35.1796, 129.0756)).toBe("kr") // 부산
    expect(regionOf(33.5, 126.5)).toBe("kr") // 제주
  })

  it("국외 좌표는 global", () => {
    expect(regionOf(35.6762, 139.6503)).toBe("global") // 도쿄
    expect(regionOf(40.7128, -74.006)).toBe("global") // 뉴욕
    expect(regionOf(1.3521, 103.8198)).toBe("global") // 싱가포르
    expect(regionOf(48.8566, 2.3522)).toBe("global") // 파리
  })

  it("경계 밖(위도/경도 초과)은 global", () => {
    expect(regionOf(32.9, 127)).toBe("global") // 위도 하한 아래
    expect(regionOf(39.1, 127)).toBe("global") // 위도 상한 위
    expect(regionOf(36, 123.9)).toBe("global") // 경도 서쪽
    expect(regionOf(36, 132.1)).toBe("global") // 경도 동쪽(독도 인근 밖)
  })
})

describe("detectRegion 우선순위", () => {
  it("focusPoint 최우선", () => {
    expect(detectRegion([{ lat: 37.5, lng: 127 }], { lat: 35.68, lng: 139.65 }, null)).toBe("global")
    expect(detectRegion([{ lat: 35.68, lng: 139.65 }], { lat: 37.5, lng: 127 }, null)).toBe("kr")
  })

  it("focusPoint 없으면 myLocation", () => {
    expect(detectRegion([], null, { lat: 35.68, lng: 139.65 })).toBe("global")
    expect(detectRegion([], null, { lat: 37.5, lng: 127 })).toBe("kr")
  })

  it("focusPoint·myLocation 없으면 features 첫 좌표(핀/경로)", () => {
    expect(detectRegion([{ lat: 35.68, lng: 139.65 }], null, null)).toBe("global")
    expect(detectRegion([{ points: [[139.65, 35.68]] }], null, null)).toBe("global") // [lng, lat]
    expect(detectRegion([{ points: [[127, 37.5]] }], null, null)).toBe("kr")
  })

  it("근거가 전혀 없으면 기본 kr", () => {
    expect(detectRegion([], null, null)).toBe("kr")
    expect(detectRegion(undefined, undefined, undefined)).toBe("kr")
  })
})
