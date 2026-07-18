import { useEffect, useState } from "react"
import { AlertTriangle, Bell, BellOff, ChevronRight, Download, ExternalLink, Eye, KeyRound, LogOut, Moon, RotateCcw, Sun, Trash2, UserX } from "lucide-react"
import { buildLegalDocumentUrl, normalizeSlugInput, isValidSlug, SLUG_MIN, SLUG_MAX } from "../lib/appUtils"
import { checkSlugAvailable } from "../lib/mapService"
import { updatePassword } from "../lib/auth"
import { PixelAvatar, avatarCharOf, avatarCharSentinel } from "../components/PixelAvatar"
import "../styles/account-v2.css"

// 내 정보 관리 — 우상단 계정 버튼 전용 화면 (2026-07 프로필→대시보드 개편 1단계)
// 계정 정보 / 개인정보 수정(구 프로필 편집 시트) / 비밀번호 변경 / 화면·알림 / 데이터 / 약관

const PROFILE_ALIAS_SUGGESTIONS = ["성수 카페 탐험가", "동네 산책러", "주말 미식가", "서울 골목 탐험가"]
const PROFILE_ALIAS_MAX = 15
const PROFILE_BIO_MAX = 80

const PROVIDER_LABELS = {
  email: "이메일",
  google: "Google",
  kakao: "카카오",
  naver: "네이버",
}

// 네이버는 admin.createUser 로 만들어져 app_metadata 가 email 로 남는다 — user_metadata 를 먼저 본다.
function detectLoginProvider(authUser) {
  if (!authUser) return "email"
  const userMeta = authUser.user_metadata || {}
  if (userMeta.provider === "naver" || userMeta.naver_id) return "naver"
  const appMeta = authUser.app_metadata || {}
  const providers = Array.isArray(appMeta.providers) && appMeta.providers.length
    ? appMeta.providers
    : (appMeta.provider ? [appMeta.provider] : [])
  if (providers.includes("google")) return "google"
  if (providers.includes("kakao")) return "kakao"
  if (providers.includes("email")) return "email"
  return providers[0] || "email"
}

function friendlyPasswordError(error) {
  const msg = String(error?.message || "").toLowerCase()
  if (msg.includes("same") || msg.includes("different from the old")) return "지금 쓰는 비밀번호와 다른 비밀번호로 정해주세요."
  if (msg.includes("password") && msg.includes("6")) return "비밀번호는 6자 이상이어야 해요."
  if (msg.includes("network") || msg.includes("fetch")) return "네트워크 연결을 확인해 주세요."
  return "비밀번호를 변경하지 못했어요. 잠시 후 다시 시도해 주세요."
}

function getThemeMode() {
  return localStorage.getItem("loca.themeMode") || "light"
}

function applyThemeMode(mode) {
  localStorage.setItem("loca.themeMode", mode)
  if (mode === "dark") document.documentElement.setAttribute("data-theme", "dark")
  else document.documentElement.removeAttribute("data-theme")
}

function readJsonSetting(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)) } catch { return fallback }
}

