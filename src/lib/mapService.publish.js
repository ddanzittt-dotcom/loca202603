import { requireSupabase } from "./supabase"
import { getSessionId } from "./analytics"
import {
  requireUser,
  createSlugCandidate,
  normalizeMap,
} from "./mapService.utils"

function parseRpcResult(data) {
  if (typeof data === "string") {
    try {
      return JSON.parse(data)
    } catch {
      return null
    }
  }
  return data || null
}

function isMissingDbObject(error, objectName) {
  if (!error) return false
  const message = `${error.message || ""}`.toLowerCase()
  return (
    error.code === "42883"
    || error.code === "42P01"
    || message.includes(`${objectName}`.toLowerCase())
  )
}

// ─── 발행 / 발행 중단 ───
//
// 발행(publish)은 공개 링크(/s/:slug) 를 가진 상태로 전환만 담당한다.
// 프로필 노출(map_publications row) 은 별도 액션(addMapToProfile) 으로만 생성된다.
// publishMap() 은 publication row 를 생성하지 않고, 레거시 RPC가 생성했더라도 즉시 삭제해 invariant를 지킨다.

async function dropPublicationRowIfAny(supabase, mapId) {
  try {
    await supabase.from("map_publications").delete().eq("map_id", mapId)
  } catch (error) {
    // publication 테이블이 없거나 권한이 없어도 publish 성공 자체는 유지한다.
    if (!isMissingDbObject(error, "map_publications")) {
      console.warn("[publish] failed to clear publication row:", error)
    }
  }
}

export async function publishMap(mapId, options = {}) {
  await requireUser()
  const supabase = requireSupabase()
  const inputSlug = options.slug || createSlugCandidate(options.title || options.caption || mapId)

  try {
    const { data, error } = await supabase.rpc("publish_map_revision", {
      p_map_id: mapId,
      p_slug: inputSlug || null,
      p_note: options.note || null,
      p_visibility: options.visibility || null,
    })
    if (error) throw error

    const result = parseRpcResult(data)
    if (!result?.success) {
      throw new Error(result?.error || "발행에 실패했습니다.")
    }

    // 발행은 프로필 노출과 분리된다. 레거시 RPC 가 publication row 를 만들었을 수 있으므로 즉시 제거.
    await dropPublicationRowIfAny(supabase, mapId)

    const { data: mapRow, error: mapError } = await supabase
      .from("maps")
      .select("*")
      .eq("id", mapId)
      .single()
    if (mapError) throw mapError

    return {
      map: normalizeMap(mapRow, null),
      publication: null,
    }
  } catch (error) {
    if (!isMissingDbObject(error, "publish_map_revision")) throw error

    const user = await requireUser()
    const now = new Date().toISOString()
    const slug = inputSlug

    const { data: mapRow, error: mapError } = await supabase
      .from("maps")
      .update({
        slug: slug || null,
        visibility: options.visibility || "unlisted",
        is_published: true,
        published_at: now,
        updated_at: now,
      })
      .eq("id", mapId)
      .eq("user_id", user.id)
      .select("*")
      .single()
    if (mapError) throw mapError

    // 발행은 프로필 노출과 분리된다. 과거 row 가 있었다면 정리한다.
    await dropPublicationRowIfAny(supabase, mapId)

    return {
      map: normalizeMap(mapRow, null),
      publication: null,
    }
  }
}

export async function unpublishMap(mapId) {
  await requireUser()
  const supabase = requireSupabase()

  try {
    const { data, error } = await supabase.rpc("unpublish_map_revision", {
      p_map_id: mapId,
    })
    if (error) throw error

    const result = parseRpcResult(data)
    if (!result?.success) {
      throw new Error(result?.error || "발행 중단에 실패했습니다.")
    }
    // 발행을 중단하면 프로필에서도 내려간다. RPC 여부와 무관하게 publication row 를 정리한다.
    await dropPublicationRowIfAny(supabase, mapId)
    return
  } catch (error) {
    if (!isMissingDbObject(error, "unpublish_map_revision")) throw error

    const user = await requireUser()
    const now = new Date().toISOString()
    const { error: mapError } = await supabase
      .from("maps")
      .update({
        is_published: false,
        visibility: "private",
        slug: null,
        updated_at: now,
      })
      .eq("id", mapId)
      .eq("user_id", user.id)
    if (mapError) throw mapError

    await dropPublicationRowIfAny(supabase, mapId)
  }
}

// ─── Saves (single source: map_saves) ───

export async function saveMap(mapId, options = {}) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc("save_map", {
    p_map_id: mapId,
    p_session_id: options.sessionId || getSessionId(),
    p_source: options.source || "unknown",
  })
  if (error) throw error
  return typeof data === "string" ? JSON.parse(data) : data
}

