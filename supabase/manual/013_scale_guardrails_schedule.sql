-- ============================================================
-- Manual schedule setup for 013_scale_guardrails.sql
-- Run this after applying migration 013.
--
-- What it does:
--   1. Refreshes map_daily_metrics every hour for the last 30 days.
--   2. Prunes raw view_logs older than 180 days once a day.
--
-- Before enabling pruning, make sure long-term analytics export/backups are in place.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Avoid duplicate jobs when this file is run more than once.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN (
  'loca_refresh_map_daily_metrics_hourly',
  'loca_prune_old_view_logs_daily'
);

SELECT cron.schedule(
  'loca_refresh_map_daily_metrics_hourly',
  '17 * * * *',
  $$
    SELECT public.refresh_map_daily_metrics(CURRENT_DATE - 30, CURRENT_DATE);
  $$
);

-- Keep raw logs for 180 days. Adjust the interval if your analytics policy changes.
SELECT cron.schedule(
  'loca_prune_old_view_logs_daily',
  '43 3 * * *',
  $$
    SELECT public.prune_old_view_logs(now() - INTERVAL '180 days');
  $$
);

-- Check active jobs:
-- SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid;
