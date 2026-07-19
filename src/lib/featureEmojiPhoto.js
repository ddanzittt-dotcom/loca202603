import { uploadMediaToCloud } from "./mediaStore"

const TARGET_SIZE = 256
const MAX_INPUT_BYTES = 6 * 1024 * 1024
const OUTPUT_QUALITY = 0.86
const SUPPORTED_MIMES = ["image/jpeg", "image/png", "image/webp"]

export async function cropFeatureEmojiPhoto(file) {
  if (!(file instanceof Blob)) throw new Error("이미지 파일이 아니에요.")
  if (file.size > MAX_INPUT_BYTES) throw new Error("이미지가 너무 커요. 최대 6MB까지 가능해요.")
  if (file.type && !SUPPORTED_MIMES.includes(file.type)) {
    throw new Error("JPG, PNG, WEBP 파일만 사용할 수 있어요.")
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
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error("이미지를 읽을 수 없어요."))
    reader.readAsDataURL(cropped)
  })
  return { url: dataUrl, source: "data-url" }
}

// 최근 사진 목록 — 계정(uid)별 키로 분리한다 (계정 전환 시 목록 혼입 방지).
// 비로그인은 기존 공용 키를 그대로 쓴다 (이 기기에서 만든 목록이므로 무방).
const STORE_KEY = "loca.feature.emoji.photo.recent.v1"
const MAX_PHOTOS = 18

const storeKey = (scopeId) => (scopeId ? `${STORE_KEY}.${scopeId}` : STORE_KEY)

export function loadRecentPhotoEmojis(scopeId = "") {
  try {
    const raw = localStorage.getItem(storeKey(scopeId))
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((u) => typeof u === "string").slice(0, MAX_PHOTOS) : []
  } catch {
    return []
  }
}

export function pushRecentPhotoEmoji(url, scopeId = "") {
  if (!url) return
  try {
    const current = loadRecentPhotoEmojis(scopeId)
    const next = [url, ...current.filter((u) => u !== url)].slice(0, MAX_PHOTOS)
    localStorage.setItem(storeKey(scopeId), JSON.stringify(next))
  } catch {
    // Ignore localStorage quota and privacy-mode failures.
  }
}

export function removeRecentPhotoEmoji(url, scopeId = "") {
  if (!url) return
  try {
    const current = loadRecentPhotoEmojis(scopeId)
    const next = current.filter((u) => u !== url)
    localStorage.setItem(storeKey(scopeId), JSON.stringify(next))
  } catch {
    // Ignore localStorage quota and privacy-mode failures.
  }
}
