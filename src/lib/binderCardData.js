import { buildFeatureRecordGroups } from "./featureRecordGroups"
import { getPlaceType } from "./placeTypes"
import { resolveFeatureEmoji } from "../components/FeatureEmoji"

// 바인더 카드가 쓰는 파생값 헬퍼 (컴포넌트와 분리 — react-refresh 규칙)

// 표지(대표) 사진 — 카드에 "지정한" 표지만 반환한다. 기록(메모) 사진은 표지로 승격하지 않는다.
// 표지와 기록 사진을 분리: 사진을 기록해도 표지가 멋대로 바뀌지 않는다.
// 표지 사진은 저장 경로에 따라 여러 형태로 온다:
//   1) 로컬/신 컬럼: emojiKind:"photo" + emojiPhotoUrl
//   2) Supabase 레거시 왕복: emoji 문자열 "loca-emoji:photo:URL" (emojiKind 는 unicode 로 정규화됨)
//   3) emoji 객체 { kind:"photo", value:URL }
// 어떤 형태든 photo 서술자면 full-bleed 로 보이도록 URL 을 돌려준다.
// 지정한 표지가 없으면 null → 카드 고유 픽셀 아트로 렌더한다.
export function representativePhoto(feature) {
  if (feature?.emojiKind === "photo" && feature?.emojiPhotoUrl) return feature.emojiPhotoUrl
  const descriptor = resolveFeatureEmoji(feature)
  if (descriptor?.kind === "photo" && descriptor.value) return descriptor.value
  return null
}

// 이름(+태그) 키워드로 도트형 픽셀 이모지 추정 — 사진 없을 때 카드 아트
const PIN_KEYWORD_ICONS = [
  [/카페|커피|coffee|로스터|브루잉|에스프레소|라떼|아메리카노/i, "px-cafe"],
  [/티룸|녹차|홍차|밀크티|버블티/i, "px-tea"],
  [/베이커리|제과|빵|bakery|bread|밀도|크로플|도넛/i, "px-bread"],
  [/케이크|디저트|파티세리|타르트/i, "px-cake"],
  [/아이스크림|젤라또|빙수/i, "px-icecream"],
  [/국수|면\b|라멘|우동|파스타|칼국수|noodle/i, "px-noodle"],
  [/김밥|분식|떡볶이/i, "px-kimbap"],
  [/만두|교자|딤섬/i, "px-dumpling"],
  [/피자|pizza/i, "px-pizza"],
  [/버거|햄버거|burger/i, "px-burger"],
  [/족발|보쌈|고기|구이|삼겹|곱창|국밥|백반|식당|밥집|한식|맛집|정식|쌀|비빔/i, "px-restaurant"],
  [/술|펍|호프|이자카야|와인|맥주|양조|브루어리|포차|막걸리|칵테일|bar\b/i, "px-beer"],
  [/편의점|gs25|세븐|이마트24|미니스톱|cu\b/i, "px-convenience"],
  [/시장|마켓|상회|market|슈퍼/i, "px-market"],
  [/책|서점|북\b|도서|문고|book/i, "px-book"],
  [/갤러리|미술|전시|아트|gallery/i, "px-gallery"],
  [/사진|포토|카메라|스튜디오/i, "px-camera"],
  [/음악|레코드|엘피|lp\b|바이닐|music/i, "px-music"],
  [/헬스|피트니스|짐\b|클라이밍|요가|필라테스/i, "px-gym"],
  [/병원|의원|치과|클리닉/i, "px-hospital"],
  [/약국/i, "px-pharmacy"],
  [/학교|대학|캠퍼스/i, "px-school"],
  [/은행|bank/i, "px-bank"],
  [/호텔|모텔|숙소|게스트하우스|한옥스테이|펜션/i, "px-hotel"],
  [/미용|헤어|바버|이발/i, "px-barber"],
  [/세탁|빨래방|코인워시/i, "px-laundry"],
  [/공원|park/i, "px-park"],
  [/숲|수목|정원|garden|식물원|가든/i, "px-garden"],
  [/산\b|봉우리|등산|mountain/i, "px-mountain"],
  [/강\b|천\b|하천|river/i, "px-river"],
  [/호수|저수지|연못/i, "px-lake"],
  [/해변|바다|해수욕|백사장|해안|beach/i, "px-beach"],
  [/집\b|우리집|하우스|home/i, "px-house"],
  [/성\b|산성|궁\b|castle/i, "px-castle"],
  [/캠핑|텐트|글램핑/i, "px-tent"],
]
const ROUTE_KEYWORD_ICONS = [
  [/다리|교\b|bridge/i, "px-bridge"],
  [/계단|stairs/i, "px-stairs"],
  [/골목|alley/i, "px-alley"],
  [/횡단|건널목/i, "px-crosswalk"],
  [/자전거|라이딩/i, "px-bike"],
]
const AREA_KEYWORD_ICONS = [
  [/공원|park/i, "px-park"],
  [/해변|바다|백사장|해수욕|beach/i, "px-beach"],
  [/숲|정원|수목|garden/i, "px-garden"],
  [/광장|놀이터|playground/i, "px-playground"],
]
// 타입(지오메트리)별 기본 도트 아이콘 — 사진/키워드 매칭이 없을 때 폴백
const TYPE_DEFAULT_ICON = {
  place: "px-pin", walk: "px-route", area: "px-map",
}

