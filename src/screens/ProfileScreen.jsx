import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Bell, BellOff, Check, ChevronRight, Download, Edit3, ExternalLink, Link as LinkIcon, LogOut, MapPin, Moon, Plus, Search, Settings, Sun, Trash2, Users } from "lucide-react"
import { BottomSheet, EmptyState } from "../components/ui"
import { Avatar } from "../components/Avatar"
import { BrandLogo } from "../components/BrandLogo"
import { getAvatarColors, getInitials } from "../lib/avatarUtils"
import { buildLegalDocumentUrl } from "../lib/appUtils"
import { getProfilePlacementState } from "../lib/mapPlacement"
import { MapCoverArt } from "../components/MapCoverArt"
import { hasSupabaseEnv } from "../lib/supabase"

const PROFILE_ALIAS_SUGGESTIONS = ["성수 카페 탐험가", "동네 산책러", "주말 미식가", "서울 골목 탐험가"]
const PROFILE_ALIAS_MAX = 15
const PROFILE_BIO_MAX = 80
const CURATION_NOTICE_KEY = "loca.profile_curation_notice_seen"

function groupFeaturesByMapId(features = []) {
  return features.reduce((acc, feature) => {
    const mapId = feature?.mapId
    if (!mapId) return acc
    const list = acc.get(mapId)
    if (list) list.push(feature)
    else acc.set(mapId, [feature])
    return acc
  }, new Map())
}

function readJsonSetting(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)) } catch { return fallback }
}

function getThemeMode() {
  return localStorage.getItem("loca.themeMode") || "light"
}

function applyThemeMode(mode) {
  localStorage.setItem("loca.themeMode", mode)
  if (mode === "dark") document.documentElement.setAttribute("data-theme", "dark")
  else document.documentElement.removeAttribute("data-theme")
}

function readCurationNoticeSeen() {
  try { return window.localStorage?.getItem(CURATION_NOTICE_KEY) === "true" } catch { return false }
}

function writeCurationNoticeSeen() {
  try { window.localStorage?.setItem(CURATION_NOTICE_KEY, "true") } catch { /* noop */ }
}

function getMapPrivacyLabel(map) {
  const state = getProfilePlacementState(map)
  if (state.isPublished) return "공개"
  if (map?.visibility === "private" || map?.privacy === "private") return "비공개"
  return "참여 중"
}

function ProfileMiniCard({ map, features, onClick }) {
  const pins = features.filter((item) => item.type === "pin")
  const privacyLabel = getMapPrivacyLabel(map)
  const savedCount = map.savedCount || map.saved_count || map.bookmarkCount || map.bookmark_count

  return (
    <button className="pf__mini-card" type="button" onClick={onClick}>
      <span className="pf__mini-map">
        <MapCoverArt map={map} features={features} />
      </span>
      <span className="pf__mini-body">
        <p className="pf__mini-title">{map.title}</p>
        <div className="pf__mini-meta">
          <span>{pins.length} 장소</span>
          <i />
          <span>{privacyLabel}</span>
          {savedCount ? <><i /><span>저장 {savedCount}</span></> : null}
        </div>
      </span>
    </button>
  )
}

function ProfileEmptyGallery({ maps, shares, characterImage }) {
  const shareMapIds = new Set(shares.map((share) => share.mapId))
  const hasPublishedNotOnProfile = maps.some((map) => {
    const state = getProfilePlacementState(map)
    return state.isPublished && !shareMapIds.has(map.id)
  })

  return (
    <EmptyState
      variant="character"
      characterImage={characterImage || "/characters/cloud_lv1.svg"}
      title={hasPublishedNotOnProfile ? "프로필을 꾸며볼까요" : "아직 프로필에 공개한 지도가 없어요"}
      description={hasPublishedNotOnProfile ? "공유 중인 지도 중 보여주고 싶은 것만 공개할 수 있어요" : "지도를 만들고 링크 공유를 켠 뒤 프로필에 공개할 수 있어요"}
    />
  )
}

