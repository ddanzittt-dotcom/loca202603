import fs from "node:fs"
import path from "node:path"

function findLatestArtifact(dirPath) {
  if (!fs.existsSync(dirPath)) return null
  const files = fs.readdirSync(dirPath)
    .filter((name) => /^event-collab-roles-qa-\d+\.json$/.test(name))
    .map((name) => ({
      name,
      fullPath: path.join(dirPath, name),
      mtimeMs: fs.statSync(path.join(dirPath, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
  return files[0] || null
}

function main() {
  const artifactsDir = path.join(process.cwd(), ".qa-artifacts")
  const latest = findLatestArtifact(artifactsDir)
  if (!latest) {
    console.error("QA_ASSERT_FAILED: event-collab QA artifact not found")
    console.error("- expected path: .qa-artifacts/event-collab-roles-qa-<timestamp>.json")
    process.exit(1)
  }

  const raw = fs.readFileSync(latest.fullPath, "utf8")
  const parsed = JSON.parse(raw)
  const summary = parsed.summary || {}
  const allPass = Boolean(summary.allPass)

  if (!allPass) {
    console.error("QA_ASSERT_FAILED: latest event-collab QA did not pass")
    console.error(`- file: ${latest.fullPath}`)
    console.error(`- passCount: ${summary.passCount ?? "unknown"}`)
    console.error(`- total: ${summary.total ?? "unknown"}`)
    process.exit(1)
  }

  console.log("QA_ASSERT_OK")
  console.log(`- file: ${latest.fullPath}`)
  console.log(`- passCount: ${summary.passCount}`)
  console.log(`- total: ${summary.total}`)
  console.log(`- allPass: ${summary.allPass}`)
}

main()
