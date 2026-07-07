import { FeatureEmoji } from "../FeatureEmoji"
import { getPlaceType } from "../../lib/placeTypes"
import { representativePhoto, cardArtFeature, looksLikeAddress, formatDotDate } from "../../lib/binderCardData"

// 인스타 공유용 홀로 컬렉터 카드 — 1080×1350 (피드 4:5).
// 화면 밖에서 렌더되어 html2canvas 로 캡처된다(사용자에겐 안 보임).
// 포일 프레임 + 타입 젬 + 아트 + 설명(flavor) + 스탯(지역/수집일) + loca.im.
export function PlaceSharePoster({ feature, dexNo, mapTitle, innerRef }) {
  const type = getPlaceType(feature || {})
  const photo = representativePhoto(feature)
  const name = (feature?.title || "").trim() || "이름 없는 장소"
  const registered = formatDotDate(feature?.createdAt || feature?.updatedAt)
  const note = `${feature?.note || ""}`.trim()
  const desc = looksLikeAddress(note) ? "" : note
  const region = (mapTitle || "").trim()

  return (
    <div className="cardshare-poster" ref={innerRef} style={{ "--pt": type.color }}>
      <div className="csp-plate">
        <div className="csp-inner">
          <span className="csp-corner csp-corner--tl" aria-hidden="true" />
          <span className="csp-corner csp-corner--tr" aria-hidden="true" />
          <span className="csp-corner csp-corner--bl" aria-hidden="true" />
          <span className="csp-corner csp-corner--br" aria-hidden="true" />

          <div className="csp-top">
            <span className="csp-type"><i className="csp-gem" aria-hidden="true" />{type.label}</span>
            <span className="csp-no">N.{dexNo || "000"}</span>
          </div>

          <div className="csp-art">
            {photo ? (
              <img src={photo} alt="" crossOrigin="anonymous" />
            ) : (
              <FeatureEmoji feature={cardArtFeature(feature)} size={300} unicodeFontSize={220} />
            )}
            <span className="csp-holo" aria-hidden="true" />
          </div>

          <h2 className="csp-name">{name}</h2>

          <div className={`csp-desc${desc ? "" : " csp-desc--empty"}`}>
            <span className="csp-desc__k">설명</span>
            <p>{desc || "이곳에 대한 한 줄 기록을 남겨보세요."}</p>
          </div>

          <div className="csp-stats">
            <span>{region ? "지역" : "타입"} · <b>{region || type.label}</b></span>
            {registered ? <span>수집 · <b>{registered}</b></span> : null}
          </div>

          <div className="csp-foot">
            <span className="csp-brand">loca.im</span>
            <span className="csp-tag">내 동네를 기록하는 지도</span>
          </div>
        </div>
      </div>
    </div>
  )
}
