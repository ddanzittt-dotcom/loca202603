import { getMedia, uploadMediaToCloud } from "./mediaStore"
import { createMediaRecord } from "./mapService.write"
import { normalizeMedia } from "./mapService.utils"
import { requireSupabase } from "./supabase"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MEDIA_BUCKET_PUBLIC_MARKER = "/storage/v1/object/public/media/"

export function isSupabaseUuid(value) {
  return UUID_PATTERN.test(`${value || ""}`)
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(`${value || ""}`)
}

export function getRemoteMediaUrl(media = {}) {
  const url = media.url || media.cloudUrl || media.src || media.thumbnail || ""
  return isHttpUrl(url) ? `${url}` : null
}

export function inferStoragePathFromPublicUrl(publicUrl) {
  const url = `${publicUrl || ""}`
  const markerIndex = url.indexOf(MEDIA_BUCKET_PUBLIC_MARKER)
  if (markerIndex < 0) return null
  const rawPath = url.slice(markerIndex + MEDIA_BUCKET_PUBLIC_MARKER.length).split("?")[0]
  try {
    return decodeURIComponent(rawPath)
  } catch {
    return rawPath || null
  }
}

export function getMediaLocalKey(media = {}) {
  if (media.localId) return `${media.localId}`
  if (media.id && !isSupabaseUuid(media.id)) return `${media.id}`
  return null
}

export function isCloudMediaRecord(media = {}) {
  return isSupabaseUuid(media.id) && Boolean(getRemoteMediaUrl(media) || media.storagePath)
}

function getMediaFolder() {
  return "photos"
}

function getFileExtFromPath(storagePath) {
  const ext = `${storagePath || ""}`.split(".").pop()
  return ext && ext !== storagePath ? ext : null
}

function buildMediaSyncError() {
  const error = new Error("사진을 웹에 올리지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요.")
  error.code = "LOCA_MEDIA_SYNC_FAILED"
  return error
}

async function findExistingMediaRecord(featureId, mediaType, storagePath) {
  if (!featureId || !mediaType || !storagePath) return null
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from("feature_media")
    .select("*")
    .eq("feature_id", featureId)
    .eq("media_type", mediaType)
    .eq("storage_path", storagePath)
    .maybeSingle()

  if (error) throw error
  return data ? normalizeMedia(data) : null
}

async function ensureMediaRecord(featureId, mediaType, media, cloudMeta) {
  const existing = await findExistingMediaRecord(featureId, mediaType, cloudMeta.storagePath)
  if (existing) {
    const publicUrl = existing.url || cloudMeta.publicUrl || getRemoteMediaUrl(media)
    if (!existing.url && publicUrl) {
      const supabase = requireSupabase()
      await supabase
        .from("feature_media")
        .update({ public_url: publicUrl })
        .eq("id", existing.id)
    }
    return {
      ...existing,
      url: publicUrl || existing.url,
      storagePath: existing.storagePath || cloudMeta.storagePath,
      duration: existing.duration ?? media.duration ?? null,
      recordId: existing.recordId || media.recordId || null,
    }
  }

  return createMediaRecord(featureId, {
    storagePath: cloudMeta.storagePath,
    publicUrl: cloudMeta.publicUrl || getRemoteMediaUrl(media),
    mimeType: cloudMeta.mimeType || media.mimeType || null,
    fileExt: cloudMeta.fileExt || media.ext || getFileExtFromPath(cloudMeta.storagePath),
    sizeBytes: cloudMeta.sizeBytes || media.sizeBytes || 0,
    mediaType,
    recordId: media.recordId || undefined,
  })
}

function mergeSyncedMedia(media, record, cloudMeta, localKey) {
  const next = {
    ...media,
    id: record.id,
    date: record.date || media.date || new Date().toISOString(),
    url: record.url || cloudMeta.publicUrl || getRemoteMediaUrl(media),
    storagePath: record.storagePath || cloudMeta.storagePath || media.storagePath,
    mimeType: record.mimeType || cloudMeta.mimeType || media.mimeType,
    ext: record.ext || cloudMeta.fileExt || media.ext,
    sizeBytes: record.sizeBytes || cloudMeta.sizeBytes || media.sizeBytes,
    recordId: record.recordId || media.recordId || null,
  }

  if (localKey) next.localId = media.localId || localKey
  return next
}

