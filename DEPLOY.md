# LOCA 배포 가이드

## 빌드 정보

| 항목 | 값 |
|------|-----|
| 빌드 루트 | `loca202603/` |
| 빌드 명령 | `npm run build` |
| 출력 디렉토리 | `dist/` |
| Node.js | 18+ |
| 프레임워크 | Vite 8 |

---

## 옵션 A: Vercel 배포

### 1. 프로젝트 연결

```bash
# Vercel CLI 설치 (처음 한 번)
npm i -g vercel

# 프로젝트 디렉토리에서 실행
cd loca202603
vercel
```

또는 [vercel.com](https://vercel.com) → New Project → GitHub 레포 연결

**설정 확인:**
- Framework Preset: `Vite`
- Root Directory: `loca202603` (모노레포인 경우)
- Build Command: `npm run build`
- Output Directory: `dist`

### 2. 환경변수 설정

Vercel Dashboard → Project → Settings → Environment Variables:

| Key | Value | 환경 |
|-----|-------|------|
| `VITE_SUPABASE_URL` | `https://your-project.supabase.co` | Production, Preview |
| `VITE_SUPABASE_ANON_KEY` | `your-public-anon-key` | Production, Preview |
| `VITE_PUBLIC_WEB_ORIGIN` | `https://loca.im` | Production, Preview |
| `TMAP_APP_KEY` | `your-tmap-app-key` | Production, Preview |
| `NCP_CLIENT_ID` | `your-ncp-client-id` | Production, Preview (Optional) |
| `NCP_CLIENT_SECRET` | `your-ncp-client-secret` | Production, Preview (Optional) |

**주의:** `VITE_` 접두사는 클라이언트 공개 변수입니다. `TMAP_APP_KEY`, `NCP_CLIENT_SECRET`는 서버(API) 전용 시크릿이므로 `VITE_`를 붙이지 마세요. anon key는 공개 키이므로 노출되어도 괜찮습니다 (RLS가 보안 담당). `VITE_PUBLIC_WEB_ORIGIN`은 공유 링크/약관 링크 기준 도메인으로 사용됩니다.

### 3. 배포

```bash
# 프로덕션 배포
vercel --prod

# 프리뷰 배포 (PR별 자동)
vercel
```

GitHub 연결 시 push마다 자동 배포됩니다.

### 4. 커스텀 도메인 연결

Vercel Dashboard → Project → Settings → Domains:

1. **도메인 추가**: `loca.im` 입력
2. **DNS 설정**: 도메인 관리자에서 아래 레코드 추가
   - `CNAME` → `cname.vercel-dns.com`
   - 또는 루트 도메인이면 `A` → `76.76.21.21`
3. **SSL**: Vercel이 Let's Encrypt 인증서 자동 발급 (1~2분)
4. **확인**: 도메인 접속 → 앱 표시 확인

### 5. SPA 라우팅

`vercel.json`에 이미 설정됨:
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

모든 경로(`/s/:slug`, `/shared?data=...`, `/map/:id`)가 `index.html`로 라우팅되어 앱에서 처리합니다.

---

## 옵션 B: Netlify 배포

### 1. 프로젝트 연결

```bash
# Netlify CLI 설치 (처음 한 번)
npm i -g netlify-cli

# 프로젝트 디렉토리에서 실행
cd loca202603
netlify init
```

또는 [app.netlify.com](https://app.netlify.com) → New site from Git

**설정 확인:**
- Base directory: `loca202603` (모노레포인 경우)
- Build command: `npm run build`
- Publish directory: `dist`

### 2. 환경변수 설정

Netlify Dashboard → Site → Site configuration → Environment variables:

| Key | Value |
|-----|-------|
| `VITE_SUPABASE_URL` | `https://your-project.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `your-public-anon-key` |
| `VITE_PUBLIC_WEB_ORIGIN` | `https://loca.im` |

### 3. 배포

```bash
# 프로덕션 배포
netlify deploy --prod

# 프리뷰 배포
netlify deploy
```

### 4. 커스텀 도메인 연결

Netlify Dashboard → Site → Domain management → Add custom domain:

1. **도메인 추가**: `loca.im` 입력
2. **DNS 설정**:
   - `CNAME` → `your-site-name.netlify.app`
   - 또는 Netlify DNS 사용 (네임서버 변경)
3. **SSL**: HTTPS → Verify DNS → Provision certificate (자동)

### 5. SPA 라우팅

`netlify.toml`에 이미 설정됨:
```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

---

## Supabase 설정 (배포 전 필수)

### 1. DB 마이그레이션 실행

Supabase Dashboard → SQL Editor에서 순서대로 실행:

```
1. supabase/loca_v1_schema.sql          (기본 7 테이블, 최초 1회)
2. supabase/migrations/002_dashboard_schema.sql  (대시보드 인프라)
3. supabase/migrations/003_b2b_schema.sql        (B2B 초대코드)
```

### 2. Storage 버킷 생성

Supabase Dashboard → Storage → New bucket:
- Name: `media`
- Public: **체크**
- File size limit: 10MB (권장)

### 3. Auth 리다이렉트 URL 등록

Supabase Dashboard → Authentication → URL Configuration:
- Site URL: `https://loca.im`
- Redirect URLs에 추가:
  - `https://loca.im/**`
  - `http://localhost:5173/**` (로컬 개발)
  - (프리뷰용) `https://*.vercel.app/**`

> ⚠️ 반드시 **끝에 `/**`** 를 붙일 것. 간편 로그인 복귀 주소에 `?login=kakao` 쿼리 마커가 붙기 때문에
> (`src/lib/auth.js` `buildOAuthRedirectTo`), 쿼리를 포함하지 못하는 형태로 등록하면 복귀가 차단된다.

### 4. 간편 로그인(카카오·구글) 설정

#### 4-1. Kakao Developers (https://developers.kakao.com)

1. 내 애플리케이션 → 애플리케이션 추가
2. **앱 설정 → 플랫폼 → Web** 사이트 도메인 등록
   - `https://loca.im`
   - `http://localhost:5173` (로컬 테스트용)
3. **제품 설정 → 카카오 로그인** → 활성화 ON
   - Redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
     (Supabase 프로젝트 URL 뒤에 `/auth/v1/callback` — loca.im 이 아님에 주의)
4. **제품 설정 → 카카오 로그인 → 보안** → Client Secret 코드 생성 후 **활성화 상태 ON**
   (Supabase Kakao provider 가 secret 을 요구한다)
5. **제품 설정 → 카카오 로그인 → 동의항목**
   - 닉네임 / 프로필 사진: 필수 또는 선택 동의
   - **카카오계정(이메일)**: ⚠️ *필수 동의*로 설정하려면 비즈니스 앱 전환이 필요하다.
     선택 동의로 두면 사용자가 거부했을 때 **이메일 없는 계정**이 생성될 수 있으므로,
     실계정 왕복 테스트로 `auth.users.email` 이 채워지는지 반드시 확인할 것.
     (`handle_new_user()` 트리거(077)는 이메일이 없어도 닉네임 기반으로 slug 를 만들도록 되어 있다)
6. Supabase Dashboard → Authentication → Providers → **Kakao** 활성화
   - Client ID: 카카오 앱의 **REST API 키**
   - Client Secret: 위 4번에서 만든 값

#### 4-2. Google Cloud Console (https://console.cloud.google.com)

1. API 및 서비스 → **OAuth 동의 화면** → 외부(External) → 앱 게시
2. **사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID → 웹 애플리케이션**
   - 승인된 JavaScript 원본: `https://loca.im`
   - 승인된 리디렉션 URI: `https://<project-ref>.supabase.co/auth/v1/callback`
3. Supabase Dashboard → Authentication → Providers → **Google** 활성화
   - Client ID / Client Secret 입력

#### 4-3. 앱 쪽 확인 사항

- 간편 로그인 신규 가입자는 가입 폼을 거치지 않으므로 약관 동의를 **로그인 후 `ConsentGate`**(migration 073 RPC)가 받는다
- 공개 아이디(slug)는 `handle_new_user()` 트리거(migration 077)가 이메일/닉네임 기반으로 자동 배정한다
- 로그인 방식 계측(`view_logs.event_type = 'login'`)은 **migration 086** 적용 후에만 쌓인다
  (081 가드 트리거가 화이트리스트 밖 이벤트를 조용히 폐기한다)

### 5. 초대코드 등록 (B2B 테스트용 — 현재 앱 미사용)

SQL Editor에서:
```sql
INSERT INTO invitation_codes (code, label, max_uses)
VALUES ('YOUR-CODE-HERE', '파일럿 기관명', 100);
```

---

## 배포 후 확인 체크리스트

- [ ] 메인 페이지 로드 확인
- [ ] 로그인 (이메일/OAuth) 동작 확인
- [ ] 지도 생성 → 핀 추가 → 저장 확인
- [ ] `/s/slug` URL 접속 → 공유 뷰어 표시 확인
- [ ] 초대코드 입력 → 이벤트 지도 생성 확인
- [ ] Supabase Table Editor에서 `view_logs`에 데이터 쌓이는지 확인
- [ ] 사진 업로드 → Supabase Storage `media/photos/` 확인
