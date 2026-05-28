import fs from "node:fs"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"
import {
  COMMUNITY_SAMPLE_AUTHOR,
  COMMUNITY_SAMPLE_BATCH,
  COMMUNITY_SAMPLE_TAG,
  communitySampleFeatures,
} from "../src/data/communitySampleFeatures.js"

const COMMANDS = new Set(["status", "seed", "cleanup"])
const SAMPLE_IDS = communitySampleFeatures.map((feature) => feature.id)
const SAMPLE_STRIP_COLUMNS = new Set([
  "is_sample",
  "sample_batch",
  "sample_key",
  "emoji_kind",
  "emoji_pixel_id",
  "emoji_photo_url",
  "style",
])

function chunkArray(items, size) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const out = {}
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/)
  for (const line of lines) {
    if (!line || /^\s*#/.test(line) || !line.includes("=")) continue
    const idx = line.indexOf("=")
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if (
      (value.startsWith("\"") && value.endsWith("\""))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

function loadEnv() {
  const cwd = process.cwd()
  return {
    ...parseEnvFile(path.join(cwd, ".env")),
    ...parseEnvFile(path.join(cwd, ".env.local")),
    ...parseEnvFile(path.join(cwd, ".env.production.local")),
    ...process.env,
  }
}

function parseArgs(argv, env = {}) {
  const command = COMMANDS.has(argv[0]) ? argv[0] : "status"
  const flags = new Set(argv.filter((arg) => arg.startsWith("--")))
  const getValue = (name) => {
    const prefix = `${name}=`
    const inline = argv.find((arg) => arg.startsWith(prefix))
    if (inline) return inline.slice(prefix.length)
    const index = argv.indexOf(name)
    return index >= 0 ? argv[index + 1] : null
  }
  return {
    command,
    batch: getValue("--batch") || env.LOCA_SAMPLE_BATCH || COMMUNITY_SAMPLE_BATCH,
    createMap: flags.has("--create-map") || env.LOCA_SAMPLE_CREATE_COMMUNITY_MAP === "1",
    dryRun: flags.has("--dry-run"),
    noReplace: flags.has("--no-replace"),
    all: flags.has("--all"),
  }
}

function requireSupabaseEnv(env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY
  if (!url) throw new Error("VITE_SUPABASE_URL 또는 SUPABASE_URL이 필요합니다.")
  if (!anonKey && !serviceKey) throw new Error("VITE_SUPABASE_ANON_KEY 또는 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.")
  return { url, anonKey, serviceKey }
}

function buildClient(url, key, tag) {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "x-loca-tool": tag,
      },
    },
  })
}

async function getClient(env, args) {
  const { url, anonKey, serviceKey } = requireSupabaseEnv(env)
  const email = env.LOCA_SAMPLE_USER_EMAIL
  const password = env.LOCA_SAMPLE_USER_PASSWORD

  if (serviceKey) {
    return {
      actor: "service-role",
      client: buildClient(url, serviceKey, "community-sample-data"),
      userId: env.LOCA_SAMPLE_USER_ID || null,
    }
  }

  if (email && password) {
    const client = buildClient(url, anonKey, "community-sample-data")
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error || !data?.user) {
      throw new Error(`샘플 계정 로그인 실패: ${error?.message || "세션 없음"}`)
    }
    return {
      actor: `user:${email}`,
      client,
      userId: data.user.id,
    }
  }

  if (args.command === "status" || args.dryRun) {
    return {
      actor: args.dryRun ? "anon-dry-run" : "anon-readonly",
      client: buildClient(url, anonKey, "community-sample-data-status"),
      userId: null,
    }
  }

  throw new Error([
    "seed/cleanup에는 쓰기 권한이 필요합니다.",
    "SUPABASE_SERVICE_ROLE_KEY 또는 LOCA_SAMPLE_USER_EMAIL/LOCA_SAMPLE_USER_PASSWORD를 설정해 주세요.",
  ].join(" "))
}

function missingColumnName(error) {
  if (!error) return null
  if (error.code !== "42703" && error.code !== "PGRST204") return null
  const message = `${error.message || ""}`
  return message.match(/'([^']+)'\s+column/i)?.[1]
    || message.match(/column\s+"([^"]+)"/i)?.[1]
    || message.match(/column\s+(?:[\w]+\.)?([a-zA-Z_][\w]*)\s+does not exist/i)?.[1]
    || message.match(/Could not find the '([^']+)' column/i)?.[1]
    || null
}

