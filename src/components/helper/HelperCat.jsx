import { useEffect, useRef, useState } from "react"

// 도우미 고양이 듀오 — "로카냥"(도움말) + "치즈냥"(피드백 귓속말).
// 좌하단(데스크톱: 레일 하단 중앙)에 상주하며, 로카냥을 누르면 도움말 메뉴,
// 치즈냥을 누르면 피드백 시트("치즈냥의 귓속말")를 연다.
// 스프라이트는 pixelEmojiCatalog 와 같은 문자 그리드 방식 — 셀 단위로 촘촘하게.

const PALETTE = {
  k: "#1F1A12", // 검정 털·윤곽선
  K: "#120E09", // 진한 음영(발끝·귀 테)
  w: "#FFFDF4", // 흰 털
  W: "#E7E1CE", // 흰 털 음영
  p: "#F2A7AE", // 분홍(귀 안쪽·코·입)
  b: "#F6BFC7", // 볼터치
  G: "#14100B", // 눈동자
  R: "#E5493A", // 나비넥타이(정장)
}

// 22×30 본체 — 흰 바탕 + 검은 얼룩 젖소무늬 고양이 (참고 사진 기반).
// 검은 모자(귀~정수리) + 왼뺨 검은 무늬 + 오른쪽 옆구리 얼룩 + 볼터치. 꼬리는 분리(살랑).
const CAT_GRID = [
  "..kk..............kk..",
  ".kKKk............kKKk.",
  ".kKpKk..........kKpKk.",
  ".kKppkkkkkkkkkkkkppKk.",
  ".kkkkkkkkkkkkkkkkkkkk.",
  ".kkkkkwwwwwwwwwwkkkkk.",
  ".kkkwwwGGwwwwGGwwwwwk.",
  ".kkkwwwGGwwwwGGwwwwwk.",
  ".kwwwwwwwwppwwwwwwwwk.",
  ".kwbbwwwwwkkwwwwwbbwk.",
  ".kwwwwwwwwwwwwwwwwwwk.",
  "..kwwwwwwwwwwwwwwwwk..",
  "...kkwwwwwwwwwwwwkk...",
  "..kkwwwwwwwwwwwwwwkk..",
  ".kwwwwwwwwwwwwwwwwwwk.",
  ".kwwwwwwwwwwwwwkkkkwk.",
  ".kwwwwwwwwwwwwkkkkkwk.",
  ".kwWWwwwwwwwwwkkkkkwk.",
  ".kwwwwwwwwwwwwwkkkkwk.",
  ".kwwkwwwwwwwwwwwwkwwk.",
  "..kwwwwwwwwwwwwwwwwk..",
  "..kwwwwwwwwwwwwwwwwk..",
  "...kwwwwwwwwwwwwwwk...",
  "...kwwwwwwwwwwwwwwk...",
  "...kwwwwwwwwwwwwwwk...",
  "....kwwwk....kwwwk....",
  "....kwwwk....kwwwk....",
  "....kwwwk....kwwwk....",
  "....kwwwk....kwwwk....",
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
function gridToRects(grid, offsetX = 0, offsetY = 0, palette = PALETTE) {
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
      const color = palette[row[x]] || null
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

// 나비넥타이 — 정장 차림용. 턱 아래 목 부분(y=12)에 얹는다.
// 바깥 날개는 높고 가운데는 매듭(k)으로 잘록하게 → ◄► 보타이 실루엣.
const BOW_GRID = [
  "R...R",
  "RRkRR",
  "R...R",
]
const BOW_RECTS = gridToRects(BOW_GRID, 8, 12)

export function TuxCatSprite({ size = 34, waving = false, formal = false }) {
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
      {formal ? BOW_RECTS.map((r) => (
        <rect key={`b${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height="1" fill={r.fill} />
      )) : null}
      {/* 깜빡임 눈꺼풀 — 눈 위에 털색(흰) 덮개가 잠깐 나타난다 */}
      <g className="hcat-lids" fill={PALETTE.w}>
        <rect x="7" y="6" width="2" height="2" />
        <rect x="13" y="6" width="2" height="2" />
      </g>
    </svg>
  )
}

// ── 치즈냥 — 주황 치즈태비 아기 고양이. 앉은 자세로 편지봉투(이야기)를 안고 있다 ──
const CHEESE_PALETTE = {
  k: "#1F1A12", // 윤곽선 (로카냥과 동일 — 한 세계관)
  K: "#120E09", // 발끝 음영
  o: "#F6A83C", // 치즈 주황 털
  O: "#D9822B", // 진한 주황 (줄무늬·귀·꼬리)
  c: "#FFEBC4", // 크림 (주둥이·앞발)
  p: "#F2A7AE", // 분홍 (귀 안쪽·코)
  b: "#F6BFC7", // 볼터치
  G: "#14100B", // 눈동자
  E: "#FFFDF4", // 편지봉투
  R: "#E5493A", // 봉투의 하트 씰
}

// 18×19 본체 — 로카냥(22×30)보다 작은 막내. 이마에 태비 M자 무늬.
const CHEESE_GRID = [
  "..kk..........kk..",
  ".kOOk........kOOk.",
  ".kOpOk......kOpOk.",
  ".kOppkkkkkkkkppOk.",
  ".kooooooooooooook.",
  ".koooOooOOooOoook.",
  ".koooGGooooGGoook.",
  ".koooGGooooGGoook.",
  ".kooooccppccooook.",
  ".koobbockkcobbook.",
  ".kooooooooooooook.",
  "..kooooooooooook..",
  "..kooooooooooook..",
  "..koEEEEEEEEEEok..",
  "..koEEEERREEEEok..",
  "..kocEEEEEEEEcok..",
  "..kooooooooooook..",
  "...kccoooooocck...",
  "....KKKK..KKKK....",
]

// 꼬리 — 몸 오른쪽에 세워 살랑, 끝은 크림색
const CHEESE_TAIL_GRID = [
  "cc",
  "OO",
  "OO",
  "OO",
  "O.",
  "O.",
]

const CHEESE_RECTS = gridToRects(CHEESE_GRID, 0, 0, CHEESE_PALETTE)
const CHEESE_TAIL_RECTS = gridToRects(CHEESE_TAIL_GRID, 16, 12, CHEESE_PALETTE)

export function CheeseCatSprite({ size = 40, waving = false }) {
  return (
    <svg
      className={`ccat-svg${waving ? " is-waving" : ""}`}
      width={size}
      height={Math.round(size * (19 / 18))}
      viewBox="0 0 18 19"
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <g className="ccat-tail">
        {CHEESE_TAIL_RECTS.map((r) => (
          <rect key={`t${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height="1" fill={r.fill} />
        ))}
      </g>
      {CHEESE_RECTS.map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height="1" fill={r.fill} />
      ))}
      {/* 깜빡임 눈꺼풀 — 주황 털색 덮개 */}
      <g className="ccat-lids" fill={CHEESE_PALETTE.o}>
        <rect x="5" y="6" width="2" height="2" />
        <rect x="11" y="6" width="2" height="2" />
      </g>
    </svg>
  )
}

// 도움말 메뉴 항목 → 튜토리얼 챕터 id (TutorialDialog 의 TUTORIAL_CHAPTERS 기준)
const HELP_TOPICS = [
  { chapter: "intro", emoji: "📖", label: "처음부터 전체 사용법" },
  { chapter: "collect", emoji: "🧺", label: "장소 채집하는 법" },
  { chapter: "binder", emoji: "🗂️", label: "카드에 기록 남기는 법" },
  { chapter: "mapmaking", emoji: "🗺️", label: "지도 만드는 법" },
  { chapter: "share", emoji: "📣", label: "공유하고 함께 만드는 법" },
  { chapter: "explore", emoji: "🧭", label: "탐색 탭 안내" },
  { chapter: "walk", emoji: "🐾", label: "산책 모드" },
]

export function HelperCat({ onOpenTutorial, onOpenFeedback, showFeedbackCat = false }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef(null)

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

  return (
    <div className="hcat" ref={rootRef}>
      {menuOpen ? (
        <div className="hcat-menu" role="menu" aria-label="도움말 메뉴">
          <span className="hcat-menu__title">뭐가 궁금해?</span>
          {HELP_TOPICS.map((topic) => (
            <button
              key={topic.chapter}
              type="button"
              role="menuitem"
              className="hcat-menu__item"
              onClick={() => {
                setMenuOpen(false)
                onOpenTutorial?.(topic.chapter)
              }}
            >
              <span aria-hidden="true">{topic.emoji}</span>
              {topic.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="hcat-duo">
        <div className="hcat-one">
          <button
            type="button"
            className={`hcat-btn${menuOpen ? " is-open" : ""}`}
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="지도 도우미 로카냥 — 도움말 열기"
            aria-expanded={menuOpen}
          >
            <TuxCatSprite size={30} waving={menuOpen} />
          </button>
          <span className="hcat-label">지도 도우미 로카냥</span>
        </div>
        {showFeedbackCat ? (
          <div className="hcat-one">
            <button
              type="button"
              className="ccat-btn"
              onClick={() => { setMenuOpen(false); onOpenFeedback?.() }}
              aria-label="불편접수 치즈냥 — 이야기 보내기"
            >
              <CheeseCatSprite size={40} />
            </button>
            <span className="hcat-label">불편접수 치즈냥</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