export function AccountScreen({
  user,
  authUser,
  cloudMode = false,
  maps = [],
  features = [],
  shares = [],
  canImportLocalData = false,
  onImportLocalData,
  onUpdateProfile,
  onSignOut,
  onDeleteAccount,
  onViewPublicProfile,
  onResetCoachmark,
  showToast,
}) {
  const provider = detectLoginProvider(authUser)
  const canChangePassword = cloudMode && provider === "email"

  // ── 개인정보 폼 ──
  const [editName, setEditName] = useState(user.name || "")
  const [editAlias, setEditAlias] = useState((user.alias || user.tagline || user.ho || "").slice(0, PROFILE_ALIAS_MAX))
  const [editHandle, setEditHandle] = useState((user.handle || "").replace(/^@/, ""))
  const [editBio, setEditBio] = useState((user.bio || "").slice(0, PROFILE_BIO_MAX))
  const [editLink, setEditLink] = useState(user.link || "")
  const [editChar, setEditChar] = useState(() => avatarCharOf(user) || "male")
  const [profileDirty, setProfileDirty] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [handleStatus, setHandleStatus] = useState("idle") // idle|current|checking|available|taken|invalid|error

  // 현재 저장된 아이디(변경 안 하면 형식과 무관하게 그대로 허용).
  const currentHandleRaw = (user.handle || "").replace(/^@/, "")

  // 아이디(slug) 실시간 중복확인 — 값을 실제로 바꿨을 때만.
  useEffect(() => {
    if (!profileDirty || editHandle === currentHandleRaw) { setHandleStatus("current"); return undefined }
    if (!isValidSlug(editHandle)) { setHandleStatus("invalid"); return undefined }
    if (!cloudMode) { setHandleStatus("idle"); return undefined } // 로컬 모드: 중복확인 불가, 형식만 검사
    setHandleStatus("checking")
    const timer = window.setTimeout(async () => {
      try {
        const ok = await checkSlugAvailable(editHandle)
        setHandleStatus(ok ? "available" : "taken")
      } catch {
        setHandleStatus("error")
      }
    }, 350)
    return () => window.clearTimeout(timer)
  }, [editHandle, profileDirty, currentHandleRaw, cloudMode])

  const handleReady = !["checking", "taken", "invalid"].includes(handleStatus)

  const handleHint =
    handleStatus === "invalid" ? `아이디는 영문 소문자·숫자·밑줄(_) ${SLUG_MIN}~${SLUG_MAX}자로 입력해요.`
    : handleStatus === "checking" ? "확인 중..."
    : handleStatus === "taken" ? "이미 사용 중인 아이디예요."
    : handleStatus === "available" ? "사용 가능한 아이디예요."
    : handleStatus === "error" ? "중복 확인을 못 했어요. 저장 시 다시 확인돼요."
    : ""

  const handleHintColor =
    handleStatus === "available" ? "#12B981"
    : (handleStatus === "taken" || handleStatus === "invalid") ? "#EF4444"
    : "#667085"

  // 클라우드 프로필이 뒤늦게 로드되면 편집 전 폼에 반영
  useEffect(() => {
    if (profileDirty) return
    setEditName(user.name || "")
    setEditAlias((user.alias || user.tagline || user.ho || "").slice(0, PROFILE_ALIAS_MAX))
    setEditHandle((user.handle || "").replace(/^@/, ""))
    setEditBio((user.bio || "").slice(0, PROFILE_BIO_MAX))
    setEditLink(user.link || "")
    setEditChar(avatarCharOf(user) || "male")
  }, [profileDirty, user])

  const markDirty = (setter) => (value) => {
    setProfileDirty(true)
    setter(value)
  }
  const setName = markDirty(setEditName)
  const setAlias = markDirty(setEditAlias)
  const setHandle = markDirty(setEditHandle)
  const setBio = markDirty(setEditBio)
  const setLink = markDirty(setEditLink)
  const pickChar = markDirty(setEditChar)

  const saveProfile = async () => {
    setProfileSaving(true)
    try {
      await onUpdateProfile?.({
        name: editName.trim() || user.name,
        alias: editAlias.trim(),
        bio: editBio,
        handle: editHandle,
        link: editLink,
        // 아바타 = 남/여 도트 캐릭터 (센티넬로 저장, 사진 아바타 대체)
        emoji: avatarCharSentinel(editChar),
        avatarUrl: null,
      })
      setProfileDirty(false)
      showToast?.("개인정보를 저장했어요.")
    } finally {
      setProfileSaving(false)
    }
  }

  // ── 비밀번호 변경 ──
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState("")

  const changePassword = async (event) => {
    event.preventDefault()
    setPasswordError("")
    if (newPassword.length < 6) {
      setPasswordError("비밀번호는 6자 이상이어야 해요.")
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("비밀번호 확인이 일치하지 않아요.")
      return
    }
    setPasswordSaving(true)
    try {
      await updatePassword(newPassword)
      setNewPassword("")
      setConfirmPassword("")
      showToast?.("비밀번호를 변경했어요.")
    } catch (error) {
      setPasswordError(friendlyPasswordError(error))
    } finally {
      setPasswordSaving(false)
    }
  }

  // ── 화면·알림 ──
  const [themeMode, setThemeMode] = useState(getThemeMode)
  const [appSettings, setAppSettings] = useState(() => readJsonSetting("loca.appSettings", {}))

  useEffect(() => {
    applyThemeMode(themeMode)
  }, [themeMode])

  const updateSetting = (key, value) => {
    const next = { ...appSettings, [key]: value }
    setAppSettings(next)
    localStorage.setItem("loca.appSettings", JSON.stringify(next))
  }

  // ── 회원탈퇴 ──
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [withdrawAgreed, setWithdrawAgreed] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)

  const confirmWithdraw = async () => {
    if (!withdrawAgreed || withdrawing) return
    if (!confirm("정말 탈퇴할까요? 지도·장소·기록·사진이 모두 삭제되며 되돌릴 수 없어요.")) return
    setWithdrawing(true)
    try {
      await onDeleteAccount?.()
    } finally {
      setWithdrawing(false)
    }
  }

  // ── 데이터 ──
  const clearCache = () => {
    if (!confirm("캐시를 정리할까요? 오프라인 임시 데이터가 초기화될 수 있어요.")) return
    sessionStorage.clear()
    showToast?.("캐시를 정리했어요.")
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
    <section className="screen screen--scroll account-screen">
      <div className="acct">
        <article className="acct-card" aria-label="계정 정보">
          <h2>계정</h2>
          <div className="acct-row">
            <span className="acct-row__label">이메일</span>
            <span className="acct-row__value">{authUser?.email || "-"}</span>
          </div>
          <div className="acct-row">
            <span className="acct-row__label">로그인 방식</span>
            <span className="acct-badge">{PROVIDER_LABELS[provider] || provider}</span>
          </div>
          {onViewPublicProfile ? (
            <button type="button" className="acct-link-row" onClick={onViewPublicProfile}>
              <Eye size={15} aria-hidden="true" />
              내 공개 프로필 보기
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          ) : null}
        </article>

        <article className="acct-card" aria-label="개인정보 수정">
          <h2>개인정보</h2>
          <div className="acct-charpick" role="radiogroup" aria-label="프로필 캐릭터 선택">
            {[{ id: "male", label: "남자" }, { id: "female", label: "여자" }].map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={editChar === opt.id}
                className={`acct-charopt${editChar === opt.id ? " is-on" : ""}`}
                onClick={() => pickChar(opt.id)}
              >
                <span className="acct-charopt__face"><PixelAvatar char={opt.id} /></span>
                <span className="acct-charopt__label">{opt.label}</span>
              </button>
            ))}
          </div>
          <div className="acct-fields">
            <label className="acct-field">
              <span className="acct-field__label">이름</span>
              <input value={editName} onChange={(event) => setName(event.target.value)} maxLength={30} />
            </label>
            <label className="acct-field">
              <span className="acct-field__label-row">
                <span className="acct-field__label">나를 표현하는 별명</span>
                <span className="acct-field__count">{editAlias.length} / {PROFILE_ALIAS_MAX}</span>
              </span>
              <input value={editAlias} onChange={(event) => setAlias(event.target.value)} maxLength={PROFILE_ALIAS_MAX} />
            </label>
            <div className="acct-chips" aria-label="별명 예시">
              {PROFILE_ALIAS_SUGGESTIONS.map((item) => <button key={item} type="button" onClick={() => setAlias(item)}>{item}</button>)}
            </div>
            <label className="acct-field">
              <span className="acct-field__label">아이디</span>
              <input
                value={editHandle}
                onChange={(event) => setHandle(normalizeSlugInput(event.target.value))}
                placeholder="loca_kim"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={SLUG_MAX}
              />
              {handleHint ? <small style={{ fontSize: "0.78rem", color: handleHintColor }}>{handleHint}</small> : null}
            </label>
            <label className="acct-field">
              <span className="acct-field__label-row">
                <span className="acct-field__label">소개</span>
                <span className="acct-field__count">{editBio.length} / {PROFILE_BIO_MAX}</span>
              </span>
              <textarea value={editBio} onChange={(event) => setBio(event.target.value)} rows={3} maxLength={PROFILE_BIO_MAX} />
            </label>
            <label className="acct-field">
              <span className="acct-field__label">외부 링크</span>
              <input value={editLink} onChange={(event) => setLink(event.target.value)} type="url" placeholder="https://" />
            </label>
          </div>
          <button className="acct-save" type="button" onClick={saveProfile} disabled={!profileDirty || profileSaving || !handleReady}>
            {profileSaving ? "저장 중..." : "개인정보 저장"}
          </button>
        </article>

        <article className="acct-card" aria-label="비밀번호 변경">
          <h2>비밀번호</h2>
          {canChangePassword ? (
            <form className="acct-fields" onSubmit={changePassword}>
              <label className="acct-field">
                <span className="acct-field__label">새 비밀번호</span>
                <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="6자 이상" minLength={6} autoComplete="new-password" />
              </label>
              <label className="acct-field">
                <span className="acct-field__label">새 비밀번호 확인</span>
                <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
              </label>
              {passwordError ? <p className="acct-error" role="alert">{passwordError}</p> : null}
              <button className="acct-save" type="submit" disabled={passwordSaving || !newPassword || !confirmPassword}>
                <KeyRound size={14} aria-hidden="true" />
                {passwordSaving ? "변경 중..." : "비밀번호 변경"}
              </button>
            </form>
          ) : (
            <p className="acct-note">
              {cloudMode
                ? `${PROVIDER_LABELS[provider] || "소셜"} 로그인 계정은 비밀번호를 사용하지 않아요.`
                : "로그인하면 비밀번호를 관리할 수 있어요."}
            </p>
          )}
        </article>

        <article className="acct-card" aria-label="화면과 알림 설정">
          <h2>화면 · 알림</h2>
          <div className="acct-theme-row">
            {[{ id: "light", icon: Sun, label: "라이트" }, { id: "dark", icon: Moon, label: "다크" }].map((mode) => (
              <button key={mode.id} className={`acct-theme-btn${themeMode === mode.id ? " is-active" : ""}`} type="button" onClick={() => setThemeMode(mode.id)}>
                <mode.icon size={17} aria-hidden="true" />
                <span>{mode.label}</span>
              </button>
            ))}
          </div>
          <label className="acct-toggle-row">
            <span className="acct-toggle-label">{appSettings.notifications !== false ? <Bell size={15} aria-hidden="true" /> : <BellOff size={15} aria-hidden="true" />}전체 알림</span>
            <input type="checkbox" checked={appSettings.notifications !== false} onChange={(event) => updateSetting("notifications", event.target.checked)} />
          </label>
        </article>

        <article className="acct-card" aria-label="데이터 관리">
          <h2>데이터</h2>
          {canImportLocalData ? (
            <button type="button" className="acct-link-row" onClick={onImportLocalData}><Download size={15} aria-hidden="true" />로컬 데이터 가져오기<ChevronRight size={14} aria-hidden="true" /></button>
          ) : null}
          <button type="button" className="acct-link-row" onClick={exportData}><Download size={15} aria-hidden="true" />데이터 내보내기<ChevronRight size={14} aria-hidden="true" /></button>
          <button type="button" className="acct-link-row" onClick={clearCache}><Trash2 size={15} aria-hidden="true" />캐시 정리<ChevronRight size={14} aria-hidden="true" /></button>
          {onResetCoachmark ? (
            <button type="button" className="acct-link-row" onClick={onResetCoachmark}><RotateCcw size={15} aria-hidden="true" />가이드 다시 보기<ChevronRight size={14} aria-hidden="true" /></button>
          ) : null}
        </article>

        <article className="acct-card" aria-label="약관">
          <h2>약관</h2>
          <button type="button" className="acct-link-row" onClick={() => window.open(buildLegalDocumentUrl("terms"), "_blank", "noopener,noreferrer")}><ExternalLink size={15} aria-hidden="true" />이용약관<ChevronRight size={14} aria-hidden="true" /></button>
          <button type="button" className="acct-link-row" onClick={() => window.open(buildLegalDocumentUrl("privacy"), "_blank", "noopener,noreferrer")}><ExternalLink size={15} aria-hidden="true" />개인정보 처리방침<ChevronRight size={14} aria-hidden="true" /></button>
        </article>

        {onSignOut ? (
          <button type="button" className="acct-signout" onClick={onSignOut}>
            <LogOut size={15} aria-hidden="true" />
            로그아웃
          </button>
        ) : null}

        {onDeleteAccount ? (
          <article className="acct-card acct-card--danger" aria-label="회원탈퇴">
            {!withdrawOpen ? (
              <button type="button" className="acct-withdraw-toggle" onClick={() => setWithdrawOpen(true)}>
                <UserX size={14} aria-hidden="true" />
                회원탈퇴
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            ) : (
              <div className="acct-withdraw">
                <p className="acct-withdraw__title">
                  <AlertTriangle size={15} aria-hidden="true" />
                  탈퇴하면 아래 데이터가 즉시 삭제되고 복구할 수 없어요
                </p>
                <ul className="acct-withdraw__list">
                  <li>내가 만든 지도와 발행된 공유 링크</li>
                  <li>모든 장소 카드와 기록, 사진</li>
                  <li>팔로우 관계, 저장한 지도, 계정 정보</li>
                </ul>
                <p className="acct-withdraw__note">
                  커뮤니티(모두의 지도)에 공개한 기록은 작성자 정보가 지워진 채 남을 수 있어요.
                  기록을 보관하고 싶다면 먼저 위의 "데이터 내보내기"를 이용해 주세요.
                </p>
                <label className="acct-withdraw__agree">
                  <input
                    type="checkbox"
                    checked={withdrawAgreed}
                    onChange={(event) => setWithdrawAgreed(event.target.checked)}
                  />
                  안내를 확인했고, 모든 데이터 삭제에 동의합니다.
                </label>
                <div className="acct-withdraw__actions">
                  <button type="button" className="acct-withdraw__cancel" onClick={() => { setWithdrawOpen(false); setWithdrawAgreed(false) }}>
                    취소
                  </button>
                  <button type="button" className="acct-withdraw__confirm" disabled={!withdrawAgreed || withdrawing} onClick={confirmWithdraw}>
                    {withdrawing ? "탈퇴 처리 중..." : "탈퇴하기"}
                  </button>
                </div>
              </div>
            )}
          </article>
        ) : null}
      </div>
    </section>
  )
}
