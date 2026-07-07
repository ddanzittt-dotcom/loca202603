import { useEffect, useRef, useState } from "react"

// 도우미 고양이 "로카냥" — 두발로 선 턱시도(검정+흰 가슴/양말) 도트 고양이.
// 좌하단(데스크톱: 레일 하단 중앙)에 상주하며, 누르면 도움말 메뉴를 연다.
// 스프라이트는 pixelEmojiCatalog 와 같은 문자 그리드 방식 — 셀 단위로 촘촘하게.

const PALETTE = {
  k: "#1F1A12", // 검정 털
  K: "#120E09", // 진한 음영(발끝·귀 테)
  s: "#3B342B", // 하이라이트(정수리 윤기)
  w: "#FFFDF4", // 흰 털
  W: "#E7E1CE", // 흰 털 음영
  p: "#F2A7AE", // 분홍(귀 안쪽·코)
  G: "#14100B", // 눈동자
}

// 22×30 본체 (꼬리는 살랑 애니메이션용으로 분리)
const CAT_GRID = [
  "..kk..............kk..",
  ".kKKk............kKKk.",
  ".kKpKk..........kKpKk.",
  ".kKppkkkkkkkkkkkkppKk.",
  ".kkkkkkkkkkkkkkkkkkkk.",
  ".kskkkkkkkkkkkkkkkkkk.",
  ".kkkkwGwkkkkkkwGwkkkk.",
  ".kkkkwGwkkkkkkwGwkkkk.",
  ".kkkkkkkwwwwwwkkkkkkk.",
  ".kkkkkkkwwppwwkkkkkkk.",
  ".kkkkkkwwwppwwwkkkkkk.",
  ".kkkkkkkwwwwwwkkkkkkk.",
  ".kkkkkkkkkkkkkkkkkkkk.",
  "..kkkkkkkkkkkkkkkkkk..",
  "...kkkkwwwwwwwwkkkk...",
  "...kkkkwwwwwwwwkkkk...",
  ".kkkkkkwwwwwwwwkkkkkk.",
  ".kkkkkkwWWwwWWwkkkkkk.",
  ".kkkkkkwwwwwwwwkkkkkk.",
  ".kwwkkkwwwwwwwwkkkwwk.",
  "...kkkkwwwwwwwwkkkk...",
  "...kkkkkwwwwwwkkkkk...",
  "...kkkkkkwwwwkkkkkk...",
  "...kkkkkkkkkkkkkkkk...",
  "...kkkkkkkkkkkkkkkk...",
  "....kkkkk....kkkkk....",
  "....kkkkk....kkkkk....",
  "....wwwww....wwwww....",
  "....wwwww....wwwww....",
  "....KKKKK....KKKKK....",
]

// 꼬리 (흰 끝) — 본체 오른쪽에 붙어 살랑거린다
const TAIL_GRID = [
  ".www",
  ".wwk",
  "..kk",
  "..kk",
  "..kk",
  "..kk",
  ".kk.",
  ".kk.",
  "kk..",
  "kk..",
]

// 문자 그리드 → rect 배열 (가로 연속 같은 색은 한 rect 로 병합)
function gridToRects(grid, offsetX = 0, offsetY = 0) {
  const rects = []
  grid.forEach((row, y) => {
    let runColor = null
    let runStart = 0
    const flush = (end) => {
      if (runColor) {
        rects.push({ x: offsetX + runStart, y: offsetY + y, w: end - runStart, fill: runColor })
      }
    }
    for (let x = 0; x < row.length; x += 1) {
      const color = PALETTE[row[x]] || null
      if (color !== runColor) {
        flush(x)
        runColor = color
        runStart = x
      }
    }
    flush(row.length)
  })
  return rects
}

const CAT_RECTS = gridToRects(CAT_GRID)
const TAIL_RECTS = gridToRects(TAIL_GRID, 20, 15)

