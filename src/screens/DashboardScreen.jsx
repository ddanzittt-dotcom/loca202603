import { useState, useMemo } from "react"

// ─── 더미 데이터 (Supabase 없이 UI 확인용) ───

const DUMMY_SUMMARY = {
  totalViews: 1247,
  uniqueVisitors: 389,
  totalCheckins: 214,
  completions: 67,
  avgRating: 4.3,
  surveyCount: 52,
}

const DUMMY_FUNNEL = [
  { label: "지도 조회", value: 1247, pct: 100 },
  { label: "핀 클릭", value: 683, pct: 54.7 },
  { label: "체크인", value: 214, pct: 17.2 },
  { label: "완주", value: 67, pct: 5.4 },
]

const DUMMY_CHECKPOINTS = [
  { id: "cp1", title: "축제 본부", emoji: "1️⃣", visits: 198, pct: 92.5 },
  { id: "cp2", title: "성수 연방", emoji: "2️⃣", visits: 156, pct: 72.9 },
  { id: "cp3", title: "아트벙커", emoji: "3️⃣", visits: 132, pct: 61.7 },
  { id: "cp4", title: "뚝섬 수제맥주", emoji: "4️⃣", visits: 104, pct: 48.6 },
  { id: "cp5", title: "서울숲 피크닉", emoji: "5️⃣", visits: 89, pct: 41.6 },
]

const DUMMY_TOP_FEATURES = [
  { id: "t1", title: "축제 본부", emoji: "1️⃣", clicks: 312, checkins: 198 },
  { id: "t2", title: "성수 연방", emoji: "2️⃣", clicks: 245, checkins: 156 },
  { id: "t3", title: "아트벙커", emoji: "3️⃣", clicks: 198, checkins: 132 },
  { id: "t4", title: "뚝섬 수제맥주", emoji: "4️⃣", clicks: 167, checkins: 104 },
  { id: "t5", title: "서울숲 피크닉", emoji: "5️⃣", clicks: 143, checkins: 89 },
]

const DUMMY_CHANNELS = [
  { source: "direct", label: "직접 접속", count: 423, pct: 33.9, color: "#4F46E5" },
  { source: "link", label: "링크 공유", count: 356, pct: 28.5, color: "#12B981" },
  { source: "kakao", label: "카카오톡", count: 287, pct: 23.0, color: "#F97316" },
  { source: "qr", label: "QR 코드", count: 181, pct: 14.5, color: "#EF4444" },
]

const DUMMY_DAILY = [
  { date: "3/28", views: 45, checkins: 8 },
  { date: "3/29", views: 89, checkins: 21 },
  { date: "3/30", views: 156, checkins: 34 },
  { date: "3/31", views: 203, checkins: 42 },
  { date: "4/1", views: 312, checkins: 56 },
  { date: "4/2", views: 267, checkins: 38 },
  { date: "4/3", views: 175, checkins: 15 },
]

const DUMMY_HOURLY = [
  { hour: "6시", views: 12 }, { hour: "7시", views: 23 }, { hour: "8시", views: 45 },
  { hour: "9시", views: 78 }, { hour: "10시", views: 134 }, { hour: "11시", views: 167 },
  { hour: "12시", views: 145 }, { hour: "13시", views: 112 }, { hour: "14시", views: 156 },
  { hour: "15시", views: 189 }, { hour: "16시", views: 201 }, { hour: "17시", views: 178 },
  { hour: "18시", views: 98 }, { hour: "19시", views: 67 }, { hour: "20시", views: 45 },
]

const DUMMY_SURVEY = {
  avgRating: 4.3,
  count: 52,
  distribution: [
    { stars: 5, count: 24, pct: 46.2 },
    { stars: 4, count: 16, pct: 30.8 },
    { stars: 3, count: 8, pct: 15.4 },
    { stars: 2, count: 3, pct: 5.8 },
    { stars: 1, count: 1, pct: 1.9 },
  ],
  recentComments: [
    { id: "s1", rating: 5, comment: "성수동 구석구석 알게 돼서 좋았어요!", createdAt: "2026-04-02T14:30:00Z" },
    { id: "s2", rating: 4, comment: "아이랑 같이 돌았는데 재밌었어요. 거리가 좀 멀었어요.", createdAt: "2026-04-02T11:15:00Z" },
    { id: "s3", rating: 5, comment: "QR 찍는 재미가 있네요 ㅎㅎ", createdAt: "2026-04-01T16:45:00Z" },
    { id: "s4", rating: 3, comment: "체크인이 가끔 안 됐어요. GPS 문제인 듯", createdAt: "2026-04-01T13:20:00Z" },
  ],
}

