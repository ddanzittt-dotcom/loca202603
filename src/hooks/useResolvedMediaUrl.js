import { useCallback, useEffect, useState } from "react"
import { getMedia } from "../lib/mediaStore"

export function getRemoteMediaUrl(media = {}) {
  return media.url || media.cloudUrl || media.thumbnail || media.src || ""
}

export function useResolvedMediaUrl(media, { preferLocal = false } = {}) {
  const remoteUrl = getRemoteMediaUrl(media)
  const localKeySignature = [media?.localId, media?.id].filter(Boolean).map((value) => `${value}`).join("|")
  const [localState, setLocalState] = useState({ key: "", url: "" })
  const [failedRemoteUrl, setFailedRemoteUrl] = useState("")
  const remoteFailed = Boolean(remoteUrl && failedRemoteUrl === remoteUrl)
  const localUrl = localState.key === localKeySignature ? localState.url : ""

  useEffect(() => {
    let objectUrl = ""
    let cancelled = false
    const localKeys = localKeySignature.split("|").filter(Boolean)

    const shouldLoadLocal = preferLocal || !remoteUrl || remoteFailed
    if (!shouldLoadLocal || localKeys.length === 0) {
      return undefined
    }

    const loadLocal = async () => {
      for (const key of localKeys) {
        try {
          const blob = await getMedia(key)
          if (blob && !cancelled) {
            objectUrl = URL.createObjectURL(blob)
            setLocalState({ key: localKeySignature, url: objectUrl })
            return
          }
        } catch {
          // Try the next possible key.
        }
      }
    }

    loadLocal()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [localKeySignature, preferLocal, remoteFailed, remoteUrl])

  const markRemoteFailed = useCallback(() => {
    if (remoteUrl) setFailedRemoteUrl(remoteUrl)
  }, [remoteUrl])

  return {
    src: preferLocal ? (localUrl || remoteUrl) : (remoteFailed ? (localUrl || "") : (remoteUrl || localUrl)),
    remoteUrl,
    localUrl,
    markRemoteFailed,
  }
}
