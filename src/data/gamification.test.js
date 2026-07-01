import { describe, expect, it } from "vitest"
import { MILESTONE_SOUVENIRS } from "./gamification"

describe("MILESTONE_SOUVENIRS 카탈로그", () => {
  it("배열 형태다", () => {
    expect(Array.isArray(MILESTONE_SOUVENIRS)).toBe(true)
  })

  it("각 milestone은 { code, title, emoji, condition } 구조를 가진다", () => {
    for (const m of MILESTONE_SOUVENIRS) {
      expect(typeof m.code).toBe("string")
      expect(typeof m.title).toBe("string")
      expect(typeof m.emoji).toBe("string")
      expect(typeof m.condition).toBe("function")
    }
  })
})
