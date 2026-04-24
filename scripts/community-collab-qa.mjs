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
    checks: [],
    notes: [],
  }
}

function pushCheck(report, name, pass, expected, detail = "") {
  report.checks.push({ name, pass, expected, detail })
}

function summary(report) {
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
        "x-loca-qa": "community-collab",
      },
    },
  })
}

async function loginWithPassword(url, anonKey, email, password) {
  const client = buildClient(url, anonKey)
  const loginRes = await client.auth.signInWithPassword({ email, password })
  if (loginRes.error || !loginRes.data.session || !loginRes.data.user) {
    throw new Error(loginRes.error?.message || "로그인 세션을 만들지 못했습니다.")
  }
  return { client, user: loginRes.data.user, method: "password", email }
}

async function createTempUser(url, anonKey, label) {
  const client = buildClient(url, anonKey)
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
  const email = `locaqa${label}${nonce}@gmail.com`
  const password = `Loca!${nonce}Aa1`

  const signUpRes = await client.auth.signUp({ email, password })
  if (signUpRes.error) {
    throw new Error(`임시 계정 생성 실패(${label}): ${signUpRes.error.message}`)
  }

  if (signUpRes.data.session && signUpRes.data.user) {
    return { client, user: signUpRes.data.user, method: "signup-session", email }
  }

  const loginRes = await client.auth.signInWithPassword({ email, password })
  if (loginRes.error || !loginRes.data.session || !loginRes.data.user) {
    throw new Error(
      `임시 계정 세션 실패(${label}): ${loginRes.error?.message || "email confirmation required"}`,
    )
  }
  return { client, user: loginRes.data.user, method: "signup+signin", email }
}

async function ensureUser(url, anonKey, label, report, env) {
  const email = env[`LOCA_QA_USER_${label}_EMAIL`]
  const password = env[`LOCA_QA_USER_${label}_PASSWORD`]
  if (email && password) {
    const loggedIn = await loginWithPassword(url, anonKey, email, password)
    report.auth[label.toLowerCase()] = {
      method: loggedIn.method,
      userId: loggedIn.user.id,
      email: loggedIn.email,
    }
    return loggedIn
  }

  if (env.LOCA_QA_ALLOW_SIGNUP === "1") {
    const temp = await createTempUser(url, anonKey, label.toLowerCase())
    report.auth[label.toLowerCase()] = {
      method: temp.method,
      userId: temp.user.id,
      email: temp.email,
    }
    return temp
  }

  throw new Error(
    `사용자 ${label} 자격이 없습니다. `
      + `LOCA_QA_USER_${label}_EMAIL / LOCA_QA_USER_${label}_PASSWORD를 설정하거나 `
      + `LOCA_QA_ALLOW_SIGNUP=1 을 사용하세요.`,
  )
}

async function ensureCommunityMap(clientA, userA, report, env) {
  const existing = await clientA
    .from("maps")
    .select("id,user_id,slug,visibility,title")
    .eq("slug", "community-map")
    .maybeSingle()

  if (existing.error) {
    throw new Error(`community-map 조회 실패: ${existing.error.message}`)
  }
  if (existing.data) {
    pushCheck(report, "community-map 조회(A)", true, "success", `existing:${existing.data.id}`)
    return existing.data
  }

  if (env.LOCA_QA_ALLOW_CREATE_COMMUNITY !== "1") {
    throw new Error(
      "community-map이 없습니다. 생성 허용이 꺼져 있습니다. "
        + "LOCA_QA_ALLOW_CREATE_COMMUNITY=1 설정 후 재시도하세요.",
    )
  }

  const created = await clientA
    .from("maps")
    .insert({
      user_id: userA.id,
      title: "모두의 지도",
      description: "모두가 함께 만드는 지도",
      theme: "#4F46E5",
      visibility: "public",
      slug: "community-map",
      tags: ["community"],
      category: "personal",
      config: { community: true },
      is_published: true,
      published_at: nowIso(),
    })
    .select("id,user_id,slug,visibility,title")
    .single()

  if (created.error || !created.data) {
    throw new Error(`community-map 생성 실패: ${created.error?.message || "unknown"}`)
  }
  pushCheck(report, "community-map 생성(A)", true, "success", created.data.id)
  return created.data
}

