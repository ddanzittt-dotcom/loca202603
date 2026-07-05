// ============================================================
// Migration 050 러너 — SQL Editor 우회용 (직접 연결)
//
// SQL Editor 는 api.supabase.com(장애 계층)을 경유하지만
// 이 스크립트는 Postgres 에 직접 연결(5432)해서 그 계층을 건너뛴다.
// 각 문장을 "하나씩" lock_timeout/statement_timeout 을 걸고 실행하므로
// 데드락(40P01)·장시간 잠금 없이 안전하게 진행된다.
//
// 사용법 (loca202603 디렉터리에서):
//   1) Supabase Dashboard → 우측 상단 "Connect" → "Direct connection" 탭
//      → URI 복사 (postgresql://postgres:[PW]@db.xxxx.supabase.co:5432/postgres)
//      ※ [PW] 자리에 DB 비밀번호가 들어간 실제 URI 여야 함
//   2) 실행:
//        PG_URL="붙여넣은_URI" node scripts/run-migration-050.mjs
//      (PowerShell 이면: $env:PG_URL="URI"; node scripts/run-migration-050.mjs)
//   3) 중간에 실패해도 다시 그냥 재실행하면 됨(모든 문장 idempotent).
// ============================================================

import pg from "pg"

const { Client } = pg

const PG_URL = process.env.PG_URL || process.argv[2]
if (!PG_URL) {
  console.error("✗ PG_URL 이 필요합니다. (Direct connection URI)")
  console.error('  예: PG_URL="postgresql://postgres:PW@db.xxxx.supabase.co:5432/postgres" node scripts/run-migration-050.mjs')
  process.exit(1)
}

// 순서대로 실행할 문장들 — 라벨/SQL/타임아웃(초)
const STEPS = [
  ["① map_id nullable",
    `ALTER TABLE public.map_features ALTER COLUMN map_id DROP NOT NULL;`, 20],

  ["② 기존 FK 제거",
    `ALTER TABLE public.map_features DROP CONSTRAINT IF EXISTS map_features_map_id_fkey;`, 20],

  ["③ 새 FK 추가 (NOT VALID)",
    `ALTER TABLE public.map_features
       ADD CONSTRAINT map_features_map_id_fkey
       FOREIGN KEY (map_id) REFERENCES public.maps(id) ON DELETE SET NULL NOT VALID;`, 20],

  ["④ FK 검증",
    `ALTER TABLE public.map_features VALIDATE CONSTRAINT map_features_map_id_fkey;`, 120],

  ["⑤ 작성자 백필",
    `UPDATE public.map_features f
       SET created_by = m.user_id
       FROM public.maps m
       WHERE f.map_id = m.id AND f.created_by IS NULL;`, 120],

  ["⑤ created_by 인덱스",
    `CREATE INDEX IF NOT EXISTS idx_map_features_created_by
       ON public.map_features(created_by);`, 120],

  ["⑥ placements 테이블",
    `CREATE TABLE IF NOT EXISTS public.map_feature_placements (
       id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       map_id      uuid NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
       feature_id  uuid NOT NULL REFERENCES public.map_features(id) ON DELETE CASCADE,
       sort_order  integer NOT NULL DEFAULT 0,
       added_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
       created_at  timestamptz NOT NULL DEFAULT now(),
       UNIQUE (map_id, feature_id)
     );`, 30],

  ["⑥ mfp 인덱스(map)",
    `CREATE INDEX IF NOT EXISTS idx_mfp_map ON public.map_feature_placements(map_id, sort_order);`, 60],

  ["⑥ mfp 인덱스(feature)",
    `CREATE INDEX IF NOT EXISTS idx_mfp_feature ON public.map_feature_placements(feature_id);`, 60],

  ["⑥ placements 백필",
    `INSERT INTO public.map_feature_placements (map_id, feature_id, sort_order, added_by)
       SELECT f.map_id, f.id, COALESCE(f.sort_order, 0), f.created_by
       FROM public.map_features f
       WHERE f.map_id IS NOT NULL
       ON CONFLICT (map_id, feature_id) DO NOTHING;`, 120],

  ["⑦ RLS enable (placements)",
    `ALTER TABLE public.map_feature_placements ENABLE ROW LEVEL SECURITY;`, 30],

  ["⑦ policy: mfp_select_viewable",
    `DROP POLICY IF EXISTS "mfp_select_viewable" ON public.map_feature_placements;
     CREATE POLICY "mfp_select_viewable"
       ON public.map_feature_placements FOR SELECT TO anon, authenticated
       USING (
         EXISTS (
           SELECT 1 FROM public.maps m
           WHERE m.id = map_id
             AND (
               m.visibility IN ('public', 'unlisted')
               OR m.user_id = auth.uid()
               OR EXISTS (
                 SELECT 1 FROM public.map_collaborators c
                 WHERE c.map_id = m.id AND c.user_id = auth.uid() AND c.status = 'accepted'
               )
             )
         )
       );`, 30],

  ["⑦ policy: mfp_insert_editor",
    `DROP POLICY IF EXISTS "mfp_insert_editor" ON public.map_feature_placements;
     CREATE POLICY "mfp_insert_editor"
       ON public.map_feature_placements FOR INSERT TO authenticated
       WITH CHECK (
         (
           public.is_map_owner(map_id)
           OR EXISTS (
             SELECT 1 FROM public.map_collaborators c
             WHERE c.map_id = map_feature_placements.map_id
               AND c.user_id = auth.uid() AND c.role = 'editor' AND c.status = 'accepted'
           )
         )
         AND (
           public.is_map_owner(map_id)
           OR EXISTS (
             SELECT 1 FROM public.map_features f
             WHERE f.id = feature_id AND f.created_by = auth.uid()
           )
         )
       );`, 30],

  ["⑦ policy: mfp_update_owner",
    `DROP POLICY IF EXISTS "mfp_update_owner" ON public.map_feature_placements;
     CREATE POLICY "mfp_update_owner"
       ON public.map_feature_placements FOR UPDATE TO authenticated
       USING (public.is_map_owner(map_id))
       WITH CHECK (public.is_map_owner(map_id));`, 30],

  ["⑦ policy: mfp_delete_policy",
    `DROP POLICY IF EXISTS "mfp_delete_policy" ON public.map_feature_placements;
     CREATE POLICY "mfp_delete_policy"
       ON public.map_feature_placements FOR DELETE TO authenticated
       USING (
         public.is_map_owner(map_id)
         OR EXISTS (
           SELECT 1 FROM public.map_features f
           WHERE f.id = feature_id AND f.created_by = auth.uid()
         )
       );`, 30],

  ["⑦ grants (placements)",
    `GRANT SELECT ON public.map_feature_placements TO anon;
     GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_feature_placements TO authenticated;
     GRANT ALL ON public.map_feature_placements TO service_role;`, 30],

  ["⑦ policy: features_select_own",
    `DROP POLICY IF EXISTS "features_select_own" ON public.map_features;
     CREATE POLICY "features_select_own"
       ON public.map_features FOR SELECT TO authenticated
       USING (created_by = auth.uid());`, 30],

  ["⑦ policy: features_insert_own_mapless",
    `DROP POLICY IF EXISTS "features_insert_own_mapless" ON public.map_features;
     CREATE POLICY "features_insert_own_mapless"
       ON public.map_features FOR INSERT TO authenticated
       WITH CHECK (map_id IS NULL AND created_by = auth.uid());`, 30],

  ["⑦ policy: features_update_own",
    `DROP POLICY IF EXISTS "features_update_own" ON public.map_features;
     CREATE POLICY "features_update_own"
       ON public.map_features FOR UPDATE TO authenticated
       USING (created_by = auth.uid())
       WITH CHECK (created_by = auth.uid());`, 30],

  ["⑦ policy: features_delete_own",
    `DROP POLICY IF EXISTS "features_delete_own" ON public.map_features;
     CREATE POLICY "features_delete_own"
       ON public.map_features FOR DELETE TO authenticated
       USING (created_by = auth.uid());`, 30],

  ["⑦ reload schema",
    `NOTIFY pgrst, 'reload schema';`, 15],
]

