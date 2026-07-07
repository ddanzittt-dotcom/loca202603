import { MEDIA_POLICY, assertPhotoFileAllowed, assertStoredMediaAllowed } from "./mediaPolicy"

// 원본 이미지 파일 → 리사이즈 + JPEG 압축 Blob.
// useMediaHandlers 의 사진 파이프라인과 동일 정책(maxWidth/jpegQuality/저장한도)을 재사용한다.
// 스마트폰 원본(3~8MB)을 그대로 저장하면 localStorage 초과(로컬) 또는 업로드 한도 초과(클라우드)로
// 저장이 실패하므로, 표지 사진·기록 사진도 반드시 이 헬퍼를 거쳐 압축한다.
export async function compressImageFile(file) {
  assertPhotoFileAllowed(file)
  const img = await new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("이미지를 불러오지 못했어요."))
    image.src = URL.createObjectURL(file)
  })
  const maxW = MEDIA_POLICY.photo.maxWidth
  let w = img.width
  let h = img.height
  if (w > maxW) {
    h = Math.round((h * maxW) / w)
    w = maxW
  }
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  ctx.drawImage(img, 0, 0, w, h)
  URL.revokeObjectURL(img.src)
  const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", MEDIA_POLICY.photo.jpegQuality))
  if (!blob) throw new Error("사진 처리에 실패했어요.")
  assertStoredMediaAllowed(blob, "photo")
  return blob
}

// Blob → data URL (로컬 저장/미리보기용)
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
