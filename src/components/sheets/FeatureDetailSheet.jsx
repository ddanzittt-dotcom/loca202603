import { useState } from "react"
import { X as XIcon, Mic, Camera } from "lucide-react"
import { BottomSheet } from "../ui"
import { MediaPhoto, MediaVoice } from "../MediaWidgets"
import { PIN_ICON_GROUPS, emojiToCategory, categoryToEmoji } from "../../data/pinIcons"
import { FeatureEmoji } from "../FeatureEmoji"
import { DiaryBanner } from "../visuals/DiaryBanner"

// 일기 entry 헬퍼 — 같은 날짜의 메모+사진+음성을 하나의 entry 로 묶음.
const DAY_OF_WEEK_KO = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"]

function getDateBucketKey(dateValue) {
  if (!dateValue) return null
  const d = new Date(dateValue)
  if (!Number.isFinite(d.getTime())) return null
  return { iso: d.toISOString().slice(0, 10), date: d }
}

function buildDiaryBuckets({ memos = [], photos = [], voices = [] }) {
  const buckets = new Map() // iso -> { dateKey, dateObj, photos[], voices[], memos[] }
  const ensure = (key) => {
    if (!buckets.has(key.iso)) {
      buckets.set(key.iso, {
        dateKey: key.iso,
        dateObj: key.date,
        photos: [],
        voices: [],
        memos: [],
      })
    }
    return buckets.get(key.iso)
  }
  for (const m of memos) {
    const k = getDateBucketKey(m?.date)
    if (k) ensure(k).memos.push(m)
  }
  for (const p of photos) {
    const k = getDateBucketKey(p?.date)
    if (k) ensure(k).photos.push(p)
  }
  for (const v of voices) {
    const k = getDateBucketKey(v?.date)
    if (k) ensure(k).voices.push(v)
  }
  return [...buckets.values()].sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime())
}

function bucketToDiaryEntry(bucket, todayIso) {
  const d = bucket.dateObj
  const dateStr = `${`${d.getMonth() + 1}`.padStart(2, "0")}.${`${d.getDate()}`.padStart(2, "0")}`
  const day = DAY_OF_WEEK_KO[d.getDay()]
  const memoText = bucket.memos
    .map((m) => (m?.text || "").trim())
    .filter(Boolean)
    .join("\n\n")
  return {
    isToday: bucket.dateKey === todayIso,
    date: dateStr,
    day,
    photos: bucket.photos.map((p) => ({ src: p?.url || p?.thumbnail || p?.src || "" })),
    audio: bucket.voices.map((v) => ({
      duration: v?.duration,
      date: dateStr,
    })),
    memo: memoText,
  }
}
import { FEATURE_LINE_STYLE_ITEMS, getFeatureColorPresets, normalizeFeatureStyle } from "../../lib/featureStyle"

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

