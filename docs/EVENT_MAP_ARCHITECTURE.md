# LOCA 행사 지도 아키텍처

## 역할 분리 원칙

| 구분 | 앱 | 역할 | URL |
|------|-----|------|-----|
| **메인 앱** | loca202603 | participant shell only | loca202603.vercel.app |
| **웹 대시보드** | loca-dashboard | manager console only | 별도 배포 (포트 5174) |

### 메인 앱 (participant only)
- 행사 링크를 열면 **항상 참여자 화면**으로 진입
- manager 권한이 있어도 메인 앱에서는 참여자 화면만 표시
- 편집/관리 버튼, 대시보드 진입점, 운영 도구 **일체 없음**
- 개인 지도(category !== 'event')는 기존 MapEditorScreen으로 편집 가능

### 웹 대시보드 (manager only)
- 행사 수정, 체크포인트 CRUD, 공지 관리, 댓글 moderation, 운영 지표
- 댓글 작성 기능 **없음** (작성은 participant 앱에서만)
- 4개 탭: 대시보드 / 지도 관리 / 댓글 관리 / 공지 관리

---

## 행사 참여 흐름 (participant)

```
1. /s/:slug 또는 내 지도 목록에서 행사 지도 선택
   ↓
2. SharedMapViewer (participant shell) 렌더
   - 상단: 행사 헤더 카드 (행사명, 설명, 진행률)
   - 중앙: 네이버 지도 + 체크인 마커
   - 하단: 접힌 시트 (다음 장소 안내) / 펼친 시트 (장소/공지/정보 탭)
   ↓
3. 장소 선택 → 장소 카드
   - 정보 탭: 장소 설명, 태그
   - 댓글 탭: 댓글 목록 + 작성 (권한 조건에 따라)
   ↓
4. 체크인 (GPS 근접 확인)
   - 서버 기록 (event_checkins)
   - XP 획득 + 토스트
   - 오프라인 시 큐에 저장 → 온라인 복귀 시 자동 동기화
   ↓
5. 완주 시
   - 수비니어 발급
   - 설문 팝업 (survey_enabled일 때)
   - 완주 XP 획득
```

---

## 댓글 작성 흐름 (participant)

```
장소 선택 → "댓글" 탭 클릭
  ↓
[권한 확인]
  - comments_enabled === false → 입력 UI 비노출
  - comment_permission === "checked_in_only" && 미체크인 → "체크인 후 댓글을 남길 수 있어요." 안내
  - comment_permission === "all_logged_in" → 즉시 작성 가능
  - comment_permission === "guest_allowed" → 비로그인도 가능 (session 기반)
  ↓
[댓글 작성]
  - create_event_comment RPC 호출 (SECURITY DEFINER)
  - 서버에서 config 검증 + 체크인 조건 확인
  - participant_key: 로그인 'u:<user_id>' / 비로그인 's:<session_id>'
  ↓
[본인 댓글 관리]
  - 수정: allow_comment_edit === true일 때 인라인 수정
  - 삭제: allow_comment_delete === true일 때 confirm 후 삭제
  - 타인 댓글: 신고 (5가지 사유 선택)
  ↓
[자동 moderation]
  - 신고 3회 이상 → 자동으로 status='reported'
```

---

## 댓글 Moderation 흐름 (manager, dashboard)

```
댓글 관리 탭 진입
  ↓
[통계 확인]
  - 전체 / 공개 / 숨김 / 신고 / 오늘 / 최근 7일
  ↓
[댓글 탭]
  - 필터: 상태별 + 장소별
  - 개별: 숨기기 / 공개하기 / 📌 고정 / 삭제
  - 일괄: 체크박스 선택 → 일괄 숨김 / 일괄 공개
  ↓
[신고 탭]
  - 신고된 댓글 목록 + 사유 배지
  - 숨기기 / 공개하기 / 삭제
  ↓
[정책 설정 탭]
  - comments_enabled: 댓글 허용 여부
  - comment_permission: 로그인 전체 / 체크인만 / 게스트 포함
  - guest_comments_enabled: 비로그인 댓글
  - allow_comment_edit: 참여자 수정 허용
  - allow_comment_delete: 참여자 삭제 허용
  - 정책 저장 → maps.config 업데이트
```

---

## 데이터 구조

### event_comments 테이블
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| map_id | uuid | FK → maps |
| feature_id | uuid | FK → map_features |
| user_id | uuid | FK → profiles (nullable, 게스트는 null) |
| session_id | text | 비로그인 세션 |
| participant_key | text | 'u:<user_id>' 또는 's:<session_id>' |
| author_name | text | 표시 이름 |
| body | text | 1~2000자 |
| status | text | visible / hidden / reported / deleted |
| is_pinned | boolean | 고정 여부 |
| created_at | timestamptz | 작성일 |
| updated_at | timestamptz | 수정일 |

### event_comment_reports 테이블
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| comment_id | uuid | FK → event_comments |
| reporter_user_id | uuid | 신고자 |
| reporter_session_id | text | 비로그인 신고자 |
| reason | text | spam / offensive / inappropriate / misinformation / other |

### maps.config 댓글 관련 필드
```json
{
  "comments_enabled": true,
  "comment_permission": "all_logged_in",
  "guest_comments_enabled": false,
  "allow_comment_edit": true,
  "allow_comment_delete": true
}
```

---

## Local Mode / Cloud Mode 차이

| 기능 | Local Mode | Cloud Mode |
|------|-----------|------------|
| 행사 참여 화면 | SharedMapViewer 렌더 (지도+장소 표시) | 동일 + GPS 체크인 + 서버 동기화 |
| 체크인 | sessionStorage만 (서버 미동기화) | Supabase event_checkins + XP |
| 댓글 | 비노출 (hasSupabaseEnv === false) | event_comments RPC |
| 설문 | 비노출 | Supabase survey_responses |
| 공지 | 비노출 | Supabase announcements |
| 오프라인 | sessionStorage 캐시 | 체크인/설문 오프라인 큐 → 온라인 flush |

---

## Known Limitations

1. **댓글 오프라인 미지원** — 체크인/설문은 오프라인 큐가 있지만 댓글은 온라인 전용
2. **실시간 업데이트 없음** — Supabase Realtime 미연동. 다른 참여자의 새 댓글을 보려면 장소 재선택 필요
3. **댓글 페이지네이션** — 현재 limit 50으로 고정. 대규모 행사(50+ 댓글/장소)에서는 더보기 구현 필요
4. **게스트 댓글 신고** — 비로그인 유저의 신고는 session 기반이므로 브라우저 새로고침 시 중복 신고 가능
5. **대시보드 별도 인증** — 메인 앱과 대시보드가 별도 Supabase 클라이언트. SSO 미연동
6. **기존 feature_memos와 공존** — 일반 지도는 feature_memos, 행사 지도는 event_comments. 데이터 마이그레이션 미수행
