import { useCallback, useEffect, useMemo, useRef, useState } from "react"

const MAX_STORAGE_VALUE_SIZE = 5 * 1024 * 1024 // 5MB per key
const WARN_THRESHOLD = 0.8 // 80%

let _storageWarningCallback = null
export function setStorageWarningCallback(fn) { _storageWarningCallback = fn }

function checkStorageWarning(key, size) {
  const ratio = size / MAX_STORAGE_VALUE_SIZE
  if (ratio >= 1) {
    _storageWarningCallback?.(`저장 공간이 가득 찼어요. '${key}' 데이터를 백업해 주세요.`)
    return false
  }
  if (ratio >= WARN_THRESHOLD) {
    _storageWarningCallback?.(`저장 공간이 ${Math.round(ratio * 100)}% 찼어요. 백업을 권장합니다.`)
  }
  return true
}

export function useLocalStorageState(key, initialValue) {
  const resolvedInitial = useMemo(() => {
    try {
      const saved = window.localStorage.getItem(key)
      if (saved) {
        if (saved.length > MAX_STORAGE_VALUE_SIZE) {
          console.warn(`localStorage key ${key} exceeds size limit`)
          _storageWarningCallback?.(`'${key}' 데이터가 용량을 초과했어요. 프로필 > 백업에서 데이터를 저장해 주세요.`)
          return typeof initialValue === "function" ? initialValue() : initialValue
        }
        const parsed = JSON.parse(saved)
        if (parsed && typeof parsed === "object" && parsed.constructor !== Object && !Array.isArray(parsed)) {
          console.warn(`localStorage key ${key} has unexpected type, resetting`)
          window.localStorage.removeItem(key)
          return typeof initialValue === "function" ? initialValue() : initialValue
        }
        return parsed
      }
    } catch (error) {
      console.error(`Failed to read ${key} from localStorage`, error)
      try { window.localStorage.removeItem(key) } catch { /* ignore */ }
    }
    return typeof initialValue === "function" ? initialValue() : initialValue
  }, [initialValue, key])

  const [state, setState] = useState(resolvedInitial)

  useEffect(() => {
    try {
      const json = JSON.stringify(state)
      if (!checkStorageWarning(key, json.length)) {
        console.error(`localStorage key ${key} value too large, skipping save`)
        return
      }
      window.localStorage.setItem(key, json)
    } catch (error) {
      console.error(`Failed to save ${key} to localStorage`, error)
      _storageWarningCallback?.("저장에 실패했어요. 저장 공간이 부족할 수 있습니다.")
    }
  }, [key, state])

  return [state, setState]
}

export function useToast() {
  const [message, setMessage] = useState("")
  const timeoutRef = useRef(null)

  const show = useCallback((nextMessage) => {
    setMessage(nextMessage)
    window.clearTimeout(timeoutRef.current)
    timeoutRef.current = window.setTimeout(() => setMessage(""), 2200)
  }, [])

  useEffect(() => () => window.clearTimeout(timeoutRef.current), [])
  return { message, show }
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener("online", goOnline)
    window.addEventListener("offline", goOffline)
    return () => {
      window.removeEventListener("online", goOnline)
      window.removeEventListener("offline", goOffline)
    }
  }, [])

  return isOnline
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isStandalone, setIsStandalone] = useState(() => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true)

  useEffect(() => {
    const handleBeforeInstall = (event) => {
      event.preventDefault()
      setDeferredPrompt(event)
    }
    const handleInstalled = () => {
      setDeferredPrompt(null)
      setIsStandalone(true)
    }
    const media = window.matchMedia("(display-mode: standalone)")
    const handleMediaChange = (event) => setIsStandalone(event.matches)
    window.addEventListener("beforeinstallprompt", handleBeforeInstall)
    window.addEventListener("appinstalled", handleInstalled)
    media.addEventListener?.("change", handleMediaChange)
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall)
      window.removeEventListener("appinstalled", handleInstalled)
      media.removeEventListener?.("change", handleMediaChange)
    }
  }, [])

  const userAgent = window.navigator.userAgent.toLowerCase()
  const isIOS = /iphone|ipad|ipod/.test(userAgent)
  const isSafari = /safari/.test(userAgent) && !/crios|fxios|edgios|android/.test(userAgent)

  let installHint = "브라우저 메뉴에서 '앱 설치' 또는 '홈 화면에 추가'를 사용할 수 있어요."
  if (isStandalone) installHint = "이미 홈 화면에 설치되어 있어요."
  else if (deferredPrompt) installHint = "버튼을 눌러 홈 화면에 바로 설치할 수 있어요."
  else if (isIOS && isSafari) installHint = "Safari 공유 메뉴에서 '홈 화면에 추가'를 선택하세요."

  const promptInstall = async () => {
    if (!deferredPrompt) return false
    deferredPrompt.prompt()
    const result = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    return result.outcome === "accepted"
  }

  return { canInstall: Boolean(deferredPrompt) && !isStandalone, isStandalone, installHint, promptInstall }
}