function matchKeyword(list, text, fallback) {
  for (const [re, id] of list) {
    if (re.test(text)) return id
  }
  return fallback
}

// 사진 없을 때 쓸 도트 이모지 id — 이름을 고려해 자동 배치
export function guessPixelId(feature) {
  const text = [feature?.title, ...(feature?.tags || [])].join(" ")
  if (feature?.type === "route") return matchKeyword(ROUTE_KEYWORD_ICONS, text, "px-route")
  if (feature?.type === "area") return matchKeyword(AREA_KEYWORD_ICONS, text, "px-map")
  const typeDefault = TYPE_DEFAULT_ICON[getPlaceType(feature)?.id] || "px-pin"
  return matchKeyword(PIN_KEYWORD_ICONS, text, typeDefault)
}

// 카드 아트에 넣을 이모지 서술자 — photo 대표사진이 없을 때만 픽셀 이모지 사용
export function cardArtFeature(feature) {
  return { ...feature, emojiKind: "pixel", emojiPixelId: guessPixelId(feature) }
}

export function getCardPhotos(feature) {
  const own = Array.isArray(feature?.photos) ? feature.photos : []
  const memo = (feature?.memos || []).flatMap((m) => (Array.isArray(m.photos) ? m.photos : []))
  return [...own, ...memo]
    .map((photo) => (typeof photo === "string" ? photo : photo?.url || photo?.thumbnail || photo?.src || photo?.cloudUrl || ""))
    .filter(Boolean)
}

export function cardRecordCount(feature) {
  if (!feature) return 0
  return buildFeatureRecordGroups(feature).length
}

// 타입 컬러(hex) → 슬리브 커버용 파스텔/딥 톤 계산 (ratio = 섞을 색 비율 0~1)
function parseHexColor(hex) {
  const s = `${hex || ""}`.replace("#", "").trim()
  if (s.length !== 6) return null
  return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) }
}
export function mixHex(hex, mixWith, ratio) {
  const a = parseHexColor(hex)
  const b = parseHexColor(mixWith)
  if (!a || !b) return hex
  const mix = (x, y) => Math.round(x + (y - x) * ratio)
  return `#${[mix(a.r, b.r), mix(a.g, b.g), mix(a.b, b.b)].map((n) => n.toString(16).padStart(2, "0")).join("")}`
}

export function formatDotDate(value) {
  const d = new Date(value || NaN)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`
}

// 채집된 카드의 note 는 주소인 경우가 많다 — 주소처럼 보이면 스펙의 주소 줄로 보낸다.
// 단, 설명(서술문)은 주소가 아니다. 탐색 큐레이션 소개를 붙여넣으면 문장 안에
// 주소 조각("천안시 서북구")이 들어가 통째로 주소로 오분류되던 문제 방지.
// 실제 주소는 종결어미(다/요…)나 서술어(있다/입니다…)·문장부호로 끝나지 않으므로,
// 그런 서술 신호가 보이면 주소가 아닌 설명으로 판정한다(실주소 오탐 없음).
const SENTENCE_SIGNALS = /(다|요|죠|음|임|함)$|[.!?…]$|(있|없|입니다|습니다|이에요|예요|해요|이다|하다)/
export function looksLikeAddress(text) {
  const t = `${text || ""}`.trim()
  if (!t || t.length > 60) return false
  if (SENTENCE_SIGNALS.test(t)) return false
  return /(로|길)\s?\d|(동|리)\s?\d|번길|[가-힣]+(시|군)\s[가-힣]/.test(t)
}

// 공유 카드 "지역" 표시용 — 역지오코딩 regionName 에서 "시/군 + 읍/면/동"만 뽑는다.
// 예) "충청남도 천안시 동남구 목천읍" → "천안시 목천읍" / "경상북도 경주시 황남동" → "경주시 황남동"
// regionName 이 없으면 주소성 note 에서 시/군·동 어절을 시도, 그래도 없으면 빈 문자열.
export function regionLabel(feature) {
  const pick = (words) => {
    const city = words.find((w) => /(시|군)$/.test(w))
    const gu = words.find((w) => /구$/.test(w))
    const dong = words.find((w) => /(동|읍|면)$/.test(w))
    const head = city || gu || ""
    if (head && dong) return `${head} ${dong}`
    return dong || head || ""
  }
  const region = `${feature?.regionName || ""}`.trim()
  if (region) return pick(region.split(/\s+/))
  const note = `${feature?.note || ""}`.trim()
  if (looksLikeAddress(note)) return pick(note.split(/\s+/))
  return ""
}

export function neighborhoodWord(feature, mapTitle) {
  const note = `${feature?.note || ""}`.trim()
  if (looksLikeAddress(note)) {
    const words = note.split(/\s+/)
    const gu = words.find((w) => /(구|군|동|읍|면)$/.test(w))
    return gu || words[0]
  }
  return mapTitle || null
}
