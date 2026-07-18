import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CheckCircle2, Database, Map as MapIcon, Plus, User } from "lucide-react"
import { Toast } from "./components/ui"
import { BottomNavV2 } from "./components/BottomNav.v2"
import { PixelWordmark } from "./components/PixelWordmark"
import { PlaceFlipCard } from "./components/binder/PlaceFlipCard"
import { NewFindBurst } from "./components/binder/NewFindBurst"
import { CollectSheet } from "./components/sheets/CollectSheet"
import { NotificationPanel, NotificationBanner } from "./components/NotificationPanel"
import { useNotifications } from "./hooks/useNotifications"
import {
  communityMapFeaturesSeed,
  communityPostsSeed,
  demoFeatures,
  demoMaps,
  featuresSeed,
  mapsSeed,
  me,
  sharesSeed,
  users,
} from "./data/sampleData"
import { useLocalStorageState, useOnlineStatus, useToast, setStorageWarningCallback } from "./hooks/useAppState"
import {
  buildCommunityPosts,
  buildMapRoutePath,
  buildMapSharePath,
  buildMapShareUrl,
  buildOwnPosts,
  buildSlugShareUrl,
  featureSort,
  parseAppLocation,
  placeEmojis,
  themePalette,
} from "./lib/appUtils"
import { hasSupabaseEnv, supabase } from "./lib/supabase"
import { logEvent } from "./lib/analytics"
import { captureError } from "./lib/monitoring"
import { addFeatureMemo, backfillRegionNames, getCommunityMapBundle, getMapBundle, getPublishedMapBySlug, respondCollaborationInvite, saveMap as saveMapRecord, updateFeature } from "./lib/mapService"
import { uploadMediaToCloud } from "./lib/mediaStore"
import { compressImageFile, blobToDataUrl } from "./lib/imageCompress"
import { listFeatureChangeRequests } from "./lib/mapService.read"
import { createMap as createMapRecord, deleteMap as deleteMapRecord, placeFeaturesInMap, removeFeatureFromMap, updateMap as updateMapRecord, updateProfile } from "./lib/mapService.write"
import { addPlacements, removePlacement, featureInMap } from "./lib/featurePlacements"
import { createId } from "./lib/appUtils"
import { add as addNotification, NOTI_TYPES } from "./lib/notificationStore"
import { CONSENT_VERSION, getMyConsentState, recordMyConsent } from "./lib/auth"
import { ConsentGate } from "./components/ConsentGate"
// 라우트별 코드 스플리팅 - 라이트웹(/s/:slug)은 SharedMapViewer 청크만 로딩
const AuthScreen = lazy(() => import("./screens/AuthScreen").then((m) => ({ default: m.AuthScreen })))
// 탐색 = 위치 기반 행사/공간 큐레이션. 공개 지도 검색(ExplorePublicScreen)은
// 발행 지도 데이터가 쌓일 때까지 진입점 숨김 (파일은 유지)
const ExploreCurationScreen = lazy(() => import("./screens/ExploreCurationScreen").then((m) => ({ default: m.ExploreCurationScreen })))
const MapEditorScreen = lazy(() => import("./screens/MapEditorScreen").then((m) => ({ default: m.MapEditorScreen })))
const MapsListScreen = lazy(() => import("./screens/MapsListScreen").then((m) => ({ default: m.MapsListScreen })))
const PlacesScreen = lazy(() => import("./screens/PlacesScreen").then((m) => ({ default: m.PlacesScreen })))
const DashboardScreen = lazy(() => import("./screens/DashboardScreen").then((m) => ({ default: m.DashboardScreen })))
const AccountScreen = lazy(() => import("./screens/AccountScreen").then((m) => ({ default: m.AccountScreen })))
const SharedMapViewer = lazy(() => import("./screens/SharedMapViewer").then((m) => ({ default: m.SharedMapViewer })))
const WalkModeScreen = lazy(() => import("./screens/WalkModeScreen").then((m) => ({ default: m.WalkModeScreen })))
import { TitleScreen } from "./screens/TitleScreen"
import { useFeaturePool } from "./hooks/useFeaturePool"
import { useMediaHandlers } from "./hooks/useMediaHandlers"
import { useFeatureEditing } from "./hooks/useFeatureEditing"
import { useMapCRUD } from "./hooks/useMapCRUD"
import { useAppSession } from "./hooks/useAppSession"
import { useGeolocation } from "./hooks/useGeolocation"
import { useSocialProfile } from "./hooks/useSocialProfile"
import { cleanupOrphanedMedia } from "./lib/mediaStore"
import { FeatureDetailSheet } from "./components/sheets/FeatureDetailSheet"
import { FeatureEditSheet } from "./components/sheets/FeatureEditSheet"
import { ImportTargetMapSheet } from "./components/sheets/ImportTargetMapSheet"
import { MapFormSheet } from "./components/sheets/MapFormSheet"
import { MapBuilderSheet } from "./components/sheets/MapBuilderSheet"
import { AddRecordSheet } from "./components/sheets/AddRecordSheet"
import { PublishSheet } from "./components/sheets/PublishSheet"
import { UserProfileSheet } from "./components/sheets/UserProfileSheet"
import { PostDetailSheet } from "./components/sheets/PostDetailSheet"
import { SharePlaceSheet } from "./components/sheets/SharePlaceSheet"
import { ProfilePlacementConfirmSheet } from "./components/sheets/ProfilePlacementConfirmSheet"
import { CollaboratorsSheet } from "./components/sheets/CollaboratorsSheet"
import { ProfileOnboardingSheet } from "./components/sheets/ProfileOnboardingSheet"
import { FeedbackSheet } from "./components/sheets/FeedbackSheet"
import { submitFeedback, collectFeedbackContext } from "./lib/feedback"
import { findPlacementForMap, resetLegacyProfileCuration } from "./lib/mapPlacement"
import { isCoachmarkSeen, markCoachmarkSeen, resetCoachmark, isFirstPinCelebrated, markFirstPinCelebrated, isTutorialSeen, markTutorialSeen, isProfileOnboardSeen, markProfileOnboardSeen } from "./lib/onboarding"
import { HelperCat, TuxCatSprite } from "./components/helper/HelperCat"
import { TutorialDialog } from "./components/helper/TutorialDialog"
import { CoachMark } from "./components/CoachMark"
import { mergeFeatureListWithLocalMedia } from "./lib/featureMediaMerge"
import { getPendingFeatureMediaSyncKeys, syncFeatureListLocalMediaToCloud } from "./lib/mediaCloudSync"
const MapShareEditor = lazy(() => import("./screens/MapShareEditor").then((m) => ({ default: m.MapShareEditor })))
import "./shared-viewer.css"
import "./map-share-editor.css"

function ScreenFallback() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", color: "#999" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>LOCA</div>
        <span style={{ fontSize: 14 }}>로딩 중...</span>
      </div>
    </div>
  )
}

function AppRecoveryScreen({
  title = "화면을 다시 불러올게요",
  message = "탭 이동 중 화면 상태가 엉켰어요. 아래 버튼으로 바로 복구할 수 있어요.",
  actionLabel = "다시 불러오기",
  onRetry,
}) {
  return (
    <section className="app-recovery-screen" role="alert">
      <div className="app-recovery-screen__mark" aria-hidden="true">LOCA</div>
      <strong>{title}</strong>
      <p>{message}</p>
      <button type="button" onClick={onRetry}>
        {actionLabel}
      </button>
    </section>
  )
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error("LOCA 화면 렌더링 오류", error)
    captureError(error, { boundary: "AppErrorBoundary", componentStack: info?.componentStack })
  }

  render() {
    if (this.state.error) {
      return <AppRecoveryScreen onRetry={() => window.location.reload()} />
    }
    return this.props.children
  }
}

const EMPTY_WEB_STATS = []
const EMPTY_WEB_CUE_ITEMS = []

function WebStatStrip({ items = EMPTY_WEB_STATS }) {
  if (!items.length) return null

  return (
    <div className="web-stat-strip" aria-label="화면 요약">
      {items.map((item) => (
        <div className="web-stat" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          {item.caption ? <em>{item.caption}</em> : null}
        </div>
      ))}
    </div>
  )
}

function WebSocialCue({ label, items = EMPTY_WEB_CUE_ITEMS }) {
  if (!label && !items.length) return null

  return (
    <div className="web-social-cue" aria-label="저장함 분위기">
      <div className="web-social-cue__swatches" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="web-social-cue__copy">
        {label ? <strong>{label}</strong> : null}
        {items.length ? (
          <span>{items.join(" · ")}</span>
        ) : null}
      </div>
    </div>
  )
}

function WebPageFrame({
  className = "",
  eyebrow,
  title,
  description,
  action,
  stats,
  socialCue,
  children,
}) {
  const frameClassName = ["screen screen--scroll web-section", className].filter(Boolean).join(" ")

  return (
    <section className={frameClassName}>
      <div className="web-section__inner">
        <div className="web-section__head">
          <div className="web-section__headline">
            {eyebrow ? <span className="web-section__eyebrow">{eyebrow}</span> : null}
            <h1 className="web-section__title">{title}</h1>
            {description ? <p className="web-section__description">{description}</p> : null}
            {socialCue ? <WebSocialCue {...socialCue} /> : null}
          </div>
          {action ? <div className="web-section__actions">{action}</div> : null}
        </div>
        <WebStatStrip items={stats} />
        <div className="web-section__workspace">
          {children}
        </div>
      </div>
    </section>
  )
}

function WebAuthLayout({ children }) {
  return (
    <section className="screen screen--scroll web-auth-screen">
      <div className="web-auth-workspace">
        <aside className="web-auth-workspace__intro loca-authintro loca-authintro--greet" aria-label="LOCA 소개">
          <span className="loca-authintro__eyebrow">LOCAL BINDER · No.000</span>
          <div className="loca-greet">
            <div className="loca-greet__bubble" role="note">
              <p className="loca-greet__hello">내 동네를 기록하는 <b>LOCA</b>에<br />오신 걸 환영합니다.</p>
              <p className="loca-greet__wish">당신과 주변 세계가 더 가까워지기를 바랍니다.</p>
            </div>
            <div className="loca-greet__cat">
              <TuxCatSprite size={150} formal />
            </div>
            <span className="loca-greet__sign">— 도우미 로카냥 올림</span>
          </div>
        </aside>
        <div className="web-auth-workspace__panel">
          {children}
        </div>
      </div>
    </section>
  )
}

