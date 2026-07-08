import { useEffect, useMemo, useRef, useState } from "react"
import { FeatureEmoji } from "../FeatureEmoji"
import { buildFeatureRecordGroups, formatRecordDate } from "../../lib/featureRecordGroups"
import { getPlaceType } from "../../lib/placeTypes"
import { looksLikeAddress, representativePhoto, cardArtFeature, mixHex, formatDotDate } from "../../lib/binderCardData"
import { PlaceSharePoster } from "./PlaceSharePoster"
import { capturePosterBlob, shareImage, downloadImage, sanitizeCardFilename } from "../../lib/cardShareImage"
import { reverseGeocodeAddress } from "../../lib/reverseGeocode"
import { logEvent } from "../../lib/analytics"

// 카드에 표시할 대표 좌표 — 핀은 lat/lng, 경로/영역은 첫 좌표
function featurePoint(feature) {
  if (Number.isFinite(feature?.lat) && Number.isFinite(feature?.lng)) {
    return { lat: feature.lat, lng: feature.lng }
  }
  const first = feature?.coordinates?.[0] || feature?.path?.[0] || feature?.points?.[0]
  if (Array.isArray(first) && first.length >= 2) {
    // [lng, lat] 순서 저장 규약
    return { lat: Number(first[1]), lng: Number(first[0]) }
  }
  return null
}

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
function RecordItem({ group, onPromoteCover, isCover }) {
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
      {photoSrc ? (
        <div className="bd-rec__photowrap">
          <img className="bd-rec__photo" src={photoSrc} alt="기록 사진" />
          {onPromoteCover ? (
            isCover ? (
              <span className="bd-rec__coverflag" aria-label="현재 표지">표지</span>
            ) : (
              <button
                type="button"
                className="bd-rec__cover"
                onClick={() => onPromoteCover(photoSrc)}
              >
                표지로
              </button>
            )
          ) : null}
        </div>
      ) : null}
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
  onSetCoverUrl,
  onUpdateCard,
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
  // 카드 편집(이름·설명·태그)
  const [editing, setEditing] = useState(false)
  const [edName, setEdName] = useState("")
  const [edDesc, setEdDesc] = useState("")
  const [edTags, setEdTags] = useState([])
  const [edTagInput, setEdTagInput] = useState("")
  const [edSaving, setEdSaving] = useState(false)
  const fileInputRef = useRef(null)
  const recFileInputRef = useRef(null)
  const flipRafRef = useRef(0)
  const posterRef = useRef(null)
  const [imgBusy, setImgBusy] = useState(null) // "share" | "download" | null
  const [share, setShare] = useState(null) // null | { loading: true } | { blob, url }
  const shareRef = useRef(null)
  shareRef.current = share

  const type = getPlaceType(feature || {})
  const note = `${feature?.note || ""}`.trim()
  const noteIsAddress = looksLikeAddress(note)
  const descText = noteIsAddress ? "" : note

  // 주소 자동 표시 — note 가 주소 형태가 아니면 좌표로 역지오코딩해서 채운다.
  // (지도에서 찍어 만든 핀은 note 가 비어 늘 "미입력" 이던 문제 해결)
  const [autoAddress, setAutoAddress] = useState(null) // null=조회 안함/전, ""=실패, "..."=주소
  useEffect(() => {
    if (noteIsAddress) { setAutoAddress(null); return undefined }
    const spot = featurePoint(feature)
    if (!spot) { setAutoAddress(""); return undefined }
    let alive = true
    setAutoAddress(null)
    reverseGeocodeAddress(spot.lat, spot.lng).then((address) => {
      if (alive) setAutoAddress(address || "")
    })
    return () => { alive = false }
  }, [feature, noteIsAddress])

  const addressText = noteIsAddress
    ? note
    : autoAddress === null
      ? "주소 확인 중…"
      : autoAddress || "주소 미입력"
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
      if (event.key !== "Escape") return
      if (shareRef.current) closeSharePreview()
      else onClose?.()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [onClose])

  // 언마운트 시 미리보기 이미지 URL 정리 (메모리 누수 방지)
  useEffect(() => () => {
    if (shareRef.current?.url) URL.revokeObjectURL(shareRef.current.url)
  }, [])

  if (!feature) return null

  const heroPhoto = representativePhoto(feature)
  const name = (feature.title || "").trim() || "이름 없는 장소"
  const registered = formatDotDate(feature.createdAt || feature.updatedAt)
  const cardTags = (feature.tags || []).map((tag) => `${tag || ""}`.trim()).filter(Boolean)

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

  // 기록 사진을 표지로 승격 — 이미 저장된 URL 이라 재업로드 없이 표지만 바꾼다
  const handlePromoteCover = async (url) => {
    if (!onSetCoverUrl || !url || photoBusy) return
    setPhotoBusy(true)
    try {
      await onSetCoverUrl(url)
      showToast?.("이 사진을 표지로 정했어요")
    } catch {
      showToast?.("표지 변경에 실패했어요. 잠시 후 다시 시도해주세요.")
    } finally {
      setPhotoBusy(false)
    }
  }

  // ── 카드 편집 ──
  const openEdit = () => {
    setEdName(feature.title || "")
    // note 가 주소면 설명은 비워둔다 (설명과 주소는 분리 — 주소는 하단 스펙에 자동 표시)
    setEdDesc(looksLikeAddress(feature.note) ? "" : `${feature.note || ""}`)
    setEdTags((feature.tags || []).map((tag) => `${tag || ""}`.trim()).filter(Boolean))
    setEdTagInput("")
    setEditing(true)
  }
  const addEdTag = (raw) => {
    const value = `${raw || ""}`.trim().replace(/^#/, "")
    if (!value) return
    setEdTags((current) => (current.includes(value) || current.length >= 6 ? current : [...current, value]))
    setEdTagInput("")
  }
  const handleEdTagKeyDown = (event) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault()
      addEdTag(edTagInput)
    } else if (event.key === "Backspace" && !edTagInput && edTags.length) {
      setEdTags((current) => current.slice(0, -1))
    }
  }
  const saveEdit = async () => {
    const title = edName.trim()
    if (!title) { showToast?.("이름을 적어주세요."); return }
    const pending = edTagInput.trim().replace(/^#/, "")
    const tags = [...new Set([...edTags, ...(pending ? [pending] : [])])]
    const trimmedDesc = edDesc.trim()
    // 설명을 적었으면 note=설명, 비웠고 원래 note 가 주소였으면 그대로 유지
    const note = trimmedDesc || (looksLikeAddress(feature.note) ? feature.note : "")
    setEdSaving(true)
    try {
      await onUpdateCard?.({ title, note, tags })
      setEditing(false)
      showToast?.("카드를 수정했어요")
    } catch {
      showToast?.("수정에 실패했어요. 잠시 후 다시 시도해주세요.")
    } finally {
      setEdSaving(false)
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

  // 상단 공유 버튼 → 카드(시안) 이미지를 만들어 미리보기를 연다
  const openSharePreview = async () => {
    if (share) return
    setShare({ loading: true })
    try {
      const blob = await capturePosterBlob(posterRef.current)
      if (!blob) throw new Error("capture failed")
      setShare({ blob, url: URL.createObjectURL(blob) })
    } catch {
      setShare(null)
      showToast?.("카드 이미지를 만들지 못했어요. 잠시 후 다시 시도해주세요.")
    }
  }

  const closeSharePreview = () => {
    setShare((current) => {
      if (current?.url) URL.revokeObjectURL(current.url)
      return null
    })
  }

  // 미리보기 아래 공유하기 — 이미 만든 이미지를 그대로 공유
  const handleShareNow = async () => {
    if (!share?.blob || imgBusy) return
    setImgBusy("share")
    try {
      const result = await shareImage(share.blob, {
        filename: sanitizeCardFilename(name),
        title: `${name} · LOCA`,
        text: `${name} — 내 동네를 기록하는 지도 LOCA`,
      })
      if (result !== "canceled") {
        logEvent("place_card_share", { meta: { feature_id: feature?.id, method: result, surface: "place_card" } })
      }
      if (result === "downloaded") showToast?.("이미지를 저장했어요. 인스타에 올려보세요!")
    } catch {
      showToast?.("공유에 실패했어요. 잠시 후 다시 시도해주세요.")
    } finally {
      setImgBusy(null)
    }
  }

  const handleDownloadNow = () => {
    if (!share?.blob || imgBusy) return
    setImgBusy("download")
    try {
      downloadImage(share.blob, sanitizeCardFilename(name))
      logEvent("place_card_share", { meta: { feature_id: feature?.id, method: "download", surface: "place_card" } })
      showToast?.("카드를 저장했어요")
    } catch {
      showToast?.("저장에 실패했어요. 잠시 후 다시 시도해주세요.")
    } finally {
      setImgBusy(null)
    }
  }

  return (
    <>
    <div className="bd-flipov" onClick={onClose} role="presentation">
      <div className="bd-stage" onClick={(event) => event.stopPropagation()}>
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
              {onUpdateCard && !editing ? (
                <button type="button" className="bd-shareico" onClick={openEdit} aria-label="카드 편집">✎ 편집</button>
              ) : null}
              <button type="button" className="bd-shareico" onClick={openSharePreview} aria-label="공유 카드 만들기">📤 공유</button>
              <button type="button" className="bd-headclose" onClick={onClose} aria-label="닫기">✕</button>
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
              {editing ? (
                <div className="bd-editform">
                  <label className="bd-editfield">
                    <span className="bd-editfield__label">이름</span>
                    <input
                      className="bd-editinput"
                      type="text"
                      value={edName}
                      onChange={(event) => setEdName(event.target.value)}
                      maxLength={40}
                      autoFocus
                    />
                  </label>
                  <label className="bd-editfield">
                    <span className="bd-editfield__label">설명</span>
                    <textarea
                      className="bd-editinput"
                      value={edDesc}
                      onChange={(event) => setEdDesc(event.target.value)}
                      rows={3}
                      maxLength={200}
                      placeholder="이곳은 어떤 곳인가요?"
                    />
                  </label>
                  <div className="bd-editfield">
                    <span className="bd-editfield__label">태그</span>
                    <div className="clt-tags">
                      {edTags.map((tag) => (
                        <button key={tag} type="button" className="clt-tag" onClick={() => setEdTags((current) => current.filter((item) => item !== tag))}>
                          #{tag}<i aria-hidden="true">✕</i>
                        </button>
                      ))}
                      <input
                        className="clt-taginput"
                        type="text"
                        value={edTagInput}
                        onChange={(event) => setEdTagInput(event.target.value)}
                        onKeyDown={handleEdTagKeyDown}
                        onBlur={() => addEdTag(edTagInput)}
                        placeholder={edTags.length ? "" : "엔터로 추가"}
                        maxLength={12}
                        disabled={edTags.length >= 6}
                      />
                    </div>
                  </div>
                  <div className="bd-editactions">
                    <button type="button" className="bd-mini" onClick={() => setEditing(false)}>취소</button>
                    <button type="button" className="bd-mini bd-mini--red" disabled={edSaving} onClick={saveEdit}>
                      {edSaving ? "저장 중…" : "저장"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="bd-textbox" onClick={completeTyping} role="presentation">
                    <span className="bd-tblabel">설명</span>
                    <span>{typedDesc}</span>
                  </div>

                  {cardTags.length > 0 ? (
                    <div className="bd-tags" aria-label="태그">
                      {cardTags.map((tag) => (
                        <span key={tag} className="bd-tag">#{tag}</span>
                      ))}
                    </div>
                  ) : null}
                </>
              )}

              <div className="bd-spec">
                <div><span>등록일</span><b>{registered || "—"}</b></div>
                <div><span>주소</span><b>{addressText}</b></div>
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
                  recordGroups.slice(0, 8).map((group) => (
                    <RecordItem
                      key={group.id}
                      group={group}
                      onPromoteCover={onSetCoverUrl ? handlePromoteCover : null}
                      isCover={Boolean(heroPhoto) && (group.photos || []).some((photo) => {
                        const src = typeof photo === "string" ? photo : photo?.url || photo?.src || photo?.cloudUrl || ""
                        return src && src === heroPhoto
                      })}
                    />
                  ))
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

      {/* 인스타 공유용 포스터 — 화면 밖에서 렌더되어 캡처 대상이 된다 */}
      <div className="cardshare-hidden" aria-hidden="true">
        <PlaceSharePoster feature={feature} dexNo={dexNo} innerRef={posterRef} />
      </div>
    </div>

    {/* 공유 미리보기 — 상단 공유 버튼을 누르면 실제 카드(시안)를 보여주고 그 아래에서 공유/저장 */}
    {share ? (
      <div className="csp-share-ov" onClick={closeSharePreview} role="presentation">
        <div className="csp-share-panel" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="csp-share-close" onClick={closeSharePreview} aria-label="닫기">✕</button>
          <div className="csp-share-imgwrap">
            {share.loading
              ? <span className="csp-share-spin">공유 카드 만드는 중…</span>
              : <img className="csp-share-img" src={share.url} alt={`${name} 공유 카드`} />}
          </div>
          <div className="csp-share-acts">
            <button
              type="button"
              className="bd-btn bd-btn--dark"
              onClick={handleShareNow}
              disabled={share.loading || Boolean(imgBusy)}
            >
              {imgBusy === "share" ? "준비 중…" : "📤 공유하기"}
            </button>
            <button
              type="button"
              className="bd-btn bd-btn--paper"
              onClick={handleDownloadNow}
              disabled={share.loading || Boolean(imgBusy)}
            >
              {imgBusy === "download" ? "저장 중…" : "⬇ 다운로드"}
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  )
}
