import { pickGreeting } from "./selector"

function getDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function getGreetingCacheKey(ctx) {
  const sig = [
    ctx.activity.hasAnyRecord ? "1" : "0",
    ctx.activity.daysSinceLastVisit >= 7 ? "R" : "N",
    ctx.activity.hasInProgressMap ? "P" : "_",
  ].join("")

  return `greeting:${getDateKey(ctx.now)}:${sig}`
}

export async function getDailyGreeting(ctx, storage) {
  const key = getGreetingCacheKey(ctx)
  const cached = await storage.get(key)
  if (cached) return cached

  const fresh = pickGreeting(ctx)
  await storage.set(key, fresh)
  return fresh
}
