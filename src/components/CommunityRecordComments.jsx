import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { MessageCircle } from "lucide-react"
import {
  createCommunityRecordComment,
  deleteCommunityRecordComment,
  getCommunityRecordIdentity,
  listCommunityRecordComments,
  reportCommunityRecordComment,
} from "../lib/publicCommunityComments"

const COMMENT_PAGE_SIZE = 20

function formatTimeAgo(dateValue) {
  if (!dateValue) return ""
  const diff = Date.now() - new Date(dateValue).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "방금"
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

function mergeComments(current, incoming) {
  const seen = new Set(current.map((comment) => comment.id))
  const next = [...current]
  for (const comment of incoming) {
    if (!seen.has(comment.id)) {
      next.push(comment)
      seen.add(comment.id)
    }
  }
  return next
}

export function CommunityRecordComments({ feature, className = "" }) {
  const [comments, setComments] = useState([])
  const [total, setTotal] = useState(0)
  const [body, setBody] = useState("")
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")
  const requestRef = useRef({ key: "", loading: false })

  const target = useMemo(() => {
    if (!feature) return null
    const identity = getCommunityRecordIdentity(feature)
    if (!identity.recordId) return null
    return {
      id: identity.recordId,
      recordId: identity.recordId,
      recordKey: identity.recordKey,
      recordType: identity.recordType,
    }
  }, [feature])

  const targetKey = target ? `${target.recordId}:${target.recordKey}` : ""
  const hasMore = comments.length < total

  const loadPage = useCallback(async ({ offset = 0, append = false } = {}) => {
    if (!target?.recordId) return
    if (requestRef.current.loading && requestRef.current.key === targetKey) return

    requestRef.current = { key: targetKey, loading: true }
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    setMessage("")

    try {
      const result = await listCommunityRecordComments(target, {
        limit: COMMENT_PAGE_SIZE,
        offset,
      })
      if (requestRef.current.key !== targetKey) return
      setComments((current) => (append ? mergeComments(current, result.comments) : result.comments))
      setTotal(result.total)
    } catch (error) {
      if (requestRef.current.key === targetKey) {
        setMessage(error.message || "댓글을 불러오지 못했어요.")
      }
    } finally {
      if (requestRef.current.key === targetKey) {
        requestRef.current.loading = false
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [target, targetKey])

  useEffect(() => {
    requestRef.current = { key: targetKey, loading: false }
    setBody("")
    setComments([])
    setTotal(0)
    setMessage("")
    if (target?.recordId) {
      loadPage()
    }
  }, [loadPage, target?.recordId, targetKey])

  const submitComment = async () => {
    const trimmedBody = body.trim()
    if (!trimmedBody || submitting || !target?.recordId) return
    setSubmitting(true)
    setMessage("")
    try {
      const created = await createCommunityRecordComment(target, { body: trimmedBody })
      setComments((current) => [created, ...current.filter((comment) => comment.id !== created.id)])
      setTotal((current) => current + 1)
      setBody("")
      setMessage("댓글을 남겼어요.")
    } catch (error) {
      setMessage(error.message || "댓글을 남기지 못했어요.")
    } finally {
      setSubmitting(false)
    }
  }

  const deleteComment = async (commentId) => {
    if (!window.confirm("댓글을 삭제할까요?")) return
    try {
      await deleteCommunityRecordComment(commentId)
      setComments((current) => current.filter((comment) => comment.id !== commentId))
      setTotal((current) => Math.max(0, current - 1))
      setMessage("댓글을 삭제했어요.")
    } catch (error) {
      setMessage(error.message || "댓글을 삭제하지 못했어요.")
    }
  }

  const reportComment = async (commentId) => {
    try {
      await reportCommunityRecordComment(commentId)
      setMessage("신고가 접수되었어요.")
    } catch (error) {
      setMessage(error.message || "신고를 접수하지 못했어요.")
    }
  }

  const handleListScroll = (event) => {
    if (!hasMore || loading || loadingMore) return
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget
    if (scrollHeight - scrollTop - clientHeight <= 32) {
      loadPage({ offset: comments.length, append: true })
    }
  }

  if (!target?.recordId) return null

  return (
    <section className={`public-record-comments ${className}`.trim()} aria-label="장소 댓글">
      <div className="public-record-comments__head">
        <span><MessageCircle size={14} /> 댓글 {total}</span>
        {loading || loadingMore ? <em>{loadingMore ? "더 불러오는 중" : "불러오는 중"}</em> : null}
      </div>
      <div className="public-record-comments__input">
        <input
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              submitComment()
            }
          }}
          maxLength={500}
          placeholder="이 장소에 대한 생각을 남겨보세요."
          disabled={submitting}
        />
        <button type="button" onClick={submitComment} disabled={!body.trim() || submitting}>
          남기기
        </button>
      </div>
      {message ? <p className="public-record-comments__message">{message}</p> : null}
      <div className="public-record-comments__list" onScroll={handleListScroll}>
        {comments.length ? comments.map((comment) => (
          <article key={comment.id}>
            <div>
              <strong>{comment.authorName}</strong>
              {comment.isMine ? <em>내 댓글</em> : null}
              <time>{formatTimeAgo(comment.createdAt)}</time>
            </div>
            <p>{comment.body}</p>
            <footer>
              {comment.isMine ? (
                <button type="button" onClick={() => deleteComment(comment.id)}>삭제</button>
              ) : (
                <button type="button" onClick={() => reportComment(comment.id)}>신고</button>
              )}
            </footer>
          </article>
        )) : (
          <div className="public-record-comments__empty">
            {loading ? "댓글을 불러오고 있어요." : "아직 댓글이 없어요. 첫 댓글을 남겨보세요."}
          </div>
        )}
      </div>
    </section>
  )
}