const DUMMY_CONTENT = [
  { id: "m1", authorName: "참여자A", text: "분위기 최고! 사진 찍기 좋아요", createdAt: "2026-04-02T15:10:00Z", status: "visible", featureTitle: "축제 본부" },
  { id: "m2", authorName: "참여자B", text: "커피가 맛있었어요 ☕", createdAt: "2026-04-02T14:05:00Z", status: "visible", featureTitle: "성수 연방" },
  { id: "m3", authorName: "참여자C", text: "전시 볼만합니다!", createdAt: "2026-04-02T12:30:00Z", status: "visible", featureTitle: "아트벙커" },
  { id: "m4", authorName: "참여자D", text: "맥주 할인 좋아요~", createdAt: "2026-04-01T18:20:00Z", status: "hidden", featureTitle: "뚝섬 수제맥주" },
  { id: "m5", authorName: "참여자E", text: "피크닉하기 딱 좋은 날씨였어요", createdAt: "2026-04-01T15:40:00Z", status: "visible", featureTitle: "서울숲 피크닉" },
]

const DUMMY_INSIGHTS = [
  "완주율이 31.3%로 양호합니다. 체크포인트 간 거리를 줄이면 더 올릴 수 있어요.",
  "QR 코드 유입이 14.5%입니다. 현장 QR 배치를 늘려보세요.",
  "카카오톡 유입이 23%로 높습니다. 카카오 공유를 적극 활용하세요.",
  "오후 3~4시가 피크 시간대입니다. 이 시간에 공지를 게시하면 효과적이에요.",
]

const DUMMY_ANNOUNCEMENTS = [
  { id: "ann1", title: "축제 운영시간 변경 안내", body: "4/2부터 종료 시간이 19시로 연장됩니다.", is_active: true, created_at: "2026-04-01T09:00:00Z" },
  { id: "ann2", title: "주차장 안내", body: "성수역 공영주차장을 이용해주세요. 축제 참여 시 1시간 무료입니다.", is_active: true, created_at: "2026-03-30T14:00:00Z" },
  { id: "ann3", title: "사전 안내 (종료)", body: "사전 등록은 3/31에 마감되었습니다.", is_active: false, created_at: "2026-03-28T10:00:00Z" },
]

// ─── 기간 프리셋 ───

const PERIOD_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "today", label: "오늘" },
  { value: "7d", label: "최근 7일" },
  { value: "30d", label: "최근 30일" },
]

// ─── 간이 바 차트 ───