async function run() {
  const repoRoot = process.cwd()
  const envFile = path.join(repoRoot, ".env.local")
  const fileEnv = parseEnvFile(envFile)
  const env = { ...fileEnv, ...process.env }

  const report = createReport()
  report.env.allowSignup = env.LOCA_QA_ALLOW_SIGNUP === "1"
  report.env.allowCreateCommunity = env.LOCA_QA_ALLOW_CREATE_COMMUNITY === "1"

  const supabaseUrl = env.VITE_SUPABASE_URL
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY가 필요합니다.")
  }

  const userA = await ensureUser(supabaseUrl, supabaseAnonKey, "A", report, env)
  const userB = await ensureUser(supabaseUrl, supabaseAnonKey, "B", report, env)

  const communityMap = await ensureCommunityMap(userA.client, userA.user, report, env)
  const mapId = communityMap.id
  const nonce = Date.now().toString(36).slice(-6)

  let featureA = null
  let featureB = null

  async function expectSuccess(name, fn) {
    try {
      const value = await fn()
      pushCheck(report, name, true, "success", `${value || "ok"}`)
      return { ok: true, value }
    } catch (error) {
      pushCheck(report, name, false, "success", error.message)
      return { ok: false, error }
    }
  }

  async function expectFailure(name, fn) {
    try {
      const value = await fn()
      pushCheck(report, name, false, "failure", `unexpected success: ${value || "ok"}`)
      return { ok: false, value }
    } catch (error) {
      pushCheck(report, name, true, "failure", error.message)
      return { ok: true }
    }
  }

  await expectSuccess("A가 community feature 추가", async () => {
    const res = await userA.client
      .from("map_features")
      .insert({
        map_id: mapId,
        type: "pin",
        title: `QA-A-${nonce}`,
        emoji: "📍",
        lat: 37.5665,
        lng: 126.978,
        points: null,
        tags: [],
        note: "qa from user A",
        highlight: false,
        created_by: userA.user.id,
        created_by_name: "QA-A",
        updated_at: nowIso(),
      })
      .select("id,map_id,title,created_by")
      .single()
    if (res.error || !res.data) {
      throw new Error(res.error?.message || "insert failed")
    }
    featureA = res.data
    return res.data.id
  })

  await expectSuccess("B가 A feature 조회 가능", async () => {
    if (!featureA?.id) throw new Error("featureA missing")
    const res = await userB.client
      .from("map_features")
      .select("id,title,created_by,map_id")
      .eq("id", featureA.id)
      .maybeSingle()
    if (res.error) throw new Error(res.error.message)
    if (!res.data) throw new Error("not found")
    return res.data.id
  })

  await expectFailure("B가 A feature 수정 시도(권한 거부 기대)", async () => {
    if (!featureA?.id) throw new Error("featureA missing")
    const res = await userB.client
      .from("map_features")
      .update({ title: `HACK-${nonce}`, updated_at: nowIso() })
      .eq("id", featureA.id)
      .select("id,title")
      .single()
    if (res.error) throw new Error(res.error.message)
    return res.data?.id || "updated"
  })

  await expectFailure("B가 A feature 삭제 시도(권한 거부 기대)", async () => {
    if (!featureA?.id) throw new Error("featureA missing")
    const res = await userB.client
      .from("map_features")
      .delete()
      .eq("id", featureA.id)
      .select("id")
      .single()
    if (res.error) throw new Error(res.error.message)
    return res.data?.id || "deleted"
  })

  await expectSuccess("B가 community feature 추가", async () => {
    const res = await userB.client
      .from("map_features")
      .insert({
        map_id: mapId,
        type: "pin",
        title: `QA-B-${nonce}`,
        emoji: "📍",
        lat: 37.5651,
        lng: 126.9895,
        points: null,
        tags: [],
        note: "qa from user B",
        highlight: false,
        created_by: userB.user.id,
        created_by_name: "QA-B",
        updated_at: nowIso(),
      })
      .select("id,map_id,title,created_by")
      .single()
    if (res.error || !res.data) {
      throw new Error(res.error?.message || "insert failed")
    }
    featureB = res.data
    return res.data.id
  })

  await expectSuccess("B가 본인 feature 수정", async () => {
    if (!featureB?.id) throw new Error("featureB missing")
    const res = await userB.client
      .from("map_features")
      .update({ title: `QA-B-EDIT-${nonce}`, updated_at: nowIso() })
      .eq("id", featureB.id)
      .select("id,title")
      .single()
    if (res.error || !res.data) {
      throw new Error(res.error?.message || "update failed")
    }
    return res.data.title
  })

  await expectSuccess("B가 본인 feature 삭제", async () => {
    if (!featureB?.id) throw new Error("featureB missing")
    const res = await userB.client
      .from("map_features")
      .delete()
      .eq("id", featureB.id)
      .select("id")
      .single()
    if (res.error || !res.data) {
      throw new Error(res.error?.message || "delete failed")
    }
    return res.data.id
  })

  await expectSuccess("B가 A feature에 댓글(메모) 작성", async () => {
    if (!featureA?.id) throw new Error("featureA missing")
    const res = await userB.client
      .from("feature_memos")
      .insert({
        feature_id: featureA.id,
        user_id: userB.user.id,
        user_name: "QA-B",
        text: `memo-${nonce}`,
      })
      .select("id,feature_id,user_id")
      .single()
    if (res.error || !res.data) {
      throw new Error(res.error?.message || "memo insert failed")
    }
    return res.data.id
  })

  if (featureA?.id) {
    const cleanup = await userA.client.from("map_features").delete().eq("id", featureA.id)
    report.notes.push(cleanup.error ? `cleanup A 실패: ${cleanup.error.message}` : "cleanup A 성공")
  }

  report.summary = summary(report)
  report.endedAt = nowIso()

  const outDir = path.join(repoRoot, ".qa-artifacts")
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, `community-collab-qa-${Date.now()}.json`)
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8")

  console.log(`QA_REPORT=${outFile}`)
  console.log(JSON.stringify(report.summary, null, 2))
  for (const item of report.checks) {
    console.log(`${item.pass ? "PASS" : "FAIL"} | ${item.name} | expected=${item.expected} | ${item.detail}`)
  }
  for (const note of report.notes) console.log(`NOTE | ${note}`)

  process.exit(report.summary.allPass ? 0 : 2)
}

run().catch((error) => {
  console.error(`QA_FATAL ${error.message}`)
  process.exit(1)
})

