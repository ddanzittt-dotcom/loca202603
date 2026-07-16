import { describe, expect, it } from "vitest"
import { isMarketDayToday, parseMarketDays } from "./marketDays"

describe("parseMarketDays (시장개설주기 자유 텍스트 파싱)", () => {
  it("5일+10일 → [5, 10]", () => {
    expect(parseMarketDays("5일+10일")).toEqual([5, 10])
  })

  it("매월 2, 7일 → [2, 7]", () => {
    expect(parseMarketDays("매월 2, 7일")).toEqual([2, 7])
  })

  it("가운뎃점 구분(4·9일) → [4, 9]", () => {
    expect(parseMarketDays("4·9일")).toEqual([4, 9])
  })

  it("상설/매일 — 숫자 주기 없음 → []", () => {
    expect(parseMarketDays("상설장")).toEqual([])
    expect(parseMarketDays("매일")).toEqual([])
    expect(parseMarketDays("")).toEqual([])
  })

  it("중복 제거·정렬", () => {
    expect(parseMarketDays("5일, 10일, 5일")).toEqual([5, 10])
  })
})

describe("isMarketDayToday (끝자리 판정 — 5일장=5·15·25, 10일장=10·20·30)", () => {
  it("15일에 5·10일장 → 장날 (끝자리 5)", () => {
    expect(isMarketDayToday([5, 10], new Date(2026, 6, 15))).toBe(true)
  })

  it("20일에 5·10일장 → 장날 (10 ↔ 끝자리 0)", () => {
    expect(isMarketDayToday([5, 10], new Date(2026, 6, 20))).toBe(true)
  })

  it("13일에 5·10일장 → 장날 아님", () => {
    expect(isMarketDayToday([5, 10], new Date(2026, 6, 13))).toBe(false)
  })

  it("주기 없으면 항상 false", () => {
    expect(isMarketDayToday([], new Date(2026, 6, 15))).toBe(false)
    expect(isMarketDayToday(null, new Date(2026, 6, 15))).toBe(false)
  })
})
