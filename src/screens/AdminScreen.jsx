import { useCallback, useEffect, useState } from "react"
import { Loader2, LogIn, RefreshCw, ShieldCheck, ShieldAlert } from "lucide-react"
import { getCurrentUser, onAuthStateChange } from "../lib/auth"
import {
  checkPlatformAdmin,
  getAdminDemographics,
  getAdminInsights,
  getAdminOverview,
} from "../lib/adminModeration"
import {
  FEEDBACK_STATUS_TABS,
  feedbackCategoryLabel,
  listAdminFeedback,
  updateFeedbackStatus,
} from "../lib/feedback"
import { ageBandLabel } from "../lib/demographics"

// 데이터 대시보드 — /admin. platform_admin 전용(서버 RPC 게이트 + 클라이언트 선판별).
// 탭 구성: 개요 / 지역·태그 / 인구통계 / 활동·유통 / 피드백. (커뮤니티 검수는 제거됨)

const DASH_TABS = [
  { key: "overview", label: "개요" },
  { key: "region", label: "지역·태그" },
  { key: "demographics", label: "인구통계" },
  { key: "activity", label: "활동·유통" },
  { key: "feedback", label: "피드백" },
]

// 피드백 카드에 붙는 유형 배지 색상
const FEEDBACK_BADGE_CLASS = {
  bug: "admin-fbadge--bug",
  idea: "admin-fbadge--idea",
  pain: "admin-fbadge--pain",
  praise: "admin-fbadge--praise",
}

// 현재 상태에서 넘어갈 수 있는 다음 상태 버튼 (되돌리기 포함)
const FEEDBACK_NEXT_ACTIONS = {
  new: [
    { status: "acked", label: "확인함" },
    { status: "resolved", label: "처리됨" },
    { status: "spam", label: "스팸" },
  ],
  acked: [
    { status: "resolved", label: "처리됨" },
    { status: "new", label: "새 이야기로" },
    { status: "spam", label: "스팸" },
  ],
  resolved: [
    { status: "acked", label: "되돌리기" },
    { status: "spam", label: "스팸" },
  ],
  spam: [
    { status: "new", label: "복구" },
  ],
}

function num(value) {
  return value === null || value === undefined ? "–" : Number(value).toLocaleString("ko-KR")
}

function pct(part, whole) {
  const p = Number(part), w = Number(whole)
  if (!w || !Number.isFinite(p)) return "–"
  return `${Math.round((p / w) * 100)}%`
}

