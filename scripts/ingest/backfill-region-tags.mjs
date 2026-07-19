// map_features region 태깅 백필 — 좌표는 있으나 동네(법정동)가 안 채워진 카드를
// 카카오 REST coord2regioncode 로 역지오코딩해 region_name/region_code 를 채운다.
//
// 배경: region_name 은 지도 열람 시 클라이언트가 그때그때 역지오코딩해 채우므로(054),
//   한 번도 열리지 않은 지도의 카드나 예전 데이터는 태깅이 비어 있을 수 있다. admin
//   지역 자산 집계(081 get_admin_region_insights)와 동네 밀도 지도(082 get_admin_geo_density)의
//   정확도는 태깅률에 직접 좌우되므로, 이 배치로 커버리지를 끌어올린다.
//
// 실행:
//   npm run backfill:regions                 (전체 — service_role 로 전 사용자 카드 대상)
//   npm run backfill:regions -- --dry-run    (쓰기 없이 대상 수 + 샘플 5건만 확인)
//   npm run backfill:regions -- --limit=200  (상위 200건만 — 소규모 시험용)
//
// ⚠️ 운영 주의:
//   1) 카카오 REST 쿼터는 라이브 역지오코딩 프록시(api/reverse-geocode.js)와 같은 키를 공유한다.
//      대량 실행이 일일 쿼터를 태우면 그날 앱의 실시간 동네 태깅이 죽을 수 있으니, 먼저 --dry-run 으로
//      대상 수(=대략의 고유 좌표 수)를 확인하고 사용자 적은 심야에 실행할 것. 필요하면 --limit 로 나눠 실행.
//   2) 이 UPDATE 는 트리거로 updated_at 을 갱신한다. 사용자가 미태깅 카드를 열어둔 채 편집하면
//      드물게 '다른 사용자가 먼저 수정' 오탐이 날 수 있어(낙관적 잠금), 저사용 시간대 실행을 권장한다.
//      (쓰기에 is-null 가드를 둬서 스캔~쓰기 사이 이미 태깅된 행은 건드리지 않아 재-bump 는 방지됨)
//
// 필요 env (.env / .env.local / process.env): VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   KAKAO_REST_KEY (또는 KAKAO_REST_API_KEY).  ← anon 이 아니라 service_role 키 필요(RLS 우회 전체 UPDATE).
//
// 포맷은 클라이언트/서버 프록시와 100% 일치시킨다: region_type='B'(법정동) 우선,
//   region_name = [1·2·3depth].join(" "), region_code = item.code (예: '1120010500').

import { loadEnv, serviceSupabase, kakaoRestKey, cliFlags } from "./_shared.mjs"

const KAKAO_COORD2REGION = "https://dapi.kakao.com/v2/local/geo/coord2regioncode.json"
// 카카오가 빈 결과를 주는 한국 밖 좌표는 아예 호출하지 않는다 (api/reverse-geocode.js 와 동일 범위).
const KOREA = { latMin: 32, latMax: 40, lngMin: 123, lngMax: 133 }
const PAGE = 1000
const WRITE_CHUNK = 500
const MAX_CONSECUTIVE_ERRORS = 20 // 연속 지오코딩 오류가 이만큼이면 쿼터 소진/장애로 보고 중단

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

// 좌표 → 법정동. 정상 200 이지만 지역 없음 = null 반환(진짜 빈 결과), 그 외 오류는 throw(일시적).
// 429(쿼터/속도)면 잠깐 쉬고 한 번 재시도.
async function coord2region(lat, lng, kakaoKey, tries = 2) {
  const url = `${KAKAO_COORD2REGION}?x=${lng.toFixed(6)}&y=${lat.toFixed(6)}`
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    const resp = await fetch(url, { headers: { Authorization: `KakaoAK ${kakaoKey}` } })
    if (resp.status === 429) { await sleep(1500); continue }
    if (!resp.ok) throw new Error(`kakao ${resp.status}`)
    const data = await resp.json()
    const docs = Array.isArray(data.documents) ? data.documents : []
    const item = docs.find((d) => d.region_type === "B") || docs[0]
    if (!item) return null
    const regionName = [item.region_1depth_name, item.region_2depth_name, item.region_3depth_name]
      .filter(Boolean)
      .join(" ")
    return { regionName: regionName || null, regionCode: item.code || null }
  }
  throw new Error("kakao 429 (rate limit) — 재시도 소진")
}

