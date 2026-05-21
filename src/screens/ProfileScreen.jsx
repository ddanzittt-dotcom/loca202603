import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { MapPin, Moon, Sun, Bell, BellOff, Download, Trash2, ChevronRight, ExternalLink, LogOut, ArrowLeft, Link as LinkIcon, Check, Search, Users, Edit3, Share2 } from "lucide-react"
import { BottomSheet, EmptyState } from "../components/ui"
import { Avatar } from "../components/Avatar"
import { getAvatarColors, getInitials } from "../lib/avatarUtils"
import { buildLegalDocumentUrl } from "../lib/appUtils"
import { getProfilePlacementState } from "../lib/mapPlacement"
import { hasSupabaseEnv } from "../lib/supabase"

function renderMiniMapGrid() {
  const vertical = [40, 80, 120, 160].map((x) => `<line x1="${x}" y1="0" x2="${x}" y2="138"/>`).join("")
  const horizontal = [34, 69, 103].map((y) => `<line x1="0" y1="${y}" x2="200" y2="${y}"/>`).join("")
  return `<g stroke="#DDD0B3" stroke-width="0.6">${vertical}${horizontal}</g>`
}

function generateLocalMiniMapSvg(features) {
  const pins = features.filter((item) => item.type === "pin" && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng)))
  const bg = '<rect width="200" height="138" fill="#EFE7D4"/>'
  const grid = renderMiniMapGrid()

  if (pins.length === 0) {
    return `<svg viewBox="0 0 200 138" xmlns="http://www.w3.org/2000/svg">${bg}${grid}<text x="100" y="73" text-anchor="middle" font-family="Pretendard, sans-serif" font-size="10" font-weight="700" fill="#8B847A">장소 없음</text></svg>`
  }

  const coords = pins.map((pin) => ({ lat: Number(pin.lat), lng: Number(pin.lng) }))
  const minLat = Math.min(...coords.map((p) => p.lat))
  const maxLat = Math.max(...coords.map((p) => p.lat))
  const minLng = Math.min(...coords.map((p) => p.lng))
  const maxLng = Math.max(...coords.map((p) => p.lng))
  const latRange = maxLat - minLat
  const lngRange = maxLng - minLng

  if (latRange < 0.0005 && lngRange < 0.0005) {
    const countLabel = pins.length > 1 ? `<text x="100" y="102" text-anchor="middle" font-family="Pretendard, sans-serif" font-size="9" font-weight="700" fill="#4A453E">${pins.length}곳 한 지점</text>` : ""
    return `<svg viewBox="0 0 200 138" xmlns="http://www.w3.org/2000/svg">${bg}${grid}<circle cx="100" cy="69" r="14" fill="#FF6B35" opacity="0.15"/><circle cx="100" cy="69" r="8" fill="#FF6B35" opacity="0.3"/><circle cx="100" cy="69" r="6" fill="white" stroke="#C44518" stroke-width="1"/><circle cx="100" cy="69" r="3.5" fill="#FF6B35"/>${countLabel}</svg>`
  }

  const padding = 18
  const drawableW = 200 - padding * 2
  const drawableH = 138 - padding * 2
  const scale = Math.min(drawableW / lngRange, drawableH / latRange)
  const usedW = lngRange * scale
  const usedH = latRange * scale
  const offsetX = padding + (drawableW - usedW) / 2
  const offsetY = padding + (drawableH - usedH) / 2
  const points = coords.map((p) => ({
    x: offsetX + (p.lng - minLng) * scale,
    y: offsetY + (maxLat - p.lat) * scale,
  }))
  const radius = pins.length > 20 ? 3 : pins.length > 10 ? 3.5 : 4.5
  const dots = points.map((point) => {
    const x = point.x.toFixed(1)
    const y = point.y.toFixed(1)
    return `<circle cx="${x}" cy="${y}" r="${radius}" fill="white" stroke="#C44518" stroke-width="0.8"/><circle cx="${x}" cy="${y}" r="${(radius * 0.62).toFixed(1)}" fill="#FF6B35"/>`
  }).join("")

  return `<svg viewBox="0 0 200 138" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">${bg}${grid}<g>${dots}</g></svg>`
}

function getMapPrivacyLabel(map) {
  const state = getProfilePlacementState(map)
  if (state.isPublished) return "공개"
  if (map?.visibility === "private" || map?.privacy === "private") return "비공개"
  return "참여 중"
}

