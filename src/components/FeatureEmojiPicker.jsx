import { useMemo, useRef, useState } from "react"
import { X as XIcon, Search as SearchIcon, Plus as PlusIcon, Loader2 } from "lucide-react"
import {
  EMOJI_CATALOG,
  EMOJI_TABS,
  loadRecentEmojis as loadLegacyRecentUnicode,
} from "../lib/emojiCatalog"
import {
  findPixelArt,
  pixelArtToSvgString,
} from "../lib/pixelEmojiCatalog"
import { PUBLIC_PLACE_EMOJI_OPTIONS, getPublicPlaceEmojiOptionLabel } from "../utils/publicMapMarkers"
import {
  uploadFeatureEmojiPhoto,
  loadRecentPhotoEmojis,
  pushRecentPhotoEmoji,
} from "../lib/featureEmojiPhoto"
import { resolveFeatureEmoji } from "./FeatureEmoji"

const RECENT_STORE_V2 = "loca.feature.emoji.recent.v2"
const RECENT_MAX = 18

const BASIC_SUBS = EMOJI_TABS.filter((t) => t.id !== "recent")
const PUBLIC_PIXEL_PICKER_ITEMS = PUBLIC_PLACE_EMOJI_OPTIONS
  .map((option) => ({
    kind: "pixel",
    value: option.pixelId,
    label: option.label,
  }))
  .filter((item) => item.value && findPixelArt(item.value))

const BASIC_SUB_ICONS = {
  face: "😊",
  food: "🍰",
  nature: "🌿",
  animal: "🐰",
  symbol: "✨",
  object: "🏠",
}

const BASIC_SUB_LABELS = {
  face: "표정",
  food: "음식",
  nature: "식물",
  animal: "동물",
  symbol: "심볼",
  object: "공간",
}

function descriptorEq(a, b) {
  return a && b && a.kind === b.kind && a.value === b.value
}

function loadRecentDescriptors() {
  try {
    const raw = localStorage.getItem(RECENT_STORE_V2)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) {
        return arr
          .filter((d) => d && typeof d === "object" && typeof d.kind === "string" && typeof d.value === "string")
          .slice(0, RECENT_MAX)
      }
    }
  } catch {
    // Fall back to the legacy unicode-only store.
  }
  const legacy = loadLegacyRecentUnicode()
  return legacy.map((e) => ({ kind: "unicode", value: e }))
}

function pushRecentDescriptor(descriptor) {
  if (!descriptor || !descriptor.kind || !descriptor.value) return
  try {
    const current = loadRecentDescriptors()
    const next = [descriptor, ...current.filter((d) => !descriptorEq(d, descriptor))].slice(0, RECENT_MAX)
    localStorage.setItem(RECENT_STORE_V2, JSON.stringify(next))
  } catch {
    // Ignore localStorage quota and privacy-mode failures.
  }
}