// region_name 이 비어있고 좌표가 있는 카드 전량을 페이지네이션으로 모은다 (조회 먼저, UPDATE 는 이후).
// created_at 만으로는 동률 시 페이지 경계에서 누락될 수 있어 id 를 tiebreaker 로 함께 정렬한다.
async function fetchCandidates(supabase, limit) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("map_features")
      .select("id, lat, lng, region_name")
      .is("region_name", null)
      .not("lat", "is", null)
      .not("lng", "is", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`후보 조회 실패: ${error.message}`)
    rows.push(...data)
    process.stdout.write(`\r[scan] ${rows.length}건`)
    if (data.length < PAGE) break
    if (limit && rows.length >= limit) break
  }
  process.stdout.write("\n")
  return limit ? rows.slice(0, limit) : rows
}

async function main() {
  const env = loadEnv()
  const { dryRun, limit } = cliFlags()
  const kakaoKey = kakaoRestKey(env)
  const supabase = serviceSupabase(env)

  console.log(`[backfill] region 태깅 백필 시작${dryRun ? " (dry-run)" : ""}${limit ? ` limit=${limit}` : ""}`)

  // 사전 점검: region 컬럼(054)·권한을 카카오 호출(쿼터 소모) 전에 확인 — 없으면 즉시 중단.
  if (!dryRun) {
    const { error: preErr } = await supabase.from("map_features").select("id, region_name, region_code").limit(1)
    if (preErr) {
      console.error(`[backfill] 사전 점검 실패 — region 컬럼(054 migration)/service_role 권한을 확인하세요: ${preErr.message}`)
      process.exit(1)
    }
  }

  const candidates = await fetchCandidates(supabase, limit)

  // (0,0)·한국 밖 좌표는 태깅 대상에서 제외 (국외 카드는 원래 태깅 안 함)
  const targets = []
  let zeroCoord = 0
  let overseas = 0
  for (const r of candidates) {
    const lat = Number(r.lat)
    const lng = Number(r.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) { zeroCoord += 1; continue }
    if (lat < KOREA.latMin || lat > KOREA.latMax || lng < KOREA.lngMin || lng > KOREA.lngMax) { overseas += 1; continue }
    targets.push({ id: r.id, lat, lng })
  }

  console.log(`[backfill] 미태깅 후보 ${candidates.length} → 태깅 대상 ${targets.length} (좌표0 ${zeroCoord} · 국외 ${overseas} 제외)`)

  if (targets.length === 0) {
    console.log("[backfill] 태깅할 카드가 없습니다. 종료.")
    return
  }

  if (dryRun) {
    console.log("[dry-run] 샘플 5건 역지오코딩 (쓰기 없음):")
    for (const t of targets.slice(0, 5)) {
      try {
        const region = await coord2region(t.lat, t.lng, kakaoKey)
        console.log(`  ${String(t.id).slice(0, 8)} (${t.lat.toFixed(4)},${t.lng.toFixed(4)}) → ${region?.regionName || "(빈 결과)"} [${region?.regionCode || "-"}]`)
      } catch (error) {
        console.log(`  ${String(t.id).slice(0, 8)} 실패: ${error.message}`)
      }
      await sleep(80)
    }
    console.log(`[dry-run] 대상 ${targets.length}건. 실제 실행하려면 --dry-run 없이 다시 실행하세요.`)
    return
  }

  // ── 1) 지오코딩 단계: 좌표→region. 같은 좌표는 캐시(질의와 동일한 6자리 정밀도)로 흡수.
  //    진짜 빈 결과(null)는 캐시하고, 일시적 오류(429/네트워크)는 캐시하지 않아 재시도 여지를 남긴다.
  const cache = new Map()
  const groups = new Map() // regionKey → { regionName, regionCode, ids[] }
  let emptyResult = 0
  let geocodeErrors = 0
  let consecutiveErrors = 0
  let apiCalls = 0

  for (let i = 0; i < targets.length; i += 1) {
    const t = targets[i]
    const cacheKey = `${t.lat.toFixed(6)},${t.lng.toFixed(6)}`
    let region
    if (cache.has(cacheKey)) {
      region = cache.get(cacheKey)
    } else {
      try {
        region = await coord2region(t.lat, t.lng, kakaoKey)
        cache.set(cacheKey, region) // 찾음/진짜 빈 결과 모두 캐시
        consecutiveErrors = 0
      } catch {
        geocodeErrors += 1
        consecutiveErrors += 1
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.error(`\n[backfill] 지오코딩 오류가 연속 ${consecutiveErrors}회 — 카카오 쿼터 소진/장애로 판단해 중단합니다.`)
          console.error("[backfill] 잠시 후(또는 다음 날) 재실행하면 아직 미태깅인 카드만 다시 시도합니다.")
          process.exit(1)
        }
        apiCalls += 1
        await sleep(200)
        continue // 캐시하지 않음 — 재실행 시 다시 시도
      }
      apiCalls += 1
      await sleep(60) // 카카오 REST rate limit 배려 (~16 req/s)
    }

    if (!region || !region.regionName) { emptyResult += 1; continue }

    const groupKey = `${region.regionName} ${region.regionCode ?? ""}`
    let group = groups.get(groupKey)
    if (!group) {
      group = { regionName: region.regionName, regionCode: region.regionCode, ids: [] }
      groups.set(groupKey, group)
    }
    group.ids.push(t.id)

    if ((i + 1) % 50 === 0 || i === targets.length - 1) {
      process.stdout.write(`\r[geocode] ${i + 1}/${targets.length} · API ${apiCalls}회 · 빈결과 ${emptyResult} · 오류 ${geocodeErrors}`)
    }
  }
  process.stdout.write("\n")

  // ── 2) 쓰기 단계: 같은 region 으로 묶인 id 를 청크(500) 배치 UPDATE. is-null 가드로
  //    스캔~쓰기 사이 이미 채워진 행은 no-op(트리거 재-bump 방지). .select 로 실제 갱신 수 집계.
  const coverage = new Map()
  let tagged = 0
  for (const group of groups.values()) {
    const sido = group.regionName.split(" ")[0] || "(미상)"
    for (let i = 0; i < group.ids.length; i += WRITE_CHUNK) {
      const chunk = group.ids.slice(i, i + WRITE_CHUNK)
      const { data, error } = await supabase
        .from("map_features")
        .update({ region_name: group.regionName, region_code: group.regionCode })
        .in("id", chunk)
        .is("region_name", null)
        .select("id")
      if (error) {
        console.error(`\n[backfill] UPDATE 실패 — 중단: ${error.message}`)
        console.error("[backfill] 054(region 컬럼) 적용 여부와 service_role 권한을 확인하세요.")
        process.exit(1)
      }
      const n = data?.length || 0
      tagged += n
      coverage.set(sido, (coverage.get(sido) || 0) + n)
    }
  }

  console.log(`\n[결과] 태깅 완료 ${tagged} · 빈 결과 ${emptyResult} · 지오코딩 오류 ${geocodeErrors} · 좌표0 ${zeroCoord} · 국외 ${overseas}`)
  console.log(`[결과] 카카오 API 호출 ${apiCalls}회 (좌표 중복은 캐시로 절감)`)
  if (geocodeErrors > 0) {
    console.log("[결과] 지오코딩 오류가 있었습니다 — 해당 카드는 미태깅으로 남았으니, 재실행하면 다시 시도합니다.")
  }
  if (coverage.size) {
    console.log("[coverage] 시도별 태깅 건수:")
    for (const [sido, count] of [...coverage.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${sido}: ${count}`)
    }
  }
  console.log("\n[다음] /admin → 지역·태그 탭에서 '동네 태깅률'과 밀도 지도가 갱신됐는지 확인하세요.")
}

main().catch((error) => {
  console.error("\n[backfill] 실패:", error?.message || error)
  process.exit(1)
})
