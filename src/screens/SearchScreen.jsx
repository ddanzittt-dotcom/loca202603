import { useState, useMemo, useEffect, useCallback } from "react"
import { Search as SearchIcon, MapPin as LocationIcon, Star, Users } from "lucide-react"
import { hasSupabaseEnv } from "../lib/supabase"
import { Avatar } from "../components/Avatar"

// 자동 태그 색상 그룹
const TAG_STYLES = {
  warm:  { bg: "#FFF4EB", color: "#993C1D" },
  amber: { bg: "#FAEEDA", color: "#633806" },
  mint:  { bg: "#E1F5EE", color: "#085041" },
}

// 간단한 자동 태그 (bio 기반)
function getAutoTag(user) {
  const bio = (user.bio || "").toLowerCase()
  if (bio.includes("카페") || bio.includes("커피")) return { text: "카페 탐험가", group: "warm" }
  if (bio.includes("맛집") || bio.includes("음식")) return { text: "로컬 맛집", group: "amber" }
  if (bio.includes("산책") || bio.includes("공원")) return { text: "산책 코스", group: "mint" }
  if (bio.includes("여행") || bio.includes("투어")) return { text: "여행 스팟", group: "mint" }
  if (bio.includes("전시") || bio.includes("갤러리")) return { text: "전시 큐레이터", group: "warm" }
  return { text: "동네 탐험가", group: "warm" }
}

