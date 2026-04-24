import fs from "node:fs"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"

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

function nowIso() {
  return new Date().toISOString()
}

function createQaReport() {
  return {
    startedAt: nowIso(),
    env: {},
    auth: {},
    context: {},
    checks: [],
    notes: [],
  }
}

function pushAssert(report, name, pass, expected, detail = "") {
  report.checks.push({
    type: "assert",
    name,
    pass,
    expected,
    detail,
  })
}

function summarize(report) {
  const asserts = report.checks.filter((item) => item.type === "assert")
  const passCount = asserts.filter((item) => item.pass).length
  return {
    passCount,
    total: asserts.length,
    allPass: passCount === asserts.length,
    observeCount: report.checks.length - asserts.length,
  }
}

function buildClient(url, anonKey) {
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "x-loca-qa": "event-collab-roles",
      },
    },
  })
}

async function loginWithPassword(url, anonKey, email, password) {
  const client = buildClient(url, anonKey)
  const loginRes = await client.auth.signInWithPassword({ email, password })
  if (loginRes.error || !loginRes.data.session || !loginRes.data.user) {
    throw new Error(loginRes.error?.message || "Failed to create session")
  }
  return { client, user: loginRes.data.user, email }
}

async function requireUser(url, anonKey, env, label, report) {
  const email = env[`LOCA_QA_USER_${label}_EMAIL`]
  const password = env[`LOCA_QA_USER_${label}_PASSWORD`]
  if (!email || !password) {
    throw new Error(`Missing LOCA_QA_USER_${label}_EMAIL / LOCA_QA_USER_${label}_PASSWORD`)
  }
  const auth = await loginWithPassword(url, anonKey, email, password)
  report.auth[label.toLowerCase()] = {
    email: auth.email,
    userId: auth.user.id,
  }
  return auth
}

function ensureRows(name, result) {
  if (result.error) throw new Error(result.error.message)
  const rows = Array.isArray(result.data) ? result.data : (result.data ? [result.data] : [])
  if (rows.length === 0) throw new Error(`${name}: no affected rows`)
  return rows
}

function isBlocked(result) {
  if (result.error) return { blocked: true, reason: result.error.message }
  const rows = Array.isArray(result.data) ? result.data : (result.data ? [result.data] : [])
  if (rows.length === 0) return { blocked: true, reason: "no affected rows" }
  return { blocked: false, reason: `affected:${rows.length}` }
}

function makeFeaturePayload({ mapId, title, userId, userName, lat, lng }) {
  return {
    map_id: mapId,
    type: "pin",
    title,
    emoji: "\uD83D\uDCCD",
    lat,
    lng,
    points: null,
    tags: [],
    note: "event-collab-qa",
    highlight: false,
    created_by: userId,
    created_by_name: userName,
    updated_at: nowIso(),
  }
}

async function upsertCollaboratorRole(ownerClient, mapId, collaboratorId, ownerId, role) {
  await ownerClient
    .from("map_collaborators")
    .delete()
    .eq("map_id", mapId)
    .eq("user_id", collaboratorId)
  const inserted = await ownerClient
    .from("map_collaborators")
    .insert({
      map_id: mapId,
      user_id: collaboratorId,
      role,
      invited_by: ownerId,
    })
    .select("id, role")
  return ensureRows("collaborator insert", inserted)[0]
}

