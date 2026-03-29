import { useCallback } from "react"

export function useFeaturePool(activeMapSource, setFeatures, setCommunityMapFeatures) {
  const updateFeatures = useCallback((updaterFn) => {
    if (activeMapSource === "community") {
      setCommunityMapFeatures(updaterFn)
    } else {
      setFeatures(updaterFn)
    }
  }, [activeMapSource, setCommunityMapFeatures, setFeatures])

  return { updateFeatures }
}
