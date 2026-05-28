import { useCallback, useEffect, useMemo, useState } from "react"
import { BottomSheet, Spinner, EmptyState } from "../ui"
import {
  getCollaborators,
  addCollaborator,
  removeCollaborator,
  searchUsersForInvite,
  friendlySupabaseError,
} from "../../lib/mapService"

const ROLE_OPTIONS = [
  { value: "editor", label: "편집자", description: "장소를 추가, 수정, 삭제할 수 있어요." },
  { value: "viewer", label: "뷰어", description: "지도를 볼 수만 있어요." },
]

const roleLabel = (role) => ROLE_OPTIONS.find((item) => item.value === role)?.label || "뷰어"

const statusLabel = (status) => {
  if (status === "pending") return "초대 대기"
  if (status === "rejected") return "거절됨"
  return ""
}

const collaboratorMeta = (collaborator) => {
  const role = roleLabel(collaborator.role)
  const status = statusLabel(collaborator.status)
  return status ? `${role} · ${status}` : role
}

function CollaboratorAvatar({ person }) {
  if (person?.avatarUrl) {
    return <img className="collab-item__avatar" src={person.avatarUrl} alt="" />
  }
  return <span className="collab-item__avatar">{person?.emoji || person?.nickname?.slice(0, 1) || "U"}</span>
}

export function CollaboratorsSheet({
  open,
  mapId,
  mapRole = "owner",
  onClose,
  onChanged,
  showToast,
}) {
  const [collaborators, setCollaborators] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState(null)
  const [inviteRole, setInviteRole] = useState("editor")

  const canManageCollaborators = mapRole === "owner"

  const loadCollaborators = useCallback(async () => {
    if (!mapId) return []
    setLoading(true)
    try {
      const data = await getCollaborators(mapId)
      setCollaborators(data)
      onChanged?.(data)
      return data
    } catch (error) {
      showToast?.(friendlySupabaseError(error))
      return []
    } finally {
      setLoading(false)
    }
  }, [mapId, onChanged, showToast])

  useEffect(() => {
    if (!open) return
    loadCollaborators()
    setSearchQuery("")
    setSearchResults([])
    setInviteRole("editor")
  }, [loadCollaborators, open])

  useEffect(() => {
    if (!open || !canManageCollaborators) {
      setSearchResults([])
      return undefined
    }

    const trimmed = searchQuery.trim()
    if (trimmed.length < 2) {
      setSearchResults([])
      return undefined
    }

    const timer = window.setTimeout(async () => {
      setSearching(true)
      try {
        const results = await searchUsersForInvite(trimmed)
        const existingIds = new Set(collaborators
          .filter((item) => (item.status || "accepted") !== "rejected")
          .map((item) => item.userId))
        setSearchResults(results.filter((user) => !existingIds.has(user.id)))
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 320)

    return () => window.clearTimeout(timer)
  }, [canManageCollaborators, collaborators, open, searchQuery])

  const handleAdd = async (user) => {
    if (!canManageCollaborators || !mapId) return
    setAdding(user.id)
    try {
      await addCollaborator(mapId, user.id, inviteRole)
      showToast?.(`${user.nickname}님을 ${roleLabel(inviteRole)}로 초대했어요.`)
      setSearchQuery("")
      setSearchResults([])
      await loadCollaborators()
    } catch (error) {
      const message = friendlySupabaseError(error)
      showToast?.(message.includes("이미") ? "이미 초대된 사용자예요." : message)
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

  const subtitle = useMemo(() => {
    if (canManageCollaborators) return "내 지도에 함께 기록할 사람을 초대하고 권한을 관리해요."
    return "이 지도에 함께 참여 중인 사람들을 확인할 수 있어요."
  }, [canManageCollaborators])

  return (
    <BottomSheet open={open} title="협업자 관리" subtitle={subtitle} onClose={onClose}>
      <div style={{ padding: "0 16px 16px" }}>
        {canManageCollaborators ? (
          <>
            <div className="collab-search">
              <input
                className="collab-search__input"
                type="text"
                placeholder="닉네임으로 검색"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              <div className="collab-search__hint">
                {searching ? "검색 중..." : "2글자 이상 입력하면 사용자를 찾을 수 있어요."}
              </div>
            </div>

            <div className="collab-role-tabs" role="radiogroup" aria-label="초대 권한">
              {ROLE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`collab-role-chip${inviteRole === option.value ? " is-active" : ""}`}
                  aria-pressed={inviteRole === option.value}
                  onClick={() => setInviteRole(option.value)}
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>

            {searchResults.length > 0 ? (
              <div className="collab-search-results">
                {searchResults.map((user) => (
                  <div key={user.id} className="collab-item">
                    <CollaboratorAvatar person={user} />
                    <div className="collab-item__info">
                      <strong>{user.nickname}</strong>
                      {user.handle ? <span className="collab-item__role">{user.handle}</span> : null}
                    </div>
                    <button
                      className="collab-item__action collab-item__action--add"
                      type="button"
                      onClick={() => handleAdd(user)}
                      disabled={adding === user.id}
                    >
                      {adding === user.id ? "..." : "초대"}
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        <h4 className="collab-section-title">협업자 ({collaborators.length})</h4>

        {loading ? <Spinner /> : null}

        {!loading && collaborators.length === 0 ? (
          <EmptyState emoji="🤝" message="아직 협업자가 없어요." />
        ) : null}

        {!loading ? collaborators.map((collaborator) => (
          <div key={collaborator.id} className="collab-item">
            <CollaboratorAvatar person={collaborator} />
            <div className="collab-item__info">
              <strong>{collaborator.nickname}</strong>
              <span className="collab-item__role">{collaboratorMeta(collaborator)}</span>
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
        )) : null}
      </div>
    </BottomSheet>
  )
}
