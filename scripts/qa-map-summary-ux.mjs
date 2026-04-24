import fs from "node:fs"
import path from "node:path"
import { chromium } from "playwright"
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

function parseArg(name, fallback = "") {
  const token = `--${name}=`
  const hit = process.argv.find((arg) => arg.startsWith(token))
  if (!hit) return fallback
  return hit.slice(token.length)
}

function nowIso() {
  return new Date().toISOString()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForHttpReady(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  let lastError = ""
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "GET" })
      if (res.ok || res.status === 404) return
      lastError = `HTTP ${res.status}`
    } catch (error) {
      lastError = error?.message || "connection failed"
    }
    await sleep(800)
  }
  throw new Error(`App server is not ready at ${url} (${lastError})`)
}

function rowsFromResult(result) {
  if (result.error) throw new Error(result.error.message)
  if (Array.isArray(result.data)) return result.data
  return result.data ? [result.data] : []
}

function ensureReportDir(repoRoot) {
  const outDir = path.join(repoRoot, ".qa-artifacts")
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  return outDir
}

function createClientWithHeaders(url, anonKey, headerValue) {
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "x-loca-qa": headerValue,
      },
    },
  })
}

async function main() {
  const repoRoot = process.cwd()
  const env = {
    ...parseEnvFile(path.join(repoRoot, ".env")),
    ...parseEnvFile(path.join(repoRoot, ".env.local")),
    ...process.env,
  }

  const appUrl = parseArg("app-url", "http://127.0.0.1:4173")
  const supabaseUrl = env.VITE_SUPABASE_URL
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
  const userAEmail = env.LOCA_QA_USER_A_EMAIL
  const userAPassword = env.LOCA_QA_USER_A_PASSWORD

  if (!supabaseUrl || !supabaseAnonKey || !userAEmail || !userAPassword) {
    throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / LOCA_QA_USER_A_EMAIL / LOCA_QA_USER_A_PASSWORD are required.")
  }

  const report = {
    startedAt: nowIso(),
    env: { appUrl },
    setup: {},
    checks: [],
    ui: {},
    cleanup: {},
  }
  const pushCheck = (name, pass, detail = "") => {
    report.checks.push({ name, pass, detail })
  }

  const apiClient = createClientWithHeaders(supabaseUrl, supabaseAnonKey, "map-summary-ux-api")
  const browserClient = createClientWithHeaders(supabaseUrl, supabaseAnonKey, "map-summary-ux-browser")

  const auth = await apiClient.auth.signInWithPassword({
    email: userAEmail,
    password: userAPassword,
  })
  if (auth.error || !auth.data.user) {
    throw new Error(auth.error?.message || "user A sign in failed")
  }
  report.setup.userAId = auth.data.user.id

  const nonce = Date.now().toString(36).slice(-6)
  const localMapTitle = `QA UX Local ${nonce}`
  const localFeatureTitle = `LOCAL-${nonce}`
  const localFeatureNote = `local-note-${nonce}`
  const communityFeatureTitle = `COMM-${nonce}`

  let localMapId = null
  let localFeatureId = null
  let communityMapId = null
  let communityFeatureId = null
  let browser = null
  let page = null

  try {
    const localMapInsert = await apiClient
      .from("maps")
      .insert({
        user_id: auth.data.user.id,
        title: localMapTitle,
        description: "Map summary UX QA map",
        theme: "#FF6B35",
        visibility: "private",
        category: "personal",
        tags: ["qa", "map-summary-ux"],
        config: { qa: true, suite: "map-summary-ux" },
      })
      .select("id,title")
      .single()
    const localMap = rowsFromResult(localMapInsert)[0]
    localMapId = localMap.id
    report.setup.localMapId = localMapId

    const localFeatureInsert = await apiClient
      .from("map_features")
      .insert({
        map_id: localMapId,
        type: "pin",
        title: localFeatureTitle,
        emoji: "📍",
        lat: 37.5665,
        lng: 126.978,
        tags: [],
        note: localFeatureNote,
        highlight: false,
        created_by: auth.data.user.id,
        created_by_name: "QA-A",
        updated_at: nowIso(),
      })
      .select("id,title")
      .single()
    localFeatureId = rowsFromResult(localFeatureInsert)[0].id

    let communityMapRes = await apiClient
      .from("maps")
      .select("id,slug")
      .eq("slug", "community-map")
      .maybeSingle()
    if (communityMapRes.error) throw communityMapRes.error
    if (!communityMapRes.data) {
      const communityMapInsert = await apiClient
        .from("maps")
        .insert({
          user_id: auth.data.user.id,
          title: "모두의 지도",
          slug: "community-map",
          description: "community qa map",
          theme: "#2D4A3E",
          visibility: "public",
          category: "personal",
          tags: ["community"],
          config: { community: true },
        })
        .select("id,slug")
        .single()
      communityMapId = rowsFromResult(communityMapInsert)[0].id
    } else {
      communityMapId = communityMapRes.data.id
    }
    report.setup.communityMapId = communityMapId

    const communityFeatureInsert = await apiClient
      .from("map_features")
      .insert({
        map_id: communityMapId,
        type: "pin",
        title: communityFeatureTitle,
        emoji: "📍",
        lat: 37.5652,
        lng: 126.9774,
        tags: ["qa"],
        note: "",
        highlight: false,
        created_by: auth.data.user.id,
        created_by_name: "QA-A",
        updated_at: nowIso(),
      })
      .select("id,title")
      .single()
    communityFeatureId = rowsFromResult(communityFeatureInsert)[0].id
    pushCheck("setup map/features insert", true, "ok")

    await waitForHttpReady(appUrl)

    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ viewport: { width: 1280, height: 920 } })
    page = await context.newPage()
    page.setDefaultTimeout(45000)

    const ensureEditorOpen = async (targetMapTitle) => {
      const deadline = Date.now() + 100000
      let loggedIn = false
      let welcomeDismissed = false

      while (Date.now() < deadline) {
        const editorVisible = await page.locator(".map-editor").first().isVisible().catch(() => false)
        if (editorVisible) return

        const welcomeCta = page.locator(".welcome-screen__cta").first()
        if (!welcomeDismissed && await welcomeCta.isVisible().catch(() => false)) {
          await welcomeCta.click()
          welcomeDismissed = true
          await page.waitForTimeout(500)
          continue
        }

        const emailInput = page.locator("input[type='email']").first()
        if (!loggedIn && await emailInput.isVisible().catch(() => false)) {
          await emailInput.fill(userAEmail)
          await page.locator("input[type='password']").first().fill(userAPassword)
          await page.locator("button[type='submit']").first().click()
          loggedIn = true
          await page.waitForTimeout(1200)
          continue
        }

        if (targetMapTitle) {
          const mapsListCard = page.locator(".mc", { hasText: targetMapTitle }).first()
          if (await mapsListCard.isVisible().catch(() => false)) {
            await mapsListCard.click()
            await page.waitForTimeout(800)
            continue
          }
        }

        const mapsNav = page.locator(".bottom-nav__item[aria-label='지도']").first()
        if (await mapsNav.isVisible().catch(() => false)) {
          await mapsNav.click()
        }
        await page.waitForTimeout(700)
      }

      throw new Error("map editor not visible after login/navigation")
    }

    const dismissCoachmarks = async () => {
      for (let i = 0; i < 5; i += 1) {
        const overlay = page.locator(".coachmark-overlay").first()
        const visible = await overlay.isVisible().catch(() => false)
        if (!visible) break
        await overlay.click({ force: true })
        await page.waitForTimeout(250)
      }
    }

    // Local map UX checks
    await page.goto(`${appUrl}/map/${encodeURIComponent(localMapId)}`, { waitUntil: "domcontentloaded" })
    await ensureEditorOpen(localMapTitle)
    await dismissCoachmarks()

    const localFabVisibleBefore = await page.locator(".me-fabs").first().isVisible().catch(() => false)
    pushCheck("local: fabs visible before select", localFabVisibleBefore, `${localFabVisibleBefore}`)

    await page.locator(".map-list-bar .map-filter-toggle").first().click()
    await page.locator(".map-place-strip .map-place-card", { hasText: localFeatureTitle }).first().click()
    await page.locator(".map-feature-summary").first().waitFor({ state: "visible" })

    const localSummaryOpenClass = await page.locator(".map-editor").first().evaluate((el) => el.classList.contains("map-editor--summary-open"))
    const localFabVisibleAfter = await page.locator(".me-fabs").first().isVisible().catch(() => false)
    const localTopDetailCount = await page.locator(".map-feature-summary__head-action", { hasText: "상세보기" }).count()
    const localBottomActionCount = await page.locator(".map-feature-summary__action").count()
    const localPreviewCount = await page.locator(".map-feature-summary__preview").count()
    const localPreviewText = await page.locator(".map-feature-summary__preview-note").first().textContent().catch(() => "")

    pushCheck("local: summary-open class", localSummaryOpenClass === true, `${localSummaryOpenClass}`)
    pushCheck("local: fabs hidden after select", localFabVisibleAfter === false, `${localFabVisibleAfter}`)
    pushCheck("local: top detail button shown", localTopDetailCount > 0, `count=${localTopDetailCount}`)
    pushCheck("local: bottom detail button removed", localBottomActionCount === 0, `count=${localBottomActionCount}`)
    pushCheck("local: preview section shown", localPreviewCount > 0, `count=${localPreviewCount}`)
    pushCheck(
      "local: preview note shown",
      typeof localPreviewText === "string" && localPreviewText.includes(localFeatureNote),
      `${localPreviewText || ""}`,
    )

    const outDir = ensureReportDir(repoRoot)
    const localShot = path.join(outDir, `map-summary-ux-local-${Date.now()}.png`)
    await page.screenshot({ path: localShot, fullPage: true })
    report.ui.localScreenshot = localShot

    // Community map UX checks
    await page.goto(`${appUrl}/map/community-map`, { waitUntil: "domcontentloaded" })
    await ensureEditorOpen("")
    await dismissCoachmarks()
    await page.waitForTimeout(1800)

    const communityFabVisibleBefore = await page.locator(".me-fabs").first().isVisible().catch(() => false)
    pushCheck("community: fabs visible before select", communityFabVisibleBefore, `${communityFabVisibleBefore}`)

    await page.locator(".map-list-bar .map-filter-toggle").first().click()
    await page.locator(".map-place-strip .map-place-card", { hasText: communityFeatureTitle }).first().click()
    await page.locator(".map-feature-summary").first().waitFor({ state: "visible" })

    const communitySummaryOpenClass = await page.locator(".map-editor").first().evaluate((el) => el.classList.contains("map-editor--summary-open"))
    const communityFabVisibleAfter = await page.locator(".me-fabs").first().isVisible().catch(() => false)
    const communityEditCount = await page.locator(".map-feature-summary__head-action", { hasText: "수정" }).count()
    const communityTopDetailCount = await page.locator(".map-feature-summary__head-action", { hasText: "상세보기" }).count()

    pushCheck("community: summary-open class", communitySummaryOpenClass === true, `${communitySummaryOpenClass}`)
    pushCheck("community: fabs hidden after select", communityFabVisibleAfter === false, `${communityFabVisibleAfter}`)
    pushCheck("community: own feature edit shown", communityEditCount > 0, `count=${communityEditCount}`)
    pushCheck("community: top detail hidden", communityTopDetailCount === 0, `count=${communityTopDetailCount}`)

    const communityShot = path.join(outDir, `map-summary-ux-community-${Date.now()}.png`)
    await page.screenshot({ path: communityShot, fullPage: true })
    report.ui.communityScreenshot = communityShot

    await context.close()
    page = null
  } finally {
    if (browser && page) {
      try {
        const outDir = ensureReportDir(repoRoot)
        const debugPath = path.join(outDir, `map-summary-ux-debug-${Date.now()}.png`)
        await page.screenshot({ path: debugPath, fullPage: true })
        report.ui.debugScreenshot = debugPath
      } catch {
        // noop
      }
    }

    if (browser) {
      try {
        await browser.close()
      } catch {
        // noop
      }
    }

    if (communityFeatureId) {
      const cleanupCommunityFeature = await apiClient
        .from("map_features")
        .delete()
        .eq("id", communityFeatureId)
        .select("id")
      report.cleanup.communityFeatureDeleteError = cleanupCommunityFeature.error?.message || ""
    }

    if (localMapId) {
      const cleanupLocalMap = await apiClient
        .from("maps")
        .delete()
        .eq("id", localMapId)
        .select("id")
      report.cleanup.localMapDeleteError = cleanupLocalMap.error?.message || ""
    }
  }

  report.endedAt = nowIso()
  const passCount = report.checks.filter((item) => item.pass).length
  const total = report.checks.length
  report.summary = {
    passCount,
    total,
    allPass: passCount === total,
  }

  const outDir = ensureReportDir(repoRoot)
  const outFile = path.join(outDir, `map-summary-ux-${Date.now()}.json`)
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8")

  console.log(`QA_UX_REPORT=${outFile}`)
  console.log(JSON.stringify(report.summary, null, 2))
  for (const item of report.checks) {
    console.log(`${item.pass ? "PASS" : "FAIL"} | ${item.name} | ${item.detail}`)
  }
  if (report.cleanup.communityFeatureDeleteError) {
    console.log(`NOTE | cleanup community feature failed: ${report.cleanup.communityFeatureDeleteError}`)
  }
  if (report.cleanup.localMapDeleteError) {
    console.log(`NOTE | cleanup local map failed: ${report.cleanup.localMapDeleteError}`)
  }

  process.exit(report.summary.allPass ? 0 : 2)
}

main().catch((error) => {
  console.error(`QA_UX_FATAL ${error.message}`)
  process.exit(1)
})
