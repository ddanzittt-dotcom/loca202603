import { ChevronRight } from "lucide-react"

/**
 * SectionHead — 섹션 타이틀 + 우측 보기/링크.
 *
 * 시안: 참고자료/design-source/screen-home.jsx::SectionHead
 *
 * Props:
 *   title         — 섹션 제목 (string)
 *   right         — 우측 텍스트 (예: "전체 보기")
 *   onRightClick  — 우측 클릭 핸들러 (있으면 button, 없으면 span)
 *   className     — 추가 클래스 (페이지 패딩 등 override 시)
 */
export function SectionHead({ title, right, onRightClick, className = "" }) {
  return (
    <div className={`loca-v2-section-head ${className}`}>
      <span className="loca-v2-section-head__title">{title}</span>
      {right ? (
        onRightClick ? (
          <button
            type="button"
            className="loca-v2-section-head__right"
            onClick={onRightClick}
          >
            {right}
            <ChevronRight size={11} strokeWidth={2.4} />
          </button>
        ) : (
          <span className="loca-v2-section-head__right">
            {right}
            <ChevronRight size={11} strokeWidth={2.4} />
          </span>
        )
      ) : null}
    </div>
  )
}
