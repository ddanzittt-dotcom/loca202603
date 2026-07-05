-- ============================================================
-- Migration 051: 협업 권한 status 검증 + 작성자(created_by) 위조 방지 (보안 하드닝)
--
-- 보안 리뷰(2026-07-05)에서 발견된 항목 수정:
--   [HIGH #1] 수락하지 않은(pending)·거절된(rejected) 협업 초대자가 비공개 지도의
--             피처를 읽고 쓸 수 있음 — is_map_collaborator() 가 status 를 확인하지 않아서.
--   [MED  #4] 지도 소속 피처 INSERT 시 클라이언트가 보낸 created_by 를 그대로 저장 →
--             작성자 사칭. (앱 코드에서 이미 created_by=auth.uid() 강제했고, 여기서 RLS
--             레벨 방어를 추가한다 — 이중 방어.)
--
-- 적용 주의사항:
--   1. 050 이후 실행 (신규 번호 051).
--   2. DDL만 있고 백필 없음 — 잠금 경합 시 문장 단위로 실행.
--   3. 적용 후 확인: 수락 전 초대자로 로그인 → 비공개 지도 피처가 안 보여야 정상.
--
-- 남은 항목(별도 후속):
--   [MED #5] 변경요청 승인 RPC(026_resolve_feature_change_request_tx)가 요청 payload 의
--            createdBy 를 그대로 복사 → 승인 시 사칭. SECURITY DEFINER 라 RLS 를 우회하므로
--            함수 본문에서 payload->>'createdBy' 를 무시하고 requested_by 를 쓰도록 별도 패치 필요.
-- ============================================================

-- ------------------------------------------------------------
-- 1. [HIGH #1] 협업자 판정에 status='accepted' 요구
--    이 헬퍼를 쓰는 모든 정책(maps_select_collaborator,
--    features_insert/update/delete_collaborator)이 한 번에 정상화된다.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_map_collaborator(p_map_id uuid, p_role text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.map_collaborators c
    WHERE c.map_id = p_map_id
      AND c.user_id = auth.uid()
      AND c.status = 'accepted'
      AND (p_role IS NULL OR c.role = p_role)
  );
$$;

-- ------------------------------------------------------------
-- 2. [HIGH #1] 019 의 raw-join SELECT 정책(status 무시)을 status 인지 헬퍼 기반으로 교체
--    (021 은 insert/update/delete_collaborator 만 헬퍼로 재작성했고 SELECT 는 019 원본이 남아 있었음)
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "features_select_collaborator" ON public.map_features;
CREATE POLICY "features_select_collaborator"
  ON public.map_features
  FOR SELECT
  USING (
    public.is_map_collaborator(map_id, NULL)
  );

-- ------------------------------------------------------------
-- 3. [MED #4] 작성자 위조 방지 — INSERT 시 created_by 는 반드시 본인이어야
--    (앱 코드의 서버 강제와 이중 방어. SECURITY DEFINER RPC 는 RLS 를 우회하므로 영향 없음)
-- ------------------------------------------------------------

-- 소유자 INSERT: 자기 지도 + 자기 작성으로만
DROP POLICY IF EXISTS "features_insert_owner" ON public.map_features;
CREATE POLICY "features_insert_owner"
  ON public.map_features
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.maps
      WHERE maps.id = map_features.map_id
        AND maps.user_id = auth.uid()
    )
    AND created_by = auth.uid()
  );

-- 편집 협업자 INSERT: 수락된 editor + 자기 작성으로만
DROP POLICY IF EXISTS "features_insert_collaborator" ON public.map_features;
CREATE POLICY "features_insert_collaborator"
  ON public.map_features
  FOR INSERT
  WITH CHECK (
    public.is_map_collaborator(map_id, 'editor')
    AND created_by = auth.uid()
  );

-- 개인지도 편집 참여자 INSERT: can_edit(수락된 editor) + 자기 작성으로만
--   (can_edit_personal_map_features 는 이미 status='accepted' 를 확인하므로 #1 과 무관.
--    여기서는 #4 작성자 위조 방지만 추가)
DROP POLICY IF EXISTS "features_insert_personal_editor" ON public.map_features;
CREATE POLICY "features_insert_personal_editor"
  ON public.map_features
  FOR INSERT
  WITH CHECK (
    public.can_edit_personal_map_features(map_id)
    AND created_by = auth.uid()
  );

NOTIFY pgrst, 'reload schema';