function ProfileMiniCard({ map, features, onClick }) {
  const pins = features.filter((f) => f.type === "pin")
  const previewSvg = map.previewSvg || map.preview_svg || generateLocalMiniMapSvg(features)
  const privacyLabel = getMapPrivacyLabel(map)
  const isPrivate = privacyLabel === "비공개"
  const savedCount = map.savedCount || map.saved_count || map.bookmarkCount || map.bookmark_count

  return (
    <button className="pf__mini-card" type="button" onClick={onClick}>
      <span className="pf__mini-map" dangerouslySetInnerHTML={{ __html: previewSvg }} />
      <span className="pf__mini-body">
        <p className="pf__mini-title">{map.title}</p>
        <div className="pf__mini-meta">
          <span>{pins.length} 장소</span>
          <i />
          <span>{isPrivate ? "🔒 " : ""}{privacyLabel}</span>
          {savedCount ? <><i /><span>저장 {savedCount}</span></> : null}
        </div>
      </span>
    </button>
  )
}

// 테마 모드 관리
function getThemeMode() {
  return localStorage.getItem("loca.themeMode") || "light"
}

function applyThemeMode(mode) {
  localStorage.setItem("loca.themeMode", mode)
  const root = document.documentElement
  if (mode === "dark") {
    root.setAttribute("data-theme", "dark")
  } else if (mode === "light") {
    root.removeAttribute("data-theme")
  } else {
    root.removeAttribute("data-theme")
  }
}

// 앱 설정 관리
function getAppSettings() {
  try {
    return JSON.parse(localStorage.getItem("loca.appSettings") || "{}")
  } catch { return {} }
}

function saveAppSettings(settings) {
  localStorage.setItem("loca.appSettings", JSON.stringify(settings))
}

// 프로필 갤러리 빈 상태 (링크 공유 여부에 따라 분기)
// 빈 공간에는 캐릭터 + 안내 문구만 보여주고 CTA 버튼은 숨긴다.
// 프로필 공개 진입점은 상단 액션 버튼 하나로 통일.
function ProfileEmptyGallery({ maps, shares, characterImage }) {
  const hasPublishedNotOnProfile = maps.some((m) => {
    const state = getProfilePlacementState(m)
    return state.isPublished && !shares.some((s) => s.mapId === m.id)
  })

  const charImg = characterImage || "/characters/cloud_lv1.svg"

  if (hasPublishedNotOnProfile) {
    return (
      <EmptyState
        variant="character"
        characterImage={charImg}
        title="프로필을 꾸며볼까요"
        description="링크 공유 중인 지도 중에서 보여주고 싶은 것만 프로필에 공개할 수 있어요"
      />
    )
  }

  return (
    <EmptyState
      variant="character"
      characterImage={charImg}
      title="아직 프로필에 공개한 지도가 없어요"
      description="지도를 만들고 링크 공유를 켠 뒤 프로필에 공개할 수 있어요"
    />
  )
}

// 프로필 공개 피커 시트
function ProfilePickerSheet({ open, maps, shares, features, onClose, onBatchAddToProfile }) {
  const [selected, setSelected] = useState(new Set())

  const candidates = useMemo(() => {
    return maps.filter((m) => {
      const state = getProfilePlacementState(m)
      return state.isPublished && !shares.some((s) => s.mapId === m.id)
    })
  }, [maps, shares])

  const toggle = (mapId) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(mapId)) next.delete(mapId)
      else next.add(mapId)
      return next
    })
  }

  const handleConfirm = () => {
    if (selected.size === 0) return
    onBatchAddToProfile?.([...selected])
    onClose()
  }

  if (!open) return null

  return (
    <BottomSheet open={open} title="프로필에 공개할 지도" subtitle="링크 공유 중인 지도 중 보여주고 싶은 것만 공개해보세요" onClose={onClose}>
      <div className="picker-sheet__list">
        {candidates.length === 0 ? (
          <p className="picker-sheet__empty">공개할 수 있는 지도가 없어요</p>
        ) : (
          candidates.map((map) => {
            const isSelected = selected.has(map.id)
            const pins = features.filter((f) => f.mapId === map.id && f.type === "pin").length
            return (
              <button
                key={map.id}
                type="button"
                className={`picker-sheet__item${isSelected ? " is-selected" : ""}`}
                onClick={() => toggle(map.id)}
              >
                <span className={`picker-sheet__check${isSelected ? " is-checked" : ""}`}>
                  {isSelected ? <Check size={14} color="#fff" /> : null}
                </span>
                <span className="picker-sheet__info">
                  <p className="picker-sheet__title">{map.title}</p>
                  <p className="picker-sheet__meta"><MapPin size={9} /> {pins}개 장소</p>
                </span>
              </button>
            )
          })
        )}
      </div>
      <div className="picker-sheet__footer">
        <button
          type="button"
          className="button button--primary picker-sheet__confirm"
          disabled={selected.size === 0}
          onClick={handleConfirm}
        >
          선택한 지도 공개{selected.size > 0 ? ` (${selected.size})` : ""}
        </button>
      </div>
    </BottomSheet>
  )
}

