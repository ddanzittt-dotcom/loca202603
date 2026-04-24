/**
 * 서버에서 받은 feature가 미디어/메모 배열을 비워서 내려줄 때
 * 클라이언트에 이미 있던 로컬 기록을 유지해 저장 누락 체감을 줄인다.
 */
export function mergeFeatureMediaFromLocal(nextFeature, localFeature) {
  if (!localFeature) return nextFeature

  return {
    ...nextFeature,
    photos: Array.isArray(nextFeature?.photos) && nextFeature.photos.length > 0
      ? nextFeature.photos
      : (localFeature.photos || []),
    voices: Array.isArray(nextFeature?.voices) && nextFeature.voices.length > 0
      ? nextFeature.voices
      : (localFeature.voices || []),
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

