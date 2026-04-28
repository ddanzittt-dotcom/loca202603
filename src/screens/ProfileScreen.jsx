import { useState, useEffect, useRef, useMemo } from "react"
import { MapPin, Moon, Sun, Bell, BellOff, Download, Trash2, ChevronRight, ExternalLink, LogOut, Map as MapIcon, ArrowLeft, Link as LinkIcon, Check } from "lucide-react"
import { BottomSheet, EmptyState } from "../components/ui"
import { Avatar } from "../components/Avatar"
import { getAvatarColors, getInitials } from "../lib/avatarUtils"
import { buildLegalDocumentUrl } from "../lib/appUtils"
import { getProfilePlacementState } from "../lib/mapPlacement"

// 미니 지도 카드 (갤러리용)
const MINI_PALETTES = {
  서울: ["#D4836B", "#D99580", "#E0A896", "#E8BCAD"],
  경기: ["#C48B4C", "#D4A06A", "#E0B585", "#ECCAA0"],
  강원: ["#4A7A60", "#649478", "#80AE92", "#9CC8AC"],
  부산: ["#5B7EA5", "#7596B8", "#90AECA", "#ABC6DC"],
  제주: ["#C47A6E", "#D09488", "#DCAEA2", "#E8C8BE"],
}

function ProfileMiniCard({ map, features, onClick }) {
  const pins = features.filter((f) => f.type === "pin")
  const routes = features.filter((f) => f.type === "route")
  const areas = features.filter((f) => f.type === "area")
  const pal = MINI_PALETTES["서울"] // fallback
  const hash = (map.title || "").length % 3

  return (
    <button className="pf__mini-card" type="button" onClick={onClick} style={{ background: pal[3] }}>
      <div className="pf__mini-blob" style={{ left: -8, bottom: -8, width: 60, height: 42, background: `${pal[1]}66` }} />
      <div className="pf__mini-blob" style={{ right: -6 + hash * 3, top: -5, width: 50, height: 35, background: `${pal[3]}80` }} />
      <div className="pf__mini-bottom">
        <p className="pf__mini-title">{map.title}</p>
        <div className="pf__mini-meta">
          <span><MapPin size={7} fill="#fff" stroke="#fff" /> {pins.length}</span>
          {routes.length > 0 ? <span>{routes.length} 경로</span> : null}
          {areas.length > 0 ? <span>{areas.length} 영역</span> : null}
        </div>
      </div>
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

// 프로필 갤러리 빈 상태 (발행 여부에 따라 분기)
// 빈 공간에는 캐릭터 + 안내 문구만 보여주고 CTA 버튼은 숨긴다.
// 프로필에 올리는 진입점은 상단 "+ 지도 올리기" 버튼 하나로 통일.
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
        description="발행한 지도 중에서 보여주고 싶은 것만 프로필에 올릴 수 있어요"
      />
    )
  }

  return (
    <EmptyState
      variant="character"
      characterImage={charImg}
      title="아직 프로필에 올릴 지도가 없어요"
      description="지도를 만들고 발행한 뒤에 프로필에 올릴 수 있어요"
    />
  )
}

