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

function createReport() {
  return {
    startedAt: nowIso(),
    env: {},
    auth: {},
    context: {},
    checks: [],
    notes: [],
  }
}

function pushCheck(report, name, pass, expected, detail = "") {
  report.checks.push({ name, pass, expected, detail })
}

function summarize(report) {
  const passCount = report.checks.filter((item) => item.pass).length
  const total = report.checks.length
  return {
    passCount,
    total,
    allPass: passCount === total,
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
        "x-loca-qa": "feature-style",
      },
    },
  })
}

async function loginWithPassword(url, anonKey, email, password) {
  const client = buildClient(url, anonKey)
  const loginRes = await client.auth.signInWithPassword({ email, password })
  if (loginRes.error || !loginRes.data.session || !loginRes.data.user) {
    throw new Error(loginRes.error?.message || "failed to create session")
  }
  return {
    client,
    user: loginRes.data.user,
    email,
  }
}

async function requireQaUser(url, anonKey, env, label, report) {
  const email = env[`LOCA_QA_USER_${label}_EMAIL`]
  const password = env[`LOCA_QA_USER_${label}_PASSWORD`]
  if (!email || !password) {
    throw new Error(`missing LOCA_QA_USER_${label}_EMAIL / LOCA_QA_USER_${label}_PASSWORD`)
  }
  const auth = await loginWithPassword(url, anonKey, email, password)
  report.auth[label.toLowerCase()] = {
    email: auth.email,
    userId: auth.user.id,
  }
  return auth
}

function rowsFromResult(result) {
  if (result.error) {
    throw new Error(result.error.message)
  }
  if (Array.isArray(result.data)) return result.data
  return result.data ? [result.data] : []
}

function isBlockedResult(result) {
  if (result.error) return { blocked: true, reason: result.error.message }
  const rows = rowsFromResult(result)
  if (rows.length === 0) return { blocked: true, reason: "no affected rows" }
  return { blocked: false, reason: `affected:${rows.length}` }
}

function styleMatches(actual, expected) {
  if (!actual || typeof actual !== "object") return false
  return Object.entries(expected).every(([key, value]) => actual[key] === value)
}

