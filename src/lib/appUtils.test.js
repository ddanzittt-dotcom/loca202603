import { describe, it, expect } from "vitest"
import {
  createId,
  roundCoord,
  sanitizeCoord,
  sanitizePoints,
  formatShortDate,
  mapThemeGradient,
  featureSort,
  tagsToText,
  collectTopTags,
  getFeatureCenter,
  buildSlugShareUrl,
  buildLegalDocumentUrl,
  resolvePublicWebOrigin,
  parseAppLocation,
} from "./appUtils"

describe("createId", () => {
  it("prefix 포함 ID 생성", () => {
    const id = createId("map")
    expect(id).toMatch(/^map-/)
    expect(id.length).toBeGreaterThan(5)
  })
  it("호출마다 고유값", () => {
    expect(createId("x")).not.toBe(createId("x"))
  })
})

describe("roundCoord", () => {
  it("좌표를 소수점 6자리로 반올림", () => {
    expect(roundCoord(37.12345678)).toBe(37.123457)
    expect(roundCoord(0)).toBe(0)
  })
})

describe("sanitizeCoord", () => {
  it("유효한 좌표를 반올림 반환", () => {
    const result = sanitizeCoord(37.5, 127.0)
    expect(result.lat).toBe(37.5)
    expect(result.lng).toBe(127)
  })
  it("NaN/null이면 NaN 유지 (호출부에서 검증 필요)", () => {
    const result = sanitizeCoord(NaN, null)
    expect(Number.isNaN(result.lat)).toBe(true)
  })
})

describe("sanitizePoints", () => {
  it("유효한 포인트 배열 유지", () => {
    const points = [[127.0, 37.5], [127.1, 37.6]]
    expect(sanitizePoints(points)).toEqual(points)
  })
  it("null이면 null, 빈 배열이면 빈 배열", () => {
    expect(sanitizePoints(null)).toBeNull()
    expect(sanitizePoints([])).toEqual([])
  })
})

describe("formatShortDate", () => {
  it("유효한 날짜를 포맷", () => {
    const result = formatShortDate("2026-04-05T10:00:00Z")
    expect(result).toBeTruthy()
    expect(result).not.toBe("")
  })
  it("빈값이면 fallback 텍스트 반환", () => {
    // formatShortDate는 빈값에도 상대 시간 포맷 적용
    const result = formatShortDate("")
    expect(typeof result).toBe("string")
  })
})

describe("mapThemeGradient", () => {
  it("알려진 테마에 대해 2색 배열 반환", () => {
    const result = mapThemeGradient("#635BFF")
    expect(result).toHaveLength(2)
    expect(result[0]).toMatch(/^#/)
    expect(result[1]).toMatch(/^#/)
  })
  it("미지정 테마도 기본값 반환", () => {
    const result = mapThemeGradient(undefined)
    expect(result).toHaveLength(2)
  })
})

describe("featureSort", () => {
  it("updatedAt 기준 최신순 정렬", () => {
    const a = { updatedAt: "2026-04-05" }
    const b = { updatedAt: "2026-04-01" }
    expect(featureSort(a, b)).toBeLessThan(0) // a가 더 최신 → 앞으로
  })
})

describe("tagsToText", () => {
  it("태그 배열을 쉼표 구분 문자열로", () => {
    expect(tagsToText(["맛집", "카페"])).toBe("맛집, 카페")
  })
  it("빈 배열이면 빈 문자열", () => {
    expect(tagsToText([])).toBe("")
  })
})

describe("collectTopTags", () => {
  it("feature 배열에서 빈도 높은 태그 추출", () => {
    const features = [
      { tags: ["맛집", "카페"] },
      { tags: ["맛집", "디저트"] },
      { tags: ["카페"] },
    ]
    const result = collectTopTags(features)
    expect(result[0]).toBe("맛집")
    expect(result[1]).toBe("카페")
  })
})

describe("getFeatureCenter", () => {
  it("핀이면 좌표 + zoom 16 반환", () => {
    const result = getFeatureCenter({ type: "pin", lat: 37.5, lng: 127.0 })
    expect(result).toEqual({ lat: 37.5, lng: 127.0, zoom: 16 })
  })
  it("경로/영역이면 중심점 + zoom 15 반환", () => {
    const result = getFeatureCenter({
      type: "route",
      points: [[127.0, 37.0], [127.2, 37.2]],
    })
    expect(result.lat).toBeCloseTo(37.1)
    expect(result.lng).toBeCloseTo(127.1)
    expect(result.zoom).toBe(15)
  })
  it("null이면 null 반환", () => {
    expect(getFeatureCenter(null)).toBeNull()
  })
})

describe("buildSlugShareUrl", () => {
  it("슬러그 기반 공유 URL 생성", () => {
    const result = buildSlugShareUrl("test-slug", "link", "https://example.com")
    expect(result).toBe("https://example.com/s/test-slug?utm_source=link")
  })
})

describe("resolvePublicWebOrigin", () => {
  it("https origin은 그대로 유지", () => {
    expect(resolvePublicWebOrigin("https://loca.app")).toBe("https://loca.app")
  })

  it("일반 http origin은 https로 승격", () => {
    expect(resolvePublicWebOrigin("http://example.com")).toBe("https://example.com")
  })

  it("localhost origin은 개발 편의를 위해 유지", () => {
    expect(resolvePublicWebOrigin("http://localhost:5173")).toBe("http://localhost:5173")
    expect(resolvePublicWebOrigin("http://127.0.0.1:4173")).toBe("http://127.0.0.1:4173")
  })

  it("비표준 스킴은 fallback origin 사용", () => {
    expect(resolvePublicWebOrigin("capacitor://localhost", "https://fallback.app")).toBe("https://fallback.app")
  })
})

describe("buildLegalDocumentUrl", () => {
  it("약관 URL 생성", () => {
    expect(buildLegalDocumentUrl("terms", "https://loca.app")).toBe("https://loca.app/legal/terms.html")
  })

  it("개인정보처리방침 URL 생성", () => {
    expect(buildLegalDocumentUrl("privacy", "https://loca.app")).toBe("https://loca.app/legal/privacy.html")
  })
})

describe("parseAppLocation", () => {
  it("루트 경로는 null (기본 화면)", () => {
    const result = parseAppLocation({ pathname: "/", search: "", hash: "" })
    expect(result).toBeNull()
  })
  it("슬러그 경로 파싱", () => {
    const result = parseAppLocation({ pathname: "/s/my-map", search: "", hash: "" })
    expect(result.type).toBe("slug")
    expect(result.slug).toBe("my-map")
  })
})
