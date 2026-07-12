import { useEffect, useRef, useState } from "react"
import { isCheeseGreetSeen, markCheeseGreetSeen } from "../../lib/onboarding"

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

// 치즈냥 말풍선 — 로카냥보다 드물게(약 30%) 끼어든다
const CHEESE_IDLE_LINES = [
  "로카에게 하고픈 말 있어? 귓속말해줘!",
  "칭찬도 불만도 다 들어줄게",
  "불편한 게 있으면 나한테 살짝 말해줘",
  "네 이야기가 로카를 바꿔 냥",
]
const CHEESE_GREET_LINE = "나는 치즈냥! 로카에게 전할 이야기가 있으면 나한테 귓속말해줘"

const BUBBLE_FIRST_DELAY = 2500 // 첫 등장
const BUBBLE_SHOW_MS = 4200 // 표시 시간
const BUBBLE_GAP_MS = 14000 // 다음 등장까지

// 이야기 제출 모션 타임라인 — 감사 폴짝 → 우측 대시 → 자리 비움 → 복귀 인사.
// 각 페이즈는 자기 지속시간이 끝나면 다음 페이즈로 넘어간다 (idle 은 종착).
const RUN_PHASE_NEXT = {
  thanks: { phase: "dash", after: 1200 },
  dash: { phase: "away", after: 800 },
  away: { phase: "return", after: 12000 },
  return: { phase: "idle", after: 3000 },
}

export function HelperCat({ onOpenTutorial, onOpenFeedback, runSignal = 0, showFeedbackCat = false }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [idleBubble, setIdleBubble] = useState(null) // { who: "loca"|"cheese", text }
  const [runPhase, setRunPhase] = useState("idle") // idle → thanks → dash → away → return
  const rootRef = useRef(null)
  const lastLineRef = useRef("")
  const greetPendingRef = useRef(showFeedbackCat && !isCheeseGreetSeen())

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

  // 랜덤 말풍선 루프 — 한 번에 한 마리만 말한다. 메뉴가 열려 있거나
  // 치즈냥이 이야기를 전달하러 간 동안은 쉬어간다.
  useEffect(() => {
    if (menuOpen || runPhase !== "idle") return undefined
    let showTimer = null
    let hideTimer = null
    const speak = () => {
      let who = "loca"
      let line = ""
      if (greetPendingRef.current) {
        // 치즈냥 첫 인사 — 1회만
        greetPendingRef.current = false
        markCheeseGreetSeen()
        who = "cheese"
        line = CHEESE_GREET_LINE
      } else {
        who = showFeedbackCat && Math.random() < 0.3 ? "cheese" : "loca"
        const pool = (who === "cheese" ? CHEESE_IDLE_LINES : IDLE_LINES).filter((l) => l !== lastLineRef.current)
        line = pool[Math.floor(Math.random() * pool.length)]
      }
      lastLineRef.current = line
      setIdleBubble({ who, text: line })
      hideTimer = window.setTimeout(() => {
        setIdleBubble(null)
        showTimer = window.setTimeout(speak, BUBBLE_GAP_MS)
      }, BUBBLE_SHOW_MS)
    }
    showTimer = window.setTimeout(speak, BUBBLE_FIRST_DELAY)
    return () => {
      window.clearTimeout(showTimer)
      window.clearTimeout(hideTimer)
    }
  }, [menuOpen, runPhase, showFeedbackCat])

  // 이야기 제출 모션 시작 — runSignal 이 바뀌면 thanks 페이즈로 진입
  useEffect(() => {
    if (!runSignal) return undefined
    const kick = window.setTimeout(() => {
      setMenuOpen(false)
      setIdleBubble(null)
      setRunPhase("thanks")
    }, 0)
    return () => window.clearTimeout(kick)
  }, [runSignal])

  // 페이즈 체인 — 각 페이즈가 제 시간이 지나면 다음 페이즈를 예약한다.
  // 언마운트 시 cleanup 으로 타이머가 정리되고, 리마운트하면 idle(복귀 완료) 상태로 시작.
  useEffect(() => {
    const next = RUN_PHASE_NEXT[runPhase]
    if (!next) return undefined
    const timer = window.setTimeout(() => setRunPhase(next.phase), next.after)
    return () => window.clearTimeout(timer)
  }, [runPhase])

  const handleCheeseClick = () => {
    if (runPhase !== "idle") return
    setMenuOpen(false)
    if (onOpenFeedback) {
      setIdleBubble(null)
      onOpenFeedback()
    } else {
      // 피드백 시트 연결 전 임시 안내 (2단계에서 onOpenFeedback 으로 대체)
      setIdleBubble({ who: "cheese", text: "귓속말 창구를 준비하고 있어! 조금만 기다려 냥" })
    }
  }

  const cheeseBubbleText =
    runPhase === "thanks"
      ? "고마워! 잘 전달할게!"
      : runPhase === "return"
        ? "잘 전달했어! 냥"
        : idleBubble?.who === "cheese"
          ? idleBubble.text
          : ""

  return (
    <div className="hcat" ref={rootRef}>
      {idleBubble && idleBubble.who === "loca" && !menuOpen ? (
        <div className="hcat-bubble" aria-hidden="true">{idleBubble.text}</div>
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
      <div className="hcat-duo">
        <button
          type="button"
          className={`hcat-btn${menuOpen ? " is-open" : ""}`}
          onClick={() => { setIdleBubble(null); setMenuOpen((open) => !open) }}
          aria-label="도우미 로카냥 — 도움말 열기"
          aria-expanded={menuOpen}
        >
          <TuxCatSprite size={30} waving={menuOpen} />
        </button>
        {showFeedbackCat ? (
          <div className={`ccat${runPhase !== "idle" ? ` is-${runPhase}` : ""}`}>
            {cheeseBubbleText && !menuOpen ? (
              <div className="hcat-bubble ccat-bubble" aria-hidden="true">{cheeseBubbleText}</div>
            ) : null}
            <button
              type="button"
              className="ccat-btn"
              onClick={handleCheeseClick}
              disabled={runPhase !== "idle"}
              aria-label="치즈냥 — 로카에게 이야기 보내기"
            >
              <CheeseCatSprite size={40} waving={runPhase === "thanks"} />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
