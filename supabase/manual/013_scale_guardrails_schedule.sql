-- ============================================================
-- Manual schedule setup for view_logs retention (from migration 013).
-- Run this ONCE in the Supabase SQL Editor. It is not applied automatically.
--
-- What it does:
--   - Prunes raw view_logs older than 180 days, once a day.
--
-- Why refresh_map_daily_metrics is NOT scheduled here anymore (2026-07):
--   - That helper reads public.event_checkins / survey_responses, which were
--     dropped in the B2C transition (see migrations/049_gamification_teardown.sql).
--     Scheduling it would fail every hour with "relation does not exist".
--   - map_daily_metrics is also unused by the current app (no src reference),
--     so the hourly rollup has no consumer. Re-add a B2C-safe rollup later if a
--     dashboard needs pre-aggregation.
--   - The unschedule block below also removes any refresh job left over from a
--     previous run of the old version of this file.
--
-- Before enabling pruning, make sure long-term analytics export/backups are in
-- place — this permanently deletes raw rows older than 180 days.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Avoid duplicate jobs when this file is run more than once, and drop the
-- retired hourly rollup job if it was scheduled by an earlier version.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN (
  'loca_refresh_map_daily_metrics_hourly',
  'loca_prune_old_view_logs_daily'
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
-- One-off manual prune (optional, before scheduling): SELECT public.prune_old_view_logs(now() - INTERVAL '180 days');