function stripColumnFromRows(rows, column) {
  return rows.map((row) => {
    const { [column]: _removed, ...rest } = row
    void _removed
    return rest
  })
}

async function ensureCommunityMap(client, { createMap = false, userId = null } = {}) {
  const existing = await client
    .from("maps")
    .select("*")
    .eq("slug", "community-map")
    .maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) return existing.data

  if (!createMap) {
    throw new Error("community-map을 찾지 못했습니다. 필요하면 --create-map 또는 LOCA_SAMPLE_CREATE_COMMUNITY_MAP=1을 사용하세요.")
  }
  if (!userId) {
    throw new Error("community-map 생성에는 LOCA_SAMPLE_USER_ID 또는 로그인한 샘플 계정이 필요합니다.")
  }

  const now = new Date().toISOString()
  const created = await client
    .from("maps")
    .insert({
      user_id: userId,
      title: "모두의 지도",
      description: "모두가 함께 만드는 지도",
      theme: "#4F46E5",
      visibility: "public",
      slug: "community-map",
      tags: ["community"],
      category: "personal",
      config: { community: true },
      is_published: true,
      published_at: now,
      updated_at: now,
    })
    .select("*")
    .single()
  if (created.error) throw created.error
  return created.data
}

function toFeatureRow(feature, { mapId, batch, userId }) {
  const now = new Date().toISOString()
  const emojiKind = feature.emojiKind || "unicode"
  const emoji = emojiKind === "pixel" && feature.emojiPixelId
    ? `loca-emoji:pixel:${feature.emojiPixelId}`
    : emojiKind === "photo" && feature.emojiPhotoUrl
      ? `loca-emoji:photo:${feature.emojiPhotoUrl}`
      : feature.emoji || "✨"
  return {
    id: feature.id,
    map_id: mapId,
    type: feature.type,
    title: feature.title,
    emoji,
    emoji_kind: emojiKind,
    emoji_pixel_id: emojiKind === "pixel" ? feature.emojiPixelId || null : null,
    emoji_photo_url: emojiKind === "photo" ? feature.emojiPhotoUrl || null : null,
    note: feature.note || "",
    tags: feature.tags || [COMMUNITY_SAMPLE_TAG],
    lat: feature.type === "pin" ? feature.lat : null,
    lng: feature.type === "pin" ? feature.lng : null,
    points: feature.type === "pin" ? null : feature.points,
    style: feature.style || {},
    highlight: false,
    sort_order: feature.sortOrder || 9000,
    created_by: userId,
    created_by_name: COMMUNITY_SAMPLE_AUTHOR,
    is_sample: true,
    sample_batch: batch,
    sample_key: feature.sampleKey,
    created_at: now,
    updated_at: now,
  }
}

async function insertRows(client, rows, { upsert = false, dryRun = false } = {}) {
  if (dryRun) return { rows, strippedColumns: [] }

  let nextRows = rows
  const strippedColumns = []
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const query = upsert
      ? client.from("map_features").upsert(nextRows, { onConflict: "id" }).select("id,title")
      : client.from("map_features").insert(nextRows).select("id,title")
    const { data, error } = await query
    if (!error) return { rows: data || [], strippedColumns }

    const column = missingColumnName(error)
    if (!column || !SAMPLE_STRIP_COLUMNS.has(column)) throw error
    nextRows = stripColumnFromRows(nextRows, column)
    strippedColumns.push(column)
  }

  throw new Error("지원되지 않는 컬럼 제거 재시도 횟수를 초과했습니다.")
}

async function deleteBySampleColumns(client, mapId, { batch, all }) {
  let query = client
    .from("map_features")
    .delete()
    .eq("map_id", mapId)
    .eq("is_sample", true)
  if (!all) query = query.eq("sample_batch", batch)
  const { data, error } = await query.select("id,title")
  if (!error) return { rows: data || [], unsupported: false }

  const column = missingColumnName(error)
  if (column === "is_sample" || column === "sample_batch") {
    return { rows: [], unsupported: true }
  }
  throw error
}

