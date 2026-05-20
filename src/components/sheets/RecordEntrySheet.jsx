import { useEffect, useMemo, useRef, useState } from "react"
import { X as XIcon, Mic, Square as StopSquare, Plus, Trash2 } from "lucide-react"

/**
 * RecordEntrySheet — 참고 B8 "오늘의 기록 남기기" 통합 입력 시트.
 *
 * 시안: 참고자료/design-source/map-cards-modals.jsx::RecordEntrySheet
 *
 * 구조 (위→아래):
 *   - 헤더: "오늘 5월 N일 X요일" 코랄 뱃지 + 큰 타이틀 "[장소명]에 기록하기" + ✕
 *   - 메모: autofocus textarea + 280자 카운터 + "메모" 라벨
 *   - 사진 N: 가로 스크롤 76×76 + ✕ 삭제 + 마지막에 점선 + 추가 버튼
 *   - 음성 N: 세이지 큰 카드 (마이크 버튼 + 라이브 파형 + 녹음 시 펄스 + 녹음된 칩 리스트)
 *   - 푸터: 풀폭 엠버 "오늘의 기록 저장"
 *
 * Props:
 *   open                  — 시트 열림 상태
 *   featureTitle          — 헤더 타이틀에 표시될 장소/경로/영역 이름
 *   onClose
 *   onSave(memoText)      — 메모 텍스트 저장 (사진/음성은 즉시 핸들러 호출됨)
 *   photos / voices       — 기존 첨부 (미리보기용)
 *   onPhotoSelected       — file input change 핸들러 (외부에서 file input ref 관리)
 *   onDeletePhoto
 *   onStartRecording / onStopRecording
 *   onDeleteVoice
 *   isRecording / recordingSeconds
 *   photoInputRef         — 부모가 보유한 file input ref (sheet 안의 + 버튼이 click() 트리거)
 *
 * 사진/음성은 기존 useMediaHandlers + useFeatureEditing 의 핸들러를 그대로 재사용.
 */

const DAY_OF_WEEK_KO = ["일", "월", "화", "수", "목", "금", "토"]

function formatTodayBadge() {
  const d = new Date()
  return `오늘 · ${d.getMonth() + 1}월 ${d.getDate()}일 ${DAY_OF_WEEK_KO[d.getDay()]}요일`
}

function formatRecordingTime(sec) {
  const n = Math.max(0, Math.round(sec || 0))
  const m = Math.floor(n / 60)
  const s = n % 60
  return `${m}:${`${s}`.padStart(2, "0")}`
}