export function FeatureEmojiPicker({ selectedEmoji, onSelect, onClose, cloudMode = false }) {
  const selectedDescriptor = useMemo(() => resolveFeatureEmoji(selectedEmoji), [selectedEmoji])
  const initialRecent = useMemo(() => loadRecentDescriptors(), [])
  const [recent, setRecent] = useState(initialRecent)
  const [tab, setTab] = useState("pixel")
  const [basicSub, setBasicSub] = useState("face")
  const [query, setQuery] = useState("")
  const [photoLib, setPhotoLib] = useState(() => loadRecentPhotoEmojis())
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const bodyRef = useRef(null)
  const fileInputRef = useRef(null)

  const handleTabChange = (nextTab) => {
    setTab(nextTab)
    setQuery("")
    setUploadError("")
    if (bodyRef.current) bodyRef.current.scrollTop = 0
  }

  const handleQueryChange = (value) => {
    setQuery(value)
    if ((tab === "recent" || tab === "photo") && value.trim()) {
      setTab("basic")
    }
    if (bodyRef.current) bodyRef.current.scrollTop = 0
  }

  const pick = (descriptor) => {
    if (!descriptor || !descriptor.value) return
    pushRecentDescriptor(descriptor)
    setRecent((cur) => [descriptor, ...cur.filter((d) => !descriptorEq(d, descriptor))].slice(0, RECENT_MAX))
    if (descriptor.kind === "photo") {
      pushRecentPhotoEmoji(descriptor.value)
      setPhotoLib((cur) => [descriptor.value, ...cur.filter((u) => u !== descriptor.value)].slice(0, RECENT_MAX))
    }
    onSelect?.(descriptor)
  }

  const handleFilePicked = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setUploadError("")
    setUploading(true)
    try {
      const { url, source } = await uploadFeatureEmojiPhoto(file, { fallbackToDataUrl: true })
      if (source === "data-url" && cloudMode) {
        setUploadError("사진 업로드 서버에 연결할 수 없어 이 기기에만 임시 저장했어요.")
      }
      pick({ kind: "photo", value: url })
    } catch (err) {
      setUploadError(err?.message || "사진을 추가하지 못했어요.")
    } finally {
      setUploading(false)
    }
  }

  const searchResults = useMemo(() => {
    const q = query.trim()
    if (!q) return null
    const unicodeHits = EMOJI_CATALOG
      .filter((item) => item.n.includes(q) || item.e === q)
      .map((item) => ({ kind: "unicode", value: item.e, label: item.n }))
    const pixelHits = PUBLIC_PIXEL_PICKER_ITEMS
      .filter((item) => item.label.includes(q) || item.value.includes(q))
    return [...unicodeHits, ...pixelHits]
  }, [query])

  let bodyContent = null
  if (searchResults) {
    bodyContent = (
      <PickerGrid
        items={searchResults}
        selected={selectedDescriptor}
        onPick={pick}
        empty={`"${query.trim()}" 검색 결과가 없어요`}
      />
    )
  } else if (tab === "recent") {
    const items = recent.map((d) => {
      if (d.kind === "unicode") {
        const found = EMOJI_CATALOG.find((e) => e.e === d.value)
        return { ...d, label: found?.n || "" }
      }
      if (d.kind === "pixel") {
        const art = findPixelArt(d.value)
        return { ...d, label: getPublicPlaceEmojiOptionLabel(d.value) || art?.label || "" }
      }
      return { ...d, label: "내 사진" }
    })
    bodyContent = (
      <PickerGrid
        items={items}
        selected={selectedDescriptor}
        onPick={pick}
        empty="최근 사용한 이모지가 없어요. 마음에 드는 이모지를 골라보세요."
      />
    )
  } else if (tab === "basic") {
    const items = EMOJI_CATALOG
      .filter((e) => e.g === basicSub)
      .map((e) => ({ kind: "unicode", value: e.e, label: e.n }))
    bodyContent = <PickerGrid items={items} selected={selectedDescriptor} onPick={pick} empty="이모지가 없어요." />
  } else if (tab === "pixel") {
    bodyContent = (
      <PickerGrid
        items={PUBLIC_PIXEL_PICKER_ITEMS}
        selected={selectedDescriptor}
        onPick={pick}
        empty="픽셀 이모지가 없어요."
      />
    )
  } else if (tab === "photo") {
    bodyContent = (
      <>
        <div className="fes-picker-photo-card">
          <div className="fes-picker-photo-ic">📷</div>
          <div>
            <div className="fes-picker-photo-title">사진으로 이미지 만들기</div>
            <div className="fes-picker-photo-desc">정사각형 썸네일과 컬러 링이 자동 적용돼요.</div>
          </div>
        </div>
        {uploadError ? (
          <div className="fes-picker-photo-error">{uploadError}</div>
        ) : null}
        <div className="fes-picker-grid">
          <button
            type="button"
            className="fes-picker-cell fes-picker-add-photo"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            aria-label="사진 추가"
          >
            {uploading ? <Loader2 className="fes-spin" size={18} /> : <PlusIcon size={18} />}
            <span className="fes-picker-add-photo-lbl">{uploading ? "추가 중" : "사진 추가"}</span>
          </button>
          {photoLib.map((url) => {
            const isSel = selectedDescriptor.kind === "photo" && selectedDescriptor.value === url
            return (
              <button
                key={url}
                type="button"
                className={`fes-picker-cell fes-picker-photo-cell${isSel ? " is-selected" : ""}`}
                onClick={() => pick({ kind: "photo", value: url })}
                aria-label="사진 이모지"
              >
                <span
                  className="fes-picker-photo-crop"
                  style={{ backgroundImage: `url(${url})` }}
                />
              </button>
            )
          })}
        </div>
      </>
    )
  }

  const showBasicSubs = tab === "basic" && !searchResults

  return (
    <>
      <div className="fes-picker-backdrop" onClick={onClose} />
      <section className="fes-picker" role="dialog" aria-modal="true" aria-label="이모지 선택">
        <div className="fes-handle" />
        <div className="fes-picker-head">
          <span className="fes-picker-title">이모지 선택</span>
          <button className="fes-close" type="button" onClick={onClose} aria-label="닫기">
            <XIcon size={12} />
          </button>
        </div>

        <div className="fes-picker-search">
          <SearchIcon size={14} />
          <input
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="이모지 검색"
            aria-label="이모지 검색"
          />
        </div>

        {searchResults ? null : (
          <div className="fes-picker-toptabs" role="tablist">
            <TopTab id="recent" tab={tab} onClick={handleTabChange} ic="🕘" label="최근" />
            <TopTab id="basic" tab={tab} onClick={handleTabChange} ic="😊" label="기본" />
            <TopTab id="pixel" tab={tab} onClick={handleTabChange} ic={<PixelTabIcon />} label="픽셀" />
            <TopTab id="photo" tab={tab} onClick={handleTabChange} ic="📷" label="내 사진" />
          </div>
        )}

        {showBasicSubs ? (
          <div className="fes-picker-subtabs" role="tablist">
            {BASIC_SUBS.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={basicSub === s.id}
                className={`fes-picker-subtab${basicSub === s.id ? " is-active" : ""}`}
                onClick={() => {
                  setBasicSub(s.id)
                  if (bodyRef.current) bodyRef.current.scrollTop = 0
                }}
              >
                <span className="fes-picker-subtab-ic">{BASIC_SUB_ICONS[s.id] || s.label}</span>
                <span>{BASIC_SUB_LABELS[s.id] || s.aria}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="fes-picker-body" ref={bodyRef}>{bodyContent}</div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={handleFilePicked}
        />
      </section>
    </>
  )
}

function TopTab({ id, tab, onClick, ic, label }) {
  const active = tab === id
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`fes-picker-toptab${active ? " is-active" : ""}`}
      onClick={() => onClick(id)}
    >
      <span className="fes-picker-toptab-ic">{ic}</span>
      <span className="fes-picker-toptab-lbl">{label}</span>
    </button>
  )
}

