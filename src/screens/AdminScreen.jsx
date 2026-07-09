import { useCallback, useEffect, useRef, useState } from "react"
import { CheckCircle2, EyeOff, Loader2, LogIn, MapPin, RefreshCw, ShieldCheck, ShieldAlert, XCircle } from "lucide-react"
import { getCurrentUser, onAuthStateChange } from "../lib/auth"
import {
  MODERATION_ACTIONS,
  MODERATION_TABS,
  checkPlatformAdmin,
  getAdminDemographics,
  getAdminInsights,
  getAdminOverview,
  listModerationRecords,
  updateModerationStatus,
} from "../lib/adminModeration"
import { ageBandLabel } from "../lib/demographics"

// 커뮤니티(모두의 지도) 관리 화면 — /admin.
// platform_admin 만 접근 가능(서버 RPC 게이트 + 클라이언트 선판별).
// 신고/대기 커뮤니티 기록을 승인/반려/숨김 처리한다.

const ACTION_ICON = { approved: CheckCircle2, rejected: XCircle, hidden: EyeOff }

function num(value) {
  return value === null || value === undefined ? "–" : Number(value).toLocaleString("ko-KR")
}

function formatDate(value) {
  if (!value) return ""
  try {
    const d = new Date(value)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  } catch {
    return ""
  }
}

function StatCard({ label, value, sub }) {
  return (
    <div className="admin-stat">
      <span className="admin-stat__label">{label}</span>
      <span className="admin-stat__value">{value}</span>
      {sub ? <span className="admin-stat__sub">{sub}</span> : null}
    </div>
  )
}