async function syncMediaItemToCloud(featureId, media, mediaType) {
  if (!media || isCloudMediaRecord(media)) {
    return { media, status: "unchanged" }
  }
  if (!isSupabaseUuid(featureId)) {
    return { media, status: "skipped" }
  }

  const localKey = getMediaLocalKey(media)
  const remoteUrl = getRemoteMediaUrl(media)
  const inferredStoragePath = media.storagePath || inferStoragePathFromPublicUrl(remoteUrl)
  let cloudMeta = null

  if (remoteUrl && inferredStoragePath) {
    cloudMeta = {
      publicUrl: remoteUrl,
      storagePath: inferredStoragePath,
      mimeType: media.mimeType || null,
      fileExt: media.ext || getFileExtFromPath(inferredStoragePath),
      sizeBytes: media.sizeBytes || 0,
    }
  } else if (localKey) {
    const blob = await getMedia(localKey)
    if (!blob) return { media, status: "missing-local" }

    cloudMeta = await uploadMediaToCloud(localKey, blob, getMediaFolder())
    if (!cloudMeta?.publicUrl || !cloudMeta?.storagePath) {
      return { media, status: "failed" }
    }
  } else {
    return { media, status: "missing-local" }
  }

  const record = await ensureMediaRecord(featureId, mediaType, media, cloudMeta)
  return {
    media: mergeSyncedMedia(media, record, cloudMeta, localKey),
    status: "synced",
  }
}

async function syncMediaList(featureId, items = [], mediaType) {
  const nextItems = []
  const summary = { syncedCount: 0, failedCount: 0, missingCount: 0, skippedCount: 0 }

  for (const item of Array.isArray(items) ? items : []) {
    try {
      const result = await syncMediaItemToCloud(featureId, item, mediaType)
      nextItems.push(result.media)
      if (result.status === "synced") summary.syncedCount += 1
      if (result.status === "failed") summary.failedCount += 1
      if (result.status === "missing-local") summary.missingCount += 1
      if (result.status === "skipped") summary.skippedCount += 1
    } catch (error) {
      console.error("[mediaCloudSync] failed to sync media", error)
      nextItems.push(item)
      summary.failedCount += 1
    }
  }

  return { items: nextItems, ...summary }
}

export async function syncFeatureLocalMediaToCloud(feature = {}, options = {}) {
  const photoResult = await syncMediaList(feature.id, feature.photos, "photo")
  const summary = {
    syncedCount: photoResult.syncedCount,
    failedCount: photoResult.failedCount,
    missingCount: photoResult.missingCount,
    skippedCount: photoResult.skippedCount,
  }

  if (options.throwOnFailure && (summary.failedCount > 0 || summary.missingCount > 0)) {
    throw buildMediaSyncError()
  }

  return {
    feature: {
      ...feature,
      photos: photoResult.items,
    },
    ...summary,
  }
}

export async function syncFeatureListLocalMediaToCloud(features = [], options = {}) {
  const nextFeatures = []
  const summary = { syncedCount: 0, failedCount: 0, missingCount: 0, skippedCount: 0 }

  for (const feature of Array.isArray(features) ? features : []) {
    const result = await syncFeatureLocalMediaToCloud(feature, { throwOnFailure: false })
    nextFeatures.push(result.feature)
    summary.syncedCount += result.syncedCount
    summary.failedCount += result.failedCount
    summary.missingCount += result.missingCount
    summary.skippedCount += result.skippedCount
  }

  if (options.throwOnFailure && (summary.failedCount > 0 || summary.missingCount > 0)) {
    throw buildMediaSyncError()
  }

  return {
    features: nextFeatures,
    ...summary,
  }
}

export function getPendingFeatureMediaSyncKeys(features = []) {
  const keys = []
  for (const feature of Array.isArray(features) ? features : []) {
    if (!isSupabaseUuid(feature?.id)) continue
    for (const [mediaType, items] of [["photo", feature.photos]]) {
      for (const item of Array.isArray(items) ? items : []) {
        if (isCloudMediaRecord(item)) continue
        const key = getMediaLocalKey(item) || item.storagePath || getRemoteMediaUrl(item)
        if (key) keys.push(`${feature.id}:${mediaType}:${key}`)
      }
    }
  }
  return keys
}