async function deleteByFixedSampleIds(client, mapId) {
  const rows = []
  for (const ids of chunkArray(SAMPLE_IDS, 80)) {
    const { data, error } = await client
      .from("map_features")
      .delete()
      .eq("map_id", mapId)
      .in("id", ids)
      .eq("created_by_name", COMMUNITY_SAMPLE_AUTHOR)
      .contains("tags", [COMMUNITY_SAMPLE_TAG])
      .select("id,title")
    if (error) throw error
    rows.push(...(data || []))
  }
  return rows
}

async function cleanupSamples(client, mapId, { batch, all = false, dryRun = false } = {}) {
  if (dryRun) {
    return {
      rows: [],
      dryRun: true,
      message: all ? "모든 샘플 삭제 예정" : `batch=${batch} 샘플 삭제 예정`,
    }
  }

  const byColumns = await deleteBySampleColumns(client, mapId, { batch, all })
  const byIds = await deleteByFixedSampleIds(client, mapId)
  const seen = new Set()
  const rows = [...byColumns.rows, ...byIds].filter((row) => {
    if (seen.has(row.id)) return false
    seen.add(row.id)
    return true
  })
  return { rows, sampleColumnsUnsupported: byColumns.unsupported }
}

async function listSampleRows(client, mapId) {
  const byColumns = await client
    .from("map_features")
    .select("*")
    .eq("map_id", mapId)
    .eq("is_sample", true)
    .order("sort_order", { ascending: true })

  if (!byColumns.error) return { rows: byColumns.data || [], sampleColumnsUnsupported: false }

  const column = missingColumnName(byColumns.error)
  if (column !== "is_sample") throw byColumns.error

  const fallbackRows = []
  for (const ids of chunkArray(SAMPLE_IDS, 80)) {
    const fallback = await client
      .from("map_features")
      .select("*")
      .eq("map_id", mapId)
      .in("id", ids)
      .order("sort_order", { ascending: true })
    if (fallback.error) throw fallback.error
    fallbackRows.push(...(fallback.data || []))
  }

  return {
    rows: fallbackRows.filter((row) => (
      row.created_by_name === COMMUNITY_SAMPLE_AUTHOR
      && Array.isArray(row.tags)
      && row.tags.includes(COMMUNITY_SAMPLE_TAG)
    )).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    sampleColumnsUnsupported: true,
  }
}

function printRows(rows) {
  if (!rows.length) {
    console.log("샘플 데이터: 0개")
    return
  }
  for (const row of rows) {
    const batch = row.sample_batch || "legacy"
    console.log(`- ${row.id} | ${row.title} | ${batch}`)
  }
}

async function main() {
  const env = loadEnv()
  const args = parseArgs(process.argv.slice(2), env)
  const { actor, client, userId } = await getClient(env, args)
  const communityMap = await ensureCommunityMap(client, {
    createMap: args.createMap,
    userId,
  })

  console.log(`actor=${actor}`)
  console.log(`communityMap=${communityMap.id}`)
  console.log(`batch=${args.batch}`)

  if (args.command === "status") {
    const { rows, sampleColumnsUnsupported } = await listSampleRows(client, communityMap.id)
    if (sampleColumnsUnsupported) {
      console.log("note=sample columns not found; fixed sample ids fallback used")
    }
    printRows(rows)
    return
  }

  if (args.command === "cleanup") {
    const result = await cleanupSamples(client, communityMap.id, args)
    if (result.dryRun) console.log(result.message)
    if (result.sampleColumnsUnsupported) {
      console.log("note=sample columns not found; fixed sample ids fallback used")
    }
    console.log(`deleted=${result.rows.length}`)
    printRows(result.rows)
    return
  }

  if (args.command === "seed") {
    if (!args.noReplace) {
      const removed = await cleanupSamples(client, communityMap.id, args)
      if (removed.sampleColumnsUnsupported) {
        console.log("note=sample columns not found; fixed sample ids fallback used")
      }
      console.log(`preCleanupDeleted=${removed.rows.length}`)
    }
    const rows = communitySampleFeatures.map((feature) => toFeatureRow(feature, {
      mapId: communityMap.id,
      batch: args.batch,
      userId,
    }))
    const result = await insertRows(client, rows, {
      upsert: false,
      dryRun: args.dryRun,
    })
    if (result.strippedColumns.length) {
      console.log(`note=stripped unsupported columns: ${[...new Set(result.strippedColumns)].join(", ")}`)
    }
    console.log(args.dryRun ? `wouldInsert=${result.rows.length}` : `inserted=${result.rows.length}`)
    printRows(result.rows)
  }
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exitCode = 1
})
