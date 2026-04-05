import { useState, useEffect, useCallback, useRef } from "react"
import { hasSupabaseEnv } from "../lib/supabase"
import {
  listEventComments, createEventComment, updateEventComment,
  deleteEventComment, reportEventComment, getParticipantKey,
} from "../lib/eventCommentsService"

export function useEventComments({ mapId, selectedId, isEventMap, config, checkedInIds, showViewerToast }) {
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState("")
  const [commentLoading, setCommentLoading] = useState(false)
  const [myKey, setMyKey] = useState("")
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState("")
  const [reportTarget, setReportTarget] = useState(null)
  const commentsCache = useRef({})

  // participant_key 로드
  useEffect(() => {
    if (!hasSupabaseEnv) return
    getParticipantKey().then(setMyKey).catch(() => { /* ignore */ })
  }, [])

  // feature 선택 시 댓글 로드
  useEffect(() => {
    if (!selectedId || !hasSupabaseEnv || !isEventMap) { setComments([]); return }
    if (commentsCache.current[selectedId]) {
      setComments(commentsCache.current[selectedId])
    }
    listEventComments(mapId, selectedId)
      .then((res) => {
        setComments(res.comments)
        commentsCache.current[selectedId] = res.comments
      })
      .catch(() => setComments([]))
  }, [selectedId, isEventMap, mapId])

  const commentsEnabled = config.comments_enabled !== false
  const commentPerm = config.comment_permission || "all_logged_in"
  const canComment = commentsEnabled && (
    commentPerm !== "checked_in_only" || (selectedId && checkedInIds.has(selectedId))
  )

  const refreshComments = useCallback(async () => {
    if (!selectedId || !hasSupabaseEnv) return
    try {
      const res = await listEventComments(mapId, selectedId)
      setComments(res.comments)
      commentsCache.current[selectedId] = res.comments
    } catch { /* ignore */ }
  }, [selectedId, mapId])

  const handleAddComment = useCallback(async () => {
    if (!commentText.trim() || !selectedId || !hasSupabaseEnv) return
    setCommentLoading(true)
    try {
      await createEventComment(mapId, selectedId, commentText.trim())
      setCommentText("")
      await refreshComments()
      showViewerToast("댓글을 남겼어요!")
    } catch (err) {
      showViewerToast(err.message || "댓글 등록에 실패했어요.")
    } finally {
      setCommentLoading(false)
    }
  }, [commentText, selectedId, mapId, refreshComments, showViewerToast])

  const handleEditComment = useCallback(async () => {
    if (!editText.trim() || !editingId) return
    try {
      await updateEventComment(editingId, editText.trim())
      setEditingId(null)
      setEditText("")
      await refreshComments()
      showViewerToast("댓글을 수정했어요.")
    } catch {
      showViewerToast("수정에 실패했어요.")
    }
  }, [editText, editingId, refreshComments, showViewerToast])

  const handleDeleteComment = useCallback(async (id) => {
    if (!window.confirm("댓글을 삭제할까요?")) return
    try {
      await deleteEventComment(id)
      await refreshComments()
      showViewerToast("댓글을 삭제했어요.")
    } catch {
      showViewerToast("삭제에 실패했어요.")
    }
  }, [refreshComments, showViewerToast])

  const handleReport = useCallback(async (reason) => {
    if (!reportTarget) return
    try {
      await reportEventComment(reportTarget, reason)
      setReportTarget(null)
      showViewerToast("신고가 접수되었어요.")
    } catch {
      showViewerToast("신고에 실패했어요.")
    }
  }, [reportTarget, showViewerToast])

  return {
    comments,
    commentText,
    setCommentText,
    commentLoading,
    myKey,
    editingId,
    setEditingId,
    editText,
    setEditText,
    reportTarget,
    setReportTarget,
    commentsEnabled,
    canComment,
    handleAddComment,
    handleEditComment,
    handleDeleteComment,
    handleReport,
  }
}
