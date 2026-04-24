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
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
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
    env: {
      appUrl,
    },
    setup: {},
    checks: [],
    ui: {},
    cleanup: {},
  }

  const apiClient = createClientWithHeaders(supabaseUrl, supabaseAnonKey, "feature-style-ui-api")
  const browserClient = createClientWithHeaders(supabaseUrl, supabaseAnonKey, "feature-style-ui-browser")

  const auth = await apiClient.auth.signInWithPassword({
    email: userAEmail,
    password: userAPassword,
  })
  if (auth.error || !auth.data.user) {
    throw new Error(auth.error?.message || "user A sign in failed")
  }
  report.setup.userAId = auth.data.user.id

  const nonce = Date.now().toString(36).slice(-6)
  const mapTitle = `QA Style UI ${nonce}`
  const featurePinTitle = `PIN-${nonce}`
  const featureRouteTitle = `ROUTE-${nonce}`
  const featureAreaTitle = `AREA-${nonce}`

  let mapId = null
  let browser = null
  let page = null

  const pushCheck = (name, pass, detail = "") => {
    report.checks.push({ name, pass, detail })
  }

  try {
    const mapInsert = await apiClient
      .from("maps")
      .insert({
        user_id: auth.data.user.id,
        title: mapTitle,
        description: "Feature style UI smoke test map",
        theme: "#FF6B35",
        visibility: "private",
        category: "personal",
        tags: ["qa", "feature-style-ui"],
        config: { qa: true, suite: "feature-style-ui" },
      })
      .select("id,title")
      .single()
    const mapRow = rowsFromResult(mapInsert)[0]
    mapId = mapRow.id
    report.setup.mapId = mapId

    const featureInsert = await apiClient
      .from("map_features")
      .insert([
        {
          map_id: mapId,
          type: "pin",
          title: featurePinTitle,
          emoji: "📍",
          lat: 37.5665,
          lng: 126.978,
          style: { color: "#2F80ED", lineStyle: "solid" },
          tags: [],
          note: "pin style ui qa",
          highlight: false,
          created_by: auth.data.user.id,
          created_by_name: "QA-A",
          updated_at: nowIso(),
        },
        {
          map_id: mapId,
          type: "route",
          title: featureRouteTitle,
          points: [
            [126.978, 37.5665],
            [126.979, 37.5672],
            [126.9802, 37.5678],
          ],
          style: { color: "#E24B4A", lineStyle: "shortdash" },
          tags: [],
          note: "route style ui qa",
          highlight: false,
          created_by: auth.data.user.id,
          created_by_name: "QA-A",
          updated_at: nowIso(),
        },
        {
          map_id: mapId,
          type: "area",
          title: featureAreaTitle,
          points: [
            [126.9773, 37.5656],
            [126.9791, 37.5662],
            [126.9784, 37.5649],
          ],
          style: { color: "#8B5CF6", lineStyle: "shortdot" },
          tags: [],
          note: "area style ui qa",
          highlight: false,
          created_by: auth.data.user.id,
          created_by_name: "QA-A",
          updated_at: nowIso(),
        },
      ])
      .select("id,type,title")
    rowsFromResult(featureInsert)
    pushCheck("setup map/features insert", true, "ok")

    await waitForHttpReady(appUrl)

    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ viewport: { width: 1280, height: 920 } })
    page = await context.newPage()
    page.setDefaultTimeout(40000)

    await page.goto(`${appUrl}/map/${encodeURIComponent(mapId)}`, { waitUntil: "domcontentloaded" })

    const ensureEditorOpen = async () => {
      const deadline = Date.now() + 90000
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

        const mapsListCard = page.locator(".mc", { hasText: mapTitle }).first()
        if (await mapsListCard.isVisible().catch(() => false)) {
          await mapsListCard.click()
          await page.waitForTimeout(800)
          continue
        }

        const mapsNav = page.locator(".bottom-nav__item[aria-label='지도']").first()
        if (await mapsNav.isVisible().catch(() => false)) {
          await mapsNav.click()
        }

        await page.waitForTimeout(700)
      }

      throw new Error("map editor not visible after login/navigation")
    }

    await ensureEditorOpen()
    pushCheck("open map editor", true, mapId)

    const mapListToggle = page.locator(".map-list-bar .map-filter-toggle").first()
    await mapListToggle.click()
    await page.locator(".map-place-strip .map-place-card").first().waitFor({ state: "visible" })

    async function dismissObstructions() {
      for (let i = 0; i < 4; i += 1) {
        const coachOverlay = page.locator(".coachmark-overlay").first()
        const coachVisible = await coachOverlay.isVisible().catch(() => false)
        if (!coachVisible) break
        await coachOverlay.click({ force: true })
        await page.waitForTimeout(180)
      }

      const toast = page.locator(".toast").first()
      const toastVisible = await toast.isVisible().catch(() => false)
      if (toastVisible) {
        await page.waitForTimeout(900)
      }
    }

    async function openFeatureDetail(featureTitle) {
      await dismissObstructions()
      const card = page.locator(".map-place-card", { hasText: featureTitle }).first()
      await card.evaluate((el) => {
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
      })
      await page.locator(".me-summary-title", { hasText: featureTitle }).first().waitFor({ state: "visible" })
      await dismissObstructions()
      const topDetailButton = page.locator(".map-feature-summary__head-action", { hasText: "상세보기" }).first()
      const legacyBottomDetailButton = page.locator(".map-feature-summary__action").first()
      if (await topDetailButton.isVisible().catch(() => false)) {
        await topDetailButton.click({ force: true })
      } else {
        await legacyBottomDetailButton.click({ force: true })
      }
      await page.locator(".fd__style-stack").first().waitFor({ state: "visible" })
      const currentTitle = await page.locator(".fd__input").first().inputValue()
      return currentTitle
    }

    async function expectActiveColor(expectedHex) {
      const swatch = page.locator(`.fd__swatch[aria-label$="${expectedHex}"]`).first()
      await swatch.waitFor({ state: "visible" })
      return swatch.evaluate((el) => el.classList.contains("is-active"))
    }

    async function getActiveLineStyleIndex() {
      const buttons = page.locator(".fd__line-style-btn")
      return buttons.evaluateAll((nodes) => nodes.findIndex((node) => node.classList.contains("is-active")))
    }

    async function closeFeatureSheet() {
      const closeButton = page.locator(".sheet .sheet__header .icon-button").first()
      await closeButton.click()
      await page.locator(".fd__style-stack").first().waitFor({ state: "hidden" })
    }

    const pinTitle = await openFeatureDetail(featurePinTitle)
    const pinColorActive = await expectActiveColor("#2F80ED")
    pushCheck("pin style active color", pinColorActive && pinTitle.includes("PIN-"), `title=${pinTitle}`)
    await closeFeatureSheet()

    const routeTitle = await openFeatureDetail(featureRouteTitle)
    const routeColorActive = await expectActiveColor("#E24B4A")
    const routeLineActiveIndex = await getActiveLineStyleIndex()
    pushCheck(
      "route style active color/line",
      routeColorActive && routeLineActiveIndex === 1 && routeTitle.includes("ROUTE-"),
      `title=${routeTitle},lineIndex=${routeLineActiveIndex}`,
    )
    await closeFeatureSheet()

    const areaTitle = await openFeatureDetail(featureAreaTitle)
    const areaColorActive = await expectActiveColor("#8B5CF6")
    const areaLineActiveIndex = await getActiveLineStyleIndex()
    pushCheck(
      "area style active color/line",
      areaColorActive && areaLineActiveIndex === 2 && areaTitle.includes("AREA-"),
      `title=${areaTitle},lineIndex=${areaLineActiveIndex}`,
    )
    await closeFeatureSheet()

    const outDir = ensureReportDir(repoRoot)
    const screenshotPath = path.join(outDir, `feature-style-ui-${Date.now()}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
    report.ui.screenshotPath = screenshotPath

    await context.close()
    page = null
  } finally {
    if (browser && page) {
      try {
        const outDir = ensureReportDir(repoRoot)
        const debugPath = path.join(outDir, `feature-style-ui-debug-${Date.now()}.png`)
        await page.screenshot({ path: debugPath, fullPage: true })
        report.ui.debugScreenshotPath = debugPath
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

    if (mapId) {
      const cleanupMap = await apiClient
        .from("maps")
        .delete()
        .eq("id", mapId)
        .select("id")
      report.cleanup.mapDeleteError = cleanupMap.error?.message || ""
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
  const outFile = path.join(outDir, `feature-style-ui-${Date.now()}.json`)
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8")

  console.log(`QA_UI_REPORT=${outFile}`)
  console.log(JSON.stringify(report.summary, null, 2))
  for (const item of report.checks) {
    console.log(`${item.pass ? "PASS" : "FAIL"} | ${item.name} | ${item.detail}`)
  }
  if (report.cleanup.mapDeleteError) {
    console.log(`NOTE | cleanup map delete failed: ${report.cleanup.mapDeleteError}`)
  } else {
    console.log("NOTE | cleanup map success")
  }

  process.exit(report.summary.allPass ? 0 : 2)
}

main().catch((error) => {
  console.error(`QA_UI_FATAL ${error.message}`)
  process.exit(1)
})
