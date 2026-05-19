// 장소 이모지용 사진 업로드 헬퍼.
// - 정사각 중앙 크롭 + 256px 리사이즈
// - Supabase Storage 'media' 버킷의 'emoji-photos/' 폴더에 저장
// - 클라우드 사용 불가 시 (anon 모드 등) data URL 폴백을 반환해도 동작

import { uploadMediaToCloud } from "./mediaStore"

const TARGET_SIZE = 256 // px, 정사각
const MAX_INPUT_BYTES = 6 * 1024 * 1024 // 6MB 원본 입력 한계
const OUTPUT_QUALITY = 0.86

const SUPPORTED_MIMES = ["image/jpeg", "image/png", "image/webp"]

/**
 * File → 정사각 256px 크롭 Blob.
 */
export async function cropFeatureEmojiPhoto(file) {
  if (!(file instanceof Blob)) throw new Error("이미지 파일이 아닙니다.")
  if (file.size > MAX_INPUT_BYTES) throw new Error("이미지가 너무 커요. (최대 6MB)")
  if (file.type && !SUPPORTED_MIMES.includes(file.type)) {
    throw new Error("JPG · PNG · WEBP 만 지원해요.")
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error("이미지를 읽을 수 없어요."))
    reader.readAsDataURL(file)
  })

  const img = await new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = () => reject(new Error("이미지를 불러올 수 없어요."))
    im.src = dataUrl
  })

  // 중앙 정사각 크롭
  const minSide = Math.min(img.naturalWidth, img.naturalHeight)
  const sx = Math.max(0, (img.naturalWidth - minSide) / 2)
  const sy = Math.max(0, (img.naturalHeight - minSide) / 2)

  const canvas = document.createElement("canvas")
  canvas.width = TARGET_SIZE
  canvas.height = TARGET_SIZE
  const ctx = canvas.getContext("2d")
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, TARGET_SIZE, TARGET_SIZE)

  return await new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob || new Blob([], { type: "image/jpeg" })),
      "image/jpeg",
      OUTPUT_QUALITY,
    )
  })
}

/**
 * 업로드 + Public URL 반환.
 * 실패 시 fallback 으로 dataURL 을 반환할지 여부를 fallbackToDataUrl 로 선택.
 *
 * @returns {Promise<{ url: string, source: 'cloud' | 'data-url' }>}
 */
export async function uploadFeatureEmojiPhoto(file, { fallbackToDataUrl = true } = {}) {
  const cropped = await cropFeatureEmojiPhoto(file)
  const id = `emoji-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const meta = await uploadMediaToCloud(id, cropped, "emoji-photos")
  if (meta && meta.publicUrl) {
    return { url: meta.publicUrl, source: "cloud" }
  }
  if (!fallbackToDataUrl) {
    throw new Error("사진 업로드에 실패했어요. 다시 시도해주세요.")
  }
  // 로컬/데모 모드 폴백: data URL
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error("이미지를 읽을 수 없어요."))
    reader.readAsDataURL(cropped)
  })
  return { url: dataUrl, source: "data-url" }
}

/**
 * 디바이스 로컬 라이브러리에 photo emoji URL 들을 보관 (최근 사용).
 */
const STORE_KEY = "loca.feature.emoji.photo.recent.v1"
const MAX_PHOTOS = 18

export function loadRecentPhotoEmojis() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((u) => typeof u === "string").slice(0, MAX_PHOTOS) : []
  } catch { return [] }
}

export function pushRecentPhotoEmoji(url) {
  if (!url) return
  try {
    const current = loadRecentPhotoEmojis()
    const next = [url, ...current.filter((u) => u !== url)].slice(0, MAX_PHOTOS)
    localStorage.setItem(STORE_KEY, JSON.stringify(next))
  } catch { /* quota 등 무시 */ }
}

export function removeRecentPhotoEmoji(url) {
  if (!url) return
  try {
    const current = loadRecentPhotoEmojis()
    const next = current.filter((u) => u !== url)
    localStorage.setItem(STORE_KEY, JSON.stringify(next))
  } catch { /* 무시 */ }
}
