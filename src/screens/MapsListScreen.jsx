import { useEffect, useMemo, useState } from "react"
import { Check, ChevronDown, GripVertical, Link2, Lock, MoreHorizontal, MoveVertical, Pencil, Search as SearchIcon, Trash2, Users, X } from "lucide-react"
import { EmptyState, SkeletonCard } from "../components/ui"
import { getProfilePlacementState } from "../lib/mapPlacement"
import { generateMiniMapSvg } from "../lib/miniMapPreview"
import { generatePixelMapSvg } from "../lib/pixelMapThumb"

const MAP_FILTERS = [
  { id: "all", label: "전체" },
  { id: "public", label: "공개" },
  { id: "private", label: "비공개" },
]


function formatRelativeDate(dateStr) {
  if (!dateStr) return "최근 수정"
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (diff <= 0) return "오늘"
  if (diff === 1) return "어제"
  if (diff < 7) return `${diff}일 전`
  if (diff < 30) return `${Math.floor(diff / 7)}주 전`
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return "최근 수정"
  return `${date.getMonth() + 1}월 ${date.getDate()}일`
}

// 상태 3단계: 공개(public — 검색·탐색 노출) / 링크 공유 중(linked — 링크 아는 사람만) / 비공개(private — 나만).
// "공개" 필터에는 public 만 들어간다 — 링크만 켠 지도가 "공개"로 보이던 혼란을 없앤다.
function getMapStatus(map, placement) {
  const collabCount = Number(map.collabCount ?? map.collab_count ?? map.collaboratorCount ?? map.collaborator_count ?? 0)
  if (collabCount > 0 || (map.userRole && map.userRole !== "owner")) return "collab"
  if (placement.isPublished && map?.visibility === "public") return "public"
  if (placement.isPublished) return "linked"
  return "private"
}

function getCollabCount(map) {
  return Number(map.collabCount ?? map.collab_count ?? map.collaboratorCount ?? map.collaborator_count ?? 1)
}

function StatusBadge({ status, collabCount }) {
  if (status === "public") return <span className="maps-v3-status maps-v3-status--public">공개</span>
  if (status === "linked") {
    return (
      <span className="maps-v3-status maps-v3-status--linked">
        <Link2 size={8} strokeWidth={2.8} aria-hidden="true" />
        링크 공유
      </span>
    )
  }
  if (status === "private") {
    return (
      <span className="maps-v3-status maps-v3-status--private">
        <Lock size={8} strokeWidth={2.8} aria-hidden="true" />
        비공개
      </span>
    )
  }
  return <span className="maps-v3-status maps-v3-status--collab">함께 {collabCount}</span>
}

function getMapListOrder(map, fallbackIndex = 0) {
  const raw = map?.config?.listOrder ?? map?.config?.list_order
  const value = Number(raw)
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER + fallbackIndex
}

function sortMapEntries(a, b) {
  const orderDiff = getMapListOrder(a.map, a.index) - getMapListOrder(b.map, b.index)
  if (orderDiff !== 0) return orderDiff
  return new Date(b.map.updatedAt || b.map.updated_at || 0) - new Date(a.map.updatedAt || a.map.updated_at || 0)
}

function getInviteRoleLabel(role) {
  return role === "editor" ? "편집자" : "보기 전용"
}

function groupFeaturesByMapId(features = []) {
  return features.reduce((acc, feature) => {
    const mapId = feature?.mapId
    if (!mapId) return acc
    const list = acc.get(mapId)
    if (list) list.push(feature)
    else acc.set(mapId, [feature])
    return acc
  }, new Map())
}

