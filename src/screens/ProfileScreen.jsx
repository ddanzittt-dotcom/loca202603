import { useState } from "react"
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
        <span>📍 {pinFeatures.length}</span>
      </div>
    </button>
  )
}

const profileEmojis = ["🧭", "😊", "🌟", "🎨", "🌿", "☕", "📸", "🎵", "🏃", "✈️", "🐱", "🌸"]

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
  userStats,
  souvenirs = [],
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editName, setEditName] = useState(user.name)
  const [editBio, setEditBio] = useState(user.bio)
  const [editEmoji, setEditEmoji] = useState(user.emoji)
  const [inviteCode, setInviteCode] = useState("")
  const [inviteStatus, setInviteStatus] = useState(null) // null | 'loading' | 'success' | 'error'
  const [inviteError, setInviteError] = useState("")

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
    setSettingsOpen(true)
  }

  const handleSaveProfile = () => {
    if (onUpdateProfile) {
      onUpdateProfile({ name: editName, bio: editBio, emoji: editEmoji })
    }
  }

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
                  지도 올리기
                </button>
              </div>
              <span className="profile-hero__handle">{user.handle}</span>
              <p>{user.bio}</p>
            </div>
          </div>
          <button className="icon-button profile-page__settings" type="button" onClick={handleOpenSettings} aria-label="설정">
            ⚙️
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
            <p>지도를 하나 고르면 앱 배포 후에도 프로필 그리드에서 바로 보여줄 수 있어요.</p>
          </article>
        )}
      </div>

      <BottomSheet
        open={settingsOpen}
        title="설정"
        subtitle="프로필과 계정을 관리할 수 있어요."
        onClose={() => setSettingsOpen(false)}
      >
        <div className="settings-sheet-stack">
          {cloudMode ? (
            <div className="settings-card">
              <h2>계정</h2>
              <p>{cloudEmail ? `${cloudEmail} 계정으로 연결되어 있어요.` : "Supabase 계정과 연결되어 있어요."}</p>
              <div className="settings-card__actions">
                {canImportLocalData ? (
                  <button className="button button--secondary" type="button" onClick={onImportLocalData}>
                    이 기기 데이터 가져오기
                  </button>
                ) : null}
                {onSignOut ? (
                  <button className="button button--ghost" type="button" onClick={onSignOut}>
                    로그아웃
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

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
              <button
                className={`character-select-btn${characterStyle === "m3" ? " is-active" : ""}`}
                type="button"
                onClick={() => onChangeCharacter?.("m3")}
              >
                <span className="character-select-label">👦 남자</span>
                <span className="character-select-desc">초록 점퍼 + 배낭</span>
              </button>
              <button
                className={`character-select-btn${characterStyle === "w1" ? " is-active" : ""}`}
                type="button"
                onClick={() => onChangeCharacter?.("w1")}
              >
                <span className="character-select-label">👩 여자</span>
                <span className="character-select-desc">핑크 원피스 + 긴머리</span>
              </button>
            </div>
          </div>

          {cloudMode ? (
            <div className="settings-card">
              <h2>기관/기업 지도</h2>
              {hasB2BAccess ? (
                <p style={{ color: "#12B981" }}>이벤트 지도 제작이 활성화되어 있어요.</p>
              ) : (
                <>
                  <p>초대코드를 입력하면 이벤트 지도(B2B/B2G)를 만들 수 있어요.</p>
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
                    <p style={{ color: "#12B981", marginTop: 8 }}>코드가 등록되었어요! 이벤트 지도를 만들 수 있어요.</p>
                  ) : null}
                  {inviteStatus === "error" ? (
                    <p style={{ color: "#EF4444", marginTop: 8 }}>{inviteError}</p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

        </div>
      </BottomSheet>
    </section>
  )
}
