import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"

const DEFAULT_OUTPUT = "src/data/communitySampleFeatures.js"
const SAMPLE_BATCH = "lcoa-user-test-2026-05"
const SAMPLE_AUTHOR = "LCOA 샘플"
const SAMPLE_TAG = "LCOA 샘플"

const REGION_SLUGS = {
  "강원특별자치도": "gangwon",
  "경기도": "gyeonggi",
  "경상남도": "gyeongnam",
  "경상북도": "gyeongbuk",
  "광주광역시": "gwangju",
  "대구광역시": "daegu",
  "대전광역시": "daejeon",
  "부산광역시": "busan",
  "서울특별시": "seoul",
  "세종특별자치시": "sejong",
  "울산광역시": "ulsan",
  "인천광역시": "incheon",
  "전라남도": "jeonnam",
  "전북특별자치도": "jeonbuk",
  "제주특별자치도": "jeju",
  "충청남도": "chungnam",
  "충청북도": "chungbuk",
}

const PIXEL_RULES = [
  { id: "px-beach", terms: ["바다", "해변"] },
  { id: "px-market", terms: ["시장", "먹거리", "로컬상권"] },
  { id: "px-gallery", terms: ["전시", "문화공간", "로컬콘텐츠"] },
  { id: "px-castle", terms: ["역사", "문화유산"] },
  { id: "px-alley", terms: ["골목", "산책길", "동선"] },
  { id: "px-house", terms: ["마을"] },
  { id: "px-camera", terms: ["사진", "전망"] },
  { id: "px-map", terms: ["여행", "체험", "로컬", "방문기록"] },
  { id: "px-star", terms: ["지역행사"] },
  { id: "px-pin", terms: ["광장", "공공공간"] },
]

const NATURE_PIXEL_IDS = ["px-tree", "px-park", "px-leaf", "px-flower", "px-mountain", "px-lake"]
const FALLBACK_PIXEL_IDS = [
  "px-pin",
  "px-star",
  "px-sun",
  "px-tree",
  "px-gallery",
  "px-camera",
  "px-house",
  "px-map",
]

function parseArgs(argv) {
  const input = argv.find((arg) => !arg.startsWith("--"))
  const outputFlag = argv.find((arg) => arg.startsWith("--output="))
  const outputIndex = argv.indexOf("--output")
  return {
    input,
    output: outputFlag
      ? outputFlag.slice("--output=".length)
      : outputIndex >= 0
        ? argv[outputIndex + 1]
        : DEFAULT_OUTPUT,
  }
}

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ""
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]

    if (quoted) {
      if (char === "\"" && next === "\"") {
        field += "\""
        i += 1
      } else if (char === "\"") {
        quoted = false
      } else {
        field += char
      }
      continue
    }

    if (char === "\"") {
      quoted = true
    } else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else if (char !== "\r") {
      field += char
    }
  }

  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((nextRow) => nextRow.some((value) => value.trim()))
}

function rowsToObjects(rows) {
  const header = rows[0]?.map((value) => value.trim())
  if (!header?.length) throw new Error("CSV header가 비어 있습니다.")

  return rows.slice(1).map((row, index) => {
    const out = {}
    for (const [cellIndex, key] of header.entries()) {
      out[key] = row[cellIndex]?.trim() || ""
    }
    out.__rowNumber = index + 2
    return out
  })
}

function shortHash(value, length = 10) {
  return createHash("sha1").update(value).digest("hex").slice(0, length)
}

function uuidFromKey(value) {
  const bytes = createHash("sha1").update(`loca-community-sample:${value}`).digest()
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString("hex").slice(0, 32)
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-")
}

function getRegion(address) {
  return address.split(/\s+/).find(Boolean) || "전국"
}

function selectPixelId(row, index) {
  const tags = splitTags(row.tags)
  const haystack = [row.title, row.address, ...tags].join(" ")

  for (const rule of PIXEL_RULES) {
    if (rule.terms.some((term) => haystack.includes(term))) return rule.id
  }

  if (["자연", "풍경", "산책"].some((term) => haystack.includes(term))) {
    return NATURE_PIXEL_IDS[index % NATURE_PIXEL_IDS.length]
  }

  return FALLBACK_PIXEL_IDS[index % FALLBACK_PIXEL_IDS.length]
}

function splitTags(value) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function validateRow(row) {
  const errors = []
  const lat = Number(row.lat)
  const lng = Number(row.lng)

  if (row.type !== "장소") errors.push("type은 장소여야 합니다")
  if (!row.title) errors.push("title이 비어 있습니다")
  if (!Number.isFinite(lat) || lat < 32 || lat > 39) errors.push("lat이 국내 좌표 범위를 벗어났습니다")
  if (!Number.isFinite(lng) || lng < 124 || lng > 132) errors.push("lng가 국내 좌표 범위를 벗어났습니다")

  if (errors.length) {
    throw new Error(`CSV ${row.__rowNumber}행 오류: ${errors.join(", ")}`)
  }

  return { lat, lng }
}

function toFeature(row, index) {
  const { lat, lng } = validateRow(row)
  const region = getRegion(row.address)
  const regionSlug = REGION_SLUGS[region] || `region-${shortHash(region, 6)}`
  const sampleKey = `sample-${regionSlug}-${shortHash(`${row.title}|${lat}|${lng}|${row.address}`, 12)}`
  const tags = [...new Set([SAMPLE_TAG, region, ...splitTags(row.tags)])]
  const note = row.note
  const emojiPixelId = selectPixelId(row, index)

  return {
    id: uuidFromKey(sampleKey),
    sampleKey,
    type: "pin",
    title: row.title,
    emoji: `loca-emoji:pixel:${emojiPixelId}`,
    emojiKind: "pixel",
    emojiPixelId,
    tags,
    note,
    lat,
    lng,
    sortOrder: 10000 + index + 1,
  }
}

function buildOutput(features) {
  return [
    `export const COMMUNITY_SAMPLE_BATCH = ${JSON.stringify(SAMPLE_BATCH)}`,
    `export const COMMUNITY_SAMPLE_AUTHOR = ${JSON.stringify(SAMPLE_AUTHOR)}`,
    `export const COMMUNITY_SAMPLE_TAG = ${JSON.stringify(SAMPLE_TAG)}`,
    "",
    "// Generated by scripts/generate-community-sample-features.mjs.",
    "// Source CSV columns: type, title, lat, lng, address, note, tags.",
    `export const communitySampleFeatures = ${JSON.stringify(features, null, 2)}`,
    "",
  ].join("\n")
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.input) {
    throw new Error("사용법: node scripts/generate-community-sample-features.mjs <csv-path> [--output src/data/communitySampleFeatures.js]")
  }

  const inputPath = path.resolve(args.input)
  const outputPath = path.resolve(args.output)
  const rows = rowsToObjects(parseCsv(fs.readFileSync(inputPath, "utf8")))
  const features = rows.map(toFeature)
  const ids = new Set(features.map((feature) => feature.id))
  const sampleKeys = new Set(features.map((feature) => feature.sampleKey))

  if (ids.size !== features.length) throw new Error("생성된 id 중복이 있습니다.")
  if (sampleKeys.size !== features.length) throw new Error("생성된 sampleKey 중복이 있습니다.")

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, buildOutput(features), "utf8")
  console.log(`generated=${features.length}`)
  console.log(`output=${outputPath}`)
}

main()
