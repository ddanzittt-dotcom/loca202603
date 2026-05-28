const RECORD_GROUP_WINDOW_MS = 15 * 60 * 1000

export function recordDateValue(item) {
  return item?.date || item?.createdAt || item?.updatedAt || item?.capturedAt || item?.recordedAt || ""
}

export function recordTime(item) {
  const value = recordDateValue(item)
  const time = new Date(value || 0).getTime()
  return Number.isFinite(time) ? time : 0
}

export function formatRecordDate(value) {
  if (!value) return ""
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) return ""
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric" })
}

export function recordEntryId(item) {
  return `${item?.recordId || item?.record_id || item?.entryId || item?.recordEntryId || ""}`.trim()
}

function itemId(item, fallback) {
  return `${item?.id || item?.localId || fallback}`
}

function photoKey(photo) {
  if (typeof photo === "string") return photo
  return photo?.id || photo?.localId || photo?.url || photo?.src || photo?.cloudUrl || ""
}

function normalizeMemoPhoto(photo, memo, index) {
  if (typeof photo === "string") {
    return {
      id: `${itemId(memo, "memo")}-photo-${index}`,
      url: photo,
      date: recordDateValue(memo),
      source: "memo",
      recordId: recordEntryId(memo) || null,
    }
  }
  return {
    ...photo,
    id: photo?.id || photo?.localId || `${itemId(memo, "memo")}-photo-${index}`,
    date: recordDateValue(photo) || recordDateValue(memo),
    source: photo?.source || "memo",
    recordId: recordEntryId(photo) || recordEntryId(memo) || null,
  }
}

function createGroup({ id, recordId = null, at, dateValue, memo = null }) {
  return {
    id,
    recordId,
    at,
    dateValue,
    memos: memo ? [memo] : [],
    photos: [],
    voices: [],
  }
}

function touchGroupTime(group, at, dateValue) {
  if (at > group.at) {
    group.at = at
    group.dateValue = dateValue || group.dateValue
  }
}

function ensureRecordGroup(groups, byRecordId, recordId, seed = {}) {
  if (byRecordId.has(recordId)) return byRecordId.get(recordId)
  const group = createGroup({
    id: `record-group-${recordId}`,
    recordId,
    at: seed.at || 0,
    dateValue: seed.dateValue || "",
  })
  byRecordId.set(recordId, group)
  groups.push(group)
  return group
}

function nearestGroup(groups, at, windowMs) {
  if (!at) return null
  let best = null
  let bestDelta = Infinity
  for (const group of groups) {
    const delta = Math.abs(group.at - at)
    if (delta <= windowMs && delta < bestDelta) {
      best = group
      bestDelta = delta
    }
  }
  return best
}

function addMediaToGroup(groups, item, kind, index, windowMs) {
  const at = recordTime(item)
  const dateValue = recordDateValue(item)
  const legacyGroups = groups.filter((group) => !group.recordId)
  const group = nearestGroup(legacyGroups, at, windowMs)
    || createGroup({
      id: `${kind}-group-${itemId(item, index)}`,
      at,
      dateValue,
    })

  if (!groups.includes(group)) groups.push(group)
  group[kind].push(item)
  touchGroupTime(group, at, dateValue)
}

export function buildFeatureRecordGroups(feature, { windowMs = RECORD_GROUP_WINDOW_MS } = {}) {
  const memos = Array.isArray(feature?.memos) ? feature.memos : []
  const photos = Array.isArray(feature?.photos) ? feature.photos : []
  const voices = Array.isArray(feature?.voices) ? feature.voices : []
  const memoPhotoKeys = new Set()
  const groups = []
  const byRecordId = new Map()

  memos.forEach((memo, index) => {
    const at = recordTime(memo)
    const dateValue = recordDateValue(memo)
    const recordId = recordEntryId(memo)
    const group = recordId
      ? ensureRecordGroup(groups, byRecordId, recordId, { at, dateValue })
      : createGroup({
        id: `memo-group-${itemId(memo, index)}`,
        at,
        dateValue,
      })
    if (!groups.includes(group)) groups.push(group)
    group.memos.push(memo)
    touchGroupTime(group, at, dateValue)
    const memoPhotos = Array.isArray(memo?.photos) ? memo.photos : []
    group.photos.push(...memoPhotos.map((photo, photoIndex) => {
      const normalized = normalizeMemoPhoto(photo, memo, photoIndex)
      const key = photoKey(normalized)
      if (key) memoPhotoKeys.add(key)
      return normalized
    }))
  })

  photos.forEach((photo, index) => {
    const key = photoKey(photo)
    if (key && memoPhotoKeys.has(key)) return
    const recordId = recordEntryId(photo)
    if (recordId) {
      const at = recordTime(photo)
      const dateValue = recordDateValue(photo)
      const group = ensureRecordGroup(groups, byRecordId, recordId, { at, dateValue })
      group.photos.push(photo)
      touchGroupTime(group, at, dateValue)
      return
    }
    addMediaToGroup(groups, photo, "photos", index, windowMs)
  })

  voices.forEach((voice, index) => {
    const recordId = recordEntryId(voice)
    if (recordId) {
      const at = recordTime(voice)
      const dateValue = recordDateValue(voice)
      const group = ensureRecordGroup(groups, byRecordId, recordId, { at, dateValue })
      group.voices.push(voice)
      touchGroupTime(group, at, dateValue)
      return
    }
    addMediaToGroup(groups, voice, "voices", index, windowMs)
  })

  return groups
    .filter((group) => group.memos.length || group.photos.length || group.voices.length)
    .sort((a, b) => b.at - a.at)
}

export function summarizeRecordGroup(group) {
  const text = group?.memos
    ?.map((memo) => `${memo?.text || memo?.memo || memo?.content || ""}`.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim()

  const parts = []
  if (group?.photos?.length) parts.push(`사진 ${group.photos.length}`)
  if (group?.voices?.length) parts.push(`음성 ${group.voices.length}`)
  if (text) parts.push("메모")

  return {
    text,
    assetLabel: parts.join(" · "),
  }
}