function FeatureStyleEditor({ featureSheet, setFeatureSheet, labelPrefix = "" }) {
  const type = featureSheet?.type || "pin"
  const currentStyle = normalizeFeatureStyle(featureSheet?.style, type)
  const colorPresets = getFeatureColorPresets(type)

  const updateStyle = (patch) => {
    setFeatureSheet((current) => {
      const nextType = current?.type || type
      const mergedStyle = {
        ...normalizeFeatureStyle(current?.style, nextType),
        ...patch,
      }
      return { ...current, style: normalizeFeatureStyle(mergedStyle, nextType) }
    })
  }

  return (
    <div className="fd__style-stack">
      <div className="fd__field">
        <span className="fd__label">{labelPrefix}색상</span>
        <div className="fd__style-swatches">
          {colorPresets.map((color) => (
            <button
              key={color}
              type="button"
              className={`fd__swatch${currentStyle.color === color ? " is-active" : ""}`}
              style={{ background: color }}
              onClick={() => updateStyle({ color })}
              aria-label={`${labelPrefix}색상 ${color}`}
              title={color}
            />
          ))}
          <label className="fd__color-input-wrap" title="직접 색상 선택">
            <span>직접</span>
            <input
              className="fd__color-input"
              type="color"
              value={currentStyle.color}
              onChange={(e) => updateStyle({ color: e.target.value })}
            />
          </label>
        </div>
      </div>

      {type === "route" || type === "area" ? (
        <div className="fd__field">
          <span className="fd__label">{labelPrefix}선 종류</span>
          <div className="fd__line-style-row">
            {FEATURE_LINE_STYLE_ITEMS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`fd__line-style-btn${currentStyle.lineStyle === item.value ? " is-active" : ""}`}
                onClick={() => updateStyle({ lineStyle: item.value })}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
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
  // onDeletePhoto / onDeleteVoice 는 일기 entry 통합 후 인라인 삭제 UI 없음 (편집은 RecordEntrySheet 에서).
  onStartRecording,
  onStopRecording,
  memoText,
  onMemoTextChange,
  onAddMemo,
  onRequestCommunityUpdate,
}) {
  const isCommunity = activeMapSource === "community"
  const canEdit = !readOnly && (activeMapSource === "local" || (isCommunity && featureSheet?.createdBy === currentUserId))
  const canRequestEdit = isCommunity && !readOnly && !canEdit && typeof onRequestCommunityUpdate === "function"
  const featureMemos = featureSheet?.memos || []

  const [detailTab, setDetailTab] = useState("info")

  const [requestEditTargetId, setRequestEditTargetId] = useState(null)
  const [requestMessage, setRequestMessage] = useState("")
  const isRequestEditMode = requestEditTargetId === featureSheet?.id

  const sheetTitle = isCommunity
    ? "장소"
    : featureSheet?.type === "route"
      ? "경로 상세"
      : featureSheet?.type === "area"
        ? "영역 상세"
        : "장소 상세"

  return (
    <BottomSheet
      open={Boolean(featureSheet)}
      title={sheetTitle}
      onClose={onClose}
      /* v2 B5-B7: 편집 권한이 없는 readonly 진입은 풀스크린 상세 페이지로 (시트 X) */
      fullscreen={!canEdit}
    >
      {featureSheet ? (
        <div className="fd fd--v2">
          {isCommunity ? (
            <>
              {featureSheet.createdByName ? <span className="fd__author">작성자 · {featureSheet.createdByName}</span> : null}
              {canEdit ? (
                <>
                  <label className="fd__field"><span className="fd__label">이름</span><input className="fd__input" value={featureSheet.title} onChange={(e) => setFeatureSheet((c) => ({ ...c, title: e.target.value }))} /></label>
                  <label className="fd__field"><span className="fd__label">설명</span><textarea className="fd__textarea" rows="2" value={featureSheet.note || ""} onChange={(e) => setFeatureSheet((c) => ({ ...c, note: e.target.value }))} placeholder="이 장소를 잘 이해할 수 있도록 설명해 주세요." /></label>
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
                  <FeatureStyleEditor featureSheet={featureSheet} setFeatureSheet={setFeatureSheet} labelPrefix={featureSheet.type === "pin" ? "장소 " : ""} />
                  <div className="fd__actions"><button className="fd__btn fd__btn--del" type="button" onClick={onDelete}>삭제</button><button className="fd__btn fd__btn--save" type="button" onClick={onSave}>저장</button></div>
                </>
              ) : canRequestEdit ? (
                <>
                  {isRequestEditMode ? (
                    <>
                      <p className="fd__request-help">내가 등록하지 않은 장소예요. 수정 제안을 남기면 검토 후 반영돼요.</p>
                      <label className="fd__field"><span className="fd__label">수정 제안 이름</span><input className="fd__input" value={featureSheet.title} onChange={(e) => setFeatureSheet((c) => ({ ...c, title: e.target.value }))} /></label>
                      <label className="fd__field"><span className="fd__label">수정 제안 아이콘</span>
                        <IconSelector
                          selected={featureSheet.category || featureSheet.emoji}
                          onSelect={(iconId) => setFeatureSheet((c) => ({
                            ...c,
                            category: iconId,
                            emoji: c?.type === "pin" ? categoryToEmoji(iconId) : c?.emoji,
                          }))}
                        />
                      </label>
                      <FeatureStyleEditor featureSheet={featureSheet} setFeatureSheet={setFeatureSheet} labelPrefix={featureSheet.type === "pin" ? "장소 " : ""} />
                      <label className="fd__field"><span className="fd__label">수정 제안 설명</span><textarea className="fd__textarea" rows="2" value={featureSheet.note || ""} onChange={(e) => setFeatureSheet((c) => ({ ...c, note: e.target.value }))} placeholder="이 장소를 더 잘 설명해 주세요." /></label>
                      <div className="fd__field"><span className="fd__label">수정 제안 태그</span>
                        <TagInput tags={featureSheet.tagsText || ""} onChange={(val) => setFeatureSheet((c) => ({ ...c, tagsText: val }))} />
                      </div>
                      <div className="fd__field"><span className="fd__label">수정 제안 메모 (선택)</span><textarea className="fd__textarea" rows="2" value={requestMessage} onChange={(e) => setRequestMessage(e.target.value)} placeholder="왜 수정이 필요한지 간단히 남겨주세요." /></div>
                      <div className="fd__actions">
                        <button className="fd__btn fd__btn--del" type="button" onClick={() => { setRequestEditTargetId(null); setRequestMessage("") }}>취소</button>
                        <button className="fd__btn fd__btn--save" type="button" onClick={() => onRequestCommunityUpdate?.(requestMessage)}>수정 제안 보내기</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="fd__readonly">
                        <span className="fd__readonly-emoji"><FeatureEmoji feature={featureSheet} size={24} unicodeFontSize={20} /></span>
                        <strong>{featureSheet.title}</strong>
                        {featureSheet.note ? <p>{featureSheet.note}</p> : null}
                      </div>
                      <div className="fd__actions">
                        <button className="fd__btn fd__btn--save" type="button" onClick={() => { setRequestEditTargetId(featureSheet.id); setRequestMessage("") }}>수정 제안하기</button>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="fd__readonly">
                  <span className="fd__readonly-emoji"><FeatureEmoji feature={featureSheet} size={24} unicodeFontSize={20} /></span>
                  <strong>{featureSheet.title}</strong>
                  {featureSheet.note ? <p>{featureSheet.note}</p> : null}
                </div>
              )}

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
                      <FeatureStyleEditor featureSheet={featureSheet} setFeatureSheet={setFeatureSheet} labelPrefix={featureSheet.type === "pin" ? "장소 " : ""} />

                      <div className="fd__actions"><button className="fd__btn fd__btn--del" type="button" onClick={onDelete}>삭제</button><button className="fd__btn fd__btn--save" type="button" onClick={onSave}>저장</button></div>
                    </>
                  ) : (
                    <div className="fd__readonly">
                      <span className="fd__readonly-emoji"><FeatureEmoji feature={featureSheet} size={24} unicodeFontSize={20} /></span>
                      <strong>{featureSheet.title}</strong>
                      {featureSheet.note ? <p>{featureSheet.note}</p> : null}
                      {featureSheet.tags?.length ? <div className="fd__readonly-tags">{featureSheet.tags.map((t) => <span key={t} className="fd__tag">#{t}</span>)}</div> : null}
                    </div>
                  )}
                </div>
              ) : (
                <div className="fd__records-tab fd__records-tab--v2">
                  {(() => {
                    const buckets = buildDiaryBuckets({
                      memos: featureMemos,
                      photos: featureSheet.photos || [],
                      voices: featureSheet.voices || [],
                    })
                    const todayIso = new Date().toISOString().slice(0, 10)
                    const todayBucket = buckets.find((b) => b.dateKey === todayIso)
                    const pastBuckets = buckets.filter((b) => b.dateKey !== todayIso)
                    const totalCount = featureMemos.length + (featureSheet.photos || []).length + (featureSheet.voices || []).length

                    return (
                      <>
                        {/* 편집 모드 — 빠른 입력 툴바 (사진/음성/메모) */}
                        {canEdit ? (
                          <div className="fd__rec-quickbar">
                            <button className="fd__rec-quickbar-btn" type="button" onClick={() => photoInputRef.current?.click()} aria-label="사진 추가">
                              <Camera size={14} />
                              <span>사진</span>
                            </button>
                            <input ref={photoInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onPhotoSelected} />
                            <button
                              className={`fd__rec-quickbar-btn${isRecording ? " is-recording" : ""}`}
                              type="button"
                              onClick={isRecording ? onStopRecording : onStartRecording}
                              aria-label={isRecording ? "녹음 정지" : "음성 녹음"}
                            >
                              <Mic size={14} />
                              <span>{isRecording ? `녹음 중 ${recordingSeconds}초` : "음성"}</span>
                            </button>
                            <div className="fd__rec-quickbar-memo">
                              <textarea
                                className="fd__rec-quickbar-input"
                                rows="1"
                                value={memoText}
                                onChange={(e) => onMemoTextChange(e.target.value)}
                                placeholder="짧은 메모를 남겨보세요"
                              />
                              <button
                                className="fd__rec-quickbar-save"
                                type="button"
                                onClick={() => onAddMemo(featureSheet.id, memoText)}
                                disabled={!memoText.trim()}
                              >
                                저장
                              </button>
                            </div>
                          </div>
                        ) : null}

                        {totalCount === 0 ? (
                          <p className="fd__memo-empty">
                            아직 기록이 없어요.{canEdit ? " 위 버튼으로 첫 기록을 남겨보세요." : ""}
                          </p>
                        ) : (
                          <div className="fd__diary-stack">
                            {todayBucket ? (
                              <>
                                <span className="fd__diary-head">오늘</span>
                                <div className="fd__diary-list">
                                  <DiaryBanner entry={bucketToDiaryEntry(todayBucket, todayIso)} />
                                </div>
                              </>
                            ) : null}
                            {pastBuckets.length > 0 ? (
                              <>
                                <span className="fd__diary-head">지난 기록 {pastBuckets.length}</span>
                                <ol className="fd__diary-timeline">
                                  {pastBuckets.map((bucket) => (
                                    <li key={bucket.dateKey} className="fd__diary-timeline-item">
                                      <span className="fd__diary-timeline-dot" aria-hidden="true" />
                                      <DiaryBanner entry={bucketToDiaryEntry(bucket, todayIso)} />
                                    </li>
                                  ))}
                                </ol>
                              </>
                            ) : null}
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>
              )}
            </>
          )}
        </div>
      ) : null}
    </BottomSheet>
  )
}







