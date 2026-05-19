import { useState } from "react"
import { isEventMap } from "../lib/mapPlacement"
import { ExploreScreen } from "./ExploreScreen"
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
  const personalMapIds = new Set(maps.filter((map) => !isEventMap(map)).map((map) => map.id))
  const personalPlaceCount = features.filter((feature) => (
    ["pin", "route", "area"].includes(feature?.type) && personalMapIds.has(feature.mapId)
  )).length
  const archiveTabs = isPlacesHub
    ? [
      { id: "places", label: "내 장소", count: personalPlaceCount },
      { id: "community", label: "모두의 지도" },
      { id: "events", label: "내 주변 행사" },
    ]
    : [
      { id: "maps", label: "지도", count: maps.length },
      { id: "places", label: "장소", count: features.length },
    ]

  const title = archiveView === "maps"
    ? "내 지도"
    : archiveView === "community"
      ? "모두의 지도"
      : archiveView === "events"
        ? "내 주변 행사"
        : "장소"

  return (
    <section className="screen screen--scroll maps-library-screen">
      <div className="archive-head">
        <h1 className="archive-head__title">{title}</h1>
      </div>

      <div className={`maps-segment${isPlacesHub ? " maps-segment--hub" : ""}`} role="tablist" aria-label={isPlacesHub ? "장소 보기" : "내 아카이브 보기"}>
        {archiveTabs.map((tab) => (
          <button
            key={tab.id}
            className={`maps-segment__tab${archiveView === tab.id ? " is-active" : ""}`}
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
      ) : archiveView === "places" ? (
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
      ) : (
        <ExploreScreen
          recommendedMaps={recommendedMaps}
          onOpenMap={onOpenDemoMap}
          onOpenCommunityEditor={onOpenCommunityEditor}
          users={users}
          followed={followed}
          onSelectUser={onSelectUser}
          embedded
          section={archiveView === "events" ? "events" : "community"}
        />
      )}
    </section>
  )
}
