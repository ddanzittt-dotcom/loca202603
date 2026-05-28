const mediaKeys = (item = {}) => [
  item.id,
  item.localId,
  item.storagePath,
  item.url,
  item.cloudUrl,
  item.src,
].filter(Boolean).map((value) => `${value}`)

function findLocalMediaMatch(nextItem, localItems, consumed) {
  const keys = new Set(mediaKeys(nextItem))
  if (keys.size === 0) return null

  for (const item of localItems) {
    if (consumed.has(item)) continue
    if (mediaKeys(item).some((key) => keys.has(key))) return item
  }
  return null
}

function mergeMediaListWithLocal(nextList, localList) {
  const nextItems = Array.isArray(nextList) ? nextList : []
  const localItems = Array.isArray(localList) ? localList : []
  if (nextItems.length === 0) return localItems
  if (localItems.length === 0) return nextItems

  const consumed = new Set()
  const merged = nextItems.map((nextItem) => {
    const localMatch = findLocalMediaMatch(nextItem, localItems, consumed)
    if (!localMatch) return nextItem

    consumed.add(localMatch)
    return {
      ...localMatch,
      ...nextItem,
      localId: nextItem.localId || localMatch.localId,
    }
  })

  const localOnlyItems = localItems.filter((item) => !consumed.has(item))
  return [...merged, ...localOnlyItems]
}

/**
 * Keep browser-only media references while accepting fresher server rows.
 * Supabase media rows know the public URL, but the local IndexedDB key lives in
 * `localId`; losing it makes newly captured photos/voices look like they vanished.
 */
export function mergeFeatureMediaFromLocal(nextFeature, localFeature) {
  if (!localFeature) return nextFeature

  return {
    ...nextFeature,
    photos: mergeMediaListWithLocal(nextFeature?.photos, localFeature.photos),
    voices: mergeMediaListWithLocal(nextFeature?.voices, localFeature.voices),
    memos: Array.isArray(nextFeature?.memos) && nextFeature.memos.length > 0
      ? nextFeature.memos
      : (localFeature.memos || []),
  }
}

export function mergeFeatureListWithLocalMedia(nextFeatures = [], localFeatures = []) {
  const localById = new Map((localFeatures || []).map((feature) => [feature.id, feature]))
  return (nextFeatures || []).map((nextFeature) => (
    mergeFeatureMediaFromLocal(nextFeature, localById.get(nextFeature.id))
  ))
}

