// mapPlacement.js
//
// 발행(publish) 과 프로필 노출(profile placement) 을 분리하기 위한 단일 helper.
// 모든 화면은 이 파일의 getProfilePlacementState() 반환값만 보고 상태/가능한 액션을 판정한다.
//
// - 발행(isPublished)        : 지도가 공개 링크(/s/:slug) 를 가진 상태
// - 프로필 노출(isOnProfile)   : 사용자가 명시적으로 프로필에 올려둔 상태
//   (내부적으로는 map_publications row 존재 여부 = local 모드에서는 shares 배열 존재 여부)
//
// 핸드북 OVERRIDE 2 에 따라 event map 도 프로필 노출이 가능하다.
// 단, event map 의 발행 관리(publish/unpublish)는 대시보드 전용이므로 canPublish/canUnpublish=false.

import { requireSupabase } from "./supabase"
import { requireUser } from "./mapService.utils"

/**
 * 단일 지도의 현재 상태와 가능한 액션을 계산한다.
 *
 * @param {Object} map                    normalizeMap() 결과 또는 local map 객체
 * @param {Object|null} placementRow      명시적으로 프로필에 올라간 상태를 나타내는 row.
 *                                        cloud: map_publications row (normalize 된 publication)
 *                                        local: shares 배열의 항목
 *                                        null 이면 프로필 미노출 상태로 취급.
 */
export function getProfilePlacementState(map, placementRow = null) {
  const mapObj = map || {}
  const isEventMap = mapObj.category === "event"
  const hasSlug = Boolean(mapObj.slug)
  const isPublished = Boolean(mapObj.isPublished || mapObj.is_published || hasSlug)
  const isDraft = !isPublished
  const isOnProfile = Boolean(placementRow)

  // 메인 앱 발행/발행 중단은 non-event map 에만 허용 (핸드북 §1)
  const canPublish = !isEventMap && isDraft
  const canUnpublish = !isEventMap && isPublished

  // 프로필 노출은 event map 포함 모든 발행된 지도가 대상 (OVERRIDE 2)
  const canAddToProfile = isPublished && !isOnProfile
  const canRemoveFromProfile = isPublished && isOnProfile

  return {
    isDraft,
    isPublished,
    isOnProfile,
    isEventMap,
    canPublish,
    canUnpublish,
    canAddToProfile,
    canRemoveFromProfile,
  }
}

/**
 * shares 배열(또는 publication row 배열)에서 해당 지도의 placement 를 찾아주는 헬퍼.
 */
export function findPlacementForMap(mapId, placements = []) {
  if (!mapId || !Array.isArray(placements)) return null
  return placements.find((row) => row?.mapId === mapId) || null
}

// ─────────────────────────────────────────────────────────────
// 서버 액션 (cloud mode 전용)
// ─────────────────────────────────────────────────────────────

// map_publications row 삽입/제거는 발행과 분리된 별도 액션이다.
// 기존 map_publications 스키마(caption, likes_count, saves_count, published_at) 를 그대로 사용한다.

export async function addMapToProfile(mapId, options = {}) {
  const supabase = requireSupabase()
  await requireUser()
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("map_publications")
    .upsert(
      {
        map_id: mapId,
        caption: options.caption || "",
        likes_count: 0,
        saves_count: 0,
        published_at: now,
      },
      { onConflict: "map_id" },
    )
    .select("*")
    .single()
  if (error) throw error
  return data
}

export async function removeMapFromProfile(mapId) {
  const supabase = requireSupabase()
  await requireUser()
  const { error } = await supabase
    .from("map_publications")
    .delete()
    .eq("map_id", mapId)
  if (error) throw error
}

/**
 * 배포 시점에 한 번 실행해 과거 "발행 = 자동 프로필 노출" 시절의 publication row 들을 정리한다.
 * localStorage flag 를 통해 중복 실행을 방지한다.
 *
 * @returns {Promise<{ ran: boolean, deleted: boolean }>}
 */
const RESET_FLAG_KEY = "loca.profile_curation_reset_done_v2"

export async function resetLegacyProfileCuration() {
  if (typeof window === "undefined") return { ran: false, deleted: false }
  try {
    if (window.localStorage?.getItem(RESET_FLAG_KEY) === "true") {
      return { ran: false, deleted: false }
    }
  } catch {
    // localStorage 접근 불가 환경에서는 그냥 조용히 시도한다.
  }

  const supabase = requireSupabase()
  const user = await requireUser()

  // 사용자의 지도 ID 목록을 먼저 조회한 다음 그 지도들의 publication row 만 삭제한다.
  const { data: myMapRows, error: mapError } = await supabase
    .from("maps")
    .select("id")
    .eq("user_id", user.id)

  if (mapError) throw mapError
  const myMapIds = (myMapRows || []).map((row) => row.id)
  if (myMapIds.length === 0) {
    try {
      window.localStorage?.setItem(RESET_FLAG_KEY, "true")
    } catch { /* noop */ }
    return { ran: true, deleted: false }
  }

  const { error: deleteError } = await supabase
    .from("map_publications")
    .delete()
    .in("map_id", myMapIds)

  if (deleteError) throw deleteError

  try {
    window.localStorage?.setItem(RESET_FLAG_KEY, "true")
  } catch { /* noop */ }

  return { ran: true, deleted: true }
}

export const PROFILE_CURATION_RESET_FLAG = RESET_FLAG_KEY