export function SearchScreen({ users, followed, onToggleFollow, onSelectUser }) {
  const [query, setQuery] = useState("")
  const [cloudResults, setCloudResults] = useState([])
  const [searching, setSearching] = useState(false)

  const trimmed = query.trim().toLowerCase()

  // 로컬 검색 (데모/오프라인 폴백)
  const localFiltered = useMemo(() => {
    if (!trimmed) return []
    const exactId = []
    const nameMatch = []
    const handleMatch = []
    for (const user of users) {
      const handle = (user.handle || "").toLowerCase()
      const name = (user.name || "").toLowerCase()
      const id = (user.id || "").toLowerCase()
      if (handle === `@${trimmed}` || handle === trimmed || id === trimmed) exactId.push(user)
      else if (name.includes(trimmed)) nameMatch.push(user)
      else if (handle.includes(trimmed)) handleMatch.push(user)
    }
    return [...exactId, ...nameMatch, ...handleMatch]
  }, [users, trimmed])

  // 클라우드 검색 (디바운스 300ms)
  const searchCloud = useCallback(async (q) => {
    if (!hasSupabaseEnv || !q.trim()) {
      setCloudResults([])
      return
    }
    setSearching(true)
    try {
      const { searchProfiles } = await import("../lib/mapService")
      const results = await searchProfiles(q.trim())
      setCloudResults(results)
    } catch {
      setCloudResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    if (!trimmed) {
      setCloudResults([])
      return
    }
    const timer = setTimeout(() => searchCloud(trimmed), 300)
    return () => clearTimeout(timer)
  }, [trimmed, searchCloud])

  // 클라우드 결과 우선, 없으면 로컬 폴백
  const filtered = hasSupabaseEnv ? cloudResults : localFiltered
  const isSearching = trimmed.length > 0
  const recommendedUsers = users.slice(0, 5)
  const nearbyUsers = users.slice(0, 3)

  return (
    <section className="screen screen--scroll">
      {/* 타이틀 */}
      <div className="sr-header">
        <h1 className="sr-header__title">찾기</h1>
        <p className="sr-header__sub">취향이 맞는 에디터를 찾아 지도를 구독해보세요</p>
      </div>

      {/* 검색바 */}
      <div className="sr-search">
        <SearchIcon size={14} color="#aaa" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름, ID로 검색" />
      </div>

      {/* ─── 검색 결과 ─── */}
      {isSearching && searching ? (
        <div className="sr-empty">
          <p className="sr-empty__desc">검색 중...</p>
        </div>
      ) : isSearching ? (
        filtered.length > 0 ? (
          <div className="sr-list-card">
            {filtered.map((user, idx) => (
              <EditorListItem key={user.id} user={user} isFollowed={followed.includes(user.id)} onToggleFollow={onToggleFollow} onSelect={onSelectUser} isLast={idx === filtered.length - 1} />
            ))}
          </div>
        ) : (
          <div className="sr-empty">
            <div className="sr-empty__icon">
              <SearchIcon size={20} color="#FF6B35" />
            </div>
            <p className="sr-empty__title">"{query}"에 대한 결과가 없어요</p>
            <p className="sr-empty__desc">다른 키워드로 검색해보세요</p>
          </div>
        )
      ) : users.length === 0 ? (
        /* ─── 서비스 초기 빈 상태 ─── */
        <div className="sr-empty">
          <div className="sr-empty__icon sr-empty__icon--lg">
            <Users size={24} color="#FF6B35" />
          </div>
          <p className="sr-empty__title">아직 에디터가 없어요</p>
          <p className="sr-empty__desc">친구를 초대해서 서로의 지도를 구독해보세요</p>
        </div>
      ) : (
        /* ─── 기본: 내 근처 + 추천 ─── */
        <>
          {/* 내 근처 에디터 */}
          {nearbyUsers.length > 0 ? (
            <div className="sr-section">
              <div className="sr-section__head">
                <div className="sr-section__label">
                  <LocationIcon size={12} color="#FF6B35" />
                  <span>내 근처 에디터</span>
                </div>
              </div>
              <div className="sr-card-grid">
                {nearbyUsers.map((user) => (
                  <EditorCard key={user.id} user={user} isFollowed={followed.includes(user.id)} onToggleFollow={onToggleFollow} onSelect={onSelectUser} />
                ))}
              </div>
            </div>
          ) : null}

          {/* 추천 에디터 */}
          {recommendedUsers.length > 0 ? (
            <div className="sr-section">
              <div className="sr-section__head">
                <div className="sr-section__label">
                  <Star size={12} color="#FF6B35" />
                  <span>추천 에디터</span>
                </div>
              </div>
              <div className="sr-list-card">
                {recommendedUsers.map((user, idx) => (
                  <EditorListItem key={user.id} user={user} isFollowed={followed.includes(user.id)} onToggleFollow={onToggleFollow} onSelect={onSelectUser} isLast={idx === recommendedUsers.length - 1} />
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}

// 에디터 카드 (3열 그리드)
function EditorCard({ user, isFollowed, onToggleFollow, onSelect }) {
  const tag = getAutoTag(user)
  const tagStyle = TAG_STYLES[tag.group]

  return (
    <div className="sr-editor-card" onClick={() => onSelect(user.id)}>
      <Avatar name={user.name} size={44} className="sr-editor-card__avatar" />
      <p className="sr-editor-card__name">{user.name}</p>
      <p className="sr-editor-card__meta">{user.handle}</p>
      <span className="sr-editor-card__tag" style={{ background: tagStyle.bg, color: tagStyle.color }}>{tag.text}</span>
      <button className={`sr-follow-btn${isFollowed ? " is-following" : ""}`} type="button" onClick={(e) => { e.stopPropagation(); onToggleFollow(user.id) }}>
        {isFollowed ? "팔로잉" : "+ 팔로우"}
      </button>
    </div>
  )
}

// 에디터 리스트 아이템
function EditorListItem({ user, isFollowed, onToggleFollow, onSelect, isLast }) {
  const tag = getAutoTag(user)
  const tagStyle = TAG_STYLES[tag.group]

  return (
    <button className={`sr-list-item${isLast ? "" : " sr-list-item--border"}`} type="button" onClick={() => onSelect(user.id)}>
      <Avatar name={user.name} size={36} className="sr-list-item__avatar" />
      <div className="sr-list-item__info">
        <div className="sr-list-item__name-row">
          <span className="sr-list-item__name">{user.name}</span>
          <span className="sr-list-item__tag" style={{ background: tagStyle.bg, color: tagStyle.color }}>{tag.text}</span>
        </div>
        <p className="sr-list-item__meta">{user.handle}</p>
      </div>
      <button className={`sr-follow-btn${isFollowed ? " is-following" : ""}`} type="button" onClick={(e) => { e.stopPropagation(); onToggleFollow(user.id) }}>
        {isFollowed ? "팔로잉" : "+ 팔로우"}
      </button>
    </button>
  )
}
