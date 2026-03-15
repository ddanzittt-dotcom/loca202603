import { useCallback, useEffect, useMemo, useRef, useState } from "react"

export function useLocalStorageState(key, initialValue) {
  const resolvedInitial = useMemo(() => {
    try {
      const saved = window.localStorage.getItem(key)
      if (saved) return JSON.parse(saved)
    } catch (error) {
      console.error(`Failed to read ${key} from localStorage`, error)
    }
    return typeof initialValue === "function" ? initialValue() : initialValue
  }, [initialValue, key])

  const [state, setState] = useState(resolvedInitial)

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state))
    } catch (error) {
      console.error(`Failed to save ${key} to localStorage`, error)
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
