// 장소 카드 → 인스타 공유용 이미지(PNG) 생성 + 공유/다운로드.
// 포스터 DOM 노드를 html2canvas 로 굽고, 모바일은 OS 공유시트(→ 인스타),
// 데스크톱/미지원 환경은 다운로드로 폴백한다.

// 파일명 안전화 — 한글/영숫자만 남기고 나머지는 _
export function sanitizeCardFilename(name) {
  const base = `${name || "place"}`.trim().replace(/[^\w가-힣]+/g, "_").replace(/^_+|_+$/g, "")
  return `LOCA_${base || "card"}.png`
}

// 포스터 노드를 1080×1350 PNG Blob 으로 캡처.
export async function capturePosterBlob(node) {
  if (!node) return null
  const html2canvas = (await import("html2canvas")).default
  // 둥근모 등 웹폰트가 로드된 뒤 캡처해야 글자가 제대로 그려진다
  if (document.fonts?.ready) {
    try { await document.fonts.ready } catch { /* noop */ }
  }
  const canvas = await html2canvas(node, {
    useCORS: true,
    backgroundColor: null,
    scale: 1, // 노드가 이미 목표 픽셀 크기(1080×1350)
    logging: false,
  })
  return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"))
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// PNG 다운로드.
export function downloadImage(blob, filename) {
  triggerDownload(blob, filename)
}

// 공유 시도 → "shared" | "downloaded" | "canceled".
// 파일 공유(navigator.share files)를 지원하면 OS 공유시트를 열고(모바일 → 인스타),
// 아니면 다운로드로 폴백한다.
export async function shareImage(blob, { filename, title, text }) {
  const file = new File([blob], filename, { type: "image/png" })
  const canShareFiles =
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  if (canShareFiles) {
    try {
      await navigator.share({ files: [file], title, text })
      return "shared"
    } catch (err) {
      if (err?.name === "AbortError") return "canceled"
      // 그 외 실패 → 다운로드 폴백
    }
  }
  triggerDownload(blob, filename)
  return "downloaded"
}