// 프로필 올리기 피커 시트
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
    <BottomSheet open={open} title="프로필에 올릴 지도" subtitle="발행한 지도 중 보여주고 싶은 것만 올려보세요" onClose={onClose}>
      <div className="picker-sheet__list">
        {candidates.length === 0 ? (
          <p className="picker-sheet__empty">올릴 수 있는 지도가 없어요</p>
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
          선택한 지도 올리기{selected.size > 0 ? ` (${selected.size})` : ""}
        </button>
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
  cloudMode = false,
  cloudEmail = "",
  characterImage,
  souvenirs = [],
  settingsOpen: settingsOpenProp,
  onSettingsOpenChange,
  onSignOut,
  onPublishOpen,
  onSelectPost,
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
  const [souvenirsPopoverOpen, setSouvenirsPopoverOpen] = useState(false)
  const souvenirsPopoverRef = useRef(null)
  useEffect(() => {
    if (!souvenirsPopoverOpen) return
    const handleDocClick = (e) => {
      if (souvenirsPopoverRef.current && !souvenirsPopoverRef.current.contains(e.target)) {
        setSouvenirsPopoverOpen(false)
      }
    }
    document.addEventListener("pointerdown", handleDocClick)
    return () => document.removeEventListener("pointerdown", handleDocClick)
  }, [souvenirsPopoverOpen])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [curationNoticeSeen, setCurationNoticeSeen] = useState(() => readCurationNoticeSeen())
  const showCurationNotice = !curationNoticeSeen
  const handleDismissCurationNotice = () => {
    writeCurationNoticeSeen()
    setCurationNoticeSeen(true)
  }
  useEffect(() => {
    // 프로필 탭에 첫 진입한 시점에 flag 를 기록한다.
    // dismiss 버튼과 무관하게 1회 이상 본 사용자는 다시 노출하지 않는다.
    if (!curationNoticeSeen) {
      writeCurationNoticeSeen()
    }
  }, [curationNoticeSeen])

  // 프로필 편집 폼
  const [editName, setEditName] = useState("")
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
      onUpdateProfile({
        name: editName.trim() || user.name,
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

  const placeCount = features.length
  const publicMapCount = shares.length

  // 프로필 편집 화면
  if (editOpen) {
    const editInitials = getInitials(editName || user.name)
    const editColors = getAvatarColors(editName || user.name)

    return (
      <section className="pf-edit">
        {/* 헤더 */}
        <div className="pf-edit__header">
          <button className="pf-edit__back" type="button" onClick={() => setEditOpen(false)}>
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

  return (
    <section className="screen screen--scroll">
      <div className="pf">
        {/* 프로필 정보 */}
        <div className="pf__info">
          <Avatar name={user.name} avatarUrl={user.avatarUrl} size={68} className="pf__avatar" />
          <div className="pf__info-body">
            <div className="pf__name-row">
              <span className="pf__name">{user.name}</span>
              <span className="pf__level">Lv.2</span>
            </div>
            <p className="pf__handle">@{user.handle?.replace("@", "") || user.name}</p>
          </div>

          {/* 기념 뱃지 간이 chip (0개면 숨김) — 탭 시 popover 로 목록 표시 */}
          {souvenirs.length > 0 ? (
            <div ref={souvenirsPopoverRef} style={{ position: "relative", alignSelf: "center" }}>
              <button
                type="button"
                aria-label={`기념 뱃지 ${souvenirs.length}개`}
                aria-expanded={souvenirsPopoverOpen}
                onClick={() => setSouvenirsPopoverOpen((v) => !v)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 10px",
                  background: "#FAEEDA",
                  border: "0.5px solid rgba(0,0,0,.06)",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 500,
                  color: "#633806",
                  cursor: "pointer",
                }}
              >
                <span aria-hidden="true">🏆</span>
                <span>{souvenirs.length}</span>
              </button>
              {souvenirsPopoverOpen ? (
                <div
                  role="dialog"
                  aria-label="받은 기념 뱃지"
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 6px)",
                    zIndex: 20,
                    minWidth: 200,
                    maxWidth: 240,
                    background: "#fff",
                    border: "0.5px solid rgba(0,0,0,.08)",
                    borderRadius: 12,
                    padding: 10,
                    boxShadow: "0 10px 24px rgba(0,0,0,.12)",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 500, color: "#666" }}>
                    기념 뱃지
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto" }}>
                    {souvenirs.map((s) => (
                      <li
                        key={s.id || s.souvenir_id || s.souvenir_code}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "4px 6px",
                        }}
                      >
                        <span aria-hidden="true" style={{ fontSize: 18, flexShrink: 0 }}>{s.emoji || "🏆"}</span>
                        <span style={{ fontSize: 12, color: "#1A1A1A", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* 바이오 */}
        {user.bio ? <p className="pf__bio">{user.bio}</p> : null}

        {/* 링크 */}
        {user.link ? (
          <a className="pf__link" href={user.link.startsWith("http") ? user.link : `https://${user.link}`} target="_blank" rel="noopener noreferrer">
            <LinkIcon size={12} />
            <span>{user.link.replace(/^https?:\/\//, "")}</span>
          </a>
        ) : null}

        {/* 통계 */}
        <div className="pf__stats">
          <div className="pf__stat"><p className="pf__stat-value">{publicMapCount}</p><p className="pf__stat-label">공개 지도</p></div>
          <div className="pf__stat-divider" />
          <div className="pf__stat"><p className="pf__stat-value">{placeCount}</p><p className="pf__stat-label">장소</p></div>
        </div>

        {/* 액션 버튼 */}
        <div className="pf__actions">
          <button className="pf__btn pf__btn--primary" type="button" onClick={onPublishOpen}>공개 지도 올리기</button>
          <button className="pf__btn pf__btn--secondary" type="button" onClick={handleOpenEdit}>프로필 편집</button>
        </div>

        {/* 기념 뱃지는 프로필 info 행의 chip + popover 로 간결하게 이동됨. 섹션 형태 렌더 제거. */}

        {/* 프로필 구성 변경 안내 (최초 1회) */}
        {showCurationNotice ? (
          <div
            role="status"
            style={{
              margin: "8px 14px 12px",
              padding: "12px 14px",
              background: "#FFF4EB",
              border: "0.5px solid rgba(0,0,0,.06)",
              borderRadius: 12,
              display: "flex", alignItems: "flex-start", gap: 10,
            }}
          >
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A", margin: 0, lineHeight: 1.4 }}>
                프로필 구성이 바뀌었어요
              </p>
              <p style={{ fontSize: 11, color: "#666", margin: "4px 0 0", lineHeight: 1.4 }}>
                보여주고 싶은 지도만 직접 올려보세요.
              </p>
            </div>
            <button
              type="button"
              aria-label="안내 닫기"
              onClick={handleDismissCurationNotice}
              style={{
                background: "transparent", border: "none", padding: 4,
                fontSize: 14, fontWeight: 500, color: "#888", cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
        ) : null}

        {/* 프로필에 올린 지도 갤러리 */}
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
