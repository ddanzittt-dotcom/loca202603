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

function maskedEmail(email) {
  const [name, domain] = `${email || ""}`.split("@")
  if (!name || !domain) return email || "(empty)"
  if (name.length <= 2) return `${name[0] || "*"}*@${domain}`
  return `${name[0]}***${name[name.length - 1]}@${domain}`
}

function loadEnv() {
  const root = process.cwd()
  return {
    ...parseEnvFile(path.join(root, ".env")),
    ...parseEnvFile(path.join(root, ".env.local")),
    ...process.env,
  }
}

function getRequiredConfig(env) {
  return {
    supabaseUrl: env.VITE_SUPABASE_URL || "",
    supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY || "",
    userAEmail: env.LOCA_QA_USER_A_EMAIL || "",
    userAPassword: env.LOCA_QA_USER_A_PASSWORD || "",
    userBEmail: env.LOCA_QA_USER_B_EMAIL || "",
    userBPassword: env.LOCA_QA_USER_B_PASSWORD || "",
  }
}

function validatePresence(config) {
  const missing = []
  if (!config.supabaseUrl) missing.push("VITE_SUPABASE_URL")
  if (!config.supabaseAnonKey) missing.push("VITE_SUPABASE_ANON_KEY")
  if (!config.userAEmail) missing.push("LOCA_QA_USER_A_EMAIL")
  if (!config.userAPassword) missing.push("LOCA_QA_USER_A_PASSWORD")
  if (!config.userBEmail) missing.push("LOCA_QA_USER_B_EMAIL")
  if (!config.userBPassword) missing.push("LOCA_QA_USER_B_PASSWORD")
  return missing
}

async function checkLogin(supabaseUrl, supabaseAnonKey, email, password) {
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "x-loca-qa": "event-collab-preflight",
      },
    },
  })

  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data?.user || !data?.session) {
    const message = error?.message || "로그인 세션을 만들지 못했어요."
    if (message.toLowerCase().includes("email not confirmed")) {
      throw new Error(`${message} (QA 계정 이메일 확인이 필요합니다)`)
    }
    throw new Error(message)
  }
  return { userId: data.user.id, email: data.user.email || email }
}

async function main() {
  const env = loadEnv()
  const config = getRequiredConfig(env)
  const missing = validatePresence(config)

  console.log("== LOCA Event Collab QA Preflight ==")
  console.log(`- Supabase URL: ${config.supabaseUrl ? "OK" : "MISSING"}`)
  console.log(`- QA User A: ${config.userAEmail ? maskedEmail(config.userAEmail) : "MISSING"}`)
  console.log(`- QA User B: ${config.userBEmail ? maskedEmail(config.userBEmail) : "MISSING"}`)

  if (missing.length > 0) {
    console.error("")
    console.error("PRECHECK_FAILED: 아래 환경변수가 비어 있습니다.")
    missing.forEach((key) => console.error(`- ${key}`))
    process.exit(1)
  }

  try {
    const userA = await checkLogin(
      config.supabaseUrl,
      config.supabaseAnonKey,
      config.userAEmail,
      config.userAPassword,
    )
    const userB = await checkLogin(
      config.supabaseUrl,
      config.supabaseAnonKey,
      config.userBEmail,
      config.userBPassword,
    )

    console.log("")
    console.log("PRECHECK_OK")
    console.log(`- User A login: ${maskedEmail(userA.email)} (${userA.userId})`)
    console.log(`- User B login: ${maskedEmail(userB.email)} (${userB.userId})`)
    console.log("- 다음 단계: npm run qa:event-collab-roles")
  } catch (error) {
    console.error("")
    console.error("PRECHECK_FAILED: QA 계정 로그인 검증 실패")
    console.error(`- ${error.message}`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error("PRECHECK_FATAL", error?.message || error)
  process.exit(1)
})
