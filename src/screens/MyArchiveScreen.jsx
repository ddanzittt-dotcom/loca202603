import { useState } from "react"
import { Bell, Download, Plus } from "lucide-react"
import { MapsListScreen } from "./MapsListScreen"
import { PlacesScreen } from "./PlacesScreen"

export function MyArchiveScreen({
  maps,
  features,
  shares = [],
  characterImage,
  onCreate,
  onImport,
  onEdit,
  onOpen,
  onDelete,
  onShare,
  onPublish,
  onUnpublish,
  onAddToProfile,
  onRemoveFromProfile,
  onOpenFeature,
  onCreateRecord,
  onOpenNotifications,
  hasUnread = false,
  loading = false,
}) {
  const [archiveView, setArchiveView] = useState("maps")

  return (
    <section className="screen screen--scroll maps-library-screen">
      <div className="archive-head">
        <h1 className="archive-head__title">내 지도</h1>
        <div className="archive-head__actions" aria-label="내 지도 액션">
          <button
            type="button"
            className="archive-head__icon"
            aria-label="지도 가져오기"
            title="지도 가져오기"
            onClick={onImport}
          >
            <Download size={16} strokeWidth={1.8} />
          </button>
          {archiveView === "maps" ? (
            <button
              type="button"
              className="archive-head__icon archive-head__icon--primary"
              aria-label="새 지도 만들기"
              title="새 지도 만들기"
              onClick={onCreate}
            >
              <Plus size={16} strokeWidth={2.2} />
            </button>
          ) : null}
          {onOpenNotifications ? (
            <button
              type="button"
              className="archive-head__icon"
              aria-label="알림"
              title="알림"
              onClick={onOpenNotifications}
            >
              <Bell size={16} strokeWidth={1.8} />
              {hasUnread ? <span className="archive-head__icon-dot" /> : null}
            </button>
          ) : null}
        </div>
      </div>

      <div className="maps-segment" role="tablist" aria-label="내 아카이브 보기">
        <button
          className={`maps-segment__tab${archiveView === "maps" ? " is-active" : ""}`}
          type="button"
          role="tab"
          aria-selected={archiveView === "maps"}
          onClick={() => setArchiveView("maps")}
        >
          지도 <span>{maps.length}</span>
        </button>
        <button
          className={`maps-segment__tab${archiveView === "places" ? " is-active" : ""}`}
          type="button"
          role="tab"
          aria-selected={archiveView === "places"}
          onClick={() => setArchiveView("places")}
        >
          장소 <span>{features.length}</span>
        </button>
      </div>

      {archiveView === "maps" ? (
        <MapsListScreen
          maps={maps}
          features={features}
          shares={shares}
          characterImage={characterImage}
          onCreate={onCreate}
          onEdit={onEdit}
          onOpen={onOpen}
          onDelete={onDelete}
          onShare={onShare}
          onPublish={onPublish}
          onUnpublish={onUnpublish}
          onAddToProfile={onAddToProfile}
          onRemoveFromProfile={onRemoveFromProfile}
          loading={loading}
        />
      ) : (
        <PlacesScreen
          maps={maps}
          features={features}
          characterImage={characterImage}
          onOpenFeature={onOpenFeature}
          onCreateRecord={onCreateRecord}
          embedded
          title="장소"
          subtitle="모든 지도에 남긴 기록을 검색하고 다시 열어보세요"
        />
      )}
    </section>
  )
}
