import { useRef, useState } from "react"
import { ImagePlus, X as XIcon, Mic } from "lucide-react"
import { BottomSheet } from "../ui"
import { MediaPhoto, MediaVoice } from "../MediaWidgets"
import { PIN_ICON_GROUPS, emojiToCategory, categoryToEmoji } from "../../data/pinIcons"

function TagInput({ tags, onChange }) {
  const [inputVal, setInputVal] = useState("")
  const tagList = (tags || "").split(",").map((t) => t.trim()).filter(Boolean)

  const addTag = (text) => {
    const trimmed = text.trim().replace(/^#/, "")
    if (!trimmed || tagList.includes(trimmed)) return
    onChange([...tagList, trimmed].join(", "))
    setInputVal("")
  }

  const removeTag = (idx) => {
    onChange(tagList.filter((_, i) => i !== idx).join(", "))
  }

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      addTag(inputVal)
    }
    if (e.key === "Backspace" && !inputVal && tagList.length > 0) {
      removeTag(tagList.length - 1)
    }
  }

  return (
    <div className="fd__tag-input">
      <div className="fd__tag-chips">
        {tagList.map((tag, i) => (
          <span key={`${tag}-${i}`} className="fd__tag-chip">
            #{tag}
            <button type="button" className="fd__tag-chip-x" onClick={() => removeTag(i)}><XIcon size={10} /></button>
          </span>
        ))}
        <input
          className="fd__tag-text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (inputVal.trim()) addTag(inputVal) }}
          placeholder={tagList.length === 0 ? "태그 입력 후 Enter" : ""}
        />
      </div>
    </div>
  )
}

