import { useState, useEffect, useRef } from "react"
import { Settings, MapPin, Moon, Sun, Monitor, Bell, BellOff, Download, Trash2, ChevronRight, ExternalLink, LogOut, Map as MapIcon, ArrowLeft, Link as LinkIcon } from "lucide-react"
import { BottomSheet } from "../components/ui"

// 아바타 색상 (이름 해시)
function getAvatarColors(name) {
  const palettes = [
    { bg: "#E8BCAD", text: "#993C1D" },
    { bg: "#ECCAA0", text: "#633806" },
    { bg: "#C2D6B8", text: "#085041" },
    { bg: "#ACD6CC", text: "#085041" },
    { bg: "#ABC6DC", text: "#0C447C" },
    { bg: "#C8C9DC", text: "#3D3E6B" },
    { bg: "#E8C8BE", text: "#712B13" },
    { bg: "#9CC8AC", text: "#085041" },
  ]
  let hash = 0
  for (let i = 0; i < (name || "").length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return palettes[Math.abs(hash) % palettes.length]
}

function getInitials(name) {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

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
  const isEvent = map.category === "event"
  const hash = (map.title || "").length % 3

  return (
    <button className="pf__mini-card" type="button" onClick={onClick} style={{ background: pal[3] }}>
      <div className="pf__mini-blob" style={{ left: -8, bottom: -8, width: 60, height: 42, background: `${pal[1]}66` }} />
      <div className="pf__mini-blob" style={{ right: -6 + hash * 3, top: -5, width: 50, height: 35, background: `${pal[3]}80` }} />
      <span className="pf__mini-badge" style={{ background: isEvent ? "#FF6B35" : "#2D4A3E", color: isEvent ? "#fff" : "#E1F5EE" }}>
        {isEvent ? "Event" : "Editor"}
      </span>
      <div className="pf__mini-bottom">
        <p className="pf__mini-title">{map.title}</p>
        <div className="pf__mini-meta">
          <span><MapPin size={7} fill="#fff" stroke="#fff" /> {pins.length}</span>
          {routes.length > 0 ? <span>{routes.length} 경로</span> : null}
          {areas.length > 0 ? <span>{areas.length} 구역</span> : null}
        </div>
      </div>
    </button>
  )
}

// 테마 모드 관리
function getThemeMode() {
  return localStorage.getItem("loca.themeMode") || "system"
}

function applyThemeMode(mode) {
  localStorage.setItem("loca.themeMode", mode)
  const root = document.documentElement
  if (mode === "dark") {
    root.setAttribute("data-theme", "dark")
  } else if (mode === "light") {
    root.removeAttribute("data-theme")
  } else {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      root.setAttribute("data-theme", "dark")
    } else {
      root.removeAttribute("data-theme")
    }
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

export function ProfileScreen({
  user,
  shares,
  maps,
  features,
  followedCount,
  cloudMode = false,
  cloudEmail = "",
  onSignOut,
  onPublishOpen,
  onSelectPost,
  onUpdateProfile,
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

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

  const handleOpenSettings = () => {
    setSettingsOpen(true)
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
    { id: "system", icon: Monitor, label: "시스템" },
  ]

  const initials = getInitials(user.name)
  const avatarColors = getAvatarColors(user.name)
  const placeCount = features.length

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
          <div className="pf__avatar" style={{ background: user.avatarUrl ? "transparent" : avatarColors.bg }}>
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="pf__avatar-img" />
            ) : (
              <span style={{ color: avatarColors.text }}>{initials}</span>
            )}
          </div>
          <div className="pf__info-body">
            <div className="pf__name-row">
              <span className="pf__name">{user.name}</span>
              <span className="pf__level">Lv.2</span>
            </div>
            <p className="pf__handle">@{user.handle?.replace("@", "") || user.name}</p>
          </div>
          <button className="pf__settings-btn" type="button" onClick={handleOpenSettings} aria-label="설정">
            <Settings size={18} color="#2D4A3E" />
          </button>
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
          <div className="pf__stat"><p className="pf__stat-value">{maps.length}</p><p className="pf__stat-label">지도</p></div>
          <div className="pf__stat-divider" />
          <div className="pf__stat"><p className="pf__stat-value">{placeCount}</p><p className="pf__stat-label">장소</p></div>
          <div className="pf__stat-divider" />
          <div className="pf__stat"><p className="pf__stat-value">{user.followers || 0}</p><p className="pf__stat-label">팔로워</p></div>
          <div className="pf__stat-divider" />
          <div className="pf__stat"><p className="pf__stat-value">{followedCount}</p><p className="pf__stat-label">팔로잉</p></div>
        </div>

        {/* 액션 버튼 */}
        <div className="pf__actions">
          <button className="pf__btn pf__btn--primary" type="button" onClick={onPublishOpen}>+ 지도 올리기</button>
          <button className="pf__btn pf__btn--secondary" type="button" onClick={handleOpenEdit}>프로필 편집</button>
        </div>

        {/* 지도 갤러리 */}
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
          <div className="pf__empty">
            <div className="pf__empty-icon"><MapIcon size={20} color="#FF6B35" /></div>
            <p className="pf__empty-title">아직 만든 지도가 없어요</p>
            <p className="pf__empty-desc">첫 번째 지도를 만들어보세요</p>
          </div>
        )}
      </div>

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
                <label className="settings-toggle-row">
                  <span className="settings-toggle-label">이벤트 공지</span>
                  <input type="checkbox" checked={appSettings.noti_announcement !== false} onChange={(e) => updateSetting("noti_announcement", e.target.checked)} />
                </label>
                <label className="settings-toggle-row">
                  <span className="settings-toggle-label">내 맵핑 댓글</span>
                  <input type="checkbox" checked={appSettings.noti_feature_comment !== false} onChange={(e) => updateSetting("noti_feature_comment", e.target.checked)} />
                </label>
                <label className="settings-toggle-row">
                  <span className="settings-toggle-label">내 지도 공유</span>
                  <input type="checkbox" checked={appSettings.noti_map_viewed !== false} onChange={(e) => updateSetting("noti_map_viewed", e.target.checked)} />
                </label>
                <label className="settings-toggle-row">
                  <span className="settings-toggle-label">체크인 리마인더</span>
                  <input type="checkbox" checked={appSettings.noti_checkin_reminder !== false} onChange={(e) => updateSetting("noti_checkin_reminder", e.target.checked)} />
                </label>
                <label className="settings-toggle-row">
                  <span className="settings-toggle-label">완주 축하</span>
                  <input type="checkbox" checked={appSettings.noti_completion !== false} onChange={(e) => updateSetting("noti_completion", e.target.checked)} />
                </label>
                <label className="settings-toggle-row">
                  <span className="settings-toggle-label">내 댓글 고정</span>
                  <input type="checkbox" checked={appSettings.noti_comment_pinned !== false} onChange={(e) => updateSetting("noti_comment_pinned", e.target.checked)} />
                </label>
                <label className="settings-toggle-row">
                  <span className="settings-toggle-label">행사 임박</span>
                  <input type="checkbox" checked={appSettings.noti_event_ending !== false} onChange={(e) => updateSetting("noti_event_ending", e.target.checked)} />
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

          {/* 정보 */}
          <div className="settings-card">
            <div className="settings-link-list">
              <button className="settings-link-row" type="button" onClick={() => window.open("https://loca202603.vercel.app/terms", "_blank")}>
                <span>이용약관</span>
                <ExternalLink size={14} />
              </button>
              <button className="settings-link-row" type="button" onClick={() => window.open("https://loca202603.vercel.app/privacy", "_blank")}>
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
