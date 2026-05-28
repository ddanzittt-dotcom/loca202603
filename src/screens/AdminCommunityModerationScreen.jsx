import { createElement, useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Film,
  Eye,
  EyeOff,
  Flag,
  Loader2,
  MapPin,
  RefreshCw,
  Route,
  ShieldAlert,
  XCircle,
} from "lucide-react"
import {
  createRecommendMapDraft,
  getModerationAuthState,
  getRecommendMapModerationSummary,
  listCommunityModerationRecords,
  updateCommunityRecordModerationStatus,
} from "../lib/adminCommunityModeration"

const MODERATION_TABS = [
  { id: "pending", label: "검수 대기", Icon: Clock3 },
  { id: "approved", label: "공개 중", Icon: Eye },
  { id: "hidden", label: "숨김", Icon: EyeOff },
  { id: "reported", label: "신고됨", Icon: Flag },
]

const TAB_COPY = {
  pending: {
    eyebrow: "pending records",
    title: "검수 대기 기록",
    note: "새 제출을 공개, 보류, 숨김 처리합니다.",
  },
  approved: {
    eyebrow: "published records",
    title: "공개 중인 맵핑",
    note: "모두의 지도에 노출 중인 장소와 길입니다. 문제가 있으면 숨김 처리하세요.",
  },
  hidden: {
    eyebrow: "hidden records",
    title: "숨긴 맵핑",
    note: "숨김 처리된 기록입니다. 필요한 항목은 다시 공개할 수 있습니다.",
  },
  reported: {
    eyebrow: "reported records",
    title: "신고된 기록",
    note: "신고된 기록을 확인하고 공개, 보류, 숨김 처리합니다.",
  },
}

const ACTION_COPY = {
  approved: "공개",
  rejected: "보류",
  hidden: "숨김",
}

const getRecordActions = (record) => {
  if (record.status === "approved") {
    return [
      { status: "hidden", label: "숨김 처리", Icon: EyeOff, className: "is-hide" },
    ]
  }

  if (record.status === "hidden") {
    return [
      { status: "approved", label: "다시 공개", Icon: CheckCircle2, className: "is-approve" },
      { status: "rejected", label: "보류로 이동", Icon: XCircle, className: "" },
    ]
  }

  return [
    { status: "approved", label: "공개 approve", Icon: CheckCircle2, className: "is-approve" },
    { status: "rejected", label: "보류 reject", Icon: XCircle, className: "" },
    { status: "hidden", label: "숨김", Icon: EyeOff, className: "is-hide" },
  ]
}

const EMPTY_RECOMMEND_FORM = {
  title: "",
  slug: "",
  description: "",
  region: "",
  keywords: "",
  reel_url: "",
  reel_id: "",
  recommender_name: "",
  recommender_instagram: "",
  cover_image_url: "",
  record_ids: "",
}

function formatDate(value) {
  if (!value) return "-"
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value))
  } catch {
    return value
  }
}

function RecordTypeBadge({ type }) {
  const isRoute = type === "route"
  const Icon = isRoute ? Route : MapPin
  return (
    <span className={`admin-moderation-type admin-moderation-type--${isRoute ? "route" : "place"}`}>
      <Icon size={14} />
      {isRoute ? "길" : "장소"}
    </span>
  )
}

function CommunityRecordCard({ record, busy, onAction }) {
  const isRoute = record.type === "route"
  const actions = getRecordActions(record)
  return (
    <article className="admin-record-card">
      <div className="admin-record-card__header">
        <RecordTypeBadge type={record.type} />
        <span className={`admin-record-status admin-record-status--${record.status}`}>{record.status}</span>
      </div>

      <div className="admin-record-card__body">
        <h2>{record.title || "이름 없는 기록"}</h2>
        <p>{record.description || "설명이 없습니다."}</p>
        {isRoute && record.route_summary_text ? (
          <div className="admin-record-route">
            <strong>길 요약</strong>
            <span>{record.route_summary_text}</span>
          </div>
        ) : null}
      </div>

      <div className="admin-record-meta">
        <span>위치 {Number(record.lat).toFixed(5)}, {Number(record.lng).toFixed(5)}</span>
        <span>작성자 {record.author_name || "익명"}</span>
        <span>접수 {formatDate(record.created_at)}</span>
      </div>

      {Array.isArray(record.keywords) && record.keywords.length ? (
        <div className="admin-record-keywords">
          {record.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}
        </div>
      ) : null}

      <div className="admin-record-actions">
        {actions.map((action) => (
          <button
            key={action.status}
            type="button"
            className={action.className}
            disabled={busy}
            onClick={() => onAction(record, action.status)}
          >
            {createElement(action.Icon, { size: 15 })}
            {action.label}
          </button>
        ))}
      </div>
    </article>
  )
}

