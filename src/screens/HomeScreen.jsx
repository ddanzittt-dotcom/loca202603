import { MapErrorBoundary } from "../components/MapErrorBoundary"
import { NaverMap } from "../components/NaverMap"

export function HomeScreen({ recommendedMaps, communityMapFeatures, onOpenMap, onOpenCommunityEditor }) {
  return (
    <section className="screen screen--scroll">
      <div className="section-head">
        <div>
          <h1 className="section-head__title">추천 지도</h1>
          <p className="section-head__subtitle">인기 있는 지도를 둘러보세요</p>
        </div>
      </div>

      <div className="recommended-scroller">
        {recommendedMaps.map((item) => (
          <button
            key={item.id}
            className="rec-card"
            type="button"
            onClick={() => onOpenMap(item.mapId)}
            style={{ "--rec-start": item.gradient?.[0] || "#667eea", "--rec-end": item.gradient?.[1] || "#764ba2" }}
          >
            <div className="rec-card__emoji-row">
              {item.emojis.slice(0, 4).map((e, i) => (
                <span key={`${e}-${i}`}>{e}</span>
              ))}
            </div>
            <div className="rec-card__body">
              <strong className="rec-card__title">{item.title}</strong>
              <span className="rec-card__creator">{item.creator}</span>
              <span className="rec-card__count">📍 {item.placeCount}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="section-head" style={{ marginTop: 8 }}>
        <div>
          <h2 className="section-head__title">모두의 지도</h2>
          <p className="section-head__subtitle">모두가 함께 만드는 지도</p>
        </div>
        <button className="button button--primary" type="button" onClick={onOpenCommunityEditor}>
          지도 열기
        </button>
      </div>

      <div className="community-map-wrap">
        <MapErrorBoundary>
          <NaverMap
            features={communityMapFeatures}
            selectedFeatureId={null}
            draftPoints={[]}
            draftMode="browse"
            focusPoint={null}
            fitTrigger={0}
            onMapTap={undefined}
            onFeatureTap={() => {}}
            showLabels={true}
          />
        </MapErrorBoundary>
      </div>
    </section>
  )
}
