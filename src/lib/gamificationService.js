/**
 * gamificationService.js
 * 게이미피케이션 서비스 레이어
 *
 * - cloud mode: Supabase RPC 기반 (서버 authoritative)
 * - local mode: computeStatsFromLocal fallback
 *
 * App/Screen은 이 모듈만 import 한다.
 * mapService.js의 RPC 함수들은 이 모듈 내부에서만 호출한다.
 */

import { hasSupabaseEnv } from "./supabase"
import {
  getGameProfile as rpcGetGameProfile,
  recordMapAction as rpcRecordMapAction,
  submitEventCheckin as rpcSubmitEventCheckin,
  submitSurveyReward as rpcSubmitSurveyReward,
  getMyCheckins as rpcGetMyCheckins,
  awardSouvenir as rpcAwardSouvenir,
  getUserBadges as rpcGetUserBadges,
  awardBadge as rpcAwardBadge,
  updateStreak as rpcUpdateStreak,
} from "./mapService"
import { computeStatsFromLocal, BADGES } from "../data/gamification"
// re-export for convenience
export { LEVELS, BADGES, XP_VALUES, getLevelForXp, getNextLevel, getLevelProgress, getEarnedBadges, getNextEarnableBadge } from "../data/gamification"

// ─── Profile shape normalizer ───
// DB snake_case → JS camelCase 통일
function normalizeGameProfile(raw) {
  if (!raw) return null
  const s = raw.stats || raw
  return {
    stats: {
      xp: s.xp || 0,
      level: s.level || 1,
      title: s.current_title || null,
      maps: s.maps || 0,
      pins: s.pins || 0,
      routes: s.routes || 0,
      areas: s.areas || 0,
      checkins: s.checkins || 0,
      completions: s.completions || 0,
      memos: s.memos || 0,
      records: s.records || 0,
      imports: s.imports || 0,
      publishes: s.publishes || 0,
      streak: s.streak_days ?? s.streak ?? 0,
      regions: s.regions || 0,
      creatorXp: s.creator_xp || 0,
      explorerXp: s.explorer_xp || 0,
      influenceXp: s.influence_xp || 0,
      trustXp: s.trust_xp || 0,
      dailyCreator: s.daily_creator || 0,
      dailyExplorer: s.daily_explorer || 0,
      dailyInfluence: s.daily_influence || 0,
      dailyTrust: s.daily_trust || 0,
      dailyCap: s.daily_cap || 30,
    },
    badges: raw.badges || [],
    souvenirs: raw.souvenirs || [],
  }
}

// ─── Public API ───

/**
 * 게임 프로필 통합 조회
 * cloud mode: get_game_profile RPC → normalize
 * local mode: null (caller가 computeStatsFromLocal로 대체)
 */
export async function getGameProfile() {
  if (!hasSupabaseEnv) return null
  try {
    const raw = await rpcGetGameProfile()
    return normalizeGameProfile(raw)
  } catch {
    return null
  }
}

/**
 * 지도/피처 액션 XP 부여
 * @param {object} params
 * @param {string} params.actionType - map_create, feature_create_pin, map_publish, ...
 * @param {string} params.eventKey - 중복 방지 키
 * @param {string} [params.mapId]
 * @param {string} [params.featureId]
 * @param {object} [params.payload]
 */
export async function recordMapAction({ actionType, eventKey, mapId, featureId, payload }) {
  if (!hasSupabaseEnv) return null
  try {
    return await rpcRecordMapAction(actionType, eventKey, mapId || null, featureId || null, payload || {})
  } catch {
    return null
  }
}

/**
 * 이벤트 체크인
 * @param {object} params
 * @param {string} params.mapId
 * @param {string} params.featureId
 * @param {string} [params.proofType] - 'gps' (기본)
 * @param {object} [params.proofMeta] - { lat, lng, accuracy }
 * @param {string} [params.sessionId]
 */
export async function submitEventCheckin({ mapId, featureId, proofMeta, sessionId }) {
  if (!hasSupabaseEnv) return null
  const lat = proofMeta?.lat || null
  const lng = proofMeta?.lng || null
  const accuracy = proofMeta?.accuracy || null
  try {
    return await rpcSubmitEventCheckin(mapId, featureId, sessionId || null, lat, lng, accuracy)
  } catch {
    return null
  }
}

/**
 * 설문 제출 보상
 * @param {object} params
 * @param {string} params.mapId
 */
export async function submitSurveyReward({ mapId }) {
  if (!hasSupabaseEnv) return null
  try {
    return await rpcSubmitSurveyReward(mapId)
  } catch {
    return null
  }
}

/**
 * 수비니어 목록 조회 (getGameProfile에 포함되므로 단독 호출은 드묾)
 */
export async function getUserSouvenirs() {
  if (!hasSupabaseEnv) return []
  try {
    const profile = await rpcGetGameProfile()
    return profile?.souvenirs || []
  } catch {
    return []
  }
}

/**
 * 뱃지 목록 조회
 */
export async function getUserBadges() {
  if (!hasSupabaseEnv) return []
  try {
    return await rpcGetUserBadges()
  } catch {
    return []
  }
}

/**
 * 뱃지 부여
 */
export async function awardBadge(badgeId) {
  if (!hasSupabaseEnv) return null
  try {
    return await rpcAwardBadge(badgeId)
  } catch {
    return null
  }
}

/**
 * 수비니어 발급
 */
export async function awardSouvenir(souvenirCode, mapId, meta) {
  if (!hasSupabaseEnv) return null
  try {
    return await rpcAwardSouvenir(souvenirCode, mapId || null, meta || {})
  } catch {
    return null
  }
}

/**
 * 특정 지도의 내 체크인 목록
 */
export async function getMyCheckins(mapId) {
  if (!hasSupabaseEnv) return []
  try {
    return await rpcGetMyCheckins(mapId)
  } catch {
    return []
  }
}

/**
 * 스트릭 갱신 (하루 1회)
 */
export async function updateStreak() {
  if (!hasSupabaseEnv) return
  try {
    await rpcUpdateStreak()
  } catch {
    // silent
  }
}

/**
 * 배지 자동 체크 + 부여
 * @param {object} stats - normalized stats (camelCase)
 * @param {string[]} earnedBadgeIds - 이미 획득한 badge_id 목록
 * @returns {string[]} 새로 획득한 badge_id 목록
 */
export async function checkAndAwardBadges(stats, earnedBadgeIds) {
  const newBadges = []
  for (const badge of BADGES) {
    if (earnedBadgeIds.includes(badge.id)) continue
    if (badge.condition(stats)) {
      const result = await awardBadge(badge.id)
      if (result) newBadges.push(badge.id)
    }
  }
  return newBadges
}

/**
 * local mode fallback: 로컬 데이터로 통계 계산
 */
export function computeLocalStats({ maps, features }) {
  const publishedCount = maps.filter((m) => m.isPublished).length
  return computeStatsFromLocal({
    maps, features,
    checkins: 0, completions: 0, memos: 0, imports: 0,
    publishes: publishedCount, streak: 0, regions: 0,
  })
}
