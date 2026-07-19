import { useEffect, useState } from "react"
import { TuxCatSprite } from "./HelperCat"

// 로카냥 튜토리얼 — 포켓몬식 대화창. 챕터형 (docs/LOCANYANG_GUIDE_SPEC.md v1.1).
// 어두운 배경 + 중앙 스텝 카드 + 하단 대화창(타자기). 탭 1회 = 타이핑 완성, 2회 = 다음 스텝.
// 자동 재생(첫 입장·로그인 첫 진입)은 intro 챕터만, 나머지는 로카냥 메뉴에서 주제 선택.

const TUTORIAL_CHAPTERS = {
  intro: {
    closeLabel: "시작하기!",
    steps: [
      {
        emoji: "🐾",
        title: "LOCA는 이렇게 써요",
        desc: ["채집 → 바인더 → 지도 → 공유", "네 걸음이면 충분해요"],
        speech: "반가워! 나는 로카냥이야. LOCA 사용법을 차근차근 알려줄게!",
      },
      {
        emoji: "📍",
        title: "1. 장소를 카드로 담아요",
        desc: ["탐색에서 '카드로 담기'를 누르거나", "'내 장소'에서 직접 카드를 만들어요"],
        speech: "마음에 드는 곳을 발견하면 '담기'를 눌러봐! 그 자리에서 장소 카드 한 장이 만들어져. 아무도 등록 안 한 곳이면 'NEW FIND' 판정이 뜬다냥!",
      },
      {
        emoji: "🗂️",
        title: "2. 카드가 바인더에 모여요",
        desc: ["'내 장소'에서 카드를 누르면 뒤집혀요", "메모와 사진을 남길 수 있어요"],
        speech: "담은 카드는 '내 장소' 바인더에 꽂혀. 카드를 누르면 뒤집혀서 메모랑 사진을 남길 수 있어!",
      },
      {
        emoji: "🗺️",
        title: "3. 카드를 지도로 엮어요",
        desc: ["'내 지도'에서 새 지도를 만들고", "모은 카드를 골라 담아요"],
        speech: "카드가 모이면 '내 지도'에서 새 지도를 만들어봐. 골라 담기만 하면 나만의 지도 완성! 길이랑 영역도 그릴 수 있어.",
      },
      {
        emoji: "📣",
        title: "4. 링크로 나눠요",
        desc: ["지도는 링크와 이미지로 공유해요", "공개를 켜면 검색·탐색에도 나와요"],
        speech: "완성한 지도는 링크로 친구에게 건넬 수 있어. '검색·탐색에 공개'를 켜면 다른 사람도 네 지도를 발견해! 그럼, 좋은 채집 되길! 냐옹~",
      },
    ],
  },
  collect: {
    steps: [
      {
        emoji: "🧺",
        title: "채집 입구는 네 곳",
        desc: ["탐색 · 지도 · 내 장소 · 산책 모드", "어디서든 카드가 만들어져요"],
        speech: "장소를 담는 방법은 네 가지야. 탐색에서 '카드로 담기', 지도를 편집하며 핀 콕, '내 장소'의 '카드 만들기', 그리고 산책 모드에서 채집!",
      },
      {
        emoji: "📍",
        title: "위치부터 골라요",
        desc: ["지도를 움직여 자리를 맞추고", "'이 위치로 담기'를 눌러요"],
        speech: "먼저 어디를 담을지 정해. 지도를 움직여 자리를 맞추고 '이 위치로 담기'를 누르면, 내가 주변을 살펴볼게!",
      },
      {
        emoji: "✨",
        title: "SPOT / NEW FIND 판정",
        desc: ["이미 알려진 곳이면 SPOT", "지도에 없는 곳이면 NEW FIND!"],
        speech: "주변에 등록된 가게가 있으면 SPOT, 아무도 등록 안 한 곳이면 'NEW FIND — 새로운 곳 발견!'이야. 새발견 카드엔 ★이 붙는다냥!",
      },
      {
        emoji: "🏷️",
        title: "이름과 태그를 붙여요",
        desc: ["이름은 필수, 한줄 설명은 선택", "태그는 최대 6개까지"],
        speech: "이름을 짓고, 하고 싶은 말이 있으면 한줄 설명과 태그를 붙여줘. 마지막으로 '담기'를 누르면 끝!",
      },
      {
        emoji: "💡",
        title: "길·영역은 지도에서만",
        desc: ["채집으로 담는 건 '장소' 카드예요", "길·영역 카드는 지도에서 그려야 만들어져요"],
        speech: "채집으로 담는 건 '장소' 카드야. 길이랑 영역 카드는 지도 편집에서 직접 그려야만 만들 수 있어. '지도 만드는 법'에서 알려줄게!",
      },
    ],
  },
  binder: {
    steps: [
      {
        emoji: "🗂️",
        title: "내 장소 = 카드 바인더",
        desc: ["담은 카드가 도감번호 순으로 꽂혀요", "이름·메모·주소·타입으로 검색해요"],
        speech: "'내 장소'는 네 카드 바인더야. 담은 순서대로 도감번호가 붙고, 위 검색창으로 언제든 찾을 수 있어.",
      },
      {
        emoji: "🔄",
        title: "카드를 누르면 뒤집혀요",
        desc: ["앞면은 표지, 뒷면은 기록", "뒷면에서 모든 걸 할 수 있어요"],
        speech: "카드를 누르면 뒤집혀! 뒷면에서 편집, 사진, 기록, 공유까지 전부 할 수 있어.",
      },
      {
        emoji: "🎨",
        title: "카드 꾸미기",
        desc: ["'편집'으로 이름·설명·태그를 고쳐요", "영문 라벨은 공유 카드에 실려요"],
        speech: "'편집'을 누르면 이름과 설명, 태그를 고칠 수 있어. 영문 라벨을 넣으면 공유 카드에 근사하게 새겨진다냥!",
      },
      {
        emoji: "📷",
        title: "표지 사진과 초점",
        desc: ["'사진 담기'로 표지를 정하고", "'위치 조정'으로 초점을 맞춰요"],
        speech: "'사진 담기'로 표지 사진을 넣어봐. '위치 조정'을 누르면 사진을 끌어서 제일 예쁜 부분이 보이게 맞출 수 있어!",
      },
      {
        emoji: "✏️",
        title: "기록을 쌓아요",
        desc: ["'+ 기록 추가'로 메모와 사진을", "다녀올 때마다 남겨요"],
        speech: "다녀올 때마다 '+ 기록 추가'로 메모랑 사진을 남겨. 기록이 쌓일수록 카드가 두꺼워지는 거야!",
      },
      {
        emoji: "📤",
        title: "카드를 자랑해요",
        desc: ["피드 4:5 · 스토리 9:16", "카드 이미지를 만들어 공유해요"],
        speech: "'공유'를 누르면 카드가 인스타용 이미지가 돼. 피드용이랑 스토리용 중에 골라서 자랑해봐! 냐옹~",
      },
    ],
  },
  mapmaking: {
    steps: [
      {
        emoji: "🗺️",
        title: "새 지도 만들기",
        desc: ["'내 지도' 탭에서 '새 지도'를 눌러요", "이름을 짓고 담을 카드를 골라요"],
        speech: "'내 지도'에서 '새 지도'를 눌러봐. 지도 이름을 짓고, 모아둔 카드 중에 담을 것만 고르면 돼!",
      },
      {
        emoji: "🃏",
        title: "카드로 시작해요",
        desc: ["'N곳으로 지도 만들기'를 누르면", "고른 카드가 지도에 배치돼요"],
        speech: "카드를 고르고 'N곳으로 지도 만들기'를 누르면 바로 완성! 카드가 아직 없어도 '빈 지도로 시작'할 수 있어.",
      },
      {
        emoji: "📍",
        title: "장소(핀) 추가",
        desc: ["오른쪽 도크에서 '장소'를 누르고", "지도를 탭하면 바로 추가돼요"],
        speech: "편집 화면 오른쪽 도크를 봐. '장소'를 누르고 지도를 탭하면 그 자리에 핀이 콕! 이렇게 찍은 장소도 카드가 되어 바인더에 꽂혀. 검색으로 찾아 남길 수도 있어.",
      },
      {
        emoji: "〰️",
        title: "길 그리기",
        desc: ["지도를 탭해 순서대로 점을 찍고", "2개 이상이면 '길 완성'을 눌러요"],
        speech: "'길'을 누르고 지도를 탭하면 점이 순서대로 이어져. 산책 코스를 따라 찍고, 아래 '길 완성'을 누르면 돼!",
      },
      {
        emoji: "🟦",
        title: "영역 그리기",
        desc: ["꼭짓점을 3개 이상 찍고", "'영역 완성'을 눌러요"],
        speech: "'영역'은 꼭짓점을 찍어서 만들어. 3개 이상 찍으면 '영역 완성'이 켜져. 우리 동네 최애 구역을 칠해봐!",
      },
      {
        emoji: "➕",
        title: "카드 더 담기",
        desc: ["도크의 '카드' 버튼으로", "바인더 카드를 지도에 추가해요"],
        speech: "도크의 '카드' 버튼을 누르면 바인더에서 카드를 더 담을 수 있어. 카드 한 장이 여러 지도에 들어갈 수도 있다냥!",
      },
    ],
  },
  share: {
    steps: [
      {
        emoji: "🔗",
        title: "공유 링크",
        desc: ["편집 화면의 공유 버튼을 누르면", "짧은 링크가 만들어져요"],
        speech: "지도가 완성되면 위쪽 공유 버튼을 눌러봐. 짧은 링크가 뚝딱 만들어져. 이 링크는 아는 사람만 볼 수 있어!",
      },
      {
        emoji: "🌍",
        title: "검색·탐색에 공개",
        desc: ["공개를 켜면 검색 결과·탐색·프로필에", "지도가 노출돼요"],
        speech: "'검색·탐색에 공개'를 켜면 다른 사람들도 네 지도를 발견할 수 있어. 자신 있는 지도는 공개해봐!",
      },
      {
        emoji: "🙈",
        title: "다시 감추기",
        desc: ["'링크 공유'를 끄면 링크가 회수되고", "공개·프로필 노출도 함께 꺼져요"],
        speech: "마음이 바뀌면 '링크 공유'를 끄면 돼. 링크가 무효가 되고 공개도 같이 꺼지니까 안심해!",
      },
      {
        emoji: "🖼️",
        title: "이미지로 공유",
        desc: ["'이미지 공유'로 도트맵 카드를", "만들어 저장·공유해요"],
        speech: "'이미지 공유'를 누르면 지도가 도트 카드 이미지가 돼! 프레임이랑 스티커로 꾸며서 나눠봐.",
      },
      {
        emoji: "👥",
        title: "함께 만들기",
        desc: ["친구 아이디(@)를 검색해", "편집자로 초대해요"],
        speech: "지도는 같이 만들 수도 있어! '함께 만들기'에서 친구 아이디를 검색해 초대하면, 친구가 수락한 뒤 같이 기록할 수 있다냥.",
      },
    ],
  },
  explore: {
    steps: [
      {
        emoji: "🧭",
        title: "다섯 가지 탭",
        desc: ["전체 · 즐기기 · 배우기", "걷기·머물기 · 자연"],
        speech: "탐색엔 다섯 탭이 있어. 즐기기는 행사·축제, 배우기는 강좌·전시, 걷기·머물기는 공원·시장·둘레길, 자연은 주변 생물이야!",
      },
      {
        emoji: "📡",
        title: "픽셀 레이더",
        desc: ["주변을 도트로 탐지해요", "실제 지도는 아니에요"],
        speech: "위쪽 레이더는 주변에 뭐가 있는지 방향과 거리로 보여주는 탐지기야. '내 위치 주변'을 누르면 내 자리 기준으로 다시 탐지해!",
      },
      {
        emoji: "📄",
        title: "자세히 보기",
        desc: ["항목을 누르면 사진·지도·연락처", "외부 링크까지 볼 수 있어요"],
        speech: "궁금한 곳을 눌러봐. 사진이랑 지도를 번갈아 볼 수 있고, 전화나 자세한 정보 링크도 있어.",
      },
      {
        emoji: "🧺",
        title: "바로 담기",
        desc: ["'카드로 담기'를 누르면", "그대로 채집으로 이어져요"],
        speech: "마음에 들면 '카드로 담기'! 이름이랑 위치가 미리 채워진 채로 채집이 시작돼. 편하지? 냐옹~",
      },
    ],
  },
  walk: {
    steps: [
      {
        emoji: "🐾",
        title: "게임으로 동네 탐색",
        desc: ["왼쪽 위 loca. 로고 → 타이틀 화면", "'게임으로 동네 탐색하기'를 눌러요"],
        speech: "왼쪽 위 loca. 로고를 누르면 타이틀 화면이 나와. 거기서 '게임으로 동네 탐색하기'를 누르면 산책 모드 시작이야!",
      },
      {
        emoji: "🗺️",
        title: "내 동네 스캔",
        desc: ["'내 동네 지도 스캔'을 누르면", "실제 골목·강·공원이 게임 월드가 돼요"],
        speech: "'내 동네 지도 스캔'을 누르면 진짜 우리 동네 골목이랑 공원이 픽셀 월드로 변신해! 신기하다냥.",
      },
      {
        emoji: "❓",
        title: "물음표를 찾아가요",
        desc: ["가까이 가면 정체가 밝혀져요", "채집하면 새발견 카드가 돼요"],
        speech: "월드 곳곳의 ❓에 다가가 봐. 근처에서 관측된 진짜 생물이 나타나! '채집하기'를 누르면 새발견 카드가 된다냥.",
      },
      {
        emoji: "🧭",
        title: "동네 끝에서 다시 스캔",
        desc: ["끝에 닿으면 그 자리에서 다시 스캔해", "옆 동네로 이어 걸어요"],
        speech: "동네 끝까지 가면 '여기서 다시 스캔'으로 옆 동네까지 이어 걸을 수 있어. 자동 산책(🐾)을 켜고 구경만 해도 좋아!",
      },
    ],
  },
}

