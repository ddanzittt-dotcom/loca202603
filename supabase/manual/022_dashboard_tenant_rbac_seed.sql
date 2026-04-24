-- ============================================================
-- 022_dashboard_tenant_rbac 운영 계정/권한 시드 SQL (재실행 가능)
-- 실행 위치: Supabase SQL Editor
-- 목적: 전체 운영자 1명 + 기관 멤버(owner/editor/viewer) 초기 세팅
-- ============================================================

DO $$
DECLARE
  -- ===== 필수 입력값 =====
  -- ID 또는 이메일 중 하나를 채우세요(이메일 권장)
  v_platform_admin_id uuid := NULL;
  v_org_owner_id      uuid := NULL;
  v_platform_admin_email text := 'admin@naver.com';
  v_org_owner_email text := 'artraxa@naver.com';

  -- ===== 선택 입력값 (없으면 NULL 유지) =====
  v_org_editor_id     uuid := NULL;
  v_org_viewer_id     uuid := NULL;
  v_org_editor_email text := NULL;
  v_org_viewer_email text := NULL;

  -- ===== 생성/연결할 기관 정보 =====
  v_org_name text := '샘플 기관';
  v_org_slug text := 'sample-org';
  v_org_contact text := 'ops@example.com';

  -- ===== 기관에 묶을 지도 ID 배열 (없으면 빈 배열 유지) =====
  v_map_ids uuid[] := ARRAY[]::uuid[];

  v_org_id uuid;
  v_has_profiles_role boolean;
BEGIN
  -- 0) 입력값 해석 / 검증
  IF v_platform_admin_id IS NULL AND v_platform_admin_email IS NOT NULL THEN
    SELECT p.id
    INTO v_platform_admin_id
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE lower(u.email) = lower(v_platform_admin_email)
    LIMIT 1;
  END IF;

  IF v_org_owner_id IS NULL AND v_org_owner_email IS NOT NULL THEN
    SELECT p.id
    INTO v_org_owner_id
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE lower(u.email) = lower(v_org_owner_email)
    LIMIT 1;
  END IF;

  IF v_org_editor_id IS NULL AND v_org_editor_email IS NOT NULL THEN
    SELECT p.id
    INTO v_org_editor_id
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE lower(u.email) = lower(v_org_editor_email)
    LIMIT 1;
  END IF;

  IF v_org_viewer_id IS NULL AND v_org_viewer_email IS NOT NULL THEN
    SELECT p.id
    INTO v_org_viewer_id
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE lower(u.email) = lower(v_org_viewer_email)
    LIMIT 1;
  END IF;

  IF v_platform_admin_id IS NULL THEN
    RAISE EXCEPTION 'platform admin 계정을 찾지 못했습니다. v_platform_admin_email 또는 v_platform_admin_id를 확인하고, 해당 계정이 앱에 1회 로그인해 profiles가 생성되었는지 확인해주세요.';
  END IF;

  IF v_org_owner_id IS NULL THEN
    RAISE EXCEPTION 'org owner 계정을 찾지 못했습니다. v_org_owner_email 또는 v_org_owner_id를 확인하고, 해당 계정이 앱에 1회 로그인해 profiles가 생성되었는지 확인해주세요.';
  END IF;

  -- 1) 조직 생성 또는 재사용
  INSERT INTO public.organizations (name, slug, contact)
  VALUES (v_org_name, v_org_slug, v_org_contact)
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        contact = EXCLUDED.contact,
        updated_at = now()
  RETURNING id INTO v_org_id;

  IF v_org_id IS NULL THEN
    SELECT id INTO v_org_id
    FROM public.organizations
    WHERE slug = v_org_slug
    LIMIT 1;
  END IF;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'organization upsert 후 organization id를 찾지 못했습니다.';
  END IF;

  -- 2) 플랫폼 운영자 권한 부여
  UPDATE public.profiles
  SET
    dashboard_role = 'platform_admin',
    dashboard_enabled = true,
    updated_at = now()
  WHERE id = v_platform_admin_id;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'role'
  )
  INTO v_has_profiles_role;

  IF v_has_profiles_role THEN
    UPDATE public.profiles
    SET role = 'admin', updated_at = now()
    WHERE id = v_platform_admin_id;
  END IF;

  -- 3) 기관 운영자(owner) 권한 부여
  UPDATE public.profiles
  SET
    dashboard_role = 'org_manager',
    dashboard_enabled = true,
    updated_at = now()
  WHERE id = v_org_owner_id;

  INSERT INTO public.organization_members (
    organization_id,
    user_id,
    role,
    status,
    invited_by
  ) VALUES (
    v_org_id,
    v_org_owner_id,
    'owner',
    'active',
    v_platform_admin_id
  )
  ON CONFLICT (organization_id, user_id) DO UPDATE
  SET
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    invited_by = EXCLUDED.invited_by,
    updated_at = now();

  -- 4) 기관 편집자(editor) (옵션)
  IF v_org_editor_id IS NOT NULL THEN
    UPDATE public.profiles
    SET
      dashboard_role = 'org_manager',
      dashboard_enabled = true,
      updated_at = now()
    WHERE id = v_org_editor_id;

    INSERT INTO public.organization_members (
      organization_id,
      user_id,
      role,
      status,
      invited_by
    ) VALUES (
      v_org_id,
      v_org_editor_id,
      'editor',
      'active',
      v_org_owner_id
    )
    ON CONFLICT (organization_id, user_id) DO UPDATE
    SET
      role = EXCLUDED.role,
      status = EXCLUDED.status,
      invited_by = EXCLUDED.invited_by,
      updated_at = now();
  END IF;

  -- 5) 기관 뷰어(viewer) (옵션)
  IF v_org_viewer_id IS NOT NULL THEN
    UPDATE public.profiles
    SET
      dashboard_role = 'org_manager',
      dashboard_enabled = true,
      updated_at = now()
    WHERE id = v_org_viewer_id;

    INSERT INTO public.organization_members (
      organization_id,
      user_id,
      role,
      status,
      invited_by
    ) VALUES (
      v_org_id,
      v_org_viewer_id,
      'viewer',
      'active',
      v_org_owner_id
    )
    ON CONFLICT (organization_id, user_id) DO UPDATE
    SET
      role = EXCLUDED.role,
      status = EXCLUDED.status,
      invited_by = EXCLUDED.invited_by,
      updated_at = now();
  END IF;

  -- 6) 지정한 지도들을 기관에 연결 (옵션)
  IF array_length(v_map_ids, 1) IS NOT NULL THEN
    UPDATE public.maps
    SET
      organization_id = v_org_id,
      updated_at = now()
    WHERE id = ANY(v_map_ids);
  END IF;

  RAISE NOTICE '완료: org_id=%', v_org_id;
  RAISE NOTICE 'platform_admin=% / org_owner=% / org_editor=% / org_viewer=%',
    v_platform_admin_id, v_org_owner_id, v_org_editor_id, v_org_viewer_id;
END;
$$;

-- ------------------------------------------------------------
-- (옵션) 유료 사용자만 대시보드 접근 허용 시 예시
-- 특정 계정 접근 차단:
-- UPDATE public.profiles
-- SET dashboard_enabled = false, updated_at = now()
-- WHERE id = '차단할-user-uuid';
--
-- 대량 차단 예시(화이트리스트 제외):
-- UPDATE public.profiles
-- SET dashboard_enabled = false, updated_at = now()
-- WHERE id NOT IN (
--   'platform-admin-uuid',
--   'org-owner-uuid',
--   'org-editor-uuid',
--   'org-viewer-uuid'
-- );
-- ------------------------------------------------------------