function formatStamp(value) {
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

function WeeklyChart({ weekly }) {
  const weeks = weekly || []
  if (!weeks.length) return <p className="admin-empty-note">주간 데이터가 없어요.</p>
  const max = Math.max(1, ...weeks.map((w) => Number(w.features) || 0))
  return (
    <>
      <div className="admin-bars" role="img" aria-label="주별 새 카드 수">
        {weeks.map((w) => (
          <div key={w.week_start} className="admin-bar">
            <span className="admin-bar__count">{num(w.features)}</span>
            <span className="admin-bar__fill" style={{ height: `${Math.max(4, Math.round((Number(w.features) / max) * 72))}px` }} />
            <span className="admin-bar__label">{`${w.week_start}`.slice(5).replace("-", "/")}</span>
          </div>
        ))}
      </div>
      <table className="admin-table admin-table--tight">
        <thead>
          <tr><th>주</th>{weeks.map((w) => <th key={w.week_start}>{`${w.week_start}`.slice(5).replace("-", "/")}</th>)}</tr>
        </thead>
        <tbody>
          <tr><td>새 카드</td>{weeks.map((w) => <td key={w.week_start}>{num(w.features)}</td>)}</tr>
          <tr><td>기록</td>{weeks.map((w) => <td key={w.week_start}>{num(w.memos)}</td>)}</tr>
          <tr><td>가입</td>{weeks.map((w) => <td key={w.week_start}>{num(w.users)}</td>)}</tr>
        </tbody>
      </table>
    </>
  )
}

export function AdminScreen() {
  // phase: 'loading' | 'anon' | 'forbidden' | 'ready'
  const [phase, setPhase] = useState("loading")
  const [activeTab, setActiveTab] = useState("overview")
  const [overview, setOverview] = useState(null)
  const [insights, setInsights] = useState(null)
  const [insightsError, setInsightsError] = useState("")
  const [demographics, setDemographics] = useState(null)
  const [demographicsError, setDemographicsError] = useState("")
  const [loading, setLoading] = useState(false)
  // 피드백 (치즈냥의 귓속말)
  const [feedbackRecords, setFeedbackRecords] = useState([])
  const [feedbackCounts, setFeedbackCounts] = useState({})
  const [feedbackStatus, setFeedbackStatus] = useState("new")
  const [feedbackError, setFeedbackError] = useState("")
  const [feedbackBusyId, setFeedbackBusyId] = useState(null)

  useEffect(() => {
    document.title = "LOCA 데이터 대시보드"
  }, [])

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
    return () => { sub?.data?.subscription?.unsubscribe?.() }
  }, [resolveAccess])

  // 특정 상태의 피드백 목록 + 전체 상태별 카운트(탭 뱃지)를 불러온다
  const loadFeedback = useCallback(async (status) => {
    setFeedbackError("")
    try {
      const { records, counts } = await listAdminFeedback(status)
      setFeedbackRecords(records)
      setFeedbackCounts(counts)
    } catch (error) {
      setFeedbackRecords([])
      setFeedbackError(error?.message || "피드백을 불러오지 못했어요.")
    }
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setInsightsError("")
    setDemographicsError("")
    try { setOverview(await getAdminOverview()) } catch { setOverview(null) }
    try {
      setInsights(await getAdminInsights())
    } catch (error) {
      setInsights(null)
      setInsightsError(error?.message || "인사이트를 불러오지 못했어요.")
    }
    try {
      setDemographics(await getAdminDemographics())
    } catch (error) {
      setDemographics(null)
      setDemographicsError(error?.message || "인구통계를 불러오지 못했어요.")
    }
    // 뱃지 카운트를 위해 항상 함께 로드 (기본 '새 이야기' 목록)
    setFeedbackStatus("new")
    await loadFeedback("new")
    setLoading(false)
  }, [loadFeedback])

  // 상태 필터 변경
  const selectFeedbackStatus = useCallback((status) => {
    setFeedbackStatus(status)
    loadFeedback(status)
  }, [loadFeedback])

  // 상태 변경(확인함/처리됨/스팸/복구) — 성공 시 현재 보고 있는 목록을 새로고침
  const handleFeedbackAction = useCallback(async (id, nextStatus, currentStatus) => {
    setFeedbackBusyId(id)
    setFeedbackError("")
    try {
      await updateFeedbackStatus(id, nextStatus)
      await loadFeedback(currentStatus)
    } catch (error) {
      setFeedbackError(error?.message || "상태를 바꾸지 못했어요.")
    } finally {
      setFeedbackBusyId(null)
    }
  }, [loadFeedback])

  useEffect(() => {
    if (phase === "ready") loadAll()
  }, [phase, loadAll])

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

  const stamp = demographics?.generated_at || insights?.generated_at

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-header__title">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>데이터 대시보드</span>
        </div>
        <button type="button" className="admin-refresh" onClick={loadAll} disabled={loading}>
          <RefreshCw size={14} aria-hidden="true" className={loading ? "admin-spin" : ""} />
          새로고침
        </button>
      </header>

      <nav className="admin-tabs" aria-label="대시보드 탭">
        {DASH_TABS.map((tab) => {
          const newCount = tab.key === "feedback" ? Number(feedbackCounts.new) || 0 : 0
          return (
            <button
              key={tab.key}
              type="button"
              className={`admin-tab${activeTab === tab.key ? " is-active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {newCount > 0 ? <span className="admin-tab__badge">{newCount}</span> : null}
            </button>
          )
        })}
      </nav>

      {loading && !overview ? (
        <div className="admin-center admin-center--pad"><Loader2 className="admin-spin" size={20} aria-hidden="true" /><p>불러오는 중…</p></div>
      ) : null}

      {/* ─────────── 개요 ─────────── */}
      {activeTab === "overview" ? (
        <>
          <section className="admin-overview" aria-label="운영 현황">
            <h2 className="admin-section-title">운영 현황</h2>
            {!overview ? (
              <p className="admin-error">통계를 불러오지 못했어요. 056 마이그레이션 적용 여부를 확인해 주세요.</p>
            ) : (
              <div className="admin-stats">
                <StatCard label="전체 가입자" value={num(overview.users_total)} sub={`최근 7일 +${num(overview.users_7d)} · 30일 +${num(overview.users_30d)}`} />
                <StatCard label="전체 지도" value={num(overview.maps_total)} sub={`발행 ${num(overview.maps_published)} · 7일 +${num(overview.maps_7d)}`} />
                <StatCard label="장소·기록(카드)" value={num(overview.features_total)} sub={`장소 ${num(overview.features_pin)} · 길 ${num(overview.features_route)} · 영역 ${num(overview.features_area)}`} />
                <StatCard label="기록(메모)" value={num(overview.memos_total)} sub={`팔로우 ${num(overview.follows_total)}건`} />
                <StatCard label="누적 조회수" value={num(overview.views_total)} sub={`최근 7일 ${num(overview.views_7d)}`} />
                <StatCard label="순 방문자(30일)" value={num(overview.visitors_30d)} sub={overview.visitors_30d === null ? "집계 불가" : "고유 세션 기준"} />
                {overview.community_total !== null && overview.community_total !== undefined ? (
                  <StatCard label="커뮤니티 기록" value={num(overview.community_total)} sub={`승인 대기 ${num(overview.community_pending)}`} />
                ) : null}
              </div>
            )}
          </section>

          <section className="admin-overview" aria-label="주간 추이">
            <h2 className="admin-section-title">주간 추이 (최근 8주)</h2>
            {insightsError ? <p className="admin-error">{insightsError} (057 적용 여부 확인)</p> : <WeeklyChart weekly={insights?.weekly} />}
          </section>
        </>
      ) : null}

      {/* ─────────── 지역·태그 ─────────── */}
      {activeTab === "region" ? (
        <section className="admin-overview" aria-label="지역 자산">
          <h2 className="admin-section-title">지역 자산</h2>
          {insightsError ? (
            <p className="admin-error">{insightsError} (057 적용 여부 확인)</p>
          ) : !insights ? (
            <p className="admin-empty-note">데이터를 불러오는 중…</p>
          ) : (
            <>
              <div className="admin-stats">
                <StatCard label="NEW FIND (지도에 없던 곳)" value={num(insights.new_find_total)} sub={`최근 7일 +${num(insights.new_find_7d)}`} />
                <StatCard label="동네 태깅률" value={pct(insights.features_region_tagged, insights.features_geo_total)} sub={`${num(insights.features_region_tagged)} / ${num(insights.features_geo_total)} 카드`} />
                <StatCard label="기록된 동네 수" value={(insights.region_top || []).length >= 15 ? "15+" : num((insights.region_top || []).length)} sub="카드가 있는 법정동" />
              </div>
              {(insights.region_top || []).length ? (
                <>
                  <h3 className="admin-subtitle">동네 랭킹 (카드 많은 순 TOP 15)</h3>
                  <table className="admin-table">
                    <thead><tr><th>동네</th><th>카드</th><th>최근 7일</th><th>새발견</th></tr></thead>
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
                </>
              ) : (
                <p className="admin-empty-note">아직 동네 태깅된 카드가 없어요.</p>
              )}
              {(insights.top_tags || []).length ? (
                <>
                  <h3 className="admin-subtitle">인기 태그 TOP 15</h3>
                  <div className="admin-chips" aria-label="인기 태그">
                    {insights.top_tags.map((t) => (<span key={t.tag} className="admin-chip">#{t.tag} <em>{num(t.cnt)}</em></span>))}
                  </div>
                </>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {/* ─────────── 인구통계 ─────────── */}
      {activeTab === "demographics" ? (
        <section className="admin-overview" aria-label="인구통계 집계">
          <h2 className="admin-section-title">인구통계 · 판매 데이터 기반</h2>
          {demographicsError ? (
            <p className="admin-error">{demographicsError} (062 적용 여부 확인)</p>
          ) : !demographics ? (
            <p className="admin-empty-note">데이터를 불러오는 중…</p>
          ) : (
            <>
              <p className="admin-empty-note">
                개인 식별 없는 집계치예요. 표본이 <b>{num(demographics.k_threshold)}명</b> 미만인 항목은 재식별 방지를 위해 자동으로 가려집니다(k-익명).
              </p>

              {demographics.coverage ? (
                <div className="admin-stats">
                  <StatCard label="연령대 입력률" value={pct(demographics.coverage.with_age, demographics.coverage.profiles_total)} sub={`${num(demographics.coverage.with_age)} / ${num(demographics.coverage.profiles_total)}명`} />
                  <StatCard label="지역 입력률" value={pct(demographics.coverage.with_region, demographics.coverage.profiles_total)} sub={`${num(demographics.coverage.with_region)} / ${num(demographics.coverage.profiles_total)}명`} />
                  <StatCard label="둘 다 입력" value={num(demographics.coverage.with_both)} sub="교차분석 가능 표본" />
                </div>
              ) : null}

              {/* 연령대 분포 */}
              <h3 className="admin-subtitle">연령대 분포</h3>
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
                <p className="admin-empty-note">아직 공개할 만큼(표본 {num(demographics.k_threshold)}명 이상) 쌓이지 않았어요.{demographics.age_suppressed ? ` (가려진 연령대 ${num(demographics.age_suppressed)}개)` : ""}</p>
              )}

              {/* 시도 분포 */}
              <h3 className="admin-subtitle">지역(시도) 분포</h3>
              {(demographics.region_distribution || []).length ? (
                <div className="admin-chips" aria-label="지역 분포">
                  {demographics.region_distribution.map((r) => (<span key={r.region_sido} className="admin-chip">{r.region_sido} <em>{num(r.users)}</em></span>))}
                </div>
              ) : (
                <p className="admin-empty-note">아직 공개할 만큼 쌓이지 않았어요.{demographics.region_suppressed ? ` (가려진 지역 ${num(demographics.region_suppressed)}개)` : ""}</p>
              )}

              {/* 연령대 × 시도 */}
              {(demographics.age_x_region || []).length ? (
                <>
                  <h3 className="admin-subtitle">연령대 × 지역 교차</h3>
                  <table className="admin-table">
                    <thead><tr><th>연령대</th><th>지역</th><th>이용자</th></tr></thead>
                    <tbody>
                      {demographics.age_x_region.map((r, i) => (
                        <tr key={`${r.age_band}-${r.region_sido}-${i}`}>
                          <td>{ageBandLabel(r.age_band) || r.age_band}</td>
                          <td>{r.region_sido}</td>
                          <td>{num(r.users)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}

              {/* 연령대 × 동네 (행동 × 인구통계) */}
              {(demographics.age_x_neighborhood || []).length ? (
                <>
                  <h3 className="admin-subtitle">연령대별 활동 동네 (행동 × 인구통계, 카드 많은 순)</h3>
                  <table className="admin-table">
                    <thead><tr><th>연령대</th><th>동네</th><th>이용자</th><th>카드</th></tr></thead>
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

              {(() => {
                const sup = (Number(demographics.age_x_region_suppressed) || 0) + (Number(demographics.age_x_neighborhood_suppressed) || 0)
                return sup ? <p className="admin-empty-note">· 표본 부족으로 가려진 교차 셀 {num(sup)}개</p> : null
              })()}
            </>
          )}
        </section>
      ) : null}

      {/* ─────────── 활동·유통 ─────────── */}
      {activeTab === "activity" ? (
        <>
          <section className="admin-overview" aria-label="협업 현황">
            <h2 className="admin-section-title">협업 (함께 만들기)</h2>
            {insightsError ? (
              <p className="admin-error">{insightsError} (057 적용 여부 확인)</p>
            ) : insights?.collab ? (
              <div className="admin-stats">
                <StatCard label="협업 중인 지도" value={num(insights.collab.maps_with_collab)} sub={`참여자 ${num(insights.collab.collaborating_users)}명`} />
                <StatCard
                  label="초대 수락률"
                  value={pct(insights.collab.invites_accepted, (Number(insights.collab.invites_accepted) || 0) + (Number(insights.collab.invites_rejected) || 0))}
                  sub={`수락 ${num(insights.collab.invites_accepted)} · 거절 ${num(insights.collab.invites_rejected)} · 대기 ${num(insights.collab.invites_pending)}`}
                />
                <StatCard label="협업으로 만든 카드" value={num(insights.collab.collab_features)} sub="지도 주인이 아닌 참여자가 등록" />
              </div>
            ) : (
              <p className="admin-empty-note">협업 데이터를 집계할 수 없어요.</p>
            )}
          </section>

          <section className="admin-overview" aria-label="데이터 품질">
            <h2 className="admin-section-title">품질 · 건전성</h2>
            {insights ? (
              <div className="admin-stats">
                <StatCard label="7일 활성 채집자" value={num(insights.active_creators_7d)} sub="최근 7일 카드 등록 유저" />
                <StatCard label="유저당 평균 카드" value={overview?.users_total ? (Number(insights.features_geo_total || overview.features_total) / Number(overview.users_total)).toFixed(1) : "–"} sub="자산 생산 속도" />
                <StatCard label="반복 기록 카드" value={num(insights.repeat_record_features)} sub="기록 2회 이상 (단골 신호)" />
                <StatCard label="사진 있는 카드" value={num(insights.features_with_media)} sub={`첨부 미디어 ${num(insights.media_total)}개`} />
                <StatCard label="사진 포함 기록" value={num(insights.memo_photo_count)} sub="photo 첨부된 메모" />
              </div>
            ) : (
              <p className="admin-empty-note">데이터를 불러오는 중…</p>
            )}
          </section>

          <section className="admin-overview" aria-label="유통과 소비">
            <h2 className="admin-section-title">유통 · 소비</h2>
            {insights ? (
              <>
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
              </>
            ) : (
              <p className="admin-empty-note">데이터를 불러오는 중…</p>
            )}
          </section>
        </>
      ) : null}

      {/* ─────────── 피드백 (치즈냥의 귓속말) ─────────── */}
      {activeTab === "feedback" ? (
        <section className="admin-overview" aria-label="사용자 피드백">
          <h2 className="admin-section-title">치즈냥의 귓속말 — 사용자 피드백</h2>

          <div className="admin-chips" role="tablist" aria-label="피드백 상태 필터">
            {FEEDBACK_STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={feedbackStatus === tab.key}
                className={`admin-fchip${feedbackStatus === tab.key ? " is-active" : ""}`}
                onClick={() => selectFeedbackStatus(tab.key)}
              >
                {tab.label}
                <em>{num(feedbackCounts[tab.key] ?? 0)}</em>
              </button>
            ))}
          </div>

          {feedbackError ? <p className="admin-error">{feedbackError} (065 적용 여부 확인)</p> : null}

          {!feedbackError && feedbackRecords.length === 0 ? (
            <p className="admin-empty-note">
              {feedbackStatus === "new" ? "아직 새로 온 이야기가 없어요." : "이 상태의 피드백이 없어요."}
            </p>
          ) : null}

          <div className="admin-list" style={{ marginTop: 12 }}>
            {feedbackRecords.map((row) => {
              const ctx = row.context || {}
              const busy = feedbackBusyId === row.id
              return (
                <article key={row.id} className="admin-card">
                  <div className="admin-card__head">
                    <span className={`admin-badge admin-fbadge ${FEEDBACK_BADGE_CLASS[row.category] || ""}`}>
                      {feedbackCategoryLabel(row.category)}
                    </span>
                    <span className="admin-fmeta">
                      {row.nickname || "익명"} · {formatStamp(row.created_at)}
                    </span>
                  </div>
                  <p className="admin-card__desc">{row.body}</p>
                  {(ctx.path || ctx.tab || ctx.viewport) ? (
                    <div className="admin-card__tags">
                      {ctx.tab ? <span>탭 {ctx.tab}</span> : null}
                      {ctx.path ? <span>{ctx.path}</span> : null}
                      {ctx.viewport ? <span>{ctx.viewport}</span> : null}
                      <span>{ctx.authed ? "로그인" : "비로그인"}</span>
                    </div>
                  ) : null}
                  {row.admin_note ? <p className="admin-empty-note">메모: {row.admin_note}</p> : null}
                  <div className="admin-card__actions">
                    {(FEEDBACK_NEXT_ACTIONS[row.status] || []).map((action) => (
                      <button
                        key={action.status}
                        type="button"
                        className={`admin-act admin-fact--${action.status}`}
                        disabled={busy}
                        onClick={() => handleFeedbackAction(row.id, action.status, feedbackStatus)}
                      >
                        {busy ? "..." : action.label}
                      </button>
                    ))}
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

      {stamp ? <p className="admin-stamp">집계 시각: {formatStamp(stamp)}</p> : null}
    </div>
  )
}