export function RecordEntrySheet({
  open,
  featureTitle,
  onClose,
  onSave,
  photos = [],
  voices = [],
  onPhotoSelected,
  onDeletePhoto,
  onStartRecording,
  onStopRecording,
  onDeleteVoice,
  isRecording = false,
  recordingSeconds = 0,
  photoInputRef,
}) {
  const [text, setText] = useState("")
  const textareaRef = useRef(null)
  const todayBadge = useMemo(() => formatTodayBadge(), [])

  // open 시 메모 textarea autofocus + 텍스트 초기화.
  // setText 는 setTimeout 콜백 안에서만 호출 — effect 본문 동기 setState 회피.
  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      setText("")
      textareaRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [open])

  if (!open) return null

  // 라이브 파형 — 12개 막대, 녹음 중일 때 의사-랜덤 높이 갱신.
  const liveBars = Array.from({ length: 14 }, (_, i) => {
    const seed = (i * 17 + Math.floor((recordingSeconds || 0) * 11)) % 100
    return isRecording ? 30 + (seed % 50) : 22
  })

  const handlePhotoClick = () => {
    photoInputRef?.current?.click()
  }
  const handleVoiceClick = () => {
    if (isRecording) onStopRecording?.()
    else onStartRecording?.()
  }
  const handleSave = () => {
    onSave?.(text.trim())
    setText("")
    onClose?.()
  }

  const canSave = text.trim().length > 0 || photos.length > 0 || voices.length > 0
  const charCount = text.length
  const maxChars = 280

  return (
    <>
      <div className="res-backdrop" onClick={onClose} />
      <section
        className="res-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="오늘의 기록 남기기"
      >
        <div className="res-handle" />

        {/* 헤더 */}
        <div className="res-head">
          <div>
            <span className="res-today">{todayBadge}</span>
            <h2 className="res-title">
              <span className="res-title__name">{featureTitle || "장소"}</span>
              <span className="res-title__rest">에 기록하기</span>
            </h2>
            <p className="res-sub">사진 · 음성 · 메모를 한 번에 남길 수 있어요.</p>
          </div>
          <button
            type="button"
            className="res-close"
            onClick={onClose}
            aria-label="닫기"
          >
            <XIcon size={12} />
          </button>
        </div>

        {/* 본문 — 스크롤 영역 */}
        <div className="res-body">
          {/* 메모 섹션 */}
          <div className="res-section">
            <div className="res-section-label">
              <span>메모</span>
              <span className="res-char-count">
                <span className={charCount > maxChars ? "is-over" : ""}>{charCount}</span> / {maxChars}
              </span>
            </div>
            <textarea
              ref={textareaRef}
              className="res-textarea"
              rows={4}
              maxLength={maxChars + 50}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="이 장소에서 무엇이 좋았나요? 떠오른 생각, 받은 인상, 다음에 다시 오고 싶은 이유…"
            />
          </div>

          {/* 사진 섹션 */}
          <div className="res-section">
            <div className="res-section-label">
              <span>사진</span>
              {photos.length > 0 ? <span className="res-count">{photos.length}</span> : null}
            </div>
            <div className="res-photo-row">
              {photos.map((p) => (
                <div key={p.id} className="res-photo-thumb">
                  <img src={p.url || p.thumbnail || ""} alt="" />
                  {onDeletePhoto ? (
                    <button
                      type="button"
                      className="res-photo-rm"
                      aria-label="사진 삭제"
                      onClick={() => onDeletePhoto(p.id)}
                    >
                      <XIcon size={10} />
                    </button>
                  ) : null}
                </div>
              ))}
              <button
                type="button"
                className="res-photo-add"
                onClick={handlePhotoClick}
                aria-label="사진 추가"
              >
                <Plus size={20} strokeWidth={1.8} />
                <span>추가</span>
              </button>
            </div>
          </div>

          {/* 음성 섹션 */}
          <div className="res-section">
            <div className="res-section-label">
              <span>음성</span>
              {voices.length > 0 ? <span className="res-count">{voices.length}</span> : null}
            </div>
            <div className="res-voice-card">
              <button
                type="button"
                className={`res-voice-mic${isRecording ? " is-recording" : ""}`}
                onClick={handleVoiceClick}
                aria-label={isRecording ? "녹음 정지" : "음성 녹음 시작"}
              >
                {isRecording ? <StopSquare size={18} fill="currentColor" /> : <Mic size={20} />}
              </button>
              <div className="res-voice-wave" aria-hidden="true">
                {liveBars.map((h, i) => (
                  <span key={i} style={{ height: `${h}%`, opacity: isRecording ? 1 : 0.35 }} />
                ))}
              </div>
              <div className="res-voice-meta">
                {isRecording
                  ? <span className="res-voice-time">{formatRecordingTime(recordingSeconds)}</span>
                  : <span className="res-voice-hint">탭해서 녹음 시작</span>}
              </div>
            </div>
            {voices.length > 0 ? (
              <div className="res-voice-list">
                {voices.map((v) => (
                  <span key={v.id} className="res-voice-chip">
                    <Mic size={11} strokeWidth={2} />
                    <span className="loca-v2-num">{formatRecordingTime(v.duration || 0)}</span>
                    {onDeleteVoice ? (
                      <button
                        type="button"
                        className="res-voice-chip-rm"
                        aria-label="음성 삭제"
                        onClick={() => onDeleteVoice(v.id)}
                      >
                        <Trash2 size={9} />
                      </button>
                    ) : null}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* 푸터 */}
        <div className="res-action">
          <button
            type="button"
            className="res-save"
            onClick={handleSave}
            disabled={!canSave || isRecording}
          >
            {isRecording ? "녹음 정지 후 저장하세요" : "오늘의 기록 저장"}
          </button>
        </div>

        {photoInputRef ? (
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => {
              onPhotoSelected?.(e)
              e.target.value = ""
            }}
          />
        ) : null}
      </section>
    </>
  )
}

