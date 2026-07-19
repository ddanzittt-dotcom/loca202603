// ============================================================
// Storage(media 버킷) 사진 백업 — 로컬 폴더로 전체 스냅샷
//
// 왜 필요한가: Supabase DB 백업에는 Storage 객체(사진 원본)가 포함되지 않는다
//   (docs/DATA_SAFETY.md §2). feature_media 행(메타/URL)은 DB 백업에 있지만
//   실제 파일 바이트는 media 버킷에 따로 있어, 이 스크립트로 별도 스냅샷을 뜬다.
//
// 사용법 (loca202603 폴더에서):
//   1) .env 에 SUPABASE_SERVICE_ROLE_KEY 가 있어야 한다 (ingest 스크립트와 동일 키).
//      없으면 Supabase Dashboard → Project Settings → API → service_role 키를 복사해 추가.
//      (service_role 은 절대 클라이언트/깃에 노출 금지 — .env 는 이미 .gitignore 됨)
//   2) 실행:
//        npm run backup:media
//      또는 저장 위치 지정:
//        node scripts/backup-media.mjs --out=D:/loca-backups
//      미리보기(다운로드 없이 개수만):
//        node scripts/backup-media.mjs --dry-run
//
// 결과: <out>/media-backup-<날짜없음: git 커밋시각 기준 아님>/photos/....jpg 형태로
//   버킷 구조를 그대로 보존해 저장 + manifest.json(파일 목록·크기) 생성.
// ============================================================

import fs from "node:fs"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"
import { loadEnv } from "./ingest/_shared.mjs"

const BUCKET = "media"
const PAGE = 100 // Supabase storage.list 페이지 크기

function arg(name, fallback = null) {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.split("=").slice(1).join("=") : fallback
}
const DRY_RUN = process.argv.slice(2).includes("--dry-run")
const OUT_ROOT = arg("out", path.join(process.cwd(), "backup"))

const env = loadEnv()
const url = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || "").trim()
const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
if (!url || !serviceKey) {
  console.error("[backup] VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env 에 필요합니다.")
  console.error("         service_role 키: Supabase Dashboard → Settings → API → service_role.")
  process.exit(1)
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

// media 버킷을 재귀적으로 순회하며 모든 파일 경로를 모은다 (폴더는 id=null).
async function listAll(prefix = "") {
  const files = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
      limit: PAGE,
      offset,
      sortBy: { column: "name", order: "asc" },
    })
    if (error) throw new Error(`list "${prefix}": ${error.message}`)
    if (!data || data.length === 0) break
    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.id === null) {
        // 하위 폴더 → 재귀
        const nested = await listAll(full)
        files.push(...nested)
      } else {
        files.push({ path: full, size: entry.metadata?.size ?? null })
      }
    }
    if (data.length < PAGE) break
  }
  return files
}

async function main() {
  console.log(`[backup] media 버킷 목록 조회 중…`)
  const files = await listAll("")
  const totalBytes = files.reduce((n, f) => n + (f.size || 0), 0)
  console.log(`[backup] 파일 ${files.length}개, 합계 ${(totalBytes / 1048576).toFixed(1)} MB`)

  if (DRY_RUN) {
    console.log("[backup] --dry-run: 다운로드하지 않고 종료합니다.")
    files.slice(0, 10).forEach((f) => console.log(`  - ${f.path} (${f.size ?? "?"} B)`))
    if (files.length > 10) console.log(`  … 외 ${files.length - 10}개`)
    return
  }

  const destDir = path.join(OUT_ROOT, "media-backup")
  fs.mkdirSync(destDir, { recursive: true })

  let ok = 0
  let fail = 0
  for (const [i, f] of files.entries()) {
    const { data, error } = await supabase.storage.from(BUCKET).download(f.path)
    if (error || !data) {
      fail += 1
      console.warn(`  ✗ ${f.path}: ${error?.message || "download 실패"}`)
      continue
    }
    const outPath = path.join(destDir, f.path)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    const buf = Buffer.from(await data.arrayBuffer())
    fs.writeFileSync(outPath, buf)
    ok += 1
    if ((i + 1) % 25 === 0 || i === files.length - 1) {
      console.log(`  … ${i + 1}/${files.length}`)
    }
  }

  fs.writeFileSync(
    path.join(destDir, "manifest.json"),
    JSON.stringify({ bucket: BUCKET, count: files.length, totalBytes, files }, null, 2),
  )
  console.log(`[backup] 완료 — 성공 ${ok}, 실패 ${fail}`)
  console.log(`[backup] 저장 위치: ${destDir}`)
}

main().catch((err) => {
  console.error("[backup] 오류:", err.message)
  process.exit(1)
})