export function AdminCommunityModerationScreen() {
  const [activeTab, setActiveTab] = useState("pending")
  const [records, setRecords] = useState([])
  const [authState, setAuthState] = useState(null)
  const [recommendSummary, setRecommendSummary] = useState({ draft: 0, published: 0 })
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState("")
  const [message, setMessage] = useState("")
  const [mode, setMode] = useState("supabase")
  const [recommendForm, setRecommendForm] = useState(EMPTY_RECOMMEND_FORM)
  const [creatingRecommendMap, setCreatingRecommendMap] = useState(false)

  const stats = useMemo(() => {
    const place = records.filter((record) => record.type === "place").length
    const route = records.filter((record) => record.type === "route").length
    return { total: records.length, place, route }
  }, [records])

  const activeTabCopy = TAB_COPY[activeTab] || TAB_COPY.pending

  const loadModerationData = useCallback(async (nextStatus = activeTab) => {
    setLoading(true)
    setMessage("")
    try {
      const [nextAuthState, recordResult, mapSummary] = await Promise.all([
        getModerationAuthState(),
        listCommunityModerationRecords(nextStatus),
        getRecommendMapModerationSummary(),
      ])
      setAuthState(nextAuthState)
      setRecords(recordResult.records)
      setRecommendSummary(mapSummary)
      setMode(recordResult.mode || mapSummary.mode || nextAuthState.mode)
      setMessage(recordResult.warning || nextAuthState.message || "")
    } catch (error) {
      setMessage(error.message || "검수 목록을 불러오지 못했어요.")
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => {
    loadModerationData(activeTab)
  }, [activeTab, loadModerationData])

  const handleAction = async (record, status) => {
    const ok = window.confirm(`${record.title || "이 기록"}을(를) ${ACTION_COPY[status]} 처리할까요?`)
    if (!ok) return

    setBusyId(record.id)
    setMessage("")
    try {
      await updateCommunityRecordModerationStatus(record.id, status)
      setRecords((current) => current.filter((item) => item.id !== record.id))
      setMessage(status === "approved"
        ? "공개 처리했어요. 모두의 지도에 다시 노출됩니다."
        : status === "hidden"
          ? "숨김 처리했어요. 모두의 지도 공개 화면에서는 보이지 않습니다."
        : `${ACTION_COPY[status]} 처리했어요.`)
    } catch (error) {
      setMessage(error.message || "상태를 변경하지 못했어요.")
    } finally {
      setBusyId("")
    }
  }

  const updateRecommendForm = (field, value) => {
    setRecommendForm((current) => ({ ...current, [field]: value }))
  }

  const handleCreateRecommendMap = async (event) => {
    event.preventDefault()
    setCreatingRecommendMap(true)
    setMessage("")
    try {
      const result = await createRecommendMapDraft(recommendForm)
      setRecommendForm(EMPTY_RECOMMEND_FORM)
      setRecommendSummary((current) => ({ ...current, draft: (current.draft || 0) + 1 }))
      setMessage(result.warning || `추천할지도 draft를 만들었어요. 공유 URL: /recommend/${result.map.slug}`)
    } catch (error) {
      setMessage(error.message || "추천할지도 draft를 만들지 못했어요.")
    } finally {
      setCreatingRecommendMap(false)
    }
  }

  return (
    <main className="admin-moderation-page">
      <section className="admin-moderation-hero">
        <div>
          <span>LOCA OPERATIONS</span>
          <h1>모두의 지도 검수</h1>
          <p>비로그인 제출 기록을 바로 공개하지 않고, 운영자가 공개·보류·숨김 처리하는 MVP 화면입니다.</p>
        </div>
        <button type="button" onClick={() => loadModerationData(activeTab)} disabled={loading}>
          {loading ? <Loader2 size={16} className="admin-spin" /> : <RefreshCw size={16} />}
          새로고침
        </button>
      </section>

      <section className="admin-security-note">
        <ShieldAlert size={18} />
        <div>
          <strong>{authState?.isAdminLike ? "관리자 세션 감지됨" : "관리자 인증 필요"}</strong>
          <p>
            프론트에는 service role key를 노출하지 않습니다. 실제 운영 액션은 서버 API route 또는 Supabase RPC에서 관리자 권한을 검증해야 합니다.
          </p>
        </div>
        <span>{mode === "mock" ? "mock mode" : "supabase mode"}</span>
      </section>

      {message ? (
        <div className="admin-moderation-message">
          <AlertTriangle size={16} />
          {message}
        </div>
      ) : null}

      <section className="admin-moderation-grid">
        <aside className="admin-moderation-sidebar">
          <div className="admin-moderation-tabs">
            {MODERATION_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={activeTab === tab.id ? "is-active" : ""}
                onClick={() => setActiveTab(tab.id)}
              >
                {createElement(tab.Icon, { size: 16 })}
                {tab.label}
              </button>
            ))}
          </div>

          <div className="admin-moderation-stats">
            <span><b>{stats.total}</b>전체</span>
            <span><b>{stats.place}</b>장소</span>
            <span><b>{stats.route}</b>길</span>
          </div>

          <div className="admin-recommend-placeholder">
            <span>추천할지도 관리</span>
            <strong>릴스 운영 구조</strong>
            <p>draft {recommendSummary.draft} · published {recommendSummary.published}</p>
            <small>릴스 기반 추천지도 작성, 발행, 보관 처리를 이 섹션에서 확장합니다.</small>
          </div>
        </aside>

        <section className="admin-record-list">
          <div className="admin-record-list__head">
            <div>
              <span>{activeTabCopy.eyebrow}</span>
              <h2>{activeTabCopy.title}</h2>
            </div>
            <p>{activeTabCopy.note}</p>
          </div>

          {loading ? (
            <div className="admin-empty-state">
              <Loader2 size={20} className="admin-spin" />
              검수 목록을 불러오는 중입니다.
            </div>
          ) : records.length ? (
            <div className="admin-record-list__items">
              {records.map((record) => (
                <CommunityRecordCard
                  key={record.id}
                  record={record}
                  busy={busyId === record.id}
                  onAction={handleAction}
                />
              ))}
            </div>
          ) : (
            <div className="admin-empty-state">
              <CheckCircle2 size={20} />
              처리할 기록이 없습니다.
            </div>
          )}
        </section>
      </section>

      <section className="admin-recommend-create">
        <div className="admin-recommend-create__intro">
          <span>REELS TO MAP</span>
          <h2>추천할지도 draft 만들기</h2>
          <p>릴스 URL, 추천자, 키워드와 승인된 community_records ID를 묶어 추천할지도 초안을 만듭니다.</p>
        </div>
        <form className="admin-recommend-form" onSubmit={handleCreateRecommendMap}>
          <label>
            <span>제목</span>
            <input value={recommendForm.title} onChange={(event) => updateRecommendForm("title", event.target.value)} placeholder="예: 공주 강아지 산책 지도" required />
          </label>
          <label>
            <span>slug</span>
            <input value={recommendForm.slug} onChange={(event) => updateRecommendForm("slug", event.target.value)} placeholder="gongju-dog-walk" />
          </label>
          <label className="is-wide">
            <span>설명</span>
            <textarea value={recommendForm.description} onChange={(event) => updateRecommendForm("description", event.target.value)} rows={3} placeholder="릴스에서 소개한 장소와 길을 어떤 기준으로 묶었는지 적어주세요." />
          </label>
          <label>
            <span>지역</span>
            <input value={recommendForm.region} onChange={(event) => updateRecommendForm("region", event.target.value)} placeholder="충남 공주" />
          </label>
          <label>
            <span>키워드</span>
            <input value={recommendForm.keywords} onChange={(event) => updateRecommendForm("keywords", event.target.value)} placeholder="강아지 산책, 하천길, 벤치" />
          </label>
          <label>
            <span>릴스 URL</span>
            <input value={recommendForm.reel_url} onChange={(event) => updateRecommendForm("reel_url", event.target.value)} placeholder="https://www.instagram.com/reel/..." />
          </label>
          <label>
            <span>reel_id</span>
            <input value={recommendForm.reel_id} onChange={(event) => updateRecommendForm("reel_id", event.target.value)} placeholder="gongju_walk_reel_001" />
          </label>
          <label>
            <span>추천자</span>
            <input value={recommendForm.recommender_name} onChange={(event) => updateRecommendForm("recommender_name", event.target.value)} placeholder="공주산책러" />
          </label>
          <label>
            <span>인스타그램</span>
            <input value={recommendForm.recommender_instagram} onChange={(event) => updateRecommendForm("recommender_instagram", event.target.value)} placeholder="@gongju.walks" />
          </label>
          <label className="is-wide">
            <span>cover image URL</span>
            <input value={recommendForm.cover_image_url} onChange={(event) => updateRecommendForm("cover_image_url", event.target.value)} placeholder="없으면 fallback 썸네일이 표시됩니다." />
          </label>
          <label className="is-wide">
            <span>community_records ID</span>
            <textarea value={recommendForm.record_ids} onChange={(event) => updateRecommendForm("record_ids", event.target.value)} rows={3} placeholder="한 줄에 하나씩 승인된 record_id를 넣어주세요." />
          </label>
          <button type="submit" disabled={creatingRecommendMap}>
            {creatingRecommendMap ? <Loader2 size={16} className="admin-spin" /> : <Film size={16} />}
            draft 생성
          </button>
        </form>
      </section>
    </main>
  )
}
