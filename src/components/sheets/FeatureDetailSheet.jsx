import { useRef, useState } from "react"
import { ImagePlus, X as XIcon } from "lucide-react"
import { BottomSheet } from "../ui"
import { MediaPhoto, MediaVoice } from "../MediaWidgets"

const getFeatureSheetTitle = (feature) => {
  if (!feature) return "장소 상세"
  if (feature.type === "route") return "경로 상세"
  if (feature.type === "area") return "범위 상세"
  return "장소 상세"
}

export function FeatureDetailSheet({
  featureSheet,
  setFeatureSheet,
  activeMapSource,
  featureEmojiChoices,
  onClose,
  onSave,
  onDelete,
  onRelocatePin,
  photoInputRef,
  isRecording,
  recordingSeconds,
  onPhotoSelected,
  onDeletePhoto,
  onStartRecording,
  onStopRecording,
  onDeleteVoice,
  memoText,
  onMemoTextChange,
  onAddMemo,
}) {
  const isCommunity = activeMapSource === "community"
  const canEdit = activeMapSource === "local" || (isCommunity && featureSheet?.createdBy === "me")
  const featureMemos = featureSheet?.memos || []

  // 댓글 사진 첨부
  const commentPhotoRef = useRef(null)
  const [commentPhotos, setCommentPhotos] = useState([])

  const handleCommentPhotoSelect = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const newPhotos = files.slice(0, 3 - commentPhotos.length).map((file) => ({
      id: `cp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      file,
      preview: URL.createObjectURL(file),
    }))
    setCommentPhotos((prev) => [...prev, ...newPhotos].slice(0, 3))
    e.target.value = ""
  }

  const removeCommentPhoto = (id) => {
    setCommentPhotos((prev) => {
      const removed = prev.find((p) => p.id === id)
      if (removed) URL.revokeObjectURL(removed.preview)
      return prev.filter((p) => p.id !== id)
    })
  }

  const handleSubmitComment = () => {
    if (!memoText.trim() && commentPhotos.length === 0) return
    onAddMemo(featureSheet.id, memoText, commentPhotos.map((p) => p.file))
    setCommentPhotos((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.preview))
      return []
    })
  }

  return (
    <BottomSheet
      open={Boolean(featureSheet)}
      title={isCommunity ? "장소" : getFeatureSheetTitle(featureSheet)}
      subtitle={activeMapSource === "demo"
        ? "데모 지도는 읽기 전용이에요."
        : activeMapSource === "shared"
          ? "공유된 지도는 읽기 전용이에요."
          : undefined}
      onClose={onClose}
    >
      {featureSheet ? (
        <div className="form-stack">
          {isCommunity && featureSheet.createdByName ? (
            <span className="community-author">작성자: {featureSheet.createdByName}</span>
          ) : null}

          {/* ─── 커뮤니티 편집: 이름 + 아이콘만 ─── */}
          {isCommunity && canEdit ? (
            <>
              <label className="field">
                <span>이름</span>
                <input value={featureSheet.title} onChange={(e) => setFeatureSheet((c) => ({ ...c, title: e.target.value }))} />
              </label>
              <label className="field">
                <span>아이콘</span>
                <div className="emoji-grid">
                  {featureEmojiChoices.map((emoji) => (
                    <button key={emoji} className={`emoji-chip${featureSheet.emoji === emoji ? " is-active" : ""}`} type="button" onClick={() => setFeatureSheet((c) => ({ ...c, emoji }))}>
                      {emoji}
                    </button>
                  ))}
                </div>
              </label>
              <div className="sheet-actions">
                <button className="button button--danger" type="button" onClick={onDelete}>삭제</button>
                <button className="button button--primary" type="button" onClick={onSave}>저장</button>
              </div>
            </>
          ) : isCommunity && !canEdit ? (
            /* ─── 커뮤니티 읽기 전용 ─── */
            <div className="community-detail-readonly">
              <div className="community-detail-readonly__title">
                <span className="community-detail-readonly__emoji">{featureSheet.emoji}</span>
                <strong>{featureSheet.title}</strong>
              </div>
              {featureSheet.note ? <p className="community-detail-readonly__note">{featureSheet.note}</p> : null}
            </div>
          ) : canEdit ? (
            /* ─── 일반 지도 편집 ─── */
            <>
              <label className="field">
                <span>이름</span>
                <input value={featureSheet.title} onChange={(e) => setFeatureSheet((c) => ({ ...c, title: e.target.value }))} />
              </label>
              <label className="field">
                <span>내용</span>
                <textarea rows="3" value={featureSheet.note} onChange={(e) => setFeatureSheet((c) => ({ ...c, note: e.target.value }))} placeholder="장소에 대한 설명이나 기록" />
              </label>
              <label className="field">
                <span>아이콘</span>
                <div className="emoji-grid">
                  {featureEmojiChoices.map((emoji) => (
                    <button key={emoji} className={`emoji-chip${featureSheet.emoji === emoji ? " is-active" : ""}`} type="button" onClick={() => setFeatureSheet((c) => ({ ...c, emoji }))}>
                      {emoji}
                    </button>
                  ))}
                </div>
              </label>
              {featureSheet.type === "pin" ? (
                <div className="field">
                  <span>위치</span>
                  {featureSheet.lat === 0 && featureSheet.lng === 0 ? (
                    <div className="pin-location-unset">
                      <p className="pin-location-unset__hint">위치가 아직 지정되지 않았어요.</p>
                      {onRelocatePin ? <button className="button button--primary" type="button" onClick={() => onRelocatePin(featureSheet.id)}>지도에서 위치 지정</button> : null}
                    </div>
                  ) : (
                    <div className="pin-location-info">
                      <span className="pin-location-info__coords">{featureSheet.lat.toFixed(6)}, {featureSheet.lng.toFixed(6)}</span>
                      {onRelocatePin ? <button className="button button--ghost pin-location-info__change" type="button" onClick={() => onRelocatePin(featureSheet.id)}>위치 변경</button> : null}
                    </div>
                  )}
                </div>
              ) : null}
              <label className="field">
                <span>태그</span>
                <input value={featureSheet.tagsText} onChange={(e) => setFeatureSheet((c) => ({ ...c, tagsText: e.target.value }))} placeholder="쉼표로 구분해서 입력" />
              </label>
              <div className="sheet-actions">
                <button className="button button--danger" type="button" onClick={onDelete}>삭제</button>
                <button className="button button--primary" type="button" onClick={onSave}>저장</button>
              </div>
            </>
          ) : (
            /* ─── 일반 읽기 전용 ─── */
            <div className="community-detail-readonly">
              <div className="community-detail-readonly__title">
                <span className="community-detail-readonly__emoji">{featureSheet.emoji}</span>
                <strong>{featureSheet.title}</strong>
              </div>
              {featureSheet.note ? <p className="community-detail-readonly__note">{featureSheet.note}</p> : null}
              {featureSheet.tags?.length ? (
                <div className="community-detail-readonly__tags">
                  {featureSheet.tags.map((tag) => <span className="chip chip--small" key={tag}>#{tag}</span>)}
                </div>
              ) : null}
            </div>
          )}

          {/* ─── 사진/음성/메모: 일반 지도만 ─── */}
          {!isCommunity ? (
            <>
              <div className="feature-photo-section">
                <strong className="memo-section__title">사진 ({(featureSheet.photos || []).length})</strong>
                <div className="feature-photo-row">
                  {(featureSheet.photos || []).map((p) => (
                    <MediaPhoto key={p.id} mediaId={p.id} localId={p.localId} date={p.date} cloudUrl={p.url} onDelete={canEdit ? () => onDeletePhoto(p.id) : undefined} />
                  ))}
                  {canEdit ? (
                    <>
                      <input ref={photoInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onPhotoSelected} />
                      <button className="feature-photo-add" type="button" onClick={() => photoInputRef.current?.click()}>+ 사진 추가</button>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="feature-voice-section">
                <strong className="memo-section__title">음성 ({(featureSheet.voices || []).length})</strong>
                {(featureSheet.voices || []).map((v) => (
                  <MediaVoice key={v.id} mediaId={v.id} localId={v.localId} duration={v.duration} date={v.date} cloudUrl={v.url} onDelete={canEdit ? () => onDeleteVoice(v.id) : undefined} />
                ))}
                {canEdit ? (
                  <button className={`feature-voice-record${isRecording ? " feature-voice-record--active" : ""}`} type="button" onClick={isRecording ? onStopRecording : onStartRecording}>
                    {isRecording ? `⏹ 녹음 중... ${recordingSeconds}초` : "🎙️ 녹음"}
                  </button>
                ) : null}
              </div>
              <div className="memo-section">
                <strong className="memo-section__title">메모 ({featureMemos.length})</strong>
                <div className="memo-input-row">
                  <textarea className="memo-input" rows="2" value={memoText} onChange={(e) => onMemoTextChange(e.target.value)} placeholder="메모를 남겨보세요..." />
                  <button className="button button--primary memo-submit" type="button" onClick={() => onAddMemo(featureSheet.id, memoText)} disabled={!memoText.trim()}>저장</button>
                </div>
                <div className="memo-list">
                  {featureMemos.length === 0 ? (
                    <p className="memo-empty">아직 메모가 없어요.</p>
                  ) : (
                    [...featureMemos].reverse().map((m) => (
                      <div className="memo-item" key={m.id}>
                        <p className="memo-item__text">{m.text}</p>
                        <span className="memo-item__date">{new Date(m.date).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : null}

          {/* ─── 커뮤니티 댓글 (텍스트 + 사진) ─── */}
          {isCommunity ? (
            <div className="memo-section">
              <strong className="memo-section__title">댓글 ({featureMemos.length})</strong>

              {/* 댓글 입력 */}
              <div className="comment-input-box">
                <textarea className="memo-input" rows="2" value={memoText} onChange={(e) => onMemoTextChange(e.target.value)} placeholder="댓글을 남겨보세요..." />
                {commentPhotos.length > 0 ? (
                  <div className="comment-photo-preview">
                    {commentPhotos.map((p) => (
                      <div key={p.id} className="comment-photo-thumb">
                        <img src={p.preview} alt="" />
                        <button type="button" className="comment-photo-remove" onClick={() => removeCommentPhoto(p.id)}>
                          <XIcon size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="comment-input-actions">
                  <button type="button" className="comment-photo-btn" onClick={() => commentPhotoRef.current?.click()} disabled={commentPhotos.length >= 3}>
                    <ImagePlus size={18} />
                  </button>
                  <input ref={commentPhotoRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleCommentPhotoSelect} />
                  <button className="button button--primary comment-submit" type="button" onClick={handleSubmitComment} disabled={!memoText.trim() && commentPhotos.length === 0}>
                    등록
                  </button>
                </div>
              </div>

              {/* 댓글 목록 */}
              <div className="memo-list">
                {featureMemos.length === 0 ? (
                  <p className="memo-empty">아직 댓글이 없어요. 첫 댓글을 남겨보세요!</p>
                ) : (
                  [...featureMemos].reverse().map((m) => (
                    <div className="memo-item" key={m.id}>
                      {m.userName ? <strong className="memo-item__user">{m.userName}</strong> : null}
                      <p className="memo-item__text">{m.text}</p>
                      {m.photos?.length ? (
                        <div className="memo-item__photos">
                          {m.photos.map((url, i) => (
                            <img key={i} src={url} alt="" className="memo-item__photo" />
                          ))}
                        </div>
                      ) : null}
                      <span className="memo-item__date">{new Date(m.date).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </BottomSheet>
  )
}