function IconSelector({ selected, onSelect }) {
  const selectedId = selected?.length <= 3 ? emojiToCategory(selected) : selected
  return (
    <div className="fd__icon-selector">
      {PIN_ICON_GROUPS.map((group, gi) => (
        <div key={group.label} className="fd__icon-group">
          <span className="fd__icon-group-label" style={gi === 0 ? { marginTop: 6 } : { marginTop: 10 }}>{group.label}</span>
          <div className="fd__icon-grid">
            {group.icons.map((icon) => {
              const bg = icon.bg || group.bg
              const isActive = selectedId === icon.id
              return (
                <button
                  key={icon.id}
                  className={`fd__icon-btn${isActive ? " is-active" : ""}`}
                  type="button"
                  title={icon.name}
                  style={{ background: bg }}
                  onClick={() => onSelect(icon.id)}
                >
                  <img src={`/icons/pins/${icon.id}.svg`} alt={icon.name} width="16" height="16" />
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export function FeatureDetailSheet({
  featureSheet,
  setFeatureSheet,
  activeMapSource,
  readOnly = false,
  currentUserId = "me",
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
  const canEdit = !readOnly && (activeMapSource === "local" || (isCommunity && featureSheet?.createdBy === currentUserId))
  const featureMemos = featureSheet?.memos || []

  const [detailTab, setDetailTab] = useState("info")

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
    if (readOnly) return
    if (!memoText.trim() && commentPhotos.length === 0) return
    onAddMemo(featureSheet.id, memoText, commentPhotos.map((p) => p.file))
    setCommentPhotos((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.preview))
      return []
    })
  }

  const sheetTitle = isCommunity
    ? "장소"
    : featureSheet?.type === "route"
      ? "경로 상세"
      : featureSheet?.type === "area"
        ? "영역 상세"
        : "장소 상세"

  return (
    <BottomSheet open={Boolean(featureSheet)} title={sheetTitle} onClose={onClose}>
      {featureSheet ? (
        <div className="fd">
          {isCommunity ? (
            <>
              {featureSheet.createdByName ? <span className="fd__author">작성자 · {featureSheet.createdByName}</span> : null}
              {canEdit ? (
                <>
                  <label className="fd__field"><span className="fd__label">이름</span><input className="fd__input" value={featureSheet.title} onChange={(e) => setFeatureSheet((c) => ({ ...c, title: e.target.value }))} /></label>
                  <label className="fd__field"><span className="fd__label">아이콘</span>
                    <IconSelector
                      selected={featureSheet.category || featureSheet.emoji}
                      onSelect={(iconId) => setFeatureSheet((c) => ({
                        ...c,
                        category: iconId,
                        emoji: c?.type === "pin" ? categoryToEmoji(iconId) : c?.emoji,
                      }))}
                    />
                  </label>
                  <div className="fd__actions"><button className="fd__btn fd__btn--del" type="button" onClick={onDelete}>삭제</button><button className="fd__btn fd__btn--save" type="button" onClick={onSave}>저장</button></div>
                </>
              ) : (
                <div className="fd__readonly">
                  <span className="fd__readonly-emoji">{featureSheet.emoji}</span>
                  <strong>{featureSheet.title}</strong>
                  {featureSheet.note ? <p>{featureSheet.note}</p> : null}
                </div>
              )}

              <div className="fd__comments">
                <span className="fd__sec-label">메모 ({featureMemos.length})</span>
                {!readOnly ? (
                  <div className="fd__comment-box">
                    <textarea className="fd__comment-input" rows="2" value={memoText} onChange={(e) => onMemoTextChange(e.target.value)} placeholder="메모를 남겨보세요..." />
                    {commentPhotos.length > 0 ? (
                      <div className="fd__comment-photos">{commentPhotos.map((p) => (
                        <div key={p.id} className="fd__comment-thumb"><img src={p.preview} alt="" /><button type="button" className="fd__comment-thumb-x" onClick={() => removeCommentPhoto(p.id)}><XIcon size={10} /></button></div>
                      ))}</div>
                    ) : null}
                    <div className="fd__comment-bar">
                      <button type="button" className="fd__photo-btn" onClick={() => commentPhotoRef.current?.click()} disabled={commentPhotos.length >= 3}><ImagePlus size={16} /></button>
                      <input ref={commentPhotoRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleCommentPhotoSelect} />
                      <button className="fd__btn fd__btn--save fd__btn--sm" type="button" onClick={handleSubmitComment} disabled={!memoText.trim() && commentPhotos.length === 0}>등록</button>
                    </div>
                  </div>
                ) : null}
                <div className="fd__memo-list">
                  {featureMemos.length === 0 ? <p className="fd__memo-empty">아직 메모가 없어요.</p> : [...featureMemos].reverse().map((m) => (
                    <div className="fd__memo-item" key={m.id}>
                      {m.userName ? <strong className="fd__memo-user">{m.userName}</strong> : null}
                      <p className="fd__memo-text">{m.text}</p>
                      {m.photos?.length ? <div className="fd__memo-photos">{m.photos.map((url, i) => <img key={i} src={url} alt="" className="fd__memo-photo" />)}</div> : null}
                      <span className="fd__memo-date">{new Date(m.date).toLocaleDateString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="fd__tabs">
                <button className={`fd__tab${detailTab === "info" ? " is-active" : ""}`} type="button" onClick={() => setDetailTab("info")}>정보</button>
                <button className={`fd__tab${detailTab === "records" ? " is-active" : ""}`} type="button" onClick={() => setDetailTab("records")}>기록</button>
              </div>

              {detailTab === "info" ? (
                <div className="fd__info-tab">
                  {canEdit ? (
                    <>
                      <label className="fd__field"><span className="fd__label">이름</span><input className="fd__input" value={featureSheet.title} onChange={(e) => setFeatureSheet((c) => ({ ...c, title: e.target.value }))} placeholder="장소 이름을 입력하세요." /></label>

                      {featureSheet.type === "pin" ? (
                        <div className="fd__field">
                          <span className="fd__label">위치</span>
                          {featureSheet.lat === 0 && featureSheet.lng === 0 ? (
                            <div className="fd__location-empty">
                              <p>위치가 아직 지정되지 않았어요.</p>
                              {onRelocatePin ? <button className="fd__btn fd__btn--save" type="button" onClick={() => onRelocatePin(featureSheet.id)}>지도에서 위치 지정</button> : null}
                            </div>
                          ) : (
                            <div className="fd__location">
                              <div className="fd__location-info">
                                <p className="fd__location-addr">{featureSheet.address || "주소를 불러오는 중..."}</p>
                                <p className="fd__location-coords">{featureSheet.lat.toFixed(6)}, {featureSheet.lng.toFixed(6)}</p>
                              </div>
                              {onRelocatePin ? <button className="fd__location-change" type="button" onClick={() => onRelocatePin(featureSheet.id)}>변경</button> : null}
                            </div>
                          )}
                        </div>
                      ) : null}

                      <label className="fd__field"><span className="fd__label">내용</span><textarea className="fd__textarea" rows="2" value={featureSheet.note} onChange={(e) => setFeatureSheet((c) => ({ ...c, note: e.target.value }))} placeholder="장소에 대한 설명이나 기록" /></label>

                      <div className="fd__field"><span className="fd__label">태그</span>
                        <TagInput tags={featureSheet.tagsText} onChange={(val) => setFeatureSheet((c) => ({ ...c, tagsText: val }))} />
                      </div>

                      <div className="fd__field"><span className="fd__label">아이콘</span>
                        <IconSelector
                          selected={featureSheet.category || featureSheet.emoji}
                          onSelect={(iconId) => setFeatureSheet((c) => ({
                            ...c,
                            category: iconId,
                            emoji: c?.type === "pin" ? categoryToEmoji(iconId) : c?.emoji,
                          }))}
                        />
                      </div>

                      <div className="fd__actions"><button className="fd__btn fd__btn--del" type="button" onClick={onDelete}>삭제</button><button className="fd__btn fd__btn--save" type="button" onClick={onSave}>저장</button></div>
                    </>
                  ) : (
                    <div className="fd__readonly">
                      <span className="fd__readonly-emoji">{featureSheet.emoji}</span>
                      <strong>{featureSheet.title}</strong>
                      {featureSheet.note ? <p>{featureSheet.note}</p> : null}
                      {featureSheet.tags?.length ? <div className="fd__readonly-tags">{featureSheet.tags.map((t) => <span key={t} className="fd__tag">#{t}</span>)}</div> : null}
                    </div>
                  )}
                </div>
              ) : (
                <div className="fd__records-tab">
                  <div className="fd__rec-section">
                    <span className="fd__sec-label">사진 ({(featureSheet.photos || []).length})</span>
                    <div className="fd__photo-row">
                      {canEdit ? (
                        <>
                          <button className="fd__photo-upload" type="button" onClick={() => photoInputRef.current?.click()}>+</button>
                          <input ref={photoInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onPhotoSelected} />
                        </>
                      ) : null}
                      {(featureSheet.photos || []).map((p) => (
                        <MediaPhoto key={p.id} mediaId={p.id} localId={p.localId} date={p.date} cloudUrl={p.url} onDelete={canEdit ? () => onDeletePhoto(p.id) : undefined} />
                      ))}
                    </div>
                  </div>

                  <div className="fd__rec-section">
                    <span className="fd__sec-label">음성 메모 ({(featureSheet.voices || []).length})</span>
                    {canEdit ? (
                      <button className={`fd__record-btn${isRecording ? " is-recording" : ""}`} type="button" onClick={isRecording ? onStopRecording : onStartRecording}>
                        <Mic size={12} />{isRecording ? ` 녹음 중... ${recordingSeconds}초` : " 녹음하기"}
                      </button>
                    ) : null}
                    {(featureSheet.voices || []).map((v) => (
                      <MediaVoice key={v.id} mediaId={v.id} localId={v.localId} duration={v.duration} date={v.date} cloudUrl={v.url} onDelete={canEdit ? () => onDeleteVoice(v.id) : undefined} />
                    ))}
                  </div>

                  <div className="fd__rec-section">
                    <span className="fd__sec-label">메모 ({featureMemos.length})</span>
                    {canEdit ? (
                      <div className="fd__memo-input-box">
                        <textarea className="fd__memo-textarea" rows="2" value={memoText} onChange={(e) => onMemoTextChange(e.target.value)} placeholder="메모를 남겨보세요..." />
                        <button className="fd__btn fd__btn--save fd__btn--sm" type="button" onClick={() => onAddMemo(featureSheet.id, memoText)} disabled={!memoText.trim()}>저장</button>
                      </div>
                    ) : null}
                    <div className="fd__memo-list">
                      {featureMemos.length === 0 ? <p className="fd__memo-empty">아직 메모가 없어요.</p> : [...featureMemos].reverse().map((m) => (
                        <div className="fd__memo-item" key={m.id}>
                          <p className="fd__memo-text">{m.text}</p>
                          <span className="fd__memo-date">{new Date(m.date).toLocaleDateString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : null}
    </BottomSheet>
  )
}





