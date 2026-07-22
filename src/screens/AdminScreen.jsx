import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, LogIn, RefreshCw, ShieldCheck, ShieldAlert } from "lucide-react"
import { getCurrentUser, onAuthStateChange } from "../lib/auth"
import {
  checkPlatformAdmin,
  getAdminDemographics,
  getAdminGeoDensity,
  getAdminInsights,
  getAdminKpis,
  getAdminOverview,
  getAdminRegionInsights,
  getAdminTimeseries,
} from "../lib/adminModeration"
import { downloadCsv, downloadSvgPng, formatStamp as fileStamp } from "../lib/adminExport"
import { GeoDensityMap } from "../components/admin/GeoDensityMap"
import {
  FEEDBACK_STATUS_TABS,
  feedbackCategoryLabel,
  listAdminFeedback,
  updateFeedbackStatus,
} from "../lib/feedback"
import {
  CONTRIBUTE_STATUS_TABS,
  contributeTabLabel,
  listAdminContributions,
  reviewContribution,
  copyContributionPhotoToPermanent,
} from "../lib/contribute"
import { ageBandLabel } from "../lib/demographics"

// 데이터 대시보드 — /admin. platform_admin 전용(서버 RPC 게이트 + 클라이언트 선판별).
// 탭 구성: 개요 / 핵심 지표 / 지역·태그 / 인구통계 / 활동·유통 / 피드백. (커뮤니티 검수는 제거됨)
// 핵심 지표·지역 상세는 migration 081 RPC(get_admin_kpis/get_admin_timeseries/get_admin_region_insights) 필요.

const DASH_TABS = [
  { key: "overview", label: "개요" },
  { key: "kpi", label: "핵심 지표" },
  { key: "region", label: "지역·태그" },
  { key: "demographics", label: "인구통계" },
  { key: "activity", label: "활동·유통" },
  { key: "contrib", label: "제보 검수" },
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

// 제보 검수 — 탐색 탭별 배지 색상
const CONTRIB_TAB_BADGE = {
  enjoy: "admin-cbadge--enjoy",
  learn: "admin-cbadge--learn",
  walk: "admin-cbadge--walk",
  nature: "admin-cbadge--nature",
}

// 제보 상태별 액션 — 승인(published)/반려(rejected). 반려는 사유 입력 후 확정.
const CONTRIB_NEXT_ACTIONS = {
  pending: [{ status: "published", label: "승인", kind: "ok" }, { status: "rejected", label: "반려", kind: "no" }],
  published: [{ status: "rejected", label: "게시 내리기", kind: "no" }],
  rejected: [{ status: "published", label: "승인", kind: "ok" }],
}

// 일별 추이 — 기간/지표 선택 (핵심 지표 탭)
const TS_DAY_OPTIONS = [7, 30, 90]
const TS_METRICS = [
  { key: "new_users", label: "가입" },
  { key: "new_cards", label: "새 카드" },
  { key: "map_views", label: "조회" },
  { key: "sessions", label: "세션" },
  { key: "shares", label: "공유" },
]

// 시계열 표·CSV 공통 컬럼 (get_admin_timeseries 응답 순서)
const TS_COLUMNS = [
  ["new_users", "가입"],
  ["new_cards", "새 카드"],
  ["collects", "채집 이벤트"],
  ["map_views", "지도 조회"],
  ["sessions", "세션"],
  ["active_users", "활성 사용자"],
  ["publishes", "발행"],
  ["saves", "저장"],
  ["memos", "기록"],
  ["shares", "공유"],
]

// 동네 밀도 지도 — 기간/지표 선택 (지역·태그 탭, get_admin_geo_density 082)
const GEO_DAY_OPTIONS = [30, 90, 365]
const GEO_METRICS = [
  { key: "cards", label: "전체 카드" },
  { key: "new_finds", label: "새발견(NEW FIND)" },
]
const geoDaysLabel = (d) => (d === 365 ? "1년" : `${d}일`)

// 퍼널 단계 (get_admin_kpis funnel/funnel_30d)
const FUNNEL_STEPS = [
  { key: "signed_up", label: "가입" },
  { key: "collected", label: "채집" },
  { key: "built_map", label: "지도 구성" },
  { key: "published", label: "발행" },
  { key: "shared", label: "공유" },
]

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

// "2026-06-20" → "06/20"
function shortDate(value) {
  return `${value || ""}`.slice(5).replace("-", "/")
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
            <span className="admin-bar__label">{shortDate(w.week_start)}</span>
          </div>
        ))}
      </div>
      <table className="admin-table admin-table--tight">
        <thead>
          <tr><th>주</th>{weeks.map((w) => <th key={w.week_start}>{shortDate(w.week_start)}</th>)}</tr>
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

