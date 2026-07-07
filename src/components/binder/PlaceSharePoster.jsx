import { FeatureEmoji } from "../FeatureEmoji"
import { getPlaceType } from "../../lib/placeTypes"
import { representativePhoto, cardArtFeature, mixHex, formatDotDate } from "../../lib/binderCardData"

// 인스타 공유용 브랜디드 포스터 — 1080×1350 (피드 4:5).
// 화면 밖에서 렌더되어 html2canvas 로 캡처된다(사용자에겐 안 보임).
// 카드 아트 + 이름/타입/수집번호 + loca.im 워터마크로 구성한다.
export function PlaceSharePoster({ feature, dexNo, innerRef }) {
  const type = getPlaceType(feature || {})
  const photo = representativePhoto(feature)
  const name = (feature?.title || "").trim() || "이름 없는 장소"
  const registered = formatDotDate(feature?.createdAt || feature?.updatedAt)

  const style = {
    "--pt": type.color,
    "--pt-soft": mixHex(type.color, "#FFFDF4", 0.72),
  }

  return (
    <div className="cardshare-poster" ref={innerRef} style={style}>
      <div className="cardshare-poster__head">
        <span className="cardshare-poster__eyebrow">LOCAL BINDER</span>
        <span className="cardshare-poster__no">N.{dexNo || "000"}</span>
      </div>

      <div className="cardshare-poster__art">
        {photo ? (
          <img src={photo} alt="" crossOrigin="anonymous" />
        ) : (
          <FeatureEmoji feature={cardArtFeature(feature)} size={300} unicodeFontSize={220} />
        )}
      </div>

      <div className="cardshare-poster__caption">
        <span className="cardshare-poster__type">{type.label}</span>
        <h2 className="cardshare-poster__name">{name}</h2>
        {registered ? <span className="cardshare-poster__date">{registered} 수집</span> : null}
      </div>

      <div className="cardshare-poster__foot">
        <span className="cardshare-poster__brand">loca.im</span>
        <span className="cardshare-poster__tag">내 동네를 기록하는 지도</span>
      </div>
    </div>
  )
}
