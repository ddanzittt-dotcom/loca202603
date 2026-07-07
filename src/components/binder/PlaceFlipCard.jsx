import { useEffect, useMemo, useRef, useState } from "react"
import { FeatureEmoji } from "../FeatureEmoji"
import { buildFeatureRecordGroups, formatRecordDate } from "../../lib/featureRecordGroups"
import { getPlaceType } from "../../lib/placeTypes"
import { looksLikeAddress, representativePhoto, cardArtFeature, mixHex, formatDotDate } from "../../lib/binderCardData"
import { PlaceSharePoster } from "./PlaceSharePoster"
import { capturePosterBlob, shareImage, downloadImage, sanitizeCardFilename } from "../../lib/cardShareImage"

// 카드 바인더 리디자인 — 장소 카드 앞면(슬리브 커버) + 플립 상세(뒷면).
// 시각·인터랙션 레퍼런스: loca-binder-prototype.html
// 앞면 = 타입 컬러 파스텔 풀아트 슬리브(수집·전시용). 정보 상세는 뒷면.

// ── 앞면 슬리브 커버 (바인더 그리드 + 오버레이 앞면 공용) ──
export function PlaceCardFront({ feature, dexNo, big = false }) {
  const type = getPlaceType(feature)
  const photo = representativePhoto(feature)
  const name = (feature.title || "").trim() || "이름 없는 장소"
  const isNewFind = (feature.tags || []).includes("새발견")

  const coverStyle = {
    "--sl-bg": mixHex(type.color, "#ffffff", 0.82),
    "--sl-streak": mixHex(type.color, "#ffffff", 0.55),
    "--sl-deep": mixHex(type.color, "#1b1b18", 0.2),
  }

  return (
    <div
      className={`bd-sleeve-cover${big ? " bd-sleeve-cover--big" : ""}${photo ? " has-photo" : ""}`}
      style={coverStyle}
    >
      <div className="bd-sl-badges">
        <span className="bd-sl-no">N.{dexNo || "000"}</span>
        {isNewFind ? <span className="bd-sl-new" aria-label="새발견">★</span> : null}
        <span className="bd-sl-type">{type.label}</span>
      </div>
      <div className="bd-sl-art">
        {photo ? (
          <img src={photo} alt="" loading="lazy" />
        ) : (
          <FeatureEmoji feature={cardArtFeature(feature)} className="bd-sl-emoji" size={big ? 128 : 88} />
        )}
      </div>
      <div className="bd-sl-ribbon">{name}</div>
    </div>
  )
}

// ── 뒷면 기록 아이템 ──
function RecordItem({ group }) {
  const text = (group.memos || [])
    .map((memo) => `${memo?.text || memo?.memo || memo?.content || ""}`.trim())
    .filter(Boolean)
    .join("\n")
  const photo = (group.photos || [])[0]
  const photoSrc = photo ? (typeof photo === "string" ? photo : photo.url || photo.src || photo.cloudUrl || "") : ""
  return (
    <div className="bd-rec">
      <span className="bd-rec__dot" aria-hidden="true" />
      <div className="bd-rec__body">
        <time>{formatRecordDate(group.dateValue)}</time>
        {text ? <p>{text}</p> : <p className="bd-rec__only">사진 기록</p>}
      </div>
      {photoSrc ? <img className="bd-rec__photo" src={photoSrc} alt="기록 사진" /> : null}
    </div>
  )
}

// 타자기 효과 (reduced-motion 이면 즉시, 클릭하면 즉시 완료)
// 키(=현재 텍스트) 기반 진행 상태 — effect 안 동기 setState 금지 규칙 대응
function useTypewriter(text, active) {
  const key = active ? `${text || ""}` : ""
  const [progress, setProgress] = useState({ key: "", count: 0 })
  const count = progress.key === key ? progress.count : 0

  useEffect(() => {
    if (!key) return undefined
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
    const timer = window.setInterval(() => {
      setProgress((current) => {
        const base = current.key === key ? current.count : 0
        if (base >= key.length) return current
        return { key, count: reduced ? key.length : base + 1 }
      })
    }, 24)
    return () => window.clearInterval(timer)
  }, [key])

  const complete = () => setProgress({ key, count: key.length })
  return [key.slice(0, count), complete]
}

