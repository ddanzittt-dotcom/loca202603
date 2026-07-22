import { useEffect, useRef, useState } from "react"
import { X, ImagePlus, Loader2, MapPin } from "lucide-react"
import { StaticMapPreview } from "../explore/StaticMapPreview"
import {
  CONTRIBUTE_TABS,
  WALK_CATEGORIES,
  NATURE_CATEGORIES,
  submitContribution,
  uploadContributionPhoto,
  geocodePlace,
  ensureKakaoServices,
} from "../../lib/contribute"

// 이웃 제보 시트 — 탐색탭(즐기기·배우기·걷기·머물기)에 들어갈 항목을 사용자가 직접 제보한다.
// 지도에 콕 찍는 대신 "주소(또는 장소명)"를 직접 입력받아 카카오 services 로 좌표를 얻는다
// (맵핑이 어렵다는 피드백 반영 — 폼이 먼저 뜨고 주소를 타이핑). 관리자 승인 시 explore_catalog 미러 발행.

export function ContributeSheet({
  open,
  onClose,
  isLoggedIn,
  initialTab = null, // 진입한 탭(있으면 그 탭 선택된 채 시작)
  showToast,
  onSubmitted,
  onRequireLogin,
}) {
  const [tab, setTab] = useState(initialTab || "walk")
  // 위치 — 주소 텍스트 입력 + 지오코딩 결과
  const [address, setAddress] = useState("")
  const [resolved, setResolved] = useState(null) // { query, lat, lng, addr } | null (lat null = 못 찾음)
  const [geocoding, setGeocoding] = useState(false)
  // 공통 필드
  const [name, setName] = useState("")
  const [summary, setSummary] = useState("")
  const [phone, setPhone] = useState("")
  const [sourceUrl, setSourceUrl] = useState("")
  const [photoUrl, setPhotoUrl] = useState("")
  const [photoBusy, setPhotoBusy] = useState(false)
  // 탭별 필드
  const [category, setCategory] = useState(WALK_CATEGORIES[0]) // walk 종류
  const [natureCategory, setNatureCategory] = useState(NATURE_CATEGORIES[0].label) // nature 분류
  const [startDate, setStartDate] = useState("") // enjoy 시작일 / nature 발견 날짜
  const [endDate, setEndDate] = useState("") // enjoy 종료일
  const [applyStart, setApplyStart] = useState("") // learn 접수 시작
  const [applyEnd, setApplyEnd] = useState("") // learn 접수 마감
  const [org, setOrg] = useState("") // learn 기관/공방명
  const [schedule, setSchedule] = useState("") // learn 일정(요일·시간)
  const [fee, setFee] = useState("") // learn 수강료
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)
  const latestQRef = useRef("")

  // 열림 시 초기 탭 반영 / 닫힘 시 전체 초기화
  useEffect(() => {
    if (open) {
      setTab(initialTab || "walk")
      ensureKakaoServices() // 지오코딩용 카카오 SDK 미리 데우기 (지도 없이 주소만 입력받으므로)
      return
    }
    setAddress("")
    setResolved(null)
    setGeocoding(false)
    setName("")
    setSummary("")
    setPhone("")
    setSourceUrl("")
    setPhotoUrl("")
    setPhotoBusy(false)
    setCategory(WALK_CATEGORIES[0])
    setNatureCategory(NATURE_CATEGORIES[0].label)
    setStartDate("")
    setEndDate("")
    setApplyStart("")
    setApplyEnd("")
    setOrg("")
    setSchedule("")
    setFee("")
    setSaving(false)
  }, [open, initialTab])

  // 주소 입력 → 디바운스 지오코딩(장소명·주소 모두 지원). 지도 없이 좌표 확보.
  useEffect(() => {
    if (!open) return undefined
    const q = address.trim()
    latestQRef.current = q
    if (q.length < 2) {
      setResolved(null)
      setGeocoding(false)
      return undefined
    }
    setGeocoding(true)
    const timer = setTimeout(async () => {
      const loc = await geocodePlace(q)
      if (latestQRef.current !== q) return // 그 사이 입력이 바뀌면 폐기
      setResolved(loc ? { ...loc, query: q } : { query: q, lat: null, lng: null, addr: "" })
      setGeocoding(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [address, open])

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
    const addrText = address.trim()
    if (!trimmedName) { showToast?.("이름을 적어주세요."); return }
    if (!addrText) { showToast?.("주소를 입력해주세요."); return }
    if (tab === "enjoy" && !startDate) { showToast?.("행사 시작일을 입력해주세요."); return }

    setSaving(true)
    try {
      // 좌표 확보 — 입력창 지오코딩 결과 우선, 없으면 지금 다시 지오코딩
      const loc = (resolved && resolved.query === addrText && resolved.lat != null)
        ? resolved
        : await geocodePlace(addrText)
      if (!loc || loc.lat == null) {
        showToast?.("주소를 찾지 못했어요. 도로명·지번 주소나 장소명을 확인해 주세요.")
        setSaving(false)
        return
      }

      const detail = {}
      if (tab === "learn") {
        if (org.trim()) detail.institution = org.trim()
        if (schedule.trim()) detail.day = schedule.trim()
        if (fee.trim()) detail.fee = fee.trim()
      }
      const categoryByTab = tab === "walk" ? category
        : tab === "learn" ? "강좌"
          : tab === "nature" ? natureCategory
            : "행사"
      const res = await submitContribution({
        tab,
        title: trimmedName,
        addr: loc.addr || addrText,
        lat: loc.lat,
        lng: loc.lng,
        category: categoryByTab,
        summary: summary.trim() || null,
        phone: phone.trim() || null,
        sourceUrl: sourceUrl.trim() || null,
        image: photoUrl || null,
        // nature 는 발견 날짜를 start_date 에 싣는다(관측일 observedOn) — 목록 쿼리에 있어 detail 불필요
        startDate: (tab === "enjoy" || tab === "nature") ? startDate : null,
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
          <strong>{activeTab.label} 제보</strong>
          <button type="button" className="clt-close" onClick={onClose} aria-label="닫기"><X size={15} strokeWidth={2.4} /></button>
        </header>

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

        <label className="clt-field">
          <span className="clt-field__label">이름</span>
          <input
            className="clt-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={tab === "nature" ? "무엇을 봤나요? (예: 청둥오리)" : `${activeTab.label} 이름`}
            maxLength={60}
          />
        </label>

        {/* 위치 — 주소 직접 입력 → 지오코딩 → 지도에 마커 표시(확인용, 콕찍기 아님) */}
        <label className="clt-field">
          <span className="clt-field__label">주소</span>
          <input
            className="clt-desc"
            type="text"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="예: 충남 천안시 서북구 성정로 75"
            maxLength={200}
          />
        </label>
        {geocoding ? (
          <p className="contrib-geohint">위치 확인 중…</p>
        ) : resolved && resolved.lat != null ? (
          <>
            <p className="contrib-geohint contrib-geohint--ok">
              <MapPin size={12} strokeWidth={2.4} aria-hidden="true" /> {resolved.addr}
            </p>
            <div className="contrib-map" key={`${resolved.lat},${resolved.lng}`}>
              <StaticMapPreview lat={resolved.lat} lng={resolved.lng} title={name || activeTab.label} level={4} />
            </div>
          </>
        ) : resolved && resolved.lat == null ? (
          <p className="contrib-geohint contrib-geohint--miss">위치를 못 찾았어요. 도로명·지번 주소를 확인해 주세요.</p>
        ) : null}

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
          <div className="clt-field">
            <span className="clt-field__label">종류</span>
            <div className="contrib-chips" role="radiogroup" aria-label="종류">
              {WALK_CATEGORIES.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="radio"
                  aria-checked={category === item}
                  className={`contrib-chip${category === item ? " is-active" : ""}`}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "nature" ? (
          <>
            <div className="clt-field">
              <span className="clt-field__label">분류</span>
              <div className="contrib-chips" role="radiogroup" aria-label="분류">
                {NATURE_CATEGORIES.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    role="radio"
                    aria-checked={natureCategory === item.label}
                    className={`contrib-chip${natureCategory === item.label ? " is-active" : ""}`}
                    onClick={() => setNatureCategory(item.label)}
                  >
                    {item.emoji} {item.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="clt-field">
              <span className="clt-field__label">발견 날짜 (선택)</span>
              <input className="clt-desc" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
          </>
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

        <button type="button" className="clt-primary" disabled={saving || !name.trim()} onClick={handleSubmit}>
          {saving ? "보내는 중…" : "제보하기"}
        </button>
      </section>
    </div>
  )
}
