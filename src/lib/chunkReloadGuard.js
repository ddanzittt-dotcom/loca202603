// 배포 직후 청크 자동 복구 가드
// 새 배포로 에셋 해시가 바뀌면, 이전 세션이 참조하던 lazy 청크(예전 해시)가 404 나면서
// dynamic import 가 실패해 흰 화면이 뜰 수 있다. index.html 은 network-first 라 새로고침하면
// 새 해시가 담긴 최신 셸을 받으므로 복구된다. 단, 진짜 404(롤백/삭제 등)로 재실패할 때
// 무한 새로고침을 막기 위해 짧은 시간창 안에서는 1회만 시도한다.

const GUARD_KEY = "loca.chunk_reload_at"
const GUARD_WINDOW_MS = 20000
const CHUNK_ERROR_RE = /(dynamically imported module|module script failed|error loading dynamically imported|loading chunk|chunkloaderror|failed to fetch dynamically)/i

function reloadedRecently() {
  try {
    const at = Number(sessionStorage.getItem(GUARD_KEY) || 0)
    return at > 0 && Date.now() - at < GUARD_WINDOW_MS
  } catch {
    return false
  }
}

let recovering = false
async function recoverByReload() {
  // 방금(시간창 내) 이미 시도했는데 또 실패 → 무한루프 방지, 에러 바운더리에 맡긴다.
  if (recovering || reloadedRecently()) return
  recovering = true
  try {
    sessionStorage.setItem(GUARD_KEY, String(Date.now()))
  } catch {
    /* 스토리지 접근 불가 시에도 새로고침은 진행 */
  }
  // 혹시 서비스워커가 옛 셸/에셋을 붙들고 있을 수 있어 캐시를 비운 뒤 새로고침.
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    /* 캐시 정리 실패해도 새로고침은 진행 */
  }
  window.location.reload()
}

// 새 배포로 청크 로드가 실패하면 캐시를 비우고 1회 새로고침해 자동 복구한다.
export function installChunkReloadGuard() {
  if (typeof window === "undefined") return

  // Vite 표준 이벤트 — preload/dynamic import 실패 시 발생.
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault?.() // 기본 throw 억제 후 직접 복구
    recoverByReload()
  })

  // 폴백 — 처리되지 않은 프로미스 거부 중 청크 로드 패턴만 잡는다.
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason
    const msg = (reason && (reason.message || String(reason))) || ""
    if (CHUNK_ERROR_RE.test(msg)) recoverByReload()
  })
}
