import fs from "node:fs"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"
import { chromium } from "playwright"

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

function parseArg(name, fallback = "") {
  const token = `--${name}=`
  const hit = process.argv.find((arg) => arg.startsWith(token))
  if (!hit) return fallback
  return hit.slice(token.length)
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function normalizeInt(text) {
  const onlyDigits = `${text || ""}`.replace(/[^\d-]/g, "")
  const parsed = Number.parseInt(onlyDigits, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function createAnonClient(url, anonKey) {
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

function createServiceClient(url, serviceRoleKey) {
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
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
  throw new Error(`Dashboard server is not ready at ${url} (${lastError})`)
}

async function safeDelete(serviceClient, table, filterKey, filterValue) {
  try {
    const { error } = await serviceClient.from(table).delete().eq(filterKey, filterValue)
    return error ? error.message : ""
  } catch (error) {
    return error?.message || `${table} delete failed`
  }
}

async function run() {
  const repoRoot = path.resolve(process.cwd())
  const envLocal = parseEnvFile(path.join(repoRoot, ".env.local"))
  const envVercel = parseEnvFile(path.join(repoRoot, ".env.vercel"))
  const envDashboard = parseEnvFile(path.join(repoRoot, "..", "loca-dashboard", ".env.local"))
  const env = { ...envDashboard, ...envLocal, ...envVercel, ...process.env }

  const supabaseUrl = env.VITE_SUPABASE_URL
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
  const dashboardUrl = parseArg("dashboard-url", "http://127.0.0.1:5174")

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are required.")
  }

  const report = {
    startedAt: nowIso(),
    env: {
      dashboardUrl,
    },
    setup: {},
    db: {},
    ui: {},
    verdict: {},
    cleanup: {},
  }

  const service = createServiceClient(supabaseUrl, supabaseServiceRoleKey)
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const ownerEmail = `loca-dashboard-owner-${nonce}@example.com`
  const importerEmail = `loca-dashboard-importer-${nonce}@example.com`
  const ownerPassword = `LocaDash!${nonce}Aa1`
  const importerPassword = `LocaDash!${nonce}Bb2`

  let ownerUserId = null
  let importerUserId = null
  let parentMapId = null
  let childMapId = null
  let browser = null
  let runError = null

  try {
    const ownerCreate = await service.auth.admin.createUser({
      email: ownerEmail,
      password: ownerPassword,
      email_confirm: true,
      user_metadata: { qa: "dashboard-smoke-owner" },
    })
    if (ownerCreate.error || !ownerCreate.data.user) {
      throw new Error(`Owner user create failed: ${ownerCreate.error?.message || "unknown"}`)
    }
    ownerUserId = ownerCreate.data.user.id

    const importerCreate = await service.auth.admin.createUser({
      email: importerEmail,
      password: importerPassword,
      email_confirm: true,
      user_metadata: { qa: "dashboard-smoke-importer" },
    })
    if (importerCreate.error || !importerCreate.data.user) {
      throw new Error(`Importer user create failed: ${importerCreate.error?.message || "unknown"}`)
    }
    importerUserId = importerCreate.data.user.id

    report.setup.ownerEmail = ownerEmail
    report.setup.importerEmail = importerEmail
    report.setup.ownerUserId = ownerUserId
    report.setup.importerUserId = importerUserId

    await service.from("profiles").upsert([
      { id: ownerUserId, nickname: "QA Owner", role: "user" },
      { id: importerUserId, nickname: "QA Importer", role: "user" },
    ])

    const now = nowIso()
    const parentMapInsert = await service
      .from("maps")
      .insert({
        user_id: ownerUserId,
        title: `QA 대시보드 재사용 퍼널 ${nonce}`,
        description: "QA dashboard smoke map",
        theme: "#FF6B35",
        visibility: "public",
        category: "event",
        config: {
          checkin_enabled: true,
          survey_enabled: true,
          announcements_enabled: true,
          comment_permission: "all_logged_in",
        },
        is_published: true,
        published_at: now,
      })
      .select("id,title")
      .single()
    if (parentMapInsert.error || !parentMapInsert.data) {
      throw new Error(`Parent map create failed: ${parentMapInsert.error?.message || "unknown"}`)
    }
    parentMapId = parentMapInsert.data.id

    const childMapInsert = await service
      .from("maps")
      .insert({
        user_id: importerUserId,
        title: `QA 가져온 지도 ${nonce}`,
        description: "QA child map",
        theme: "#2D4A3E",
        visibility: "private",
        category: "event",
        config: {},
      })
      .select("id,title")
      .single()
    if (childMapInsert.error || !childMapInsert.data) {
      throw new Error(`Child map create failed: ${childMapInsert.error?.message || "unknown"}`)
    }
    childMapId = childMapInsert.data.id

    report.setup.parentMapId = parentMapId
    report.setup.childMapId = childMapId

    const dashboardSettings = {
      version: 1,
      presetId: "custom",
      lastAppliedPresetId: "event",
      selectedMetricIds: [
        "share_count",
        "save_count",
        "import_count",
      ],
      enabledModuleIds: [
        "funnel",
        "reuse_funnel",
        "trend",
        "channels",
        "survey",
        "content_management",
        "announcements",
        "auto_insights",
      ],
      isCustomized: true,
      basicMetrics: true,
      checkpoints: true,
      placeAnalysis: true,
      inboundChannels: true,
      content: true,
      surveyReport: true,
    }

    const settingsUpdate = await service
      .from("maps")
      .update({ dashboard_modules: dashboardSettings, updated_at: nowIso() })
      .eq("id", parentMapId)
      .select("id")
      .single()
    if (settingsUpdate.error) {
      throw new Error(`dashboard_modules update failed: ${settingsUpdate.error.message}`)
    }

    // Ensure publication row exists for report-related reads.
    await service.from("map_publications").upsert({
      map_id: parentMapId,
      published_at: now,
      saves_count: 0,
      likes_count: 0,
    }, { onConflict: "map_id" })

    const shareInsert = await service
      .from("view_logs")
      .insert({
        map_id: parentMapId,
        viewer_id: importerUserId,
        source: "link",
        session_id: `qa-share-${nonce}`,
        event_type: "share_click",
        meta: {
          channel: "link",
          visitor_id: `qa-visitor-${nonce}`,
        },
      })
      .select("id")
      .single()
    if (shareInsert.error) {
      throw new Error(`share_click insert failed: ${shareInsert.error.message}`)
    }
    report.db.shareClickInserted = true

    const importerClient = createAnonClient(supabaseUrl, supabaseAnonKey)
    const importerSignIn = await importerClient.auth.signInWithPassword({
      email: importerEmail,
      password: importerPassword,
    })
    if (importerSignIn.error || !importerSignIn.data.user) {
      throw new Error(`Importer sign-in failed: ${importerSignIn.error?.message || "unknown"}`)
    }

    const saveRes = await importerClient.rpc("save_map", {
      p_map_id: parentMapId,
      p_session_id: `qa-save-${nonce}`,
      p_source: "share",
    })
    if (saveRes.error) {
      throw new Error(`save_map rpc failed: ${saveRes.error.message}`)
    }
    report.db.saveMapRpc = saveRes.data

    const lineageRes = await importerClient.rpc("link_map_lineage", {
      p_parent_map_id: parentMapId,
      p_child_map_id: childMapId,
      p_relation_type: "import",
    })
    if (lineageRes.error) {
      throw new Error(`link_map_lineage rpc failed: ${lineageRes.error.message}`)
    }
    report.db.linkMapLineageRpc = lineageRes.data

    const [shareRows, saveRows, lineageRows] = await Promise.all([
      service.from("view_logs").select("id,session_id,event_type").eq("map_id", parentMapId).eq("event_type", "share_click"),
      service.from("map_saves").select("id,map_id").eq("map_id", parentMapId),
      service.from("map_lineage").select("id,parent_map_id,child_map_id,relation_type").eq("parent_map_id", parentMapId),
    ])

    report.db.shareCount = shareRows.data?.length || 0
    report.db.saveCount = saveRows.data?.length || 0
    report.db.importCount = (lineageRows.data || []).filter((row) => row.relation_type === "import").length

    await waitForHttpReady(dashboardUrl)

    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1440, height: 980 },
    })
    const page = await context.newPage()
    page.setDefaultTimeout(30000)

    await page.goto(dashboardUrl, { waitUntil: "domcontentloaded" })

    const mapSelect = page.locator(".app-map-bar__select")
    const loginEmailInput = page.locator("input[type='email']")
    const loginPasswordInput = page.locator("input[type='password']")
    const loginSubmitButton = page.locator("button[type='submit']")
    let loginAttempted = false

    for (let i = 0; i < 80; i += 1) {
      if (await mapSelect.count()) {
        const visible = await mapSelect.first().isVisible().catch(() => false)
        if (visible) break
      }

      if (!loginAttempted && await loginEmailInput.count()) {
        const emailVisible = await loginEmailInput.first().isVisible().catch(() => false)
        if (emailVisible) {
          await loginEmailInput.fill(ownerEmail)
          await loginPasswordInput.fill(ownerPassword)
          await loginSubmitButton.click()
          loginAttempted = true
        }
      }

      await page.waitForTimeout(500)
    }

    await mapSelect.waitFor({ state: "visible", timeout: 40000 })
    await mapSelect.selectOption(parentMapId)

    await page.locator(".dashboard-metric-grid--summary .dashboard-metric--summary").first().waitFor({ state: "visible" })
    await page.waitForTimeout(1400)

    const metricCards = await page.$$eval(".dashboard-metric-grid--summary .dashboard-metric--summary", (nodes) => (
      nodes.map((node) => ({
        title: node.querySelector("span")?.textContent?.trim() || "",
        value: node.querySelector("strong")?.textContent?.trim() || "",
      }))
    ))

    const firstThree = metricCards.slice(0, 3).map((card) => normalizeInt(card.value))
    report.ui.metricCards = metricCards
    report.ui.metricCounts = {
      firstThree,
    }

    const artifactsDir = path.join(repoRoot, ".qa-artifacts")
    if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true })

    const screenshotPath = path.join(artifactsDir, `dashboard-ui-smoke-${Date.now()}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
    report.ui.screenshotPath = screenshotPath

    const reportButton = page.locator(".dashboard-report-download .button.button--primary")
    let reportDownloadPath = ""
    let reportHintText = ""
    let downloadEventOk = false

    const downloadPromise = page.waitForEvent("download", { timeout: 15000 }).catch(() => null)
    await reportButton.click()
    const download = await downloadPromise
    if (download) {
      reportDownloadPath = path.join(artifactsDir, `dashboard-report-${Date.now()}.pdf`)
      await download.saveAs(reportDownloadPath)
      downloadEventOk = true
    }

    const successHintLocator = page.locator(".dashboard-inline-hint--success")
    if (await successHintLocator.count()) {
      try {
        await successHintLocator.first().waitFor({ state: "visible", timeout: 12000 })
        reportHintText = await successHintLocator.first().innerText()
      } catch {
        reportHintText = ""
      }
    }

    report.ui.report = {
      downloadEventOk,
      downloadPath: reportDownloadPath,
      successHint: reportHintText,
    }

    const uiShare = firstThree[0] || 0
    const uiSave = firstThree[1] || 0
    const uiImport = firstThree[2] || 0
    const metricsPass = uiShare === 1 && uiSave === 1 && uiImport === 1
    const reportActionPass = downloadEventOk || reportHintText.length > 0

    report.verdict = {
      expected: {
        share: 1,
        save: 1,
        import: 1,
      },
      actual: {
        share: uiShare,
        save: uiSave,
        import: uiImport,
      },
      metricsPass,
      reportActionPass,
      passed: metricsPass && reportActionPass,
    }
  } catch (error) {
    runError = error
    report.verdict = {
      passed: false,
      fatalError: error?.message || "unknown",
    }
  } finally {
    if (browser) {
      try {
        await browser.close()
      } catch {
        // noop
      }
    }

    if (parentMapId) {
      report.cleanup.viewLogsError = await safeDelete(service, "view_logs", "map_id", parentMapId)
      report.cleanup.mapSavesError = await safeDelete(service, "map_saves", "map_id", parentMapId)
      report.cleanup.mapLineageByParentError = await safeDelete(service, "map_lineage", "parent_map_id", parentMapId)
      report.cleanup.mapLineageByChildError = childMapId
        ? await safeDelete(service, "map_lineage", "child_map_id", childMapId)
        : ""
      report.cleanup.mapPublicationsParentError = await safeDelete(service, "map_publications", "map_id", parentMapId)
    }

    if (childMapId) {
      report.cleanup.mapPublicationsChildError = await safeDelete(service, "map_publications", "map_id", childMapId)
      report.cleanup.childMapDeleteError = await safeDelete(service, "maps", "id", childMapId)
    }
    if (parentMapId) {
      report.cleanup.parentMapDeleteError = await safeDelete(service, "maps", "id", parentMapId)
    }

    if (ownerUserId) {
      const removeOwner = await service.auth.admin.deleteUser(ownerUserId)
      report.cleanup.ownerDeleteError = removeOwner.error?.message || ""
    }
    if (importerUserId) {
      const removeImporter = await service.auth.admin.deleteUser(importerUserId)
      report.cleanup.importerDeleteError = removeImporter.error?.message || ""
    }
  }

  report.endedAt = nowIso()

  const outDir = path.join(repoRoot, ".qa-artifacts")
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, `dashboard-ui-smoke-${Date.now()}.json`)
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8")

  console.log(`UI_SMOKE_REPORT=${outFile}`)
  console.log(JSON.stringify(report.verdict || {}, null, 2))

  if (!report.verdict?.passed) {
    if (runError) {
      console.error(`UI_SMOKE_FATAL ${runError.message}`)
    }
    process.exit(2)
  }
}

run()
