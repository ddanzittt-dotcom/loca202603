import { Avatar, BottomSheet, MapPreview } from "../ui"

export function UserProfileSheet({ user, userPosts = [], onClose, onSelectPost }) {
  return (
    <BottomSheet
      open={Boolean(user)}
      title={user ? `${user.name} 프로필` : "프로필"}
      subtitle={user ? user.handle : ""}
      onClose={onClose}
    >
      {user ? (
        <div className="community-profile-sheet">
          <div className="profile-hero">
            <Avatar user={user} size="xl" ring={user.verified} />
            <div className="profile-hero__body">
              <div className="profile-hero__title-row">
                <strong>{user.name}</strong>
                {user.verified ? <span className="verified-badge">?</span> : null}
              </div>
              <span className="profile-hero__handle">{user.handle}</span>
              <p>{user.bio}</p>
            </div>
          </div>
          <div className="profile-grid">
            {userPosts.length > 0 ? (
              userPosts.map((post) => (
                <button key={post.id} className="profile-grid__item" type="button" onClick={() => onSelectPost({ source: "community", id: post.id })}>
                  <MapPreview title={post.title} emojis={post.emojis} placeCount={post.placeCount} gradient={post.gradient} variant="grid" />
                </button>
              ))
            ) : (
              <p className="profile-grid__empty">아직 공개한 지도가 없어요.</p>
            )}
          </div>
        </div>
      ) : null}
    </BottomSheet>
  )
}