const VERIFY = `
  SELECT
    (SELECT count(*) FROM public.map_features WHERE map_id IS NOT NULL) AS features_with_map,
    (SELECT count(*) FROM public.map_feature_placements) AS placements,
    (SELECT count(*) FROM public.map_features WHERE created_by IS NULL) AS ownerless;
`

async function main() {
  const client = new Client({
    connectionString: PG_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  })

  console.log("→ 직접 연결 시도 중…")
  await client.connect()
  console.log("✓ 연결됨\n")

  for (const [label, sql, timeoutSec] of STEPS) {
    process.stdout.write(`${label} … `)
    try {
      await client.query(`SET lock_timeout = '5s'; SET statement_timeout = '${timeoutSec}s';`)
      await client.query(sql)
      console.log("OK")
    } catch (err) {
      console.log("실패")
      console.error(`\n✗ [${label}] 에서 멈춤:`)
      console.error(`  ${err.code || ""} ${err.message}`)
      console.error("\n  → 이 라벨만 알려주세요. 여기부터 이어서 하면 됩니다.")
      await client.end()
      process.exit(1)
    }
  }

  console.log("\n→ 검증 쿼리 실행…")
  const { rows } = await client.query(VERIFY)
  const r = rows[0]
  console.log("\n════════ 검증 결과 ════════")
  console.log(`  features_with_map : ${r.features_with_map}`)
  console.log(`  placements        : ${r.placements}`)
  console.log(`  ownerless         : ${r.ownerless}`)
  console.log("═══════════════════════════")
  const ok = String(r.features_with_map) === String(r.placements) && String(r.ownerless) === "0"
  console.log(ok
    ? "\n✓ 정상 (features_with_map = placements, ownerless = 0) — 배포 가능!"
    : "\n⚠ 숫자가 기준과 다릅니다. 위 3개 숫자를 그대로 알려주세요.")

  await client.end()
}

main().catch((err) => {
  console.error("\n✗ 연결/실행 오류:", err.message)
  console.error("  DB가 아직 응답하지 않으면 (connection timeout) 잠시 후 다시 실행하세요.")
  process.exit(1)
})
