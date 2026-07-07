import { findPixelArt } from "./pixelEmojiCatalog"

// 탐색 레이더 마커용 도트 스프라이트 (12×12, PIXEL_PALETTE 문자 그리드).
// 생물 20종 + 행사 1 + 공간(기존 카탈로그 재사용). drawPixelArtToCanvas 로 캔버스에 렌더.
// motion: "hop"(동물 점프) | "sway"(식물 흔들) | "bob"(공간 둥실) | "bounce"(행사 통통)

// ── 생물 20종 ──
const WILD = {
  // 새 6
  duck: ["............", ".....WWW....", "....WWWWy...", "....WKWWy...", "....WWWW....", "...WWWWWW...", "..WWWWWWWW..", "..WWWWWWWW..", "...WWWWWW...", "....y..y....", "............", "............"],
  magpie: ["............", "....KK......", "...KKKK.....", "...KWKK.....", "...KKKK.....", "..KKWWW.....", "..KWWWWK....", "..KWWKKkk...", "...KKKkkkk..", "......kkkk..", "............", "............"],
  sparrow: ["............", "............", "....CCC.....", "...CcccC....", "...CKccC....", "...ccccC....", "..ccwwccC...", "..cwwwwcC...", "...wwww.....", "....C.C.....", "............", "............"],
  pigeon: ["............", ".....SSS....", "....SSSSk...", "....SKSS....", "....SSSS....", "...SSSSSm...", "..SSSSSSS...", "..SwSSSSS...", "...SSSSS....", "....p.p.....", "............", "............"],
  heron: [".....WW.....", "....WWW.yy..", "....WKW.....", ".....W......", ".....W......", "....WWW.....", "...WWWWW....", "...WWWWW....", "....WWW.....", ".....K.K....", ".....K.K....", "............"],
  swallow: ["............", "............", ".BB......BB.", ".BBB....BBB.", "..BBB..BBB..", "...BBBBBB...", "...BwwwB....", "....BwB.....", "....B.B.....", "............", "............", "............"],
  // 포유 4
  squirrel: ["............", "...CC....CC.", "..CccC..CCCc", "..CKcC.CCCCc", "..CcccCCCCc.", "..wwcccccc..", "..wwcccc....", "...CccC.....", "...C..C.....", "............", "............", "............"],
  cat: ["............", "..K.....K...", ".KKK...KKK..", ".KKKKKKKKK..", ".KKWKKWKKK..", ".KKKKKKKKK..", ".KKwwwwKKK..", "..KwwwwKK...", "..KwwwwKK...", "...KKKKK....", "............", "............"],
  deer: ["............", ".cc.........", ".ccc........", "..cc.ccccc..", "..cccccccc..", "...ccccccc..", "...C.CC.CC..", "...C.CC.C...", "............", "............", "............", "............"],
  rabbit: ["....S.S.....", "....S.S.....", "....SSS.....", "...SwwwS....", "...SwKwS....", "...SwwwS....", "..SwwwwwS...", "..SwwwwwS...", "...SwwwS....", "....p.p.....", "............", "............"],
  // 양서·파충 4
  frog: ["............", "...G...G....", "..GgG.GgG...", "..GKG.GKG...", "..GgggggG...", ".GggggggggG.", ".GgwwwwwggG.", ".GgggggggG..", "..G..GG..G..", ".G........G.", "............", "............"],
  turtle: ["............", "............", "g...CCCC....", "gg.CCCCCC...", ".gCddddddC..", ".CCddCCddC..", ".CCddddddC..", ".gCCCCCCCg..", "..g.CC.g....", "............", "............", "............"],
  snake: ["............", "....ggg.....", "...gGGGg....", "...gGKGr....", "...gGGGg....", "....gGGgg...", "......gGGg..", ".....gGGg...", "....gGGg....", "...gGGg.....", "...gg.......", "............"],
  lizard: ["............", ".Mg.........", ".gMg........", "..gMMg......", ".g.MMMg.....", ".gggMMMMg...", "...gMMMMMg..", "....g.gMMMg.", ".......gMMMg", "..........gg", "............", "............"],
  // 물 1
  fish: ["............", "............", "...rrrr.....", "..rrrrrrr.o.", ".rKrrWWrroo.", ".rrrrWWrroo.", "..rrrrrrr.o.", "...rrrr.....", "............", "............", "............", "............"],
  // 식물 5
  cherry: ["............", "....p.p.....", "...pqpqp....", "..ppqYqpp...", "...pqpqp....", "....p.p.....", ".....C......", "....C.......", "...C........", "............", "............", "............"],
  tree: ["............", "....GGG.....", "..GGgggGG...", ".GgggggggG..", ".GgglgggG...", ".GggggggggG.", "..GgggggG...", "....CCC.....", "....CCC.....", "....CCC.....", "...CCCCC....", "............"],
  reed: ["............", "...d.d...d..", "..dd.dd.dd..", "..dd.dd.dd..", "...C.C...C..", "...C.C...C..", "...C.C...C..", "...C.C...C..", "..gGCgCgCg..", "............", "............", "............"],
  dandelion: ["............", "....yyy.....", "...yyLyy....", "...yyyyy....", "....yyy.....", ".....y......", "..g..y..g...", "...g.y.g....", "....gyg.....", "............", "............", "............"],
  maple: ["............", ".....r......", "..r..r..r...", "..rr.r.rr...", "...rrrrrr...", ".rrrrrrrrr..", "..rrrrrrr...", "...r.r.r....", "....rrr.....", ".....C......", ".....C......", "............"],
}

