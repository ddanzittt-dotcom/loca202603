// 탐색탭 이웃 제보(기여) — RPC 래퍼 + 사진 업로드/복사 헬퍼 (migration 084).
// 제출/검수 테이블(explore_contributions)은 RLS 로 본인 행만 읽히고, 변경은
// SECURITY DEFINER RPC 로만 한다. 승인 시 explore_catalog(source='contribution')로 미러 발행.
// 1차 범위는 3개 탭(즐기기·배우기·걷기·머물기) — '자연'은 2차.

import { requireSupabase, hasSupabaseEnv, supabase } from "./supabase"
import { uploadMediaToCloud } from "./mediaStore"
import { assertPhotoFileAllowed, assertStoredMediaAllowed, MEDIA_POLICY } from "./mediaPolicy"
import { createId } from "./appUtils"
import { friendlyAdminError } from "./adminModeration"

const STORAGE_BUCKET = "media" // mediaStore.js 와 동일 (public 버킷)

// 제보 시트 탭 — key 는 explore_catalog.tab 과 동일. 예시는 무엇이 이 탭에 맞는지 안내.
export const CONTRIBUTE_TABS = [
  { key: "enjoy", label: "즐기기", emoji: "🎪", hint: "축제·행사·공연", examples: "동네 축제, 플리마켓, 전시 오프닝" },
  { key: "learn", label: "배우기", emoji: "📚", hint: "강좌·원데이클래스·공방", examples: "도자기 공방, 마을 강좌, 미술 수업" },
  { key: "walk", label: "걷기·머물기", emoji: "🌳", hint: "공원·시장·산책로·명소", examples: "동네 공원, 전통시장, 골목길" },
  { key: "nature", label: "자연", emoji: "🦋", hint: "동네에서 만난 생물", examples: "새, 곤충, 들꽃, 물고기" },
]

// 자연(nature) 제보 분류 — label 은 카드 배지, taxonGroup·emoji 는 wildlife 카드 변환용.
// api/wildlife.js TAXON_META 와 정합(+곤충). explore_catalog 에는 category(label)만 저장하고
// emoji·taxonGroup 은 클라이언트가 이 표로 되살린다(목록 쿼리에서 detail 을 빼기 위해).
export const NATURE_CATEGORIES = [
  { label: "새", taxonGroup: "Aves", emoji: "🐦" },
  { label: "곤충", taxonGroup: "Insecta", emoji: "🐛" },
  { label: "식물", taxonGroup: "Plantae", emoji: "🌿" },
  { label: "포유류", taxonGroup: "Mammalia", emoji: "🦔" },
  { label: "양서류", taxonGroup: "Amphibia", emoji: "🐸" },
  { label: "파충류", taxonGroup: "Reptilia", emoji: "🦎" },
  { label: "물고기", taxonGroup: "Actinopterygii", emoji: "🐟" },
  { label: "기타", taxonGroup: "", emoji: "🐾" },
]

// admin 검수 상태 탭
export const CONTRIBUTE_STATUS_TABS = [
  { key: "pending", label: "검토 대기" },
  { key: "published", label: "게시됨" },
  { key: "rejected", label: "반려됨" },
]

// 걷기·머물기 종류 → category 로 저장 (영리 업소는 정책상 반려 — 폼에서 안내)
export const WALK_CATEGORIES = ["공원", "시장", "산책로", "쉼터", "명소", "그 외"]

export function contributeTabLabel(key) {
  return CONTRIBUTE_TABS.find((tab) => tab.key === key)?.label || key
}

function parseRpcJson(data) {
  return typeof data === "string" ? JSON.parse(data) : data
}

