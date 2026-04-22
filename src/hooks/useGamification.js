import { useCallback, useEffect, useMemo } from "react"
import {
  getGameProfile as fetchGameProfile,
  checkAndAwardBadges,
  checkAndAwardMilestoneSouvenirs,
  computeLocalStats,
} from "../lib/gamificationService"
import { getLevelForXp } from "../data/gamification"

export function useGamification({
  cloudMode, authUser,
  gameProfile, setGameProfile,
  maps, features,
}) {
  const refreshGameProfile = useCallback(async () => {
    if (!cloudMode) { setGameProfile(null); return }
    const profile = await fetchGameProfile()
    if (profile) setGameProfile(profile)
  }, [cloudMode, setGameProfile])

  // 초기 로드 + auth 전환 시
  useEffect(() => {
    refreshGameProfile()
  }, [refreshGameProfile, authUser])

  const userStats = useMemo(() => {
    if (cloudMode && gameProfile?.stats) {
      return gameProfile.stats
    }
    return computeLocalStats({ maps, features })
  }, [cloudMode, gameProfile, maps, features])

  const levelEmoji = useMemo(() => {
    const lvl = getLevelForXp(userStats?.xp || 0)
    return lvl.icon || lvl.emoji
  }, [userStats])

  const userBadges = useMemo(() => gameProfile?.badges || [], [gameProfile])
  const userBadgeIds = useMemo(() => userBadges.map((b) => b.badge_id), [userBadges])
  const souvenirs = useMemo(() => gameProfile?.souvenirs || [], [gameProfile])
  const souvenirCodes = useMemo(() => souvenirs.map((s) => s.souvenir_code).filter(Boolean), [souvenirs])

  // 배지 자동 체크 + 부여
  useEffect(() => {
    if (!cloudMode || !gameProfile?.stats) return
    checkAndAwardBadges(userStats, userBadgeIds).then((newIds) => {
      if (newIds.length > 0) {
        refreshGameProfile()
      }
    })
  }, [cloudMode, gameProfile, userStats, userBadgeIds, refreshGameProfile])

  // 기념 뱃지 milestone 자동 체크 + 발급 (구 행사성 업적 4종 이관분)
  useEffect(() => {
    if (!cloudMode || !gameProfile?.stats) return
    checkAndAwardMilestoneSouvenirs(userStats, souvenirCodes).then((newCodes) => {
      if (newCodes.length > 0) {
        refreshGameProfile()
      }
    })
  }, [cloudMode, gameProfile, userStats, souvenirCodes, refreshGameProfile])

  return {
    refreshGameProfile,
    userStats,
    levelEmoji,
    souvenirs,
  }
}
