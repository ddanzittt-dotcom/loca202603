-- ============================================================
-- Verification queries for 013_scale_guardrails.sql scheduling
-- Run in Supabase SQL Editor after 013_scale_guardrails_schedule.sql.
-- ============================================================

-- 1) Confirm pg_cron jobs are active.
SELECT
  jobid,
  jobname,
  schedule,
  active,
  command
FROM cron.job
WHERE jobname IN (
  'loca_refresh_map_daily_metrics_hourly',
  'loca_prune_old_view_logs_daily'
)
ORDER BY jobname;

-- Expected:
--   loca_refresh_map_daily_metrics_hourly | 17 * * * * | active = true
--   loca_prune_old_view_logs_daily        | 43 3 * * * | active = true

-- 2) Confirm functions exist.
SELECT
  proname AS function_name,
  pg_get_function_identity_arguments(oid) AS arguments
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('refresh_map_daily_metrics', 'prune_old_view_logs')
ORDER BY proname;

-- 3) Smoke test the metrics refresh manually.
SELECT public.refresh_map_daily_metrics(CURRENT_DATE - 1, CURRENT_DATE) AS refreshed_rows;

-- 4) Confirm summary table is readable and populated when published maps exist.
SELECT
  COUNT(*) AS total_metric_rows,
  MAX(updated_at) AS last_refreshed_at
FROM public.map_daily_metrics;

-- 5) Confirm raw log pruning is configured but do not delete anything here.
-- Use this as a dry-run count before changing the retention window.
SELECT COUNT(*) AS logs_older_than_180_days
FROM public.view_logs
WHERE created_at < now() - INTERVAL '180 days';
