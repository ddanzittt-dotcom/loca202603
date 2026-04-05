import { useState, useEffect } from "react"
import { Settings, Upload, MapPin, Moon, Sun, Monitor, Bell, BellOff, Ruler, Download, Trash2, Info, ChevronRight, ExternalLink, LogOut, UserCircle } from "lucide-react"
import { BottomSheet } from "../components/ui"
import { mapThemeGradient } from "../lib/appUtils"
import { redeemInvitationCode } from "../lib/mapService"

function ProfileMapCard({ map, pinFeatures, onClick }) {
  const [start, end] = mapThemeGradient(map.theme)

  return (
    <button className="profile-map-card" type="button" onClick={onClick}>
      <div className="profile-map-card__preview" style={{ "--card-start": start, "--card-end": end }}>
        <div className="profile-map-card__emojis">
          {(pinFeatures.length > 0 ? pinFeatures.map((f) => f.emoji).slice(0, 4) : ["📍"]).map((emoji, i) => (
            <span key={`${emoji}-${i}`}>{emoji}</span>
          ))}
        </div>
      </div>
      <div className="profile-map-card__body">
        <strong>{map.title}</strong>
        <span><MapPin size={12} /> {pinFeatures.length}</span>
      </div>
    </button>
  )
}

const profileEmojis = ["🧭", "😊", "🌟", "🎨", "🌿", "☕", "📸", "🎵", "🏃", "✈️", "🐱", "🌸"]

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
    // system
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
  canImportLocalData = false,
  onImportLocalData,
  onSignOut,
  onPublishOpen,
  onSelectPost,
  onUpdateProfile,
  characterStyle = "m3",
  onChangeCharacter,
  hasB2BAccess = false,
  onB2BAccessChange,
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState("profile") // profile | app | data | info
  const [editName, setEditName] = useState(user.name)
  const [editBio, setEditBio] = useState(user.bio)
  const [editEmoji, setEditEmoji] = useState(user.emoji)
  const [inviteCode, setInviteCode] = useState("")
  const [inviteStatus, setInviteStatus] = useState(null)
  const [inviteError, setInviteError] = useState("")

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

  const handleRedeemCode = async () => {
    if (!inviteCode.trim()) return
    setInviteStatus("loading")
    setInviteError("")
    try {
      const result = await redeemInvitationCode(inviteCode)
      if (result.success) {
        setInviteStatus("success")
        setInviteCode("")
        onB2BAccessChange?.(true)
      } else {
        setInviteStatus("error")
        const messages = {
          invalid_code: "유효하지 않은 코드예요.",
          code_exhausted: "사용 횟수가 초과된 코드예요.",
          already_redeemed: "이미 등록된 코드예요.",
          not_authenticated: "로그인이 필요해요.",
          rate_limited: "시도 횟수를 초과했어요. 1분 후 다시 시도해주세요.",
        }
        setInviteError(messages[result.error] || "코드 등록에 실패했어요.")
      }
    } catch {
      setInviteStatus("error")
      setInviteError("코드 등록에 실패했어요.")
    }
  }

  const handleOpenSettings = () => {
    setEditName(user.name)
    setEditBio(user.bio)
    setEditEmoji(user.emoji)
    setSettingsTab("profile")
    setSettingsOpen(true)
  }

  const handleSaveProfile = () => {
    if (onUpdateProfile) {
      onUpdateProfile({ name: editName, bio: editBio, emoji: editEmoji })
    }
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

  const themeModes = [
    { id: "light", icon: Sun, label: "라이트" },
    { id: "dark", icon: Moon, label: "다크" },
    { id: "system", icon: Monitor, label: "시스템" },
  ]

  const characters = [
    { id: "m3", emoji: "👦", label: "남자", desc: "초록 점퍼 + 배낭" },
    { id: "w1", emoji: "👩", label: "여자", desc: "핑크 원피스 + 긴머리" },
    { id: "m1", emoji: "🧑", label: "캐주얼", desc: "회색 후디 + 스니커즈" },
    { id: "w2", emoji: "👧", label: "스포티", desc: "민트 트레이닝 + 캡" },
  ]

  const settingsTabs = [
    { id: "profile", icon: UserCircle, label: "프로필" },
    { id: "app", icon: Settings, label: "앱 설정" },
    { id: "data", icon: Download, label: "데이터" },
    { id: "info", icon: Info, label: "정보" },
  ]

  return (
    <section className="screen screen--scroll">
      <div className="profile-page">
        <div className="profile-page__topbar">
          <div className="profile-page__header">
            <div><span className="avatar avatar--xl"><span className="avatar__inner">{user.emoji}</span></span></div>
            <div className="profile-page__body">
              <div className="profile-page__name-row">
                <strong>{user.name}</strong>
                <button className="button button--primary profile-page__publish" type="button" onClick={onPublishOpen}>
                  <Upload size={14} /> 지도 올리기
                </button>
              </div>
              <span className="profile-hero__handle">{user.handle}</span>
              <p>{user.bio}</p>
            </div>
          </div>
          <button className="icon-button profile-page__settings" type="button" onClick={handleOpenSettings} aria-label="설정">
            <Settings size={18} />
          </button>
        </div>

        <div className="stats-row profile-stats-row">
          <article className="stat-card"><span className="stat-card__label">내 지도</span><strong className="stat-card__value">{maps.length}</strong></article>
          <article className="stat-card"><span className="stat-card__label">공유</span><strong className="stat-card__value">{shares.length}</strong></article>
          <article className="stat-card"><span className="stat-card__label">팔로우</span><strong className="stat-card__value">{followedCount}</strong></article>
        </div>

        {shares.length > 0 ? (
          <div className="profile-map-grid">
            {shares.map((share) => {
              const map = maps.find((item) => item.id === share.mapId)
              const mapFeatures = features.filter((item) => item.mapId === share.mapId && item.type === "pin")
              if (!map) return null
              return (
                <ProfileMapCard key={share.id} map={map} pinFeatures={mapFeatures} onClick={() => onSelectPost("own", share.id)} />
              )
            })}
          </div>
        ) : (
          <article className="empty-card">
            <strong>아직 프로필에 올린 지도가 없어요.</strong>
            <p>지도를 하나 고르면 프로필에서 바로 보여줄 수 있어요.</p>
          </article>
        )}
      </div>

      <BottomSheet
        open={settingsOpen}
        title="설정"
        onClose={() => setSettingsOpen(false)}
      >
        {/* 설정 탭 네비게이션 */}
        <div className="settings-tabs">
          {settingsTabs.map((tab) => (
            <button
              key={tab.id}
              className={`settings-tab${settingsTab === tab.id ? " is-active" : ""}`}
              type="button"
              onClick={() => setSettingsTab(tab.id)}
            >
              <tab.icon size={16} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="settings-sheet-stack">

          {/* ─── 프로필 탭 ─── */}
          {settingsTab === "profile" ? (
            <>
              <div className="settings-card">
                <h2>프로필 편집</h2>
                <div className="profile-edit-form">
                  <label className="profile-edit-field">
                    <span className="profile-edit-field__label">프로필 이모지</span>
                    <div className="profile-edit-emoji-grid">
                      {profileEmojis.map((em) => (
                        <button
                          key={em}
                          type="button"
                          className={`profile-edit-emoji-btn${editEmoji === em ? " profile-edit-emoji-btn--selected" : ""}`}
                          onClick={() => setEditEmoji(em)}
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  </label>
                  <label className="profile-edit-field">
                    <span className="profile-edit-field__label">이름</span>
                    <input
                      type="text"
                      className="profile-edit-input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="이름을 입력하세요"
                      maxLength={20}
                    />
                  </label>
                  <label className="profile-edit-field">
                    <span className="profile-edit-field__label">소개</span>
                    <textarea
                      className="profile-edit-input profile-edit-textarea"
                      value={editBio}
                      onChange={(e) => setEditBio(e.target.value)}
                      placeholder="소개를 입력하세요"
                      maxLength={80}
                      rows={2}
                    />
                  </label>
                  <button className="button button--primary" type="button" onClick={handleSaveProfile}>
                    저장
                  </button>
                </div>
              </div>

              <div className="settings-card">
                <h2>지도 캐릭터</h2>
                <div className="character-select-row">
                  {characters.map((ch) => (
                    <button
                      key={ch.id}
                      className={`character-select-btn${characterStyle === ch.id ? " is-active" : ""}`}
                      type="button"
                      onClick={() => onChangeCharacter?.(ch.id)}
                    >
                      <span className="character-select-label">{ch.emoji} {ch.label}</span>
                      <span className="character-select-desc">{ch.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {cloudMode ? (
                <div className="settings-card">
                  <h2>계정</h2>
                  <p className="settings-card__email">{cloudEmail || "Supabase 계정"}</p>
                  <div className="settings-card__actions">
                    {canImportLocalData ? (
                      <button className="button button--secondary" type="button" onClick={onImportLocalData}>
                        이 기기 데이터 가져오기
                      </button>
                    ) : null}
                    {onSignOut ? (
                      <button className="button button--ghost" type="button" onClick={onSignOut}>
                        <LogOut size={14} /> 로그아웃
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {/* ─── 앱 설정 탭 ─── */}
          {settingsTab === "app" ? (
            <>
              <div className="settings-card">
                <h2>테마</h2>
                <div className="settings-theme-row">
                  {themeModes.map(({ id, icon: Icon, label }) => (
                    <button
                      key={id}
                      className={`settings-theme-btn${themeMode === id ? " is-active" : ""}`}
                      type="button"
                      onClick={() => handleThemeChange(id)}
                    >
                      <Icon size={18} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-card">
                <h2>알림</h2>
                <label className="settings-toggle-row">
                  <span className="settings-toggle-label">
                    {appSettings.notifications !== false ? <Bell size={16} /> : <BellOff size={16} />}
                    이벤트 알림
                  </span>
                  <input
                    type="checkbox"
                    checked={appSettings.notifications !== false}
                    onChange={(e) => updateSetting("notifications", e.target.checked)}
                  />
                </label>
                <label className="settings-toggle-row">
                  <span className="settings-toggle-label">
                    {appSettings.checkinReminder !== false ? <Bell size={16} /> : <BellOff size={16} />}
                    체크인 리마인더
                  </span>
                  <input
                    type="checkbox"
                    checked={appSettings.checkinReminder !== false}
                    onChange={(e) => updateSetting("checkinReminder", e.target.checked)}
                  />
                </label>
              </div>

              <div className="settings-card">
                <h2>거리 표시</h2>
                <div className="settings-theme-row">
                  <button
                    className={`settings-theme-btn${(appSettings.distanceUnit || "km") === "km" ? " is-active" : ""}`}
                    type="button"
                    onClick={() => updateSetting("distanceUnit", "km")}
                  >
                    <Ruler size={16} />
                    <span>km</span>
                  </button>
                  <button
                    className={`settings-theme-btn${appSettings.distanceUnit === "min" ? " is-active" : ""}`}
                    type="button"
                    onClick={() => updateSetting("distanceUnit", "min")}
                  >
                    <Ruler size={16} />
                    <span>도보 (분)</span>
                  </button>
                </div>
              </div>

              {cloudMode ? (
                <div className="settings-card">
                  <h2>기관/기업 지도</h2>
                  {hasB2BAccess ? (
                    <p style={{ color: "var(--success, #10b981)" }}>이벤트 지도 제작이 활성화되어 있어요.</p>
                  ) : (
                    <>
                      <p>초대코드를 입력하면 이벤트 지도를 만들 수 있어요.</p>
                      <div className="invite-code-form">
                        <input
                          type="text"
                          className="profile-edit-input"
                          value={inviteCode}
                          onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                          placeholder="초대코드 입력"
                          maxLength={30}
                          disabled={inviteStatus === "loading"}
                        />
                        <button
                          className="button button--primary"
                          type="button"
                          onClick={handleRedeemCode}
                          disabled={inviteStatus === "loading" || !inviteCode.trim()}
                        >
                          {inviteStatus === "loading" ? "확인 중..." : "등록"}
                        </button>
                      </div>
                      {inviteStatus === "success" ? (
                        <p className="settings-card__success">코드가 등록되었어요!</p>
                      ) : null}
                      {inviteStatus === "error" ? (
                        <p className="settings-card__error">{inviteError}</p>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </>
          ) : null}

          {/* ─── 데이터 탭 ─── */}
          {settingsTab === "data" ? (
            <>
              <div className="settings-card">
                <h2>데이터 내보내기</h2>
                <p>내 지도, 장소, 프로필 데이터를 JSON 파일로 백업해요.</p>
                <button className="button button--secondary" type="button" onClick={handleExportData} style={{ marginTop: 10 }}>
                  <Download size={14} /> 백업 파일 다운로드
                </button>
              </div>

              <div className="settings-card">
                <h2>캐시 관리</h2>
                <p>오프라인 큐와 세션 캐시를 삭제해요. 저장된 데이터는 유지돼요.</p>
                <button className="button button--danger" type="button" onClick={handleClearCache} style={{ marginTop: 10 }}>
                  <Trash2 size={14} /> 캐시 삭제
                </button>
              </div>
            </>
          ) : null}

          {/* ─── 정보 탭 ─── */}
          {settingsTab === "info" ? (
            <>
              <div className="settings-card">
                <h2>LOCA</h2>
                <p className="settings-card__version">v1.0.0</p>
                <p>로컬 큐레이션 지도 앱</p>
              </div>

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
              </div>
            </>
          ) : null}

        </div>
      </BottomSheet>
    </section>
  )
}
