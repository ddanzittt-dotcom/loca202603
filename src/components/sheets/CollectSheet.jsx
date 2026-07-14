import { useEffect, useRef, useState } from "react"
import { ClipboardPaste, Search as SearchIcon, X } from "lucide-react"
import { KoreaMap } from "../koreaMap"
import { FeatureEmoji } from "../FeatureEmoji"
import { createFeature } from "../../lib/mapService"
import { reverseGeocodeAddress } from "../../lib/reverseGeocode"
import { fetchPlaceMatch } from "../../lib/placeMatch"
import { fetchCurationDetail, summarizeOverview } from "../../lib/exploreCuration"
import { createId } from "../../lib/appUtils"
import { PLACE_CATEGORIES, getDefaultPixelIdForCategory } from "../../lib/placeCategories"

// 채집 시트 — 지도 없이 장소를 먼저 등록한다 (채집-우선 구조 B단계).
// 위치를 고르면 카카오 로컬(place-match)로 주변 등록 상호를 조회해서
//   후보 있음 → SPOT (등록된 곳, 이름·카테고리 자동)
//   후보 없음 → NEW FIND (내가 처음 발견한 곳)
// 저장된 기록은 지도에 안 묶인 채 바인더(내 장소)에 쌓인다.

const SEOUL_CENTER = { lat: 37.5665, lng: 126.978, zoom: 13 }

function categoryLabel(categoryId) {
  return PLACE_CATEGORIES.find((category) => category.id === categoryId)?.label || "그 외"
}

