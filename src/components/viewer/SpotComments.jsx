function timeAgo(dateStr) {
  if (!dateStr) return ""
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "방금"
  if (mins < 60) return `${mins}분 전`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}시간 전`
  const days = Math.floor(hrs / 24)
  return `${days}일 전`
}

export function SpotComments({
  comments, commentText, setCommentText, commentLoading,
  myKey, editingId, setEditingId, editText, setEditText,
  commentsEnabled, canComment, config,
  onAddComment, onEditComment, onDeleteComment, onReport,
}) {
  return (
    <div className="lw-spot-body">
      {commentsEnabled ? (
        canComment ? (
          <div className="lw-comment-input">
            <input
              type="text"
              placeholder="이 장소에 대한 댓글을 남겨보세요..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onAddComment() }}
              disabled={commentLoading}
            />
            <button type="button" onClick={onAddComment} disabled={!commentText.trim() || commentLoading}>등록</button>
          </div>
        ) : (
          <div className="lw-comment-locked">
            체크인 후 댓글을 남길 수 있어요.
          </div>
        )
      ) : null}

      {comments.length > 0 ? (
        <div className="lw-comment-list">
          {comments.map((c) => {
            const isMine = myKey && c.participantKey === myKey
            const isEditing = editingId === c.id
            return (
              <div key={c.id} className={`lw-comment${c.isPinned ? " is-pinned" : ""}`}>
                {c.isPinned ? <span className="lw-comment__pin">📌</span> : null}
                <div className="lw-comment__main">
                  <div className="lw-comment__meta">
                    <strong>{c.authorName}</strong>
                    <time>{timeAgo(c.createdAt)}</time>
                  </div>
                  {isEditing ? (
                    <div className="lw-comment-edit">
                      <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") onEditComment() }}
                        autoFocus
                      />
                      <div className="lw-comment-edit-actions">
                        <button type="button" onClick={onEditComment}>저장</button>
                        <button type="button" onClick={() => setEditingId(null)}>취소</button>
                      </div>
                    </div>
                  ) : (
                    <p>{c.body}</p>
                  )}
                </div>
                {!isEditing ? (
                  <div className="lw-comment__actions">
                    {isMine ? (
                      <>
                        {config.allow_comment_edit !== false ? (
                          <button type="button" onClick={() => { setEditingId(c.id); setEditText(c.body) }} title="수정">수정</button>
                        ) : null}
                        {config.allow_comment_delete !== false ? (
                          <button type="button" onClick={() => onDeleteComment(c.id)} title="삭제">삭제</button>
                        ) : null}
                      </>
                    ) : (
                      <button type="button" onClick={() => onReport(c.id)} title="신고">신고</button>
                    )}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="lw-comment-empty">
          {commentsEnabled ? "아직 댓글이 없어요. 첫 댓글을 남겨보세요!" : "댓글이 비활성화되어 있어요."}
        </div>
      )}
    </div>
  )
}
