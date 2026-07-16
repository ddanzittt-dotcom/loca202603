// 오일장 개설주기 — 파싱(수집 스크립트)과 "오늘 장" 판정(클라이언트) 공용 순수 모듈.
// 표준데이터 시장개설주기는 자유 텍스트("5일+10일", "매월 2, 7일", "상설장" 등)라
// 숫자 끝자리 규칙으로 정규화한다: 5일장 = 5·15·25일, 10일장 = 10·20·30일.

// 개설주기 원문 → 날짜 끝자리 배열 (1~10, 10은 0 끝자리 의미). 상설/매일-전용이면 [].
export function parseMarketDays(cycleText) {
  const text = String(cycleText || "").trim()
  if (!text) return []
  const digits = [...text.matchAll(/(\d{1,2})\s*(?:일|,|\+|·|\.|$|\s)/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 10)
  return [...new Set(digits)].sort((a, b) => a - b)
}

// 오늘이 장날인가 — dayOfMonth 끝자리가 주기 끝자리와 일치하면 장날 (10 ↔ 0)
export function isMarketDayToday(marketDays, now = new Date()) {
  if (!Array.isArray(marketDays) || marketDays.length === 0) return false
  const lastDigit = now.getDate() % 10
  return marketDays.some((day) => day % 10 === lastDigit)
}