function normalizeUserResult(profile) {
  return {
    id: profile.id,
    name: profile.name || profile.nickname || "LOCA 사용자",
    handle: profile.handle || (profile.slug ? `@${profile.slug}` : ""),
    bio: profile.bio || "",
    avatarUrl: profile.avatarUrl || profile.avatar_url || null,
  }
}

function ProfileUserSearchSheet({ open, users = [], currentUserId, onClose, onSelectUser }) {
  const [query, setQuery] = useState("")
  const [cloudResults, setCloudResults] = useState([])
  const [searching, setSearching] = useState(false)

  const trimmed = query.trim().toLowerCase()
  const localResults = useMemo(() => {
    if (!trimmed) return []
    return users
      .filter((candidate) => candidate.id !== currentUserId)
      .filter((candidate) => {
        const name = (candidate.name || "").toLowerCase()
        const handle = (candidate.handle || "").toLowerCase()
        const id = (candidate.id || "").toLowerCase()
        return name.includes(trimmed) || handle.includes(trimmed) || id.includes(trimmed)
      })
      .map(normalizeUserResult)
  }, [currentUserId, trimmed, users])

  const searchCloud = useCallback(async (value) => {
    if (!hasSupabaseEnv || !value.trim()) {
      setCloudResults([])
      return
    }
    setSearching(true)
    try {
      const { searchProfiles } = await import("../lib/mapService")
      const results = await searchProfiles(value.trim())
      setCloudResults(results.map(normalizeUserResult))
    } catch {
      setCloudResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    if (!trimmed) {
      setCloudResults([])
      setSearching(false)
      return
    }
    const timer = window.setTimeout(() => searchCloud(trimmed), 300)
    return () => window.clearTimeout(timer)
  }, [open, searchCloud, trimmed])

  const results = hasSupabaseEnv ? cloudResults : localResults
  const hasQuery = trimmed.length > 0

  const handleSelect = (profile) => {
    onSelectUser?.(profile)
    onClose()
  }

  return (
    <BottomSheet
      open={open}
      title="사용자 찾기"
      subtitle="닉네임이나 아이디로 찾아보세요"
      onClose={onClose}
    >
      <div className="profile-search-sheet">
        <label className="profile-search-input">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="닉네임 또는 아이디"
            autoFocus
          />
        </label>

        {!hasQuery ? (
          <div className="profile-search-empty">
            <Users size={20} aria-hidden="true" />
            <strong>가볍게 찾아보세요</strong>
            <span>사용자 찾기는 보조 기능이에요. 내 공개 지도는 아래 갤러리에 그대로 있어요.</span>
          </div>
        ) : searching ? (
          <div className="profile-search-empty">
            <span>검색 중...</span>
          </div>
        ) : results.length > 0 ? (
          <div className="profile-search-results">
            {results.map((result) => (
              <button
                key={result.id}
                className="profile-search-result"
                type="button"
                onClick={() => handleSelect(result)}
              >
                <Avatar name={result.name} avatarUrl={result.avatarUrl} size={38} className="profile-search-result__avatar" />
                <span className="profile-search-result__copy">
                  <strong>{result.name}</strong>
                  <small>{result.handle || "아이디 없음"}</small>
                  {result.bio ? <em>{result.bio}</em> : null}
                </span>
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : (
          <div className="profile-search-empty">
            <Search size={20} aria-hidden="true" />
            <strong>찾는 사용자가 없어요</strong>
            <span>닉네임이나 아이디를 다시 확인해보세요.</span>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}

const CURATION_NOTICE_KEY = "loca.profile_curation_notice_seen"

function readCurationNoticeSeen() {
  try { return window.localStorage?.getItem(CURATION_NOTICE_KEY) === "true" } catch { return false }
}
function writeCurationNoticeSeen() {
  try { window.localStorage?.setItem(CURATION_NOTICE_KEY, "true") } catch { /* noop */ }
}

export function ProfileScreen({
  user,
  shares,
  maps,
  features,
  users = [],
  cloudMode = false,
  cloudEmail = "",
  characterImage,
  settingsOpen: settingsOpenProp,
  onSettingsOpenChange,
  onSignOut,
  onPublishOpen,
  onSelectPost,
  onSelectUser,
  onUpdateProfile,
  onBatchAddToProfile,
  onResetCoachmark,
}) {
  // 설정 시트 상태: 외부(App top-bar)에서 제어 가능하도록 lift 가능.
  // prop 미전달 시 내부 fallback state 사용.
  const [settingsOpenLocal, setSettingsOpenLocal] = useState(false)
  const settingsOpen = settingsOpenProp ?? settingsOpenLocal
  const setSettingsOpen = onSettingsOpenChange ?? setSettingsOpenLocal
  const [editOpen, setEditOpen] = useState(false)
  const [userSearchOpen, setUserSearchOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [curationNoticeSeen, setCurationNoticeSeen] = useState(() => readCurationNoticeSeen())
  useEffect(() => {
    // 프로필 탭에 첫 진입한 시점에 flag 를 기록한다.
    // dismiss 버튼과 무관하게 1회 이상 본 사용자는 다시 노출하지 않는다.
    if (!curationNoticeSeen) {
      writeCurationNoticeSeen()
      setCurationNoticeSeen(true)
    }
  }, [curationNoticeSeen])

  // 프로필 편집 폼
  const [editName, setEditName] = useState("")
  const [editAlias, setEditAlias] = useState("")
  const [editHandle, setEditHandle] = useState("")
  const [editBio, setEditBio] = useState("")
  const [editLink, setEditLink] = useState("")
  const [editAvatarPreview, setEditAvatarPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef(null)

  // 테마 모드
  const [themeMode, setThemeMode] = useState(getThemeMode)

  // 앱 설정
  const [appSettings, setAppSettings] = useState(getAppSettings)

  useEffect(() => {
    applyThemeMode(themeMode)
  }, [themeMode])

  const handleThemeChange = (mode) => {
    setThemeMode(mode)
    applyThemeMode(mode)
  }

  const updateSetting = (key, value) => {
    const next = { ...appSettings, [key]: value }
    setAppSettings(next)
    saveAppSettings(next)
  }

  const openNewWindow = (url) => {
    window.open(url, "_blank", "noopener,noreferrer")
  }

  const handleShareProfile = useCallback(async () => {
    const shareUrl = window.location.href
    const shareTitle = `${user.name || "LOCA"} 프로필`
    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, url: shareUrl })
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl)
        alert("프로필 링크를 복사했어요.")
      }
    } catch {
      // 사용자가 공유 시트를 닫은 경우도 있어 조용히 무시합니다.
    }
  }, [user.name])

  const handleClearCache = () => {
    if (confirm("캐시를 삭제하면 오프라인 데이터가 초기화됩니다. 계속하시겠어요?")) {
      sessionStorage.clear()
      const keysToRemove = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && (key.startsWith("loca.event_queue") || key.startsWith("loca.survey_queue"))) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k))
      alert("캐시가 삭제되었어요.")
    }
  }

  const handleExportData = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      profile: user,
      maps,
      features,
      shares,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `LOCA_backup_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ─── 프로필 편집 ───

  const handleOpenEdit = () => {
    setEditName(user.name || "")
    setEditAlias(user.alias || user.tagline || user.ho || "")
    setEditHandle((user.handle || "").replace(/^@/, ""))
    setEditBio(user.bio || "")
    setEditLink(user.link || "")
    setEditAvatarPreview(user.avatarUrl || null)
    setEditOpen(true)
  }

  // 이미지를 canvas로 리사이즈하여 작은 data URL로 변환
  const resizeImage = (file, maxSize = 256) => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement("canvas")
        let w = img.width
        let h = img.height
        if (w > h) { h = Math.round((h / w) * maxSize); w = maxSize }
        else { w = Math.round((w / h) * maxSize); h = maxSize }
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext("2d")
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL("image/jpeg", 0.85))
      }
      img.onerror = () => resolve(null)
      img.src = URL.createObjectURL(file)
    })
  }

  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      alert("10MB 이하의 이미지만 업로드할 수 있어요.")
      return
    }
    const resized = await resizeImage(file)
    if (resized) {
      setEditAvatarPreview(resized)
    }
  }

  const handleRemovePhoto = () => {
    setEditAvatarPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleSaveProfile = async () => {
    setSaving(true)
    try {
      const alias = editAlias.trim()
      onUpdateProfile({
        name: editName.trim() || user.name,
        alias,
        bio: editBio,
        handle: editHandle,
        link: editLink,
        avatarUrl: editAvatarPreview || null,
      })
      setEditOpen(false)
    } catch (error) {
      console.error("Profile save failed:", error)
      alert("프로필 저장에 실패했어요.")
    } finally {
      setSaving(false)
    }
  }

  const themeModes = [
    { id: "light", icon: Sun, label: "라이트" },
    { id: "dark", icon: Moon, label: "다크" },
  ]

  const publicMapCount = shares.length
  // 레벨/XP 시스템 폐기 (2026-05) — 프로필에서 Lv 뱃지 제거.
  const handleText = (user.handle || user.username || user.name || "loca").replace(/^@/, "")
  const linkHref = user.link ? (user.link.startsWith("http") ? user.link : `https://${user.link}`) : ""
  const linkDisplay = user.link ? user.link.replace(/^https?:\/\//, "") : ""
  const profileInitial = getInitials(user.name).slice(0, 1)

  // 프로필 편집 화면
  if (editOpen) {
    const editInitials = getInitials(editName || user.name)
    const editColors = getAvatarColors(editName || user.name)

    return (
      <section className="pf-edit">
        {/* 헤더 */}
        <div className="pf-edit__header">
          <button className="pf-edit__back" type="button" onClick={() => setEditOpen(false)} aria-label="뒤로가기">
            <ArrowLeft size={20} />
          </button>
          <h1 className="pf-edit__title">프로필 편집</h1>
          <button className="pf-edit__done" type="button" onClick={handleSaveProfile} disabled={saving}>
            {saving ? "저장 중..." : "완료"}
          </button>
        </div>

        {/* 프로필 사진 */}
        <div className="pf-edit__photo">
          <button className="pf-edit__avatar-btn" type="button" onClick={() => fileInputRef.current?.click()}>
            {editAvatarPreview ? (
              <img src={editAvatarPreview} alt="프로필" className="pf-edit__avatar-img" />
            ) : (
              <div className="pf-edit__avatar-fallback" style={{ background: editColors.bg }}>
                <span style={{ color: editColors.text }}>{editInitials}</span>
              </div>
            )}
          </button>
          <div className="pf-edit__photo-actions">
            <button className="pf-edit__photo-btn" type="button" onClick={() => fileInputRef.current?.click()}>
              사진 수정
            </button>
            {editAvatarPreview && (
              <button className="pf-edit__photo-remove" type="button" onClick={handleRemovePhoto}>
                사진 삭제
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handlePhotoSelect}
          />
        </div>

        {/* 입력 필드 */}
        <div className="pf-edit__fields">
          <div className="pf-edit__field">
            <label className="pf-edit__label">이름</label>
            <input
              className="pf-edit__input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="이름"
              maxLength={30}
            />
          </div>
          <div className="pf-edit__field">
            <label className="pf-edit__label">별칭</label>
            <input
              className="pf-edit__input"
              value={editAlias}
              onChange={(e) => setEditAlias(e.target.value)}
              placeholder="예: 안녕 글쓴이"
              maxLength={24}
            />
          </div>
          <div className="pf-edit__field">
            <label className="pf-edit__label">사용자 이름</label>
            <input
              className="pf-edit__input"
              value={editHandle}
              onChange={(e) => setEditHandle(e.target.value.replace(/[^a-zA-Z0-9._-]/g, ""))}
              placeholder="사용자 이름"
              maxLength={30}
            />
          </div>
          <div className="pf-edit__field">
            <label className="pf-edit__label">소개</label>
            <textarea
              className="pf-edit__textarea"
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
              placeholder="소개를 입력하세요"
              rows={3}
              maxLength={150}
            />
            <span className="pf-edit__counter">{editBio.length}/150</span>
          </div>
          <div className="pf-edit__field">
            <label className="pf-edit__label">링크</label>
            <input
              className="pf-edit__input"
              value={editLink}
              onChange={(e) => setEditLink(e.target.value)}
              placeholder="링크 추가"
              type="url"
            />
          </div>
        </div>
      </section>
    )
  }

  // v2: 통계 인라인 — 장소·지도·기록.
  const placeCountStat = features.filter((f) => f?.type === "pin").length
  const mapCountStat = maps.filter((m) => !m?.slug?.startsWith("event-")).length
  const recordCountStat = features.reduce(
    (sum, f) => sum + (Array.isArray(f?.memos) ? f.memos.filter((m) => m?.text?.trim()).length : 0),
    0,
  )
  const aliasText = user.alias || user.tagline || user.ho || ""

  return (
    <section className="screen screen--scroll profile-v4 profile-v4--v2">
      <div className="pf">
        {/* 단일 화이트 카드 — 참고 이미지처럼 첫 화면에 지도 4개가 보이도록 압축 */}
        <article className="pf-v2-card">
          <div className="pf-v2-card__head">
            <div className="pf-v2-card__avatar" aria-hidden="true">
              {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span>{profileInitial}</span>}
            </div>

            <div className="pf-v2-card__identity">
              {aliasText ? (
                <span className="pf-v2-card__tagline">
                  <span aria-hidden="true">✦</span> {aliasText}
                </span>
              ) : null}

              <div className="pf-v2-card__name-row">
                <h1 className="pf-v2-card__name">{user.name}</h1>
                <p className="pf-v2-card__handle">@{handleText}</p>
              </div>
            </div>

            <button className="pf-v2-card__edit" type="button" onClick={handleOpenEdit}>
              <Edit3 size={11} strokeWidth={2.2} />
              편집
            </button>
          </div>

          {user.bio ? <p className="pf-v2-card__bio">{user.bio}</p> : null}

          {user.link ? (
            <a className="pf-v2-card__link" href={linkHref} target="_blank" rel="noopener noreferrer">
              <LinkIcon size={11} strokeWidth={2.1} aria-hidden="true" />
              <span>{linkDisplay}</span>
            </a>
          ) : null}

          <div className="pf-v2-card__foot">
            <div className="pf-v2-card__stats">
              <span><strong className="loca-v2-num">{placeCountStat}</strong>장소</span>
              <span className="pf-v2-card__stats-sep" aria-hidden="true">·</span>
              <span><strong className="loca-v2-num">{mapCountStat}</strong>지도</span>
              <span className="pf-v2-card__stats-sep" aria-hidden="true">·</span>
              <span><strong className="loca-v2-num">{recordCountStat}</strong>기록</span>
            </div>
            <button className="pf-v2-card__share" type="button" onClick={handleShareProfile}>
              <Share2 size={11} strokeWidth={2.1} />
              공유
            </button>
          </div>

          {publicMapCount === 0 ? (
            <button className="pf-v2-card__publish" type="button" onClick={onPublishOpen}>
              + 첫 지도 프로필에 공개하기
            </button>
          ) : null}
        </article>

        <div className="pf__section-head">
          <h2>내 지도 <em>{publicMapCount}</em></h2>
          <span>전체 <ChevronRight size={10} strokeWidth={2.4} aria-hidden="true" /></span>
        </div>

        {shares.length > 0 ? (
          <div className="pf__gallery">
            {shares.map((share) => {
              const map = maps.find((item) => item.id === share.mapId)
              const mapFeatures = features.filter((item) => item.mapId === share.mapId)
              if (!map) return null
              return <ProfileMiniCard key={share.id} map={map} features={mapFeatures} onClick={() => onSelectPost("own", share.id)} />
            })}
          </div>
        ) : (
          <ProfileEmptyGallery
            maps={maps}
            shares={shares}
            characterImage={characterImage}
          />
        )}
      </div>

      <ProfilePickerSheet
        open={pickerOpen}
        maps={maps}
        shares={shares}
        features={features}
        onClose={() => setPickerOpen(false)}
        onBatchAddToProfile={onBatchAddToProfile}
      />

      <ProfileUserSearchSheet
        open={userSearchOpen}
        users={users}
        currentUserId={user.id}
        onClose={() => setUserSearchOpen(false)}
        onSelectUser={onSelectUser}
      />

      <BottomSheet
        open={settingsOpen}
        title="설정"
        onClose={() => setSettingsOpen(false)}
      >
        <div className="settings-sheet-stack">

          {/* 테마 */}
          <div className="settings-card">
            <h2>테마</h2>
            <div className="settings-theme-row">
              {themeModes.map((mode) => (
                <button
                  key={mode.id}
                  className={`settings-theme-btn${themeMode === mode.id ? " is-active" : ""}`}
                  type="button"
                  onClick={() => handleThemeChange(mode.id)}
                >
                  <mode.icon size={18} />
                  <span>{mode.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 알림 */}
          <div className="settings-card">
            <h2>알림</h2>
            <label className="settings-toggle-row">
              <span className="settings-toggle-label">
                {appSettings.notifications !== false ? <Bell size={16} /> : <BellOff size={16} />}
                전체 알림
              </span>
              <input
                type="checkbox"
                checked={appSettings.notifications !== false}
                onChange={(e) => updateSetting("notifications", e.target.checked)}
              />
            </label>
            {appSettings.notifications !== false && (
              <div className="settings-noti-detail">
                {/* 전역 설정은 사용자 실제 기능 중심으로 노출한다. */}
                {/* 행사 참여용 토글(이벤트 공지, 체크인 리마인더, 완주 축하, 행사 임박, 내 댓글 고정)은 */}
                {/* 세션 진입 시점에 표시하는 방향으로 이동하므로 전역 설정에서는 숨긴다. */}
                {/* 저장된 localStorage 값(noti_announcement 등)은 그대로 보존된다. */}
                <label className="settings-toggle-row">
                  <span className="settings-toggle-label">내 지도 공유</span>
                  <input type="checkbox" checked={appSettings.noti_map_viewed !== false} onChange={(e) => updateSetting("noti_map_viewed", e.target.checked)} />
                </label>
                <label className="settings-toggle-row">
                  <span className="settings-toggle-label">내 맵핑 댓글</span>
                  <input type="checkbox" checked={appSettings.noti_feature_comment !== false} onChange={(e) => updateSetting("noti_feature_comment", e.target.checked)} />
                </label>
                <label className="settings-toggle-row">
                  <span className="settings-toggle-label">장소 수정 요청</span>
                  <input type="checkbox" checked={appSettings.noti_feature_update_request !== false} onChange={(e) => updateSetting("noti_feature_update_request", e.target.checked)} />
                </label>
              </div>
            )}
          </div>

          {/* 데이터 */}
          <div className="settings-card">
            <h2>데이터</h2>
            <div className="settings-card__actions">
              <button className="button button--secondary" type="button" onClick={handleExportData}>
                <Download size={14} /> 백업 다운로드
              </button>
              <button className="button button--danger" type="button" onClick={handleClearCache}>
                <Trash2 size={14} /> 캐시 삭제
              </button>
            </div>
          </div>

          {/* 도움말 */}
          <div className="settings-card">
            <h2>도움말</h2>
            <div className="settings-link-list">
              <button
                className="settings-link-row"
                type="button"
                onClick={() => {
                  onResetCoachmark?.()
                  setSettingsOpen(false)
                }}
              >
                <span>에디터 가이드 다시 보기</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* 정보 */}
          <div className="settings-card">
            <div className="settings-link-list">
              <button
                className="settings-link-row"
                type="button"
                onClick={() => openNewWindow(buildLegalDocumentUrl("terms"))}
              >
                <span>이용약관</span>
                <ExternalLink size={14} />
              </button>
              <button
                className="settings-link-row"
                type="button"
                onClick={() => openNewWindow(buildLegalDocumentUrl("privacy"))}
              >
                <span>개인정보처리방침</span>
                <ExternalLink size={14} />
              </button>
              <button className="settings-link-row" type="button" onClick={() => window.open("mailto:danzittt@gmail.com")}>
                <span>문의하기</span>
                <ChevronRight size={14} />
              </button>
            </div>
            <p className="settings-card__version">LOCA v1.0.0</p>
          </div>

          {/* 계정 */}
          {cloudMode && onSignOut ? (
            <div className="settings-card">
              <p className="settings-card__email">{cloudEmail || "Supabase 계정"}</p>
              <button className="button button--ghost" type="button" onClick={onSignOut}>
                <LogOut size={14} /> 로그아웃
              </button>
            </div>
          ) : null}

        </div>
      </BottomSheet>
    </section>
  )
}
