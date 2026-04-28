import fs from "node:fs"
import path from "node:path"

const ROOT = path.resolve("src")
const suspiciousPatterns = [
  /\?\?\?/,
  / /,
  /癲|嚥|熬|꾩|맩|釉|썼|쭕/,
]

const brandTerms = [
  "핀 추가",
  "피처",
  "맵핑",
  "발행",
  "발행 취소",
  "프로필 올리기",
  "운영자",
  "승인 요청",
  "행사 관리",
  "리포트",
  "부스",
]

const exts = new Set([".js", ".jsx", ".ts", ".tsx"])

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walk(fullPath))
    else if (exts.has(path.extname(entry.name))) files.push(fullPath)
  }

  return files
}

const results = []

for (const file of walk(ROOT)) {
  const text = fs.readFileSync(file, "utf8")
  const lines = text.split(/\r?\n/)

  lines.forEach((line, index) => {
    const hasSuspicious = suspiciousPatterns.some((pattern) => pattern.test(line))
    const matchedTerms = brandTerms.filter((term) => line.includes(term))

    if (hasSuspicious || matchedTerms.length > 0) {
      results.push({
        file,
        line: index + 1,
        text: line.trim(),
        terms: matchedTerms,
        suspicious: hasSuspicious,
      })
    }
  })
}

if (results.length === 0) {
  console.log("No suspicious copy found.")
} else {
  for (const item of results) {
    console.log(`\n${item.file}:${item.line}`)
    console.log(item.text)
    if (item.terms.length) console.log(`terms: ${item.terms.join(", ")}`)
    if (item.suspicious) console.log("suspicious: true")
  }

  process.exitCode = 1
}