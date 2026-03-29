import { Avatar, BottomSheet, MapPreview } from "../ui"

export function PostDetailSheet({ post, onClose, onLike, onOpenMap, onUnpublish }) {
  return (
    <BottomSheet
      open={Boolean(post)}
      title={post?.title || "게시물"}
      subtitle="피드 게시물 상세 화면입니다."
      onClose={onClose}
    >
      {post ? (
        <div className="post-detail-sheet">
          <div className="feed-card__header">
            <div className="feed-card__author">
              <Avatar user={post.user} size="md" ring={post.user.id !== "me"} />
              <span className="feed-card__author-meta">
                <strong>
                  {post.user.name}
                  {post.user.verified ? <span className="verified-badge">?</span> : null}
                </strong>
                <small>{post.user.handle} · {post.date}</small>
              </span>
            </div>
          </div>
          <MapPreview title={post.title} emojis={post.emojis} placeCount={post.placeCount} gradient={post.gradient} theme={post.theme} variant="large" caption={post.description} />
          <div className="post-detail-sheet__meta">
            <button className="icon-link" type="button" onClick={() => onLike(post.source, post.id)}>
              좋아요 {post.likes}
            </button>
            <span className="icon-link icon-link--static">저장 {post.saves}</span>
            <span className="icon-link icon-link--static">장소 {post.placeCount}</span>
          </div>
          <p className="feed-card__caption">
            <strong>{post.title}</strong> {post.caption}
          </p>
          <div className="chips-row chips-row--compact">
            {post.tags.map((tag) => (
              <span className="chip chip--small" key={tag}>
                #{tag}
              </span>
            ))}
          </div>
          {post.source === "own" ? (
            <div className="sheet-actions">
              <button className="button button--secondary" type="button" onClick={() => onOpenMap(post.mapId)}>
                지도 열기
              </button>
              <button className="button button--danger" type="button" onClick={() => onUnpublish(post.id)}>
                공유 해제
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </BottomSheet>
  )
}
