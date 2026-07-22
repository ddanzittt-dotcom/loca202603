import { useEffect, useRef, useState } from "react"
import { Search as SearchIcon, X, ImagePlus, Loader2, ChevronLeft } from "lucide-react"
import { KoreaMap } from "../koreaMap"
import { fetchPlaceMatch } from "../../lib/placeMatch"
import { reverseGeocodeAddress } from "../../lib/reverseGeocode"
import {
  CONTRIBUTE_TABS,
  WALK_CATEGORIES,
  submitContribution,
  uploadContributionPhoto,
} from "../../lib/contribute"

// 이웃 제보 시트 — 탐색탭(즐기기·배우기·걷기·머물기)에 들어갈 항목을 사용자가 직접 제보한다.
// 흐름: (start) 탭 고르기 + 위치 검색/지도찍기 → (detail) 탭별 정보 입력 → 제출(pending).
// 관리자 승인 시 explore_catalog 로 미러 발행. 위치·주소는 CollectSheet 와 같은 매커니즘 재사용.

const SEOUL_CENTER = { lat: 37.5665, lng: 126.978, zoom: 13 }

export function ContributeSheet({
  open,
  onClose,
  isLoggedIn,
  myLocation,
  initialTab = null, // 진입한 탭(있으면 그 탭 선택된 채 시작)
  showToast,
  onSubmitted,
  onRequireLogin,
}) {
  const [tab, setTab] = useState(initialTab || "walk")
  const [step, setStep] = useState("start") // start(탭+위치) → detail
  const [point, setPoint] = useState(null)
  const [pickedAddress, setPickedAddress] = useState("")
  const [query, setQuery] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  // 공통 필드
  const [name, setName] = useState("")
  const [summary, setSummary] = useState("")
  const [phone, setPhone] = useState("")
  const [sourceUrl, setSourceUrl] = useState("")
  const [photoUrl, setPhotoUrl] = useState("")
  const [photoBusy, setPhotoBusy] = useState(false)
  // 탭별 필드
  const [category, setCategory] = useState(WALK_CATEGORIES[0]) // walk 종류
  const [startDate, setStartDate] = useState("") // enjoy 시작일
  const [endDate, setEndDate] = useState("") // enjoy 종료일
  const [applyStart, setApplyStart] = useState("") // learn 접수 시작
  const [applyEnd, setApplyEnd] = useState("") // learn 접수 마감
  const [org, setOrg] = useState("") // learn 기관/공방명
  const [schedule, setSchedule] = useState("") // learn 일정(요일·시간)
  const [fee, setFee] = useState("") // learn 수강료
  const [saving, setSaving] = useState(false)
  const searchTimerRef = useRef(null)
  const fileRef = useRef(null)

  // 열림 시 초기 탭 반영 / 닫힘 시 전체 초기화
  useEffect(() => {
    if (open) {
      setTab(initialTab || "walk")
      return
    }
    setStep("start")
    setPoint(null)
    setPickedAddress("")
    setQuery("")
    setSearchResults([])
    setName("")
    setSummary("")
    setPhone("")
    setSourceUrl("")
    setPhotoUrl("")
    setPhotoBusy(false)
    setCategory(WALK_CATEGORIES[0])
    setStartDate("")
    setEndDate("")
    setApplyStart("")
    setApplyEnd("")
    setOrg("")
    setSchedule("")
    setFee("")
    setSaving(false)
  }, [open, initialTab])

  // 키워드 검색 (선택 위치/내 위치 기준)
  useEffect(() => {
    if (!open || step !== "start") return undefined
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    const keyword = query.trim()
    if (keyword.length < 2) {
      setSearchResults([])
      return undefined
    }
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const bias = point || myLocation || SEOUL_CENTER
        setSearchResults(await fetchPlaceMatch({ lat: bias.lat, lng: bias.lng, q: keyword }))
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 350)
    return () => clearTimeout(searchTimerRef.current)
  }, [query, open, step, point, myLocation])

  if (!open) return null

  const activeTab = CONTRIBUTE_TABS.find((item) => item.key === tab) || CONTRIBUTE_TABS[0]

  // 비로그인 — 제보 대신 로그인 유도
  if (!isLoggedIn) {
    return (
      <div className="clt-backdrop" onClick={onClose} role="presentation">
        <section className="clt-sheet contrib-sheet" role="dialog" aria-modal="true" aria-label="이웃 제보" onClick={(event) => event.stopPropagation()}>
          <header className="clt-head">
            <strong>이웃 제보</strong>
            <button type="button" className="clt-close" onClick={onClose} aria-label="닫기"><X size={15} strokeWidth={2.4} /></button>
          </header>
          <p className="clt-note">우리 동네 소식을 이웃에게 알려주세요. 제보하려면 <b>로그인</b>이 필요해요.</p>
          <button type="button" className="clt-primary" onClick={() => { onRequireLogin?.(); onClose?.() }}>로그인하기</button>
        </section>
      </div>
    )
  }

  const focusPoint = point
    ? { lat: point.lat, lng: point.lng, zoom: 16 }
    : myLocation
      ? { lat: myLocation.lat, lng: myLocation.lng, zoom: 14 }
      : SEOUL_CENTER

  const handleMapPick = (tapped) => {
    if (!tapped || !Number.isFinite(tapped.lat)) return
    setPoint({ lat: tapped.lat, lng: tapped.lng })
    setPickedAddress("")
    reverseGeocodeAddress(tapped.lat, tapped.lng).then((address) => {
      setPoint((current) => {
        if (current && current.lat === tapped.lat && current.lng === tapped.lng) setPickedAddress(address)
        return current
      })
    })
  }

  const pickSearchResult = (candidate) => {
    setPoint({ lat: candidate.lat, lng: candidate.lng })
    setPickedAddress(candidate.address || "")
    if (!name.trim()) setName(candidate.name || "")
    setQuery("")
    setSearchResults([])
    setStep("detail")
  }

  const handlePhoto = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setPhotoBusy(true)
    try {
      setPhotoUrl(await uploadContributionPhoto(file))
    } catch (error) {
      showToast?.(error?.message || "사진을 올리지 못했어요.")
    } finally {
      setPhotoBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const handleSubmit = async () => {
    const trimmedName = name.trim()
    if (!point) { showToast?.("위치를 골라주세요."); return }
    if (!trimmedName) { showToast?.("이름을 적어주세요."); return }
    const addr = pickedAddress.trim()
    if (!addr) { showToast?.("위치의 주소를 확인하지 못했어요. 검색으로 선택해 주세요."); return }
    if (tab === "enjoy" && !startDate) { showToast?.("행사 시작일을 입력해주세요."); return }

    setSaving(true)
    try {
      const detail = {}
      if (tab === "learn") {
        if (org.trim()) detail.institution = org.trim()
        if (schedule.trim()) detail.day = schedule.trim()
        if (fee.trim()) detail.fee = fee.trim()
      }
      const categoryByTab = tab === "walk" ? category : tab === "learn" ? "강좌" : "행사"
      const res = await submitContribution({
        tab,
        title: trimmedName,
        addr,
        lat: point.lat,
        lng: point.lng,
        category: categoryByTab,
        summary: summary.trim() || null,
        phone: phone.trim() || null,
        sourceUrl: sourceUrl.trim() || null,
        image: photoUrl || null,
        startDate: tab === "enjoy" ? startDate : null,
        endDate: tab === "enjoy" ? endDate : null,
        applyStart: tab === "learn" ? applyStart : null,
        applyEnd: tab === "learn" ? applyEnd : null,
        detail,
      })
      showToast?.("제보 고마워요! 관리자 확인 후 탐색에 올라가요.")
      onSubmitted?.(res)
      onClose?.()
    } catch (error) {
      showToast?.(error?.message || "지금은 제보를 전송하지 못했어요.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="clt-backdrop" onClick={onClose} role="presentation">
      <section
        className="clt-sheet contrib-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="이웃 제보"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="clt-head">
          <strong>{step === "start" ? "무엇을 알릴까요?" : `${activeTab.label} 제보`}</strong>
          <button type="button" className="clt-close" onClick={onClose} aria-label="닫기"><X size={15} strokeWidth={2.4} /></button>
        </header>

        {step === "start" ? (
          <>
            {/* 탭 고르기 */}
            <div className="contrib-tabs" role="tablist" aria-label="제보 종류">
              {CONTRIBUTE_TABS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.key}
                  className={`contrib-tab${tab === item.key ? " is-active" : ""}`}
                  onClick={() => setTab(item.key)}
                >
                  <span className="contrib-tab__emoji" aria-hidden="true">{item.emoji}</span>
                  <span className="contrib-tab__label">{item.label}</span>
                </button>
              ))}
            </div>
            <p className="contrib-tabhint"><b>{activeTab.hint}</b> · 예: {activeTab.examples}</p>

            {/* 위치 검색 + 지도 찍기 */}
            <label className="clt-search">
              <SearchIcon size={14} strokeWidth={2.2} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="상호·지명 검색 (예: 성수 카페)"
              />
            </label>

            {searchResults.length > 0 ? (
              <ul className="clt-results">
                {searchResults.map((candidate) => (
                  <li key={`${candidate.name}-${candidate.lat}-${candidate.lng}`}>
                    <button type="button" onClick={() => pickSearchResult(candidate)}>
                      <strong>{candidate.name}</strong>
                      <span>{candidate.categoryName} · {candidate.address}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {searching ? <p className="clt-hint">찾는 중…</p> : null}

            <div className="clt-map">
              <KoreaMap
                features={[]}
                selectedFeatureId={null}
                draftPoints={point ? [[point.lng, point.lat]] : []}
                draftMode="pin"
                focusPoint={focusPoint}
                fitTrigger={0}
                onMapTap={handleMapPick}
                onFeatureTap={() => {}}
                showLabels={false}
              />
            </div>
            {point ? (
              <p className="clt-hint clt-hint--picked">📍 {pickedAddress || "찍은 위치"}</p>
            ) : (
              <p className="clt-hint">지도를 눌러 위치를 고르거나, 위에서 검색해 보세요.</p>
            )}

            <button type="button" className="clt-primary" disabled={!point} onClick={() => setStep("detail")}>
              다음
            </button>
          </>
        ) : (
          <>
            <label className="clt-field">
              <span className="clt-field__label">이름</span>
              <input
                className="clt-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={activeTab.label + " 이름"}
                maxLength={60}
              />
            </label>

            {/* 탭별 필드 */}
            {tab === "enjoy" ? (
              <div className="contrib-grid">
                <label className="clt-field">
                  <span className="clt-field__label">시작일 *</span>
                  <input className="clt-desc" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                </label>
                <label className="clt-field">
                  <span className="clt-field__label">종료일</span>
                  <input className="clt-desc" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                </label>
              </div>
            ) : null}

            {tab === "learn" ? (
              <>
                <label className="clt-field">
                  <span className="clt-field__label">기관·공방명</span>
                  <input className="clt-desc" type="text" value={org} onChange={(event) => setOrg(event.target.value)} placeholder="예: 자온길 도자기 공방" maxLength={40} />
                </label>
                <div className="contrib-grid">
                  <label className="clt-field">
                    <span className="clt-field__label">접수 시작</span>
                    <input className="clt-desc" type="date" value={applyStart} onChange={(event) => setApplyStart(event.target.value)} />
                  </label>
                  <label className="clt-field">
                    <span className="clt-field__label">접수 마감</span>
                    <input className="clt-desc" type="date" value={applyEnd} onChange={(event) => setApplyEnd(event.target.value)} />
                  </label>
                </div>
                <label className="clt-field">
                  <span className="clt-field__label">일정 (요일·시간)</span>
                  <input className="clt-desc" type="text" value={schedule} onChange={(event) => setSchedule(event.target.value)} placeholder="예: 매주 토 14:00~16:00" maxLength={40} />
                </label>
                <label className="clt-field">
                  <span className="clt-field__label">수강료</span>
                  <input className="clt-desc" type="text" value={fee} onChange={(event) => setFee(event.target.value)} placeholder="예: 3만원 (재료비 별도) / 무료" maxLength={40} />
                </label>
              </>
            ) : null}

            {tab === "walk" ? (
              <label className="clt-field">
                <span className="clt-field__label">종류</span>
                <select className="clt-desc contrib-select" value={category} onChange={(event) => setCategory(event.target.value)}>
                  {WALK_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            ) : null}

            <label className="clt-field">
              <span className="clt-field__label">한줄 소개 (선택)</span>
              <input className="clt-desc" type="text" value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="어떤 곳인지 짧게 알려주세요" maxLength={80} />
            </label>

            {/* 사진 */}
            <div className="clt-field">
              <span className="clt-field__label">사진 (선택)</span>
              <div className="contrib-photo">
                {photoUrl ? (
                  <div className="contrib-photo__preview">
                    <img src={photoUrl} alt="" />
                    <button type="button" onClick={() => setPhotoUrl("")} aria-label="사진 제거"><X size={13} strokeWidth={2.6} /></button>
                  </div>
                ) : (
                  <button type="button" className="contrib-photo__add" onClick={() => fileRef.current?.click()} disabled={photoBusy}>
                    {photoBusy
                      ? <><Loader2 size={15} className="contrib-spin" aria-hidden="true" /> 올리는 중…</>
                      : <><ImagePlus size={15} strokeWidth={2.2} aria-hidden="true" /> 사진 추가</>}
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={handlePhoto} />
              </div>
            </div>

            <div className="contrib-grid">
              <label className="clt-field">
                <span className="clt-field__label">연락처 (선택)</span>
                <input className="clt-desc" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="전화번호" maxLength={30} />
              </label>
              <label className="clt-field">
                <span className="clt-field__label">링크 (선택)</span>
                <input className="clt-desc" type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="안내 페이지 주소" maxLength={200} />
              </label>
            </div>

            <p className="contrib-notice">
              제보는 관리자 확인 후 탐색에 올라가요. 게시되면 <b>내 닉네임</b>이 제보자로 표시돼요.
              {tab === "walk" ? " 카페·가게 등 영리 업소·광고는 승인되지 않아요." : ""}
            </p>

            <div className="clt-actions">
              <button type="button" className="clt-ghost" onClick={() => setStep("start")}>
                <ChevronLeft size={14} strokeWidth={2.4} aria-hidden="true" /> 위치
              </button>
              <button type="button" className="clt-primary" disabled={saving || !name.trim()} onClick={handleSubmit}>
                {saving ? "보내는 중…" : "제보하기"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