// 제출/검수 실패 안내 — 사용자에게 그대로 보여줄 한국어 문구
export function friendlyContributeError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""}`.toLowerCase()
  if (msg.includes("not_authenticated")) return "제보하려면 로그인이 필요해요."
  if (msg.includes("rate_limited")) return "오늘은 제보를 많이 보냈어요. 잠시 후 다시 시도해주세요."
  if (msg.includes("invalid_location")) return "위치를 다시 확인해주세요. 국내 위치만 제보할 수 있어요."
  if (msg.includes("date_required")) return "행사 시작일을 입력해주세요."
  if (msg.includes("invalid_title")) return "이름을 확인해주세요."
  if (msg.includes("invalid_addr")) return "위치(주소)를 선택해주세요."
  if (msg.includes("invalid_tab")) return "제보할 탭을 골라주세요."
  if (msg.includes("field_too_long")) return "입력이 너무 길어요. 조금 줄여주세요."
  if (msg.includes("network") || msg.includes("fetch")) return "지금은 제보를 전송하지 못했어요. 네트워크를 확인해주세요."
  return "지금은 제보를 전송하지 못했어요. 잠시 후 다시 시도해주세요."
}

// 사진 다운스케일 (useMediaHandlers 와 동일 규격: 1280px·jpeg 0.72) → Blob
async function downscalePhoto(file) {
  assertPhotoFileAllowed(file)
  const img = await new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = URL.createObjectURL(file)
  })
  const maxW = MEDIA_POLICY.photo.maxWidth
  let w = img.width
  let h = img.height
  if (w > maxW) { h = Math.round((h * maxW) / w); w = maxW }
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  canvas.getContext("2d").drawImage(img, 0, 0, w, h)
  URL.revokeObjectURL(img.src)
  const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", MEDIA_POLICY.photo.jpegQuality))
  assertStoredMediaAllowed(blob, "photo")
  return blob
}

// 카카오 services SDK(Geocoder·Places) 로드 보장 — index.html 의 loadKakaoMap 로더 사용.
// ContributeSheet 는 지도를 안 띄우므로(맵핑 어렵다는 피드백) SDK 로드 트리거가 없다 →
// 지오코딩 전에 여기서 명시적으로 로드(멱등, 키 없으면 false).
export function ensureKakaoServices() {
  return new Promise((resolve) => {
    if (typeof window === "undefined") { resolve(false); return }
    if (window.kakao?.maps?.services) { resolve(true); return }
    if (typeof window.loadKakaoMap !== "function") { resolve(false); return }
    window.loadKakaoMap((ok) => resolve(Boolean(ok) && Boolean(window.kakao?.maps?.services)))
  })
}

// 주소·장소명 → 좌표 (카카오 services SDK, 클라이언트 — /api 프록시 불필요).
// 지도 없이 주소만 입력받아 좌표를 얻는다: 1) 키워드(장소명·상호) 검색 → 2) 주소 검색 폴백.
// 반환 { lat, lng, addr } | null. addr 은 매칭된 도로명/지번(없으면 입력값).
export function geocodePlace(query) {
  return new Promise((resolve) => {
    const q = String(query || "").trim()
    if (!q) { resolve(null); return }
    ensureKakaoServices().then((ready) => {
      const kakao = typeof window !== "undefined" ? window.kakao : null
      if (!ready || !kakao?.maps?.services) { resolve(null); return }
      const svc = kakao.maps.services
      const ok = (lat, lng, addr) => {
        const nlat = Number(lat)
        const nlng = Number(lng)
        if (!Number.isFinite(nlat) || !Number.isFinite(nlng)) { resolve(null); return }
        resolve({ lat: nlat, lng: nlng, addr: addr || q })
      }
      try {
        new svc.Places().keywordSearch(q, (data, status) => {
          if (status === svc.Status.OK && Array.isArray(data) && data[0]) {
            const p = data[0]
            ok(p.y, p.x, p.road_address_name || p.address_name || q)
            return
          }
          // 장소명으로 못 찾으면 도로명·지번 주소로 재시도
          new svc.Geocoder().addressSearch(q, (res, st) => {
            if (st === svc.Status.OK && Array.isArray(res) && res[0]) {
              const r = res[0]
              ok(r.y, r.x, r.road_address?.address_name || r.address_name || q)
            } else {
              resolve(null)
            }
          })
        })
      } catch {
        resolve(null)
      }
    })
  })
}

// 제보 사진 임시 업로드 → publicUrl (contrib-pending/<id>). 승인 시 admin 이 영구 경로로 복사.
export async function uploadContributionPhoto(file) {
  const blob = await downscalePhoto(file)
  const id = createId("contrib")
  const meta = await uploadMediaToCloud(id, blob, "contrib-pending")
  if (!meta?.publicUrl) throw new Error("사진 업로드에 실패했어요.")
  return meta.publicUrl
}

// 제보 제출 — 성공 시 { ok, id, status }
export async function submitContribution(payload) {
  const client = requireSupabase()
  const { data, error } = await client.rpc("submit_contribution", {
    p_tab: payload.tab,
    p_title: payload.title,
    p_addr: payload.addr,
    p_lat: payload.lat,
    p_lng: payload.lng,
    p_category: payload.category ?? null,
    p_summary: payload.summary ?? null,
    p_phone: payload.phone ?? null,
    p_source_url: payload.sourceUrl ?? null,
    p_image: payload.image ?? null,
    p_start_date: payload.startDate || null,
    p_end_date: payload.endDate || null,
    p_apply_start: payload.applyStart || null,
    p_apply_end: payload.applyEnd || null,
    p_detail: payload.detail ?? {},
  })
  if (error) {
    const wrapped = new Error(friendlyContributeError(error))
    wrapped.cause = error
    throw wrapped
  }
  return parseRpcJson(data) || {}
}

// ── 이하 admin 전용 (platform_admin 게이트는 서버 RPC 가 담당) ──

// 목록 + 상태별 카운트: { records:[...], counts:{pending,published,rejected,retracted}, generatedAt }
export async function listAdminContributions(status = "pending", limit = 100) {
  const client = requireSupabase()
  const { data, error } = await client.rpc("admin_list_contributions", {
    p_status: status,
    p_limit: limit,
  })
  if (error) {
    const wrapped = new Error(friendlyAdminError(error))
    wrapped.cause = error
    throw wrapped
  }
  const parsed = parseRpcJson(data) || {}
  return {
    records: Array.isArray(parsed.records) ? parsed.records : [],
    counts: parsed.counts || {},
    generatedAt: parsed.generated_at || null,
  }
}

// 심의 — status: 'published' | 'rejected'. published 시 image(영구 URL) 있으면 교체.
export async function reviewContribution(id, status, { rejectReason = null, image = null } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc("admin_review_contribution", {
    p_id: id,
    p_status: status,
    p_reject_reason: rejectReason,
    p_image: image,
  })
  if (error) {
    const wrapped = new Error(friendlyAdminError(error))
    wrapped.cause = error
    throw wrapped
  }
  return parseRpcJson(data)
}

// 승인 시 제보 사진을 관리자 소유 영구 경로(contrib-pub/<id>)로 복사 → 영구 publicUrl.
// 제보자가 탈퇴해 임시 파일이 정리돼도 발행 카드 사진은 유지된다(decision #2 승인 시 복사).
// media 버킷 밖의 외부 URL(사용자가 링크로 넣은 사진)은 복사 없이 그대로 사용.
export async function copyContributionPhotoToPermanent(imageUrl, contributionId) {
  if (!hasSupabaseEnv || !supabase || !imageUrl || !contributionId) return imageUrl || null
  const marker = "/object/public/media/"
  const idx = imageUrl.indexOf(marker)
  if (idx < 0) return imageUrl // 외부 URL — 복사 대상 아님
  const fromPath = decodeURIComponent(imageUrl.slice(idx + marker.length).split("?")[0])
  if (!fromPath.startsWith("contrib-pending/")) return imageUrl // 이미 영구본이면 그대로
  const ext = (fromPath.split(".").pop() || "jpg").toLowerCase()
  const toPath = `contrib-pub/${contributionId}.${ext}`
  try {
    await supabase.storage.from(STORAGE_BUCKET).remove([toPath]) // 재승인 대비 기존 사본 제거
  } catch { /* 없으면 무시 */ }
  const { error } = await supabase.storage.from(STORAGE_BUCKET).copy(fromPath, toPath)
  if (error) return imageUrl // 복사 실패 시 임시 URL 로라도 발행은 진행
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(toPath)
  return data?.publicUrl || imageUrl
}
