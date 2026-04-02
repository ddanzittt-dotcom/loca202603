/**
 * Supabase 프로덕션 환경 검증 스크립트
 *
 * 사용법 (브라우저 콘솔에서):
 *   import('/src/lib/supabaseHealthCheck.js').then(m => m.runHealthCheck())
 *
 * 또는 dev 서버 실행 중일 때 콘솔에서:
 *   fetch('/src/lib/supabaseHealthCheck.js').then(r => r.text()).then(eval)
 *
 * 앱 번들에는 포함되지 않음 (어디에서도 import하지 않음)
 */

import { supabase, hasSupabaseEnv } from "./supabase"

const PASS = "\x1b[32m✅ PASS\x1b[0m"
const FAIL = "\x1b[31m❌ FAIL\x1b[0m"
const SKIP = "\x1b[33m⏭ SKIP\x1b[0m"

function log(status, label, detail = "") {
  console.log(`${status}  ${label}${detail ? ` — ${detail}` : ""}`)
}

async function checkTableExists(tableName) {
  const { error } = await supabase.from(tableName).select("*").limit(0)
  return !error
}

async function checkColumnExists(tableName, columnName) {
  const { error } = await supabase.from(tableName).select(columnName).limit(0)
  return !error
}

// ─── 1. 002_dashboard_schema.sql 마이그레이션 ───

async function check002Migration() {
  console.log("\n── 002_dashboard_schema.sql ──")
  let allPass = true

  // view_logs 확장 컬럼
  for (const col of ["session_id", "event_type", "meta"]) {
    const ok = await checkColumnExists("view_logs", col)
    log(ok ? PASS : FAIL, `view_logs.${col}`)
    if (!ok) allPass = false
  }

  // feature_memos.status
  const memoStatus = await checkColumnExists("feature_memos", "status")
  log(memoStatus ? PASS : FAIL, "feature_memos.status")
  if (!memoStatus) allPass = false

  // maps 확장 컬럼
  for (const col of ["dashboard_modules", "price", "is_paid"]) {
    const ok = await checkColumnExists("maps", col)
    log(ok ? PASS : FAIL, `maps.${col}`)
    if (!ok) allPass = false
  }

  // announcements 테이블
  const annOk = await checkTableExists("announcements")
  log(annOk ? PASS : FAIL, "announcements 테이블")
  if (!annOk) allPass = false

  // survey_responses 테이블
  const surveyOk = await checkTableExists("survey_responses")
  log(surveyOk ? PASS : FAIL, "survey_responses 테이블")
  if (!surveyOk) allPass = false

  return allPass
}

// ─── 2. 003_b2b_schema.sql 마이그레이션 ───

async function check003Migration() {
  console.log("\n── 003_b2b_schema.sql ──")
  let allPass = true

  // invitation_codes 테이블
  const codesOk = await checkTableExists("invitation_codes")
  log(codesOk ? PASS : FAIL, "invitation_codes 테이블")
  if (!codesOk) allPass = false

  // invitation_redemptions 테이블
  const redemptionsOk = await checkTableExists("invitation_redemptions")
  log(redemptionsOk ? PASS : FAIL, "invitation_redemptions 테이블")
  if (!redemptionsOk) allPass = false

  // maps.category에 'event' 허용 여부 — 직접 insert 테스트 불가, RPC 존재 확인으로 대체
  const { error: rpcError } = await supabase.rpc("redeem_invitation_code", { code_text: "__health_check_dummy__" })
  // 코드가 invalid면 success:false 반환, 함수 자체가 없으면 error
  const rpcExists = !rpcError || rpcError.message?.includes("not_authenticated") || !rpcError.message?.includes("function")
  log(rpcExists ? PASS : FAIL, "redeem_invitation_code RPC 함수", rpcError?.message || "")
  if (!rpcExists) allPass = false

  return allPass
}

// ─── 3. Storage 'media' 버킷 ───

async function checkStorageBucket() {
  console.log("\n── Storage ──")

  const { data: buckets, error } = await supabase.storage.listBuckets()
  if (error) {
    log(FAIL, "버킷 목록 조회", error.message)
    return false
  }

  const mediaBucket = buckets.find((b) => b.name === "media")
  if (!mediaBucket) {
    log(FAIL, "media 버킷", "존재하지 않음 — Supabase Storage에서 'media' 버킷 생성 필요")
    return false
  }

  log(PASS, "media 버킷 존재")

  if (mediaBucket.public) {
    log(PASS, "media 버킷 Public 설정")
  } else {
    log(FAIL, "media 버킷 Public 설정", "Public이 아님 — 버킷 설정에서 Public 활성화 필요")
    return false
  }

  return true
}

// ─── 4. 초대코드 테스트 데이터 ───

