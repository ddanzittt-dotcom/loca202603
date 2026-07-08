import { useCallback, useEffect, useRef, useState } from "react"
import { CheckCircle2, EyeOff, Loader2, LogIn, MapPin, RefreshCw, ShieldCheck, ShieldAlert, XCircle } from "lucide-react"
import { getCurrentUser, onAuthStateChange } from "../lib/auth"
import {
  MODERATION_ACTIONS,
  MODERATION_TABS,
  checkPlatformAdmin,
  listModerationRecords,
  updateModerationStatus,
} from "../lib/adminModeration"

// 커뮤니티(모두의 지도) 관리 화면 — /admin.
// platform_admin 만 접근 가능(서버 RPC 게이트 + 클라이언트 선판별).
// 신고/대기 커뮤니티 기록을 승인/반려/숨김 처리한다.

const ACTION_ICON = { approved: CheckCircle2, rejected: XCircle, hidden: EyeOff }

function formatDate(value) {
  if (!value) return ""
  try {
    const d = new Date(value)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  } catch {
    return ""
  }
}

export function AdminScreen() {
  // phase: 'loading' | 'anon' | 'forbidden' | 'ready'
  const [phase, setPhase] = useState("loading")
  const [activeTab, setActiveTab] = useState("pending")
  const [records, setRecords] = useState([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState("")
  const [actioningId, setActioningId] = useState(null)
  const [toast, setToast] = useState("")
  const toastTimer = useRef(null)

  useEffect(() => {
    document.title = "LOCA 관리자"
  }, [])

  const showToast = useCallback((message) => {
    setToast(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(""), 2600)
  }, [])

  // 인증 + 어드민 판별
  const resolveAccess = useCallback(async () => {
    try {
      const user = await getCurrentUser().catch(() => null)
      if (!user) { setPhase("anon"); return }
      const isAdmin = await checkPlatformAdmin()
      setPhase(isAdmin ? "ready" : "forbidden")
    } catch {
      setPhase("anon")
    }
  }, [])

  useEffect(() => {
    resolveAccess()
    const sub = onAuthStateChange(() => { resolveAccess() })
    return () => {
      sub?.data?.subscription?.unsubscribe?.()
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [resolveAccess])

  const loadList = useCallback(async (status) => {
    setListLoading(true)
    setListError("")
    try {
      const rows = await listModerationRecords(status, 80)
      setRecords(rows)
    } catch (error) {
      setListError(error?.message || "목록을 불러오지 못했어요.")
      setRecords([])
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    if (phase === "ready") loadList(activeTab)
  }, [phase, activeTab, loadList])

  const handleAction = useCallback(async (record, status) => {
    setActioningId(record.id)
    try {
      await updateModerationStatus(record.id, status)
      // 현재 탭 기준에서 사라지므로 목록에서 제거
      setRecords((current) => current.filter((item) => item.id !== record.id))
      const label = MODERATION_ACTIONS.find((a) => a.key === status)?.label || status
      showToast(`"${record.title || "제목 없음"}" → ${label} 처리했어요.`)
    } catch (error) {
      showToast(error?.message || "처리하지 못했어요.")
    } finally {
      setActioningId(null)
    }
  }, [showToast])

  if (phase === "loading") {
    return (
      <div className="admin-shell admin-center">
        <Loader2 className="admin-spin" size={22} aria-hidden="true" />
        <p>권한 확인 중…</p>
      </div>
    )
  }

  if (phase === "anon") {
    return (
      <div className="admin-shell admin-center">
        <LogIn size={30} aria-hidden="true" />
        <h1>로그인이 필요해요</h1>
        <p>관리자 계정으로 로그인한 뒤 다시 접속해 주세요.</p>
        <a className="admin-btn admin-btn--primary" href="/">로그인하러 가기</a>
      </div>
    )
  }

  if (phase === "forbidden") {
    return (
      <div className="admin-shell admin-center">
        <ShieldAlert size={30} aria-hidden="true" />
        <h1>접근 권한이 없어요</h1>
        <p>이 페이지는 운영 관리자만 이용할 수 있어요.</p>
        <a className="admin-btn" href="/">홈으로</a>
      </div>
    )
  }

  const currentTabLabel = MODERATION_TABS.find((t) => t.key === activeTab)?.label || ""

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-header__title">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>커뮤니티 관리</span>
        </div>
        <button type="button" className="admin-refresh" onClick={() => loadList(activeTab)} disabled={listLoading}>
          <RefreshCw size={14} aria-hidden="true" className={listLoading ? "admin-spin" : ""} />
          새로고침
        </button>
      </header>

      <nav className="admin-tabs" aria-label="상태 필터">
        {MODERATION_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`admin-tab${activeTab === tab.key ? " is-active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="admin-list">
        {listLoading ? (
          <div className="admin-center admin-center--pad">
            <Loader2 className="admin-spin" size={20} aria-hidden="true" />
            <p>불러오는 중…</p>
          </div>
        ) : listError ? (
          <div className="admin-center admin-center--pad">
            <p className="admin-error">{listError}</p>
            <button type="button" className="admin-btn" onClick={() => loadList(activeTab)}>다시 시도</button>
          </div>
        ) : records.length === 0 ? (
          <div className="admin-center admin-center--pad">
            <CheckCircle2 size={26} aria-hidden="true" />
            <p>{currentTabLabel} 항목이 없어요.</p>
          </div>
        ) : (
          records.map((record) => (
            <article key={record.id} className="admin-card">
              <div className="admin-card__head">
                <span className={`admin-badge admin-badge--${record.type || "place"}`}>
                  {record.type === "route" ? "길" : "장소"}
                </span>
                <h2 className="admin-card__title">{record.title || "제목 없음"}</h2>
              </div>
              {record.description ? <p className="admin-card__desc">{record.description}</p> : null}
              {Array.isArray(record.keywords) && record.keywords.length ? (
                <div className="admin-card__tags">
                  {record.keywords.slice(0, 6).map((kw, i) => <span key={`${record.id}-kw-${i}`}>#{kw}</span>)}
                </div>
              ) : null}
              <dl className="admin-card__meta">
                {record.author_name ? <div><dt>작성</dt><dd>{record.author_name}</dd></div> : null}
                {Number.isFinite(Number(record.lat)) && Number.isFinite(Number(record.lng)) ? (
                  <div><dt><MapPin size={11} aria-hidden="true" /></dt><dd>{Number(record.lat).toFixed(4)}, {Number(record.lng).toFixed(4)}</dd></div>
                ) : null}
                {record.created_at ? <div><dt>등록</dt><dd>{formatDate(record.created_at)}</dd></div> : null}
              </dl>
              <div className="admin-card__actions">
                {MODERATION_ACTIONS.filter((a) => a.key !== activeTab).map((action) => {
                  const Icon = ACTION_ICON[action.key]
                  return (
                    <button
                      key={action.key}
                      type="button"
                      className={`admin-act admin-act--${action.key}`}
                      disabled={actioningId === record.id}
                      onClick={() => handleAction(record, action.key)}
                    >
                      {actioningId === record.id ? <Loader2 className="admin-spin" size={13} aria-hidden="true" /> : <Icon size={13} aria-hidden="true" />}
                      {action.label}
                    </button>
                  )
                })}
              </div>
            </article>
          ))
        )}
      </main>

      {toast ? <div className="admin-toast" role="status">{toast}</div> : null}
    </div>
  )
}
