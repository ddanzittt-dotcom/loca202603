import { describe, it, expect } from "vitest"
import {
  friendlySupabaseError,
  createSlugCandidate,
  getDefaultEmoji,
  normalizePoints,
  normalizePublication,
  normalizeMap,
  normalizeMemo,
  normalizeFeature,
  toFeatureInsert,
  toFeaturePatch,
} from "./mapService.utils"

describe("friendlySupabaseError", () => {
  it("네트워크 에러 매핑", () => {
    expect(friendlySupabaseError({ message: "Failed to fetch" })).toBe("네트워크 연결을 확인해주세요.")
  })
  it("권한 에러 매핑", () => {
    expect(friendlySupabaseError({ code: "42501" })).toBe("이 작업을 수행할 권한이 없어요.")
  })
  it("인증 만료 매핑", () => {
    expect(friendlySupabaseError({ message: "jwt expired" })).toBe("로그인이 만료되었어요. 다시 로그인해주세요.")
  })
  it("중복 에러 매핑", () => {
    expect(friendlySupabaseError({ code: "23505" })).toBe("이미 존재하는 데이터예요.")
  })
  it("미발견 매핑", () => {
    expect(friendlySupabaseError({ code: "PGRST116" })).toBe("요청한 데이터를 찾을 수 없어요.")
  })
  it("서버 에러 매핑", () => {
    expect(friendlySupabaseError({ message: "500 internal server error" })).toBe("서버에 문제가 생겼어요. 잠시 후 다시 시도해주세요.")
  })
  it("null 입력 처리", () => {
    expect(friendlySupabaseError(null)).toBe("알 수 없는 오류가 발생했어요.")
  })
  it("알 수 없는 에러는 원본 메시지", () => {
    expect(friendlySupabaseError({ message: "custom error" })).toBe("custom error")
  })
})

describe("createSlugCandidate", () => {
  it("한국어 포함 슬러그 생성", () => {
    expect(createSlugCandidate("성수 봄 축제")).toBe("성수-봄-축제")
  })
  it("영문 소문자 + 하이픈", () => {
    expect(createSlugCandidate("My Cool Map")).toBe("my-cool-map")
  })
  it("특수문자 제거", () => {
    expect(createSlugCandidate("test!@#$map")).toBe("testmap")
  })
  it("빈 문자열", () => {
    expect(createSlugCandidate("")).toBe("")
  })
})

describe("getDefaultEmoji", () => {
  it("pin → 📍", () => expect(getDefaultEmoji("pin")).toBe("📍"))
  it("route → 🛣️", () => expect(getDefaultEmoji("route")).toBe("🛣️"))
  it("area → 🟩", () => expect(getDefaultEmoji("area")).toBe("🟩"))
})

describe("normalizePoints", () => {
  it("배열 좌표 정규화", () => {
    const result = normalizePoints([[127.0, 37.5], [127.1, 37.6]])
    expect(result).toEqual([[127.0, 37.5], [127.1, 37.6]])
  })
  it("객체 좌표를 배열로 변환", () => {
    const result = normalizePoints([{ lat: 37.5, lng: 127.0 }])
    expect(result).toEqual([[127.0, 37.5]])
  })
  it("유효하지 않은 좌표 필터링", () => {
    const result = normalizePoints([null, undefined, [NaN, 1]])
    expect(result).toEqual([])
  })
  it("비배열 입력", () => {
    expect(normalizePoints(null)).toEqual([])
    expect(normalizePoints("hello")).toEqual([])
  })
})

describe("normalizePublication", () => {
  it("null이면 null 반환", () => {
    expect(normalizePublication(null)).toBeNull()
  })
  it("row를 정규화", () => {
    const result = normalizePublication({
      id: "pub1", map_id: "map1", caption: "테스트",
      published_at: "2026-04-05T00:00:00Z", likes_count: 10, saves_count: 5,
    })
    expect(result.id).toBe("pub1")
    expect(result.mapId).toBe("map1")
    expect(result.likes).toBe(10)
    expect(result.saves).toBe(5)
    expect(result.date).toBe("2026-04-05")
  })
})

describe("normalizeMap", () => {
  it("DB row를 앱 형태로 변환", () => {
    const result = normalizeMap({
      id: "m1", title: "테스트", description: "설명",
      theme: "#635BFF", visibility: "public", slug: "test",
      tags: ["a"], category: "event", config: { checkin_enabled: true },
      is_published: true, published_at: "2026-04-05",
      updated_at: "2026-04-05", created_at: "2026-04-01",
    })
    expect(result.id).toBe("m1")
    expect(result.isPublished).toBe(true)
    expect(result.category).toBe("event")
    expect(result.config.checkin_enabled).toBe(true)
  })
  it("기본값 적용", () => {
    const result = normalizeMap({ id: "m2", title: "t" })
    expect(result.theme).toBe("#4F46E5")
    expect(result.category).toBe("personal")
    expect(result.tags).toEqual([])
  })
})

describe("normalizeMemo", () => {
  it("메모 정규화", () => {
    const result = normalizeMemo({ id: "memo1", user_id: "u1", user_name: "홍길동", created_at: "2026-04-05", text: "좋아요" })
    expect(result.userId).toBe("u1")
    expect(result.userName).toBe("홍길동")
    expect(result.text).toBe("좋아요")
  })
})

describe("normalizeFeature", () => {
  it("pin feature 정규화", () => {
    const result = normalizeFeature({ id: "f1", map_id: "m1", type: "pin", title: "장소", lat: 37.5, lng: 127.0, updated_at: "2026-04-05" })
    expect(result.mapId).toBe("m1")
    expect(result.lat).toBe(37.5)
    expect(result.memos).toEqual([])
  })
  it("route feature 정규화", () => {
    const result = normalizeFeature({ id: "f2", map_id: "m1", type: "route", points: [[127, 37]], updated_at: "2026-04-05" })
    expect(result.points).toEqual([[127, 37]])
  })
  it("기본값 적용", () => {
    const result = normalizeFeature({ id: "f3", map_id: "m1", type: "pin" })
    expect(result.title).toBe("새 항목")
    expect(result.emoji).toBe("📍")
    expect(result.tags).toEqual([])
  })
})

describe("toFeatureInsert", () => {
  it("pin insert payload 생성", () => {
    const result = toFeatureInsert({ type: "pin", title: "장소", lat: 37.5, lng: 127.0 })
    expect(result.type).toBe("pin")
    expect(result.lat).toBe(37.5)
    expect(result.points).toBeNull()
  })
  it("route insert payload 생성", () => {
    const result = toFeatureInsert({ type: "route", points: [{ lat: 37, lng: 127 }] })
    expect(result.type).toBe("route")
    expect(result.lat).toBeNull()
    expect(result.points).toEqual([[127, 37]])
  })
})

describe("toFeaturePatch", () => {
  it("변경된 필드만 포함", () => {
    const result = toFeaturePatch({ title: "수정됨" })
    expect(result.title).toBe("수정됨")
    expect(result.updated_at).toBeTruthy()
    expect(result.emoji).toBeUndefined()
  })
  it("좌표 업데이트", () => {
    const result = toFeaturePatch({ lat: 37.5, lng: 127.0 })
    expect(result.lat).toBe(37.5)
    expect(result.lng).toBe(127.0)
  })
})
