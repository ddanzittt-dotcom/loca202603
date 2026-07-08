import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"

// Cloudflare Turnstile (봇 방어 CAPTCHA) 위젯.
// Managed 모드라 대부분 사용자에겐 보이지 않게 자동 통과되고, 봇 의심 시에만 도전이 뜬다.
// Supabase Auth 의 captchaToken 으로 전달되어 가입/로그인 남용을 차단한다.
// site key 는 공개값이라 코드에 두어도 안전(검증은 서버의 secret key 가 담당).

const SITE_KEY = "0x4AAAAAADyF8fNy4Ae75iA6"
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

let scriptPromise = null
function loadTurnstileScript() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"))
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script")
    s.src = SCRIPT_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => { scriptPromise = null; reject(new Error("turnstile load failed")) }
    document.head.appendChild(s)
  })
  return scriptPromise
}

export const Turnstile = forwardRef(function Turnstile({ onToken }, ref) {
  const elRef = useRef(null)
  const widgetIdRef = useRef(null)
  const cbRef = useRef(onToken)
  useEffect(() => { cbRef.current = onToken }, [onToken])

  useImperativeHandle(ref, () => ({
    reset() {
      if (widgetIdRef.current != null && window.turnstile) {
        try { window.turnstile.reset(widgetIdRef.current) } catch { /* noop */ }
      }
    },
  }))

  useEffect(() => {
    let mounted = true
    loadTurnstileScript()
      .then(() => {
        if (!mounted || !elRef.current || !window.turnstile || widgetIdRef.current != null) return
        widgetIdRef.current = window.turnstile.render(elRef.current, {
          sitekey: SITE_KEY,
          callback: (token) => cbRef.current?.(token),
          "expired-callback": () => cbRef.current?.(""),
          "error-callback": () => cbRef.current?.(""),
        })
      })
      .catch(() => cbRef.current?.(""))
    return () => {
      mounted = false
      if (widgetIdRef.current != null && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current) } catch { /* noop */ }
        widgetIdRef.current = null
      }
    }
  }, [])

  return <div ref={elRef} className="turnstile-widget" />
})
