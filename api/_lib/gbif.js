// GBIF 보충 관측 어댑터 (스펙 v3.3 D5 — 하이브리드의 보충축).
// iNaturalist 는 직접 호출을 유지(한글 종명 locale=ko + 사진 + 실시간성)하고,
// GBIF 에서는 iNat 데이터셋을 제외한 나머지(국립생물자원관 등 국내 기관 관측)만 보탠다.
// 실측(2026-07-17): GBIF 레코드의 vernacularName 은 대부분 비어 있음 → 종 단위로
// species/vernacularNames 를 제한 조회(상한 12종)해 한글명을 보강하고, 없으면 학명 표기.
// 실패는 전부 [] (fail-soft) — 이 소스가 죽어도 iNat 결과는 유지.

const GBIF_SEARCH_URL = "https://api.gbif.org/v1/occurrence/search"
const GBIF_SPECIES_URL = "https://api.gbif.org/v1/species"
const INAT_DATASET_KEY = "50c9509d-22c7-4a22-a47d-8c48425ef4a7" // iNaturalist research-grade
const VERNACULAR_LOOKUP_LIMIT = 12 // 종별 한글명 보강 상한 (요청당 추가 호출 억제 — 엣지 캐시가 흡수)

// 분류군 필터 — 기존 wildlife.js 허용군과 동일 (곤충·거미·버섯 제외)
const TAXON_FILTERS = [
  { key: 212, group: "Aves" },
  { key: 359, group: "Mammalia" },
  { key: 131, group: "Amphibia" },
  { key: 358, group: "Reptilia" },
  { key: 204, group: "Actinopterygii" },
  { key: 6, group: "Plantae" }, // kingdom Plantae
]

// CC 라이선스 URL만 허용 (전보류 제외) — iNat 쪽 필터와 같은 취지
function isAllowedLicense(license) {
  return /creativecommons\.org/i.test(String(license || ""))
}

function taxonGroupOf(record) {
  if (record.kingdomKey === 6) return "Plantae"
  const hit = TAXON_FILTERS.find((t) => t.key === record.classKey)
  return hit ? hit.group : ""
}

async function fetchJson(url) {
  const resp = await fetch(url, { headers: { "User-Agent": "LOCA/1.0 (loca.im)" } })
  if (!resp.ok) return null
  return resp.json().catch(() => null)
}

// 종별 한글명 보강 — vernacularName 이 빈 종만, 상한까지
async function enrichKoreanNames(records) {
  const targets = []
  const seen = new Set()
  for (const record of records) {
    if (record.vernacular) continue
    const key = record.speciesKey
    if (!key || seen.has(key)) continue
    seen.add(key)
    targets.push(key)
    if (targets.length >= VERNACULAR_LOOKUP_LIMIT) break
  }

  const names = new Map()
  await Promise.all(targets.map(async (key) => {
    const data = await fetchJson(`${GBIF_SPECIES_URL}/${key}/vernacularNames?limit=60`).catch(() => null)
    const results = Array.isArray(data?.results) ? data.results : []
    const korean = results.find((v) => v.language === "kor" && v.vernacularName)
    if (korean) names.set(key, korean.vernacularName)
  }))

  for (const record of records) {
    if (!record.vernacular && names.has(record.speciesKey)) {
      record.vernacular = names.get(record.speciesKey)
    }
  }
  return records
}

// GBIF 관측 조회 → 원시 레코드(정규화는 wildlife.js 에서 TAXON_META 로)
// 반환: [{ key, scientific, vernacular, taxonGroup, speciesKey, lat, lng, observedOn,
//          photoUrl, photoLicense, rightsHolder, datasetName }]
export async function fetchGbifSupplement(location, radiusKm) {
  const params = new URLSearchParams({
    geoDistance: `${location.lat},${location.lng},${radiusKm}km`,
    occurrenceStatus: "PRESENT",
    limit: "150",
  })
  for (const taxon of TAXON_FILTERS) params.append("taxonKey", String(taxon.key))

  let data
  try {
    data = await fetchJson(`${GBIF_SEARCH_URL}?${params.toString()}`)
  } catch {
    return []
  }
  const results = Array.isArray(data?.results) ? data.results : []

  const records = []
  for (const record of results) {
    if (record.datasetKey === INAT_DATASET_KEY) continue // iNat 몫은 직접 호출이 담당 (중복 방지)
    const lat = Number(record.decimalLatitude)
    const lng = Number(record.decimalLongitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const taxonGroup = taxonGroupOf(record)
    if (!taxonGroup) continue
    const scientific = record.species || record.scientificName || ""
    if (!scientific) continue

    const media = (Array.isArray(record.media) ? record.media : [])
      .find((m) => m.type === "StillImage" && m.identifier && isAllowedLicense(m.license))

    records.push({
      key: record.key,
      scientific,
      vernacular: record.vernacularName || "",
      taxonGroup,
      speciesKey: record.speciesKey || record.taxonKey || null,
      lat,
      lng,
      observedOn: String(record.eventDate || "").slice(0, 10),
      photoUrl: media ? String(media.identifier).replace(/^http:/, "https:") : "",
      photoLicense: media ? media.license : "",
      rightsHolder: media ? (media.rightsHolder || media.creator || "") : "",
      datasetName: record.datasetName || "",
    })
  }

  return enrichKoreanNames(records)
}
