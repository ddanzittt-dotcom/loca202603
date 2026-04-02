import { useCallback, useEffect, useState } from "react"
import { BottomSheet, Spinner, EmptyState } from "../ui"
import {
  getCollaborators,
  addCollaborator,
  removeCollaborator,
  searchUsersForInvite,
  friendlySupabaseError,
} from "../../lib/mapService"

export function CollaboratorsSheet({ open, mapId, onClose, showToast }) {
  const [collaborators, setCollaborators] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState(null)

  const loadData = useCallback(async () => {
    if (!mapId) return
    setLoading(true)
    try {
      const data = await getCollaborators(mapId)
      setCollaborators(data)
    } catch (err) {
      showToast?.(friendlySupabaseError(err))
    } finally {
      setLoading(false)
    }
  }, [mapId, showToast])

  useEffect(() => {
    if (open) {
      loadData()
      setSearchQuery("")
      setSearchResults([])
    }
  }, [open, loadData])

  // 닉네임 검색 (디바운스)
  useEffect(() => {
    const trimmed = searchQuery.trim()
    if (trimmed.length < 2) { setSearchResults([]); return }

    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const results = await searchUsersForInvite(trimmed)
        // 이미 초대된 사용자 제외
        const existingIds = new Set(collaborators.map((c) => c.userId))
        setSearchResults(results.filter((u) => !existingIds.has(u.id)))
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [searchQuery, collaborators])

  const handleAdd = async (user) => {
    setAdding(user.id)
    try {
      await addCollaborator(mapId, user.id)
      showToast?.(`${user.nickname}님을 초대했어요!`)
      setSearchQuery("")
      setSearchResults([])
      await loadData()
    } catch (err) {
      const msg = friendlySupabaseError(err)
      showToast?.(msg.includes("중복") ? "이미 초대된 사용자예요." : msg)
    } finally {
      setAdding(null)
    }
  }

  const handleRemove = async (collab) => {
    if (!window.confirm(`${collab.nickname}님을 협업자에서 제거할까요?`)) return
    try {
      await removeCollaborator(collab.id)
      showToast?.(`${collab.nickname}님을 제거했어요.`)
      await loadData()
    } catch (err) {
      showToast?.(friendlySupabaseError(err))
    }
  }

  return (
    <BottomSheet open={open} title="협업자 관리" subtitle="함께 지도를 편집할 팀원을 초대하세요" onClose={onClose}>
      <div style={{ padding: "0 16px 16px" }}>
        {/* 사용자 검색 */}
        <div className="collab-search">
          <input
            className="collab-search__input"
            type="text"
            placeholder="닉네임으로 검색 (2자 이상)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searching ? <div className="collab-search__hint">검색 중...</div> : null}
        </div>

        {/* 검색 결과 */}
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
                  {adding === user.id ? "..." : "초대"}
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {/* 현재 협업자 목록 */}
        <h4 className="collab-section-title">
          편집자 ({collaborators.length})
        </h4>

        {loading ? <Spinner /> : null}

        {!loading && collaborators.length === 0 ? (
          <EmptyState emoji="👥" message="아직 협업자가 없어요" />
        ) : null}

        {collaborators.map((collab) => (
          <div key={collab.id} className="collab-item">
            <span className="collab-item__avatar">{collab.emoji}</span>
            <div className="collab-item__info">
              <strong>{collab.nickname}</strong>
              <span className="collab-item__role">편집자</span>
            </div>
            <button
              className="collab-item__action collab-item__action--remove"
              type="button"
              onClick={() => handleRemove(collab)}
            >
              제거
            </button>
          </div>
        ))}
      </div>
    </BottomSheet>
  )
}
