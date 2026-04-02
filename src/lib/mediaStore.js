import { supabase, hasSupabaseEnv } from "./supabase"

const STORAGE_BUCKET = "media"
const DB_NAME = "loca-media"
const STORE_NAME = "blobs"
const DB_VERSION = 1

let dbPromise = null

export function initMediaDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

export async function saveMedia(id, blob) {
  const db = await initMediaDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.objectStore(STORE_NAME).put(blob, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getMedia(id) {
  const db = await initMediaDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly")
    const request = tx.objectStore(STORE_NAME).get(id)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
}

export async function deleteMedia(id) {
  const db = await initMediaDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getAllMediaKeys() {
  const db = await initMediaDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly")
    const request = tx.objectStore(STORE_NAME).getAllKeys()
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
}

// ─── Supabase Storage ───

/**
 * Supabase Storage에 미디어를 업로드하고 메타정보를 반환한다.
 * @returns {{ publicUrl, storagePath, mimeType, fileExt, sizeBytes } | null}
 */
export async function uploadMediaToCloud(id, blob, folder = "photos") {
  if (!hasSupabaseEnv || !supabase) return null
  try {
    const mimeType = blob.type || (folder === "voices" ? "audio/webm" : "image/jpeg")
    const ext = mimeType.includes("webm") ? "webm"
      : mimeType.includes("mp4") ? "mp4"
      : mimeType.includes("ogg") ? "ogg"
      : mimeType.includes("png") ? "png"
      : "jpg"
    const path = `${folder}/${id}.${ext}`
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, blob, {
      contentType: mimeType,
      upsert: true,
    })
    if (error) throw error
    const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
    return {
      publicUrl: urlData?.publicUrl || null,
      storagePath: path,
      mimeType,
      fileExt: ext,
      sizeBytes: blob.size || 0,
    }
  } catch (err) {
    console.error("[mediaStore] cloud upload failed:", err)
    return null
  }
}

/**
 * Supabase Storage에서 미디어를 삭제한다.
 * storagePath가 있으면 정확한 경로 사용, 없으면 폴백.
 */
export async function deleteMediaFromCloud(id, folder = "photos", storagePath = null) {
  if (!hasSupabaseEnv || !supabase) return
  try {
    if (storagePath) {
      await supabase.storage.from(STORAGE_BUCKET).remove([storagePath])
    } else {
      // 레거시 폴백: 가능한 확장자 모두 시도
      await supabase.storage.from(STORAGE_BUCKET).remove([
        `${folder}/${id}.jpg`,
        `${folder}/${id}.webm`,
        `${folder}/${id}.mp4`,
        `${folder}/${id}.png`,
      ])
    }
  } catch (err) {
    console.error("[mediaStore] cloud delete failed:", err)
  }
}

export async function cleanupOrphanedMedia(features) {
  try {
    const referencedIds = new Set()
    for (const f of features) {
      for (const p of (f.photos || [])) {
        referencedIds.add(p.id)
        if (p.localId) referencedIds.add(p.localId)
      }
      for (const v of (f.voices || [])) {
        referencedIds.add(v.id)
        if (v.localId) referencedIds.add(v.localId)
      }
    }
    const allKeys = await getAllMediaKeys()
    let removed = 0
    for (const key of allKeys) {
      if (!referencedIds.has(key)) {
        await deleteMedia(key)
        removed++
      }
    }
    return removed
  } catch (error) {
    console.error("[mediaStore] 고아 미디어 정리 실패", error)
    return 0
  }
}