function CollaborationInviteBanner({ invites = [], onAccept, onReject }) {
  if (!invites.length) return null

  return (
    <div className="maps-v3-invite-stack" aria-live="polite">
      {invites.map((invite) => (
        <article className="maps-v3-invite" key={invite.id}>
          <span
            className="maps-v3-invite__mark"
            style={{ background: invite.mapTheme || "var(--accent)" }}
            aria-hidden="true"
          />
          <span className="maps-v3-invite__copy">
            <strong>{invite.mapTitle || "초대받은 지도"}</strong>
            <span>{invite.ownerName || "다른 사용자"}님이 {getInviteRoleLabel(invite.role)}로 초대했어요.</span>
          </span>
          <span className="maps-v3-invite__actions">
            <button type="button" className="maps-v3-invite__button" onClick={() => onReject?.(invite.id)}>
              <X size={13} strokeWidth={2.5} aria-hidden="true" />
              거절
            </button>
            <button type="button" className="maps-v3-invite__button is-primary" onClick={() => onAccept?.(invite.id)}>
              <Check size={13} strokeWidth={2.6} aria-hidden="true" />
              수락
            </button>
          </span>
        </article>
      ))}
    </div>
  )
}

function MapsV3Card({
  item,
  displayNo = null,
  onOpen,
  onEdit,
  onCollaborate,
  onDelete,
  onStartReorder,
  reorderMode = false,
  isDragging = false,
  onDragStart,
  onDragEnter,
}) {
  const isEmpty = item.placeCount === 0
  const [menuOpen, setMenuOpen] = useState(false)
  const canManage = item.map.canManage !== false

  return (
    <article
      className={`maps-v3-card${isEmpty ? " maps-v3-card--empty" : ""}${reorderMode ? " is-reordering" : ""}${isDragging ? " is-dragging" : ""}`}
      role={reorderMode ? "listitem" : "button"}
      tabIndex={reorderMode ? -1 : 0}
      data-map-card-id={item.map.id}
      onPointerEnter={() => onDragEnter?.(item.map.id)}
      onClick={() => {
        if (reorderMode) return
        onOpen(item.map.id)
      }}
      onKeyDown={(event) => {
        if (reorderMode) return
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onOpen(item.map.id)
        }
      }}
    >
      {displayNo ? (
        <span className="maps-v3-card__no" aria-hidden="true">No.{displayNo}</span>
      ) : null}
      <span
        className="maps-v3-card__preview maps-v3-card__preview--dot"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: generatePixelMapSvg(item.map.id, item.pinPoints) }}
      />
      <StatusBadge status={item.status} collabCount={item.collabCount} />
      <span className="maps-v3-card__info">
        <span className="maps-v3-card__title-row">
          {reorderMode ? (
            <button
              className="maps-v3-card__drag"
              type="button"
              aria-label={`${item.map.title || "지도"} 순서 옮기기`}
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                event.currentTarget.setPointerCapture?.(event.pointerId)
                onDragStart?.(item.map.id)
              }}
            >
              <GripVertical size={15} />
            </button>
          ) : null}
          <strong className="maps-v3-card__title">{item.map.title || "이름 없는 지도"}</strong>
          {canManage && !reorderMode ? (
            <span className="maps-v3-card__more">
              <button
                className="maps-v3-card__more-btn"
                type="button"
                aria-label="지도 메뉴 열기"
                aria-expanded={menuOpen}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setMenuOpen((value) => !value)
                }}
              >
                <MoreHorizontal size={15} />
              </button>
              {menuOpen ? (
                <span
                  className="maps-v3-card__menu"
                  role="menu"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onEdit?.(item.map.id) }}>
                    <Pencil size={13} />
                    지도명 변경
                  </button>
                  {typeof onCollaborate === "function" ? (
                    <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onCollaborate?.(item.map.id) }}>
                      <Users size={13} />
                      함께 만들기
                    </button>
                  ) : null}
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onStartReorder?.(item.map.id) }}>
                    <MoveVertical size={13} />
                    지도 위치 변경
                  </button>
                  <button className="is-danger" type="button" role="menuitem" onClick={() => { setMenuOpen(false); onDelete?.(item.map.id, item.map.title) }}>
                    <Trash2 size={13} />
                    지도 삭제
                  </button>
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
        <span className="maps-v3-card__meta">
          <span>{item.placeCount} 장소</span>
          <i aria-hidden="true" />
          <span>{item.updatedLabel}</span>
        </span>
      </span>
    </article>
  )
}

