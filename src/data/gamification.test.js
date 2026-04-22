import { describe, expect, it } from "vitest"
import { BADGES, MILESTONE_SOUVENIRS } from "./gamification"

describe("BADGES 카탈로그 (업적 = 활동 성취)", () => {
  it("행사 참여 이정표 4개는 BADGES 에서 제거되었다", () => {
    const removed = ["first_checkin", "first_completion", "five_completions", "three_regions"]
    const remaining = new Set(BADGES.map((b) => b.id))
    for (const id of removed) {
      expect(remaining.has(id)).toBe(false)
    }
  })

  it("활동 성취 업적은 그대로 유지된다", () => {
    const kept = [
      "ten_pins", "fifty_pins", "five_maps", "three_publishes",
      "ten_memos", "five_imports",
      "streak_3", "streak_7", "streak_30",
    ]
    const ids = new Set(BADGES.map((b) => b.id))
    for (const id of kept) {
      expect(ids.has(id)).toBe(true)
    }
  })

  it("모든 뱃지는 { id, name, desc, condition } 구조를 만족한다", () => {
    for (const badge of BADGES) {
      expect(typeof badge.id).toBe("string")
      expect(typeof badge.name).toBe("string")
      expect(typeof badge.desc).toBe("string")
      expect(typeof badge.condition).toBe("function")
    }
  })
})

describe("MILESTONE_SOUVENIRS 카탈로그 (기념 뱃지 = 행사 경험)", () => {
  it("이관된 4개 항목을 모두 포함한다", () => {
    const expected = ["first_checkin", "first_completion", "five_completions", "three_regions"]
    const codes = MILESTONE_SOUVENIRS.map((s) => s.code)
    for (const code of expected) {
      expect(codes).toContain(code)
    }
    expect(codes.length).toBe(4)
  })

  it("first_checkin 은 checkins >= 1 일 때 만족", () => {
    const m = MILESTONE_SOUVENIRS.find((x) => x.code === "first_checkin")
    expect(m.condition({ checkins: 0 })).toBe(false)
    expect(m.condition({ checkins: 1 })).toBe(true)
    expect(m.condition({ checkins: 10 })).toBe(true)
  })

  it("first_completion 은 completions >= 1 일 때 만족", () => {
    const m = MILESTONE_SOUVENIRS.find((x) => x.code === "first_completion")
    expect(m.condition({ completions: 0 })).toBe(false)
    expect(m.condition({ completions: 1 })).toBe(true)
  })

  it("five_completions 는 completions >= 5 일 때 만족", () => {
    const m = MILESTONE_SOUVENIRS.find((x) => x.code === "five_completions")
    expect(m.condition({ completions: 4 })).toBe(false)
    expect(m.condition({ completions: 5 })).toBe(true)
    expect(m.condition({ completions: 10 })).toBe(true)
  })

  it("three_regions 는 regions >= 3 일 때 만족", () => {
    const m = MILESTONE_SOUVENIRS.find((x) => x.code === "three_regions")
    expect(m.condition({ regions: 2 })).toBe(false)
    expect(m.condition({ regions: 3 })).toBe(true)
  })

  it("모든 milestone 은 { code, title, emoji, condition } 구조를 만족한다", () => {
    for (const m of MILESTONE_SOUVENIRS) {
      expect(typeof m.code).toBe("string")
      expect(typeof m.title).toBe("string")
      expect(typeof m.emoji).toBe("string")
      expect(typeof m.condition).toBe("function")
    }
  })

  it("업적(BADGES) 과 기념뱃지(MILESTONE_SOUVENIRS) id/code 는 겹치지 않는다", () => {
    const badgeIds = new Set(BADGES.map((b) => b.id))
    for (const m of MILESTONE_SOUVENIRS) {
      expect(badgeIds.has(m.code)).toBe(false)
    }
  })
})
