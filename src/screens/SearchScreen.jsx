import { useState } from "react"
import { Search as SearchIcon } from "lucide-react"
import { UserRowCard, EmptyState } from "../components/ui"

export function SearchScreen({ users, followed, onToggleFollow, onSelectUser }) {
  const [query, setQuery] = useState("")

  const trimmed = query.trim().toLowerCase()

  let filtered = users
  if (trimmed) {
    const exactId = []
    const nameMatch = []
    const handleMatch = []

    for (const user of users) {
      const handle = (user.handle || "").toLowerCase()
      const name = (user.name || "").toLowerCase()
      const id = (user.id || "").toLowerCase()

      if (handle === `@${trimmed}` || handle === trimmed || id === trimmed) {
        exactId.push(user)
      } else if (name.includes(trimmed)) {
        nameMatch.push(user)
      } else if (handle.includes(trimmed)) {
        handleMatch.push(user)
      }
    }

    filtered = [...exactId, ...nameMatch, ...handleMatch]
  }

  return (
    <section className="screen screen--scroll">
      <div className="section-head">
        <div>
          <h1 className="section-head__title">찾기</h1>
          <p className="section-head__subtitle">취향이 맞는 사람을 찾아 지도를 구독해보세요.</p>
        </div>
      </div>

      <div className="search-box" style={{ marginBottom: 14 }}>
        <SearchIcon size={18} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ID 또는 이름으로 검색"
        />
      </div>

      <div className="card-list">
        {users.length === 0 ? (
          <EmptyState icon="👥" title="아직 다른 사용자가 없어요" description="새로운 사용자가 가입하면 여기에서 찾을 수 있어요." />
        ) : filtered.length > 0 ? (
          filtered.map((user) => (
            <UserRowCard key={user.id} user={user} isFollowed={followed.includes(user.id)} onToggleFollow={onToggleFollow} onSelect={onSelectUser} />
          ))
        ) : (
          <EmptyState icon="🔍" title="검색 결과가 없어요" description="다른 이름이나 ID로 검색해보세요." />
        )}
      </div>
    </section>
  )
}