async function run() {
  const repoRoot = process.cwd()
  const env = {
    ...parseEnvFile(path.join(repoRoot, ".env")),
    ...parseEnvFile(path.join(repoRoot, ".env.local")),
    ...process.env,
  }
  const report = createReport()

  const supabaseUrl = env.VITE_SUPABASE_URL
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY")
  }

  const userA = await requireQaUser(supabaseUrl, supabaseAnonKey, env, "A", report)
  const userB = await requireQaUser(supabaseUrl, supabaseAnonKey, env, "B", report)

  // Preflight: the PostgREST schema cache must expose map_features.style.
  const preflight = await userA.client
    .from("map_features")
    .select("id,style")
    .limit(1)
  if (preflight.error) {
    throw new Error(
      `style preflight failed: ${preflight.error.message}. `
      + "Apply 030_feature_style_customization.sql and run NOTIFY pgrst, 'reload schema'.",
    )
  }

  const nonce = Date.now().toString(36).slice(-6)
  let qaMapId = null
  let pinId = null
  let routeId = null
  let areaId = null

  const expectSuccess = async (name, fn) => {
    try {
      const detail = await fn()
      pushCheck(report, name, true, "success", `${detail || "ok"}`)
    } catch (error) {
      pushCheck(report, name, false, "success", error.message)
    }
  }

  const expectBlocked = async (name, fn) => {
    try {
      const result = await fn()
      const blocked = isBlockedResult(result)
      if (blocked.blocked) {
        pushCheck(report, name, true, "blocked", blocked.reason)
      } else {
        pushCheck(report, name, false, "blocked", blocked.reason)
      }
    } catch (error) {
      pushCheck(report, name, true, "blocked", error.message)
    }
  }

  await expectSuccess("owner creates QA map", async () => {
    const mapRes = await userA.client
      .from("maps")
      .insert({
        user_id: userA.user.id,
        title: `QA Feature Style ${nonce}`,
        description: "Feature style persistence QA",
        theme: "#FF6B35",
        visibility: "private",
        category: "personal",
        tags: ["qa", "feature-style"],
        config: { qa: true, suite: "feature-style" },
      })
      .select("id,title")
      .single()

    const row = rowsFromResult(mapRes)[0]
    qaMapId = row.id
    report.context.mapId = qaMapId
    return `${row.id}:${row.title}`
  })

  await expectSuccess("owner inserts pin style", async () => {
    if (!qaMapId) throw new Error("qaMapId missing")
    const pinRes = await userA.client
      .from("map_features")
      .insert({
        map_id: qaMapId,
        type: "pin",
        title: `PIN-${nonce}`,
        emoji: "📍",
        lat: 37.5665,
        lng: 126.978,
        style: { color: "#3B82F6" },
        tags: [],
        note: "pin style qa",
        highlight: false,
        created_by: userA.user.id,
        created_by_name: "QA-A",
        updated_at: nowIso(),
      })
      .select("id,type,style")
      .single()

    const row = rowsFromResult(pinRes)[0]
    if (!styleMatches(row.style, { color: "#3B82F6" })) {
      throw new Error(`unexpected pin style:${JSON.stringify(row.style)}`)
    }
    pinId = row.id
    return pinId
  })

  await expectSuccess("owner inserts route style", async () => {
    if (!qaMapId) throw new Error("qaMapId missing")
    const routeRes = await userA.client
      .from("map_features")
      .insert({
        map_id: qaMapId,
        type: "route",
        title: `ROUTE-${nonce}`,
        points: [
          { lat: 37.5665, lng: 126.978 },
          { lat: 37.5672, lng: 126.9792 },
          { lat: 37.5679, lng: 126.9801 },
        ],
        style: { color: "#16A34A", lineStyle: "shortdash" },
        tags: [],
        note: "route style qa",
        highlight: false,
        created_by: userA.user.id,
        created_by_name: "QA-A",
        updated_at: nowIso(),
      })
      .select("id,type,style")
      .single()

    const row = rowsFromResult(routeRes)[0]
    if (!styleMatches(row.style, { color: "#16A34A", lineStyle: "shortdash" })) {
      throw new Error(`unexpected route style:${JSON.stringify(row.style)}`)
    }
    routeId = row.id
    return routeId
  })

  await expectSuccess("owner inserts area style", async () => {
    if (!qaMapId) throw new Error("qaMapId missing")
    const areaRes = await userA.client
      .from("map_features")
      .insert({
        map_id: qaMapId,
        type: "area",
        title: `AREA-${nonce}`,
        points: [
          { lat: 37.5658, lng: 126.9771 },
          { lat: 37.5663, lng: 126.9787 },
          { lat: 37.5651, lng: 126.9793 },
        ],
        style: { color: "#F97316", lineStyle: "shortdot" },
        tags: [],
        note: "area style qa",
        highlight: false,
        created_by: userA.user.id,
        created_by_name: "QA-A",
        updated_at: nowIso(),
      })
      .select("id,type,style")
      .single()

    const row = rowsFromResult(areaRes)[0]
    if (!styleMatches(row.style, { color: "#F97316", lineStyle: "shortdot" })) {
      throw new Error(`unexpected area style:${JSON.stringify(row.style)}`)
    }
    areaId = row.id
    return areaId
  })

  await expectSuccess("owner can read saved styles", async () => {
    const ids = [pinId, routeId, areaId].filter(Boolean)
    if (ids.length !== 3) throw new Error("feature ids missing")

    const readRes = await userA.client
      .from("map_features")
      .select("id,type,style")
      .in("id", ids)

    const rows = rowsFromResult(readRes)
    if (rows.length !== 3) throw new Error(`expected 3 rows, got ${rows.length}`)

    const byType = Object.fromEntries(rows.map((row) => [row.type, row.style || {}]))
    if (!styleMatches(byType.pin, { color: "#3B82F6" })) {
      throw new Error(`pin style mismatch:${JSON.stringify(byType.pin)}`)
    }
    if (!styleMatches(byType.route, { color: "#16A34A", lineStyle: "shortdash" })) {
      throw new Error(`route style mismatch:${JSON.stringify(byType.route)}`)
    }
    if (!styleMatches(byType.area, { color: "#F97316", lineStyle: "shortdot" })) {
      throw new Error(`area style mismatch:${JSON.stringify(byType.area)}`)
    }
    return "style persisted"
  })

  await expectSuccess("owner updates route style", async () => {
    if (!routeId) throw new Error("routeId missing")
    const updateRes = await userA.client
      .from("map_features")
      .update({
        style: {
          color: "#22C55E",
          lineStyle: "solid",
        },
        updated_at: nowIso(),
      })
      .eq("id", routeId)
      .select("id,style")
      .single()

    const row = rowsFromResult(updateRes)[0]
    if (!styleMatches(row.style, { color: "#22C55E", lineStyle: "solid" })) {
      throw new Error(`route style update mismatch:${JSON.stringify(row.style)}`)
    }
    return row.id
  })

  await expectBlocked("non-owner cannot update owner feature style", async () => (
    userB.client
      .from("map_features")
      .update({
        style: { color: "#111111", lineStyle: "shortdot" },
        updated_at: nowIso(),
      })
      .eq("id", routeId)
      .select("id,style")
  ))

  if (qaMapId) {
    const cleanupMap = await userA.client
      .from("maps")
      .delete()
      .eq("id", qaMapId)
      .select("id")
    if (cleanupMap.error) {
      report.notes.push(`cleanup map failed: ${cleanupMap.error.message}`)
    } else {
      report.notes.push("cleanup map success")
    }
  }

  report.summary = summarize(report)
  report.endedAt = nowIso()

  const outDir = path.join(repoRoot, ".qa-artifacts")
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, `feature-style-qa-${Date.now()}.json`)
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8")

  console.log(`QA_REPORT=${outFile}`)
  console.log(JSON.stringify(report.summary, null, 2))
  for (const item of report.checks) {
    console.log(`${item.pass ? "PASS" : "FAIL"} | ${item.name} | expected=${item.expected} | ${item.detail}`)
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
