import { describe, expect, it } from "vitest"
import { MILESTONE_SOUVENIRS } from "./gamification"

describe("MILESTONE_SOUVENIRS 카탈로그 (기념 뱃지 = 행사 경험)", () => {
  it("필수 4개 항목을 모두 포함한다", () => {
    const expected = ["first_checkin", "first_completion", "five_completions", "three_regions"]
    const codes = MILESTONE_SOUVENIRS.map((s) => s.code)
    for (const code of expected) {
      expect(codes).toContain(code)
    }
    expect(codes.length).toBe(4)
  })

  it("first_checkin은 checkins >= 1 에서만 만족한다", () => {
    const m = MILESTONE_SOUVENIRS.find((x) => x.code === "first_checkin")
    expect(m.condition({ checkins: 0 })).toBe(false)
    expect(m.condition({ checkins: 1 })).toBe(true)
    expect(m.condition({ checkins: 10 })).toBe(true)
  })

  it("first_completion은 completions >= 1 에서만 만족한다", () => {
    const m = MILESTONE_SOUVENIRS.find((x) => x.code === "first_completion")
    expect(m.condition({ completions: 0 })).toBe(false)
    expect(m.condition({ completions: 1 })).toBe(true)
  })

  it("five_completions는 completions >= 5 에서만 만족한다", () => {
    const m = MILESTONE_SOUVENIRS.find((x) => x.code === "five_completions")
    expect(m.condition({ completions: 4 })).toBe(false)
    expect(m.condition({ completions: 5 })).toBe(true)
    expect(m.condition({ completions: 10 })).toBe(true)
  })

  it("three_regions는 regions >= 3 에서만 만족한다", () => {
    const m = MILESTONE_SOUVENIRS.find((x) => x.code === "three_regions")
    expect(m.condition({ regions: 2 })).toBe(false)
    expect(m.condition({ regions: 3 })).toBe(true)
  })

  it("모든 milestone은 { code, title, emoji, condition } 구조를 가진다", () => {
    for (const m of MILESTONE_SOUVENIRS) {
      expect(typeof m.code).toBe("string")
      expect(typeof m.title).toBe("string")
      expect(typeof m.emoji).toBe("string")
      expect(typeof m.condition).toBe("function")
    }
  })
})
