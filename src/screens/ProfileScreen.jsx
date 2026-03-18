import { useState } from "react"
import { BottomSheet } from "../components/ui"
import { mapThemeGradient } from "../lib/appUtils"

const coverImages = {
  "map-seongsu": "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=300&fit=crop",
  "map-jeju": "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&h=300&fit=crop",
}

const suggestedSettings = [
  { id: "account", icon: "👤", title: "계정 및 프로필", description: "이름, 소개, 프로필 이미지, 공개 범위를 관리해요." },
  { id: "notifications", icon: "🔔", title: "알림", description: "팔로우, 댓글, 메모, 공유 반응 알림을 조정해요." },
  { id: "map", icon: "🗺️", title: "지도 및 편집 환경", description: "기본 지도 스타일, 라벨 표시, 위치 권한을 다뤄요." },
  { id: "privacy", icon: "🔒", title: "공개 범위 및 공유", description: "지도 공개 여부, 링크 공유, 프로필 노출 범위를 정해요." },
  { id: "support", icon: "🛠️", title: "도움말 및 앱 정보", description: "문의, 약관, 버전 정보, 업데이트 안내를 모아둬요." },
]

function ProfileMapCard({ map, pinFeatures, onClick }) {
  const [start, end] = mapThemeGradient(map.theme)
  const coverUrl = coverImages[map.id]

  return (
    <button className="profile-map-card" type="button" onClick={onClick}>
      <div className="profile-map-card__preview" style={{ "--card-start": start, "--card-end": end }}>
        {coverUrl ? (
          <img className="profile-map-card__cover" src={coverUrl} alt={map.title} />
        ) : (
          <div className="profile-map-card__emojis">
            {(pinFeatures.length > 0 ? pinFeatures.map((f) => f.emoji).slice(0, 4) : ["📍"]).map((emoji, i) => (
              <span key={`${emoji}-${i}`}>{emoji}</span>
            ))}
          </div>
        )}
      </div>
      <div className="profile-map-card__body">
        <strong>{map.title}</strong>
        <span>📍 {pinFeatures.length}</span>
      </div>
    </button>
  )
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
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)

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
          <button className="icon-button profile-page__settings" type="button" onClick={() => setSettingsOpen(true)} aria-label="설정">
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
        subtitle="프로필 설정에는 이런 카테고리 구성이 잘 맞아요."
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
            <h2>추천 카테고리</h2>
            <p>지금 단계에서는 프로필 액션보다 계정, 공개 범위, 알림 같은 기본 설정을 우선 두는 편이 자연스러워요.</p>
            <div className="settings-category-list">
              {suggestedSettings.map((item) => (
                <article className="settings-category-card" key={item.id}>
                  <span className="settings-category-card__icon" aria-hidden="true">{item.icon}</span>
                  <span className="settings-category-card__body">
                    <strong>{item.title}</strong>
                    <small>{item.description}</small>
                  </span>
                </article>
              ))}
            </div>
          </div>

          <div className="settings-card settings-card--muted">
            <h2>분리 추천</h2>
            <p>앱 설치, 백업/복원, 샘플 복원 같은 운영성 기능은 일반 사용자 설정과 분리해서 `앱 정보` 또는 별도 `관리 도구` 화면으로 빼는 편이 더 깔끔해요.</p>
          </div>
        </div>
      </BottomSheet>
    </section>
  )
}
