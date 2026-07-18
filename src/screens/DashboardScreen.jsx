import { useEffect, useMemo, useState } from "react"
import { getPlaceType } from "../lib/placeTypes"
import { formatDotDate } from "../lib/binderCardData"
import { PixelAvatar, avatarCharOf } from "../components/PixelAvatar"
import { PlaceCardFront } from "../components/binder/PlaceFlipCard"
import "../styles/dashboard-v2.css"

// 내 대시보드 — 나만 보는 등록·기록 데이터 수첩 (개발지시서 2026.07.06 기준)
// 레퍼런스: loca-binder-prototype.html #scr-dash / renderDash
// ① 히어로 ID 카드 ② 동네 도감 ③ 자주 꺼낸 카드 | 지도별 현황 ④ 최근 등록 ⑤ 모험 연대기
// 전부 파생값(장소·기록·지도·동네) — 대시보드 전용 저장 필드 없음.

const TRAINER_ID_KEY = "loca.trainer_id"
const RECENT_COUNT = 6
const TOP_COUNT = 5

const prefersReduced = typeof window !== "undefined"
  && window.matchMedia
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches

function isRecordType(feature) {
  return ["pin", "route", "area"].includes(feature?.type)
}

function pad2(n) { return String(n).padStart(2, "0") }
function pad3(n) { return String(n).padStart(3, "0") }
function monthKey(value) {
  const d = new Date(value || NaN)
  return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}.${pad2(d.getMonth() + 1)}`
}

// 기록(records) = 텍스트가 있는 메모. 지시서: 기록 = Σ place.records.length
function memoEntries(feature) {
  return (feature?.memos || [])
    .filter((memo) => (memo?.text || "").trim())
    .map((memo) => ({ text: memo.text.trim(), date: memo.createdAt || memo.date || feature.createdAt || feature.updatedAt }))
}

// 동네 = 주소 첫 어절 계열. regionName(역지오코딩) 우선, 없으면 주소성 note 파싱.
function townOf(feature) {
  const region = `${feature?.regionName || ""}`.trim()
  if (region) {
    const words = region.split(/\s+/)
    return words.find((w) => /(동|읍|면)$/.test(w))
      || words.find((w) => /(구|군|시)$/.test(w))
      || words[words.length - 1]
  }
  const note = `${feature?.note || ""}`.trim()
  if (note && note.length <= 60 && /(로|길)\s?\d|(동|리)\s?\d|번길|[가-힣]+(시|군)\s[가-힣]/.test(note)) {
    const words = note.split(/\s+/)
    // 행정구역 어절만 채택 — 없으면 null (상호명 words[0] 을 동네로 오인하지 않도록)
    return words.find((w) => /(구|군|동|읍|면)$/.test(w)) || null
  }
  return null
}

function defaultTrainerId(sinceValue) {
  const d = new Date(sinceValue || NaN)
  if (Number.isNaN(d.getTime())) return "000000"
  return String(d.getFullYear()).slice(2) + pad2(d.getMonth() + 1) + pad2(d.getDate())
}

// ── 자릿수 롤링 오도미터 (지시서 §6) ──
function OdoDigit({ digit }) {
  const target = Number(digit)
  const [roll, setRoll] = useState(0)
  useEffect(() => {
    if (prefersReduced) return undefined
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setRoll(target)))
    return () => cancelAnimationFrame(raf)
  }, [target])
  const shown = prefersReduced ? target : roll
  return (
    <span className="odo-col">
      <span className="odo-stack" style={{ transform: `translateY(${-shown * 10}%)` }}>
        {Array.from({ length: 10 }, (_, n) => <span key={n}>{n}</span>)}
      </span>
    </span>
  )
}

function Odometer({ value }) {
  const digits = String(Math.max(0, Math.round(value || 0)))
  return (
    <span className="odo" aria-label={digits}>
      {digits.split("").map((d, i) => <OdoDigit key={`${digits.length}-${i}`} digit={d} />)}
    </span>
  )
}

// ── 최신 기록 타자기 (지시서 §6) ──
function useTypewriter(text) {
  const [shown, setShown] = useState("")
  useEffect(() => {
    if (prefersReduced || !text) return undefined
    let i = 0
    const timer = window.setInterval(() => {
      i += 1
      setShown(text.slice(0, i))
      if (i >= text.length) window.clearInterval(timer)
    }, 24)
    return () => window.clearInterval(timer)
  }, [text])
  return prefersReduced ? text : (text ? shown : "")
}

function DashPanel({ title, right, className = "", bodyStyle, children }) {
  return (
    <section className="dpanel">
      <div className="dpanel-head">
        <span className="tt">{title}</span>
        {right}
      </div>
      <div className={`dpanel-body ${className}`.trim()} style={bodyStyle}>{children}</div>
    </section>
  )
}

export function DashboardScreen({
  user,
  maps = [],
  features = [],
  onOpenFeature,
  onOpenPlaces,
  onOpenMap,
}) {
  const recordFeatures = useMemo(() => {
    const mapIds = new Set(maps.map((map) => map.id))
    return features.filter((feature) => isRecordType(feature) && (!feature.mapId || mapIds.has(feature.mapId)))
  }, [features, maps])

  // ── 파생 통계 ──
  const totalRecords = useMemo(
    () => recordFeatures.reduce((sum, feature) => sum + memoEntries(feature).length, 0),
    [recordFeatures],
  )
  const towns = useMemo(() => {
    const set = new Set()
    recordFeatures.forEach((feature) => { const t = townOf(feature); if (t) set.add(t) })
    return set
  }, [recordFeatures])

  const since = useMemo(() => {
    let min = null
    recordFeatures.forEach((feature) => {
      const d = new Date(feature.createdAt || feature.updatedAt || NaN)
      if (!Number.isNaN(d.getTime()) && (!min || d < min)) min = d
    })
    return min
  }, [recordFeatures])

  const stats = [
    { label: "장소", value: recordFeatures.length },
    { label: "기록", value: totalRecords },
    { label: "지도", value: maps.length },
    { label: "동네", value: towns.size },
  ]

  // ── 트레이너 ID (수정 가능, SINCE는 고정) ──
  const [trainerId, setTrainerId] = useState(() => {
    try { return localStorage.getItem(TRAINER_ID_KEY) || "" } catch { return "" }
  })
  const [editingId, setEditingId] = useState(false)
  const [idDraft, setIdDraft] = useState("")
  const sinceText = since ? formatDotDate(since) : null
  const displayId = trainerId || defaultTrainerId(since)

  const openIdEdit = () => { setIdDraft(displayId); setEditingId(true) }
  const commitId = () => {
    const cleaned = idDraft.replace(/\D/g, "").slice(0, 6)
    setTrainerId(cleaned)
    try {
      if (cleaned) localStorage.setItem(TRAINER_ID_KEY, cleaned)
      else localStorage.removeItem(TRAINER_ID_KEY)
    } catch { /* noop */ }
    setEditingId(false)
  }

  // ── 동네 도감 ──
  const townTiles = useMemo(() => {
    const byTown = new Map()
    recordFeatures.forEach((feature) => {
      const t = townOf(feature)
      if (!t) return
      const entry = byTown.get(t) || { town: t, count: 0, types: new Map(), last: null }
      entry.count += 1
      const type = getPlaceType(feature)
      if (!entry.types.has(type.id)) entry.types.set(type.id, type)
      const dates = [feature.createdAt, ...memoEntries(feature).map((m) => m.date)]
      dates.forEach((value) => {
        const d = new Date(value || NaN)
        if (!Number.isNaN(d.getTime()) && (!entry.last || d > entry.last)) entry.last = d
      })
      byTown.set(t, entry)
    })
    return [...byTown.values()].sort((a, b) => b.count - a.count)
  }, [recordFeatures])

  // ── 자주 꺼낸 카드 TOP5 ──
  const topCards = useMemo(() => {
    const scored = recordFeatures
      .map((feature) => ({ feature, recs: memoEntries(feature).length }))
      .filter((row) => row.recs > 0)
      .sort((a, b) => b.recs - a.recs)
      .slice(0, TOP_COUNT)
    const max = scored[0]?.recs || 1
    return { rows: scored, max }
  }, [recordFeatures])

  // ── 지도별 현황 ──
  const mapRows = useMemo(() => {
    const rows = maps.map((map) => ({
      map,
      pins: recordFeatures.filter((feature) => feature.mapId === map.id).length,
    }))
    const max = Math.max(1, ...rows.map((row) => row.pins))
    return { rows, max }
  }, [maps, recordFeatures])

  // ── 최근 등록 6 ──
  const dexNoByFeatureId = useMemo(() => {
    const ordered = [...recordFeatures].sort(
      (a, b) => new Date(a.createdAt || a.updatedAt || 0) - new Date(b.createdAt || b.updatedAt || 0),
    )
    const info = new Map()
    ordered.forEach((feature, index) => info.set(feature.id, pad3(index + 1)))
    return info
  }, [recordFeatures])
  const mapTitleById = useMemo(() => new Map(maps.map((map) => [map.id, map.title])), [maps])
  const recentCards = useMemo(
    () => [...recordFeatures]
      .sort((a, b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0))
      .slice(0, RECENT_COUNT),
    [recordFeatures],
  )

  // ── 모험 연대기 ──
  const chronicle = useMemo(() => {
    const months = new Map()
    const townFirst = new Map()
    recordFeatures.forEach((feature) => {
      const mk = monthKey(feature.createdAt || feature.updatedAt)
      if (mk) {
        const entry = months.get(mk) || { cards: 0, recs: 0, towns: [] }
        entry.cards += 1
        months.set(mk, entry)
      }
      memoEntries(feature).forEach((memo) => {
        const rk = monthKey(memo.date)
        if (!rk) return
        const entry = months.get(rk) || { cards: 0, recs: 0, towns: [] }
        entry.recs += 1
        months.set(rk, entry)
      })
      const t = townOf(feature)
      if (t && mk && (!townFirst.has(t) || mk < townFirst.get(t))) townFirst.set(t, mk)
    })
    townFirst.forEach((mk, t) => { if (months.has(mk)) months.get(mk).towns.push(t) })
    return [...months.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
  }, [recordFeatures])

  const latest = useMemo(() => {
    let best = null
    recordFeatures.forEach((feature) => {
      memoEntries(feature).forEach((memo) => {
        const d = new Date(memo.date || NaN)
        if (Number.isNaN(d.getTime())) return
        if (!best || d > best.date) best = { text: memo.text, name: feature.title || "이름 없는 장소", dateText: formatDotDate(memo.date), date: d }
      })
    })
    return best
  }, [recordFeatures])
  const quote = useTypewriter(latest ? `"${latest.text}" — ${latest.name}, ${latest.dateText}` : "")

  const handleText = (user.handle || user.username || user.name || "loca").replace(/^@/, "")
  const hasRecords = recordFeatures.length > 0

  return (
    <section className="screen screen--scroll dashboard-screen">
      <div className="dash">
        {/* ① 히어로 ID 카드 */}
        <div className="hero-id">
          <div className="hi-avatar hi-avatar--char" aria-hidden="true">
            <PixelAvatar char={avatarCharOf(user) || "male"} />
          </div>
          <div className="hi-main">
            <div className="hi-name">{user.name}</div>
            <div className="hi-handle">@{handleText}</div>
            <div className="hi-since">
              {sinceText ? `SINCE ${sinceText}` : "SINCE —"} · ID
              {editingId ? (
                <span className="hi-idedit">
                  No.
                  <input
                    autoFocus
                    value={idDraft}
                    inputMode="numeric"
                    maxLength={6}
                    onChange={(e) => setIdDraft(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onBlur={commitId}
                    onKeyDown={(e) => { if (e.key === "Enter") commitId() }}
                    aria-label="트레이너 ID"
                  />
                </span>
              ) : (
                <button type="button" className="hi-idbtn" onClick={openIdEdit} aria-label="트레이너 ID 수정">
                  No.{displayId}<i className="hi-idpen" aria-hidden="true">✎</i>
                </button>
              )}
            </div>
          </div>
          <div className="hi-stats">
            {stats.map((stat) => (
              <div className="hi-cell" key={stat.label}>
                <Odometer value={stat.value} />
                <div className="cl">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ② 동네 도감 */}
        <DashPanel
          title="동네 도감"
          right={<span className="rt">{townTiles.length > 0 ? `동네 ${townTiles.length}곳 · 카드 ${recordFeatures.length}장` : ""}</span>}
          className="town-grid"
        >
          {townTiles.length > 0 ? townTiles.map((tile, i) => (
            <button key={tile.town} type="button" className="town-card" onClick={() => onOpenPlaces?.(tile.town)}>
              <div className="th">
                <span className="no">TOWN.{pad2(i + 1)}</span>
                <span className="n">카드 {tile.count}장</span>
              </div>
              <div className="tb">
                <div className="nm">{tile.town}</div>
                <div className="types">
                  {[...tile.types.values()].map((type) => (
                    <span key={type.id} className="tchip" style={{ background: type.color }} title={type.label}>{type.label.slice(0, 1)}</span>
                  ))}
                </div>
                {tile.last ? <div className="last">최근 기록 {formatDotDate(tile.last)}</div> : null}
              </div>
            </button>
          )) : (
            <div className="dash-sleeve">주소가 있는 카드를 담으면 동네가 채워져요</div>
          )}
        </DashPanel>

        {/* ③ 자주 꺼낸 카드 | 지도별 현황 */}
        <div className="dcols">
          <DashPanel title="자주 꺼낸 카드" right={<span className="rt">기록 많은 순</span>} bodyStyle={{ padding: "8px 16px" }}>
            {topCards.rows.length > 0 ? topCards.rows.map((row, i) => {
              const type = getPlaceType(row.feature)
              return (
                <button key={row.feature.id} type="button" className="top-row" onClick={() => onOpenFeature?.(row.feature.id)}>
                  <span className="rk">{i + 1}</span>
                  <span className="tdot" style={{ background: type.color }} aria-hidden="true" />
                  <span className="nm">{row.feature.title || "이름 없는 장소"}</span>
                  <span className="bar"><i style={{ width: `${(row.recs / topCards.max) * 100}%` }} /></span>
                  <span className="cnt">기록 {row.recs}</span>
                </button>
              )
            }) : (
              <div className="dash-sleeve dash-sleeve--sm">기록을 남기면 자주 꺼낸 카드가 쌓여요</div>
            )}
          </DashPanel>

          <DashPanel title="지도별 현황" right={<span className="rt">누르면 편집으로</span>} bodyStyle={{ padding: "8px 16px" }}>
            {mapRows.rows.length > 0 ? mapRows.rows.map((row) => (
              <button key={row.map.id} type="button" className="dash-maprow" onClick={() => onOpenMap?.(row.map.id)}>
                <span className="nm">{row.map.title}</span>
                <span className="bar"><i style={{ width: `${(row.pins / mapRows.max) * 100}%` }} /></span>
                <span className="cnt">핀 {row.pins}개</span>
              </button>
            )) : (
              <div className="dash-sleeve dash-sleeve--sm">지도를 만들면 현황이 표시돼요</div>
            )}
          </DashPanel>
        </div>

        {/* ④ 최근 등록 */}
        <DashPanel
          title="최근 채집"
          right={<button type="button" className="dpanel-more" onClick={() => onOpenPlaces?.()}>전체 보기</button>}
          className="drecent"
        >
          {recentCards.length > 0 ? recentCards.map((feature) => (
            <button
              key={feature.id}
              type="button"
              className="bd-card drecent__card"
              onClick={() => onOpenFeature?.(feature.id)}
              aria-label={`${(feature.title || "").trim() || "이름 없는 장소"} 카드 열기`}
            >
              <PlaceCardFront feature={feature} dexNo={dexNoByFeatureId.get(feature.id)} mapTitle={mapTitleById.get(feature.mapId) || null} />
            </button>
          )) : (
            <div className="dash-sleeve">첫 카드를 담으면 여기 꽂혀요</div>
          )}
        </DashPanel>

        {/* ⑤ 모험 연대기 */}
        <DashPanel title="모험 연대기" right={<span className="rt">월별 요약</span>} className="chrono-wrap">
          {chronicle.length > 0 ? (
            <div className="chrono">
              {chronicle.map(([mk, m], i) => {
                const parts = []
                if (m.cards) parts.push(<span key="c">카드 <b>{m.cards}장</b> 채집</span>)
                if (m.recs) parts.push(<span key="r">기록 <b>{m.recs}개</b></span>)
                if (m.towns.length) parts.push(<span key="t">새 동네 <b>{m.towns.join(", ")}</b></span>)
                return (
                  <div className="ch-item" key={mk}>
                    <span className="dot" />
                    <time>{mk}{i === 0 ? " · 모험 시작" : ""}{i === chronicle.length - 1 ? " · 지금" : ""}</time>
                    <p>{parts.length ? parts.reduce((acc, part, idx) => (idx ? [...acc, <span key={`s${idx}`}> · </span>, part] : [part]), []) : "조용한 달"}</p>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="dash-sleeve">{hasRecords ? "" : "첫 카드를 담으면 여정이 시작돼요"}</div>
          )}
          <div className="chrono-foot">
            <span className="cf-lb">가장 최근 기록</span>
            <span className="cf-quote">{latest ? quote : "첫 기록을 남기면 여기에 나와요."}</span>
          </div>
        </DashPanel>
      </div>
    </section>
  )
}