// 우상단 내 계정 버튼 — 내 정보 관리(account 탭) 진입 + 로그아웃
function AccountMenu({ email, onOpenAccount, onSignOut }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="account-menu">
      <button
        type="button"
        className="account-menu__trigger"
        onClick={() => setOpen((current) => !current)}
        aria-label="내 계정"
        aria-expanded={open}
      >
        <User size={17} strokeWidth={2.1} aria-hidden="true" />
      </button>
      {open ? (
        <>
          <div className="account-menu__backdrop" onClick={() => setOpen(false)} role="presentation" />
          <div className="account-menu__pop" role="menu" aria-label="계정 메뉴">
            <p className="account-menu__email">{email || "내 계정"}</p>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onOpenAccount?.()
              }}
            >
              내 정보 관리
            </button>
            {onSignOut ? (
              <button
                type="button"
                role="menuitem"
                className="account-menu__signout"
                onClick={() => {
                  setOpen(false)
                  onSignOut()
                }}
              >
                로그아웃
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}

function SignedInScreen({ user, onOpenMaps, onOpenProfile, onSignOut }) {
  return (
    <WebAuthLayout>
      <div className="web-auth-screen__inner">
        <div className="web-auth-card">
          <CheckCircle2 size={26} strokeWidth={2.2} aria-hidden="true" />
          <div>
            <strong>로그인되어 있어요</strong>
            <span>{user?.email || "현재 계정"}</span>
          </div>
        </div>

        <div className="web-auth-actions" aria-label="계정 바로가기">
          <button type="button" onClick={onOpenMaps}>
            <MapIcon size={17} strokeWidth={2.1} aria-hidden="true" />
            지도 목록
          </button>
          <button type="button" onClick={onOpenProfile}>
            <User size={17} strokeWidth={2.1} aria-hidden="true" />
            내 대시보드
          </button>
          {onSignOut ? (
            <button type="button" className="is-ghost" onClick={onSignOut}>
              로그아웃
            </button>
          ) : null}
        </div>
      </div>
    </WebAuthLayout>
  )
}

const resolveStoredMapTarget = (mapId, maps) => {
  if (!mapId) return null
  if (mapId === "community-map") return { source: "community", mapId }
  if (demoMaps.some((map) => map.id === mapId)) return { source: "demo", mapId }
  if (maps.some((map) => map.id === mapId)) return { source: "local", mapId }
  return null
}

export default function App() {
  const [maps, setMaps] = useLocalStorageState("loca.mobile.maps", mapsSeed)
  const [features, setFeatures] = useLocalStorageState("loca.mobile.features", featuresSeed)
  // 지도-기록 M:N 배치(050): { [mapId]: featureId[] } — 한 카드가 여러 지도에 담긴 관계.
  // 스칼라 feature.mapId(홈 지도)와 병존하며, 지도 소속 판정은 둘의 합집합으로 한다.
  const [placementsByMap, setPlacementsByMap] = useLocalStorageState("loca.mobile.placements", {})
  const [shares, setShares] = useLocalStorageState("loca.mobile.shares", sharesSeed)
  const [followed, setFollowed] = useLocalStorageState("loca.mobile.followed", [])
  const [communityPosts, setCommunityPosts] = useLocalStorageState("loca.mobile.communityPosts", communityPostsSeed)
  const [likedPosts, setLikedPosts] = useLocalStorageState("loca.mobile.likedPosts", [])
  const [communityMapFeatures, setCommunityMapFeatures] = useState(communityMapFeaturesSeed)
  const [communityMapId, setCommunityMapId] = useState("community-map")
  const [viewerProfile, setViewerProfile] = useLocalStorageState("loca.mobile.viewerProfile", me)

  const routeAtLoad = useMemo(() => {
    try {
      return parseAppLocation(window.location)
    } catch (error) {
      console.error("공유 링크를 해석하지 못했어요.", error)
      return { type: "invalid-shared" }
    }
  }, [])
  const initialStoredTarget = routeAtLoad?.type === "map" ? resolveStoredMapTarget(routeAtLoad.mapId, maps) : null
  const initialSharedMapData = routeAtLoad?.type === "shared" ? routeAtLoad.payload : null
  const [sharedMapData, setSharedMapData] = useState(initialSharedMapData)
  const [pendingSharePlace, setPendingSharePlace] = useState(routeAtLoad?.type === "share-target" ? routeAtLoad.place : null)
  // 첫 진입은 로그인 없이 구경할 수 있는 탐색 탭으로
  const [activeTab, setActiveTab] = useState(initialSharedMapData || initialStoredTarget ? "maps" : "explore")
  // 타이틀(입장) 화면 오버레이 — loca.im 루트로 들어오면 매번 첫 화면으로 표시.
  // 공유/슬러그/지도/산책/공유타깃 등 딥링크(routeAtLoad != null)면 건너뛴다.
  // + loca. 로고 클릭 시 언제든 재진입.
  const [showTitle, setShowTitle] = useState(() => !routeAtLoad)
  // 산책 모드 게임 오버레이 — 타이틀 "게임으로 동네 탐색하기" 또는 /walk 딥링크로 진입
  const [showWalk, setShowWalk] = useState(routeAtLoad?.type === "walk")
  // 로카냥 튜토리얼 — null | { step, auto: "guest" | "authed" | null }
  const [tutorial, setTutorial] = useState(null)
  // 치즈냥의 귓속말 — 피드백 시트 열림 + 제출 성공 시 뛰어나가기 모션 트리거(증가 카운터)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackRunSignal, setFeedbackRunSignal] = useState(0)
  // 가입 직후 연령대·지역 온보딩 시트
  const [profileOnboardOpen, setProfileOnboardOpen] = useState(false)
  const [profileOnboardSaving, setProfileOnboardSaving] = useState(false)
  const [mapsView, setMapsView] = useState(initialSharedMapData || initialStoredTarget ? "editor" : "list")
  const [activeMapId, setActiveMapId] = useState(initialSharedMapData?.map.id ?? initialStoredTarget?.mapId ?? maps[0]?.id ?? null)
  const [activeMapSource, setActiveMapSource] = useState(initialSharedMapData ? "shared" : initialStoredTarget?.source ?? "local")
  const [selectedFeatureId, setSelectedFeatureId] = useState(null)
  const [selectedFeatureSummaryId, setSelectedFeatureSummaryId] = useState(null)
  const [editorMode, setEditorMode] = useState("browse")
  const [showMapLabels, setShowMapLabels] = useState(true)
  const [draftPoints, setDraftPoints] = useState([])
  const [fitTrigger, setFitTrigger] = useState(1)
  const [focusPoint, setFocusPoint] = useState(null)
  const [mapSheet, setMapSheet] = useState(null)
  const [collaboratorsSheet, setCollaboratorsSheet] = useState(null)
  const [featureSheet, setFeatureSheet] = useState(null)
  const [inlineRecordFeatureId, setInlineRecordFeatureId] = useState(null)
  const [featureSheetMode, setFeatureSheetMode] = useState("detail")
  // 모두의 지도 → 내 지도 가져오기 타겟 선택 시트
  const [importTargetSheet, setImportTargetSheet] = useState(null) // { featureId } | null
  const [importTargetBusy, setImportTargetBusy] = useState(false)
  const [publishSheet, setPublishSheet] = useState(null)
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [selectedUserProfile, setSelectedUserProfile] = useState(null)
  const [selectedPostRef, setSelectedPostRef] = useState(null)
  const [placesInitialQuery, setPlacesInitialQuery] = useState(null) // 대시보드 동네 도감 → 내 장소 진입 검색어
  const [memoText, setMemoText] = useState("")
  const [shareEditorImage, setShareEditorImage] = useState(null)
  const [recordSheetOpen, setRecordSheetOpen] = useState(false)
  const [recordSheetInitialView, setRecordSheetInitialView] = useState("target")
  const [recordTargetMapId, setRecordTargetMapId] = useState(null)
  const [pendingRecordAfterMapCreate, setPendingRecordAfterMapCreate] = useState(false)
  // 프로필 공개/내리기 공통 confirm 시트 상태
  const [profilePlacementSheet, setProfilePlacementSheet] = useState(null) // { mode: 'add'|'remove'|'removeForUnpublish', mapId, onSuccess? }
  const [profilePlacementSubmitting, setProfilePlacementSubmitting] = useState(false)
  // characterStyle 폐기 (2026-05) — 레벨/XP 위젯 제거에 따라 캐릭터 마커도 제거.
  const [publishSubmitting, setPublishSubmitting] = useState(false)
  const [savingPostMapId, setSavingPostMapId] = useState(null)
  const [savingSharedMap, setSavingSharedMap] = useState(false)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [coachmarkStep, setCoachmarkStep] = useState(0) // 0=off, 1~3=active step
  const [firstPinHintVisible, setFirstPinHintVisible] = useState(false)
  const [communityPendingRequests, setCommunityPendingRequests] = useState([])
  const [collaborationInvites, setCollaborationInvites] = useState([])
  const [storedCloudUserId] = useState(() => {
    try { return window.localStorage?.getItem("loca.mobile.cloudUserId") || "" } catch { return "" }
  })

  const isOnline = useOnlineStatus()
  const toast = useToast()
  const showToast = toast.show

  useEffect(() => {
    try {
      window.localStorage?.removeItem("loca.mobile.communityMapFeatures")
    } catch {
      // Ignore storage cleanup failures.
    }
  }, [])

  useEffect(() => {
    const handlePreloadError = (event) => {
      event.preventDefault()
      window.location.reload()
    }
    window.addEventListener("vite:preloadError", handlePreloadError)
    return () => window.removeEventListener("vite:preloadError", handlePreloadError)
  }, [])

  useEffect(() => { setStorageWarningCallback(showToast) }, [showToast])
  useEffect(() => {
    const isEditableElement = (el) => {
      if (!(el instanceof HTMLElement)) return false
      const tag = el.tagName
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable
    }

    const detectKeyboard = () => {
      const compactScreen = window.innerWidth <= 900
      const focusedInput = isEditableElement(document.activeElement)
      const vv = window.visualViewport
      const viewportShrunk = Boolean(vv && vv.height < window.innerHeight * 0.82)
      setKeyboardVisible(compactScreen && (focusedInput || viewportShrunk))
    }

    const handleFocusChange = () => window.setTimeout(detectKeyboard, 30)
    detectKeyboard()
    document.addEventListener("focusin", handleFocusChange)
    document.addEventListener("focusout", handleFocusChange)
    window.addEventListener("resize", detectKeyboard)
    window.visualViewport?.addEventListener("resize", detectKeyboard)
    return () => {
      document.removeEventListener("focusin", handleFocusChange)
      document.removeEventListener("focusout", handleFocusChange)
      window.removeEventListener("resize", detectKeyboard)
      window.visualViewport?.removeEventListener("resize", detectKeyboard)
    }
  }, [])

  useEffect(() => {
    cleanupOrphanedMedia([...features, ...communityMapFeatures])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // --- 온보딩: 편집기 코치마크 트리거 ---
  useEffect(() => {
    if (mapsView === "editor" && activeTab === "maps" && !isCoachmarkSeen()) {
      setCoachmarkStep(1)
    }
  }, [mapsView, activeTab])

  // 지도 편집 배너 도크 스코프 — 편집기 활성일 때만 body 클래스 (공유 뷰어 미영향)
  useEffect(() => {
    const active = mapsView === "editor" && activeTab === "maps"
    document.body.classList.toggle("loca-editor-open", active)
    return () => document.body.classList.remove("loca-editor-open")
  }, [mapsView, activeTab])

  // 코치마크 3: FeatureDetailSheet 처음 열릴 때 (코치마크 진행 중이었으면)
  useEffect(() => {
    if (featureSheet && !isCoachmarkSeen() && coachmarkStep === 0) {
      // 코치마크 2가 끝나고(step=0) 아직 seen 안 됐으면 step 3
      setCoachmarkStep(3)
    }
  }, [featureSheet, coachmarkStep])

  // --- 온보딩: 첫 핀 저장 축하 ---
  const prevPinCountRef = useRef(features.filter((f) => f.type === "pin").length)
  useEffect(() => {
    const pinCount = features.filter((f) => f.type === "pin").length
    if (pinCount > prevPinCountRef.current && !isFirstPinCelebrated()) {
      markFirstPinCelebrated()
      showToast("첫 장소를 기록했어요")
      // 토스트 후 힌트 카드 표시
      const timer = setTimeout(() => setFirstPinHintVisible(true), 2500)
      return () => clearTimeout(timer)
    }
    prevPinCountRef.current = pinCount
  }, [features, showToast])

  // --- Session / Auth ---

  const {
    authReady, authUser, cloudMode, cloudLoading, cloudDataReady, cloudLoadedUserId,
    readLocalImportData,
    reloadCloudData, handleSignOut, handleDeleteAccount, importLocalDataToCloud,
  } = useAppSession({
    setMaps, setFeatures, setShares, setFollowed, setViewerProfile,
    setCollaborationInvites, setPlacements: setPlacementsByMap,
    setActiveTab, setMapsView, setActiveMapSource, setActiveMapId,
    setSelectedFeatureId, setSelectedFeatureSummaryId,
    setFeatureSheet, setEditorMode, setDraftPoints,
    setMapSheet, setPublishSheet, setSelectedUserId, setSelectedPostRef,
    setSharedMapData, setShareEditorImage,
    showToast, routeAtLoad,
  })

  const needsAuthForPersonalArea = hasSupabaseEnv && authReady && !authUser

  // #6 동의 게이트 — 로그인 후 필수 동의 기록이 없거나 구버전이면 차단형 게이트 노출.
  // OAuth·구계정·방침 버전 변경을 범용으로 커버(이메일 가입은 이미 기록돼 게이트 안 뜸).
  const [needsConsent, setNeedsConsent] = useState(false)
  const [consentSubmitting, setConsentSubmitting] = useState(false)
  useEffect(() => {
    if (!hasSupabaseEnv || !authUser?.id) { setNeedsConsent(false); return undefined }
    let alive = true
    getMyConsentState()
      .then((state) => {
        if (!alive) return
        const ok = Boolean(state?.terms_agreed_at) && state?.consent_version === CONSENT_VERSION
        setNeedsConsent(!ok)
      })
      .catch((error) => {
        // 조회 실패 시 가용성 우선 — 게이트를 강제하지 않는다.
        console.warn("Failed to load consent state", error)
      })
    return () => { alive = false }
  }, [authUser?.id])
  const handleConsentAgree = useCallback(async ({ marketing }) => {
    setConsentSubmitting(true)
    try {
      await recordMyConsent(marketing)
      setNeedsConsent(false)
    } catch (error) {
      console.error("Failed to record consent", error)
      showToast("동의 처리에 실패했어요. 잠시 후 다시 시도해 주세요.")
    } finally {
      setConsentSubmitting(false)
    }
  }, [showToast])

  // 회원가입/로그인 후 첫 진입 — 로카냥 튜토리얼 1회 자동 재생
  useEffect(() => {
    if (authUser && cloudDataReady && !isTutorialSeen("authed")) {
      setTutorial({ step: 0, auto: "authed" })
    }
  }, [authUser, cloudDataReady])

  // 기존 카드 동네 백필 — 클라우드 로드 완료 후 사용자당 1회, region_name 없는 카드를 역지오코딩 태깅.
  // 대시보드 "동네 도감"이 이 값을 쓴다. 지오코더 배려로 순차 처리(느리게), best-effort.
  const regionBackfillRef = useRef(null)
  const featuresRef = useRef(features)
  featuresRef.current = features
  useEffect(() => {
    if (!cloudMode || !cloudDataReady || !cloudLoadedUserId) return
    if (regionBackfillRef.current === cloudLoadedUserId) return
    regionBackfillRef.current = cloudLoadedUserId
    backfillRegionNames(featuresRef.current, {
      onTagged: (id, regionName, regionCode, updatedAt) => {
        const patch = updatedAt ? { regionName, regionCode, updatedAt } : { regionName, regionCode }
        setFeatures((current) => current.map((feature) => (
          feature.id === id ? { ...feature, ...patch } : feature
        )))
        // 편집 중인 시트가 이 카드면 updatedAt 도 맞춰줘야 저장이 가짜 충돌로 막히지 않는다.
        if (updatedAt) {
          setFeatureSheet((sheet) => (sheet && sheet.id === id ? { ...sheet, updatedAt } : sheet))
        }
      },
    }).catch(() => {})
  }, [cloudMode, cloudDataReady, cloudLoadedUserId, setFeatures, setFeatureSheet])
  const hasStoredPersonalCacheForUser = Boolean(authUser?.id && storedCloudUserId === authUser.id)
  const isFirstCloudLoadForUser = cloudLoading && !cloudDataReady && cloudLoadedUserId !== authUser?.id && !hasStoredPersonalCacheForUser
  const requiresAuthForCurrentTab =
    activeTab === "profile" ||
    activeTab === "account" ||
    activeTab === "places" ||
    (activeTab === "maps" && (mapsView === "list" || activeMapSource === "local"))
  const showPersonalGate = needsAuthForPersonalArea && requiresAuthForCurrentTab
  const showPersonalLoading = hasSupabaseEnv && (!authReady || isFirstCloudLoadForUser) && requiresAuthForCurrentTab

  const requestLoginBanner = useCallback(() => {
    setActiveTab("login")
  }, [])

  const handleAuthSuccess = useCallback((mode) => {
    showToast(mode === "signup" ? "회원가입이 완료되었어요." : "로그인했어요.")
    setActiveTab("maps")
    setMapsView("list")
    setActiveMapSource("local")
    // 신규 가입자에게만 연령대·지역 온보딩 1회 노출
    if (mode === "signup" && !isProfileOnboardSeen()) setProfileOnboardOpen(true)
  }, [setActiveMapSource, setActiveTab, setMapsView, showToast])

  const closeProfileOnboard = useCallback(() => {
    markProfileOnboardSeen()
    setProfileOnboardOpen(false)
  }, [])

  const handleProfileOnboardSave = useCallback(async ({ age_band, region_sido }) => {
    // 둘 다 비었으면(=나중에) DB 호출 없이 종료
    if (!age_band && !region_sido) {
      closeProfileOnboard()
      return
    }
    setProfileOnboardSaving(true)
    try {
      if (cloudMode && authUser?.id) {
        await updateProfile(authUser.id, { age_band, region_sido })
      }
      showToast("고마워요! 더 잘 추천해드릴게요.")
    } catch {
      // 저장 실패해도 온보딩은 막지 않는다(선택 정보) — 조용히 넘어감
    } finally {
      setProfileOnboardSaving(false)
      closeProfileOnboard()
    }
  }, [authUser, cloudMode, closeProfileOnboard, showToast])

  // 치즈냥의 귓속말 — 제출. 성공 시 시트를 닫고 뛰어나가기 모션을 재생한다.
  // 실패는 throw 로 남겨 시트가 인라인 문구를 보여주고 입력을 보존하게 한다.
  const handleFeedbackSubmit = useCallback(async ({ category, body }) => {
    const context = collectFeedbackContext({ tab: activeTab, authed: Boolean(authUser) })
    await submitFeedback({ category, body, context })
    logEvent("feedback_submitted", { category })
    setFeedbackOpen(false)
    setFeedbackRunSignal((n) => n + 1) // 치즈냥 "고마워! 잘 전달할게!" → 우측 대시
    showToast("치즈냥이 이야기를 받아 달려갔어요!")
  }, [activeTab, authUser, showToast])

  useEffect(() => {
    if (!showPersonalGate) return
    if (activeTab !== "login") setActiveTab("login")
    if (mapsView !== "list") setMapsView("list")
    if (activeMapSource !== "local") setActiveMapSource("local")
  }, [activeMapSource, activeTab, mapsView, showPersonalGate])

  const openCreateMapSheet = useCallback(() => {
    if (needsAuthForPersonalArea) {
      requestLoginBanner()
      return
    }
    setActiveTab("maps")
    setMapsView("list")
    setMapSheet({ mode: "create", id: null, title: "", description: "", theme: themePalette[0] })
  }, [needsAuthForPersonalArea, requestLoginBanner])

  // 새 지도 = 채집한 카드를 골라 묶는 빌더로 진입 (C단계)
  const openMapBuilder = useCallback(() => {
    if (needsAuthForPersonalArea) {
      requestLoginBanner()
      return
    }
    setMapBuilderOpen(true)
  }, [needsAuthForPersonalArea, requestLoginBanner])

  // --- Geolocation ---

  const { myLocation, locateMe } = useGeolocation({ setFocusPoint, showToast })

  // --- Notifications ---

  const [notiPanelOpen, setNotiPanelOpen] = useState(false)
  const {
    notifications: notiList,
    bannerItem: notiBanner,
    dismissBanner: notiDismissBanner,
    markRead: notiMarkRead,
    markAllRead: notiMarkAllRead,
    removeItem: notiRemove,
    refresh: notiRefresh,
  } = useNotifications()

  // --- Derived data ---

  const usersById = useMemo(() => {
    const mergedUsers = viewerProfile.id === me.id ? users : [viewerProfile, ...users]
    return Object.fromEntries(mergedUsers.map((user) => [user.id, user]))
  }, [viewerProfile])
  const canEditCommunityMap = !(hasSupabaseEnv && authReady && !authUser)
  const importedCommunityFeatureIds = useMemo(() => {
    const set = new Set()
    for (const f of features) {
      if (f?.sourceFeatureId) set.add(f.sourceFeatureId)
    }
    return set
  }, [features])
  const communityMapMeta = useMemo(() => [{
    id: communityMapId,
    title: "모두의 지도",
    description: "모두가 함께 만드는 지도",
    theme: "#4F46E5",
    updatedAt: communityMapFeatures[0]?.updatedAt || new Date().toISOString(),
    canEditFeatures: canEditCommunityMap,
  }], [canEditCommunityMap, communityMapFeatures, communityMapId])
  const sharedMapPool = useMemo(() => (sharedMapData ? [sharedMapData.map] : []), [sharedMapData])
  const sharedFeaturePool = useMemo(() => sharedMapData?.features || [], [sharedMapData])
  const activeMapPool = activeMapSource === "community"
    ? communityMapMeta
    : activeMapSource === "demo"
      ? demoMaps
      : activeMapSource === "shared"
        ? sharedMapPool
        : maps
  const activeFeaturePool = activeMapSource === "community"
    ? communityMapFeatures
    : activeMapSource === "demo"
      ? demoFeatures
      : activeMapSource === "shared"
        ? sharedFeaturePool
        : features
  const effectiveActiveMapId = activeMapSource === "community"
    && activeMapId === "community-map"
    && communityMapId
    && communityMapId !== "community-map"
    ? communityMapId
    : activeMapId
  const activeMap = activeMapPool.find((map) => map.id === effectiveActiveMapId)
    || (activeMapSource === "community" ? activeMapPool[0] || null : null)
  // 카드가 지도에 담겼는지: 스칼라 홈 지도(mapId) 또는 M:N 배치(placements) 중 하나라도 해당하면 true
  const isFeatureInMap = useCallback(
    (feature, mapId) => featureInMap(placementsByMap, feature, mapId),
    [placementsByMap],
  )
  const activeFeatures = useMemo(
    () => (effectiveActiveMapId ? activeFeaturePool.filter((feature) => isFeatureInMap(feature, effectiveActiveMapId)) : []),
    [activeFeaturePool, effectiveActiveMapId, isFeatureInMap],
  )
  useEffect(() => {
    if (activeMapSource !== "community" || activeMapId !== "community-map") return
    if (!communityMapId || communityMapId === "community-map") return
    setActiveMapId(communityMapId)
  }, [activeMapId, activeMapSource, communityMapId, setActiveMapId])
  const b2cMaps = maps
  const b2cMapIds = useMemo(
    () => new Set(b2cMaps.map((mapItem) => mapItem.id)),
    [b2cMaps],
  )
  // 내 장소(바인더): 채집한 모든 카드 — 내 지도 소속 + 아직 어디에도 안 담긴 mapless 카드
  const b2cFeatures = useMemo(
    () => features.filter((feature) => !feature.mapId || b2cMapIds.has(feature.mapId)),
    [b2cMapIds, features],
  )
  const b2cShares = useMemo(
    () => shares.filter((share) => b2cMapIds.has(share.mapId)),
    [b2cMapIds, shares],
  )
  const pendingMediaSyncFeatures = useMemo(() => features, [features])
  const pendingMediaSyncSignature = useMemo(
    () => getPendingFeatureMediaSyncKeys(pendingMediaSyncFeatures).sort().join("|"),
    [pendingMediaSyncFeatures],
  )
  const mediaSyncInFlightRef = useRef("")

  useEffect(() => {
    if (!cloudMode || !pendingMediaSyncSignature) return undefined
    if (mediaSyncInFlightRef.current === pendingMediaSyncSignature) return undefined

    let cancelled = false
    mediaSyncInFlightRef.current = pendingMediaSyncSignature

    syncFeatureListLocalMediaToCloud(pendingMediaSyncFeatures)
      .then((result) => {
        if (cancelled) return
        if (result.syncedCount > 0) {
          const syncedById = new Map(result.features.map((feature) => [feature.id, feature]))
          const applySyncedMedia = (feature) => {
            const synced = syncedById.get(feature.id)
            return synced ? { ...feature, photos: synced.photos } : feature
          }
          setFeatures((current) => current.map(applySyncedMedia))
          setCommunityMapFeatures((current) => current.map(applySyncedMedia))
          setFeatureSheet((current) => (current ? applySyncedMedia(current) : current))
        }
        if (result.failedCount > 0 || result.missingCount > 0) {
          showToast("일부 사진은 아직 웹에 동기화되지 않았어요. 원래 저장한 기기에서 다시 열면 재시도돼요.")
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Failed to sync local media to cloud", error)
        }
      })
      .finally(() => {
        if (!cancelled) mediaSyncInFlightRef.current = ""
      })

    return () => {
      cancelled = true
    }
  }, [
    cloudMode,
    pendingMediaSyncFeatures,
    pendingMediaSyncSignature,
    setCommunityMapFeatures,
    setFeatureSheet,
    setFeatures,
    showToast,
  ])

  const personalRecordMaps = useMemo(
    () => b2cMaps
      .slice()
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)),
    [b2cMaps],
  )
  const ownPosts = useMemo(() => buildOwnPosts(shares, maps, features, viewerProfile), [features, maps, shares, viewerProfile])
  const communityFeed = useMemo(() => buildCommunityPosts(communityPosts, usersById), [communityPosts, usersById])
  const communityRequestSummary = useMemo(() => {
    const currentUserId = viewerProfile?.id || me.id
    const featureById = new Map(communityMapFeatures.map((feature) => [feature.id, feature]))
    const myFeatureIds = new Set(
      communityMapFeatures
        .filter((feature) => (feature.createdBy || null) === currentUserId)
        .map((feature) => feature.id),
    )
    const mine = []
    const incoming = []
    for (const request of communityPendingRequests) {
      if (!request || request.status !== "pending") continue
      const featureId = request.featureId || null
      const feature = featureId ? featureById.get(featureId) : null
      const title = request.payload?.title || feature?.title || "장소"
      const item = {
        ...request,
        featureTitle: title,
        requestedAtLabel: new Date(request.createdAt).toLocaleString("ko-KR"),
      }
      if (request.requestedBy === currentUserId) {
        mine.push(item)
      }
      if (featureId && myFeatureIds.has(featureId) && request.requestedBy !== currentUserId) {
        incoming.push(item)
      }
    }
    return {
      mine,
      incoming,
      mineCount: mine.length,
      incomingCount: incoming.length,
    }
  }, [communityMapFeatures, communityPendingRequests, viewerProfile?.id])

  const selectedUser = selectedUserProfile?.id === selectedUserId
    ? selectedUserProfile
    : selectedUserId
      ? users.find((user) => user.id === selectedUserId) || null
      : null
  const selectedUserPosts = useMemo(
    () => communityFeed.filter((post) => post.user.id === selectedUser?.id),
    [communityFeed, selectedUser?.id],
  )
  const selectedPost = useMemo(() => {
    if (!selectedPostRef) return null
    const pool = selectedPostRef.source === "own" ? ownPosts : communityFeed
    return pool.find((post) => post.id === selectedPostRef.id) || null
  }, [communityFeed, ownPosts, selectedPostRef])
  const selectedFeatureSummary = useMemo(() => {
    if (!selectedFeatureSummaryId) return null
    return activeFeaturePool.find((feature) => feature.id === selectedFeatureSummaryId) || null
  }, [activeFeaturePool, selectedFeatureSummaryId])
  const inlineRecordFeature = useMemo(() => {
    if (!inlineRecordFeatureId) return null
    return activeFeaturePool.find((feature) => feature.id === inlineRecordFeatureId) || null
  }, [activeFeaturePool, inlineRecordFeatureId])

  // "지도 공개" 시트 후보 = 아직 프로필에 공개되지 않은 B2C 지도.
  const onProfileMapIds = useMemo(() => new Set(shares.map((share) => share.mapId)), [shares])
  const profileUploadCandidates = useMemo(() => (
    b2cMaps.filter((mapItem) => {
      if (onProfileMapIds.has(mapItem.id)) return false
      return true
    })
  ), [b2cMaps, onProfileMapIds])
  const shareUrl = useMemo(() => {
    if (!activeMap) return ""
    if (activeMap.slug) {
      return buildSlugShareUrl(activeMap.slug, "link")
    }
    // 클라우드 모드는 공유 시트가 열릴 때 자동으로 짧은 링크를 만들므로 긴 데이터 URL 을 쓰지 않는다.
    // (데모/로컬 전용 fallback — 서버가 없어 자체 포함 URL 만 가능)
    if (cloudMode) return ""
    return buildMapShareUrl(activeMap, activeFeatures)
  }, [activeFeatures, activeMap, cloudMode])

  const featureEmojiChoices = featureSheet
    ? featureSheet.type === "route"
      ? [...placeEmojis, "🚶", "🚲", "🛵", "🚗", "🚌", "🚇", "⛴️", "✈️"]
      : featureSheet.type === "area"
        ? ["🏙️", "🌳", "🏞️", "🏝️", "🏕️", "🏟️", "🛍️", "🏛️", "🏠", "📌"]
        : placeEmojis
    : []
  const isDraftFeatureSheet = Boolean(featureSheet && ["새 장소", "새 길", "새 영역", `새 ${"\uACBD\uB85C"}`].includes((featureSheet.title || "").trim()))

  useEffect(() => {
    if (isDraftFeatureSheet || featureSheet?.cloudPending) {
      setFeatureSheetMode("edit")
    }
  }, [featureSheet?.cloudPending, isDraftFeatureSheet])

  // --- Hooks ---

  const { updateFeatures } = useFeaturePool(activeMapSource, setFeatures, setCommunityMapFeatures)

  const {
    photoInputRef,
    handlePhotoSelected, handleDeletePhoto,
  } = useMediaHandlers({ featureSheet, mediaTargetFeature: inlineRecordFeature, setFeatureSheet, updateFeatures, showToast, cloudMode })

  const {
    touchMap, resetEditorState,
    openMapEditor,
    saveMapSheet, deleteMap: deleteMapAction, reorderMaps,
    importSharedMapToLocal, importMapBundleToLocal,
    publishMap, refreshShareSnapshot, setMapPublic, unpublish, addMapToProfile, removeMapFromProfile,
    openFeatureFromPlaces, handleTabChange,
  } = useMapCRUD({
    maps, setMaps, features, setFeatures, shares, setShares,
    cloudMode, mapSheet, setMapSheet, setFeatureSheet,
    setMapsView, setActiveTab, setActiveMapSource, setActiveMapId,
    setSelectedFeatureId, setSelectedFeatureSummaryId,
    setEditorMode, setDraftPoints, setFitTrigger, setFocusPoint,
    showToast, sharedMapData, setSharedMapData,
    publishSheet, setPublishSheet, setSelectedPostRef,
    communityMapId,
  })

  const refreshCommunityPendingRequests = useCallback(async () => {
    if (!hasSupabaseEnv || !authUser || !communityMapId || communityMapId === "community-map") return
    try {
      const requests = await listFeatureChangeRequests(communityMapId, "pending")
      setCommunityPendingRequests(requests)
    } catch (error) {
      console.error("Failed to refresh community feature requests", error)
    }
  }, [authUser, communityMapId])

  const {
    focusFeature, focusFeatureOnly, openFeatureDetail,
    saveFeatureSheet, requestCommunityFeatureUpdate, requestCommunityFeatureUpdateById, deleteFeature,
    addMemo, updateMemo, deleteMemo, createHandleMapTap, completeRoute, completeArea,
    startRelocatePin, importCommunityFeatureToMine, unimportCommunityFeature,
  } = useFeatureEditing({
    activeMapId, activeMapSource, cloudMode,
    activeMapRole: activeMap?.userRole || "owner",
    setFeatures, featureSheet, setFeatureSheet,
    selectedFeatureSummaryId,
    setSelectedFeatureId, setSelectedFeatureSummaryId,
    setEditorMode, setDraftPoints, setMemoText,
    activeFeaturePool, communityMapFeatures, setCommunityMapFeatures,
    touchMap, showToast, setMaps,
    maps, features, myLocation, setFocusPoint,
    currentUserId: viewerProfile.id,
    currentUserName: viewerProfile.name,
    onCommunityRequestSubmitted: refreshCommunityPendingRequests,
  })

  const handleMapTap = useMemo(() => createHandleMapTap(editorMode), [createHandleMapTap, editorMode])
  const handleCreatePinAtLocation = useCallback(async ({ lat, lng, title, note } = {}) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    setDraftPoints([])
    return createHandleMapTap("pin")({ lat, lng, title, note })
  }, [createHandleMapTap])

  const openCollaboratorsForMap = useCallback((mapId) => {
    const targetMap = maps.find((item) => item.id === mapId)
    if (!targetMap || targetMap.isCommunity) return
    if (!cloudMode) {
      showToast("로그인 후 내 지도 협업자를 초대할 수 있어요.")
      return
    }
    setCollaboratorsSheet({ mapId })
  }, [cloudMode, maps, showToast])

  const handleCollaboratorsChanged = useCallback((nextCollaborators = []) => {
    const mapId = collaboratorsSheet?.mapId
    if (!mapId) return
    const count = nextCollaborators.filter((item) => (item.status || "accepted") === "accepted").length
    setMaps((current) => current.map((mapItem) => (
      mapItem.id === mapId
        ? { ...mapItem, collabCount: count, collaboratorCount: count }
        : mapItem
    )))
  }, [collaboratorsSheet?.mapId, setMaps])

  const handleCollaborationInviteResponse = useCallback(async (inviteId, decision) => {
    if (!inviteId) return
    try {
      await respondCollaborationInvite(inviteId, decision)
      setCollaborationInvites((current) => current.filter((invite) => invite.id !== inviteId))
      showToast(decision === "accepted" ? "지도 초대를 수락했어요." : "지도 초대를 거절했어요.")
      if (decision === "accepted") {
        await reloadCloudData?.()
      }
    } catch (error) {
      console.error("Failed to respond collaboration invite", error)
      showToast(error?.message || "초대를 처리하지 못했어요.")
    }
  }, [reloadCloudData, showToast])

  // --- 모두의 지도 가져오기: 지도 선택 시트 트리거 + 핸들러 ---
  // 팝업의 [가져오기] 탭 → 타겟 지도 선택 시트 열기.
  // 사용자가 기존 지도를 고르거나 '새 지도 만들기'로 신규 지도를 만들고 바로 import 한다.
  const handleImportCommunityFeatureRequest = useCallback((sourceFeatureId) => {
    if (!sourceFeatureId) return
    setImportTargetSheet({ featureId: sourceFeatureId })
  }, [])

  const handleImportPickMap = useCallback(async (targetMapId) => {
    const featureId = importTargetSheet?.featureId
    if (!targetMapId || !featureId) return
    const ok = importCommunityFeatureToMine(featureId, targetMapId)
    if (ok) setImportTargetSheet(null)
  }, [importTargetSheet, importCommunityFeatureToMine])

  const handleImportCreateMap = useCallback(async (title) => {
    const featureId = importTargetSheet?.featureId
    const trimmed = `${title || ""}`.trim()
    if (!featureId || !trimmed) return
    setImportTargetBusy(true)
    try {
      let nextMap
      if (cloudMode) {
        nextMap = await createMapRecord({
          title: trimmed,
          description: "",
          theme: "pastel",
          category: "personal",
          config: {},
        })
      } else {
        nextMap = {
          id: createId("map"),
          title: trimmed,
          description: "",
          theme: "pastel",
          category: "personal",
          config: {},
          updatedAt: new Date().toISOString(),
        }
      }
      setMaps((current) => [nextMap, ...current])
      // maps state 업데이트 이전에도 import 할 수 있도록 map 객체를 그대로 전달.
      const ok = importCommunityFeatureToMine(featureId, nextMap)
      if (ok) {
        showToast(`'${trimmed}' 지도를 만들고 저장했어요.`)
        setImportTargetSheet(null)
      }
    } catch (error) {
      console.error("Failed to create map for import", error)
      showToast("지도를 만들지 못했어요.")
    } finally {
      setImportTargetBusy(false)
    }
  }, [cloudMode, importTargetSheet, setMaps, importCommunityFeatureToMine, showToast])

  // C단계 빌더: 채집한 카드를 골라 새 지도로 묶는다
  // 편집기 [+ 카드 추가] — 값이 있으면 빌더가 '기존 지도에 추가' 모드
  const [builderAddMapId, setBuilderAddMapId] = useState(null)

  const handleBuilderCreate = useCallback(async (title, featureIds) => {
    const trimmed = `${title || ""}`.trim()
    const ids = Array.isArray(featureIds) ? featureIds.filter(Boolean) : []
    if (!trimmed || ids.length === 0) return
    setMapBuilderBusy(true)
    try {
      let nextMap
      if (cloudMode) {
        nextMap = await createMapRecord({
          title: trimmed,
          description: "",
          theme: "pastel",
          category: "personal",
          config: {},
        })
        // 고른 카드를 순서대로 새 지도에 담기 (050 배치 테이블 기준, bulk)
        try {
          await placeFeaturesInMap(nextMap.id, ids)
        } catch (placementError) {
          // 카드를 못 담으면 방금 만든 빈 지도가 남지 않게 정리 후 실패 처리
          await deleteMapRecord(nextMap.id).catch(() => {})
          throw placementError
        }
      } else {
        nextMap = {
          id: createId("map"),
          title: trimmed,
          description: "",
          theme: "pastel",
          category: "personal",
          config: {},
          updatedAt: new Date().toISOString(),
        }
      }
      setMaps((current) => [nextMap, ...current])
      // 로컬/클라우드 공통: 고른 카드를 새 지도에 배치(M:N). 스칼라 홈 지도(mapId)는 비어있을 때만 채운다.
      const idSet = new Set(ids)
      setFeatures((current) => current.map((feature) => (
        idSet.has(feature.id) && !feature.mapId ? { ...feature, mapId: nextMap.id } : feature
      )))
      setPlacementsByMap((current) => addPlacements(current, nextMap.id, ids))
      setMapBuilderOpen(false)
      showToast(`지도 완성 · '${trimmed}' · ${ids.length}곳`)
      openMapEditor(nextMap.id)
    } catch (error) {
      console.error("Failed to build map", error)
      showToast("지도를 만들지 못했어요.")
    } finally {
      setMapBuilderBusy(false)
    }
  }, [cloudMode, setMaps, setFeatures, setPlacementsByMap, openMapEditor, showToast])

  // 편집기 [+ 카드 추가] — 고른 카드를 기존 지도에 담는다
  const handleBuilderAddToMap = useCallback(async (featureIds) => {
    const mapId = builderAddMapId
    const ids = Array.isArray(featureIds) ? featureIds.filter(Boolean) : []
    if (!mapId || ids.length === 0) return
    setMapBuilderBusy(true)
    try {
      if (cloudMode) {
        // bulk 담기 — 대상 지도의 기존 sort_order 뒤에 이어붙는다
        await placeFeaturesInMap(mapId, ids)
      }
      // M:N 배치: 스칼라 홈 지도(mapId)는 비어있을 때만 채우고, 이미 다른 지도에 속한 카드는 배치만 추가한다.
      const idSet = new Set(ids)
      setFeatures((current) => current.map((feature) => (
        idSet.has(feature.id) && !feature.mapId ? { ...feature, mapId } : feature
      )))
      setPlacementsByMap((current) => addPlacements(current, mapId, ids))
      setMapBuilderOpen(false)
      setBuilderAddMapId(null)
      showToast(`${ids.length}곳을 지도에 담았어요`)
    } catch (error) {
      console.error("Failed to add cards to map", error)
      showToast("카드를 담지 못했어요.")
    } finally {
      setMapBuilderBusy(false)
    }
  }, [builderAddMapId, cloudMode, setFeatures, setPlacementsByMap, showToast])

  // 카드를 지도에서만 빼기 — Place(카드)는 바인더에 남는다 (편집기 선택 팝오버).
  const handleRemoveFeatureFromMap = useCallback(async (featureId) => {
    const mapId = activeMap?.id
    if (!mapId || !featureId) return
    if (!window.confirm("이 카드를 지도에서 뺄까요?\n카드는 내 장소(바인더)에 그대로 남아요.")) return
    try {
      if (cloudMode && activeMapSource === "local") {
        await removeFeatureFromMap(mapId, featureId)
      }
      // M:N 배치 제거 + 스칼라 홈 지도가 이 지도면 null 로 되돌림(다른 지도 배치는 그대로 유지)
      setPlacementsByMap((current) => removePlacement(current, mapId, featureId))
      setFeatures((current) => current.map((feature) => (
        feature.id === featureId && feature.mapId === mapId ? { ...feature, mapId: null } : feature
      )))
      setSelectedFeatureId(null)
      setSelectedFeatureSummaryId(null)
      showToast("지도에서 뺐어요 · 카드는 바인더에 남아있어요")
    } catch (error) {
      console.error("Failed to remove feature from map", error)
      showToast("카드를 빼지 못했어요.")
    }
  }, [activeMap?.id, activeMapSource, cloudMode, setFeatures, setPlacementsByMap, setSelectedFeatureId, setSelectedFeatureSummaryId, showToast])

  // --- Social / Profile ---

  const {
    handleUpdateProfile, toggleFollow, saveSharePlaceToMap,
  } = useSocialProfile({
    cloudMode, authUser,
    followed, setFollowed,
    likedPosts, setLikedPosts,
    setShares, setCommunityPosts,
    setViewerProfile,
    setFeatures, setActiveTab, setMapsView, setActiveMapId, setActiveMapSource,
    setSelectedFeatureId, setFeatureSheet, setEditorMode,
    pendingSharePlace, setPendingSharePlace,
    touchMap, showToast,
  })

  const mapEditorReadOnly = activeMapSource === "demo"
    || activeMapSource === "shared"
    || (activeMapSource === "local" && activeMap?.canEditFeatures === false)
    || (activeMapSource === "community" && !canEditCommunityMap)

  const hasUnsavedEditorDraft = activeTab === "maps"
    && mapsView === "editor"
    && activeMapSource === "local"
    && (draftPoints.length > 0 || ["pin", "route", "area", "relocate"].includes(editorMode))

  const confirmDiscardEditorDraft = useCallback(() => {
    if (!hasUnsavedEditorDraft) return true
    return window.confirm("작성 중인 내용이 저장되지 않습니다. 이동할까요?")
  }, [hasUnsavedEditorDraft])

  const handleMapEditorBack = useCallback(() => {
    if (!confirmDiscardEditorDraft()) return
    // 🌍 공개 지도는 편집을 마치고 나갈 때 스냅샷을 자동 갱신한다 (공개 = 최신을 보여주겠다는 의도).
    // 링크 공유(unlisted)는 공유 시트를 여는 시점에만 갱신 — 보여줄 시점을 사용자가 정한다.
    if (
      cloudMode && activeMapSource === "local"
      && activeMap?.isPublished && activeMap?.visibility === "public"
      && (!activeMap?.userRole || activeMap.userRole === "owner")
    ) {
      refreshShareSnapshot(activeMap.id)
    }
    if (activeMapSource === "community" || activeMapSource === "shared") {
      setActiveTab("maps")
    }
    if (activeMapSource === "shared") {
      setSharedMapData(null)
      setActiveMapId(maps[0]?.id ?? null)
    }
    setMapsView("list")
    resetEditorState()
    setActiveMapSource("local")
  }, [activeMap, activeMapSource, cloudMode, confirmDiscardEditorDraft, maps, refreshShareSnapshot, resetEditorState, setActiveMapId, setActiveMapSource, setActiveTab, setMapsView])

  const recoverToHome = useCallback(() => {
    setSharedMapData(null)
    setActiveTab("maps")
    setMapsView("list")
    setActiveMapSource("local")
    setActiveMapId(maps[0]?.id ?? null)
    resetEditorState()
  }, [maps, resetEditorState, setActiveMapId, setActiveMapSource, setActiveTab, setMapsView])

  const getRecordToast = useCallback((recordMethod) => {
    if (recordMethod === "search") return "장소를 검색해 찾은 뒤 지도에 남겨보세요."
    if (recordMethod === "current") return "현재 위치 주변에 장소를 남겨보세요."
    return "지도를 탭해 장소를 남겨보세요."
  }, [])

  const startRecordInMap = useCallback(async (mapId, recordMethod = "map") => {
    const targetMap = maps.find((mapItem) => mapItem.id === mapId)
    if (!targetMap) {
      showToast("기록할 지도를 선택해 주세요.")
      return false
    }
    if (!confirmDiscardEditorDraft()) return false

    setRecordSheetOpen(false)
    setRecordSheetInitialView("target")
    setRecordTargetMapId(null)

    if (activeMapSource === "shared") {
      setSharedMapData(null)
      setActiveMapSource("local")
    }
    if (
      !(activeTab === "maps"
        && mapsView === "editor"
        && activeMapSource === "local"
        && activeMapId === mapId)
    ) {
      openMapEditor(mapId)
    }

    setFeatureSheet(null)
    setSelectedFeatureId(null)
    setSelectedFeatureSummaryId(null)
    setDraftPoints([])
    setEditorMode("pin")
    if (recordMethod === "current") await locateMe()
    showToast(getRecordToast(recordMethod))
    return true
  }, [
    activeMapId, activeMapSource, activeTab, confirmDiscardEditorDraft, getRecordToast,
    locateMe, maps, mapsView, openMapEditor, setActiveMapSource, setDraftPoints,
    setEditorMode, setFeatureSheet, setSelectedFeatureId, setSelectedFeatureSummaryId,
    setSharedMapData, showToast,
  ])

  const openRecordMapCreateFlow = useCallback(() => {
    setPendingRecordAfterMapCreate(true)
    setRecordSheetOpen(false)
    setRecordSheetInitialView("target")
    setRecordTargetMapId(null)
    setActiveTab("maps")
    setMapsView("list")
    setActiveMapSource("local")
    setMapSheet({
      mode: "create",
      id: null,
      title: "새 장소 지도",
      description: "",
      theme: themePalette[0],
      category: "personal",
      config: {},
    })
  }, [setActiveMapSource, setActiveTab, setMapSheet, setMapsView])

  useEffect(() => {
    if (!pendingRecordAfterMapCreate) return
    if (mapSheet) return
    if (activeTab !== "maps" || mapsView !== "editor" || activeMapSource !== "local" || !activeMapId) return

    setPendingRecordAfterMapCreate(false)
    setRecordTargetMapId(activeMapId)
    setRecordSheetInitialView("method")
    setRecordSheetOpen(true)
  }, [activeMapId, activeMapSource, activeTab, mapSheet, mapsView, pendingRecordAfterMapCreate])

  const handleMapFormClose = useCallback(() => {
    if (pendingRecordAfterMapCreate && mapSheet?.mode === "create") {
      setPendingRecordAfterMapCreate(false)
    }
    setMapSheet(null)
  }, [mapSheet, pendingRecordAfterMapCreate])

  // 장소 목록에서 장소를 누르면 지도 이동 대신 카드로 먼저 보여준다
  const [placeCardFeature, setPlaceCardFeature] = useState(null)
  // 새로운 곳 발견 연출 (등록 직후)
  const [newFindCard, setNewFindCard] = useState(null)

  // 채집 시트 (B단계) — 지도 없이 장소를 먼저 등록
  const [collectSheetOpen, setCollectSheetOpen] = useState(false)
  // 탐색 큐레이션 → 등록 프리필 (행사/공간 카드에서 진입)
  const [collectPrefill, setCollectPrefill] = useState(null)

  // 지도 만들기 빌더 (C단계) — 채집한 카드를 골라 지도로 묶기
  const [mapBuilderOpen, setMapBuilderOpen] = useState(false)
  const [mapBuilderBusy, setMapBuilderBusy] = useState(false)

  // 빌더 후보: 채집한 내 모든 카드(바인더) 중 대상 지도에 아직 안 담긴 것.
  //  - 새 지도 만들기(builderAddMapId 없음): 내 카드 전부
  //  - 기존 지도에 추가(builderAddMapId 있음): 그 지도에 이미 담긴 카드 제외 → 나머지 기존 카드 중 골라 담기(M:N)
  const builderCandidates = useMemo(
    () => b2cFeatures.filter((feature) => !isFeatureInMap(feature, builderAddMapId)),
    [b2cFeatures, builderAddMapId, isFeatureInMap],
  )

  // 도감 번호(N.###) — 내 장소 도감과 동일한 규칙(오래된 기록부터 고정 순번)
  const placeCardDexNo = useMemo(() => {
    if (!placeCardFeature) return null
    const targetId = placeCardFeature.id || placeCardFeature.feature_id
    const ordered = [...b2cFeatures].sort((a, b) => featureSort(b, a))
    const index = ordered.findIndex((feature) => (feature.id || feature.feature_id) === targetId)
    return index >= 0 ? String(index + 1).padStart(3, "0") : null
  }, [placeCardFeature, b2cFeatures])

  const newFindDexNo = useMemo(() => {
    if (!newFindCard) return null
    const targetId = newFindCard.id || newFindCard.feature_id
    const ordered = [...b2cFeatures].sort((a, b) => featureSort(b, a))
    const index = ordered.findIndex((feature) => (feature.id || feature.feature_id) === targetId)
    return index >= 0 ? String(index + 1).padStart(3, "0") : null
  }, [newFindCard, b2cFeatures])

  const handleBottomNavChange = useCallback((nextTab) => {
    // 산책 모드 중 탭 이동 = 게임 나가기 (setShowWalk 는 idempotent, URL 은 실제 경로로 판단)
    setShowWalk(false)
    if (window.location.pathname === "/walk") {
      try { window.history.replaceState(null, "", "/") } catch { /* ignore */ }
    }
    if (nextTab === "login") {
      if (activeTab !== "login" && !confirmDiscardEditorDraft()) return
      handleTabChange("login")
      return
    }
    if (needsAuthForPersonalArea && (nextTab === "maps" || nextTab === "places" || nextTab === "profile" || nextTab === "account")) {
      requestLoginBanner()
      return
    }
    if (nextTab !== activeTab && !confirmDiscardEditorDraft()) return
    handleTabChange(nextTab)
    if (nextTab === "maps") {
      setMapsView("list")
      setActiveMapSource("local")
    }
    if (nextTab !== "maps" && activeMapSource === "shared") {
      setSharedMapData(null)
      setActiveMapSource("local")
      setActiveMapId(maps[0]?.id ?? null)
    }
  }, [
    activeMapSource,
    activeTab,
    confirmDiscardEditorDraft,
    handleTabChange,
    maps,
    needsAuthForPersonalArea,
    requestLoginBanner,
    setActiveMapSource,
    setMapsView,
  ])

  const handleSavePostMap = useCallback(async (post) => {
    if (!post?.mapId) return
    if (savingPostMapId === post.mapId) return
    if (maps.some((mapItem) => mapItem.id === post.mapId)) {
      showToast("이미 내 라이브러리에 있는 지도예요.")
      setSelectedPostRef(null)
      openMapEditor(post.mapId)
      return
    }
    if (!hasSupabaseEnv) {
      showToast("이 지도는 온라인 상태에서만 저장할 수 있어요.")
      return
    }
    try {
      setSavingPostMapId(post.mapId)
      // 저장 진입점(공유 뷰어/피드)을 동일 기준으로 집계한다.
      logEvent("map_save", { map_id: post.mapId })
      try {
        await saveMapRecord(post.mapId, { source: "post_save" })
      } catch {
        // map_saves가 아직 없거나 RPC가 실패해도 실제 가져오기 흐름은 유지
      }
      const { getMapBundle } = await import("./lib/mapService.read")
      const bundle = await getMapBundle(post.mapId)
      await importMapBundleToLocal(bundle, { toastMessage: "지도를 내 라이브러리에 저장했어요." })
      setSelectedPostRef(null)
    } catch (error) {
      console.error("Failed to save post map", error)
      showToast("지도 저장에 실패했어요. 잠시 후 다시 시도해 주세요.")
    } finally {
      setSavingPostMapId(null)
    }
  }, [importMapBundleToLocal, maps, openMapEditor, savingPostMapId, setSelectedPostRef, showToast])

  const handlePublishSubmit = useCallback(async () => {
    if (publishSubmitting) return
    setPublishSubmitting(true)
    try {
      return await publishMap()
    } finally {
      setPublishSubmitting(false)
    }
  }, [publishMap, publishSubmitting])

  // 프로필 공개/내리기 공통 confirm 진입점.
  // 호출부: MapsList / MapEditor / PublishSheet 성공 후속.
  const requestProfilePlacement = useCallback((mode, mapId, onSuccess) => {
    if (!mapId) return
    setProfilePlacementSheet({ mode, mapId, onSuccess: onSuccess || null })
  }, [])

  const handleProfilePlacementCancel = useCallback(() => {
    if (profilePlacementSubmitting) return
    setProfilePlacementSheet(null)
  }, [profilePlacementSubmitting])

  const handleProfilePlacementConfirm = useCallback(async () => {
    if (!profilePlacementSheet) return
    setProfilePlacementSubmitting(true)
    try {
      const ok = profilePlacementSheet.mode === "remove"
        ? await removeMapFromProfile(profilePlacementSheet.mapId)
        : profilePlacementSheet.mode === "removeForUnpublish"
          ? (await unpublish(profilePlacementSheet.mapId), true)
          : await addMapToProfile(profilePlacementSheet.mapId)
      if (ok) {
        profilePlacementSheet.onSuccess?.()
        setProfilePlacementSheet(null)
      }
    } finally {
      setProfilePlacementSubmitting(false)
    }
  }, [addMapToProfile, profilePlacementSheet, removeMapFromProfile, unpublish])

  const handleMapEditorPublish = useCallback(async (mapId) => {
    const publishedMapId = await publishMap(mapId)
    if (publishedMapId) {
      requestProfilePlacement("add", publishedMapId)
    }
    return publishedMapId
  }, [publishMap, requestProfilePlacement])

  // 공유 시트가 열릴 때 링크를 보장한다: 없으면 자동 생성(unlisted), 있으면 스냅샷만 조용히 갱신.
  // 프로필 노출 제안 없이 링크만 만든다 — 공유 의도와 프로필 공개 의도는 분리.
  const handleEnsureShareLink = useCallback(async (mapId) => {
    if (!mapId) return null
    const targetMap = maps.find((item) => item.id === mapId)
    if (!targetMap) return null
    if (targetMap.slug && targetMap.isPublished) {
      refreshShareSnapshot(mapId)
      return mapId
    }
    return await publishMap(mapId)
  }, [maps, publishMap, refreshShareSnapshot])

  // 링크 끄기 — ShareSheet 의 confirm 이 링크·공개·프로필 해제를 한 번에 안내하므로 바로 실행한다.
  // (unpublish 가 프로필 노출도 함께 내린다)
  const handleMapEditorUnpublish = useCallback(async (mapId) => {
    if (!mapId) return false
    await unpublish(mapId)
    return true
  }, [unpublish])

  const handleSaveSharedMap = useCallback(async () => {
    if (savingSharedMap) return
    setSavingSharedMap(true)
    try {
      await importSharedMapToLocal()
    } finally {
      setSavingSharedMap(false)
    }
  }, [importSharedMapToLocal, savingSharedMap])

  // 배포 후 최초 1회: 레거시 "발행=자동 프로필 노출" 시절의 publication row 를 정리한다.
  // cloudMode 가 true 가 되는 순간에 시도하고, 성공 시 localStorage flag 로 재실행을 막는다.
  useEffect(() => {
    if (!cloudMode) return
    let cancelled = false
    resetLegacyProfileCuration()
      .then((result) => {
        if (cancelled) return
        if (result?.deleted) {
          // 외부 관리 화면/로컬 상태와 동기화. 화면에 남아있는 shares 가 있을 수 있으므로 비운다.
          setShares([])
        }
      })
      .catch((error) => {
        console.warn("[profile curation reset] failed (will retry next session):", error)
      })
    return () => { cancelled = true }
  }, [cloudMode, setShares])

  useEffect(() => {
    if (!supabase || !cloudMode) return
    if (activeTab !== "maps" || mapsView !== "editor") return
    if (activeMapSource === "shared" || activeMapSource === "demo") return

    const mapId = activeMapSource === "community" ? communityMapId : activeMapId
    if (!mapId || mapId === "community-map") return

    const featureIds = new Set(
      activeFeaturePool
        .filter((feature) => feature.mapId === mapId)
        .map((feature) => feature.id),
    )

    let cancelled = false
    let pendingTimer = null
    let syncRunning = false

    const syncMapBundle = async () => {
      if (cancelled || syncRunning) return
      syncRunning = true
      try {
        if (activeMapSource === "community") {
          const bundle = await getCommunityMapBundle()
          if (cancelled || !bundle?.map || bundle.map.id !== mapId) return

          setCommunityMapId(bundle.map.id)
          setCommunityMapFeatures((current) => (
            mergeFeatureListWithLocalMedia(Array.isArray(bundle.features) ? bundle.features : [], current)
          ))
          setActiveMapId((current) => (
            current === "community-map" || current === mapId
              ? bundle.map.id
              : current
          ))
          return
        }

        const bundle = await getMapBundle(mapId)
        if (cancelled || !bundle?.map || bundle.map.id !== mapId) return

        const nextFeatures = Array.isArray(bundle.features) ? bundle.features : []
        setFeatures((current) => [
          ...current.filter((feature) => feature.mapId !== mapId),
          ...mergeFeatureListWithLocalMedia(
            nextFeatures,
            current.filter((feature) => feature.mapId === mapId),
          ),
        ])
        setMaps((current) => current.map((mapItem) => (
          mapItem.id === mapId ? { ...mapItem, ...bundle.map } : mapItem
        )))
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to sync map changes in realtime", error)
        }
      } finally {
        syncRunning = false
      }
    }

    const scheduleSync = () => {
      if (cancelled) return
      if (pendingTimer) window.clearTimeout(pendingTimer)
      pendingTimer = window.setTimeout(() => {
        syncMapBundle()
      }, 120)
    }

    let channel = supabase
      .channel(`loca-map-sync:${mapId}:${activeMapSource}:${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "map_features", filter: `map_id=eq.${mapId}` },
        scheduleSync,
      )

    if (activeMapSource === "community") {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_records" },
        scheduleSync,
      )
    } else {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feature_memos" },
        (payload) => {
          const featureId = payload?.new?.feature_id || payload?.old?.feature_id
          if (featureId && featureIds.has(featureId)) {
            scheduleSync()
          }
        },
      )
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feature_media" },
        (payload) => {
          const featureId = payload?.new?.feature_id || payload?.old?.feature_id
          if (featureId && featureIds.has(featureId)) {
            scheduleSync()
          }
        },
      )
    }

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.warn("Realtime channel error", { mapId, source: activeMapSource })
      }
    })

    return () => {
      cancelled = true
      if (pendingTimer) window.clearTimeout(pendingTimer)
      supabase.removeChannel(channel)
    }
  }, [
    activeFeaturePool,
    activeMapId,
    activeMapSource,
    activeTab,
    cloudMode,
    communityMapId,
    mapsView,
    setActiveMapId,
    setCommunityMapId,
    setCommunityMapFeatures,
    setFeatures,
    setMaps,
  ])

  // --- Route effects ---

  useEffect(() => {
    if (!hasSupabaseEnv || !authReady) return
    let cancelled = false

    const hydrateCommunityMap = async () => {
      try {
        const bundle = await getCommunityMapBundle()
        if (cancelled || !bundle?.map) return

        setCommunityMapId(bundle.map.id)
        setCommunityMapFeatures((current) => (
          mergeFeatureListWithLocalMedia(Array.isArray(bundle.features) ? bundle.features : [], current)
        ))
        setActiveMapId((current) => (current === "community-map" ? bundle.map.id : current))

        if (routeAtLoad?.type === "map" && (routeAtLoad.mapId === "community-map" || routeAtLoad.mapId === bundle.map.id)) {
          setActiveTab("maps")
          setMapsView("editor")
          setActiveMapSource("community")
          setActiveMapId(bundle.map.id)
        }
      } catch (error) {
        console.error("Failed to hydrate community map", error)
      }
    }

    hydrateCommunityMap()
    return () => { cancelled = true }
  }, [authReady, authUser, routeAtLoad, setActiveMapId, setActiveMapSource, setActiveTab, setMapsView, setCommunityMapFeatures])

  useEffect(() => {
    if (!hasSupabaseEnv || !authReady || !authUser || !communityMapId || communityMapId === "community-map") {
      setCommunityPendingRequests([])
      return undefined
    }
    let cancelled = false
    const fetchRequests = async () => {
      try {
        const requests = await listFeatureChangeRequests(communityMapId, "pending")
        if (!cancelled) {
          setCommunityPendingRequests(requests)
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load community feature requests", error)
        }
      }
    }
    fetchRequests()
    const timer = window.setInterval(fetchRequests, 45000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [authReady, authUser, communityMapId])

  useEffect(() => {
    if (!authUser || communityRequestSummary.incoming.length === 0) return
    let added = false
    for (const request of communityRequestSummary.incoming) {
      const next = addNotification({
        type: NOTI_TYPES.FEATURE_UPDATE_REQUEST,
        mapId: request.mapId,
        title: `${request.featureTitle || "장소"} 수정 요청`,
        body: `${request.requestedByName || "사용자"}님이 변경을 제안했어요.`,
        meta: {
          dedup: `community-feature-request:${request.id}`,
          requestId: request.id,
          featureId: request.featureId,
        },
      })
      if (next) added = true
    }
    if (added) {
      notiRefresh()
    }
  }, [authUser, communityRequestSummary.incoming, notiRefresh])

  useEffect(() => {
    if (routeAtLoad?.type === "invalid-shared") {
      showToast("공유 링크를 열지 못했어요.")
    }
    if (
      routeAtLoad?.type === "map"
      && !initialStoredTarget
      && routeAtLoad.mapId !== "community-map"
      && routeAtLoad.mapId !== communityMapId
      && (!hasSupabaseEnv || (authReady && communityMapId !== "community-map"))
    ) {
      showToast("이 기기에서 찾을 수 없는 지도예요.")
    }
  }, [authReady, communityMapId, initialStoredTarget, routeAtLoad, showToast])

  // 슬러그 기반 공유 URL 로딩 (/s/:slug)
  useEffect(() => {
    if (routeAtLoad?.type !== "slug" || !hasSupabaseEnv) return
    let isMounted = true
    getPublishedMapBySlug(routeAtLoad.slug)
      .then((result) => {
        if (!isMounted) return
        if (result) {
          setSharedMapData({ map: result.map, features: result.features })
          setActiveTab("maps")
          setMapsView("editor")
          setActiveMapSource("shared")
          setActiveMapId(result.map.id)
        } else {
          showToast("존재하지 않는 지도예요.")
        }
      })
      .catch(() => {
        if (isMounted) showToast("지도를 불러오지 못했어요.")
      })
    return () => { isMounted = false }
  }, [routeAtLoad, showToast])

  // 로컬 모드에서 현재 activeMapId가 maps에 없으면 보정
  useEffect(() => {
    if (activeMapSource !== "local") return
    if (mapsView === "editor" && maps.length === 0 && activeMapId) {
      setMapsView("list")
      return
    }
    if (activeMapId && !maps.some((mapItem) => mapItem.id === activeMapId) && maps.length > 0) {
      setActiveMapId(maps[0].id)
    }
  }, [activeMapId, activeMapSource, maps, mapsView])

  useEffect(() => {
    const sharedMapPath = activeMapSource === "shared" && sharedMapData
      ? routeAtLoad?.type === "slug" && routeAtLoad.slug
        ? `/s/${encodeURIComponent(routeAtLoad.slug)}`
        : buildMapSharePath(sharedMapData.map, sharedMapData.features)
      : null

    const routeMapId = activeMapSource === "community" ? "community-map" : activeMapId
    const nextPath = activeTab === "maps" && mapsView === "editor" && routeMapId
      ? sharedMapPath ?? buildMapRoutePath(routeMapId)
      : "/"
    const currentPath = `${window.location.pathname}${window.location.search}`
    if (currentPath !== nextPath) {
      window.history.replaceState(null, "", nextPath)
    }
  }, [activeMapId, activeMapSource, activeTab, mapsView, routeAtLoad, sharedMapData])

  // --- Render ---

  if (sharedMapData) {
    return (
      <AppErrorBoundary>
      <Suspense fallback={<ScreenFallback />}>
        <SharedMapViewer
          map={sharedMapData.map}
          features={sharedMapData.features}
          onSaveToApp={handleSaveSharedMap}
          savingToApp={savingSharedMap}
        />
        <Toast message={toast.message} />
      </Suspense>
      </AppErrorBoundary>
    )
  }

  const isMapEditorLayout = activeTab === "maps" && mapsView === "editor"
  const showLoginLoading = hasSupabaseEnv && activeTab === "login" && !authReady
  const shouldRenderLoginScreen = !showLoginLoading && !showPersonalLoading && activeTab === "login"
  const shouldRenderMissingMapRecovery = !showPersonalLoading
    && !showPersonalGate
    && activeTab === "maps"
    && mapsView === "editor"
    && !activeMap
  const bottomNavTab = showPersonalGate ? "login" : activeTab
  const shouldHideBottomNav = keyboardVisible || Boolean(featureSheet)
  const shellClassName = [
    "app-shell",
    " app-shell--soft-social",
    isMapEditorLayout ? " app-shell--map-editor" : "",
    ` app-shell--tab-${bottomNavTab}`,
  ].join("")


  // 타이틀 화면(오버레이) 핸들러 — 첫 방문 자동 + 로고 클릭 재진입 공용
  const dismissTitle = () => {
    try { localStorage.setItem("loca.intro_seen", "1") } catch { /* ignore */ }
    setShowTitle(false)
  }
  const handleTitleEnter = () => {
    dismissTitle()
    if (showWalk) exitWalk()
    setActiveTab("explore")
    // 첫 입장이면 로카냥 튜토리얼 1회 자동 재생
    if (!authUser && !isTutorialSeen("guest")) setTutorial({ step: 0, auto: "guest" })
  }
  const handleTitleGame = () => {
    dismissTitle()
    setShowWalk(true)
    try { window.history.replaceState(null, "", "/walk") } catch { /* ignore */ }
  }
  const handleTitleLogin = () => { dismissTitle(); if (showWalk) exitWalk(); setActiveTab("login") }
  // 산책 모드 나가기 — 탐색 탭 복귀 + URL 원복
  const exitWalk = () => {
    setShowWalk(false)
    try { window.history.replaceState(null, "", "/") } catch { /* ignore */ }
  }
  // 산책 모드 채집 → 실제 새발견 카드 등록(explore 와 동일한 CollectSheet 경로).
  // 개인영역 인증이 필요한 모드(supabase 로그인 전)면 로그인 게이트. 반환값 = 진행 여부.
  const handleWalkCollect = (spot) => {
    if (needsAuthForPersonalArea) {
      requestLoginBanner()
      showToast("로그인하면 내 도감에 남길 수 있어요")
      return false
    }
    if (!Number.isFinite(spot?.lat) || !Number.isFinite(spot?.lng)) {
      showToast("이 생물은 위치 정보가 없어 카드로 등록할 수 없어요")
      return false
    }
    // exploreCuration.wildlifeToPrefill 과 동일 형태 (여기 인라인해 explore 청크를 메인에 안 끌어옴)
    const prefill = {
      name: spot.title,
      category: "nature",
      tagLabel: spot.category || "생물",
      address: spot.place || "",
      lat: spot.lat,
      lng: spot.lng,
      asNewFind: true,
    }
    setCollectPrefill(prefill)
    setCollectSheetOpen(true)
    return true
  }

  return (
    <div className={shellClassName}>
      {!isOnline ? (
        <div className="offline-banner">오프라인 모드 - 데이터가 자동 저장됩니다</div>
      ) : null}
      {/* 인앱 배너 */}
      <NotificationBanner
        notification={notiBanner}
        onTap={() => { notiDismissBanner(); setNotiPanelOpen(true) }}
        onDismiss={notiDismissBanner}
      />

      {/* 알림 패널 */}
      {notiPanelOpen && (
        <NotificationPanel
          notifications={notiList}
          onMarkRead={notiMarkRead}
          onMarkAllRead={notiMarkAllRead}
          onRemove={notiRemove}
          onClose={() => setNotiPanelOpen(false)}
          onTap={() => setNotiPanelOpen(false)}
        />
      )}

      <main className="content">
      {showWalk ? null : (
      <AppErrorBoundary>
      <Suspense fallback={<ScreenFallback />}>
        {showPersonalLoading ? (
          <section className="screen screen--scroll" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
            <div style={{ textAlign: "center", color: "#aaa", fontSize: 13 }}>불러오는 중...</div>
          </section>
        ) : null}

        {showLoginLoading ? (
          <section className="screen screen--scroll" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
            <div style={{ textAlign: "center", color: "#aaa", fontSize: 13 }}>로그인 상태 확인 중...</div>
          </section>
        ) : null}

        {shouldRenderLoginScreen ? (
          authUser ? (
            <SignedInScreen
              user={authUser}
              onOpenMaps={() => {
                setActiveTab("maps")
                setMapsView("list")
                setActiveMapSource("local")
              }}
              onOpenProfile={() => setActiveTab("profile")}
              onSignOut={cloudMode ? handleSignOut : null}
            />
          ) : (
            <WebAuthLayout>
                <AuthScreen
                  title="로그인"
                  subtitle="내 지도와 친구와 모은 장소를 웹에서 이어보세요"
                  onSuccess={handleAuthSuccess}
                />
            </WebAuthLayout>
          )
        ) : null}

        <ConsentGate open={needsConsent} submitting={consentSubmitting} onAgree={handleConsentAgree} />

        {/* 탐색 — 내 위치 주변 행사/공간 큐레이션, 로그인 불필요 */}
        {activeTab === "explore" ? (
          <WebPageFrame
            className="web-section--explore"
            eyebrow="EXPLORE"
            title="탐색"
            description="지금 내 주변에서 기록할만한 행사와 공간을 찾아요."
          >
            <ExploreCurationScreen
              showToast={showToast}
              onRegister={(prefillCandidate) => {
                setCollectPrefill(prefillCandidate)
                setCollectSheetOpen(true)
              }}
            />
          </WebPageFrame>
        ) : null}

        {!showPersonalLoading && !showPersonalGate && activeTab === "maps" && mapsView === "list" ? (
          <WebPageFrame
            className="web-section--maps maps-library-screen--v2"
            eyebrow="MY MAPS"
            title="내 지도"
            description={`모은 지도 ${b2cMaps.length}개`}
            action={(
              <button className="web-section__action" type="button" onClick={openMapBuilder}>
                <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
                새 지도
              </button>
            )}
          >
            <MapsListScreen
              maps={b2cMaps}
              features={b2cFeatures}
              shares={b2cShares}
              loading={cloudLoading}
              characterImage="/characters/cloud_lv1.svg"
              onCreate={openMapBuilder}
              onEdit={(mapId) => {
                const mapItem = maps.find((item) => item.id === mapId)
                if (mapItem) {
                  setMapSheet({
                    mode: "edit",
                    id: mapItem.id,
                    title: mapItem.title,
                    description: mapItem.description,
                    theme: mapItem.theme,
                    category: mapItem.category || "personal",
                    config: mapItem.config || {},
                  })
                }
              }}
              onCollaborate={openCollaboratorsForMap}
              onOpen={openMapEditor}
              onDelete={(mapId, mapTitle) => {
                if (!window.confirm(`"${mapTitle}" 지도를 삭제할까요?`)) return
                deleteMapAction(mapId)
              }}
              onReorder={reorderMaps}
              collaborationInvites={collaborationInvites}
              onAcceptCollaborationInvite={(inviteId) => handleCollaborationInviteResponse(inviteId, "accepted")}
              onRejectCollaborationInvite={(inviteId) => handleCollaborationInviteResponse(inviteId, "rejected")}
            />
          </WebPageFrame>
        ) : null}

        {!showPersonalLoading && !showPersonalGate && activeTab === "places" ? (
          <WebPageFrame
            className="web-section--places maps-library-screen--v2"
            eyebrow="MY PLACES"
            title="내 장소"
            description={`모은 장소 ${b2cFeatures.length}개`}
            action={(
              <button className="web-section__action" type="button" onClick={() => setCollectSheetOpen(true)}>
                <Database size={16} strokeWidth={2.2} aria-hidden="true" />
                등록하기
              </button>
            )}
          >
            <PlacesScreen
              maps={b2cMaps}
              features={b2cFeatures}
              characterImage="/characters/cloud_lv1.svg"
              initialQuery={placesInitialQuery}
              onOpenFeature={(featureId) => {
                const feature = b2cFeatures.find((item) => (item.id || item.feature_id) === featureId)
                if (feature) setPlaceCardFeature(feature)
              }}
              onCreateRecord={() => setCollectSheetOpen(true)}
              embedded
            />
          </WebPageFrame>
        ) : null}

        {/* 지도 편집기 (MapEditorScreen) */}
        {!showPersonalLoading && !showPersonalGate && activeTab === "maps" && mapsView === "editor" && activeMap ? (
          <MapEditorScreen
            map={activeMap}
            features={activeFeatures}
            selectedFeatureId={selectedFeatureId}
            selectedFeatureSummary={selectedFeatureSummary}
            editorMode={editorMode}
            draftPoints={draftPoints}
            focusPoint={focusPoint}
            fitTrigger={fitTrigger}
            myLocation={myLocation}
            currentUserId={viewerProfile.id}
            readOnly={mapEditorReadOnly}
            hideCount={activeMapSource === "community"}
            communityMode={activeMapSource === "community"}
            shareUrl={shareUrl}
            showLabels={showMapLabels}
            onBack={handleMapEditorBack}
            onFit={() => setFitTrigger((value) => value + 1)}
            onSearchLocation={(loc) => setFocusPoint(loc)}
            onCreatePinAtLocation={handleCreatePinAtLocation}
            onLocate={locateMe}
            onModeChange={(mode) => {
              setEditorMode(mode)
              setDraftPoints([])
              setSelectedFeatureId(null)
              setSelectedFeatureSummaryId(null)
            }}
            onMapTap={handleMapTap}
            onFeatureTap={focusFeature}
            onStripFeatureTap={focusFeatureOnly}
            onUndoDraft={() => setDraftPoints((current) => current.slice(0, -1))}
            onCompleteRoute={() => completeRoute(draftPoints)}
            onCompleteArea={() => completeArea(draftPoints)}
            onCancelDraft={() => {
              setDraftPoints([])
              setEditorMode("browse")
            }}
            onToggleLabels={() => setShowMapLabels((current) => !current)}
            onRenameMap={async (nextTitle) => {
              const targetId = activeMap?.id
              if (!targetId) return
              setMaps((current) => current.map((mapItem) => (mapItem.id === targetId ? { ...mapItem, title: nextTitle } : mapItem)))
              if (cloudMode && activeMapSource === "local") {
                try { await updateMapRecord(targetId, { title: nextTitle }) } catch { showToast("이름 변경 저장에 실패했어요") }
              }
            }}
            onAddCards={() => { setBuilderAddMapId(activeMap?.id || null); setMapBuilderOpen(true) }}
            onOpenCollaborators={activeMapSource === "local" && cloudMode && activeMap
              ? () => openCollaboratorsForMap(activeMap.id)
              : () => showToast("로그인 후 협업자를 초대할 수 있어요")}
            onOpenFeatureDetail={(featureId) => {
              setFeatureSheetMode("detail")
              openFeatureDetail(featureId)
            }}
            onOpenFeatureEdit={(featureId) => {
              setFeatureSheetMode("edit")
              openFeatureDetail(featureId)
            }}
            onAddMemo={addMemo}
            photoInputRef={photoInputRef}
            onPhotoSelected={handlePhotoSelected}
            onDeletePhoto={handleDeletePhoto}
            onBeginFeatureRecord={(featureId) => setInlineRecordFeatureId(featureId)}
            onEndFeatureRecord={() => setInlineRecordFeatureId(null)}
            importedCommunityFeatureIds={importedCommunityFeatureIds}
            onImportCommunityFeature={handleImportCommunityFeatureRequest}
            onUnimportCommunityFeature={unimportCommunityFeature}
            onRequestCommunityUpdateFromSummary={requestCommunityFeatureUpdateById}
            onOpenShareEditor={(canvas) => setShareEditorImage(canvas)}
            onUpdateMemo={updateMemo}
            onDeleteMemo={deleteMemo}
            placementRow={findPlacementForMap(activeMap?.id, shares)}
            onPublishMap={handleMapEditorPublish}
            onUnpublishMap={handleMapEditorUnpublish}
            onEnsureShareLink={handleEnsureShareLink}
            onSetMapPublic={setMapPublic}
            shareAutoEnable={cloudMode && activeMapSource === "local" && !mapEditorReadOnly}
            onAddMapToProfile={(mapId) => requestProfilePlacement("add", mapId)}
            onRemoveMapFromProfile={(mapId) => requestProfilePlacement("remove", mapId)}
            onCloseFeatureSummary={() => {
              setSelectedFeatureId(null)
              setSelectedFeatureSummaryId(null)
            }}
            onRemoveFeatureFromMap={!mapEditorReadOnly && activeMapSource === "local" ? handleRemoveFeatureFromMap : undefined}
            showToast={showToast}
            coachmarkStep={coachmarkStep}
            onCoachmarkNext={(nextStep) => {
              if (nextStep === 2) {
                // 코치마크 1 → 핀 모드 자동 설정 + 코치마크 2
                if (editorMode !== "pin") {
                  setEditorMode("pin")
                  setDraftPoints([])
                  setSelectedFeatureId(null)
                  setSelectedFeatureSummaryId(null)
                }
                setCoachmarkStep(2)
              } else if (nextStep === 0) {
                // 코치마크 2 확인 → dismiss, 사용자가 실제 탭할 때까지 대기
                setCoachmarkStep(0)
              }
            }}
            onCoachmarkSkip={() => {
              markCoachmarkSeen()
              setCoachmarkStep(0)
            }}
            firstPinHintVisible={firstPinHintVisible}
            onDismissFirstPinHint={() => {
              markFirstPinCelebrated()
              setFirstPinHintVisible(false)
            }}
          />
        ) : null}

        {shouldRenderMissingMapRecovery ? (
          <AppRecoveryScreen
            title="지도를 다시 찾지 못했어요"
            message="탭 이동 중 이전 지도 상태가 남아 있었어요. 지도 목록으로 돌아가면 바로 다시 사용할 수 있어요."
            actionLabel="지도 목록으로 돌아가기"
            onRetry={recoverToHome}
          />
        ) : null}

        {/* 내 대시보드 — 맵핑·기록 데이터 한눈에 (구 프로필 탭, 탭 id 는 profile 유지) */}
        {!showPersonalLoading && !showPersonalGate && activeTab === "profile" ? (
          <WebPageFrame
            className="web-section--dashboard"
            eyebrow="DASHBOARD"
            title="내 대시보드"
            description="내가 다닌 곳과 쌓은 기록을 한눈에 봐요."
          >
            <DashboardScreen
              user={viewerProfile}
              maps={b2cMaps}
              features={b2cFeatures}
              onOpenFeature={(featureId) => {
                const feature = b2cFeatures.find((item) => (item.id || item.feature_id) === featureId)
                if (feature) setPlaceCardFeature(feature)
              }}
              onOpenPlaces={(query) => {
                setPlacesInitialQuery(query || "")
                handleBottomNavChange("places")
              }}
              onOpenMap={openMapEditor}
            />
          </WebPageFrame>
        ) : null}

        {/* 내 정보 관리 — 우상단 계정 버튼 전용 (하단 내비에는 없음) */}
        {!showPersonalLoading && !showPersonalGate && activeTab === "account" ? (
          <WebPageFrame
            className="web-section--account"
            eyebrow="ACCOUNT"
            title="내 정보 관리"
            description="로그인 정보와 개인정보, 앱 설정을 한곳에서 관리해요."
          >
            <AccountScreen
              user={viewerProfile}
              authUser={authUser}
              cloudMode={cloudMode}
              maps={b2cMaps}
              features={b2cFeatures}
              shares={b2cShares}
              canImportLocalData={cloudMode && readLocalImportData().hasAny}
              onImportLocalData={importLocalDataToCloud}
              onUpdateProfile={handleUpdateProfile}
              onSignOut={cloudMode ? handleSignOut : null}
              onDeleteAccount={cloudMode ? handleDeleteAccount : null}
              onViewPublicProfile={() => {
                setSelectedUserProfile(viewerProfile)
                setSelectedUserId(viewerProfile.id)
              }}
              onResetCoachmark={() => {
                resetCoachmark()
                showToast("다음 편집기 진입 시 가이드가 다시 표시돼요")
              }}
              showToast={showToast}
            />
          </WebPageFrame>
        ) : null}
      </Suspense>
      </AppErrorBoundary>
      )}
      </main>

      {/* 산책 모드 게임 오버레이 — 상단 탭바(BottomNavV2)는 위에 유지된다 */}
      {showWalk ? (
        <Suspense fallback={null}>
          <WalkModeScreen onExit={exitWalk} onCollect={handleWalkCollect} />
        </Suspense>
      ) : null}

      {/* 모바일 좌상단 loca. 로고 (데스크톱은 상단 네비에 로고가 있어 숨김). 클릭 → 타이틀 화면 */}
      {!shouldHideBottomNav && !isMapEditorLayout && !showWalk ? (
        <button
          type="button"
          className="loca-mobile-brand"
          onClick={() => setShowTitle(true)}
          aria-label="LOCA 시작 화면"
        >
          <PixelWordmark height={18} shadow="#E3DCC9" />
        </button>
      ) : null}

      {/* 로그인 후 우상단 내 계정 버튼 (지도 편집·산책 모드 중에는 숨김) */}
      {authUser && !isMapEditorLayout && !showWalk ? (
        <AccountMenu
          email={authUser.email}
          onOpenAccount={() => handleBottomNavChange("account")}
          onSignOut={cloudMode ? handleSignOut : null}
        />
      ) : null}

      {/* 공유 지도 viewer / feature 편집 시트 / 키보드 표시 중에는 BottomNav 숨김 */}
      {shouldHideBottomNav ? null : (
      <BottomNavV2
        tab={bottomNavTab}
        onTabChange={handleBottomNavChange}
        authed={Boolean(authUser)}
        onBrandClick={() => setShowTitle(true)}
      />
      )}

      {/* 타이틀 화면 오버레이 — 첫 방문 자동 + loca. 로고 클릭 재진입 */}
      {showTitle ? (
        <TitleScreen
          onEnter={handleTitleEnter}
          onExploreGame={handleTitleGame}
          onLogin={authUser ? null : handleTitleLogin}
        />
      ) : null}

      {/* 도우미 로카냥 + 피드백 치즈냥 — 좌하단 상주 (편집/뷰어/로그인 화면에선 숨김).
          치즈냥은 Supabase 환경(이야기 보낼 곳)이 있을 때만 등장. onOpenFeedback/runSignal 은 피드백 시트 단계에서 연결. */}
      {!shouldHideBottomNav && !isMapEditorLayout && bottomNavTab !== "login" && !showWalk ? (
        <HelperCat
          onOpenTutorial={(step) => setTutorial({ step, auto: null })}
          showFeedbackCat={hasSupabaseEnv}
          onOpenFeedback={() => setFeedbackOpen(true)}
          runSignal={feedbackRunSignal}
        />
      ) : null}

      {/* 치즈냥의 귓속말 — 피드백 시트 (열릴 때만 마운트 → 매번 새 입력) */}
      {feedbackOpen ? (
        <FeedbackSheet
          open
          onClose={() => setFeedbackOpen(false)}
          onSubmit={handleFeedbackSubmit}
        />
      ) : null}

      {/* 로카냥 튜토리얼 오버레이 */}
      {tutorial ? (
        <TutorialDialog
          startStep={tutorial.step}
          onClose={() => {
            if (tutorial.auto) markTutorialSeen(tutorial.auto)
            setTutorial(null)
          }}
        />
      ) : null}

      {/* 가입 직후 연령대·지역 온보딩 */}
      <ProfileOnboardingSheet
        open={profileOnboardOpen}
        saving={profileOnboardSaving}
        onSkip={closeProfileOnboard}
        onSave={handleProfileOnboardSave}
      />

      {placeCardFeature ? (
        <PlaceFlipCard
          feature={placeCardFeature}
          dexNo={placeCardDexNo}
          mapTitle={b2cMaps.find((mapItem) => mapItem.id === (placeCardFeature.mapId || placeCardFeature.map_id))?.title || ""}
          onClose={() => setPlaceCardFeature(null)}
          showToast={showToast}
          onAddRecord={async (text, photoFile) => {
            const featureId = placeCardFeature.id || placeCardFeature.feature_id
            let photoUrl = null
            if (photoFile) {
              // 원본을 그대로 저장하면 localStorage/업로드 한도를 넘겨 저장이 통째로 실패한다 → 반드시 압축
              const blob = await compressImageFile(photoFile)
              if (cloudMode) {
                const meta = await uploadMediaToCloud(createId("photo"), blob, "photos").catch(() => null)
                if (meta?.publicUrl) photoUrl = meta.publicUrl
              }
              if (!photoUrl) photoUrl = await blobToDataUrl(blob)
            }
            if (cloudMode) {
              await addFeatureMemo(featureId, text, "", photoUrl ? [photoUrl] : [])
            }
            const newMemo = { id: createId("memo"), text, createdAt: new Date().toISOString(), photos: photoUrl ? [photoUrl] : [] }
            const attach = (feature) => ({ ...feature, memos: [...(feature.memos || []), newMemo] })
            setFeatures((current) => current.map((feature) => (feature.id === featureId ? attach(feature) : feature)))
            setPlaceCardFeature((current) => (current ? attach(current) : current))
          }}
          onSetPhoto={async (file) => {
            const featureId = placeCardFeature.id || placeCardFeature.feature_id
            // 원본을 그대로 저장하면 localStorage/업로드 한도를 넘겨 저장이 통째로 실패한다 → 반드시 압축
            const blob = await compressImageFile(file)
            let url = null
            if (cloudMode) {
              const meta = await uploadMediaToCloud(createId("photo"), blob, "photos").catch(() => null)
              if (meta?.publicUrl) {
                url = meta.publicUrl
                await updateFeature(featureId, { emojiKind: "photo", emojiPhotoUrl: url }).catch(() => {})
              }
            }
            if (!url) {
              // 로컬 모드 또는 업로드 실패 — 압축된 data URL 로 즉시 반영(로컬 저장에 유지)
              url = await blobToDataUrl(blob)
            }
            const patch = (feature) => ({ ...feature, emojiKind: "photo", emojiPhotoUrl: url })
            setFeatures((current) => current.map((feature) => (feature.id === featureId ? patch(feature) : feature)))
            setPlaceCardFeature((current) => (current ? patch(current) : current))
          }}
          onSetCoverUrl={async (url) => {
            // 기록 사진(이미 저장된 URL)을 표지로 승격 — 재업로드 없이 표지 필드만 바꾼다
            if (!url) return
            const featureId = placeCardFeature.id || placeCardFeature.feature_id
            if (cloudMode) {
              await updateFeature(featureId, { emojiKind: "photo", emojiPhotoUrl: url }).catch(() => {})
            }
            const patch = (feature) => ({ ...feature, emojiKind: "photo", emojiPhotoUrl: url })
            setFeatures((current) => current.map((feature) => (feature.id === featureId ? patch(feature) : feature)))
            setPlaceCardFeature((current) => (current ? patch(current) : current))
          }}
          onUpdateCard={async ({ title, note, tags }) => {
            // 카드 이름·설명·태그 편집 — 본인 장소 단독 편집이라 낙관적 잠금(lastKnownUpdatedAt) 생략
            const featureId = placeCardFeature.id || placeCardFeature.feature_id
            if (cloudMode) {
              await updateFeature(featureId, { title, note, tags })
            }
            const patch = (feature) => ({ ...feature, title, note, tags, updatedAt: new Date().toISOString() })
            setFeatures((current) => current.map((feature) => (feature.id === featureId ? patch(feature) : feature)))
            setPlaceCardFeature((current) => (current ? patch(current) : current))
          }}
          onOpenOnMap={(placeCardFeature.mapId || placeCardFeature.map_id) ? () => {
            const featureId = placeCardFeature.id || placeCardFeature.feature_id
            setPlaceCardFeature(null)
            openFeatureFromPlaces(featureId)
          } : null}
        />
      ) : null}

      {newFindCard ? (
        <NewFindBurst
          feature={newFindCard}
          dexNo={newFindDexNo}
          onDone={() => {
            const card = newFindCard
            setNewFindCard(null)
            setPlaceCardFeature(card)
          }}
        />
      ) : null}

      <CollectSheet
        open={collectSheetOpen}
        prefill={collectPrefill}
        onClose={() => { setCollectSheetOpen(false); setCollectPrefill(null) }}
        cloudMode={cloudMode}
        currentUserId={authUser?.id || viewerProfile.id}
        myLocation={myLocation}
        showToast={showToast}
        onRegionTagged={(featureId, { regionName, updatedAt } = {}) => {
          if (!updatedAt) return
          setFeatures((current) => current.map((feature) => (
            feature.id === featureId
              ? { ...feature, updatedAt, regionName: regionName || feature.regionName }
              : feature
          )))
        }}
        onCollected={(collected, { isNewFind } = {}) => {
          setFeatures((current) => [collected, ...current])
          setCollectSheetOpen(false)
          setCollectPrefill(null)
          if (isNewFind) {
            // 새로운 곳 발견 — 특별 연출 후 카드 오픈
            setNewFindCard(collected)
          } else {
            setPlaceCardFeature(collected)
            showToast("등록했어요")
          }
        }}
      />

      <MapBuilderSheet
        key={mapBuilderOpen ? `builder-open-${builderAddMapId || "new"}` : "builder-closed"}
        open={mapBuilderOpen}
        features={builderCandidates}
        busy={mapBuilderBusy}
        addMode={Boolean(builderAddMapId)}
        onClose={() => { setMapBuilderOpen(false); setBuilderAddMapId(null) }}
        onCreate={handleBuilderCreate}
        onAddToMap={handleBuilderAddToMap}
        onStartBlank={() => {
          setMapBuilderOpen(false)
          setBuilderAddMapId(null)
          openCreateMapSheet()
        }}
      />

      {/* Sheets */}
      <AddRecordSheet
        key={recordSheetOpen ? `${recordSheetInitialView}-${recordTargetMapId || "none"}` : "closed"}
        open={recordSheetOpen}
        maps={personalRecordMaps}
        initialView={recordSheetInitialView}
        selectedMapId={recordTargetMapId}
        onClose={() => setRecordSheetOpen(false)}
        onCreateMap={openRecordMapCreateFlow}
        onStartRecord={startRecordInMap}
      />
      <MapFormSheet
        mapSheet={mapSheet} setMapSheet={setMapSheet}
        onSave={saveMapSheet} onDelete={deleteMapAction}
        onClose={handleMapFormClose}
      />
      <CollaboratorsSheet
        open={Boolean(collaboratorsSheet)}
        mapId={collaboratorsSheet?.mapId}
        mapRole={maps.find((item) => item.id === collaboratorsSheet?.mapId)?.userRole || "owner"}
        onClose={() => setCollaboratorsSheet(null)}
        onChanged={handleCollaboratorsChanged}
        showToast={showToast}
      />
      {(() => {
        // 시안 v5 신규 편집 시트 (FeatureEditSheet)는 '작성자 편집 전용'.
        // 비작성자의 커뮤니티 수정 요청은 기존 FeatureDetailSheet가 담당.
        if (!featureSheet) return null
        const isCommunityFeature = activeMapSource === "community"
        const canDirectlyEdit = !mapEditorReadOnly && (
          activeMapSource === "local"
          || (isCommunityFeature && (featureSheet.createdBy || null) === viewerProfile.id)
        )
        const shouldShowEditor = canDirectlyEdit && (featureSheetMode === "edit" || isDraftFeatureSheet || featureSheet?._focusName)
        if (shouldShowEditor) {
          return (
            <FeatureEditSheet
              featureSheet={featureSheet}
              setFeatureSheet={setFeatureSheet}
              mapMode={isCommunityFeature ? "community" : "personal"}
              mapTitle={activeMap?.title || ""}
              readOnly={mapEditorReadOnly}
              onClose={() => { setFeatureSheet(null); setSelectedFeatureId(null); setFeatureSheetMode("detail") }}
              onSave={saveFeatureSheet}
              onDelete={deleteFeature}
              onRelocatePin={activeMapSource === "local" && !mapEditorReadOnly ? startRelocatePin : undefined}
              photoInputRef={photoInputRef}
              onPhotoSelected={handlePhotoSelected}
              onDeletePhoto={handleDeletePhoto}
              onAddMemo={addMemo}
            />
          )
        }
        return (
          <FeatureDetailSheet
            featureSheet={featureSheet} setFeatureSheet={setFeatureSheet}
            activeMapSource={activeMapSource} featureEmojiChoices={featureEmojiChoices}
            readOnly={mapEditorReadOnly}
            currentUserId={viewerProfile.id}
            onClose={() => { setFeatureSheet(null); setSelectedFeatureId(null); setFeatureSheetMode("detail") }}
            onEdit={canDirectlyEdit ? () => setFeatureSheetMode("edit") : undefined}
            onSave={saveFeatureSheet} onDelete={deleteFeature}
            onRelocatePin={activeMapSource === "local" && !mapEditorReadOnly ? startRelocatePin : undefined}
            photoInputRef={photoInputRef}
            onPhotoSelected={handlePhotoSelected} onDeletePhoto={handleDeletePhoto}
            memoText={memoText} onMemoTextChange={setMemoText} onAddMemo={addMemo} onUpdateMemo={updateMemo}
            onRequestCommunityUpdate={requestCommunityFeatureUpdate}
          />
        )
      })()}
      <ImportTargetMapSheet
        open={Boolean(importTargetSheet)}
        maps={b2cMaps}
        features={b2cFeatures}
        busy={importTargetBusy}
        onPick={handleImportPickMap}
        onCreate={handleImportCreateMap}
        onClose={() => { if (!importTargetBusy) setImportTargetSheet(null) }}
      />
      {coachmarkStep === 3 ? (
        <CoachMark
          step={3}
          totalSteps={3}
          title="이름과 메모를 적으면 기록이 완성돼요"
          description="간단한 메모만 남겨도 괜찮아요. 사진도 나중에 추가할 수 있어요."
          nextLabel="이해했어요"
          onNext={() => {
            markCoachmarkSeen()
            setCoachmarkStep(0)
          }}
          onSkip={() => {
            markCoachmarkSeen()
            setCoachmarkStep(0)
          }}
        />
      ) : null}
      <PublishSheet
        publishSheet={publishSheet} setPublishSheet={setPublishSheet}
        candidates={profileUploadCandidates} features={b2cFeatures}
        onPublish={handlePublishSubmit}
        onAddToProfile={(mapId) => {
          // 이미 링크 공유 중인 지도: 공통 confirm 으로 바로 전환.
          setPublishSheet(null)
          requestProfilePlacement("add", mapId)
        }}
        onOfferAddToProfile={(mapId) => {
          // 링크 공유 성공 후 공통 confirm 시트로 전환.
          setPublishSheet(null)
          requestProfilePlacement("add", mapId)
        }}
        publishing={publishSubmitting}
        onClose={() => setPublishSheet(null)}
      />
      <UserProfileSheet
        user={selectedUser} userPosts={selectedUserPosts}
        isFollowing={selectedUser ? followed.includes(selectedUser.id) : false}
        onClose={() => {
          setSelectedUserId(null)
          setSelectedUserProfile(null)
        }}
        onToggleFollow={toggleFollow} onSelectPost={setSelectedPostRef}
      />
      <PostDetailSheet
        post={selectedPost}
        onClose={() => setSelectedPostRef(null)}
        onOpenMap={(mapId) => { setSelectedPostRef(null); openMapEditor(mapId) }}
        onRemoveFromProfile={(mapId) => {
          setSelectedPostRef(null)
          requestProfilePlacement("remove", mapId)
        }}
        onSaveMap={handleSavePostMap}
        saving={savingPostMapId === selectedPost?.mapId}
        isFollowing={selectedPost?.user ? followed.includes(selectedPost.user.id) : false}
        onToggleFollow={toggleFollow}
        mapFeatures={selectedPost ? features.filter((f) => f.mapId === selectedPost.mapId) : []}
      />
      {shareEditorImage ? (
        <Suspense fallback={null}>
          <MapShareEditor
            mapImage={shareEditorImage} mapTitle={activeMap?.title || "LOCA"}
            mapTheme={activeMap?.theme} mapFeatures={activeFeatures}
            shareUrl={shareUrl} onClose={() => setShareEditorImage(null)} showToast={showToast}
          />
        </Suspense>
      ) : null}
      <SharePlaceSheet
        pendingSharePlace={pendingSharePlace} maps={maps} features={features}
        onSaveToMap={saveSharePlaceToMap} onClose={() => setPendingSharePlace(null)}
      />
      <ProfilePlacementConfirmSheet
        open={Boolean(profilePlacementSheet)}
        mode={profilePlacementSheet?.mode}
        mapTitle={maps.find((item) => item.id === profilePlacementSheet?.mapId)?.title || ""}
        submitting={profilePlacementSubmitting}
        onConfirm={handleProfilePlacementConfirm}
        onCancel={handleProfilePlacementCancel}
      />
      <Toast message={toast.message} />
    </div>
  )
}

