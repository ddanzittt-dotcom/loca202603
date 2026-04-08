import { deleteMedia, deleteMediaFromCloud } from "./mediaStore"
import { deleteMediaRecord } from "./mapService"

/**
 * 피처 하나의 미디어(사진+음성)를 모두 삭제한다.
 * useFeatureEditing, useMapCRUD에서 공용으로 사용.
 *
 * @param {object} feature - photos[], voices[] 포함
 * @param {boolean} cloudMode - 클라우드 모드 여부
 * @param {boolean} [deleteRecords=true] - DB 레코드도 삭제할지 (지도 삭제 시 cascade로 이미 삭제되므로 false)
 */
export async function cleanupFeatureMedia(feature, cloudMode, deleteRecords = true) {
  for (const photo of (feature.photos || [])) {
    try { await deleteMedia(photo.id) } catch { /* ignore */ }
    if (photo.localId) try { await deleteMedia(photo.localId) } catch { /* ignore */ }
    if (cloudMode && (photo.storagePath || photo.url)) {
      if (deleteRecords) deleteMediaRecord(photo.id).catch(() => null)
      deleteMediaFromCloud(photo.id, "photos", photo.storagePath || null)
    }
  }
  for (const voice of (feature.voices || [])) {
    try { await deleteMedia(voice.id) } catch { /* ignore */ }
    if (voice.localId) try { await deleteMedia(voice.localId) } catch { /* ignore */ }
    if (cloudMode && (voice.storagePath || voice.url)) {
      if (deleteRecords) deleteMediaRecord(voice.id).catch(() => null)
      deleteMediaFromCloud(voice.id, "voices", voice.storagePath || null)
    }
  }
}
