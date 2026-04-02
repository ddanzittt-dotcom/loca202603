-- ============================================================
-- Migration 005: 기관(Organization) 관리
-- 슈퍼 관리자가 모든 기관의 지도/대시보드를 관리하는 구조.
-- ============================================================

-- 1) profiles.role 추가 (admin = 슈퍼 관리자, user = 일반)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'admin'));

-- 2) organizations 테이블
CREATE TABLE IF NOT EXISTS organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE,
  contact     TEXT,
  dashboard_config JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER set_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3) maps.organization_id (nullable — 기존 개인 지도는 null)
ALTER TABLE maps
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_maps_organization_id ON maps(organization_id);

-- 4) RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- 관리자는 모든 기관 조회/수정 가능
CREATE POLICY organizations_select_admin ON organizations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY organizations_insert_admin ON organizations
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY organizations_update_admin ON organizations
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY organizations_delete_admin ON organizations
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 5) 관리자가 모든 지도를 조회할 수 있도록 maps SELECT 정책 추가
CREATE POLICY maps_select_admin ON maps
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
