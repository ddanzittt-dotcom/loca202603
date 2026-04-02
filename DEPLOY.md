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

**주의:** `VITE_` 접두사가 있어야 클라이언트에서 접근 가능합니다. anon key는 공개 키이므로 노출되어도 괜찮습니다 (RLS가 보안 담당).

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

1. **도메인 추가**: `loca.your-domain.com` 입력
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

### 3. 배포

```bash
# 프로덕션 배포
netlify deploy --prod

# 프리뷰 배포
netlify deploy
```

### 4. 커스텀 도메인 연결

Netlify Dashboard → Site → Domain management → Add custom domain:

1. **도메인 추가**: `loca.your-domain.com` 입력
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
- Site URL: `https://your-domain.com`
- Redirect URLs에 추가:
  - `https://your-domain.com`
  - `https://your-domain.com/**`
  - (프리뷰용) `https://*.vercel.app` 또는 `https://*.netlify.app`

### 4. 초대코드 등록 (B2B 테스트용)

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
