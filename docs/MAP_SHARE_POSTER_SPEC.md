# 지도 이미지 공유 포스터 — 기획/구현 스펙

> 작성 2026-07-19. **v2 개정(07-19): 레퍼런스 = 팝아트 트레이딩 카드(TANG'S WORLD).** 상태: 시안 다듬는 중, 구현 착수 전.
> 목적: 현재 "링크 공유"만 있는 지도 공유에 **이미지(포스터) 공유**를 추가한다.
> 레퍼런스: **볼드 팝아트 트레이딩 카드**(두꺼운 검정 아웃라인 + 쨍한 플랫 색면 + 만화 액자 + 하단 스탯/코드 박스). 배치: 지도명=좌상단 · QR=우상단 · 지도=중앙 · LOCA=중앙하단.
>
> **⚠️ 초판(v1) 방향 폐기:** "동물의숲 크림톤 손그림(generateMiniMapSvg 수채)"은 사용자 레퍼런스 교체로 폐기. 아래 트레이딩 카드 방향으로 대체.

## 시스템 정합 — 장소 공유 카드와 한 가족

장소 공유 카드(`PlaceSharePoster`)가 **v8 Pulpito 트레이딩 카드**로 확정됨([[project-share-card-tiers]]): 굵은 채도 테두리 + **검정 아웃라인 `#201712` 6px** + **크림 속지 `#FBF1D6`** + 볼드 이름 + 만화 액자 + POWER 바/스탯 + 하단 LOCA. 지도 포스터도 **같은 트레이딩 카드 시스템**을 공유한다. 차이점만:
- 장소 카드 = **QR 없음**(LOCA만), 순번 우상단. / 지도 포스터 = **QR 우상단**(지도는 스캔해 여는 링크가 핵심 — AC 드림코드 감성).
- 테두리/액자 색 = 장소는 **타입색**(장소/길/영역), 지도는 **지도 테마색**(`map.theme`) 연동.
- 공통 골격(테마/타입색 프레임·검정 아웃라인·크림 속지·볼드 이름·만화 액자·하단 LOCA)은 동일 → CSS 토큰/컴포넌트 최대 공유. (장소=하단 스탯/POWER 바, 지도=하단 없음(QR로 대체)·코드박스 제거.)

---

## 0. 핵심 전제 — "새로 개발"이 아니라 "되살리기 + 브랜드 통일"

이미지 공유 엔진은 이미 앱에 있다. 2026-07 "링크 공유만" 정리 때 `ShareSheet`의 **진입 버튼만 제거**됐고, 뒤쪽 배선(캡처→에디터→QR→내보내기)은 살아있다.

| 이미 있는 자산 | 위치 | 이번에 |
|---|---|---|
| 포스터 캡처/공유 유틸 (`capturePosterBlob`/`shareImage`/`downloadImage`/`sanitizeCardFilename`) | `src/lib/cardShareImage.js` | 수정 없이 재사용 |
| 손그림 지도 SVG 생성기 `generateMiniMapSvg(features,{theme})` | `src/lib/miniMapPreview.js:93` | 세로 비율만 파라미터화 |
| 도트 LOCA 워드마크 | `src/components/PixelWordmark.jsx` | 하단중앙에 재사용 |
| QR 생성 | `qrcode` (설치됨, `MapShareEditor.jsx:342~365` 패턴) | `toDataURL`로 재사용 |
| 공유 URL / 짧은 slug 확보 | `App.jsx` `shareUrl`(908~917), `handleEnsureShareLink`(1504) | 재사용 |
| 제작자 핸들 | `useAppSession.js:98` `me.handle = '@'+slug` | 신규 렌더에 주입 |

---

## 1. 확정 결정사항

| # | 항목 | 결정 |
|---|---|---|
| D1 | 카드 스타일 | **볼드 팝아트 트레이딩 카드**(TANG'S WORLD/Pulpito 계열). 검정 아웃라인 + 플랫 색면 + 만화 액자 |
| D1b | 가운데 지도 렌더 | `generateMiniMapSvg`에 **볼드 스타일 변형** 추가(두꺼운 `#201712` 스트로크·플랫 밝은 채움·검정 아웃라인 핀). 투영/피처배치 로직은 재사용 |
| D2 | 지도명·본문 글씨체 | **Pretendard 800(헤비)** — 검정, 좌상단. (하단 LOCA는 볼드 워드마크 + 엠버 dot) |
| D3 | 기존 MapShareEditor(인스타 필터 7종 프레임) | **새 단일 템플릿으로 교체**(폐기 예정) |
| D4 | 진입점 범위 | **내 지도 편집화면(ShareSheet)만** — 1차. 발행 뷰어는 2차 백로그 |
| D5 | 템플릿 수 | **1종**(이 스펙의 포스터) |
| D6 | 배치 | 지도명=좌상단 · QR=우상단 · 지도=중앙 액자 · @제작자=좌하단 · **LOCA=중앙하단** |

### 시안 확정 3건 (07-19)
- **① 지도 코드 박스 = 제거.** 하단은 QR만으로 충분. 푸터는 `@제작자 · LOCA · loca.im` 한 줄. 확보된 세로 공간은 **지도 액자 확대**에 사용.
- **② 카드 테두리·액자 색 = 지도 테마색(`map.theme`) 연동.** 외곽 채도 프레임 밴드 = 테마색, 그 안 검정 아웃라인 `#201712` + 크림 속지 `#FBF1D6`. 지도 액자도 테마색 매트 + 검정 키라인. (장소 카드 타입색 연동과 동형.)
- **③ 지도명 편집 = 포스터 전용 임시값.** 원본 `map.title`은 안 바꿈. 미리보기 시트 입력 필드 기본값만 `map.title`.

### 확정 기본값(이견 없으면 진행)
- **제작자 아이디**: 좌하단 `@handle`(장소 카드의 우상단 순번 슬롯과 대응). 1차 내 지도만 → `me.handle`.
- **빈 지도(피처 0개)**: 이미지 공유 버튼 비활성화(공유 링크 자체가 안 생김).
- **공유 API**: `cardShareImage.shareImage`(웹 `navigator.share`)로 수렴, 미지원 시 다운로드 폴백.
- **토큰 정합**: 아웃라인 `#201712`, 크림 속지 `#FBF1D6`, 엠버 `#FF4D1A` — 장소 카드 v8과 공유.

---

## 2. 템플릿 레이아웃 스펙 (v2 — 트레이딩 카드)

캔버스 **1080×1350 (4:5 인스타 세로)**. 카드 골격: 크림 속지 `#FBF1D6` + **검정 아웃라인 `#201712` 6px** + 라운드 모서리. 색/폰트 하드코딩(캔버스/DOM 인라인). 엠버 `#FF4D1A`, 뮤트 `#807668`. 폰트 `"Pretendard Variable"`(800/700). 액자·테두리 색 = `map.theme` 연동(확인 ②).

| 영역 | 위치(1080×1350 기준) | 내용 | 데이터 |
|---|---|---|---|
| ⓪ 카드 | 외곽 = **테마색 채도 프레임 밴드** + 검정 아웃라인 `#201712` 6px, 안쪽 = 크림 속지 `#FBF1D6` + 키라인 | 라운드 코너 | `map.theme` |
| ① 지도명 **(편집 가능)** — 좌상단 | 크림 상단 좌측 | Pretendard 800 ~80px 검정, 좌정렬, 2줄 오토슈링크. 점선 밑줄 + "이름 직접 수정" 칩 | `map.title`(임시 편집값) |
| ② QR — 우상단 | 크림 상단 우측 (약 185×185, 라운드 24, 아웃라인 5px) | QR + 중앙 흰 원 `loca.`(엠버 dot). `errorCorrectionLevel:"H"` | `shareUrl`(짧은 `/s/:slug`, `utm_source=qr`) |
| ③ 지도(만화 액자) — 중앙 | 크림 중앙, 세로 확대(코드박스 제거분 흡수) | **테마색 매트 + 검정 키라인 6px** 액자 안에 **볼드 지도** = `generateMiniMapSvg(features,{theme, style:'bold'})`. 밝은 색면(하늘/땅) + 검정 아웃라인 핀·길·영역 | `activeFeatures`, `map.theme` |
| ④ 푸터 라인 | 하단, 상단에 구분선 | 좌: `■ @handle`(700 검정) · 중앙: **`LOCA`**(800 검정 + 엠버 dot) · 우: `loca.im`(뮤트, 선택) | `me.handle` |

> 대화의 최종 목업이 이 스펙의 시안. 지도명/아이디/QR/테마색은 실제 지도 데이터로 자동 채움.

---

## 3. 데이터 흐름

```
[내 지도 편집화면] ShareSheet "이미지로 공유" 클릭
  → handleEnsureShareLink()로 짧은 /s/:slug 확보 (QR 밀도 가드)
  → 미리보기 시트 open: { mapTitle, authorHandle: me.handle, features: activeFeatures, theme, shareUrl }
     - 지도명 입력 필드(기본값 map.title) → 실시간 포스터 재렌더
     - QR: QRCode.toDataURL(shareUrl.replace(utm_source→qr)) → <img>
     - 지도: generateMiniMapSvg(features,{theme}) 인라인
  → [공유]/[이미지 저장]:
     capturePosterBlob(posterRef)  // 오프스크린 .mapshare-hidden 1080×1350, fonts.ready 대기
       → shareImage(blob) | downloadImage(blob)
     logEvent('map_poster_share', { method })
```

---

## 4. 파일별 작업

### 신규
- `src/components/binder/MapSharePoster.jsx` — 포스터 DOM(오프스크린 1080×1350). `PlaceSharePoster.jsx` 규약 계승(사진 대신 인라인 지도 SVG). props: `{ mapTitle, authorHandle, features, theme, qrDataUrl, innerRef }`.
- `src/components/sheets/MapSharePosterSheet.jsx` — 지도명 입력 + 미리보기 모달 + `공유`/`이미지 저장`. `capturePosterBlob`/`shareImage`/`downloadImage` 호출.
- `src/styles` 또는 `app-shell.css`에 `.mapshare-*` 블록 — `.cardshare-*` 규약 복제(오프스크린 `.mapshare-hidden`, background/그라데이션 html2canvas 호환).
- (선택) `src/lib/mapPosterQr.js` — `QRCode.toDataURL` 얇은 헬퍼 + `utm_source=qr` 치환.

### 수정(재연결)
- `src/components/sheets/ShareSheet.jsx` — `share-sheet__actions`(171~183)에 "이미지로 공유" 버튼 추가, `onOpenImageShare` prop 재수신(6행 주석 지점 복원). 콜백을 "MapSharePosterSheet 열기"로 정의.
- `src/screens/MapEditorScreen.jsx` — 기존 캡처 콜백(1007~1021, `naverMapRef.capture()`) 제거/대체 → `onOpenMapPoster({ map, features, authorHandle, shareUrl })`. 필요 시 `me` 주입.
- `src/App.jsx` — `MapSharePosterSheet` 상태/렌더 추가, `shareUrl`(908) 재사용, 열기 전 `handleEnsureShareLink`(1504)로 slug 확보, `me.handle`·`activeFeatures`(758) 주입. **기존 `MapShareEditor` 렌더(2622~2630)·`shareEditorImage`(413)·lazy(91) 제거(D3).**

### 소폭 수정
- `src/lib/miniMapPreview.js` — `style:'bold'` 옵션 추가(두꺼운 `#201712` 스트로크·플랫 밝은 채움·검정 아웃라인 teardrop 핀·밝은 하늘/땅 색면). 기존 soft 렌더는 목록 썸네일용으로 유지. 세로 비율 파라미터화 동반.

### 재사용(수정 0)
`src/lib/cardShareImage.js`, `qrcode`, `appUtils.buildSlugShareUrl`, `useMapCRUD.onEnsureShareLink`. (LOCA 하단은 `PixelWordmark` 대신 볼드 텍스트 + 엠버 dot으로 트레이딩 카드 톤에 맞춤 — 장소 카드 v8과 동일.)

### 정리(D3 폐기)
`src/screens/MapShareEditor.jsx` + `src/map-share-editor.css` — 신규 안정화 후 제거. (제거 전 참고: QR 로고 인 패턴 342~365.)

---

## 5. 기술 주의사항 / 리스크

1. **html2canvas 규약** — `<img>` object-position 무시 → 사진 필요 시 `background-image`+`background-position`. conic-gradient 금지(linear multi-stop). 인라인 SVG(gradient/path)는 대체로 캡처되나 filter/foreignObject/외부이미지 참조는 실패 위험 → `generateMiniMapSvg`는 순수 벡터라 비교적 안전하나 **실캡처 검증 필수**.
2. **한글 폰트 이미지화** — Pretendard는 CDN 로드. 캡처 전 `document.fonts.ready` 대기(cardShareImage 내장). 지도명 편집 직후 재렌더 타이밍 어긋나면 이전 프레임 캡처 위험 → 캡처 직전 1프레임 지연.
3. **QR 밀도/유효성** — 미발행 로컬은 gzip `/shared?data=v2:...` 긴 URL → 조밀. **`onEnsureShareLink`로 짧은 `/s/:slug` 선확보 가드 필수.** 피처 0개면 링크 미생성(`publishMap:313`).
4. **색 통일** — `MapShareEditor`의 엠버 `#ff4b2e` ≠ 토큰 `#FF4D1A`. 신규는 **`#FF4D1A`로 통일**. `favicon.svg`(v1 인디고/앰버)는 포스터에 쓰지 않음.
5. **지도 비율** — `generateMiniMapSvg` 200×138 고정 → 포스터 지도 영역(약 900×620)에 맞춰 WIDTH/HEIGHT/padding 파라미터화.
6. **모바일 Web Share** — `navigator.canShare({files})` 미지원 시 다운로드 폴백. iOS는 "저장 후 업로드" 안내.
7. **성능** — html2canvas vendor 청크 + 1080×1350 캡처는 저사양 순간 부하 → 오프스크린 렌더 + 로딩 인디케이터.

---

## 6. 구현 순서(단계)

- **S1** `generateMiniMapSvg` 세로 파라미터화 + 단독 렌더 확인.
- **S2** `MapSharePoster.jsx` + `.mapshare-*` CSS(오프스크린) — 목업 재현, `capturePosterBlob` 캡처 검증(폰트/SVG/QR).
- **S3** `MapSharePosterSheet.jsx` — 지도명 편집 + 미리보기 + 공유/저장 + `logEvent`.
- **S4** `ShareSheet`/`MapEditorScreen`/`App` 배선 + `handleEnsureShareLink` 가드 + `me.handle` 주입.
- **S5** 데모 환경 검증(`.env.demo` + 지도 편집화면), lint/build, 기존 `MapShareEditor` 제거(D3).
- **(백로그)** `SharedMapViewer` 공유 드롭다운에 "이미지로 저장" 추가(D4 2차 — 동일 시트 재사용).

각 단계 후 변경 파일·핵심 변경점·남은 TODO·lint/build 결과 보고.
