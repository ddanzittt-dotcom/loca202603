const DAY_MS = 1000 * 60 * 60 * 24

export function buildGreetingContext(args) {
  const now = new Date()
  const hasAnyRecord = args.user.firstRecordAt !== null
  const daysSinceLastVisit = args.user.lastVisitAt
    ? Math.max(0, Math.floor((now.getTime() - args.user.lastVisitAt.getTime()) / DAY_MS))
    : 0
  const hasInProgressMap = args.inProgressMap !== null

  return {
    now,
    activity: {
      hasAnyRecord,
      daysSinceLastVisit,
      hasInProgressMap,
    },
  }
}