// 타자기 효과 — PlaceFlipCard 의 useTypewriter 와 같은 패턴 (키 기반 진행 상태)
function useTypewriter(text) {
  const key = `${text || ""}`
  const [progress, setProgress] = useState({ key: "", count: 0 })
  const count = progress.key === key ? progress.count : 0

  useEffect(() => {
    if (!key) return undefined
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
    const timer = window.setInterval(() => {
      setProgress((current) => {
        const base = current.key === key ? current.count : 0
        if (base >= key.length) return current
        return { key, count: reduced ? key.length : base + 1 }
      })
    }, 28)
    return () => window.clearInterval(timer)
  }, [key])

  const complete = () => setProgress({ key, count: key.length })
  return [key.slice(0, count), count >= key.length, complete]
}

export function TutorialDialog({ chapter = "intro", onClose }) {
  const active = TUTORIAL_CHAPTERS[chapter] || TUTORIAL_CHAPTERS.intro
  const [step, setStep] = useState(0)
  const current = active.steps[Math.min(step, active.steps.length - 1)]
  const [typed, typingDone, completeTyping] = useTypewriter(current.speech)
  const isLast = step >= active.steps.length - 1

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === "Escape") onClose?.()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [onClose])

  const advance = () => {
    if (!typingDone) {
      completeTyping()
      return
    }
    if (isLast) onClose?.()
    else setStep((value) => value + 1)
  }

  return (
    <div className="tut-ov" role="dialog" aria-modal="true" aria-label="LOCA 사용법 안내">
      <button type="button" className="tut-skip" onClick={onClose}>건너뛰기 ✕</button>

      {/* 중앙 스텝 카드 */}
      <div className="tut-card" key={`${chapter}-${step}`}>
        <span className="tut-card__emoji" aria-hidden="true">{current.emoji}</span>
        <strong className="tut-card__title">{current.title}</strong>
        {current.desc.map((line) => (
          <p key={line} className="tut-card__desc">{line}</p>
        ))}
        <div className="tut-dots" aria-label={`${step + 1} / ${active.steps.length}`}>
          {active.steps.map((item, index) => (
            <span key={item.title} className={`tut-dot${index === step ? " is-on" : ""}`} />
          ))}
        </div>
      </div>

      {/* 하단 대화창 */}
      <button type="button" className="tut-dlg" onClick={advance}>
        <span className="tut-dlg__cat" aria-hidden="true"><TuxCatSprite size={40} waving /></span>
        <span className="tut-dlg__name">로카냥</span>
        <span className="tut-dlg__text">
          {typed}
          {typingDone ? null : <span className="tut-dlg__caret" aria-hidden="true">_</span>}
        </span>
        {typingDone ? (
          <span className="tut-dlg__next" aria-hidden="true">{isLast ? (active.closeLabel || "알겠어!") : "▼"}</span>
        ) : null}
      </button>
      <p className="tut-hint" aria-hidden="true">대화창을 탭하면 다음으로 넘어가요</p>
    </div>
  )
}
