import { useEffect, useRef, useState } from "react"
import { Search as SearchIcon, X } from "lucide-react"
import { NaverMap } from "../NaverMap"
import { FeatureEmoji } from "../FeatureEmoji"
import { createFeature } from "../../lib/mapService"
import { createId } from "../../lib/appUtils"
import { PLACE_CATEGORIES, getDefaultPixelIdForCategory } from "../../lib/placeCategories"

// 채집 시트 — 지도 없이 장소를 먼저 등록한다 (채집-우선 구조 B단계).
// 위치를 고르면 카카오 로컬(place-match)로 주변 등록 상호를 조회해서
//   후보 있음 → SPOT (등록된 곳, 이름·카테고리 자동)
//   후보 없음 → NEW FIND (내가 처음 발견한 곳)
// 저장된 기록은 지도에 안 묶인 채 도감에 쌓인다.

const SEOUL_CENTER = { lat: 37.5665, lng: 126.978, zoom: 13 }

function categoryLabel(categoryId) {
  return PLACE_CATEGORIES.find((category) => category.id === categoryId)?.label || "그 외"
}

async function fetchPlaceMatch({ lat, lng, q }) {
  const params = new URLSearchParams({ lat: lat.toFixed(5), lng: lng.toFixed(5) })
  if (q) params.set("q", q)
  const response = await fetch(`/api/place-match?${params.toString()}`)
  if (!response.ok) throw new Error("place-match failed")
  const data = await response.json()
  return Array.isArray(data.candidates) ? data.candidates : []
}

export function CollectSheet({
  open,
  onClose,
  cloudMode,
  currentUserId,
  myLocation,
  onCollected,
  showToast,
}) {
  const [step, setStep] = useState("pick") // pick → confirm
  const [point, setPoint] = useState(null)
  const [query, setQuery] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [candidates, setCandidates] = useState([])
  const [checkingNearby, setCheckingNearby] = useState(false)
  const [selectedSpot, setSelectedSpot] = useState(null) // null = NEW FIND
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const searchTimerRef = useRef(null)

  useEffect(() => {
    if (open) return
    setStep("pick")
    setPoint(null)
    setQuery("")
    setSearchResults([])
    setCandidates([])
    setSelectedSpot(null)
    setName("")
    setSaving(false)
  }, [open])

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

  // 검색 결과에서 바로 선택 → SPOT 확정 단계로
  const pickSearchResult = (candidate) => {
    setPoint({ lat: candidate.lat, lng: candidate.lng })
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

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!point || !trimmedName) {
      showToast?.("이름을 적어주세요.")
      return
    }
    setSaving(true)
    try {
      const tags = isNewFind
        ? ["새발견"]
        : [categoryLabel(categoryId)].filter(Boolean)
      const base = {
        type: "pin",
        title: trimmedName,
        emojiKind: "pixel",
        emojiPixelId: isNewFind ? "px-star" : pixelId,
        tags,
        note: selectedSpot?.address || "",
        lat: point.lat,
        lng: point.lng,
      }

      let collected = null
      if (cloudMode) {
        collected = await createFeature(null, { ...base, createdBy: currentUserId })
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
      showToast?.("채집에 실패했어요. 잠시 후 다시 시도해주세요.")
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
        aria-label="장소 채집"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="clt-head">
          <strong>{step === "pick" ? "어디를 채집할까요?" : isNewFind ? "새로운 곳 발견!" : "등록된 곳이에요"}</strong>
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
              <NaverMap
                features={[]}
                selectedFeatureId={null}
                draftPoints={point ? [[point.lng, point.lat]] : []}
                draftMode="pin"
                focusPoint={focusPoint}
                fitTrigger={0}
                onMapTap={(tapped) => {
                  if (tapped && Number.isFinite(tapped.lat)) setPoint({ lat: tapped.lat, lng: tapped.lng })
                }}
                onFeatureTap={() => {}}
                showLabels={false}
              />
            </div>
            <p className="clt-hint">지도를 눌러 위치를 고르거나, 위에서 검색하세요.</p>

            <button
              type="button"
              className="clt-primary"
              disabled={!point || checkingNearby}
              onClick={confirmPoint}
            >
              {checkingNearby ? "주변을 살피는 중…" : "이 위치로 채집하기"}
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
                    : `${categoryLabel(categoryId)} · 등록된 장소를 카드로 담아요.`}
                </p>
              </div>
            </div>

            {candidates.length > 0 ? (
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
            ) : null}

            <input
              className="clt-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={isNewFind ? "이 곳에 이름을 붙여주세요" : "장소 이름"}
              maxLength={40}
            />

            <div className="clt-actions">
              <button type="button" className="clt-ghost" onClick={() => setStep("pick")}>위치 다시 고르기</button>
              <button type="button" className="clt-primary" disabled={saving || !name.trim()} onClick={handleSave}>
                {saving ? "채집 중…" : "도감에 담기"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