export function TuxCatSprite({ size = 34, waving = false }) {
  return (
    <svg
      className={`hcat-svg${waving ? " is-waving" : ""}`}
      width={size}
      height={Math.round(size * 1.2)}
      viewBox="0 0 25 30"
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <g className="hcat-tail">
        {TAIL_RECTS.map((r) => (
          <rect key={`t${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height="1" fill={r.fill} />
        ))}
      </g>
      {CAT_RECTS.map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height="1" fill={r.fill} />
      ))}
      {/* 깜빡임 눈꺼풀 — 눈 위에 털색 덮개가 잠깐 나타난다 */}
      <g className="hcat-lids" fill={PALETTE.k}>
        <rect x="5" y="6" width="3" height="2" />
        <rect x="14" y="6" width="3" height="2" />
      </g>
    </svg>
  )
}

// 도움말 메뉴 항목 → 튜토리얼 시작 스텝 인덱스 (TutorialDialog 의 TUTORIAL_STEPS 기준)
const HELP_TOPICS = [
  { step: 0, emoji: "📖", label: "처음부터 전체 사용법" },
  { step: 1, emoji: "📍", label: "장소 채집하는 법" },
  { step: 2, emoji: "🗂️", label: "카드에 기록 남기는 법" },
  { step: 3, emoji: "🗺️", label: "지도 만드는 법" },
  { step: 4, emoji: "📣", label: "발행·공유하는 법" },
]

// 랜덤 말풍선 — 이따금 로카냥이 말을 건다
const IDLE_LINES = [
  "도움이 필요해?",
  "나를 누르면 내가 알려줄게!",
  "궁금한 거 있으면 눌러줘",
  "채집은 잘 되고 있어?",
  "오늘도 좋은 채집 되길! 냐옹",
  "지도 만들기, 생각보다 쉬워!",
  "마음에 든 곳은 바로 채집해봐",
  "카드를 누르면 기록을 남길 수 있어",
  "냐옹~",
]

const BUBBLE_FIRST_DELAY = 2500 // 첫 등장
const BUBBLE_SHOW_MS = 4200 // 표시 시간
const BUBBLE_GAP_MS = 14000 // 다음 등장까지

export function HelperCat({ onOpenTutorial }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [bubble, setBubble] = useState("")
  const rootRef = useRef(null)
  const lastLineRef = useRef("")

  // 바깥 탭/ESC 로 메뉴 닫기
  useEffect(() => {
    if (!menuOpen) return undefined
    const handlePointer = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setMenuOpen(false)
    }
    const handleKey = (event) => {
      if (event.key === "Escape") setMenuOpen(false)
    }
    window.addEventListener("pointerdown", handlePointer)
    window.addEventListener("keydown", handleKey)
    return () => {
      window.removeEventListener("pointerdown", handlePointer)
      window.removeEventListener("keydown", handleKey)
    }
  }, [menuOpen])

  // 랜덤 말풍선 루프 — 메뉴가 열려 있으면 쉬어간다 (닫을 때 초기화는 클릭 핸들러에서)
  useEffect(() => {
    if (menuOpen) return undefined
    let showTimer = null
    let hideTimer = null
    const speak = () => {
      const pool = IDLE_LINES.filter((line) => line !== lastLineRef.current)
      const line = pool[Math.floor(Math.random() * pool.length)]
      lastLineRef.current = line
      setBubble(line)
      hideTimer = window.setTimeout(() => {
        setBubble("")
        showTimer = window.setTimeout(speak, BUBBLE_GAP_MS)
      }, BUBBLE_SHOW_MS)
    }
    showTimer = window.setTimeout(speak, BUBBLE_FIRST_DELAY)
    return () => {
      window.clearTimeout(showTimer)
      window.clearTimeout(hideTimer)
    }
  }, [menuOpen])

  return (
    <div className="hcat" ref={rootRef}>
      {bubble && !menuOpen ? (
        <div className="hcat-bubble" aria-hidden="true">{bubble}</div>
      ) : null}
      {menuOpen ? (
        <div className="hcat-menu" role="menu" aria-label="도움말 메뉴">
          <span className="hcat-menu__title">뭐가 궁금해?</span>
          {HELP_TOPICS.map((topic) => (
            <button
              key={topic.step}
              type="button"
              role="menuitem"
              className="hcat-menu__item"
              onClick={() => {
                setMenuOpen(false)
                onOpenTutorial?.(topic.step)
              }}
            >
              <span aria-hidden="true">{topic.emoji}</span>
              {topic.label}
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        className={`hcat-btn${menuOpen ? " is-open" : ""}`}
        onClick={() => { setBubble(""); setMenuOpen((open) => !open) }}
        aria-label="도우미 로카냥 — 도움말 열기"
        aria-expanded={menuOpen}
      >
        <TuxCatSprite size={30} waving={menuOpen} />
      </button>
    </div>
  )
}
