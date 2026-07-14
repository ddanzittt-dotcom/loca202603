import { useState } from "react"
import { PhotoBlock } from "./PhotoBlock"
import { PhotoViewer } from "./PhotoViewer"
import { useResolvedMediaUrl } from "../../hooks/useResolvedMediaUrl"

/**
 * DiaryBanner — 상세 화면/축약 카드의 일기 entry 카드.
 *
 * 시안: 참고자료/design-source/map-cards-modals.jsx::DiaryBanner
 *
 * 구조:
 *   - 헤더: (오늘이면) "오늘" 뱃지 + 날짜·요일
 *   - 미디어 행: 사진 썸네일
 *   - 메모 본문
 *
 * 오늘 entry: 왼쪽에 3px 컬러 보더 + 컬러 강조 텍스트.
 *
 * Props:
 *   entry — {
 *     isToday: bool,
 *     date: string ("05.20" 등),
 *     day: string ("수요일" 등),
 *     photos: array of { src? } | number (placeholder 수),
 *     memo: string,
 *   }
 *   accent — 좌측 보더 컬러 (item 색, 기본 --accent)
 */
function DiaryPhotoBlock({ photo, onOpen }) {
  const { src, markRemoteFailed } = useResolvedMediaUrl(photo)
  return (
    <button
      type="button"
      className="loca-v2-diary-banner__photo-button"
      onClick={onOpen}
      aria-label="사진 보기"
    >
      <PhotoBlock
        size={44}
        radius={7}
        src={src}
        alt=""
        tone={photo?.tone || "a"}
        onImageError={markRemoteFailed}
      >
        {src ? null : (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 5,
              background:
                "repeating-linear-gradient(45deg, rgba(255,255,255,0.18) 0 2px, transparent 2px 4px)",
            }}
          />
        )}
      </PhotoBlock>
    </button>
  )
}

export function DiaryBanner({ entry, accent }) {
  const [viewerIndex, setViewerIndex] = useState(null)
  if (!entry) return null
  const accentColor = accent || "var(--accent)"
  const isToday = Boolean(entry.isToday)
  const photoList = Array.isArray(entry.photos)
    ? entry.photos
    : (typeof entry.photos === "number" && entry.photos > 0
      ? Array.from({ length: entry.photos }, () => ({}))
      : [])

  return (
    <article
      className={`loca-v2-diary-banner${isToday ? " is-today" : ""}`}
      style={isToday ? { borderLeftColor: accentColor } : undefined}
    >
      <header className="loca-v2-diary-banner__head">
        {isToday ? (
          <span
            className="loca-v2-diary-banner__today"
            style={{ background: accentColor }}
          >
            오늘
          </span>
        ) : null}
        <span
          className="loca-v2-diary-banner__date"
          style={isToday ? { color: accentColor } : undefined}
        >
          {entry.date}{entry.day ? ` · ${entry.day}` : ""}
        </span>
      </header>

      {photoList.length > 0 ? (
        <div className="loca-v2-diary-banner__media">
          <div className="loca-v2-diary-banner__photos">
            {photoList.slice(0, 3).map((p, i) => (
              <DiaryPhotoBlock
                key={p?.id || p?.localId || p?.src || i}
                photo={p}
                onOpen={() => setViewerIndex(i)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {entry.memo ? (
        <p className="loca-v2-diary-banner__memo">{entry.memo}</p>
      ) : null}

      <PhotoViewer
        open={viewerIndex !== null}
        photos={photoList}
        initialIndex={viewerIndex || 0}
        onClose={() => setViewerIndex(null)}
      />
    </article>
  )
}
