import {
  POOL_AFTERNOON,
  POOL_AUTUMN,
  POOL_CURATION,
  POOL_EVENING,
  POOL_FIRST_TIME,
  POOL_GENERAL,
  POOL_IN_PROGRESS,
  POOL_MORNING,
  POOL_NIGHT,
  POOL_RECALL,
  POOL_RETURNING,
} from "./pools"

export function getSeason(date) {
  const month = date.getMonth() + 1
  if (month >= 3 && month <= 5) return "spring"
  if (month >= 6 && month <= 8) return "summer"
  if (month >= 9 && month <= 11) return "fall"
  return "winter"
}

export function selectPool(ctx) {
  const pools = []
  const hour = ctx.now.getHours()

  pools.push({ messages: POOL_GENERAL, weight: 40 })

  if (hour >= 5 && hour < 11) pools.push({ messages: POOL_MORNING, weight: 20 })
  else if (hour >= 11 && hour < 17) pools.push({ messages: POOL_AFTERNOON, weight: 20 })
  else if (hour >= 17 && hour < 22) pools.push({ messages: POOL_EVENING, weight: 20 })
  else pools.push({ messages: POOL_NIGHT, weight: 20 })

  const { activity } = ctx
  if (!activity.hasAnyRecord) {
    pools.push({ messages: POOL_FIRST_TIME, weight: 50 })
  } else if (activity.daysSinceLastVisit >= 7) {
    pools.push({ messages: POOL_RETURNING, weight: 30 })
  } else if (activity.hasInProgressMap) {
    pools.push({ messages: POOL_IN_PROGRESS, weight: 25 })
  }

  if (getSeason(ctx.now) === "fall") {
    pools.push({ messages: POOL_AUTUMN, weight: 12 })
  }

  pools.push({ messages: POOL_CURATION, weight: 10 })

  if (activity.hasAnyRecord) {
    pools.push({ messages: POOL_RECALL, weight: 8 })
  }

  return pools
}

export function pickGreeting(ctx, rng = Math.random) {
  const entries = []

  for (const pool of selectPool(ctx)) {
    const perMessageWeight = pool.weight / pool.messages.length
    for (const msg of pool.messages) {
      entries.push({ msg, weight: perMessageWeight })
    }
  }

  const total = entries.reduce((sum, entry) => sum + entry.weight, 0)
  let cursor = rng() * total

  for (const entry of entries) {
    cursor -= entry.weight
    if (cursor <= 0) return entry.msg
  }

  return entries[entries.length - 1]?.msg || ""
}
