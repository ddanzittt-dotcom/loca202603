import { PhotoBlock } from "./PhotoBlock"
import { AudioChip } from "./AudioChip"

/**
 * DiaryBanner — 상세 화면/축약 카드의 일기 entry 카드.
 *
 * 시안: 참고자료/design-source/map-cards-modals.jsx::DiaryBanner
 *
 * 구조:
 *   - 헤더: (오늘이면) "오늘" 뱃지 + 날짜·요일
 *   - 미디어 행: 사진 썸네일 + 음성 칩
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
 *     audio: array of { duration, date? },
 *     memo: string,
 *   }
 *   accent — 좌측 보더 컬러 (item 색, 기본 --accent)
 */
export function DiaryBanner({ entry, accent }) {
  if (!entry) return null
  const accentColor = accent || "var(--accent)"
  const isToday = Boolean(entry.isToday)
  const photoList = Array.isArray(entry.photos)
    ? entry.photos
    : (typeof entry.photos === "number" && entry.photos > 0
      ? Array.from({ length: entry.photos }, () => ({}))
      : [])
  const audioList = Array.isArray(entry.audio) ? entry.audio : []

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

      {(photoList.length > 0 || audioList.length > 0) ? (
        <div className="loca-v2-diary-banner__media">
          {photoList.length > 0 ? (
            <div className="loca-v2-diary-banner__photos">
              {photoList.slice(0, 3).map((p, i) => (
                <PhotoBlock
                  key={i}
                  size={44}
                  radius={7}
                  src={p?.src}
                  alt=""
                  tone={p?.tone || "a"}
                >
                  {p?.src ? null : (
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
              ))}
            </div>
          ) : null}
          {audioList.map((a, i) => (
            <AudioChip
              key={i}
              duration={a.duration ?? a.dur}
              date={a.date}
              density={audioList.length >= 3 ? 2 : 1}
            />
          ))}
        </div>
      ) : null}

      {entry.memo ? (
        <p className="loca-v2-diary-banner__memo">{entry.memo}</p>
      ) : null}
    </article>
  )
}
