import { useEffect, useMemo, useRef, useState } from "react"
import { FeatureEmoji } from "../FeatureEmoji"
import { buildFeatureRecordGroups, formatRecordDate } from "../../lib/featureRecordGroups"
import { getPlaceType } from "../../lib/placeTypes"
import { looksLikeAddress, representativePhoto, cardArtFeature, mixHex, formatDotDate, photoFocusPosition, regionLabel } from "../../lib/binderCardData"
import { holoTiltMove, holoTiltLeave } from "./holoTilt"
import { shareImage, downloadImage, sanitizeCardFilename } from "../../lib/cardShareImage"
import { renderShareCardBlob } from "../../lib/shareCardCanvas"
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
          <img src={photo} alt="" loading="lazy" style={{ objectPosition: photoFocusPosition(feature) }} />
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

// ── 표지 사진 위치(초점) 조정 시트 ──
// 프레임 안의 사진을 드래그해 초점을 정한다. 초점(0~100%)은 카드 앞·뒷면과
// 공유 카드가 공유 — object-position 이라 프레임 비율이 달라도 같은 지점이 중심이 된다.
function clampFocus(value) {
  return Math.min(100, Math.max(0, value))
}

function PhotoFocusSheet({ photo, initialFocus, saving, onSave, onClose }) {
  const [focus, setFocus] = useState(initialFocus)
  const frameRef = useRef(null)
  const imgDimsRef = useRef(null) // { w, h } — 원본 픽셀 크기
  const dragRef = useRef(null) // { sx, sy, fx, fy, ovX, ovY }

  // cover 스케일에서 프레임 밖으로 넘치는 픽셀 수 — 드래그 이동량↔초점 % 를 1:1 로 잇는다
  const computeOverflow = () => {
    const frame = frameRef.current
    const dims = imgDimsRef.current
    if (!frame || !dims || !dims.w || !dims.h) return { x: 0, y: 0 }
    const fw = frame.clientWidth
    const fh = frame.clientHeight
    const scale = Math.max(fw / dims.w, fh / dims.h)
    return { x: dims.w * scale - fw, y: dims.h * scale - fh }
  }

  const handlePointerDown = (event) => {
    event.preventDefault()
    // 이미 떼진 포인터면 캡처가 예외를 던질 수 있다 — 드래그 시작은 계속돼야 한다
    try { event.currentTarget.setPointerCapture?.(event.pointerId) } catch { /* 무시 */ }
    const overflow = computeOverflow()
    dragRef.current = { sx: event.clientX, sy: event.clientY, fx: focus.x, fy: focus.y, ovX: overflow.x, ovY: overflow.y }
  }

  const handlePointerMove = (event) => {
    const drag = dragRef.current
    if (!drag) return
    const next = { x: drag.fx, y: drag.fy }
    // 오른쪽으로 끌면 사진이 오른쪽으로 따라오도록 (object-position % 는 반대 방향)
    if (drag.ovX > 1) next.x = clampFocus(drag.fx - ((event.clientX - drag.sx) / drag.ovX) * 100)
    if (drag.ovY > 1) next.y = clampFocus(drag.fy - ((event.clientY - drag.sy) / drag.ovY) * 100)
    setFocus(next)
  }

  const endDrag = () => { dragRef.current = null }

  return (
    <div className="bd-focus-ov" onClick={onClose} role="presentation">
      <div className="bd-focus-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="사진 위치 조정">
        <div className="bd-focus-head">
          <span className="bd-focus-title">사진 위치 조정</span>
          <button type="button" className="bd-headclose" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <div
          ref={frameRef}
          className="bd-focus-frame"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <img
            src={photo}
            alt="표지 사진 미리보기"
            draggable={false}
            style={{ objectPosition: `${focus.x}% ${focus.y}%` }}
            onLoad={(event) => {
              imgDimsRef.current = { w: event.target.naturalWidth, h: event.target.naturalHeight }
            }}
          />
          <span className="bd-focus-grid" aria-hidden="true" />
        </div>
        <p className="bd-focus-hint">사진을 드래그해서 카드에 보일 부분을 맞춰주세요.</p>
        <div className="bd-focus-acts">
          <button type="button" className="bd-mini" onClick={() => setFocus({ x: 50, y: 50 })}>가운데로</button>
          <span className="bd-focus-spacer" />
          <button type="button" className="bd-mini" onClick={onClose}>취소</button>
          <button
            type="button"
            className="bd-mini bd-mini--red"
            disabled={saving}
            onClick={() => onSave({ x: Math.round(focus.x), y: Math.round(focus.y) })}
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
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
  maps = [],
  currentUserId = "",
  onClose,
  onOpenOnMap,
  onAddRecord,
  onSetPhoto,
  onSetCoverUrl,
  onSetPhotoFocus,
  onUpdateCard,
  collectorHandle,
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
  const [edEnLabel, setEdEnLabel] = useState("")
  const [edDesc, setEdDesc] = useState("")
  const [edTags, setEdTags] = useState([])
  const [edTagInput, setEdTagInput] = useState("")
  const [edSaving, setEdSaving] = useState(false)
  const fileInputRef = useRef(null)
  const recFileInputRef = useRef(null)
  const flipRafRef = useRef(0)
  const [imgBusy, setImgBusy] = useState(null) // "share" | "download" | null
  const [share, setShare] = useState(null) // null | { loading: true } | { blob, url, format }
  const [shareFormat, setShareFormat] = useState("feed") // "feed" | "story"
  const shareRef = useRef(null)
  shareRef.current = share
  // 표지 사진 위치(초점) 조정 시트
  const [focusOpen, setFocusOpen] = useState(false)
  const [focusSaving, setFocusSaving] = useState(false)
  const focusOpenRef = useRef(false)
  focusOpenRef.current = focusOpen

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

  // 지도명 조회 — 각 기록 섹션 헤더 라벨용
  const mapTitleById = useMemo(() => {
    const lookup = new Map()
    ;(maps || []).forEach((mp) => { if (mp?.id) lookup.set(mp.id, mp.title || "지도") })
    return lookup
  }, [maps])

  // 바인더 카드 기록 = "내가 쓴 것만"(currentUserId) 을 출처 지도별로 묶는다.
  //  - mapId 있는 메모 → 그 지도 섹션(지도명 마킹)
  //  - mapId 없는 메모 + 지도에 안 묶인 카드 사진 → "수첩 기록" 섹션(바인더 전용)
  //  - 지도 태그가 하나도 없으면(데모/로컬/레거시) 섹션 헤더 없이 평면 목록으로 렌더
  const recordSections = useMemo(() => {
    if (!feature) return { sections: [], total: 0, grouped: false }
    const mine = (feature.memos || []).filter((memo) => (
      !currentUserId || (memo.userId || memo.user_id) === currentUserId
    ))
    const byMap = new Map()
    mine.forEach((memo) => {
      const key = memo.mapId || "__notebook__"
      if (!byMap.has(key)) byMap.set(key, [])
      byMap.get(key).push(memo)
    })
    // 지도에 안 묶인 카드 사진(standalone)은 수첩 버킷으로
    const standalonePhotos = Array.isArray(feature.photos) ? feature.photos : []
    if (standalonePhotos.length && !byMap.has("__notebook__")) byMap.set("__notebook__", [])

    const sections = [...byMap.entries()].map(([key, memos]) => {
      const isNotebook = key === "__notebook__"
      const groups = buildFeatureRecordGroups({ memos, photos: isNotebook ? standalonePhotos : [] })
        .sort((a, b) => new Date(b.dateValue || 0) - new Date(a.dateValue || 0))
      return {
        key,
        isNotebook,
        title: isNotebook ? "수첩 기록" : (mapTitleById.get(key) || "함께 만든 지도"),
        groups,
        lastDate: groups[0]?.dateValue || null,
      }
    }).filter((section) => section.groups.length > 0)

    sections.sort((a, b) => {
      if (a.isNotebook !== b.isNotebook) return a.isNotebook ? 1 : -1 // 수첩은 맨 아래
      return new Date(b.lastDate || 0) - new Date(a.lastDate || 0)
    })
    const total = sections.reduce((sum, section) => sum + section.groups.length, 0)
    // 지도 태그된 섹션이 하나라도 있으면 그룹 UI, 아니면(수첩만) 평면
    const grouped = sections.some((section) => !section.isNotebook)
    return { sections, total, grouped }
  }, [feature, currentUserId, mapTitleById])

  // 섹션 접기/펼치기 — 카드가 바뀌면 첫(가장 최근) 섹션만 펼친 상태로 초기화
  const [expandedSections, setExpandedSections] = useState(() => new Set())
  useEffect(() => {
    setExpandedSections(new Set(recordSections.sections.slice(0, 1).map((section) => section.key)))
    // feature.id 바뀔 때만 초기화 (같은 카드 내 토글은 유지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature?.id])
  const toggleSection = (key) => setExpandedSections((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key !== "Escape") return
      if (focusOpenRef.current) setFocusOpen(false)
      else if (shareRef.current) closeSharePreview()
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
  // 기록 그룹의 사진 중 현재 표지와 같은 게 있으면 표지 뱃지 표시
  const isCoverGroup = (group) => Boolean(heroPhoto) && (group.photos || []).some((photo) => {
    const src = typeof photo === "string" ? photo : photo?.url || photo?.src || photo?.cloudUrl || ""
    return src && src === heroPhoto
  })
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
      showToast?.("사진 담기에 실패했어요. 잠시 후 다시 시도해 주세요.")
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

  // 초점 저장 — 두 카드(바인더·공유)가 공유하는 값이라 한 번만 저장하면 된다
  const handleSaveFocus = async (nextFocus) => {
    if (!onSetPhotoFocus || focusSaving) return
    setFocusSaving(true)
    try {
      await onSetPhotoFocus(nextFocus)
      setFocusOpen(false)
      showToast?.("사진 위치를 저장했어요")
    } catch {
      showToast?.("위치 저장에 실패했어요. 잠시 후 다시 시도해주세요.")
    } finally {
      setFocusSaving(false)
    }
  }

  // ── 카드 편집 ──
  const openEdit = () => {
    setEdName(feature.title || "")
    setEdEnLabel(feature.enLabel || "")
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
    // 영문 라벨 — 영문/숫자/공백/·-만 허용(로마자 표기용), 비면 null 로 지워짐
    const enLabel = edEnLabel.trim().replace(/[^A-Za-z0-9 .'&·-]/g, "").slice(0, 40)
    setEdSaving(true)
    try {
      await onUpdateCard?.({ title, note, tags, enLabel })
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

  // 상단 공유 버튼 → 카드(지시서 v1.0)를 캔버스로 렌더해 미리보기를 연다.
  // 사진 있으면 카드 A(사진형). 지역은 개인정보 보호로 시·군·읍면동 수준만.
  const buildShareData = () => ({
    dexNo,
    typeLabel: type.label,
    handle: collectorHandle || feature.createdByName || "",
    name,
    enLabel: feature.enLabel || "",
    desc: descText,
    address: regionLabel(feature),
    date: formatDotDate(feature.createdAt || feature.updatedAt) || "",
    photoUrl: heroPhoto || "",
    focusX: Number.isFinite(Number(feature.emojiPhotoFocusX)) ? Number(feature.emojiPhotoFocusX) : 50,
    focusY: Number.isFinite(Number(feature.emojiPhotoFocusY)) ? Number(feature.emojiPhotoFocusY) : 50,
  })
  // 주어진 포맷(피드 4:5 / 스토리 9:16)으로 카드를 렌더해 미리보기에 넣는다
  const doRenderShare = async (fmt) => {
    setShareFormat(fmt)
    setShare((cur) => {
      if (cur?.url) URL.revokeObjectURL(cur.url)
      return { loading: true }
    })
    try {
      const blob = await renderShareCardBlob(buildShareData(), fmt)
      if (!blob) throw new Error("capture failed")
      setShare({ blob, url: URL.createObjectURL(blob), format: fmt })
    } catch {
      setShare(null)
      showToast?.("카드 이미지를 만들지 못했어요. 잠시 후 다시 시도해주세요.")
    }
  }
  const openSharePreview = () => {
    if (share) return
    doRenderShare(shareFormat)
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
              <button type="button" className="bd-shareico" onClick={openSharePreview} aria-label="공유 카드 만들기">📤 공유</button>
              <button type="button" className="bd-headclose" onClick={onClose} aria-label="닫기">✕</button>
            </div>

            <div className="bd-backhero" style={{ backgroundColor: `${type.color}22` }}>
              {heroPhoto
                ? <img src={heroPhoto} alt={`${name} 사진`} style={{ objectPosition: photoFocusPosition(feature) }} />
                : <FeatureEmoji feature={cardArtFeature(feature)} size={72} unicodeFontSize={48} />}
              {heroPhoto && onSetPhotoFocus ? (
                <button
                  type="button"
                  className="bd-heroupload bd-heroupload--focus"
                  onClick={() => setFocusOpen(true)}
                  disabled={photoBusy}
                >
                  🎯 위치 조정
                </button>
              ) : null}
              {onSetPhoto ? (
                <>
                  <button
                    type="button"
                    className="bd-heroupload"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={photoBusy}
                  >
                    📷 사진 {heroPhoto ? "변경" : "담기"}
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
                    <span className="bd-editfield__label">영문 라벨 <i className="bd-editfield__opt">선택 · 공유 카드에 표기</i></span>
                    <input
                      className="bd-editinput"
                      type="text"
                      value={edEnLabel}
                      onChange={(event) => setEdEnLabel(event.target.value)}
                      maxLength={40}
                      placeholder="예: MINDUNGSAN"
                      autoCapitalize="characters"
                      spellCheck={false}
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
                    {onUpdateCard ? (
                      <button
                        type="button"
                        className="bd-editbtn"
                        onClick={(event) => { event.stopPropagation(); openEdit() }}
                        aria-label="카드 편집"
                      >
                        ✎ 편집
                      </button>
                    ) : null}
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
                <div><span>채집일</span><b>{registered || "—"}</b></div>
                <div><span>주소</span><b>{addressText}</b></div>
              </div>

              <div className="bd-tl">
                <div className="bd-tlhead">
                  <span className="bd-tlt">기록 {recordSections.total}</span>
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

                {recordSections.total > 0 ? (
                  recordSections.grouped ? (
                    recordSections.sections.map((section) => {
                      const open = expandedSections.has(section.key)
                      return (
                        <div className={`bd-recsec${section.isNotebook ? " bd-recsec--notebook" : ""}`} key={section.key}>
                          <button type="button" className="bd-recsec__head" onClick={() => toggleSection(section.key)} aria-expanded={open}>
                            <span className="bd-recsec__badge">{section.isNotebook ? "수첩" : "지도"}</span>
                            <span className="bd-recsec__title">{section.title}</span>
                            <span className="bd-recsec__count">기록 {section.groups.length}</span>
                            <span className="bd-recsec__chev" aria-hidden="true">{open ? "▾" : "▸"}</span>
                          </button>
                          {open ? (
                            <div className="bd-recsec__body">
                              {section.groups.slice(0, 12).map((group) => (
                                <RecordItem
                                  key={group.id}
                                  group={group}
                                  onPromoteCover={onSetCoverUrl ? handlePromoteCover : null}
                                  isCover={isCoverGroup(group)}
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )
                    })
                  ) : (
                    recordSections.sections[0].groups.slice(0, 8).map((group) => (
                      <RecordItem
                        key={group.id}
                        group={group}
                        onPromoteCover={onSetCoverUrl ? handlePromoteCover : null}
                        isCover={isCoverGroup(group)}
                      />
                    ))
                  )
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

    {/* 표지 사진 위치 조정 시트 */}
    {focusOpen && heroPhoto ? (
      <PhotoFocusSheet
        photo={heroPhoto}
        initialFocus={{
          x: Number.isFinite(Number(feature.emojiPhotoFocusX)) ? Number(feature.emojiPhotoFocusX) : 50,
          y: Number.isFinite(Number(feature.emojiPhotoFocusY)) ? Number(feature.emojiPhotoFocusY) : 50,
        }}
        saving={focusSaving}
        onSave={handleSaveFocus}
        onClose={() => setFocusOpen(false)}
      />
    ) : null}

    {/* 공유 미리보기 — 상단 공유 버튼을 누르면 실제 카드(시안)를 보여주고 그 아래에서 공유/저장 */}
    {share ? (
      <div className="csp-share-ov" onClick={closeSharePreview} role="presentation">
        <div className="csp-share-panel" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="csp-share-close" onClick={closeSharePreview} aria-label="닫기">✕</button>
          <div className="csp-fmt-tabs" role="tablist" aria-label="공유 크기">
            <button
              type="button"
              role="tab"
              aria-selected={shareFormat === "feed"}
              className={`csp-fmt-tab${shareFormat === "feed" ? " is-on" : ""}`}
              onClick={() => { if (shareFormat !== "feed") doRenderShare("feed") }}
              disabled={share.loading}
            >
              피드 <b>4:5</b>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={shareFormat === "story"}
              className={`csp-fmt-tab${shareFormat === "story" ? " is-on" : ""}`}
              onClick={() => { if (shareFormat !== "story") doRenderShare("story") }}
              disabled={share.loading}
            >
              스토리 <b>9:16</b>
            </button>
          </div>
          <div
            className={`csp-share-imgwrap csp-share-imgwrap--holo${shareFormat === "story" ? " csp-share-imgwrap--story" : ""}`}
            onPointerMove={share.loading ? undefined : holoTiltMove}
            onPointerLeave={share.loading ? undefined : holoTiltLeave}
          >
            {share.loading
              ? <span className="csp-share-spin">공유 카드 만드는 중…</span>
              : (
                <>
                  <img className="csp-share-img" src={share.url} alt={`${name} 공유 카드`} />
                  <span className="csp-share-shine" aria-hidden="true" />
                  <span className="csp-share-glare" aria-hidden="true" />
                </>
              )}
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
