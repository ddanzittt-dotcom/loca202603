import { useCallback, useEffect, useState } from "react"
import { BottomSheet, Spinner, EmptyState } from "../ui"
import {
  getAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  toggleAnnouncementActive,
  deleteAnnouncement,
} from "../../lib/mapService"
import { friendlySupabaseError } from "../../lib/mapService"

export function AnnouncementSheet({ open, mapId, onClose, showToast }) {
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(false)
  const [editMode, setEditMode] = useState(null) // null | "create" | announcement object
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    if (!mapId) return
    setLoading(true)
    try {
      const data = await getAllAnnouncements(mapId)
      setAnnouncements(data)
    } catch (err) {
      showToast?.(friendlySupabaseError(err))
    } finally {
      setLoading(false)
    }
  }, [mapId, showToast])

  useEffect(() => {
    if (open) loadData()
  }, [open, loadData])

  const openCreate = () => {
    setEditMode("create")
    setTitle("")
    setBody("")
  }

  const openEdit = (ann) => {
    setEditMode(ann)
    setTitle(ann.title)
    setBody(ann.body || "")
  }

  const cancelEdit = () => {
    setEditMode(null)
    setTitle("")
    setBody("")
  }

  const handleSave = async () => {
    if (!title.trim()) return showToast?.("제목을 입력해주세요.")
    setSaving(true)
    try {
      if (editMode === "create") {
        await createAnnouncement(mapId, { title, body })
        showToast?.("공지를 등록했어요.")
      } else {
        await updateAnnouncement(editMode.id, { title, body })
        showToast?.("공지를 수정했어요.")
      }
      cancelEdit()
      await loadData()
    } catch (err) {
      showToast?.(friendlySupabaseError(err))
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (ann) => {
    try {
      await toggleAnnouncementActive(ann.id, !ann.is_active)
      setAnnouncements((cur) =>
        cur.map((a) => (a.id === ann.id ? { ...a, is_active: !a.is_active } : a)),
      )
      showToast?.(ann.is_active ? "공지를 비활성화했어요." : "공지를 활성화했어요.")
    } catch (err) {
      showToast?.(friendlySupabaseError(err))
    }
  }

  const handleDelete = async (ann) => {
    if (!window.confirm("이 공지를 삭제할까요?")) return
    try {
      await deleteAnnouncement(ann.id)
      setAnnouncements((cur) => cur.filter((a) => a.id !== ann.id))
      showToast?.("공지를 삭제했어요.")
    } catch (err) {
      showToast?.(friendlySupabaseError(err))
    }
  }

  const formatDate = (iso) => {
    if (!iso) return ""
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`
  }

  return (
    <BottomSheet
      open={open}
      title="공지 관리"
      subtitle="이벤트 지도에 표시할 공지를 등록하고 관리할 수 있어요."
      onClose={onClose}
    >
      {editMode ? (
        <div className="form-stack">
          <label className="field">
            <span>제목</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="공지 제목"
              maxLength={100}
              autoFocus
            />
          </label>
          <label className="field">
            <span>내용 (선택)</span>
            <textarea
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="상세 내용을 입력하세요"
              maxLength={500}
            />
          </label>

          {/* 미리보기 */}
          {title.trim() ? (
            <div className="ann-preview">
              <span className="ann-preview__label">미리보기</span>
              <div className="shared-viewer__announcement" style={{ borderRadius: 8 }}>
                <div className="shared-viewer__announcement-content">
                  <strong>📢 {title}</strong>
                  {body ? <p>{body}</p> : null}
                </div>
              </div>
            </div>
          ) : null}

          <div className="sheet-actions">
            <button className="button button--ghost" type="button" onClick={cancelEdit} disabled={saving}>
              취소
            </button>
            <button className="button button--primary" type="button" onClick={handleSave} disabled={saving || !title.trim()}>
              {saving ? <><Spinner size={14} /> 저장 중...</> : editMode === "create" ? "등록" : "수정"}
            </button>
          </div>
        </div>
      ) : (
        <div className="ann-list">
          <button className="button button--primary ann-list__create" type="button" onClick={openCreate}>
            새 공지 작성
          </button>

          {loading ? (
            <div style={{ textAlign: "center", padding: 24 }}><Spinner size={24} /></div>
          ) : announcements.length === 0 ? (
            <EmptyState icon="📢" title="등록된 공지가 없어요" description="새 공지를 작성해보세요." />
          ) : (
            announcements.map((ann) => (
              <div key={ann.id} className={`ann-item${ann.is_active ? "" : " ann-item--inactive"}`}>
                <div className="ann-item__head">
                  <div className="ann-item__info">
                    <strong>{ann.title}</strong>
                    <span className="ann-item__date">{formatDate(ann.created_at)}</span>
                  </div>
                  <span className={`ann-item__badge${ann.is_active ? " ann-item__badge--active" : ""}`}>
                    {ann.is_active ? "활성" : "비활성"}
                  </span>
                </div>
                {ann.body ? <p className="ann-item__body">{ann.body}</p> : null}
                <div className="ann-item__actions">
                  <button className="button button--ghost" type="button" onClick={() => openEdit(ann)}>수정</button>
                  <button className="button button--ghost" type="button" onClick={() => handleToggle(ann)}>
                    {ann.is_active ? "비활성화" : "활성화"}
                  </button>
                  <button className="button button--ghost ann-item__delete" type="button" onClick={() => handleDelete(ann)}>삭제</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </BottomSheet>
  )
}
