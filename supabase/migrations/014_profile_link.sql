-- 014: profiles 테이블에 link 컬럼 추가
-- 프로필 편집에서 개인 링크(웹사이트, SNS 등)를 저장하기 위함

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS link TEXT;

-- 적용 주의사항:
-- 1. Supabase SQL Editor에서 이 파일을 실행
-- 2. 기존 데이터에 영향 없음 (nullable, 기본값 없음)
-- 3. RLS 정책 변경 불필요 (기존 UPDATE 정책이 모든 컬럼 커버)
