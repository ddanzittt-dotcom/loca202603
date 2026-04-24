import { useCallback, useEffect, useMemo, useState } from "react"
import { BottomSheet, Spinner, EmptyState } from "../ui"
import {
  getCollaborators,
  addCollaborator,
  removeCollaborator,
  searchUsersForInvite,
  listFeatureChangeRequests,
  resolveFeatureChangeRequest,
  friendlySupabaseError,
} from "../../lib/mapService"

const ROLE_OPTIONS = [
  { value: "operator", label: "운영자" },
  { value: "editor", label: "편집자" },
  { value: "viewer", label: "뷰어" },
]

const roleLabel = (role) => {
  const found = ROLE_OPTIONS.find((item) => item.value === role)
  return found?.label || role || "편집자"
}

const formatRequestTitle = (request) => {
  const title = request?.payload?.title || "항목"
  if (request.action === "insert") return `[추가] ${title}`
  if (request.action === "update") return `[수정] ${title}`
  return `[삭제] ${title}`
}

export function CollaboratorsSheet({ open, mapId, mapRole = "owner", onClose, showToast }) {
  const [collaborators, setCollaborators] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState(null)
  const [inviteRole, setInviteRole] = useState("editor")
  const [requests, setRequests] = useState([])
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [reviewingRequestId, setReviewingRequestId] = useState(null)

  const canManageCollaborators = mapRole === "owner"
  const canReviewRequests = mapRole === "owner" || mapRole === "operator"

  const loadCollaborators = useCallback(async () => {
    if (!mapId) return
    setLoading(true)
    try {
      const data = await getCollaborators(mapId)
      setCollaborators(data)
    } catch (error) {
      showToast?.(friendlySupabaseError(error))
    } finally {
      setLoading(false)
    }
  }, [mapId, showToast])

  const loadRequests = useCallback(async () => {
    if (!mapId || !canReviewRequests) {
      setRequests([])
      return
    }
    setRequestsLoading(true)
    try {
      const data = await listFeatureChangeRequests(mapId, "pending")
      setRequests(data)
    } catch (error) {
      showToast?.(friendlySupabaseError(error))
    } finally {
      setRequestsLoading(false)
    }
  }, [canReviewRequests, mapId, showToast])

  const refreshAll = useCallback(async () => {
    await Promise.all([loadCollaborators(), loadRequests()])
  }, [loadCollaborators, loadRequests])

  useEffect(() => {
    if (open) {
      refreshAll()
      setSearchQuery("")
      setSearchResults([])
      setInviteRole("editor")
    }
  }, [open, refreshAll])

  useEffect(() => {
    if (!canManageCollaborators) {
      setSearchResults([])
      return
    }

    const trimmed = searchQuery.trim()
    if (trimmed.length < 2) {
      setSearchResults([])
      return
    }

    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const results = await searchUsersForInvite(trimmed)
        const existingIds = new Set(collaborators.map((item) => item.userId))
        setSearchResults(results.filter((user) => !existingIds.has(user.id)))
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [canManageCollaborators, collaborators, searchQuery])

  const handleAdd = async (user) => {
    if (!canManageCollaborators) return
    setAdding(user.id)
    try {
      await addCollaborator(mapId, user.id, inviteRole)
      showToast?.(`${user.nickname}님을 ${roleLabel(inviteRole)}로 추가했어요.`)
      setSearchQuery("")
      setSearchResults([])
      await loadCollaborators()
    } catch (error) {
      const message = friendlySupabaseError(error)
      showToast?.(message.includes("중복") ? "이미 추가된 사용자예요." : message)
    } finally {
      setAdding(null)
    }
  }

  const handleRemove = async (collaborator) => {
    if (!canManageCollaborators) return
    if (!window.confirm(`${collaborator.nickname}님을 협업자에서 제거할까요?`)) return
    try {
      await removeCollaborator(collaborator.id)
      showToast?.(`${collaborator.nickname}님을 제거했어요.`)
      await loadCollaborators()
    } catch (error) {
      showToast?.(friendlySupabaseError(error))
    }
  }

  const handleReview = async (request, decision) => {
    if (!canReviewRequests) return
    setReviewingRequestId(request.id)
    try {
      await resolveFeatureChangeRequest(request.id, decision)
      showToast?.(decision === "approved" ? "요청을 승인했어요." : "요청을 반려했어요.")
      await loadRequests()
    } catch (error) {
      showToast?.(friendlySupabaseError(error))
    } finally {
      setReviewingRequestId(null)
    }
  }

  const subtitle = useMemo(() => {
    if (canManageCollaborators) return "운영자/편집자/뷰어 권한을 관리하고 승인 요청을 처리하세요."
    if (canReviewRequests) return "편집 요청 승인 상태를 확인하고 처리하세요."
    return "협업자 목록을 확인하세요."
  }, [canManageCollaborators, canReviewRequests])

  return (
    <BottomSheet open={open} title="협업 관리" subtitle={subtitle} onClose={onClose}>
      <div style={{ padding: "0 16px 16px" }}>
        {canManageCollaborators ? (
          <>
            <div className="collab-search">
              <input
                className="collab-search__input"
                type="text"
                placeholder="닉네임으로 검색 (2자 이상)"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              {searching ? <div className="collab-search__hint">검색 중...</div> : null}
            </div>

            <label className="fd__field" style={{ marginTop: 8 }}>
              <span className="fd__label">추가 권한</span>
              <select
                className="fd__input"
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value)}
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            {searchResults.length > 0 ? (
              <div className="collab-search-results">
                {searchResults.map((user) => (
                  <div key={user.id} className="collab-item">
                    <span className="collab-item__avatar">{user.emoji}</span>
                    <span className="collab-item__name">{user.nickname}</span>
                    <button
                      className="collab-item__action collab-item__action--add"
                      type="button"
                      onClick={() => handleAdd(user)}
                      disabled={adding === user.id}
                    >
                      {adding === user.id ? "..." : "추가"}
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        <h4 className="collab-section-title">
          협업자 ({collaborators.length})
        </h4>

        {loading ? <Spinner /> : null}

        {!loading && collaborators.length === 0 ? (
          <EmptyState emoji="🤝" message="아직 협업자가 없어요." />
        ) : null}

        {collaborators.map((collaborator) => (
          <div key={collaborator.id} className="collab-item">
            <span className="collab-item__avatar">{collaborator.emoji}</span>
            <div className="collab-item__info">
              <strong>{collaborator.nickname}</strong>
              <span className="collab-item__role">{roleLabel(collaborator.role)}</span>
            </div>
            {canManageCollaborators ? (
              <button
                className="collab-item__action collab-item__action--remove"
                type="button"
                onClick={() => handleRemove(collaborator)}
              >
                제거
              </button>
            ) : null}
          </div>
        ))}

        {canReviewRequests ? (
          <>
            <h4 className="collab-section-title" style={{ marginTop: 20 }}>
              편집 승인 요청 ({requests.length})
            </h4>

            {requestsLoading ? <Spinner /> : null}
            {!requestsLoading && requests.length === 0 ? (
              <EmptyState emoji="🗂️" message="대기 중인 요청이 없어요." />
            ) : null}

            {!requestsLoading ? requests.map((request) => (
              <div key={request.id} className="collab-item" style={{ alignItems: "flex-start" }}>
                <span className="collab-item__avatar">{request.requestedByEmoji || "👤"}</span>
                <div className="collab-item__info" style={{ gap: 6 }}>
                  <strong>{formatRequestTitle(request)}</strong>
                  <span className="collab-item__role">
                    요청자: {request.requestedByName} · {new Date(request.createdAt).toLocaleString("ko-KR")}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    className="collab-item__action collab-item__action--add"
                    type="button"
                    disabled={reviewingRequestId === request.id}
                    onClick={() => handleReview(request, "approved")}
                  >
                    승인
                  </button>
                  <button
                    className="collab-item__action collab-item__action--remove"
                    type="button"
                    disabled={reviewingRequestId === request.id}
                    onClick={() => handleReview(request, "rejected")}
                  >
                    반려
                  </button>
                </div>
              </div>
            )) : null}
          </>
        ) : null}
      </div>
    </BottomSheet>
  )
}
