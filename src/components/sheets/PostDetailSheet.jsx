import { BottomSheet } from "../ui"
import { MapPin } from "lucide-react"
import { Avatar } from "../Avatar"

const REGION_PALETTES = {
  서울: ["#D4836B", "#D99580", "#E0A896", "#E8BCAD"],
  경기: ["#C48B4C", "#D4A06A", "#E0B585", "#ECCAA0"],
  강원: ["#4A7A60", "#649478", "#80AE92", "#9CC8AC"],
  부산: ["#5B7EA5", "#7596B8", "#90AECA", "#ABC6DC"],
  제주: ["#C47A6E", "#D09488", "#DCAEA2", "#E8C8BE"],
}

function getTagColor(tag) {
  const mintTags = ["도보", "산책", "여행", "바다", "공원"]
  if (mintTags.some((m) => tag.includes(m))) return { bg: "#E1F5EE", text: "#085041" }
  return { bg: "#FFF4EB", text: "#993C1D" }
}

export function PostDetailSheet({ post, onClose, onOpenMap, onRemoveFromProfile, onSaveMap, saving = false, isFollowing, onToggleFollow, mapFeatures }) {
  const isOwn = post?.source === "own"
  const pins = mapFeatures ? mapFeatures.filter((f) => f.type === "pin") : []
  const routes = mapFeatures ? mapFeatures.filter((f) => f.type === "route") : []

  return (
    <BottomSheet
      open={Boolean(post)}
      title={post?.title || "지도"}
      subtitle="지도 상세"
      onClose={onClose}
    >
      {post ? (
        <div className="post-detail-sheet">
          {/* 작성자 정보 */}
          <div className="pds__author">
            <Avatar name={post.user?.name} size={36} className="pds__avatar" />
            <div className="pds__author-body">
              <p className="pds__author-name">{post.user.name}</p>
              <p className="pds__author-handle">{post.user.handle || `@${post.user.name}`} · {post.date}</p>
            </div>
            {!isOwn && !isFollowing ? (
              <button className="pds__follow-btn" type="button" onClick={() => onToggleFollow(post.user.id)}>
                + 팔로우
              </button>
            ) : null}
          </div>

          {/* 지역 컬러 blob 지도 카드 */}
          <div className="pds__map-card" style={{ background: "#DDE8D5" }}>
            <div className="pds__blob" style={{ left: -12, bottom: -12, width: 100, height: 70, background: "rgba(100,148,120,.3)" }} />
            <div className="pds__blob" style={{ right: -10, top: -8, width: 80, height: 55, background: "rgba(156,200,172,.4)" }} />
            <div className="pds__blob" style={{ left: "35%", top: "28%", width: 60, height: 40, background: "rgba(128,174,146,.25)" }} />
            <div className="pds__region-chip">서울 · 성동구</div>
            <div className="pds__card-footer">
              <p className="pds__card-title">{post.title}</p>
              <div className="pds__card-counts">
                <span className="pds__count-item">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="#fff" stroke="none"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/></svg>
                  {pins.length || post.placeCount}
                </span>
                {routes.length > 0 ? (
                  <span className="pds__count-item">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M4 19L10 7L16 14L20 5"/></svg>
                    {routes.length}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* 설명 */}
          <p className="pds__description">{post.description || post.caption}</p>

          {/* 태그 칩 */}
          {post.tags && post.tags.length > 0 ? (
            <div className="pds__tags">
              {post.tags.map((tag) => {
                const color = getTagColor(tag)
                return (
                  <span key={tag} className="pds__tag" style={{ background: color.bg, color: color.text }}>
                    {tag}
                  </span>
                )
              })}
            </div>
          ) : null}

          {/* 장소 미리보기 */}
          {pins.length > 0 ? (
            <div className="pds__places">
              <p className="pds__places-title">장소 미리보기</p>
              <div className="pds__places-scroll">
                {pins.slice(0, 6).map((pin) => (
                  <div key={pin.id} className="pds__place-card">
                    <div className="pds__place-header">
                      <MapPin size={10} fill="#FF6B35" stroke="none" />
                      <span className="pds__place-name">{pin.title || "장소"}</span>
                    </div>
                    <p className="pds__place-address">{pin.address || "주소 없음"}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* 액션 버튼 */}
          <div className="pds__actions">
            <button className="pds__btn pds__btn--primary" type="button" onClick={() => onOpenMap(post.mapId)}>
              지도 열기
            </button>
            {isOwn ? (
              <button className="pds__btn pds__btn--secondary" type="button" onClick={() => onRemoveFromProfile?.(post.mapId)}>
                프로필에서 내리기
              </button>
            ) : (
              <button className="pds__btn pds__btn--secondary" type="button" disabled={saving} onClick={() => onSaveMap?.(post)}>
                {saving ? "저장 중..." : "라이브러리에 저장"}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </BottomSheet>
  )
}
