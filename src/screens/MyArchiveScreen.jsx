import { useState } from "react"
import { BrandLogo } from "../components/BrandLogo"
import { ExploreScreen } from "./ExploreScreen"
import { MapsListScreen } from "./MapsListScreen"
import { PlacesScreen } from "./PlacesScreen"

// onImport prop은 App.jsx 에서 전달되지만 v2 아카이브에서는 사용하지 않는다 (Phase 2 에서 검토).
// eslint 통과를 위해 destructure 에서 제외.
export function MyArchiveScreen({
  maps,
  features,
  shares = [],
  characterImage,
  onCreate,
  onEdit,
  onCollaborate,
  onOpen,
  onDelete,
  onReorder,
  onShare,
  onPublish,
  onUnpublish,
  onAddToProfile,
  onRemoveFromProfile,
  onOpenFeature,
  onCreateRecord,
  collaborationInvites = [],
  onAcceptCollaborationInvite,
  onRejectCollaborationInvite,
  recommendedMaps = [],
  onOpenDemoMap,
  onOpenCommunityEditor,
  users = [],
  followed = [],
  onSelectUser,
  loading = false,
  initialArchiveView = "maps",
}) {
  const [archiveView, setArchiveView] = useState(initialArchiveView)
  const isPlacesHub = initialArchiveView === "places"
  const personalMaps = maps
  const personalMapIds = new Set(personalMaps.map((map) => map.id))
  const personalFeatures = features.filter((feature) => personalMapIds.has(feature.mapId))
  const personalShares = shares.filter((share) => personalMapIds.has(share.mapId))
  const personalPlaceCount = personalFeatures.filter((feature) => (
    ["pin", "route", "area"].includes(feature?.type) && personalMapIds.has(feature.mapId)
  )).length
  const archiveTabs = isPlacesHub
    ? [
      { id: "places", label: "내 장소", count: personalPlaceCount },
      { id: "community", label: "모두의 지도" },
    ]
    : [
      { id: "maps", label: "지도", count: personalMaps.length },
      { id: "places", label: "장소", count: personalFeatures.length },
    ]

  return (
    <section className="screen screen--scroll maps-library-screen maps-library-screen--v2">
      <div className="archive-head archive-head--v2">
        <BrandLogo className="archive-head__brand archive-head__brand--v2" dotClassName="archive-head__brand-dot" />
      </div>

      <div className={`maps-segment maps-segment--v2${isPlacesHub ? " maps-segment--hub" : ""}`} role="tablist" aria-label={isPlacesHub ? "장소 보기" : "내 아카이브 보기"}>
        {archiveTabs.map((tab) => (
          <button
            key={tab.id}
            className={`maps-segment__tab maps-segment__tab--v2${archiveView === tab.id ? " is-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={archiveView === tab.id}
            onClick={() => setArchiveView(tab.id)}
          >
            {tab.label} {typeof tab.count === "number" ? <span>{tab.count}</span> : null}
          </button>
        ))}
      </div>

      {archiveView === "maps" ? (
        <MapsListScreen
          maps={personalMaps}
          features={personalFeatures}
          shares={personalShares}
          characterImage={characterImage}
          onCreate={onCreate}
          onEdit={onEdit}
          onCollaborate={onCollaborate}
          onOpen={onOpen}
          onDelete={onDelete}
          onReorder={onReorder}
          onShare={onShare}
          onPublish={onPublish}
          onUnpublish={onUnpublish}
          onAddToProfile={onAddToProfile}
          onRemoveFromProfile={onRemoveFromProfile}
          collaborationInvites={collaborationInvites}
          onAcceptCollaborationInvite={onAcceptCollaborationInvite}
          onRejectCollaborationInvite={onRejectCollaborationInvite}
          loading={loading}
        />
      ) : archiveView === "places" ? (
        <PlacesScreen
          maps={personalMaps}
          features={personalFeatures}
          characterImage={characterImage}
          onOpenFeature={onOpenFeature}
          onCreateRecord={onCreateRecord}
          embedded
          title="장소"
          subtitle="모든 지도에 남긴 기록을 검색하고 다시 열어보세요"
        />
      ) : (
        <ExploreScreen
          recommendedMaps={recommendedMaps}
          onOpenMap={onOpenDemoMap}
          onOpenCommunityEditor={onOpenCommunityEditor}
          users={users}
          followed={followed}
          onSelectUser={onSelectUser}
          embedded
          section="community"
        />
      )}
    </section>
  )
}
