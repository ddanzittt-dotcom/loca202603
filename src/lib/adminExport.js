// CSV 내보내기 유틸 — /admin 데이터 대시보드 전용.
// 엑셀(한글 Windows) 호환을 위해 UTF-8 BOM(U+FEFF)을 붙여 다운로드한다.

// 셀에 쉼표/따옴표/개행이 있으면 CSV 규칙대로 이스케이프.
// 문자열 셀이 =, +, -, @, 탭, CR 로 시작하면 작은따옴표를 붙여 엑셀 수식 실행을 차단한다
// (CSV 수식 인젝션 방어 — region_name 등 사용자 통제 문자열이 외부 제출 CSV 에 실림).
function escapeCell(value) {
  if (value === null || value === undefined) return ""
  let s = String(value)
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

// headers: 문자열 배열, rows: 배열의 배열 — Blob 으로 즉시 다운로드
export function downloadCsv(filename, headers, rows) {
  const lines = [headers, ...(rows || [])].map((row) => (row || []).map(escapeCell).join(","))
  const blob = new Blob([String.fromCharCode(0xFEFF) + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

// 파일명용 YYYYMMDD 스탬프
export function formatStamp() {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
}

// SVG DOM 을 PNG 로 래스터화해 다운로드 — /admin 밀도 지도 이미지 저장(미팅용 한 장).
// 폰트/외부 리소스에 의존하지 않는 순수 인라인 SVG 라서 canvas tainting 없이 안전하다.
// scale 배로 캔버스를 키워 선명하게 굽고, 투명 대신 흰 배경을 깔아준다.
// 실패 시 콘솔 경고만 남기고 조용히 종료(다운로드 실패가 대시보드를 깨지 않게).
export async function downloadSvgPng(svgEl, filename, scale = 2) {
  if (!svgEl || typeof svgEl.getBoundingClientRect !== "function") {
    console.warn("downloadSvgPng: SVG 요소가 없어요.")
    return
  }
  try {
    const rect = svgEl.getBoundingClientRect()
    const vb = svgEl.viewBox?.baseVal
    const w = Math.round((vb && vb.width) || rect.width || 620)
    const h = Math.round((vb && vb.height) || rect.height || 590)

    let source = new XMLSerializer().serializeToString(svgEl)
    // 분리된 SVG 문서에는 부모 :root 의 커스텀 프로퍼티가 없어 var() 가 검정으로 굳는다.
    // 화면에서 계산된 실제 색을 읽어 직렬화 문자열의 var() 참조를 치환한다(화면=이미지 일치).
    try {
      const cs = typeof window !== "undefined" ? window.getComputedStyle(svgEl) : null
      if (cs) {
        const vars = ["--accent-deep", "--accent-faint", "--accent"] // -deep 를 먼저(부분매치 방지)
        for (const name of vars) {
          const val = cs.getPropertyValue(name).trim()
          if (val) source = source.split(`var(${name})`).join(val)
        }
      }
    } catch { /* 색 치환 실패해도 저장은 진행 */ }
    // xmlns 가 빠져 있으면 Image 로딩이 실패하므로 보강
    const withNs = /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(source)
      ? source
      : source.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"')
    const svgBlob = new Blob([withNs], { type: "image/svg+xml;charset=utf-8" })
    const svgUrl = URL.createObjectURL(svgBlob)

    const img = new Image()
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
      img.src = svgUrl
    })

    const canvas = document.createElement("canvas")
    canvas.width = w * scale
    canvas.height = h * scale
    const ctx = canvas.getContext("2d")
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    URL.revokeObjectURL(svgUrl)

    const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"))
    if (!pngBlob) {
      console.warn("downloadSvgPng: PNG 변환에 실패했어요.")
      return
    }
    const url = URL.createObjectURL(pngBlob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  } catch (error) {
    console.warn("downloadSvgPng: 이미지 저장 실패", error)
  }
}
