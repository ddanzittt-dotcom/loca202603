import { forwardRef } from "react"

// 동네 밀도 지도 — /admin '지역·태그' 탭. 순수 인라인 SVG(지도 SDK 없음).
// get_admin_geo_density(082) 의 0.05도 격자 셀을 한국 경위도 고정 투영으로 점 찍는다.
// 순수 함수형(사이드이펙트 없음). forwardRef 로 최상위 <svg> 를 부모 PNG 저장에 노출.

// 한국 고정 bbox — 데이터 bbox 가 아니라 화면 좌표가 항상 일정하도록 상수로 못박는다.
const LAT_HI = 38.7 // 위(북)
const LAT_LO = 33.0
const LNG_LO = 124.5 // 좌(서)
const LNG_HI = 131.9
// 경도 왜곡 보정: 위도 35.5° 부근에서 경도 1도는 위도 1도보다 짧다(cos 35.5° ≈ 0.814).
// viewBox 종횡비를 실제 물리 비율에 맞춰(W:H ≈ 1.05:1) 세로로 눌린 지도를 방지.
const LNG_SCALE = Math.cos((35.5 * Math.PI) / 180) // ≈ 0.814
const H = 590
const W = Math.round(H * ((LNG_HI - LNG_LO) * LNG_SCALE) / (LAT_HI - LAT_LO)) // ≈ 620
const MAX_R = 14 // 밀도 점 최대 반지름

// 방향 잡기용 주요 도시 기준점 (흐리게)
const CITIES = [
  { name: "서울", lat: 37.5665, lng: 126.978 },
  { name: "인천", lat: 37.4563, lng: 126.7052 },
  { name: "부산", lat: 35.1796, lng: 129.0756 },
  { name: "대구", lat: 35.8714, lng: 128.6014 },
  { name: "대전", lat: 36.3504, lng: 127.3845 },
  { name: "광주", lat: 35.1595, lng: 126.8526 },
  { name: "강릉", lat: 37.7519, lng: 128.8761 },
  { name: "제주", lat: 33.4996, lng: 126.5312 },
]

function projX(lng) {
  return ((lng - LNG_LO) / (LNG_HI - LNG_LO)) * W
}
function projY(lat) {
  return ((LAT_HI - lat) / (LAT_HI - LAT_LO)) * H
}

export const GeoDensityMap = forwardRef(function GeoDensityMap({ data, metric = "cards" }, ref) {
  const cells = Array.isArray(data?.cells) ? data.cells : []

  if (!cells.length) {
    return <p className="admin-empty-note">표시할 좌표 데이터가 아직 없어요.</p>
  }

  const useNewFinds = metric === "new_finds"
  const valueOf = (c) => Number((useNewFinds ? c?.new_finds : c?.cards)) || 0
  const maxVal = useNewFinds
    ? Math.max(0, ...cells.map((c) => Number(c?.new_finds) || 0))
    : Number(data?.max_cards) || 0

  // 값 오름차순으로 그려 큰 점이 나중에(위에) 오도록 — 작은 점을 가리지 않는다
  const dots = cells
    .filter((c) => valueOf(c) > 0 && Number.isFinite(Number(c?.lat)) && Number.isFinite(Number(c?.lng)))
    .sort((a, b) => valueOf(a) - valueOf(b))

  // 옅은 격자선 (정수 경/위도)
  const gridLng = []
  for (let g = Math.ceil(LNG_LO); g <= Math.floor(LNG_HI); g += 1) gridLng.push(g)
  const gridLat = []
  for (let g = Math.ceil(LAT_LO); g <= Math.floor(LAT_HI); g += 1) gridLat.push(g)

  return (
    <svg
      ref={ref}
      className="admin-geomap__svg"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="동네별 기록 밀도 지도"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* 바다/땅 느낌 — 낮은 채도 2톤 */}
      <rect x="0" y="0" width={W} height={H} rx="14" fill="#E7EDEC" />
      <rect x="10" y="10" width={W - 20} height={H - 20} rx="12" fill="#F1EEE6" />

      {/* 옅은 격자선 */}
      <g stroke="#0A0A0A" strokeOpacity="0.05" strokeWidth="1">
        {gridLng.map((g) => (
          <line key={`vx${g}`} x1={projX(g)} y1="10" x2={projX(g)} y2={H - 10} />
        ))}
        {gridLat.map((g) => (
          <line key={`hz${g}`} x1="10" y1={projY(g)} x2={W - 10} y2={projY(g)} />
        ))}
      </g>

      {/* 밀도 점 */}
      <g>
        {dots.map((c, i) => {
          const v = valueOf(c)
          const t = maxVal > 0 ? Math.min(1, v / maxVal) : 0
          const r = 2 + Math.sqrt(t) * MAX_R
          const opacity = 0.35 + t * 0.6
          const cards = Number(c?.cards) || 0
          const newFinds = Number(c?.new_finds) || 0
          return (
            <circle
              key={`${c?.lat},${c?.lng},${i}`}
              cx={projX(Number(c.lng))}
              cy={projY(Number(c.lat))}
              r={r}
              fill="var(--accent)"
              fillOpacity={opacity}
              stroke="var(--accent-deep)"
              strokeOpacity={0.25}
              strokeWidth="0.8"
            >
              <title>{`${c?.top_region || "미상"} · 카드 ${cards} · 새발견 ${newFinds}`}</title>
            </circle>
          )
        })}
      </g>

      {/* 주요 도시 기준점 (흐리게) */}
      <g fill="#8A8F8A">
        {CITIES.map((city) => {
          const cx = projX(city.lng)
          const cy = projY(city.lat)
          return (
            <g key={city.name}>
              <circle cx={cx} cy={cy} r="2.2" fillOpacity="0.7" />
              <text x={cx + 5} y={cy + 3.5} fontSize="11" fontWeight="600" fillOpacity="0.85">
                {city.name}
              </text>
            </g>
          )
        })}
      </g>
    </svg>
  )
})
