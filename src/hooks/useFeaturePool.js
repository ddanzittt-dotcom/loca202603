import { useCallback } from "react"

export function useFeaturePool(setFeatures) {
  const updateFeatures = useCallback((updaterFn) => {
    setFeatures(updaterFn)
  }, [setFeatures])

  return { updateFeatures }
}