export function MapsListScreen({
  maps,
  features,
  shares = [],
  characterImage,
  onCreate,
  onOpen,
  onEdit,
  onCollaborate,
  onDelete,
  onReorder,
  collaborationInvites = [],
  onAcceptCollaborationInvite,
  onRejectCollaborationInvite,
  loading = false,
}) {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [filter, setFilter] = useState("all")
  const [reorderMode, setReorderMode] = useState(false)
  const [draftOrder, setDraftOrder] = useState([])
  const [draggingId, setDraggingId] = useState(null)

  // 검색어 debounce — 300ms. setTimeout 안에서 setState 하므로 effect 내 동기 setState 가 아님.
  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      const id = window.setTimeout(() => setDebouncedQuery(""), 0)
      return () => window.clearTimeout(id)
    }
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  const featuresByMapId = useMemo(() => groupFeaturesByMapId(features), [features])
  const shareByMapId = useMemo(() => new Map(shares.map((share) => [share.mapId, share])), [shares])

  const mapEntries = useMemo(() => (
    maps.map((map, index) => {
      const placementRow = shareByMapId.get(map.id) || null
      const placement = getProfilePlacementState(map, placementRow)
      const mapFeatures = featuresByMapId.get(map.id) || []
      const status = getMapStatus(map, placement)
      return {
        map,
        index,
        placement,
        status,
        collabCount: getCollabCount(map),
        placeCount: mapFeatures.length,
        updatedLabel: formatRelativeDate(map.updatedAt || map.updated_at || map.modifiedAt || map.modified_at),
        pinPoints: mapFeatures
          .filter((feature) => feature.type === "pin" && Number.isFinite(Number(feature.lat)) && Number.isFinite(Number(feature.lng)))
          .map((feature) => ({ lat: Number(feature.lat), lng: Number(feature.lng) })),
        previewSvg: map.previewSvg || map.preview_svg || generateMiniMapSvg(mapFeatures, { theme: map.theme }),
        searchable: [
          map.title,
          map.description,
          map.region,
          map.location,
          ...(Array.isArray(map.tags) ? map.tags : []),
        ].filter(Boolean).join(" ").toLowerCase(),
      }
    })
  ), [featuresByMapId, maps, shareByMapId])

  const counts = useMemo(() => ({
    all: mapEntries.length,
    public: mapEntries.filter((entry) => entry.status === "public" || entry.status === "collab").length,
    private: mapEntries.filter((entry) => entry.status === "linked" || entry.status === "private").length,
  }), [mapEntries])

  const orderedEntries = useMemo(() => [...mapEntries].sort(sortMapEntries), [mapEntries])

  const filtered = useMemo(() => {
    const normalized = debouncedQuery.trim().toLowerCase()
    return mapEntries
      .filter((entry) => {
        if (filter === "public" && !(entry.status === "public" || entry.status === "collab")) return false
        if (filter === "private" && !(entry.status === "linked" || entry.status === "private")) return false
        return normalized ? entry.searchable.includes(normalized) : true
      })
      .sort(sortMapEntries)
  }, [debouncedQuery, filter, mapEntries])

  const orderedById = useMemo(() => new Map(mapEntries.map((entry) => [entry.map.id, entry])), [mapEntries])

  const visibleEntries = useMemo(() => {
    if (!reorderMode) return filtered
    const selected = draftOrder.map((id) => orderedById.get(id)).filter(Boolean)
    const selectedIds = new Set(selected.map((entry) => entry.map.id))
    const missing = orderedEntries.filter((entry) => !selectedIds.has(entry.map.id))
    return [...selected, ...missing]
  }, [draftOrder, filtered, orderedById, orderedEntries, reorderMode])

  const startReorder = (focusId) => {
    const ids = orderedEntries.map((entry) => entry.map.id)
    setQuery("")
    setDebouncedQuery("")
    setFilter("all")
    setDraftOrder(ids)
    setReorderMode(true)
    setDraggingId(focusId || null)
  }

  const moveDraggingTo = (targetId) => {
    if (!draggingId || draggingId === targetId) return
    setDraftOrder((current) => {
      const next = current.length ? [...current] : orderedEntries.map((entry) => entry.map.id)
      const from = next.indexOf(draggingId)
      const to = next.indexOf(targetId)
      if (from < 0 || to < 0 || from === to) return current
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  const handleReorderPointerMove = (event) => {
    if (!draggingId) return
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-map-card-id]")
    const targetId = target?.getAttribute("data-map-card-id")
    if (targetId) moveDraggingTo(targetId)
  }

  const cancelReorder = () => {
    setReorderMode(false)
    setDraftOrder([])
    setDraggingId(null)
  }

  const completeReorder = () => {
    const ids = draftOrder.length ? draftOrder : orderedEntries.map((entry) => entry.map.id)
    onReorder?.(ids)
    cancelReorder()
  }

  return (
    <div className="maps-v3-view">
      <label className="archive-search maps-v3-search">
        <SearchIcon size={14} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="이름, 지역, 태그로 검색"
        />
      </label>

      {!reorderMode ? (
        <CollaborationInviteBanner
          invites={collaborationInvites}
          onAccept={onAcceptCollaborationInvite}
          onReject={onRejectCollaborationInvite}
        />
      ) : null}

      <div className="maps-v3-filter-row" aria-label="지도 보기 옵션">
        <div className="maps-v3-chips" role="radiogroup" aria-label="지도 상태 필터">
          {MAP_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`maps-v3-chip${filter === item.id ? " is-active" : ""}`}
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
              <span className="num">{counts[item.id] || 0}</span>
            </button>
          ))}
        </div>
        <button className="maps-v3-sort" type="button" onClick={() => {}}>
          최신순
          <ChevronDown size={10} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>

      {reorderMode ? (
        <div className="maps-v3-reorder-bar" role="status">
          <span>옮길 지도를 잡고 원하는 위치로 밀어주세요.</span>
          <div>
            <button type="button" onClick={cancelReorder}>취소</button>
            <button type="button" className="is-primary" onClick={completeReorder}>완료</button>
          </div>
        </div>
      ) : null}

      <div
        className={`maps-v3-grid${reorderMode ? " is-reordering" : ""}`}
        onPointerMove={handleReorderPointerMove}
        onPointerUp={() => setDraggingId(null)}
        onPointerCancel={() => setDraggingId(null)}
      >
        {loading ? (
          <SkeletonCard count={4} />
        ) : maps.length === 0 ? (
          <EmptyState
            variant="character"
            characterImage={characterImage || "/characters/cloud_lv1.svg"}
            title="첫 지도를 만들어볼까요"
            description="아끼는 카드만 골라 엮으면 나만의 지도가 돼요"
            action="새 지도 만들기"
            onAction={onCreate}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<SearchIcon size={22} color="#FF6B35" />}
            title={debouncedQuery ? `"${debouncedQuery}"에 대한 결과가 없어요` : "조건에 맞는 지도가 없어요"}
            description="다른 검색어나 필터로 다시 찾아보세요"
          />
        ) : (
          visibleEntries.map((item, cardIndex) => (
            <MapsV3Card
              key={item.map.id}
              item={item}
              displayNo={String(cardIndex + 1).padStart(3, "0")}
              onOpen={onOpen}
              onEdit={onEdit}
              onCollaborate={onCollaborate}
              onDelete={onDelete}
              onStartReorder={startReorder}
              reorderMode={reorderMode}
              isDragging={draggingId === item.map.id}
              onDragStart={setDraggingId}
              onDragEnter={moveDraggingTo}
            />
          ))
        )}
      </div>
    </div>
  )
}
