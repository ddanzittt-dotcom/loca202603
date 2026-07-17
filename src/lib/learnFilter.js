// ② 배우기 탭 적합 분류 (스펙 D3) — 키워드/규칙 기반, 순수 모듈 (수집 스크립트·테스트 공용).
// 원칙: "탭 정서를 훼손하는 계열"만 보수적으로 배제(자격증·어학·수험·취업 실무),
// 나머지는 통과 — 공예·요리·운동·인문·문화예술이 배우기의 결이다.
// 오탐/누락은 분기 갱신마다 표본 검수 (스펙 §8).

const EXCLUDED_PATTERNS = [
  /자격(증|과정|취득|반)?/, // 자격증·자격 과정
  /[0-9]\s*급(?!식)/, // 한자 2급, 컴활 1급 등 급수 시험 (\b는 한글 뒤에서 무효 — lookahead로 '급식'만 방어)
  /어학|영어|영어회화|중국어|일본어|일어\s|한자\s*교실|한자\s*지도/, // 어학 계열
  /토익|토플|텝스|오픽|OPIc|HSK|JLPT|IELTS/i, // 어학 시험
  /수험|시험\s*대비|검정고시|공무원|고시\b/, // 수험
  /취업|창업\s*실무|면접|이력서|자기소개서|NCS/i, // 취업 실무
  /컴퓨터활용능력|워드프로세서|전산회계|정보처리|ITQ|GTQ|사무자동화/i, // 사무 자격
  /지게차|굴착기|중장비|운전면허/, // 면허 계열
  /부동산|공인중개사|주택관리사|경매/, // 부동산 수험
]

// 강좌가 배우기 탭에 어울리는가 — 제목+내용을 함께 검사
export function isLearnFitCourse(title, content = "") {
  const text = `${title || ""} ${content || ""}`
  return !EXCLUDED_PATTERNS.some((pattern) => pattern.test(text))
}

// 접수중 판정 — 접수기간(YYYY-MM-DD)이 오늘을 포함하면 true
export function isApplyOpen(applyStart, applyEnd, now = new Date()) {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  const start = String(applyStart || "").slice(0, 10)
  const end = String(applyEnd || "").slice(0, 10)
  if (!start && !end) return false
  if (start && today < start) return false
  if (end && today > end) return false
  return true
}

// 마감 임박 판정 — 접수중이면서 접수 종료가 D-3 이내 (①의 신호등 체계와 정합, 스펙 §5)
export function isApplyClosing(applyStart, applyEnd, now = new Date()) {
  if (!isApplyOpen(applyStart, applyEnd, now)) return false
  const end = String(applyEnd || "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return false
  const endDate = new Date(`${end}T23:59:59`)
  const daysLeft = Math.floor((endDate - now) / (24 * 60 * 60 * 1000))
  return daysLeft >= 0 && daysLeft <= 3
}
