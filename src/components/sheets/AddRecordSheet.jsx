import { useMemo, useState } from "react"
import { ChevronLeft, Map, MapPin, Navigation, PlusCircle, Search } from "lucide-react"
import { BottomSheet } from "../ui"

function MapChoice({ map, isSelected, onClick }) {
  return (
    <button
      className={`add-record-map${isSelected ? " is-selected" : ""}`}
      type="button"
      onClick={onClick}
    >
      <span className="add-record-map__mark" style={{ background: map.theme || "#2D4A3E" }} aria-hidden="true" />
      <span className="add-record-map__copy">
        <strong>{map.title || "내 지도"}</strong>
        {map.description ? <small>{map.description}</small> : <small>이 지도에 장소를 더해요</small>}
      </span>
    </button>
  )
}

export function AddRecordSheet({
  open,
  maps = [],
  initialView = "target",
  selectedMapId = null,
  onClose,
  onCreateMap,
  onStartRecord,
}) {
  const [view, setView] = useState(initialView)
  const [currentMapId, setCurrentMapId] = useState(selectedMapId)

  const currentMap = useMemo(
    () => maps.find((map) => map.id === currentMapId) || null,
    [currentMapId, maps],
  )

  const chooseMap = (mapId) => {
    setCurrentMapId(mapId)
    setView("method")
  }

  const start = (method) => {
    if (!currentMapId) return
    onStartRecord?.(currentMapId, method)
  }

  return (
    <BottomSheet
      open={open}
      title="어디에 기록할까요?"
      subtitle="먼저 기록할 지도를 고른 뒤 장소를 남겨요."
      onClose={onClose}
    >
      <div className="add-record-sheet">
        {view === "target" ? (
          <div className="add-record-options">
            <button className="add-record-option add-record-option--primary" type="button" onClick={onCreateMap}>
              <span className="add-record-option__icon"><PlusCircle size={18} /></span>
              <span className="add-record-option__copy">
                <strong>새 지도 만들기</strong>
                <small>새로운 주제로 장소를 모아볼게요.</small>
              </span>
            </button>
            <button className="add-record-option" type="button" onClick={() => setView("maps")}>
              <span className="add-record-option__icon"><Map size={18} /></span>
              <span className="add-record-option__copy">
                <strong>기존 지도에서 선택</strong>
                <small>이미 만든 지도에 장소를 더해보세요.</small>
              </span>
            </button>
          </div>
        ) : null}

        {view === "maps" ? (
          <div className="add-record-panel">
            <button className="add-record-back" type="button" onClick={() => setView("target")}>
              <ChevronLeft size={15} /> 돌아가기
            </button>
            <div className="add-record-panel__head">
              <strong>기록할 지도</strong>
              <span>{maps.length}개</span>
            </div>
            {maps.length > 0 ? (
              <div className="add-record-map-list">
                {maps.map((map) => (
                  <MapChoice
                    key={map.id}
                    map={map}
                    isSelected={map.id === currentMapId}
                    onClick={() => chooseMap(map.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="add-record-empty">
                <strong>아직 지도가 없어요</strong>
                <span>새 지도를 만들고 첫 장소를 남겨보세요.</span>
                <button className="button button--primary" type="button" onClick={onCreateMap}>
                  새 지도 만들기
                </button>
              </div>
            )}
          </div>
        ) : null}

        {view === "method" ? (
          <div className="add-record-panel">
            <button className="add-record-back" type="button" onClick={() => setView(maps.length > 0 ? "maps" : "target")}>
              <ChevronLeft size={15} /> 지도 다시 선택
            </button>
            <div className="add-record-selected">
              <span className="add-record-selected__label">기록할 지도</span>
              <strong>{currentMap?.title || "새 지도"}</strong>
            </div>
            <div className="settings-link-list">
              <button className="settings-link-row" type="button" onClick={() => start("search")}>
                <span className="record-action-row__copy">
                  <span className="record-action-row__title"><Search size={16} /> 장소 검색</span>
                  <small>이름이나 주소로 찾은 뒤 남겨요.</small>
                </span>
              </button>
              <button className="settings-link-row" type="button" onClick={() => start("current")}>
                <span className="record-action-row__copy">
                  <span className="record-action-row__title"><Navigation size={16} /> 현재 위치</span>
                  <small>지금 있는 곳 주변에서 시작해요.</small>
                </span>
              </button>
              <button className="settings-link-row" type="button" onClick={() => start("map")}>
                <span className="record-action-row__copy">
                  <span className="record-action-row__title"><MapPin size={16} /> 지도에서 선택</span>
                  <small>지도를 탭해 장소를 직접 찍어요.</small>
                </span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </BottomSheet>
  )
}
