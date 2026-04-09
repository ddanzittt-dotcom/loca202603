import { useState, useRef, useEffect, useCallback } from "react"
import jsQR from "jsqr"

export function ImportMapSheet({ open, onClose, onImport, showToast }) {
  const [mode, setMode] = useState(null) // null | "qr" | "code"
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [cameraError, setCameraError] = useState("")
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)

  // 카메라 정리
  const stopCamera = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  // 시트 닫힐 때 정리
  useEffect(() => {
    if (!open) { stopCamera(); setMode(null); setCode(""); setCameraError("") }
  }, [open, stopCamera])

  // QR 스캔 시작
  useEffect(() => {
    if (mode !== "qr") { stopCamera(); return }

    let cancelled = false
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
        })
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        video.setAttribute("playsinline", "true")
        await video.play()
        scanFrame()
      } catch {
        setCameraError("카메라를 사용할 수 없어요. 권한을 확인해주세요.")
      }
    }

    const scanFrame = () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(scanFrame)
        return
      }

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext("2d", { willReadFrequently: true })
      ctx.drawImage(video, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const qrResult = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      })

      if (qrResult?.data) {
        const extracted = extractCodeFromQR(qrResult.data)
        if (extracted) {
          stopCamera()
          handleImport(extracted)
          return
        }
      }
      rafRef.current = requestAnimationFrame(scanFrame)
    }

    startCamera()
    return () => { cancelled = true; stopCamera() }
  }, [mode, stopCamera]) // eslint-disable-line react-hooks/exhaustive-deps

  // QR 데이터에서 slug 코드 추출
  const extractCodeFromQR = (data) => {
    // URL 형태: /s/slug 또는 전체 URL
    try {
      const url = new URL(data, "https://loca.ddanzittt.com")
      const match = url.pathname.match(/\/s\/([^/?]+)/)
      if (match) return match[1]
    } catch { /* URL 아닌 경우 */ }
    // 그냥 코드 문자열인 경우
    const trimmed = data.trim()
    if (trimmed && trimmed.length >= 2 && trimmed.length <= 100) return trimmed
    return null
  }

  const handleImport = async (slugCode) => {
    const trimmed = (slugCode || code).trim()
    if (!trimmed) return
    setLoading(true)
    try {
      await onImport(trimmed)
      onClose()
    } catch (err) {
      showToast?.(err.message || "지도를 불러올 수 없어요.")
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <>
      <div className="import-map-overlay" onClick={onClose} />
      <div className="import-map-modal">
        {!mode ? (
          <>
            <h3 className="import-map-modal__title">발행 지도 불러오기</h3>
            <div className="import-map-sheet__options">
              <button
                className="import-map-sheet__option"
                type="button"
                onClick={() => setMode("qr")}
              >
                <span className="import-map-sheet__option-icon">📷</span>
                <strong>QR 스캔</strong>
              </button>
              <button
                className="import-map-sheet__option"
                type="button"
                onClick={() => setMode("code")}
              >
                <span className="import-map-sheet__option-icon">⌨️</span>
                <strong>코드 입력</strong>
              </button>
            </div>
          </>
        ) : null}

        {/* QR 스캔 모드 */}
        {mode === "qr" ? (
          <div className="import-map-sheet__qr">
            {cameraError ? (
              <div className="import-map-sheet__error">
                <p>{cameraError}</p>
                <button className="button button--ghost" type="button" onClick={() => setMode(null)}>돌아가기</button>
              </div>
            ) : (
              <>
                <div className="import-map-sheet__camera">
                  <video ref={videoRef} className="import-map-sheet__video" muted playsInline />
                  <canvas ref={canvasRef} style={{ display: "none" }} />
                  <div className="import-map-sheet__viewfinder" />
                </div>
                <p className="import-map-sheet__hint">QR 코드를 화면 가운데에 맞춰주세요</p>
                <button className="button button--ghost" type="button" onClick={() => setMode(null)}>돌아가기</button>
              </>
            )}
          </div>
        ) : null}

        {/* 코드 입력 모드 */}
        {mode === "code" ? (
          <div className="import-map-sheet__code">
            <label className="field">
              <span>발행 코드</span>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="예: my-map-slug"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter" && code.trim()) handleImport() }}
              />
            </label>
            <div className="import-map-sheet__code-actions">
              <button className="button button--ghost" type="button" onClick={() => setMode(null)}>돌아가기</button>
              <button
                className="button button--primary"
                type="button"
                onClick={() => handleImport()}
                disabled={!code.trim() || loading}
              >
                {loading ? "불러오는 중..." : "불러오기"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}