// 일별 세로 바 차트 — 선택 지표 1개 (막대 많으면 가로 스크롤)
function DailyChart({ series, metricKey, metricLabel }) {
  const rows = series || []
  if (!rows.length) return <p className="admin-empty-note">시계열 데이터가 없어요.</p>
  const max = Math.max(1, ...rows.map((r) => Number(r?.[metricKey]) || 0))
  const many = rows.length > 31
  const labelEvery = many ? 7 : rows.length > 14 ? 2 : 1
  return (
    <div className="admin-bars-scroll">
      <div className="admin-bars admin-bars--daily" role="img" aria-label={`일별 ${metricLabel}`}>
        {rows.map((r, i) => {
          const v = Number(r?.[metricKey]) || 0
          const showLabel = i % labelEvery === 0 || i === rows.length - 1
          return (
            <div key={r?.d || i} className="admin-bar">
              <span className="admin-bar__count">{many && v === 0 ? "" : num(v)}</span>
              <span className="admin-bar__fill" style={{ height: `${Math.max(3, Math.round((v / max) * 72))}px` }} />
              <span className="admin-bar__label">{showLabel ? shortDate(r?.d) : ""}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// 리텐션 코호트 표 — 셀 배경 강도로 잔존율 표현 (미도래 주차 null → "—")
function CohortTable({ cohorts }) {
  const rows = cohorts || []
  if (!rows.length) return <p className="admin-empty-note">코호트 데이터가 없어요.</p>
  const weekCols = [0, 1, 2, 3, 4]
  return (
    <table className="admin-table admin-table--tight admin-cohort">
      <thead>
        <tr><th>가입 주</th><th>가입자</th>{weekCols.map((n) => <th key={n}>W{n}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((c, ri) => {
          const signups = Number(c?.signups) || 0
          return (
            <tr key={c?.cohort_week || ri}>
              <td>{c?.cohort_week || "–"}</td>
              <td>{num(c?.signups)}</td>
              {weekCols.map((n) => {
                const v = c?.[`w${n}`]
                if (v === null || v === undefined) return <td key={n} className="admin-cohort__na">—</td>
                const ratio = signups ? Math.min(1, Number(v) / signups) : 0
                return (
                  <td key={n} style={{ background: `color-mix(in srgb, var(--accent) ${Math.round(ratio * 45)}%, transparent)` }}>
                    {num(v)}
                    <span className="admin-cohort__pct">{signups ? ` (${Math.round(ratio * 100)}%)` : ""}</span>
                  </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// 가입→채집→지도 구성→발행→공유 5단 가로 바 (수 + 이전 단계 대비 전환율)
function FunnelBars({ data }) {
  if (!data) return <p className="admin-empty-note">퍼널 데이터가 없어요.</p>
  const base = Math.max(1, ...FUNNEL_STEPS.map((s) => Number(data?.[s.key]) || 0))
  return (
    <div className="admin-funnel">
      {FUNNEL_STEPS.map((step, i) => {
        const v = Number(data?.[step.key]) || 0
        const prev = i > 0 ? Number(data?.[FUNNEL_STEPS[i - 1].key]) || 0 : null
        const conv = prev === null ? null : prev > 0 ? Math.round((v / prev) * 100) : null
        return (
          <div key={step.key} className="admin-funnel__row">
            <span className="admin-funnel__label">{step.label}</span>
            <span className="admin-funnel__track">
              <span className="admin-funnel__fill" style={{ width: `${Math.max(2, Math.round((v / base) * 100))}%` }} />
            </span>
            <span className="admin-funnel__value">
              {num(v)}
              {conv !== null ? <em>{conv}%</em> : null}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// 지역 상세 표 — contributors < k 행에 k-익명 미달 뱃지
function RegionDetailTable({ rows, kThreshold, days }) {
  const list = rows || []
  if (!list.length) return <p className="admin-empty-note">데이터가 없어요.</p>
  return (
    <table className="admin-table admin-table--tight">
      <thead>
        <tr><th>지역</th><th>카드</th><th>최근 {days}일</th><th>새발견</th><th>기여자</th></tr>
      </thead>
      <tbody>
        {list.map((r, i) => (
          <tr key={r?.region || i}>
            <td>
              {r?.region || "–"}
              {Number(r?.contributors) < kThreshold ? <span className="admin-kbadge">k&lt;{kThreshold}</span> : null}
            </td>
            <td>{num(r?.cards)}</td>
            <td>{Number(r?.cards_recent) ? `+${num(r.cards_recent)}` : "–"}</td>
            <td>{num(r?.new_finds)}</td>
            <td>{num(r?.contributors)}</td>
          </tr>
        ))}
      </tbody>
    </table>
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
  // 핵심 지표 (081)
  const [kpis, setKpis] = useState(null)
  const [kpisError, setKpisError] = useState("")
  const [timeseries, setTimeseries] = useState(null)
  const [timeseriesError, setTimeseriesError] = useState("")
  const [tsDays, setTsDays] = useState(30)
  const [tsMetric, setTsMetric] = useState("new_cards")
  // 지역 상세 (081)
  const [regionInsights, setRegionInsights] = useState(null)
  const [regionInsightsError, setRegionInsightsError] = useState("")
  // 동네 밀도 지도 (082)
  const [geoDensity, setGeoDensity] = useState(null)
  const [geoDensityError, setGeoDensityError] = useState("")
  const [geoDays, setGeoDays] = useState(90)
  const [geoMetric, setGeoMetric] = useState("cards")
  const geoMapRef = useRef(null)
  // 피드백 (치즈냥의 귓속말)
  const [feedbackRecords, setFeedbackRecords] = useState([])
  const [feedbackCounts, setFeedbackCounts] = useState({})
  const [feedbackStatus, setFeedbackStatus] = useState("new")
  const [feedbackError, setFeedbackError] = useState("")
  const [feedbackBusyId, setFeedbackBusyId] = useState(null)
  // 피드백 운영 메모 (admin_note) 인라인 편집
  const [noteEditId, setNoteEditId] = useState(null)
  const [noteDraft, setNoteDraft] = useState("")
  // 제보 검수 (explore_contributions, 084)
  const [contribRecords, setContribRecords] = useState([])
  const [contribCounts, setContribCounts] = useState({})
  const [contribStatus, setContribStatus] = useState("pending")
  const [contribError, setContribError] = useState("")
  const [contribBusyId, setContribBusyId] = useState(null)
  // 반려 사유 인라인 입력
  const [contribRejectId, setContribRejectId] = useState(null)
  const [contribRejectDraft, setContribRejectDraft] = useState("")

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

  // 특정 상태의 제보 목록 + 상태별 카운트(탭 뱃지 pending)를 불러온다 (084)
  const loadContributions = useCallback(async (status) => {
    setContribError("")
    try {
      const { records, counts } = await listAdminContributions(status)
      setContribRecords(records)
      setContribCounts(counts)
    } catch (error) {
      setContribRecords([])
      setContribError(error?.message || "제보를 불러오지 못했어요.")
    }
  }, [])

  // 일별 시계열 (기간 칩으로 재호출) — 시퀀스 가드로 늦게 도착한 이전 요청 응답을 폐기
  const tsSeqRef = useRef(0)
  const loadTimeseries = useCallback(async (days) => {
    const seq = ++tsSeqRef.current
    setTimeseriesError("")
    try {
      const data = await getAdminTimeseries(days)
      if (tsSeqRef.current !== seq) return
      setTimeseries(data)
    } catch (error) {
      if (tsSeqRef.current !== seq) return
      setTimeseries(null)
      setTimeseriesError(error?.message || "시계열을 불러오지 못했어요.")
    }
  }, [])

  // 동네 밀도 지도 (기간 칩으로 재호출) — 시퀀스 가드로 늦게 도착한 이전 요청 응답을 폐기
  const geoSeqRef = useRef(0)
  const loadGeoDensity = useCallback(async (days) => {
    const seq = ++geoSeqRef.current
    setGeoDensityError("")
    try {
      const data = await getAdminGeoDensity(days)
      if (geoSeqRef.current !== seq) return
      setGeoDensity(data)
    } catch (error) {
      if (geoSeqRef.current !== seq) return
      setGeoDensity(null)
      setGeoDensityError(error?.message || "밀도 지도를 불러오지 못했어요.")
    }
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setInsightsError("")
    setDemographicsError("")
    setKpisError("")
    setRegionInsightsError("")
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
    // 핵심 지표 (081) — 미적용 환경이면 에러 카드로만 표시하고 다른 탭은 정상 동작
    try {
      setKpis(await getAdminKpis())
    } catch (error) {
      setKpis(null)
      setKpisError(error?.message || "핵심 지표를 불러오지 못했어요.")
    }
    setTsDays(30)
    await loadTimeseries(30)
    try {
      setRegionInsights(await getAdminRegionInsights(30))
    } catch (error) {
      setRegionInsights(null)
      setRegionInsightsError(error?.message || "지역 상세를 불러오지 못했어요.")
    }
    // 동네 밀도 지도 (082) — 미적용 환경이면 에러 카드로만 표시. 기간은 90일로 리셋
    setGeoDays(90)
    await loadGeoDensity(90)
    // 뱃지 카운트를 위해 항상 함께 로드 (기본 '새 이야기' 목록)
    setFeedbackStatus("new")
    await loadFeedback("new")
    // 제보 검수 뱃지(대기) — 기본 'pending' 목록 (084)
    setContribStatus("pending")
    await loadContributions("pending")
    setLoading(false)
  }, [loadFeedback, loadContributions, loadTimeseries, loadGeoDensity])

  // 기간 칩 선택 — 시계열만 재호출
  const selectTsDays = useCallback((days) => {
    setTsDays(days)
    loadTimeseries(days)
  }, [loadTimeseries])

  // 밀도 지도 기간 칩 선택 — 밀도 지도만 재호출
  const selectGeoDays = useCallback((days) => {
    setGeoDays(days)
    loadGeoDensity(days)
  }, [loadGeoDensity])

  // 밀도 지도 PNG 저장 (미팅용 한 장)
  const handleGeoPng = useCallback(() => {
    if (!geoMapRef.current) return
    downloadSvgPng(geoMapRef.current, `loca_밀도지도_${fileStamp()}.png`)
  }, [])

  // 상태 필터 변경
  const selectFeedbackStatus = useCallback((status) => {
    setFeedbackStatus(status)
    setNoteEditId(null)
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

  // 메모 편집 토글 — 열 때 기존 admin_note 를 초안으로
  const toggleNoteEditor = useCallback((row) => {
    setNoteEditId((prev) => (prev === row.id ? null : row.id))
    setNoteDraft(row.admin_note || "")
  }, [])

  // 메모 저장 — 상태는 그대로 두고 p_note 만 갱신 (빈 문자열은 보내지 않음: RPC 는 null=기존 유지)
  const handleSaveNote = useCallback(async (row) => {
    const note = noteDraft.trim()
    if (!note) return
    setFeedbackBusyId(row.id)
    setFeedbackError("")
    try {
      await updateFeedbackStatus(row.id, row.status, note)
      setNoteEditId(null)
      await loadFeedback(feedbackStatus)
    } catch (error) {
      setFeedbackError(error?.message || "메모를 저장하지 못했어요.")
    } finally {
      setFeedbackBusyId(null)
    }
  }, [noteDraft, feedbackStatus, loadFeedback])

  // ── 제보 검수 (084) ──

  // 상태 필터 변경
  const selectContribStatus = useCallback((status) => {
    setContribStatus(status)
    setContribRejectId(null)
    loadContributions(status)
  }, [loadContributions])

  // 승인 — 사진을 관리자 소유 영구 경로로 복사(제보자 탈퇴에도 생존) 후 published + explore_catalog 미러
  const handleApproveContribution = useCallback(async (row) => {
    setContribBusyId(row.id)
    setContribError("")
    try {
      const permImage = await copyContributionPhotoToPermanent(row.image, row.id)
      await reviewContribution(row.id, "published", { image: permImage })
      await loadContributions(contribStatus)
    } catch (error) {
      setContribError(error?.message || "승인하지 못했어요.")
    } finally {
      setContribBusyId(null)
    }
  }, [loadContributions, contribStatus])

  // 반려 사유 인라인 토글
  const toggleContribReject = useCallback((row) => {
    setContribRejectId((prev) => (prev === row.id ? null : row.id))
    setContribRejectDraft(row.reject_reason || "")
  }, [])

  // 반려 확정 — 게시됐던 건이면 미러도 삭제(RPC 가 처리)
  const handleRejectContribution = useCallback(async (row) => {
    setContribBusyId(row.id)
    setContribError("")
    try {
      await reviewContribution(row.id, "rejected", { rejectReason: contribRejectDraft.trim() || null })
      setContribRejectId(null)
      await loadContributions(contribStatus)
    } catch (error) {
      setContribError(error?.message || "반려하지 못했어요.")
    } finally {
      setContribBusyId(null)
    }
  }, [loadContributions, contribStatus, contribRejectDraft])

  // ── CSV 다운로드 ──

  const handleOverviewCsv = useCallback(() => {
    if (!overview) return
    const rows = Object.entries(overview).map(([key, value]) => [key, value ?? ""])
    downloadCsv(`loca_overview_${fileStamp()}.csv`, ["필드", "값"], rows)
  }, [overview])

  const handleTimeseriesCsv = useCallback(() => {
    const series = timeseries?.series
    if (!series?.length) return
    const rows = series.map((r) => [r?.d ?? "", ...TS_COLUMNS.map(([key]) => r?.[key] ?? 0)])
    downloadCsv(
      `loca_timeseries_${timeseries?.days || tsDays}d_${fileStamp()}.csv`,
      ["날짜", ...TS_COLUMNS.map(([, label]) => label)],
      rows,
    )
  }, [timeseries, tsDays])

  const handleRetentionCsv = useCallback(() => {
    const cohorts = kpis?.retention?.cohorts
    if (!cohorts?.length) return
    const rows = cohorts.map((c) => [
      c?.cohort_week ?? "",
      c?.signups ?? 0,
      ...[0, 1, 2, 3, 4].map((n) => (c?.[`w${n}`] === null || c?.[`w${n}`] === undefined ? "" : c[`w${n}`])),
    ])
    downloadCsv(`loca_retention_cohorts_${fileStamp()}.csv`, ["가입 주", "가입자", "W0", "W1", "W2", "W3", "W4"], rows)
  }, [kpis])

  // 지역 상세 통합 CSV — kOnly=true 면 contributors >= k 행만 (지자체 제출용)
  const handleRegionCsv = useCallback((kOnly) => {
    if (!regionInsights) return
    const k = Number(regionInsights?.k_threshold) || 5
    const days = Number(regionInsights?.days) || 30
    const groups = [["시도", regionInsights?.sido], ["시군구", regionInsights?.sigungu], ["동", regionInsights?.dong]]
    const rows = []
    groups.forEach(([label, list]) => {
      (list || []).forEach((r) => {
        if (kOnly && Number(r?.contributors) < k) return
        rows.push([label, r?.region ?? "", r?.cards ?? 0, r?.cards_recent ?? 0, r?.new_finds ?? 0, r?.contributors ?? 0])
      })
    })
    const suffix = kOnly ? `_k${k}` : ""
    downloadCsv(
      `loca_region_insights_${days}d${suffix}_${fileStamp()}.csv`,
      ["구분", "지역", "카드", `최근${days}일`, "새발견", "기여자"],
      rows,
    )
  }, [regionInsights])

  const handleAgeRegionCsv = useCallback(() => {
    const rows = demographics?.age_x_region
    if (!rows?.length) return
    downloadCsv(
      `loca_age_x_region_k${demographics?.k_threshold || 5}_${fileStamp()}.csv`,
      ["연령대", "지역", "이용자"],
      rows.map((r) => [ageBandLabel(r?.age_band) || r?.age_band || "", r?.region_sido ?? "", r?.users ?? 0]),
    )
  }, [demographics])

  const handleAgeNeighborhoodCsv = useCallback(() => {
    const rows = demographics?.age_x_neighborhood
    if (!rows?.length) return
    downloadCsv(
      `loca_age_x_neighborhood_k${demographics?.k_threshold || 5}_${fileStamp()}.csv`,
      ["연령대", "동네", "이용자", "카드"],
      rows.map((r) => [ageBandLabel(r?.age_band) || r?.age_band || "", r?.region ?? "", r?.users ?? 0, r?.cards ?? 0]),
    )
  }, [demographics])

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

  const stamp = kpis?.generated_at || demographics?.generated_at || insights?.generated_at
  // 081 적용 여부 — map_views_total 이 오면 views_total 은 '전체 이벤트 수'로 정정
  const hasMapViews = overview?.map_views_total !== undefined && overview?.map_views_total !== null
  const kThreshold = Number(regionInsights?.k_threshold) || 5
  const regionDays = Number(regionInsights?.days) || 30
  const tsMetricLabel = TS_METRICS.find((m) => m.key === tsMetric)?.label || tsMetric
  const stickiness = Number(kpis?.activity?.mau)
    ? `${Math.round((Number(kpis?.activity?.dau) / Number(kpis.activity.mau)) * 100)}%`
    : "—"

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
          const newCount = tab.key === "feedback" ? Number(feedbackCounts.new) || 0
            : tab.key === "contrib" ? Number(contribCounts.pending) || 0 : 0
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
              <>
                <div className="admin-stats">
                  <StatCard label="전체 가입자" value={num(overview.users_total)} sub={`최근 7일 +${num(overview.users_7d)} · 30일 +${num(overview.users_30d)}`} />
                  <StatCard label="전체 지도" value={num(overview.maps_total)} sub={`발행 ${num(overview.maps_published)} · 7일 +${num(overview.maps_7d)}`} />
                  <StatCard label="장소·기록(카드)" value={num(overview.features_total)} sub={`장소 ${num(overview.features_pin)} · 길 ${num(overview.features_route)} · 영역 ${num(overview.features_area)}`} />
                  <StatCard label="기록(메모)" value={num(overview.memos_total)} sub={`팔로우 ${num(overview.follows_total)}건`} />
                  <StatCard label={hasMapViews ? "전체 이벤트 수" : "누적 조회수"} value={num(overview.views_total)} sub={`최근 7일 ${num(overview.views_7d)}`} />
                  {hasMapViews ? (
                    <StatCard label="지도 조회수" value={num(overview.map_views_total)} sub={`최근 7일 +${num(overview.map_views_7d)}`} />
                  ) : null}
                  <StatCard label="순 방문자(30일)" value={num(overview.visitors_30d)} sub={overview.visitors_30d === null ? "집계 불가" : "고유 세션 기준"} />
                  {overview.community_total !== null && overview.community_total !== undefined ? (
                    <StatCard label="커뮤니티 기록" value={num(overview.community_total)} sub={`승인 대기 ${num(overview.community_pending)}`} />
                  ) : null}
                </div>
                <button type="button" className="admin-csv-btn" onClick={handleOverviewCsv}>운영 스냅샷 CSV</button>
              </>
            )}
          </section>

          <section className="admin-overview" aria-label="주간 추이">
            <h2 className="admin-section-title">주간 추이 (최근 8주)</h2>
            {insightsError ? <p className="admin-error">{insightsError} (057 적용 여부 확인)</p> : <WeeklyChart weekly={insights?.weekly} />}
          </section>
        </>
      ) : null}

      {/* ─────────── 핵심 지표 ─────────── */}
      {activeTab === "kpi" ? (
        <>
          <p className="admin-caveat">
            조회·세션·채집 이벤트 계측은 2026-07-19 복원 — 이전 기간의 조회/세션 지표는 과소집계입니다.
          </p>

          <section className="admin-overview" aria-label="활성 사용자 지표">
            <h2 className="admin-section-title">활성 사용자</h2>
            {kpisError ? (
              <p className="admin-error">{kpisError} (supabase/migrations/081 적용 확인)</p>
            ) : !kpis ? (
              <p className="admin-empty-note">데이터를 불러오는 중…</p>
            ) : (
              <div className="admin-stats">
                <StatCard label="DAU" value={num(kpis?.activity?.dau)} sub={`기록 기준 ${num(kpis?.content?.dau)}`} />
                <StatCard label="WAU" value={num(kpis?.activity?.wau)} sub={`기록 기준 ${num(kpis?.content?.wau)}`} />
                <StatCard label="MAU" value={num(kpis?.activity?.mau)} sub={`기록 기준 ${num(kpis?.content?.mau)}`} />
                <StatCard label="스티키니스" value={stickiness} sub="DAU / MAU" />
                <StatCard label="오늘 세션" value={num(kpis?.activity?.sessions_today)} sub="최근 24시간 고유 세션" />
                <StatCard label="재방문 방문자(30일)" value={num(kpis?.activity?.returning_visitors_30d)} sub="2일 이상 방문한 브라우저" />
              </div>
            )}
          </section>

          <section className="admin-overview" aria-label="일별 추이">
            <h2 className="admin-section-title">일별 추이</h2>
            {timeseriesError ? (
              <p className="admin-error">{timeseriesError} (supabase/migrations/081 적용 확인)</p>
            ) : !timeseries ? (
              <p className="admin-empty-note">데이터를 불러오는 중…</p>
            ) : (
              <>
                <div className="admin-kchips" role="group" aria-label="기간 선택">
                  {TS_DAY_OPTIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`admin-kchip${tsDays === d ? " is-active" : ""}`}
                      onClick={() => selectTsDays(d)}
                    >
                      {d}일
                    </button>
                  ))}
                </div>
                <div className="admin-kchips" role="group" aria-label="지표 선택">
                  {TS_METRICS.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      className={`admin-kchip${tsMetric === m.key ? " is-active" : ""}`}
                      onClick={() => setTsMetric(m.key)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <DailyChart series={timeseries?.series} metricKey={tsMetric} metricLabel={tsMetricLabel} />
                {(timeseries?.series || []).length ? (
                  <>
                    <table className="admin-table admin-table--tight">
                      <thead>
                        <tr>
                          <th>지표</th>
                          {(timeseries?.series || []).map((r, i) => <th key={r?.d || i}>{shortDate(r?.d)}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {TS_COLUMNS.map(([key, label]) => (
                          <tr key={key}>
                            <td>{label}</td>
                            {(timeseries?.series || []).map((r, i) => <td key={r?.d || i}>{num(r?.[key])}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button type="button" className="admin-csv-btn" onClick={handleTimeseriesCsv}>CSV 다운로드</button>
                  </>
                ) : null}
              </>
            )}
          </section>

          <section className="admin-overview" aria-label="리텐션 코호트">
            <h2 className="admin-section-title">리텐션 (가입 주 코호트, 최근 8주)</h2>
            {kpisError ? (
              <p className="admin-error">{kpisError} (supabase/migrations/081 적용 확인)</p>
            ) : !kpis ? (
              <p className="admin-empty-note">데이터를 불러오는 중…</p>
            ) : (
              <>
                <CohortTable cohorts={kpis?.retention?.cohorts} />
                {(kpis?.retention?.cohorts || []).length ? (
                  <button type="button" className="admin-csv-btn" onClick={handleRetentionCsv}>CSV 다운로드</button>
                ) : null}
              </>
            )}
          </section>

          <section className="admin-overview" aria-label="전환 퍼널">
            <h2 className="admin-section-title">퍼널 — 가입 → 채집 → 지도 구성 → 발행 → 공유</h2>
            {kpisError ? (
              <p className="admin-error">{kpisError} (supabase/migrations/081 적용 확인)</p>
            ) : !kpis ? (
              <p className="admin-empty-note">데이터를 불러오는 중…</p>
            ) : (
              <>
                <h3 className="admin-subtitle">전체 기간</h3>
                <FunnelBars data={kpis?.funnel} />
                <h3 className="admin-subtitle">최근 30일 가입자</h3>
                <FunnelBars data={kpis?.funnel_30d} />
              </>
            )}
          </section>
        </>
      ) : null}

      {/* ─────────── 지역·태그 ─────────── */}
      {activeTab === "region" ? (
        <>
          <section className="admin-overview admin-geomap" aria-label="동네 밀도 지도">
            <h2 className="admin-section-title">동네 밀도 지도 (최근 {geoDaysLabel(geoDays)})</h2>
            {geoDensityError ? (
              <p className="admin-error">{geoDensityError} (supabase/migrations/082 적용 확인)</p>
            ) : !geoDensity ? (
              <p className="admin-empty-note">데이터를 불러오는 중…</p>
            ) : (
              <>
                <div className="admin-kchips" role="group" aria-label="기간 선택">
                  {GEO_DAY_OPTIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`admin-kchip${geoDays === d ? " is-active" : ""}`}
                      onClick={() => selectGeoDays(d)}
                    >
                      {geoDaysLabel(d)}
                    </button>
                  ))}
                </div>
                <div className="admin-kchips" role="group" aria-label="지표 선택">
                  {GEO_METRICS.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      className={`admin-kchip${geoMetric === m.key ? " is-active" : ""}`}
                      onClick={() => setGeoMetric(m.key)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="admin-geomap__frame">
                  <GeoDensityMap ref={geoMapRef} data={geoDensity} metric={geoMetric} />
                </div>
                <p className="admin-empty-note">
                  총 카드 {num(geoDensity?.total_cards)} · 새발견 {num(geoDensity?.total_new_finds)} · 국외 {num(geoDensity?.overseas_cards)} 제외 · 미태깅좌표 {num(geoDensity?.untagged_coords)}
                </p>
                <p className="admin-caption">격자(약 5km) 집계라 개별 위치는 드러나지 않습니다. 좌표 미태깅 카드는 제외됩니다.</p>
                <button type="button" className="admin-csv-btn" onClick={handleGeoPng}>이미지 저장(PNG)</button>
              </>
            )}
          </section>

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

          <section className="admin-overview" aria-label="지역 상세">
            <h2 className="admin-section-title">지역 상세 (최근 {regionDays}일 기준 최근 활동)</h2>
            {regionInsightsError ? (
              <p className="admin-error">{regionInsightsError} (supabase/migrations/081 적용 확인)</p>
            ) : !regionInsights ? (
              <p className="admin-empty-note">데이터를 불러오는 중…</p>
            ) : (
              <>
                <p className="admin-empty-note">
                  기여자가 {num(kThreshold)}명 미만인 행은 <span className="admin-kbadge">k&lt;{kThreshold}</span> 표시 — 외부(지자체) 제출 시 제외 대상이에요.
                  {Number(regionInsights?.untagged_cards) ? ` · 좌표는 있지만 동네 미태깅 카드 ${num(regionInsights.untagged_cards)}개` : ""}
                </p>
                <h3 className="admin-subtitle">시도</h3>
                <RegionDetailTable rows={regionInsights?.sido} kThreshold={kThreshold} days={regionDays} />
                <h3 className="admin-subtitle">시군구 (TOP 30)</h3>
                <RegionDetailTable rows={regionInsights?.sigungu} kThreshold={kThreshold} days={regionDays} />
                <h3 className="admin-subtitle">동 (TOP 30)</h3>
                <RegionDetailTable rows={regionInsights?.dong} kThreshold={kThreshold} days={regionDays} />
                <div className="admin-csv-row">
                  <button type="button" className="admin-csv-btn" onClick={() => handleRegionCsv(false)}>내부용 CSV</button>
                  <button type="button" className="admin-csv-btn" onClick={() => handleRegionCsv(true)}>지자체 제출용 CSV (k-익명)</button>
                </div>
              </>
            )}
          </section>
        </>
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
                  <button type="button" className="admin-csv-btn" onClick={handleAgeRegionCsv}>CSV 다운로드 (k-익명 적용본)</button>
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
                  <button type="button" className="admin-csv-btn" onClick={handleAgeNeighborhoodCsv}>CSV 다운로드 (k-익명 적용본)</button>
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
      {/* ─────────── 제보 검수 (084) ─────────── */}
      {activeTab === "contrib" ? (
        <section className="admin-overview" aria-label="이웃 제보 검수">
          <h2 className="admin-section-title">이웃 제보 검수 — 탐색탭 사용자 제보</h2>

          <div className="admin-chips" role="tablist" aria-label="제보 상태 필터">
            {CONTRIBUTE_STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={contribStatus === tab.key}
                className={`admin-fchip${contribStatus === tab.key ? " is-active" : ""}`}
                onClick={() => selectContribStatus(tab.key)}
              >
                {tab.label}
                <em>{num(contribCounts[tab.key] ?? 0)}</em>
              </button>
            ))}
          </div>

          {contribError ? <p className="admin-error">{contribError} (084 적용 여부 확인)</p> : null}

          {!contribError && contribRecords.length === 0 ? (
            <p className="admin-empty-note">
              {contribStatus === "pending" ? "검토할 제보가 없어요." : "이 상태의 제보가 없어요."}
            </p>
          ) : null}

          <div className="admin-list" style={{ marginTop: 12 }}>
            {contribRecords.map((row) => {
              const busy = contribBusyId === row.id
              const rejecting = contribRejectId === row.id
              const detail = row.detail || {}
              const dateRange = [row.start_date, row.end_date].filter(Boolean).join(" ~ ")
              const applyRange = [row.apply_start, row.apply_end].filter(Boolean).join(" ~ ")
              return (
                <article key={row.id} className="admin-card">
                  <div className="admin-card__head">
                    <span className={`admin-badge ${CONTRIB_TAB_BADGE[row.tab] || ""}`}>
                      {contributeTabLabel(row.tab)}
                    </span>
                    <span className="admin-fmeta">
                      {row.nickname || "탈퇴한 이웃"} · {formatStamp(row.submitted_at)}
                    </span>
                  </div>
                  <p className="admin-card__title">{row.title}</p>
                  {row.summary ? <p className="admin-card__desc">{row.summary}</p> : null}
                  {row.image ? <img className="admin-cthumb" src={row.image} alt="" loading="lazy" /> : null}
                  <div className="admin-cmeta">
                    {row.addr ? <span>📍 {row.addr}</span> : null}
                    {row.category ? <span>{row.category}</span> : null}
                    {dateRange ? <span>기간 {dateRange}</span> : null}
                    {applyRange ? <span>접수 {applyRange}</span> : null}
                    {detail.institution ? <span>기관 {detail.institution}</span> : null}
                    {detail.day ? <span>일정 {detail.day}</span> : null}
                    {detail.fee ? <span>수강료 {detail.fee}</span> : null}
                    {row.phone ? <span>☎ {row.phone}</span> : null}
                    {row.source_url ? <a href={row.source_url} target="_blank" rel="noreferrer noopener">링크</a> : null}
                  </div>
                  {row.status === "rejected" && row.reject_reason ? (
                    <p className="admin-empty-note">반려 사유: {row.reject_reason}</p>
                  ) : null}
                  <div className="admin-card__actions">
                    {(CONTRIB_NEXT_ACTIONS[row.status] || []).map((action) => (
                      <button
                        key={action.status}
                        type="button"
                        className={`admin-act admin-cact--${action.kind}`}
                        disabled={busy}
                        onClick={() => (action.status === "published"
                          ? handleApproveContribution(row)
                          : toggleContribReject(row))}
                      >
                        {busy ? "..." : action.label}
                      </button>
                    ))}
                  </div>
                  {rejecting ? (
                    <div className="admin-note-editor">
                      <textarea
                        value={contribRejectDraft}
                        onChange={(e) => setContribRejectDraft(e.target.value)}
                        placeholder="반려 사유 (선택 — 제보자 참고용)"
                        maxLength={500}
                      />
                      <p className="admin-caption">{contribRejectDraft.length}/500</p>
                      <div className="admin-csv-row">
                        <button
                          type="button"
                          className="admin-csv-btn"
                          disabled={busy}
                          onClick={() => handleRejectContribution(row)}
                        >
                          {busy ? "처리 중…" : "반려 확정"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

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
              const noteOpen = noteEditId === row.id
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
                    <button
                      type="button"
                      className="admin-act"
                      disabled={busy}
                      onClick={() => toggleNoteEditor(row)}
                    >
                      {noteOpen ? "메모 닫기" : "메모"}
                    </button>
                  </div>
                  {noteOpen ? (
                    <div className="admin-note-editor">
                      <textarea
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder="운영 메모 (내부용 — 사용자에게 보이지 않아요)"
                        maxLength={500}
                      />
                      <p className="admin-caption">{noteDraft.length}/500</p>
                      <div className="admin-csv-row">
                        <button
                          type="button"
                          className="admin-csv-btn"
                          disabled={busy || !noteDraft.trim()}
                          onClick={() => handleSaveNote(row)}
                        >
                          {busy ? "저장 중…" : "메모 저장"}
                        </button>
                      </div>
                    </div>
                  ) : null}
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
