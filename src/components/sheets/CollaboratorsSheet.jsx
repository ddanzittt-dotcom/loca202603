import { useCallback, useEffect, useMemo, useState } from "react"
import { BottomSheet, Spinner, EmptyState } from "../ui"
import { PixelAvatar, avatarCharOf } from "../PixelAvatar"
import {
  getCollaborators,
  addCollaborator,
  removeCollaborator,
  searchUsersForInvite,
  friendlySupabaseError,
} from "../../lib/mapService"

// 초대는 편집자만 추가한다 — 뷰어 자격은 공유 링크를 넘기면 자동으로 얻으므로 여기선 다루지 않는다.
// (아래 라벨은 과거에 추가된 뷰어 협업자를 목록에서 표시할 때만 쓰인다.)
const roleLabel = (role) => (role === "viewer" ? "뷰어" : "편집자")

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
  // 아바타가 도트 캐릭터 센티넬(loca-char:male|female)이면 PixelAvatar 로 렌더.
  // (센티넬 문자열이 그대로 텍스트로 새어나오지 않도록 — 대시보드와 동일 처리)
  const char = avatarCharOf(person)
  if (char) {
    return (
      <span className="collab-item__avatar collab-item__avatar--char">
        <PixelAvatar char={char} />
      </span>
    )
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
      await addCollaborator(mapId, user.id, "editor")
      showToast?.(`${user.nickname}님을 편집자로 초대했어요.`)
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
    if (canManageCollaborators) return "상대의 아이디로 검색해 내 지도에 함께 기록할 편집자를 초대해요."
    return "이 지도에 함께 참여 중인 사람들을 확인할 수 있어요."
  }, [canManageCollaborators])

  return (
    <BottomSheet open={open} title="함께 만드는 사람들" subtitle={subtitle} onClose={onClose}>
      <div style={{ padding: "0 16px 16px" }}>
        {canManageCollaborators ? (
          <>
            <div className="collab-search">
              <input
                className="collab-search__input"
                type="text"
                placeholder="아이디로 검색 (예: @loca_kim)"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <div className="collab-search__hint">
                {searching ? "검색 중..." : "상대의 아이디를 2글자 이상 입력하면 찾을 수 있어요. 초대하면 편집자로 추가돼요."}
              </div>
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
