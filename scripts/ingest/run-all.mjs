// 탐색 카탈로그 전 소스 순차 재수집 러너 — 분기 루틴용 (백로그 C — 실수 방지 반자동화)
// 실행:  npm run ingest:all -- --dry-run   (전 소스 필드 검증만)
//        npm run ingest:all                (전체 동기화 — SERVICE_ROLE 필요)
// 플래그는 각 스크립트로 그대로 전달된다. 한 소스가 실패해도 다음으로 진행하고 끝에 요약한다.
// 로그는 scripts/ingest/logs/ 에 저장 — 커버리지(시도별 건수) 추적은 이 로그 보관으로 갈음.

import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))

// 갱신주기 빈도 순 아님 — 의존 관계 순: heritage 적재 뒤에 상세 보강(enrich)이 와야 한다
const SCRIPTS = [
  "ingest-cityparks.mjs",
  "ingest-markets.mjs",
  "ingest-festivals.mjs",
  "ingest-durunubi.mjs",
  "ingest-lifelong.mjs",
  "ingest-libraries.mjs",
  "ingest-farmvillages.mjs",
  "ingest-museums.mjs",
  "ingest-trails.mjs",
  "ingest-heritage.mjs",
  "enrich-heritage-detail.mjs",
]

const passArgs = process.argv.slice(2)
const logsDir = path.join(here, "logs")
fs.mkdirSync(logsDir, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
const logPath = path.join(logsDir, `ingest-run-${stamp}${passArgs.includes("--dry-run") ? "-dry" : ""}.log`)

const results = []
const logLines = [`# ingest:all ${stamp} args=[${passArgs.join(" ")}]`]

for (const script of SCRIPTS) {
  const started = Date.now()
  console.log(`\n━━━ ${script} ━━━`)
  const run = spawnSync(process.execPath, [path.join(here, script), ...passArgs], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  })
  const elapsed = Math.round((Date.now() - started) / 1000)
  const output = `${run.stdout || ""}${run.stderr || ""}`
  process.stdout.write(output)
  const ok = run.status === 0
  results.push({ script, ok, elapsed })
  logLines.push(`\n━━━ ${script} (exit ${run.status}, ${elapsed}s) ━━━\n${output}`)
  if (!ok) console.error(`[run-all] ${script} 실패 (exit ${run.status}) — 다음 소스로 진행`)
}

fs.writeFileSync(logPath, logLines.join("\n"), "utf8")

console.log("\n━━━ 요약 ━━━")
for (const { script, ok, elapsed } of results) {
  console.log(`  ${ok ? "✓" : "✗"} ${script} (${elapsed}s)`)
}
const failed = results.filter((r) => !r.ok)
console.log(`\n[run-all] ${results.length - failed.length}/${results.length} 성공 — 로그: ${path.relative(process.cwd(), logPath)}`)
if (failed.length) process.exit(1)