function PixelTabIcon() {
  const art = useMemo(() => findPixelArt("px-heart"), [])
  if (!art) return <span>픽셀</span>
  return (
    <span
      className="fes-picker-toptab-pixel"
      dangerouslySetInnerHTML={{ __html: pixelArtToSvgString(art, 20) }}
    />
  )
}

function PickerGrid({ items, selected, onPick, empty }) {
  if (!items || items.length === 0) {
    return <div className="fes-picker-empty">{empty}</div>
  }
  return (
    <div className="fes-picker-grid">
      {items.map((item, idx) => {
        const isSel = descriptorEq(selected, item)
        const key = `${item.kind}:${item.value}:${idx}`
        if (item.kind === "pixel") {
          const art = findPixelArt(item.value)
          if (!art) return null
          return (
            <button
              key={key}
              type="button"
              className={`fes-picker-cell fes-picker-pixel-cell${isSel ? " is-selected" : ""}`}
              onClick={() => onPick({ kind: "pixel", value: item.value })}
              aria-label={item.label || art.label}
              title={item.label || art.label}
              dangerouslySetInnerHTML={{ __html: pixelArtToSvgString(art, 32) }}
            />
          )
        }
        if (item.kind === "photo") {
          return (
            <button
              key={key}
              type="button"
              className={`fes-picker-cell fes-picker-photo-cell${isSel ? " is-selected" : ""}`}
              onClick={() => onPick({ kind: "photo", value: item.value })}
              aria-label="사진 이모지"
            >
              <span
                className="fes-picker-photo-crop"
                style={{ backgroundImage: `url(${item.value})` }}
              />
            </button>
          )
        }
        return (
          <button
            key={key}
            type="button"
            className={`fes-picker-cell${isSel ? " is-selected" : ""}`}
            onClick={() => onPick({ kind: "unicode", value: item.value })}
            aria-label={item.label ? `${item.label} ${item.value}` : item.value}
            title={item.label}
          >
            <span>{item.value}</span>
          </button>
        )
      })}
    </div>
  )
}
