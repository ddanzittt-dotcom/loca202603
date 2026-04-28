import { useState } from "react"
import { Download, Plus } from "lucide-react"
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
  loading = false,
}) {
  const [archiveView, setArchiveView] = useState("maps")

  return (
    <section className="screen screen--scroll maps-library-screen">
      <div className="section-head archive-head">
        <div className="archive-head__copy">
          <h1 className="section-head__title">내 지도</h1>
          <p className="section-head__desc">지도와 장소 기록을 함께 보는 내 아카이브.</p>
        </div>
        {archiveView === "maps" ? (
          <div className="section-head__actions archive-head__actions" aria-label="내 지도 액션">
            <button className="button button--ghost archive-head__action" type="button" onClick={onImport}>
              <Download size={14} /> 지도 가져오기
            </button>
            <button className="button button--primary archive-head__action" type="button" onClick={onCreate}>
              <Plus size={14} /> 새 지도 만들기
            </button>
          </div>
        ) : null}
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