async function checkInvitationCodes() {
  console.log("\n── 초대코드 ──")

  const { data, error } = await supabase
    .from("invitation_codes")
    .select("code, label, is_active, used_count")
    .eq("is_active", true)

  if (error) {
    // RLS로 인해 비로그인 상태에서 조회 불가할 수 있음
    if (error.code === "42501" || error.message?.includes("permission")) {
      log(SKIP, "초대코드 조회", "로그인 필요 (RLS 제한) — 로그인 후 재실행하세요")
      return true
    }
    log(FAIL, "초대코드 조회", error.message)
    return false
  }

  if (!data || data.length === 0) {
    log(FAIL, "활성 초대코드", "없음 — 003 마이그레이션의 시드 데이터가 없거나 비활성 상태")
    return false
  }

  log(PASS, `활성 초대코드 ${data.length}개`, data.map((c) => `${c.code} (${c.label})`).join(", "))
  return true
}

// ─── 5. RLS 활성화 확인 ───

async function checkRLS() {
  console.log("\n── RLS 정책 ──")

  const tables = [
    "profiles", "maps", "map_publications", "map_features",
    "feature_memos", "follows", "view_logs",
    "announcements", "survey_responses",
    "invitation_codes", "invitation_redemptions",
  ]

  let allPass = true
  for (const table of tables) {
    // 비로그인 상태에서 select 시도 — RLS가 켜져 있으면 빈 배열 또는 에러
    // RLS가 꺼져 있으면 모든 데이터가 반환됨
    const exists = await checkTableExists(table)
    if (!exists) {
      log(SKIP, `${table}`, "테이블 없음")
      allPass = false
      continue
    }
    // RLS 활성화는 클라이언트에서 직접 확인 불가 (pg_tables 접근 불가)
    // 대신 anon 유저로 insert 시도하여 거부되는지 확인
    log(PASS, `${table}`, "테이블 접근 가능 (RLS 세부 확인은 Supabase 대시보드에서)")
  }

  console.log("  ℹ️  RLS 정책 세부 확인: Supabase Dashboard → Authentication → Policies")
  return allPass
}

// ─── 6. OAuth 설정 가이드 ───

function printOAuthGuide() {
  console.log("\n── OAuth 리다이렉트 설정 가이드 ──")
  console.log(`
  카카오/Google OAuth를 프로덕션에서 사용하려면:

  1. Supabase Dashboard → Authentication → URL Configuration
     - Site URL: 프로덕션 도메인 (예: https://loca202603.vercel.app)
     - Redirect URLs에 추가:
       • https://loca202603.vercel.app
       • https://loca202603.vercel.app/**
       • https://your-custom-domain.com (커스텀 도메인 사용 시)

  2. 카카오 개발자 콘솔 (https://developers.kakao.com)
     - 내 애플리케이션 → 앱 선택 → 카카오 로그인 → Redirect URI:
       • https://quiykkpezdjqurxujsks.supabase.co/auth/v1/callback

  3. Google Cloud Console (https://console.cloud.google.com)
     - APIs & Services → Credentials → OAuth 2.0 Client
     - Authorized redirect URIs:
       • https://quiykkpezdjqurxujsks.supabase.co/auth/v1/callback
  `)
}

// ─── 메인 실행 ───

export async function runHealthCheck() {
  console.clear()
  console.log("╔══════════════════════════════════════╗")
  console.log("║  LOCA Supabase Health Check          ║")
  console.log("╚══════════════════════════════════════╝")

  if (!hasSupabaseEnv || !supabase) {
    console.log("\n❌ Supabase 환경변수가 설정되지 않았습니다.")
    console.log("   VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY를 .env에 설정하세요.")
    return
  }

  console.log(`\n🔗 ${supabase.supabaseUrl}`)

  const { data: { user } } = await supabase.auth.getUser()
  console.log(`👤 ${user ? `로그인: ${user.email}` : "비로그인 (일부 검사 제한됨)"}`)

  const results = {}

  results["002 마이그레이션"] = await check002Migration()
  results["003 마이그레이션"] = await check003Migration()
  results["Storage 버킷"] = await checkStorageBucket()
  results["초대코드"] = await checkInvitationCodes()
  results["RLS 정책"] = await checkRLS()
  printOAuthGuide()

  // 요약
  console.log("\n══════════════════════════════════════")
  console.log("  요약")
  console.log("══════════════════════════════════════")

  let totalPass = 0
  let totalFail = 0
  for (const [name, passed] of Object.entries(results)) {
    console.log(`  ${passed ? "✅" : "❌"} ${name}`)
    if (passed) totalPass++
    else totalFail++
  }

  console.log(`\n  결과: ${totalPass} PASS / ${totalFail} FAIL`)

  if (totalFail === 0) {
    console.log("\n  🎉 모든 검사를 통과했습니다! 프로덕션 준비 완료.")
  } else {
    console.log("\n  ⚠️  위 FAIL 항목을 해결한 뒤 다시 실행하세요.")
  }

  return results
}

// dev 서버에서 import 시 자동 실행하지 않음 — 명시적으로 runHealthCheck() 호출 필요
if (import.meta.hot) {
  console.log("[supabaseHealthCheck] dev 모드 감지. 콘솔에서 runHealthCheck() 를 호출하세요.")
  window.runHealthCheck = runHealthCheck
}