// 행사 — 줄무늬 축제 텐트
const EVENT_GRID = [".....r......", ".....r......", "....rrr.....", "...rrrrr....", "..ryryryr...", ".ryryryryr..", ".rryryryrr..", ".rrrrrrrrr..", ".rrwrrrwrr..", ".rrwrrrwrr..", ".rrrrrrrrr..", "............"]

const PLANT_KEYS = new Set(["cherry", "tree", "reed", "dandelion", "maple"])

// 종명(한글 common name) → 스프라이트 키 (첫 매치 우선)
const NAME_RULES = [
  [/오리|물오리|비오리|기러기|고니|백조/, "duck"],
  [/까치|물까치|까마귀|직박구리|찌르레기/, "magpie"],
  [/참새|박새|곤줄박이|딱새|붉은머리|오목눈이|뱁새/, "sparrow"],
  [/비둘기|멧비둘기/, "pigeon"],
  [/백로|왜가리|해오라기|황새|두루미/, "heron"],
  [/제비|칼새|물총새/, "swallow"],
  [/청설모|다람쥐/, "squirrel"],
  [/고양이|길고양이/, "cat"],
  [/고라니|노루|사슴/, "deer"],
  [/토끼|멧토끼/, "rabbit"],
  [/개구리|청개구리|맹꽁이|두꺼비/, "frog"],
  [/거북|자라|남생이/, "turtle"],
  [/뱀|살모사|유혈목|구렁이/, "snake"],
  [/도마뱀|장지뱀|도롱뇽/, "lizard"],
  [/잉어|붕어|물고기|피라미|송사리|메기|가물치|블루길|배스|납자루|버들치/, "fish"],
  [/벚|매화|살구|복숭아|철쭉|진달래|장미|동백|목련|배롱|찔레/, "cherry"],
  [/갈대|억새|부들|띠풀|물억새/, "reed"],
  [/민들레|씀바귀|해바라기|국화|코스모스|괭이밥|제비꽃|봄맞이|냉이꽃|유채/, "dandelion"],
  [/단풍/, "maple"],
  [/소나무|잣나무|참나무|느티|은행|버드나무|벚나무|밤나무|가시나무|나무|측백|향나무/, "tree"],
]

const GROUP_FALLBACK = {
  Aves: "sparrow", Mammalia: "squirrel", Amphibia: "frog",
  Reptilia: "lizard", Actinopterygii: "fish", Plantae: "tree",
}

// 공간 kind → 기존 카탈로그 도트 id
const PLACE_KIND_SPRITE = {
  nature: "px-mountain", history: "px-castle", park: "px-park",
  exhibit: "px-gallery", cafe: "px-cafe", book: "px-book", market: "px-market",
}

function wildKey(title, group) {
  const text = `${title || ""}`
  for (const [re, key] of NAME_RULES) if (re.test(text)) return key
  return GROUP_FALLBACK[group] || "sparrow"
}

/**
 * 레이더 아이템 → 도트 스프라이트 { grid, motion }.
 * drawPixelArtToCanvas 에 그대로 넘길 수 있다(.grid 보유).
 */
export function spriteForRadarItem(type, raw = {}) {
  if (type === "event") return { grid: EVENT_GRID, motion: "bounce" }
  if (type === "place") {
    const art = findPixelArt(PLACE_KIND_SPRITE[raw.kind]) || findPixelArt("px-map")
    return { grid: art ? art.grid : EVENT_GRID, motion: "bob" }
  }
  // wildlife
  const key = wildKey(raw.title, raw.taxonGroup)
  return { grid: WILD[key] || WILD.sparrow, motion: PLANT_KEYS.has(key) ? "sway" : "hop" }
}
