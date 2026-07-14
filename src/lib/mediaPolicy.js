export const MEDIA_POLICY = {
  photo: {
    maxOriginalBytes: 12 * 1024 * 1024,
    maxStoredBytes: 2 * 1024 * 1024,
    maxWidth: 1280,
    jpegQuality: 0.72,
  },
  localQueue: {
    maxAnalyticsEvents: 200,
  },
}

export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)}MB`
}

export function assertPhotoFileAllowed(file) {
  if (!file) throw new Error("사진 파일을 찾을 수 없어요.")
  if (!file.type?.startsWith("image/")) throw new Error("이미지 파일만 업로드할 수 있어요.")
  if (file.size > MEDIA_POLICY.photo.maxOriginalBytes) {
    throw new Error(`사진은 ${formatBytes(MEDIA_POLICY.photo.maxOriginalBytes)} 이하만 업로드할 수 있어요.`)
  }
}

export function assertStoredMediaAllowed(blob, mediaType = "photo") {
  void mediaType
  const limit = MEDIA_POLICY.photo.maxStoredBytes
  if (blob.size > limit) {
    throw new Error(`사진 파일이 너무 커요. ${formatBytes(limit)} 이하로 줄여주세요.`)
  }
}