export function CollectSheet({
  open,
  onClose,
  cloudMode,
  currentUserId,
  myLocation,
  onCollected,
  onRegionTagged, // region 태깅 완료 시 로컬 캐시 updatedAt 동기화 (가짜 저장충돌 방지)
  showToast,
  prefill = null, // 탐색 큐레이션 → {name, category, categoryName, tagLabel, address, lat, lng}
}) {
  const [step, setStep] = useState("pick") // pick → confirm
  const [point, setPoint] = useState(null)
  const [pickedAddress, setPickedAddress] = useState("") // 지도에서 콕 찍은 위치의 주소
  const [query, setQuery] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [candidates, setCandidates] = useState([])
  const [checkingNearby, setCheckingNearby] = useState(false)
  const [selectedSpot, setSelectedSpot] = useState(null) // null = NEW FIND
  const [name, setName] = useState("")
  const [desc, setDesc] = useState("") // 한줄 설명
  const [descHint, setDescHint] = useState("") // 탐색 큐레이션 설명(overview) 요약 — "설명 붙여넣기" 후보
  const [tagList, setTagList] = useState([]) // 사용자 태그
  const [tagInput, setTagInput] = useState("")
  const [saving, setSaving] = useState(false)
  const searchTimerRef = useRef(null)

  useEffect(() => {
    if (open) return
    setStep("pick")
    setPoint(null)
    setPickedAddress("")
    setQuery("")
    setSearchResults([])
    setCandidates([])
    setSelectedSpot(null)
    setName("")
    setDesc("")
    setDescHint("")
    setTagList([])
    setTagInput("")
    setSaving(false)
  }, [open])

  // 탐색 큐레이션(행사·공간) 진입 시 TourAPI 상세의 소개(overview)를 조회해 한줄 설명 후보로 준비.
  // 목록 카드/상세 시트 어느 경로로 들어와도 동작하며, 상세 시트를 거쳤으면 sessionStorage 캐시로 즉시 반환된다.
  // TourAPI 외 소스(카카오/문화포털 등)는 contentRef 가 null → 후보 없음(버튼 미노출).
  useEffect(() => {
    if (!open || !prefill?.contentRef) { setDescHint(""); return undefined }
    let cancelled = false
    fetchCurationDetail(prefill.contentRef)
      .then((detail) => { if (!cancelled) setDescHint(summarizeOverview(detail?.overview)) })
      .catch(() => { if (!cancelled) setDescHint("") })
    return () => { cancelled = true }
  }, [open, prefill])

  // 탐색 큐레이션에서 진입 — 후보가 확정된 상태로 confirm 단계에서 시작
  useEffect(() => {
    if (!open || !prefill) return
    if (!Number.isFinite(prefill.lat) || !Number.isFinite(prefill.lng)) return
    setPoint({ lat: prefill.lat, lng: prefill.lng })
    setName(prefill.name || "")
    if (prefill.asNewFind) {
      // 생물 관측 등 — 새발견 카드로 등록
      setCandidates([])
      setSelectedSpot(null)
    } else {
      const candidate = {
        name: prefill.name || "",
        category: prefill.category || "etc",
        categoryName: prefill.categoryName || "",
        tagLabel: prefill.tagLabel || null,
        address: prefill.address || "",
        lat: prefill.lat,
        lng: prefill.lng,
      }
      setCandidates([candidate])
      setSelectedSpot(candidate)
    }
    setStep("confirm")
  }, [open, prefill])

  // 키워드 검색 (현재 위치/선택 위치 기준)
  useEffect(() => {
    if (!open || step !== "pick") return undefined
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

  const focusPoint = point
    ? { lat: point.lat, lng: point.lng, zoom: 16 }
    : myLocation
      ? { lat: myLocation.lat, lng: myLocation.lng, zoom: 14 }
      : SEOUL_CENTER

  // 지도에서 콕 찍기 → 좌표 저장 + 주소 역지오코딩 표시
  const handleMapPick = (tapped) => {
    if (!tapped || !Number.isFinite(tapped.lat)) return
    setPoint({ lat: tapped.lat, lng: tapped.lng })
    setPickedAddress("")
    reverseGeocodeAddress(tapped.lat, tapped.lng).then((address) => {
      // 그 사이 다른 곳을 다시 찍었으면 무시
      setPoint((current) => {
        if (current && current.lat === tapped.lat && current.lng === tapped.lng) setPickedAddress(address)
        return current
      })
    })
  }

  // 검색 결과에서 바로 선택 → SPOT 확정 단계로
  const pickSearchResult = (candidate) => {
    setPoint({ lat: candidate.lat, lng: candidate.lng })
    setPickedAddress("")
    setCandidates([candidate])
    setSelectedSpot(candidate)
    setName(candidate.name)
    setQuery("")
    setSearchResults([])
    setStep("confirm")
  }

  // 지도에서 찍은 위치로 진행 → 주변 등록 상호 판정
  const confirmPoint = async () => {
    if (!point) return
    setCheckingNearby(true)
    try {
      const nearby = await fetchPlaceMatch({ lat: point.lat, lng: point.lng })
      setCandidates(nearby)
      setSelectedSpot(nearby[0] || null)
      setName(nearby[0]?.name || "")
    } catch {
      setCandidates([])
      setSelectedSpot(null)
      setName("")
    } finally {
      setCheckingNearby(false)
      setStep("confirm")
    }
  }

  const isNewFind = !selectedSpot
  const categoryId = selectedSpot?.category || "etc"
  const pixelId = getDefaultPixelIdForCategory(isNewFind ? "etc" : categoryId)

  // 태그 입력 — 쉼표/엔터로 칩 추가, 중복·빈값 제거, 최대 6개
  const addTag = (raw) => {
    const value = `${raw || ""}`.trim().replace(/^#/, "")
    if (!value) return
    setTagList((current) => (
      current.includes(value) || current.length >= 6 ? current : [...current, value]
    ))
    setTagInput("")
  }
  const handleTagKeyDown = (event) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault()
      addTag(tagInput)
    } else if (event.key === "Backspace" && !tagInput && tagList.length) {
      setTagList((current) => current.slice(0, -1))
    }
  }
  const removeTag = (tag) => setTagList((current) => current.filter((item) => item !== tag))

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!point || !trimmedName) {
      showToast?.("이름을 적어주세요.")
      return
    }
    setSaving(true)
    try {
      // 자동 태그(카테고리/새발견) + 사용자가 적은 태그 병합 (중복 제거)
      const autoTags = isNewFind
        ? ["새발견", ...(prefill?.asNewFind && prefill?.tagLabel ? [prefill.tagLabel] : [])]
        : [selectedSpot?.tagLabel || categoryLabel(categoryId)].filter(Boolean)
      const pendingTag = tagInput.trim().replace(/^#/, "")
      const userTags = [...tagList, ...(pendingTag ? [pendingTag] : [])]
      const tags = [...new Set([...autoTags, ...userTags])]
      // 한줄 설명을 적었으면 note = 설명(카드 설명줄에 노출), 안 적었으면 주소를 note 로 유지
      const trimmedDesc = desc.trim()
      const base = {
        type: "pin",
        title: trimmedName,
        emojiKind: "pixel",
        emojiPixelId: isNewFind ? "px-star" : pixelId,
        tags,
        note: trimmedDesc || selectedSpot?.address || pickedAddress || "",
        lat: point.lat,
        lng: point.lng,
      }

      let collected = null
      if (cloudMode) {
        collected = await createFeature(null, { ...base, createdBy: currentUserId }, { onRegionTagged })
      } else {
        collected = {
          id: createId("feat"),
          mapId: null,
          ...base,
          memos: [],
          photos: [],
          voices: [],
          updatedAt: new Date().toISOString(),
        }
      }

      onCollected?.(collected, { isNewFind })
      onClose?.()
    } catch (error) {
      console.error("collect failed", error)
      showToast?.("등록에 실패했어요. 잠시 후 다시 시도해주세요.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="clt-backdrop" onClick={onClose} role="presentation">
      <section
        className="clt-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="장소 등록"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="clt-head">
          <strong>{step === "pick" ? "어디를 등록할까요?" : isNewFind ? "새로운 곳 발견!" : "등록된 곳이에요"}</strong>
          <button type="button" className="clt-close" onClick={onClose} aria-label="닫기">
            <X size={15} strokeWidth={2.4} />
          </button>
        </header>

        {step === "pick" ? (
          <>
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
                {searchResults.slice(0, 5).map((candidate) => (
                  <li key={`${candidate.name}-${candidate.lat}`}>
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
              <p className="clt-hint clt-hint--picked">
                📍 {pickedAddress || "찍은 위치"}
              </p>
            ) : (
              <p className="clt-hint">지도를 눌러 위치를 고르거나, 위에서 검색하세요.</p>
            )}

            <button
              type="button"
              className="clt-primary"
              disabled={!point || checkingNearby}
              onClick={confirmPoint}
            >
              {checkingNearby ? "주변을 살피는 중…" : "이 위치로 등록하기"}
            </button>
          </>
        ) : (
          <>
            <div className={`clt-verdict${isNewFind ? " clt-verdict--new" : ""}`}>
              <span className="clt-verdict__emoji" aria-hidden="true">
                <FeatureEmoji emoji={null} feature={{ emojiKind: "pixel", emojiPixelId: isNewFind ? "px-star" : pixelId }} size={40} unicodeFontSize={26} />
              </span>
              <div>
                <em>{isNewFind ? "NEW FIND" : "SPOT"}</em>
                <p>
                  {isNewFind
                    ? "지도에 등록되지 않은 곳이에요. 내가 처음 발견한 곳!"
                    : `${selectedSpot?.categoryName || categoryLabel(categoryId)} · 등록된 장소를 카드로 담아요.`}
                </p>
              </div>
            </div>

            <label className="clt-field">
              <span className="clt-field__label">이름</span>
              <input
                className="clt-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={isNewFind ? "이 곳에 이름을 붙여주세요" : "장소 이름"}
                maxLength={40}
              />
            </label>

            <label className="clt-field">
              <span className="clt-field__head">
                <span className="clt-field__label">한줄 설명</span>
                {descHint && !desc.trim() ? (
                  <button
                    type="button"
                    className="clt-paste"
                    onClick={() => setDesc(descHint)}
                    title={descHint}
                  >
                    <ClipboardPaste size={11} strokeWidth={2.4} aria-hidden="true" />
                    설명 붙여넣기
                  </button>
                ) : null}
              </span>
              <input
                className="clt-desc"
                type="text"
                value={desc}
                onChange={(event) => setDesc(event.target.value)}
                placeholder="이곳은 어떤 곳인가요? (선택)"
                maxLength={60}
              />
            </label>

            <div className="clt-field">
              <span className="clt-field__label">태그</span>
              <div className="clt-tags">
                {tagList.map((tag) => (
                  <button key={tag} type="button" className="clt-tag" onClick={() => removeTag(tag)}>
                    #{tag}<i aria-hidden="true">✕</i>
                  </button>
                ))}
                <input
                  className="clt-taginput"
                  type="text"
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={() => addTag(tagInput)}
                  placeholder={tagList.length ? "" : "예: 조용함, 데이트 (엔터로 추가)"}
                  maxLength={12}
                  disabled={tagList.length >= 6}
                />
              </div>
            </div>

            {candidates.length > 0 ? (
              <div className="clt-field">
                <span className="clt-field__label">이 장소가 맞나요? (아니면 다시 선택)</span>
                <div className="clt-candidates" role="radiogroup" aria-label="주변 등록 장소">
                  {candidates.slice(0, 4).map((candidate) => (
                    <button
                      key={`${candidate.name}-${candidate.lat}`}
                      type="button"
                      className={`clt-candidate${selectedSpot?.name === candidate.name ? " is-selected" : ""}`}
                      onClick={() => {
                        setSelectedSpot(candidate)
                        setName(candidate.name)
                        setPoint({ lat: candidate.lat, lng: candidate.lng })
                      }}
                    >
                      <strong>{candidate.name}</strong>
                      <span>{candidate.categoryName} · {candidate.distance}m</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`clt-candidate clt-candidate--new${isNewFind ? " is-selected" : ""}`}
                    onClick={() => {
                      setSelectedSpot(null)
                      setName("")
                    }}
                  >
                    <strong>여기가 아니에요</strong>
                    <span>내가 발견한 곳으로 직접 등록</span>
                  </button>
                </div>
              </div>
            ) : null}

            <div className="clt-actions">
              <button type="button" className="clt-ghost" onClick={() => setStep("pick")}>위치 다시 고르기</button>
              <button type="button" className="clt-primary" disabled={saving || !name.trim()} onClick={handleSave}>
                {saving ? "등록 중…" : "등록하기"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
