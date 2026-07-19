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