/**
 * 플립 오버레이 — 카드를 누르면 뒤집혀서 뒷면이 상세가 된다.
 * onAddRecord(text) => Promise — 기록(메모) 추가. 없으면 추가 버튼 숨김.
 */
export function PlaceFlipCard({
  feature,
  dexNo,
  mapTitle,
  onClose,
  onOpenOnMap,
  onAddRecord,
  onSetPhoto,
  showToast,
}) {
  const [flipped, setFlipped] = useState(false)
  // 앞뒤 차이가 적어 앞면은 제거 — 열리자마자 회전해서 바로 뒷면(상세)을 보여준다.
  useEffect(() => {
    const raf1 = window.requestAnimationFrame(() => {
      const raf2 = window.requestAnimationFrame(() => setFlipped(true))
      flipRafRef.current = raf2
    })
    flipRafRef.current = raf1
    return () => window.cancelAnimationFrame(flipRafRef.current)
  }, [])
  const [recFormOpen, setRecFormOpen] = useState(false)
  const [recText, setRecText] = useState("")
  const [recPhoto, setRecPhoto] = useState(null) // { file, preview }
  const [saving, setSaving] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const fileInputRef = useRef(null)
  const recFileInputRef = useRef(null)
  const flipRafRef = useRef(0)
  const posterRef = useRef(null)
  const [imgBusy, setImgBusy] = useState(null) // "share" | "download" | null

  const type = getPlaceType(feature || {})
  const note = `${feature?.note || ""}`.trim()
  const noteIsAddress = looksLikeAddress(note)
  const descText = noteIsAddress ? "" : note
  const [typedDesc, completeTyping] = useTypewriter(
    descText || "아직 설명이 없어요. 기록을 남겨보세요.",
    flipped,
  )

  const recordGroups = useMemo(() => {
    if (!feature) return []
    return [...buildFeatureRecordGroups(feature)]
      .sort((a, b) => new Date(b.dateValue || 0) - new Date(a.dateValue || 0))
  }, [feature])

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === "Escape") onClose?.()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [onClose])

  if (!feature) return null

  const heroPhoto = representativePhoto(feature)
  const name = (feature.title || "").trim() || "이름 없는 장소"
  const registered = formatDotDate(feature.createdAt || feature.updatedAt)

  const handlePhotoFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !onSetPhoto) return
    setPhotoBusy(true)
    try {
      await onSetPhoto(file)
      showToast?.("사진을 바꿨어요")
    } catch {
      showToast?.("사진 등록에 실패했어요. 잠시 후 다시 시도해주세요.")
    } finally {
      setPhotoBusy(false)
    }
  }

  const pickRecPhoto = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    if (recPhoto?.preview) URL.revokeObjectURL(recPhoto.preview)
    setRecPhoto({ file, preview: URL.createObjectURL(file) })
  }

  const clearRecPhoto = () => {
    if (recPhoto?.preview) URL.revokeObjectURL(recPhoto.preview)
    setRecPhoto(null)
  }

  const closeRecForm = () => {
    clearRecPhoto()
    setRecText("")
    setRecFormOpen(false)
  }

  const handleSaveRecord = async () => {
    const text = recText.trim()
    if (!text && !recPhoto) { showToast?.("메모나 사진을 남겨주세요."); return }
    setSaving(true)
    try {
      await onAddRecord?.(text, recPhoto?.file || null)
      clearRecPhoto()
      setRecText("")
      setRecFormOpen(false)
      showToast?.("기록을 남겼어요")
    } catch {
      showToast?.("기록 저장에 실패했어요. 잠시 후 다시 시도해주세요.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bd-flipov" onClick={onClose} role="presentation">
      <div className="bd-stage" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="bd-flipclose" onClick={onClose} aria-label="닫기">✕</button>
        <div className={`bd-3d${flipped ? " is-flipped" : ""}`}>
          {/* 앞면 — 회전 표면으로만 남김 (열리면 자동으로 뒷면으로 뒤집힘) */}
          <div className="bd-face bd-face--front bd-card" aria-hidden="true">
            <PlaceCardFront feature={feature} dexNo={dexNo} mapTitle={mapTitle} big />
          </div>

          {/* 뒷면 */}
          <div className="bd-face bd-face--back" role="dialog" aria-modal="true" aria-label={`${name} 상세`}>
            <div className="bd-chead">
              <span className="bd-cno">N.{dexNo || "000"} · {name}</span>
              <span className="bd-cbadge" style={{ background: type.color }}>{type.label}</span>
            </div>

            <div className="bd-backhero" style={{ backgroundColor: `${type.color}22` }}>
              {heroPhoto
                ? <img src={heroPhoto} alt={`${name} 사진`} />
                : <FeatureEmoji feature={cardArtFeature(feature)} size={72} unicodeFontSize={48} />}
              {onSetPhoto ? (
                <>
                  <button
                    type="button"
                    className="bd-heroupload"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={photoBusy}
                  >
                    📷 사진 {heroPhoto ? "변경" : "등록"}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={handlePhotoFile}
                  />
                </>
              ) : null}
            </div>

            <div className="bd-backbody">
              <div className="bd-textbox" onClick={completeTyping} role="presentation">
                <span className="bd-tblabel">설명</span>
                <span>{typedDesc}</span>
              </div>

              <div className="bd-spec">
                <div><span>등록일</span><b>{registered || "—"}</b></div>
                <div><span>주소</span><b>{noteIsAddress ? note : "주소 미입력"}</b></div>
              </div>

              <div className="bd-tl">
                <div className="bd-tlhead">
                  <span className="bd-tlt">기록 {recordGroups.length}</span>
                  {onAddRecord && !recFormOpen ? (
                    <button type="button" className="bd-mini" onClick={() => setRecFormOpen(true)}>+ 기록 추가</button>
                  ) : null}
                </div>

                {recFormOpen ? (
                  <div className="bd-recform">
                    <textarea
                      value={recText}
                      onChange={(event) => setRecText(event.target.value)}
                      placeholder="오늘 이곳은 어땠나요? 느낀 점, 다음에 올 이유, 뭐든 편하게 적어보세요."
                      rows={5}
                      autoFocus
                    />
                    {recPhoto ? (
                      <div className="bd-recform__preview">
                        <img src={recPhoto.preview} alt="첨부 사진 미리보기" />
                        <button type="button" onClick={clearRecPhoto} aria-label="사진 제거">✕</button>
                      </div>
                    ) : null}
                    <div className="bd-recform__row">
                      <button type="button" className="bd-recform__attach" onClick={() => recFileInputRef.current?.click()}>
                        📷 {recPhoto ? "사진 변경" : "사진 추가"}
                      </button>
                      <span className="bd-recform__spacer" />
                      <button type="button" className="bd-mini" onClick={closeRecForm}>취소</button>
                      <button type="button" className="bd-mini bd-mini--red" disabled={saving} onClick={handleSaveRecord}>
                        {saving ? "저장 중…" : "저장"}
                      </button>
                    </div>
                    <input ref={recFileInputRef} type="file" accept="image/*" hidden onChange={pickRecPhoto} />
                  </div>
                ) : null}

                {recordGroups.length > 0 ? (
                  recordGroups.slice(0, 8).map((group) => <RecordItem key={group.id} group={group} />)
                ) : (
                  <p className="bd-tlempty">아직 기록이 없어요. 첫 기록을 남겨보세요.</p>
                )}
              </div>
            </div>

            <div className="bd-backfoot">
              <button
                type="button"
                className="bd-btn bd-btn--red"
                onClick={() => {
                  if (onOpenOnMap) onOpenOnMap()
                  else showToast?.("아직 지도에 안 담겼어요. '지도 만들기'로 담아보세요.")
                }}
              >
                지도에서 보기
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
