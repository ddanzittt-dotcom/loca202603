import { describe, expect, it, vi } from "vitest"
import {
  ALL_GREETING_POOLS,
  POOL_AFTERNOON,
  POOL_AUTUMN,
  POOL_CURATION,
  POOL_FIRST_TIME,
  POOL_GENERAL,
  POOL_IN_PROGRESS,
  POOL_MORNING,
  POOL_RECALL,
  POOL_RETURNING,
} from "./greeting/pools"
import { getDailyGreeting } from "./greeting/cache"
import { getSeason, pickGreeting, selectPool } from "./greeting/selector"

function seededRng(seed) {
  let state = seed
  return () => {
    state = (state * 9301 + 49297) % 233280
    return state / 233280
  }
}

function ctx({ date = "2026-05-19T09:00:00+09:00", hasAnyRecord = true, daysSinceLastVisit = 0, hasInProgressMap = false } = {}) {
  return {
    now: new Date(date),
    activity: { hasAnyRecord, daysSinceLastVisit, hasInProgressMap },
  }
}

function flattenPools(pools) {
  return pools.flatMap((pool) => pool)
}

describe("greeting selector", () => {
  it("returns expected seasons", () => {
    expect(getSeason(new Date("2026-01-01"))).toBe("winter")
    expect(getSeason(new Date("2026-03-01"))).toBe("spring")
    expect(getSeason(new Date("2026-06-01"))).toBe("summer")
    expect(getSeason(new Date("2026-10-01"))).toBe("fall")
    expect(getSeason(new Date("2026-12-01"))).toBe("winter")
  })

  it("selects first-time morning pools with weights", () => {
    const pools = selectPool(ctx({ hasAnyRecord: false }))
    expect(pools).toEqual([
      { messages: POOL_GENERAL, weight: 40 },
      { messages: POOL_MORNING, weight: 20 },
      { messages: POOL_FIRST_TIME, weight: 50 },
      { messages: POOL_CURATION, weight: 10 },
    ])
  })

  it("selects returning pool before in-progress pool", () => {
    const pools = selectPool(ctx({ daysSinceLastVisit: 8, hasInProgressMap: true })).map((pool) => pool.messages)
    expect(pools).toContain(POOL_RETURNING)
    expect(pools).not.toContain(POOL_IN_PROGRESS)
  })

  it("selects in-progress, autumn, curation, and recall pools when eligible", () => {
    const pools = selectPool(ctx({ date: "2026-10-19T19:00:00+09:00", hasInProgressMap: true }))
    expect(pools.map((pool) => pool.messages)).toEqual([
      POOL_GENERAL,
      expect.any(Array),
      POOL_IN_PROGRESS,
      POOL_AUTUMN,
      POOL_CURATION,
      POOL_RECALL,
    ])
  })

  it("picks only from eligible pools and is deterministic with seeded rng", () => {
    const input = ctx({ date: "2026-05-19T13:00:00+09:00" })
    const allowed = flattenPools([POOL_GENERAL, POOL_AFTERNOON, POOL_CURATION, POOL_RECALL])
    const first = pickGreeting(input, seededRng(42))
    const second = pickGreeting(input, seededRng(42))
    expect(first).toBe(second)
    expect(allowed).toContain(first)
  })

  it("does not include numeric characters in any message", () => {
    for (const msg of flattenPools(ALL_GREETING_POOLS)) {
      expect(msg).not.toMatch(/\d/)
    }
  })
})

describe("greeting cache", () => {
  it("returns cached greeting on the second call", async () => {
    const storage = {
      get: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce("cached message"),
      set: vi.fn().mockResolvedValue(undefined),
    }

    const input = ctx()
    await getDailyGreeting(input, storage)
    const second = await getDailyGreeting(input, storage)

    expect(second).toBe("cached message")
    expect(storage.set).toHaveBeenCalledTimes(1)
  })

  it("uses a new cache key when context signature changes", async () => {
    const stored = new Map()
    const storage = {
      get: vi.fn((key) => Promise.resolve(stored.get(key) || null)),
      set: vi.fn((key, value) => {
        stored.set(key, value)
        return Promise.resolve()
      }),
    }

    await getDailyGreeting(ctx({ hasInProgressMap: false }), storage)
    await getDailyGreeting(ctx({ hasInProgressMap: true }), storage)

    expect(storage.set).toHaveBeenCalledTimes(2)
  })

  it("uses a new cache key when the date changes", async () => {
    const stored = new Map()
    const storage = {
      get: vi.fn((key) => Promise.resolve(stored.get(key) || null)),
      set: vi.fn((key, value) => {
        stored.set(key, value)
        return Promise.resolve()
      }),
    }

    await getDailyGreeting(ctx({ date: "2026-05-19T09:00:00+09:00" }), storage)
    await getDailyGreeting(ctx({ date: "2026-05-20T09:00:00+09:00" }), storage)

    expect(storage.set).toHaveBeenCalledTimes(2)
  })
})