export async function unsaveMap(mapId, options = {}) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc("unsave_map", {
    p_map_id: mapId,
    p_session_id: options.sessionId || getSessionId(),
  })
  if (error) throw error
  return typeof data === "string" ? JSON.parse(data) : data
}

// ─── B2B/B2G 초대코드 ───

export async function redeemInvitationCode(codeText) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc("redeem_invitation_code", {
    code_text: codeText.trim(),
  })
  if (error) throw error
  return data
}

export async function checkB2BAccess() {
  const supabase = requireSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false

  const { data, error } = await supabase
    .from("invitation_redemptions")
    .select("id")
    .eq("user_id", user.id)
    .limit(1)

  if (error) return false
  return data.length > 0
}

// ─── 공지사항 ───

export async function getActiveAnnouncements(mapId) {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, created_at")
    .eq("map_id", mapId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  if (error) throw error
  return data || []
}

export async function getAllAnnouncements(mapId) {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, is_active, created_at, updated_at")
    .eq("map_id", mapId)
    .order("created_at", { ascending: false })

  if (error) throw error
  return data || []
}

export async function createAnnouncement(mapId, { title, body }) {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("announcements")
    .insert({ map_id: mapId, title: title.trim(), body: (body || "").trim() })
    .select("*")
    .single()

  if (error) throw error
  return data
}

export async function updateAnnouncement(announcementId, { title, body }) {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("announcements")
    .update({ title: title.trim(), body: (body || "").trim() })
    .eq("id", announcementId)
    .select("*")
    .single()

  if (error) throw error
  return data
}

export async function toggleAnnouncementActive(announcementId, isActive) {
  const supabase = requireSupabase()
  const { error } = await supabase
    .from("announcements")
    .update({ is_active: isActive })
    .eq("id", announcementId)

  if (error) throw error
}

export async function deleteAnnouncement(announcementId) {
  const supabase = requireSupabase()
  const { error } = await supabase
    .from("announcements")
    .delete()
    .eq("id", announcementId)

  if (error) throw error
}

// ─── 성장 엔진 RPC (v2) ───

export async function submitEventCheckin(mapId, featureId, sessionId = null, lat = null, lng = null, accuracy = null) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc("submit_event_checkin", {
    p_map_id: mapId,
    p_feature_id: featureId,
    p_session_id: sessionId,
    p_lat: lat,
    p_lng: lng,
    p_accuracy: accuracy,
  })
  if (error) throw error
  return data
}

export async function recordMapAction(actionType, eventKey, mapId = null, featureId = null, payload = {}) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc("record_map_action", {
    p_action_type: actionType,
    p_event_key: eventKey,
    p_map_id: mapId,
    p_feature_id: featureId,
    p_payload: payload,
  })
  if (error) throw error
  return data
}

export async function submitSurveyReward(mapId) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc("submit_survey_reward", { p_map_id: mapId })
  if (error) throw error
  return data
}

// ─── 유저 통계 (레거시) ───

/** @deprecated 서버 RPC가 stats를 직접 관리 */
export async function upsertUserStats(stats) {
  const supabase = requireSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { error } = await supabase
    .from("user_stats")
    .upsert({
      user_id: user.id,
      xp: stats.xp || 0,
      level: stats.level || 1,
      checkins: stats.checkins || 0,
      completions: stats.completions || 0,
      memos: stats.memos || 0,
      imports: stats.imports || 0,
      publishes: stats.publishes || 0,
      streak_days: stats.streak || 0,
      regions: stats.regions || 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })

  if (error) throw error
}

export async function updateStreak() {
  const supabase = requireSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.rpc("update_user_streak", { p_user_id: user.id }).catch(() => {})
}

/** @deprecated gamificationService.awardBadge() 사용 */
export async function awardBadge(badgeId) {
  const supabase = requireSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from("user_badges")
    .upsert({ user_id: user.id, badge_id: badgeId }, { onConflict: "user_id,badge_id" })
    .select("badge_id, earned_at")
    .single()

  if (error && error.code !== "23505") throw error
  return data
}

export async function awardSouvenir(souvenirCode, mapId = null, meta = {}) {
  const supabase = requireSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from("user_souvenirs")
    .insert({
      user_id: user.id,
      souvenir_code: souvenirCode,
      map_id: mapId,
      meta,
    })
    .select()
    .maybeSingle()

  if (error && error.code !== "23505") throw error
  return data
}

// ─── 설문 ───

export async function submitSurveyResponse(mapId, { rating, comment }) {
  const supabase = requireSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase.from("survey_responses").insert({
    map_id: mapId,
    session_id: getSessionId(),
    user_id: user?.id || null,
    rating,
    comment: comment || "",
    answers: {},
  })

  if (error) throw error
}