async function run() {
  const repoRoot = process.cwd()
  const env = {
    ...parseEnvFile(path.join(repoRoot, ".env")),
    ...parseEnvFile(path.join(repoRoot, ".env.local")),
    ...process.env,
  }

  const report = createQaReport()
  const supabaseUrl = env.VITE_SUPABASE_URL
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY")
  }

  const userA = await requireUser(supabaseUrl, supabaseAnonKey, env, "A", report)
  const userB = await requireUser(supabaseUrl, supabaseAnonKey, env, "B", report)

  const nonce = Date.now().toString(36).slice(-6)
  const mapRes = await userA.client
    .from("maps")
    .insert({
      user_id: userA.user.id,
      title: `QA Event ${nonce}`,
      description: "Event collab role QA",
      theme: "#FF6B35",
      visibility: "private",
      tags: ["qa", "event-collab"],
      category: "event",
      config: { qa: true, type: "event-collab-roles" },
    })
    .select("id,title,user_id,category")
  const mapRow = ensureRows("event map insert", mapRes)[0]
  report.context.mapId = mapRow.id
  report.context.mapTitle = mapRow.title

  const seedFeatureRes = await userA.client
    .from("map_features")
    .insert(makeFeaturePayload({
      mapId: mapRow.id,
      title: `QA-SEED-${nonce}`,
      userId: userA.user.id,
      userName: "QA-A",
      lat: 37.5665,
      lng: 126.9780,
    }))
    .select("id,title")
  const seedFeature = ensureRows("seed feature insert", seedFeatureRes)[0]
  report.context.seedFeatureId = seedFeature.id

  let editorRequestId = null
  let operatorFeatureId = null
  let ownerMemoId = null
  let viewerMemoId = null
  let editorMemoId = null
  let operatorMemoId = null

  const assertSuccess = async (name, fn) => {
    try {
      const detail = await fn()
      pushAssert(report, name, true, "success", detail || "ok")
    } catch (error) {
      pushAssert(report, name, false, "success", error.message)
    }
  }

  const assertFailure = async (name, fn) => {
    try {
      const detail = await fn()
      pushAssert(report, name, false, "failure", detail || "unexpected success")
    } catch (error) {
      pushAssert(report, name, true, "failure", error.message)
    }
  }

  await assertSuccess("owner can write seed event memo", async () => {
    const res = await userA.client
      .from("feature_memos")
      .insert({
        feature_id: seedFeature.id,
        user_id: userA.user.id,
        user_name: "QA-A",
        text: `owner-memo-${nonce}`,
      })
      .select("id")
    const row = ensureRows("owner memo insert", res)[0]
    ownerMemoId = row.id
    return row.id
  })

  // Viewer checks
  await assertSuccess("owner sets collaborator role=viewer", async () => {
    const row = await upsertCollaboratorRole(
      userA.client,
      mapRow.id,
      userB.user.id,
      userA.user.id,
      "viewer",
    )
    return row.id
  })

  await assertFailure("viewer direct feature insert is blocked", async () => {
    const res = await userB.client
      .from("map_features")
      .insert(makeFeaturePayload({
        mapId: mapRow.id,
        title: `VIEWER-TRY-${nonce}`,
        userId: userB.user.id,
        userName: "QA-B",
        lat: 37.5650,
        lng: 126.9790,
      }))
      .select("id,title")
    const blocked = isBlocked(res)
    if (blocked.blocked) throw new Error(blocked.reason)
    return `inserted:${res.data?.[0]?.id || "unknown"}`
  })

  await assertFailure("viewer direct feature update is blocked", async () => {
    const res = await userB.client
      .from("map_features")
      .update({ title: `VIEWER-HACK-${nonce}`, updated_at: nowIso() })
      .eq("id", seedFeature.id)
      .select("id,title")
    const blocked = isBlocked(res)
    if (blocked.blocked) throw new Error(blocked.reason)
    return `updated:${res.data?.[0]?.id || "unknown"}`
  })

  await assertFailure("viewer direct feature delete is blocked", async () => {
    const res = await userB.client
      .from("map_features")
      .delete()
      .eq("id", seedFeature.id)
      .select("id")
    const blocked = isBlocked(res)
    if (blocked.blocked) throw new Error(blocked.reason)
    return `deleted:${res.data?.[0]?.id || "unknown"}`
  })

  await assertFailure("viewer cannot create change request", async () => {
    const res = await userB.client
      .from("feature_change_requests")
      .insert({
        map_id: mapRow.id,
        feature_id: seedFeature.id,
        action: "update",
        payload: { title: "viewer-request" },
        requested_by: userB.user.id,
      })
      .select("id,status")
    const blocked = isBlocked(res)
    if (blocked.blocked) throw new Error(blocked.reason)
    return `request:${res.data?.[0]?.id || "unknown"}`
  })

  // Editor checks
  await assertSuccess("owner sets collaborator role=editor", async () => {
    const row = await upsertCollaboratorRole(
      userA.client,
      mapRow.id,
      userB.user.id,
      userA.user.id,
      "editor",
    )
    return row.id
  })

  await assertFailure("editor direct feature update is blocked", async () => {
    const res = await userB.client
      .from("map_features")
      .update({ title: `EDITOR-TRY-${nonce}`, updated_at: nowIso() })
      .eq("id", seedFeature.id)
      .select("id,title")
    const blocked = isBlocked(res)
    if (blocked.blocked) throw new Error(blocked.reason)
    return `updated:${res.data?.[0]?.id || "unknown"}`
  })

  await assertFailure("editor direct feature delete is blocked", async () => {
    const res = await userB.client
      .from("map_features")
      .delete()
      .eq("id", seedFeature.id)
      .select("id")
    const blocked = isBlocked(res)
    if (blocked.blocked) throw new Error(blocked.reason)
    return `deleted:${res.data?.[0]?.id || "unknown"}`
  })

  await assertSuccess("editor can create change request", async () => {
    const res = await userB.client
      .from("feature_change_requests")
      .insert({
        map_id: mapRow.id,
        feature_id: seedFeature.id,
        action: "update",
        payload: {
          type: "pin",
          title: `EDITOR-REQ-${nonce}`,
          note: "editor request",
        },
        requested_by: userB.user.id,
      })
      .select("id,status")
    const row = ensureRows("editor request insert", res)[0]
    editorRequestId = row.id
    report.context.editorRequestId = editorRequestId
    return row.id
  })

  await assertFailure("editor cannot review change request", async () => {
    if (!editorRequestId) throw new Error("missing request id")
    const res = await userB.client
      .from("feature_change_requests")
      .update({
        status: "approved",
        review_note: "editor should not approve",
        reviewed_by: userB.user.id,
        reviewed_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq("id", editorRequestId)
      .eq("status", "pending")
      .select("id,status")
    const blocked = isBlocked(res)
    if (blocked.blocked) throw new Error(blocked.reason)
    return `approved:${res.data?.[0]?.id || "unknown"}`
  })

  // Operator checks
  await assertSuccess("owner sets collaborator role=operator", async () => {
    const row = await upsertCollaboratorRole(
      userA.client,
      mapRow.id,
      userB.user.id,
      userA.user.id,
      "operator",
    )
    return row.id
  })

  await assertSuccess("operator direct feature insert is allowed", async () => {
    const res = await userB.client
      .from("map_features")
      .insert(makeFeaturePayload({
        mapId: mapRow.id,
        title: `OP-ADD-${nonce}`,
        userId: userB.user.id,
        userName: "QA-B",
        lat: 37.5649,
        lng: 126.9775,
      }))
      .select("id,title")
    const row = ensureRows("operator insert", res)[0]
    operatorFeatureId = row.id
    return row.id
  })

  await assertSuccess("operator direct feature update is allowed", async () => {
    const targetId = operatorFeatureId || seedFeature.id
    const res = await userB.client
      .from("map_features")
      .update({ title: `OP-EDIT-${nonce}`, updated_at: nowIso() })
      .eq("id", targetId)
      .select("id,title")
    const row = ensureRows("operator update", res)[0]
    return `${row.id}:${row.title}`
  })

  await assertSuccess("operator direct feature delete is allowed", async () => {
    if (!operatorFeatureId) throw new Error("missing operator feature")
    const res = await userB.client
      .from("map_features")
      .delete()
      .eq("id", operatorFeatureId)
      .select("id")
    const row = ensureRows("operator delete", res)[0]
    return row.id
  })

  await assertSuccess("operator can review editor request", async () => {
    if (!editorRequestId) throw new Error("missing request id")
    const res = await userB.client
      .from("feature_change_requests")
      .update({
        status: "approved",
        review_note: "approved by operator",
        reviewed_by: userB.user.id,
        reviewed_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq("id", editorRequestId)
      .eq("status", "pending")
      .select("id,status")
    const row = ensureRows("operator review", res)[0]
    return `${row.id}:${row.status}`
  })

  await assertSuccess("operator can upsert internal note via table RLS", async () => {
    const res = await userB.client
      .from("feature_operator_notes")
      .upsert({
        feature_id: seedFeature.id,
        map_id: mapRow.id,
        note: `operator-note-${nonce}`,
        updated_by: userB.user.id,
      }, { onConflict: "feature_id" })
      .select("feature_id,map_id,note")
    const row = ensureRows("operator note upsert", res)[0]
    return `${row.feature_id}`
  })

  await assertSuccess("operator RPC internal note upsert is allowed", async () => {
    const rpcRes = await userB.client.rpc("upsert_feature_operator_note", {
      p_feature_id: seedFeature.id,
      p_note: `rpc-note-${nonce}`,
    })
    if (rpcRes.error) throw rpcRes.error
    if (rpcRes.data?.success === false) {
      throw new Error(`rpc-returned-false:${rpcRes.data.error || "forbidden"}`)
    }
    return `rpc-success:${JSON.stringify(rpcRes.data)}`
  })

  // Event collaboration memo permission checks by role
  const assertMemoReadable = async (roleLabel) => {
    const res = await userB.client
      .from("feature_memos")
      .select("id,text,user_id")
      .eq("feature_id", seedFeature.id)
      .eq("status", "visible")
    if (res.error) throw res.error
    const rows = Array.isArray(res.data) ? res.data : []
    if (rows.length === 0) {
      throw new Error(`memo not visible for role:${roleLabel}`)
    }
    return `rows:${rows.length}`
  }

  const assertMemoWritable = async (roleLabel) => {
    const res = await userB.client
      .from("feature_memos")
      .insert({
        feature_id: seedFeature.id,
        user_id: userB.user.id,
        user_name: `QA-B-${roleLabel}`,
        text: `memo-${roleLabel}-${nonce}`,
      })
      .select("id,feature_id,user_id")
    const row = ensureRows(`memo insert as ${roleLabel}`, res)[0]
    return row.id
  }

  await assertSuccess("reset role to viewer for memo checks", async () => {
    const row = await upsertCollaboratorRole(
      userA.client,
      mapRow.id,
      userB.user.id,
      userA.user.id,
      "viewer",
    )
    return row.id
  })
  await assertSuccess("viewer can read event memos", async () => assertMemoReadable("viewer"))
  await assertSuccess("viewer can write event memo", async () => {
    viewerMemoId = await assertMemoWritable("viewer")
    return viewerMemoId
  })

  await assertSuccess("reset role to editor for memo checks", async () => {
    const row = await upsertCollaboratorRole(
      userA.client,
      mapRow.id,
      userB.user.id,
      userA.user.id,
      "editor",
    )
    return row.id
  })
  await assertSuccess("editor can read event memos", async () => assertMemoReadable("editor"))
  await assertSuccess("editor can write event memo", async () => {
    editorMemoId = await assertMemoWritable("editor")
    return editorMemoId
  })

  await assertSuccess("reset role to operator for memo checks", async () => {
    const row = await upsertCollaboratorRole(
      userA.client,
      mapRow.id,
      userB.user.id,
      userA.user.id,
      "operator",
    )
    return row.id
  })
  await assertSuccess("operator can read event memos", async () => assertMemoReadable("operator"))
  await assertSuccess("operator can write event memo", async () => {
    operatorMemoId = await assertMemoWritable("operator")
    return operatorMemoId
  })

  // Cleanup
  if (ownerMemoId) {
    await userA.client.from("feature_memos").delete().eq("id", ownerMemoId)
  }
  if (viewerMemoId) {
    await userA.client.from("feature_memos").delete().eq("id", viewerMemoId)
  }
  if (editorMemoId) {
    await userA.client.from("feature_memos").delete().eq("id", editorMemoId)
  }
  if (operatorMemoId) {
    await userA.client.from("feature_memos").delete().eq("id", operatorMemoId)
  }

  const mapCleanup = await userA.client
    .from("maps")
    .delete()
    .eq("id", mapRow.id)
    .select("id")
  if (mapCleanup.error) {
    report.notes.push(`cleanup map failed: ${mapCleanup.error.message}`)
  } else {
    report.notes.push("cleanup map success")
  }

  report.summary = summarize(report)
  report.endedAt = nowIso()

  const outDir = path.join(repoRoot, ".qa-artifacts")
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, `event-collab-roles-qa-${Date.now()}.json`)
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8")

  console.log(`QA_REPORT=${outFile}`)
  console.log(JSON.stringify(report.summary, null, 2))
  for (const item of report.checks) {
    const icon = item.pass ? "PASS" : "FAIL"
    console.log(`${icon} | ${item.name} | expected=${item.expected} | ${item.detail}`)
  }
  for (const note of report.notes) {
    console.log(`NOTE | ${note}`)
  }

  process.exit(report.summary.allPass ? 0 : 2)
}

run().catch((error) => {
  console.error(`QA_FATAL ${error.message}`)
  process.exit(1)
})