function ProfilePickerSheet({ open, maps, shares, featuresByMapId, onClose, onBatchAddToProfile }) {
  const [selected, setSelected] = useState(new Set())
  const shareMapIds = useMemo(() => new Set(shares.map((share) => share.mapId)), [shares])
  const candidates = useMemo(() => maps.filter((map) => {
    return getProfilePlacementState(map).isPublished && !shareMapIds.has(map.id)
  }), [maps, shareMapIds])

  const toggle = (mapId) => {
    setSelected((current) => {
      const next = new Set(current)
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
        {candidates.length === 0 ? <p className="picker-sheet__empty">공개할 수 있는 지도가 없어요</p> : null}
        {candidates.map((map) => {
          const isSelected = selected.has(map.id)
          const pins = (featuresByMapId.get(map.id) || []).filter((feature) => feature.type === "pin").length
          return (
            <button key={map.id} type="button" className={`picker-sheet__item${isSelected ? " is-selected" : ""}`} onClick={() => toggle(map.id)}>
              <span className={`picker-sheet__check${isSelected ? " is-checked" : ""}`}>
                {isSelected ? <Check size={14} color="#fff" /> : null}
              </span>
              <span className="picker-sheet__info">
                <p className="picker-sheet__title">{map.title}</p>
                <p className="picker-sheet__meta"><MapPin size={9} /> {pins}개 장소</p>
              </span>
            </button>
          )
        })}
      </div>
      <div className="picker-sheet__footer">
        <button type="button" className="button button--primary picker-sheet__confirm" disabled={selected.size === 0} onClick={handleConfirm}>
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
    if (!open) return undefined
    const timer = window.setTimeout(() => searchCloud(query), 300)
    return () => window.clearTimeout(timer)
  }, [open, query, searchCloud])

  const mergedResults = useMemo(() => {
    const seen = new Set()
    return [...localResults, ...cloudResults].filter((profile) => {
      if (!profile?.id || profile.id === currentUserId || seen.has(profile.id)) return false
      seen.add(profile.id)
      return true
    })
  }, [cloudResults, currentUserId, localResults])

  if (!open) return null

  return (
    <BottomSheet open={open} title="사용자 찾기" subtitle="닉네임이나 아이디로 찾아보세요" onClose={onClose}>
      <div className="profile-search-sheet">
        <label className="profile-search-sheet__input">
          <Search size={15} aria-hidden="true" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="닉네임 검색" />
        </label>
        <div className="profile-search-sheet__list">
          {searching ? <p className="profile-search-sheet__empty">검색 중...</p> : null}
          {!searching && mergedResults.length === 0 ? <p className="profile-search-sheet__empty">찾는 사용자가 없어요</p> : null}
          {mergedResults.map((profile) => (
            <button key={profile.id} type="button" className="profile-search-sheet__item" onClick={() => { onSelectUser?.(profile); onClose?.() }}>
              <Avatar user={profile} size={34} />
              <span>
                <strong>{profile.name}</strong>
                {profile.handle ? <em>{profile.handle}</em> : null}
              </span>
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </BottomSheet>
  )
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
  canImportLocalData = false,
  onImportLocalData,
  onSignOut,
  onPublishOpen,
  onSelectPost,
  onSelectUser,
  onUpdateProfile,
  onBatchAddToProfile,
  onNavigateToMaps,
  onResetCoachmark,
}) {
  const [settingsOpenLocal, setSettingsOpenLocal] = useState(false)
  const settingsOpen = settingsOpenProp ?? settingsOpenLocal
  const setSettingsOpen = onSettingsOpenChange ?? setSettingsOpenLocal
  const [editOpen, setEditOpen] = useState(false)
  const [userSearchOpen, setUserSearchOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [curationNoticeSeen, setCurationNoticeSeen] = useState(() => readCurationNoticeSeen())
  const [editName, setEditName] = useState("")
  const [editAlias, setEditAlias] = useState("")
  const [editHandle, setEditHandle] = useState("")
  const [editBio, setEditBio] = useState("")
  const [editLink, setEditLink] = useState("")
  const [editAvatarPreview, setEditAvatarPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [themeMode, setThemeMode] = useState(getThemeMode)
  const [appSettings, setAppSettings] = useState(() => readJsonSetting("loca.appSettings", {}))
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!curationNoticeSeen) {
      writeCurationNoticeSeen()
      setCurationNoticeSeen(true)
    }
  }, [curationNoticeSeen])

  useEffect(() => {
    applyThemeMode(themeMode)
  }, [themeMode])

  const featuresByMapId = useMemo(() => groupFeaturesByMapId(features), [features])
  const mapById = useMemo(() => new Map(maps.map((map) => [map.id, map])), [maps])
  const galleryItems = useMemo(() => shares
    .map((share) => {
      const map = mapById.get(share.mapId)
      if (!map) return null
      return { share, map, features: featuresByMapId.get(share.mapId) || [] }
    })
    .filter(Boolean), [featuresByMapId, mapById, shares])
  const stats = useMemo(() => ({
    placeCount: features.filter((feature) => feature?.type === "pin").length,
    mapCount: maps.length,
    recordCount: features.reduce((sum, feature) => sum + (Array.isArray(feature?.memos) ? feature.memos.filter((memo) => memo?.text?.trim()).length : 0), 0),
  }), [features, maps])

  const aliasText = user.alias || user.tagline || user.ho || ""
  const handleText = (user.handle || user.username || user.name || "loca").replace(/^@/, "")
  const linkHref = user.link ? (user.link.startsWith("http") ? user.link : `https://${user.link}`) : ""
  const linkDisplay = user.link ? user.link.replace(/^https?:\/\//, "") : ""
  const profileInitial = getInitials(user.name).slice(0, 1)
  const editInitials = getInitials(editName || user.name).slice(0, 1)
  const editColors = getAvatarColors(editName || user.name)

  const openEdit = () => {
    setEditName(user.name || "")
    setEditAlias((user.alias || user.tagline || user.ho || "").slice(0, PROFILE_ALIAS_MAX))
    setEditHandle((user.handle || "").replace(/^@/, ""))
    setEditBio((user.bio || "").slice(0, PROFILE_BIO_MAX))
    setEditLink(user.link || "")
    setEditAvatarPreview(user.avatarUrl || null)
    setEditOpen(true)
  }

  const resizeImage = (file, maxSize = 256) => new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement("canvas")
      let width = img.width
      let height = img.height
      if (width > height) { height = Math.round((height / width) * maxSize); width = maxSize }
      else { width = Math.round((width / height) * maxSize); height = maxSize }
      canvas.width = width
      canvas.height = height
      canvas.getContext("2d")?.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL("image/jpeg", 0.85))
    }
    img.onerror = () => resolve(null)
    img.src = URL.createObjectURL(file)
  })

  const handlePhotoSelect = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      alert("10MB 이하의 이미지만 업로드할 수 있어요.")
      return
    }
    const resized = await resizeImage(file)
    if (resized) setEditAvatarPreview(resized)
  }

  const saveProfile = async () => {
    setSaving(true)
    try {
      await onUpdateProfile?.({
        name: editName.trim() || user.name,
        alias: editAlias.trim(),
        bio: editBio,
        handle: editHandle,
        link: editLink,
        avatarUrl: editAvatarPreview || null,
      })
      setEditOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const updateSetting = (key, value) => {
    const next = { ...appSettings, [key]: value }
    setAppSettings(next)
    localStorage.setItem("loca.appSettings", JSON.stringify(next))
  }

  const clearCache = () => {
    if (!confirm("캐시를 정리할까요? 오프라인 임시 데이터가 초기화될 수 있어요.")) return
    sessionStorage.clear()
    alert("캐시를 정리했어요.")
  }

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), profile: user, maps, features, shares }, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `LOCA_backup_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="screen screen--scroll profile-v4 profile-v4--v2">
      <header className="profile-v2__header">
        <BrandLogo className="profile-v2__brand" dotClassName="profile-v2__brand-dot" />
        <button type="button" className="profile-v2__settings" aria-label="설정" title="설정" onClick={() => setSettingsOpen(true)}>
          <Settings size={17} strokeWidth={2} aria-hidden="true" />
        </button>
      </header>

      <div className="pf">
        <article className="pf-v2-card">
          <div className="pf-v2-card__head">
            <div className="pf-v2-card__avatar" aria-hidden="true">
              {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span>{profileInitial}</span>}
            </div>
            <div className="pf-v2-card__identity">
              {aliasText ? <span className="pf-v2-card__tagline"><span aria-hidden="true">·</span> {aliasText}</span> : null}
              <div className="pf-v2-card__name-row">
                <h1 className="pf-v2-card__name">{user.name}</h1>
                <p className="pf-v2-card__handle">@{handleText}</p>
              </div>
            </div>
            <button className="pf-v2-card__edit" type="button" onClick={openEdit}>
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
              <span><strong className="loca-v2-num">{stats.placeCount}</strong>장소</span>
              <span className="pf-v2-card__stats-sep" aria-hidden="true">·</span>
              <span><strong className="loca-v2-num">{stats.mapCount}</strong>지도</span>
              <span className="pf-v2-card__stats-sep" aria-hidden="true">·</span>
              <span><strong className="loca-v2-num">{stats.recordCount}</strong>기록</span>
            </div>
          </div>

          {shares.length === 0 ? (
            <button className="pf-v2-card__publish" type="button" onClick={onPublishOpen}>
              + 첫 지도 프로필에 공개하기
            </button>
          ) : null}
        </article>

        <div className="pf__section-head">
          <h2>내 지도<em>{shares.length}</em></h2>
          <button className="pf__map-upload" type="button" onClick={() => setPickerOpen(true)} aria-label="프로필에 공개할 지도 올리기">
            <Plus size={11} strokeWidth={2.4} aria-hidden="true" />
            지도 올리기
          </button>
        </div>

        {galleryItems.length > 0 ? (
          <div className="pf__gallery">
            {galleryItems.map((item) => (
              <ProfileMiniCard key={item.share.id} map={item.map} features={item.features} onClick={() => onSelectPost?.("own", item.share.id)} />
            ))}
          </div>
        ) : (
          <ProfileEmptyGallery maps={maps} shares={shares} characterImage={characterImage} />
        )}
      </div>

      {editOpen ? (
        <div className="pf-edit-banner" role="presentation" onClick={() => setEditOpen(false)}>
          <section className="pf-edit-banner__sheet" role="dialog" aria-modal="true" aria-label="프로필 편집" onClick={(event) => event.stopPropagation()}>
            <span className="pf-edit-banner__handle" aria-hidden="true" />
            <div className="pf-edit-banner__head">
              <h1>프로필 편집</h1>
              <button className="pf-edit-banner__save" type="button" onClick={saveProfile} disabled={saving}>{saving ? "저장 중..." : "저장"}</button>
            </div>
            <div className="pf-edit-banner__avatar-wrap">
              <button className="pf-edit-banner__avatar" type="button" onClick={() => fileInputRef.current?.click()} aria-label="프로필 사진 수정">
                {editAvatarPreview ? <img src={editAvatarPreview} alt="프로필" /> : <span style={{ background: editColors.bg, color: editColors.text }}>{editInitials}</span>}
                <i aria-hidden="true"><Edit3 size={13} strokeWidth={2.4} /></i>
              </button>
              {editAvatarPreview ? <button className="pf-edit-banner__remove-photo" type="button" onClick={() => setEditAvatarPreview(null)}>사진 제거</button> : null}
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handlePhotoSelect} />
            </div>
            <div className="pf-edit-banner__fields">
              <label className="pf-edit-banner__field"><span className="pf-edit-banner__label">이름</span><input value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={30} /></label>
              <label className="pf-edit-banner__field">
                <span className="pf-edit-banner__label-row"><span className="pf-edit-banner__label">나를 표현하는 별명</span><span className="pf-edit-banner__count">{editAlias.length} / {PROFILE_ALIAS_MAX}</span></span>
                <input value={editAlias} onChange={(event) => setEditAlias(event.target.value)} maxLength={PROFILE_ALIAS_MAX} />
              </label>
              <div className="pf-edit-banner__chips" aria-label="별명 예시">
                {PROFILE_ALIAS_SUGGESTIONS.map((item) => <button key={item} type="button" onClick={() => setEditAlias(item)}>{item}</button>)}
              </div>
              <label className="pf-edit-banner__field"><span className="pf-edit-banner__label">아이디</span><input value={editHandle} onChange={(event) => setEditHandle(event.target.value)} /></label>
              <label className="pf-edit-banner__field">
                <span className="pf-edit-banner__label-row"><span className="pf-edit-banner__label">소개</span><span className="pf-edit-banner__count">{editBio.length} / {PROFILE_BIO_MAX}</span></span>
                <textarea value={editBio} onChange={(event) => setEditBio(event.target.value)} rows={3} maxLength={PROFILE_BIO_MAX} />
              </label>
              <label className="pf-edit-banner__field"><span className="pf-edit-banner__label">외부 링크</span><input value={editLink} onChange={(event) => setEditLink(event.target.value)} type="url" /></label>
            </div>
          </section>
        </div>
      ) : null}

      <ProfilePickerSheet open={pickerOpen} maps={maps} shares={shares} featuresByMapId={featuresByMapId} onClose={() => setPickerOpen(false)} onBatchAddToProfile={onBatchAddToProfile} />
      <ProfileUserSearchSheet open={userSearchOpen} users={users} currentUserId={user.id} onClose={() => setUserSearchOpen(false)} onSelectUser={onSelectUser} />

      <BottomSheet open={settingsOpen} title="설정" onClose={() => setSettingsOpen(false)}>
        <div className="settings-sheet-stack">
          <div className="settings-card">
            <h2>테마</h2>
            <div className="settings-theme-row">
              {[{ id: "light", icon: Sun, label: "라이트" }, { id: "dark", icon: Moon, label: "다크" }].map((mode) => (
                <button key={mode.id} className={`settings-theme-btn${themeMode === mode.id ? " is-active" : ""}`} type="button" onClick={() => setThemeMode(mode.id)}>
                  <mode.icon size={18} />
                  <span>{mode.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="settings-card">
            <h2>알림</h2>
            <label className="settings-toggle-row">
              <span className="settings-toggle-label">{appSettings.notifications !== false ? <Bell size={16} /> : <BellOff size={16} />}전체 알림</span>
              <input type="checkbox" checked={appSettings.notifications !== false} onChange={(event) => updateSetting("notifications", event.target.checked)} />
            </label>
          </div>
          <div className="settings-card">
            <h2>계정</h2>
            {cloudMode ? <p className="settings-account-email">{cloudEmail}</p> : null}
            <button type="button" className="settings-row-button" onClick={() => setUserSearchOpen(true)}><Users size={16} />사용자 찾기<ChevronRight size={14} /></button>
            {canImportLocalData ? <button type="button" className="settings-row-button" onClick={onImportLocalData}><Download size={16} />로컬 데이터 가져오기<ChevronRight size={14} /></button> : null}
            {onSignOut ? <button type="button" className="settings-row-button" onClick={onSignOut}><LogOut size={16} />로그아웃<ChevronRight size={14} /></button> : null}
          </div>
          <div className="settings-card">
            <h2>관리</h2>
            <button type="button" className="settings-row-button" onClick={exportData}><Download size={16} />데이터 내보내기<ChevronRight size={14} /></button>
            <button type="button" className="settings-row-button" onClick={clearCache}><Trash2 size={16} />캐시 정리<ChevronRight size={14} /></button>
            {onResetCoachmark ? <button type="button" className="settings-row-button" onClick={onResetCoachmark}><Check size={16} />가이드 다시 보기<ChevronRight size={14} /></button> : null}
            {onNavigateToMaps ? <button type="button" className="settings-row-button" onClick={onNavigateToMaps}><MapPin size={16} />내 지도 열기<ChevronRight size={14} /></button> : null}
          </div>
          <div className="settings-card">
            <h2>약관</h2>
            <button type="button" className="settings-row-button" onClick={() => window.open(buildLegalDocumentUrl("terms"), "_blank", "noopener,noreferrer")}><ExternalLink size={16} />이용약관<ChevronRight size={14} /></button>
            <button type="button" className="settings-row-button" onClick={() => window.open(buildLegalDocumentUrl("privacy"), "_blank", "noopener,noreferrer")}><ExternalLink size={16} />개인정보 처리방침<ChevronRight size={14} /></button>
          </div>
        </div>
      </BottomSheet>
    </section>
  )
}
