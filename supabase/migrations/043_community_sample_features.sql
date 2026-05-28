-- 043_community_sample_features.sql
-- 운영 모두의 지도에 사용자 테스트용 샘플 데이터를 안전하게 넣고 지울 수 있도록
-- map_features 행에 샘플 식별 메타데이터를 추가한다.

ALTER TABLE public.map_features
  ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sample_batch text,
  ADD COLUMN IF NOT EXISTS sample_key text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'map_features_sample_batch_required'
      AND conrelid = 'public.map_features'::regclass
  ) THEN
    ALTER TABLE public.map_features
      ADD CONSTRAINT map_features_sample_batch_required
      CHECK (is_sample = false OR sample_batch IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_map_features_sample_cleanup
  ON public.map_features (map_id, sample_batch)
  WHERE is_sample = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_map_features_sample_key
  ON public.map_features (map_id, sample_key)
  WHERE is_sample = true AND sample_key IS NOT NULL;

COMMENT ON COLUMN public.map_features.is_sample IS '운영 샘플/테스트 데이터 여부. 실제 사용자 기록과 분리해 정리하기 위한 플래그.';
COMMENT ON COLUMN public.map_features.sample_batch IS '샘플 데이터 묶음 이름. 배치별 정리/재삽입에 사용.';
COMMENT ON COLUMN public.map_features.sample_key IS '샘플 데이터의 안정적인 키. 같은 샘플의 중복 삽입 방지에 사용.';

NOTIFY pgrst, 'reload schema';
