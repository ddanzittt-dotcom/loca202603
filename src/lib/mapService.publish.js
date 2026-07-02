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
      throw new Error(result?.error || "링크 공유 켜기에 실패했어요.")
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
      throw new Error(result?.error || "링크 공유 중지에 실패했어요.")
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

