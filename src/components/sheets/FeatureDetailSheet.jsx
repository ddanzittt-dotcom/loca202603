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

  return (
    <BottomSheet
      open={Boolean(featureSheet)}
      title={getFeatureSheetTitle(featureSheet)}
      subtitle={activeMapSource === "community"
        ? undefined
        : activeMapSource === "demo"
          ? "데모 지도는 읽기 전용이에요."
          : activeMapSource === "shared"
            ? "공유된 지도는 읽기 전용이에요."
            : undefined}
      onClose={onClose}
    >
      {featureSheet ? (
        <div className="form-stack">
          {isCommunity && featureSheet.createdByName ? (
            <span className="memo-item__user" style={{ fontSize: "0.78rem" }}>작성자: {featureSheet.createdByName}</span>
          ) : null}
          {canEdit ? (
            <>
              <label className="field">
                <span>이름</span>
                <input value={featureSheet.title} onChange={(event) => setFeatureSheet((current) => ({ ...current, title: event.target.value }))} />
              </label>
              <label className="field">
                <span>내용</span>
                <textarea
                  rows="3"
                  value={featureSheet.note}
                  onChange={(event) => setFeatureSheet((current) => ({ ...current, note: event.target.value }))}
                  placeholder="장소에 대한 설명이나 기록"
                />
              </label>
              <label className="field">
                <span>아이콘</span>
                <div className="emoji-grid">
                  {featureEmojiChoices.map((emoji) => (
                    <button
                      key={emoji}
                      className={`emoji-chip${featureSheet.emoji === emoji ? " is-active" : ""}`}
                      type="button"
                      onClick={() => setFeatureSheet((current) => ({ ...current, emoji }))}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </label>
              <label className="field">
                <span>태그</span>
                <input
                  value={featureSheet.tagsText}
                  onChange={(event) => setFeatureSheet((current) => ({ ...current, tagsText: event.target.value }))}
                  placeholder="쉼표로 구분해서 입력"
                />
              </label>
            </>
          ) : (
            <div className="community-detail-readonly">
              <div className="community-detail-readonly__title">
                <span className="community-detail-readonly__emoji">{featureSheet.emoji}</span>
                <strong>{featureSheet.title}</strong>
              </div>
              {featureSheet.note ? <p className="community-detail-readonly__note">{featureSheet.note}</p> : null}
              {featureSheet.tags?.length ? (
                <div className="community-detail-readonly__tags">
                  {featureSheet.tags.map((tag) => (
                    <span className="chip chip--small" key={tag}>#{tag}</span>
                  ))}
                </div>
              ) : null}
            </div>
          )}
          {canEdit ? (
            <div className="sheet-actions">
              <button className="button button--danger" type="button" onClick={onDelete}>
                삭제
              </button>
              <button className="button button--primary" type="button" onClick={onSave}>
                저장
              </button>
            </div>
          ) : null}
          <div className="feature-photo-section">
            <strong className="memo-section__title">사진 ({(featureSheet.photos || []).length})</strong>
            <div className="feature-photo-row">
              {(featureSheet.photos || []).map((p) => (
                <MediaPhoto key={p.id} mediaId={p.id} date={p.date} onDelete={canEdit ? () => onDeletePhoto(p.id) : undefined} />
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
              <MediaVoice key={v.id} mediaId={v.id} duration={v.duration} date={v.date} onDelete={canEdit ? () => onDeleteVoice(v.id) : undefined} />
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
              <textarea
                className="memo-input"
                rows="2"
                value={memoText}
                onChange={(e) => onMemoTextChange(e.target.value)}
                placeholder="메모를 남겨보세요..."
              />
              <button
                className="button button--primary memo-submit"
                type="button"
                onClick={() => onAddMemo(featureSheet.id, memoText)}
                disabled={!memoText.trim()}
              >
                저장
              </button>
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
        </div>
      ) : null}
    </BottomSheet>
  )
}