function SimpleBar({ value, max, color = "#4F46E5", height = 20 }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="dash-bar" style={{ height }}>
      <div className="dash-bar__fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

function MiniBarChart({ data, valueKey, labelKey, color = "#4F46E5", maxHeight = 80 }) {
  const maxVal = Math.max(...data.map((d) => d[valueKey]), 1)
  return (
    <div className="dash-mini-chart">
      {data.map((d, i) => {
        const h = (d[valueKey] / maxVal) * maxHeight
        return (
          <div key={i} className="dash-mini-chart__col">
            <div className="dash-mini-chart__bar" style={{ height: h, background: color }} title={`${d[valueKey]}`} />
            <span className="dash-mini-chart__label">{d[labelKey]}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── 메인 컴포넌트 ───

const FALLBACK_MAP = {
  id: "demo-dashboard",
  title: "2026 성수 봄 축제 (데모)",
  description: "더미데이터로 대시보드 UI를 미리 확인하세요.",
  theme: "#F97316",
  category: "event",
  config: { checkin_enabled: true, survey_enabled: true, announcements_enabled: true },
}

export function DashboardScreen({ map: mapProp, features, ownerMaps, onBack, onSelectMap }) {
  const map = mapProp || FALLBACK_MAP
  const [period, setPeriod] = useState("all")
  const [activeSection, setActiveSection] = useState("overview") // overview | maps | announcements
  const [contentFilter, setContentFilter] = useState("all") // all | visible | hidden

  const isEventMap = map?.category === "event"
  const config = map?.config || {}

  const filteredContent = useMemo(() => {
    if (contentFilter === "all") return DUMMY_CONTENT
    return DUMMY_CONTENT.filter((c) => c.status === contentFilter)
  }, [contentFilter])

  const eventMaps = useMemo(() =>
    (ownerMaps || []).filter((m) => m.category === "event"),
    [ownerMaps],
  )

  const formatDate = (iso) => {
    if (!iso) return ""
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`
  }

  return (
    <section className="screen screen--scroll dash-screen">
      {/* 헤더 */}
      <div className="dash-header">
        <button className="dash-header__back" type="button" onClick={onBack}>← 뒤로</button>
        <h1 className="dash-header__title">대시보드</h1>
        <span className="dash-header__badge">{map?.title || "지도 선택"}</span>
      </div>

      {/* 섹션 탭 */}
      <nav className="dash-tabs">
        {[
          ["overview", "📊 대시보드"],
          ["maps", "🗺 지도관리"],
          ["announcements", "📢 공지관리"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`dash-tab${activeSection === key ? " dash-tab--active" : ""}`}
            type="button"
            onClick={() => setActiveSection(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* ========== 대시보드 섹션 ========== */}
      {activeSection === "overview" ? (
        <div className="dash-content">
          {/* 기간 필터 */}
          <div className="dash-period">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`dash-period__btn${period === opt.value ? " dash-period__btn--active" : ""}`}
                type="button"
                onClick={() => setPeriod(opt.value)}
              >
                {opt.label}
              </button>
            ))}
            <span className="dash-period__updated">마지막 업데이트: 4/3 14:30</span>
          </div>

          {/* 핵심 지표 카드 */}
          <div className="dash-metrics">
            <div className="dash-metric-card">
              <span className="dash-metric-card__icon">👀</span>
              <div className="dash-metric-card__body">
                <span className="dash-metric-card__value">{DUMMY_SUMMARY.totalViews.toLocaleString()}</span>
                <span className="dash-metric-card__label">총 조회수</span>
              </div>
            </div>
            <div className="dash-metric-card">
              <span className="dash-metric-card__icon">👤</span>
              <div className="dash-metric-card__body">
                <span className="dash-metric-card__value">{DUMMY_SUMMARY.uniqueVisitors.toLocaleString()}</span>
                <span className="dash-metric-card__label">방문자 수</span>
              </div>
            </div>
            <div className="dash-metric-card">
              <span className="dash-metric-card__icon">📍</span>
              <div className="dash-metric-card__body">
                <span className="dash-metric-card__value">{DUMMY_SUMMARY.totalCheckins}</span>
                <span className="dash-metric-card__label">체크인</span>
              </div>
            </div>
            <div className="dash-metric-card">
              <span className="dash-metric-card__icon">🏆</span>
              <div className="dash-metric-card__body">
                <span className="dash-metric-card__value">{DUMMY_SUMMARY.completions}</span>
                <span className="dash-metric-card__label">완주</span>
              </div>
            </div>
            <div className="dash-metric-card">
              <span className="dash-metric-card__icon">⭐</span>
              <div className="dash-metric-card__body">
                <span className="dash-metric-card__value">{DUMMY_SUMMARY.avgRating}</span>
                <span className="dash-metric-card__label">평균 평점</span>
              </div>
            </div>
            <div className="dash-metric-card">
              <span className="dash-metric-card__icon">📝</span>
              <div className="dash-metric-card__body">
                <span className="dash-metric-card__value">{DUMMY_SUMMARY.surveyCount}</span>
                <span className="dash-metric-card__label">설문 응답</span>
              </div>
            </div>
          </div>

          {/* 참여 퍼널 */}
          <div className="dash-card">
            <h3 className="dash-card__title">참여 퍼널</h3>
            <div className="dash-funnel">
              {DUMMY_FUNNEL.map((step, i) => (
                <div key={step.label} className="dash-funnel__step">
                  <div className="dash-funnel__bar-wrap">
                    <SimpleBar value={step.pct} max={100} color={["#4F46E5", "#12B981", "#F97316", "#EF4444"][i]} />
                  </div>
                  <div className="dash-funnel__info">
                    <strong>{step.label}</strong>
                    <span>{step.value.toLocaleString()} ({step.pct}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 체크포인트 방문율 */}
          {isEventMap && config.checkin_enabled ? (
            <div className="dash-card">
              <h3 className="dash-card__title">체크포인트 방문율</h3>
              <div className="dash-checkpoint-list">
                {DUMMY_CHECKPOINTS.map((cp) => (
                  <div key={cp.id} className="dash-checkpoint">
                    <span className="dash-checkpoint__emoji">{cp.emoji}</span>
                    <div className="dash-checkpoint__info">
                      <div className="dash-checkpoint__head">
                        <strong>{cp.title}</strong>
                        <span>{cp.visits}회 ({cp.pct}%)</span>
                      </div>
                      <SimpleBar value={cp.pct} max={100} color="#12B981" height={8} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* 참여 추이 (일별) */}
          <div className="dash-card">
            <h3 className="dash-card__title">일별 참여 추이</h3>
            <div className="dash-chart-legend">
              <span className="dash-legend-dot" style={{ background: "#4F46E5" }} /> 조회
              <span className="dash-legend-dot" style={{ background: "#12B981" }} /> 체크인
            </div>
            <MiniBarChart data={DUMMY_DAILY} valueKey="views" labelKey="date" color="#4F46E5" />
          </div>

          {/* 시간대별 분포 */}
          <div className="dash-card">
            <h3 className="dash-card__title">시간대별 접속 분포</h3>
            <MiniBarChart data={DUMMY_HOURLY} valueKey="views" labelKey="hour" color="#F97316" maxHeight={60} />
          </div>

          {/* 인기 핀 TOP 5 */}
          <div className="dash-card">
            <h3 className="dash-card__title">인기 핀 TOP 5</h3>
            <div className="dash-rank-list">
              {DUMMY_TOP_FEATURES.map((f, i) => (
                <div key={f.id} className="dash-rank-item">
                  <span className="dash-rank-item__num">{i + 1}</span>
                  <span className="dash-rank-item__emoji">{f.emoji}</span>
                  <div className="dash-rank-item__info">
                    <strong>{f.title}</strong>
                    <span>클릭 {f.clicks} · 체크인 {f.checkins}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 유입 채널 */}
          <div className="dash-card">
            <h3 className="dash-card__title">유입 채널 분석</h3>
            <div className="dash-channel-list">
              {DUMMY_CHANNELS.map((ch) => (
                <div key={ch.source} className="dash-channel">
                  <div className="dash-channel__head">
                    <span className="dash-channel__dot" style={{ background: ch.color }} />
                    <strong>{ch.label}</strong>
                    <span>{ch.count}회 ({ch.pct}%)</span>
                  </div>
                  <SimpleBar value={ch.pct} max={100} color={ch.color} height={6} />
                </div>
              ))}
            </div>
          </div>

          {/* 설문 결과 */}
          {isEventMap && config.survey_enabled ? (
            <div className="dash-card">
              <h3 className="dash-card__title">설문 결과</h3>
              <div className="dash-survey-summary">
                <div className="dash-survey-avg">
                  <span className="dash-survey-avg__stars">
                    {"★".repeat(Math.round(DUMMY_SURVEY.avgRating))}{"☆".repeat(5 - Math.round(DUMMY_SURVEY.avgRating))}
                  </span>
                  <span className="dash-survey-avg__score">{DUMMY_SURVEY.avgRating} / 5.0</span>
                  <span className="dash-survey-avg__count">{DUMMY_SURVEY.count}명 응답</span>
                </div>
                <div className="dash-survey-dist">
                  {DUMMY_SURVEY.distribution.map((d) => (
                    <div key={d.stars} className="dash-survey-dist__row">
                      <span>{d.stars}★</span>
                      <SimpleBar value={d.pct} max={100} color="#F59E0B" height={8} />
                      <span>{d.count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <h4 className="dash-card__subtitle">최근 후기</h4>
              <div className="dash-comments">
                {DUMMY_SURVEY.recentComments.map((c) => (
                  <div key={c.id} className="dash-comment">
                    <div className="dash-comment__head">
                      <span className="dash-comment__stars">{"★".repeat(c.rating)}</span>
                      <span className="dash-comment__date">{formatDate(c.createdAt)}</span>
                    </div>
                    <p>{c.comment}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* 콘텐츠 관리 */}
          <div className="dash-card">
            <h3 className="dash-card__title">콘텐츠 관리</h3>
            <div className="dash-content-filter">
              {[
                ["all", `전체 (${DUMMY_CONTENT.length})`],
                ["visible", `공개 (${DUMMY_CONTENT.filter((c) => c.status === "visible").length})`],
                ["hidden", `숨김 (${DUMMY_CONTENT.filter((c) => c.status === "hidden").length})`],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={`dash-content-filter__btn${contentFilter === key ? " dash-content-filter__btn--active" : ""}`}
                  type="button"
                  onClick={() => setContentFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="dash-content-list">
              {filteredContent.map((item) => (
                <div key={item.id} className={`dash-content-item${item.status === "hidden" ? " dash-content-item--hidden" : ""}`}>
                  <div className="dash-content-item__head">
                    <strong>{item.authorName}</strong>
                    <span className="dash-content-item__where">@ {item.featureTitle}</span>
                    <span className="dash-content-item__date">{formatDate(item.createdAt)}</span>
                  </div>
                  <p>{item.text}</p>
                  <button
                    className="button button--ghost dash-content-item__toggle"
                    type="button"
                    onClick={() => {/* toggle demo */}}
                  >
                    {item.status === "visible" ? "숨기기" : "공개하기"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 자동 인사이트 */}
          <div className="dash-card dash-card--insights">
            <h3 className="dash-card__title">💡 자동 인사이트</h3>
            <ul className="dash-insights">
              {DUMMY_INSIGHTS.map((text, i) => (
                <li key={i}>{text}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {/* ========== 지도관리 섹션 ========== */}
      {activeSection === "maps" ? (
        <div className="dash-content">
          <div className="dash-card">
            <h3 className="dash-card__title">내 이벤트 지도</h3>
            <p className="dash-card__desc">관리 중인 이벤트 지도 목록입니다. 지도를 선택하면 대시보드 데이터가 전환됩니다.</p>
          </div>

          <div className="dash-map-list">
            {(eventMaps.length > 0 ? eventMaps : [
              { id: "map-event-festival", title: "2026 성수 봄 축제", description: "성수동 일대 5곳을 방문하고 스탬프를 모아보세요!", theme: "#F97316", category: "event", config: { checkin_enabled: true, survey_enabled: true, announcements_enabled: true } },
              { id: "map-event-campus", title: "서울대 캠퍼스 투어", description: "신입생 오리엔테이션 캠퍼스 스탬프 투어", theme: "#4F46E5", category: "event", config: { checkin_enabled: true, survey_enabled: true, announcements_enabled: true } },
            ]).map((m) => {
              const isActive = m.id === map?.id
              const featureCount = (features || []).filter((f) => f.mapId === m.id).length
              return (
                <button
                  key={m.id}
                  className={`dash-map-card${isActive ? " dash-map-card--active" : ""}`}
                  type="button"
                  onClick={() => onSelectMap?.(m.id)}
                >
                  <div className="dash-map-card__color" style={{ background: m.theme }} />
                  <div className="dash-map-card__info">
                    <strong>{m.title}</strong>
                    <span>{m.description}</span>
                    <div className="dash-map-card__meta">
                      <span className="dash-map-card__badge">이벤트</span>
                      <span>📍 {featureCount}개 체크포인트</span>
                      {m.config?.checkin_enabled ? <span>✅ 체크인</span> : null}
                      {m.config?.survey_enabled ? <span>📝 설문</span> : null}
                      {m.config?.announcements_enabled ? <span>📢 공지</span> : null}
                    </div>
                  </div>
                  {isActive ? <span className="dash-map-card__selected">선택됨</span> : null}
                </button>
              )
            })}
          </div>

          {/* 선택된 지도 요약 */}
          {map ? (
            <div className="dash-card">
              <h3 className="dash-card__title">📊 {map.title} 요약</h3>
              <div className="dash-map-summary">
                <div className="dash-map-summary__row">
                  <span>카테고리</span>
                  <strong>{map.category === "event" ? "이벤트" : "개인"}</strong>
                </div>
                <div className="dash-map-summary__row">
                  <span>체크포인트</span>
                  <strong>{(features || []).filter((f) => f.type === "pin").length}개</strong>
                </div>
                <div className="dash-map-summary__row">
                  <span>체크인</span>
                  <strong>{config.checkin_enabled ? "활성" : "비활성"}</strong>
                </div>
                <div className="dash-map-summary__row">
                  <span>설문</span>
                  <strong>{config.survey_enabled ? "활성" : "비활성"}</strong>
                </div>
                <div className="dash-map-summary__row">
                  <span>공지</span>
                  <strong>{config.announcements_enabled ? "활성" : "비활성"}</strong>
                </div>
                <div className="dash-map-summary__row">
                  <span>테마 색상</span>
                  <span className="dash-map-summary__color" style={{ background: map.theme }} />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ========== 공지관리 섹션 ========== */}
      {activeSection === "announcements" ? (
        <div className="dash-content">
          <div className="dash-card">
            <h3 className="dash-card__title">공지 관리</h3>
            <p className="dash-card__desc">이벤트 지도에 표시되는 공지사항을 관리합니다.</p>
            <button className="button button--primary" type="button" style={{ marginTop: 12 }}>
              새 공지 작성
            </button>
          </div>

          <div className="dash-ann-list">
            {DUMMY_ANNOUNCEMENTS.map((ann) => (
              <div key={ann.id} className={`dash-ann-item${ann.is_active ? "" : " dash-ann-item--inactive"}`}>
                <div className="dash-ann-item__head">
                  <div className="dash-ann-item__info">
                    <strong>{ann.title}</strong>
                    <span className="dash-ann-item__date">{formatDate(ann.created_at)}</span>
                  </div>
                  <span className={`dash-ann-item__badge${ann.is_active ? " dash-ann-item__badge--active" : ""}`}>
                    {ann.is_active ? "활성" : "비활성"}
                  </span>
                </div>
                {ann.body ? <p className="dash-ann-item__body">{ann.body}</p> : null}

                {/* 미리보기 */}
                {ann.is_active ? (
                  <div className="dash-ann-preview">
                    <span className="dash-ann-preview__label">참여자에게 보이는 모습</span>
                    <div className="dash-ann-preview__card">
                      <strong>📢 {ann.title}</strong>
                      {ann.body ? <p>{ann.body}</p> : null}
                    </div>
                  </div>
                ) : null}

                <div className="dash-ann-item__actions">
                  <button className="button button--ghost" type="button">수정</button>
                  <button className="button button--ghost" type="button">
                    {ann.is_active ? "비활성화" : "활성화"}
                  </button>
                  <button className="button button--ghost dash-ann-item__delete" type="button">삭제</button>
                </div>
              </div>
            ))}
          </div>

          {/* 공지 통계 */}
          <div className="dash-card">
            <h3 className="dash-card__title">공지 현황</h3>
            <div className="dash-ann-stats">
              <div className="dash-ann-stat">
                <span className="dash-ann-stat__value">{DUMMY_ANNOUNCEMENTS.length}</span>
                <span className="dash-ann-stat__label">전체 공지</span>
              </div>
              <div className="dash-ann-stat">
                <span className="dash-ann-stat__value">{DUMMY_ANNOUNCEMENTS.filter((a) => a.is_active).length}</span>
                <span className="dash-ann-stat__label">활성 공지</span>
              </div>
              <div className="dash-ann-stat">
                <span className="dash-ann-stat__value">{DUMMY_ANNOUNCEMENTS.filter((a) => !a.is_active).length}</span>
                <span className="dash-ann-stat__label">비활성 공지</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
