import { describe, expect, it } from "vitest"
import { isApplyOpen, isLearnFitCourse } from "./learnFilter"

describe("isLearnFitCourse (D3 — 배우기 탭 적합 분류)", () => {
  it("공예·요리·운동·인문 계열은 통과", () => {
    expect(isLearnFitCourse("손끝에서 피어나는 감성 모루공예")).toBe(true)
    expect(isLearnFitCourse("우리 동네 빵집 투어와 홈베이킹", "발효빵 기초")).toBe(true)
    expect(isLearnFitCourse("몸을 깨우는 롤링 스트레칭")).toBe(true)
    expect(isLearnFitCourse("일상을 시로 가꾸는 시간", "지역작가와 함께 짧은 글쓰기")).toBe(true)
  })

  it("자격증·급수 시험 계열은 배제", () => {
    expect(isLearnFitCourse("바리스타 자격증 취득반")).toBe(false)
    expect(isLearnFitCourse("한자 2급 대비반")).toBe(false)
    expect(isLearnFitCourse("컴퓨터활용능력 실기")).toBe(false)
    expect(isLearnFitCourse("지게차 운전기능사")).toBe(false)
  })

  it("어학·수험·취업 계열은 배제", () => {
    expect(isLearnFitCourse("왕초보 영어회화")).toBe(false)
    expect(isLearnFitCourse("토익 850 목표반")).toBe(false)
    expect(isLearnFitCourse("공무원 시험 대비 국어")).toBe(false)
    expect(isLearnFitCourse("취업 성공 이력서 클리닉")).toBe(false)
  })

  it("내용(강좌 소개)에 배제 키워드가 있어도 걸러진다", () => {
    expect(isLearnFitCourse("실무 스킬업", "전산회계 1급 자격 대비")).toBe(false)
  })
})

describe("isApplyOpen (접수중 판정)", () => {
  const day = (offset) => {
    const date = new Date(2026, 6, 17)
    date.setDate(date.getDate() + offset)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
  }
  const now = new Date(2026, 6, 17)

  it("접수기간 안이면 true", () => {
    expect(isApplyOpen(day(-3), day(5), now)).toBe(true)
    expect(isApplyOpen(day(0), day(0), now)).toBe(true)
  })

  it("시작 전·종료 후·기간 없음이면 false", () => {
    expect(isApplyOpen(day(1), day(9), now)).toBe(false)
    expect(isApplyOpen(day(-9), day(-1), now)).toBe(false)
    expect(isApplyOpen("", "", now)).toBe(false)
    expect(isApplyOpen(null, null, now)).toBe(false)
  })

  it("한쪽만 있어도 판정 (종료일만 = 그날까지 접수)", () => {
    expect(isApplyOpen("", day(3), now)).toBe(true)
    expect(isApplyOpen(day(-3), "", now)).toBe(true)
  })
})