export function AdminScreen() {
  // phase: 'loading' | 'anon' | 'forbidden' | 'ready'
  const [phase, setPhase] = useState("loading")
  const [activeTab, setActiveTab] = useState("pending")
  const [records, setRecords] = useState([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState("")
  const [actioningId, setActioningId] = useState(null)
  const [overview, setOverview] = useState(null)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [insights, setInsights] = useState(null)
  const [insightsError, setInsightsError] = useState("")
  const [demographics, setDemographics] = useState(null)
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

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true)
    setInsightsError("")
    try {
      setOverview(await getAdminOverview())
    } catch {
      setOverview(null)
    }
    try {
      setInsights(await getAdminInsights())
    } catch (error) {
      setInsights(null)
      setInsightsError(error?.message || "인사이트를 불러오지 못했어요.")
    }
    try {
      setDemographics(await getAdminDemographics())
    } catch {
      setDemographics(null)
    } finally {
      setOverviewLoading(false)
    }
  }, [])

  useEffect(() => {
    if (phase === "ready") loadOverview()
  }, [phase, loadOverview])

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
        <button type="button" className="admin-refresh" onClick={() => { loadOverview(); loadList(activeTab) }} disabled={listLoading || overviewLoading}>
          <RefreshCw size={14} aria-hidden="true" className={(listLoading || overviewLoading) ? "admin-spin" : ""} />
          새로고침
        </button>
      </header>

      <section className="admin-overview" aria-label="운영 통계">
        <h2 className="admin-section-title">운영 현황</h2>
        {overviewLoading && !overview ? (
          <div className="admin-center admin-center--pad"><Loader2 className="admin-spin" size={18} aria-hidden="true" /></div>
        ) : !overview ? (
          <p className="admin-error">통계를 불러오지 못했어요. 056 마이그레이션이 적용됐는지 확인해 주세요.</p>
        ) : (
          <div className="admin-stats">
            <StatCard label="전체 가입자" value={num(overview.users_total)} sub={`최근 7일 +${num(overview.users_7d)} · 30일 +${num(overview.users_30d)}`} />
            <StatCard label="전체 지도" value={num(overview.maps_total)} sub={`발행 ${num(overview.maps_published)} · 7일 +${num(overview.maps_7d)}`} />
            <StatCard label="장소·기록" value={num(overview.features_total)} sub={`장소 ${num(overview.features_pin)} · 길 ${num(overview.features_route)} · 영역 ${num(overview.features_area)}`} />
            <StatCard label="기록(메모)" value={num(overview.memos_total)} sub={`팔로우 ${num(overview.follows_total)}건`} />
            <StatCard label="누적 조회수" value={num(overview.views_total)} sub={`최근 7일 ${num(overview.views_7d)}`} />
            <StatCard label="순 방문자(30일)" value={num(overview.visitors_30d)} sub={overview.visitors_30d === null ? "집계 불가" : "고유 세션 기준"} />
            {overview.community_total !== null ? (
              <StatCard label="커뮤니티 기록" value={num(overview.community_total)} sub={`승인 대기 ${num(overview.community_pending)}`} />
            ) : null}
          </div>
        )}
      </section>

      {insightsError ? (
        <p className="admin-error">{insightsError} (057 마이그레이션 적용 여부를 확인해 주세요)</p>
      ) : null}

      {insights ? (
        <>
          {/* ── 지역 자산 ── */}
          <section className="admin-overview" aria-label="지역 자산">
            <h2 className="admin-section-title">지역 자산</h2>
            <div className="admin-stats">
              <StatCard label="NEW FIND (지도에 없던 곳)" value={num(insights.new_find_total)} sub={`최근 7일 +${num(insights.new_find_7d)}`} />
              <StatCard
                label="동네 태깅률"
                value={insights.features_geo_total ? `${Math.round((insights.features_region_tagged / insights.features_geo_total) * 100)}%` : "–"}
                sub={`${num(insights.features_region_tagged)} / ${num(insights.features_geo_total)} 카드`}
              />
              <StatCard label="기록된 동네 수" value={num((insights.region_top || []).length >= 15 ? "15+" : (insights.region_top || []).length)} sub="카드가 있는 법정동" />
            </div>
            {(insights.region_top || []).length ? (
              <table className="admin-table">
                <thead>
                  <tr><th>동네</th><th>카드</th><th>7일</th><th>새발견</th></tr>
                </thead>
                <tbody>
                  {insights.region_top.map((row) => (
                    <tr key={row.region}>
                      <td>{row.region}</td>
                      <td>{num(row.total)}</td>
                      <td>{row.d7 ? `+${num(row.d7)}` : "–"}</td>
                      <td>{num(row.new_finds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="admin-empty-note">아직 동네 태깅된 카드가 없어요.</p>
            )}
            {(insights.top_tags || []).length ? (
              <div className="admin-chips" aria-label="인기 태그">
                {insights.top_tags.map((t) => (
                  <span key={t.tag} className="admin-chip">#{t.tag} <em>{num(t.cnt)}</em></span>
                ))}
              </div>
            ) : null}
          </section>

          {/* ── 주간 추이 ── */}
          <section className="admin-overview" aria-label="주간 추이">
            <h2 className="admin-section-title">주간 추이 (최근 8주)</h2>
            {(() => {
              const weeks = insights.weekly || []
              const max = Math.max(1, ...weeks.map((w) => Number(w.features) || 0))
              return (
                <div className="admin-bars" role="img" aria-label="주별 새 카드 수">
                  {weeks.map((w) => (
                    <div key={w.week_start} className="admin-bar">
                      <span className="admin-bar__count">{num(w.features)}</span>
                      <span className="admin-bar__fill" style={{ height: `${Math.max(4, Math.round((Number(w.features) / max) * 72))}px` }} />
                      <span className="admin-bar__label">{`${w.week_start}`.slice(5).replace("-", "/")}</span>
                    </div>
                  ))}
                </div>
              )
            })()}
            <table className="admin-table admin-table--tight">
              <thead>
                <tr><th>주</th>{(insights.weekly || []).map((w) => <th key={w.week_start}>{`${w.week_start}`.slice(5).replace("-", "/")}</th>)}</tr>
              </thead>
              <tbody>
                <tr><td>기록</td>{(insights.weekly || []).map((w) => <td key={w.week_start}>{num(w.memos)}</td>)}</tr>
                <tr><td>가입</td>{(insights.weekly || []).map((w) => <td key={w.week_start}>{num(w.users)}</td>)}</tr>
              </tbody>
            </table>
          </section>

          {/* ── 협업 현황 ── */}
          <section className="admin-overview" aria-label="협업 현황">
            <h2 className="admin-section-title">협업 (함께 만들기)</h2>
            {insights.collab ? (
              <div className="admin-stats">
                <StatCard label="협업 중인 지도" value={num(insights.collab.maps_with_collab)} sub={`참여자 ${num(insights.collab.collaborating_users)}명`} />
                <StatCard
                  label="초대 수락률"
                  value={(() => {
                    const a = Number(insights.collab.invites_accepted) || 0
                    const r = Number(insights.collab.invites_rejected) || 0
                    return a + r ? `${Math.round((a / (a + r)) * 100)}%` : "–"
                  })()}
                  sub={`수락 ${num(insights.collab.invites_accepted)} · 거절 ${num(insights.collab.invites_rejected)} · 대기 ${num(insights.collab.invites_pending)}`}
                />
                <StatCard label="협업으로 만든 카드" value={num(insights.collab.collab_features)} sub="지도 주인이 아닌 참여자가 등록" />
              </div>
            ) : (
              <p className="admin-empty-note">협업 데이터를 집계할 수 없어요.</p>
            )}
          </section>

          {/* ── 품질·건전성 ── */}
          <section className="admin-overview" aria-label="데이터 품질">
            <h2 className="admin-section-title">품질 · 건전성</h2>
            <div className="admin-stats">
              <StatCard label="7일 활성 채집자" value={num(insights.active_creators_7d)} sub="최근 7일 카드 등록 유저" />
              <StatCard
                label="유저당 평균 카드"
                value={overview?.users_total ? (Number(insights.features_geo_total || overview.features_total) / Number(overview.users_total)).toFixed(1) : "–"}
                sub="자산 생산 속도"
              />
              <StatCard label="반복 기록 카드" value={num(insights.repeat_record_features)} sub="기록 2회 이상 (단골 신호)" />
              <StatCard label="사진 있는 카드" value={num(insights.features_with_media)} sub={`첨부 미디어 ${num(insights.media_total)}개`} />
              <StatCard label="사진 포함 기록" value={num(insights.memo_photo_count)} sub="photo 첨부된 메모" />
            </div>
          </section>

          {/* ── 유통·소비 ── */}
          <section className="admin-overview" aria-label="유통과 소비">
            <h2 className="admin-section-title">유통 · 소비</h2>
            <div className="admin-stats">
              <StatCard label="지도 저장" value={num(insights.saves_total)} sub="다른 사람 지도 보관" />
              <StatCard label="좋아요 누적" value={num(insights.likes_total)} sub="발행 지도 기준" />
            </div>
            {(insights.sources || []).length ? (
              <div className="admin-hbars" aria-label="유입 소스 분포">
                {(() => {
                  const max = Math.max(1, ...insights.sources.map((s) => Number(s.cnt) || 0))
                  return insights.sources.map((s) => (
                    <div key={s.source} className="admin-hbar">
                      <span className="admin-hbar__label">{s.source}</span>
                      <span className="admin-hbar__track"><span className="admin-hbar__fill" style={{ width: `${Math.max(3, Math.round((Number(s.cnt) / max) * 100))}%` }} /></span>
                      <span className="admin-hbar__count">{num(s.cnt)}</span>
                    </div>
                  ))
                })()}
              </div>
            ) : null}
          </section>
        </>
      ) : null}

      {demographics ? (
        <section className="admin-overview" aria-label="인구통계 집계">
          <h2 className="admin-section-title">인구통계 · 판매 데이터 기반</h2>
          <p className="admin-empty-note">
            개인 식별 없는 집계치예요. 표본이 <b>{num(demographics.k_threshold)}명</b> 미만인 항목은
            재식별 방지를 위해 자동으로 가려집니다(k-익명).
          </p>

          {demographics.coverage ? (
            <div className="admin-stats">
              <StatCard
                label="연령대 입력률"
                value={demographics.coverage.profiles_total ? `${Math.round((demographics.coverage.with_age / demographics.coverage.profiles_total) * 100)}%` : "–"}
                sub={`${num(demographics.coverage.with_age)} / ${num(demographics.coverage.profiles_total)}명`}
              />
              <StatCard
                label="지역 입력률"
                value={demographics.coverage.profiles_total ? `${Math.round((demographics.coverage.with_region / demographics.coverage.profiles_total) * 100)}%` : "–"}
                sub={`${num(demographics.coverage.with_region)} / ${num(demographics.coverage.profiles_total)}명`}
              />
              <StatCard label="둘 다 입력" value={num(demographics.coverage.with_both)} sub="교차분석 가능 표본" />
            </div>
          ) : null}

          {/* 연령대 분포 */}
          {(demographics.age_distribution || []).length ? (
            <div className="admin-hbars" aria-label="연령대 분포">
              {(() => {
                const rows = demographics.age_distribution
                const max = Math.max(1, ...rows.map((r) => Number(r.users) || 0))
                return rows.map((r) => (
                  <div key={r.age_band} className="admin-hbar">
                    <span className="admin-hbar__label">{ageBandLabel(r.age_band) || r.age_band}</span>
                    <span className="admin-hbar__track"><span className="admin-hbar__fill" style={{ width: `${Math.max(3, Math.round((Number(r.users) / max) * 100))}%` }} /></span>
                    <span className="admin-hbar__count">{num(r.users)}</span>
                  </div>
                ))
              })()}
            </div>
          ) : (
            <p className="admin-empty-note">아직 공개할 만큼(표본 {num(demographics.k_threshold)}명 이상) 연령대 데이터가 쌓이지 않았어요.</p>
          )}
          {demographics.age_suppressed ? <p className="admin-empty-note">· 표본 부족으로 가려진 연령대 {num(demographics.age_suppressed)}개</p> : null}

          {/* 시도 분포 */}
          {(demographics.region_distribution || []).length ? (
            <div className="admin-chips" aria-label="지역 분포">
              {demographics.region_distribution.map((r) => (
                <span key={r.region_sido} className="admin-chip">{r.region_sido} <em>{num(r.users)}</em></span>
              ))}
            </div>
          ) : null}
          {demographics.region_suppressed ? <p className="admin-empty-note">· 표본 부족으로 가려진 지역 {num(demographics.region_suppressed)}개</p> : null}

          {/* 연령대 × 동네 (행동 × 인구통계) */}
          {(demographics.age_x_neighborhood || []).length ? (
            <>
              <h3 className="admin-subtitle">연령대별 활동 동네 (TOP)</h3>
              <table className="admin-table">
                <thead>
                  <tr><th>연령대</th><th>동네</th><th>이용자</th><th>카드</th></tr>
                </thead>
                <tbody>
                  {demographics.age_x_neighborhood.map((r, i) => (
                    <tr key={`${r.age_band}-${r.region}-${i}`}>
                      <td>{ageBandLabel(r.age_band) || r.age_band}</td>
                      <td>{r.region}</td>
                      <td>{num(r.users)}</td>
                      <td>{num(r.cards)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
          {demographics.age_x_neighborhood_suppressed ? <p className="admin-empty-note">· 표본 부족으로 가려진 동네×연령대 셀 {num(demographics.age_x_neighborhood_suppressed)}개</p> : null}
        </section>
      ) : null}

      <h2 className="admin-section-title">커뮤니티 검수</h2>
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
