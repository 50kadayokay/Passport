-- ai_usage_review.sql — How much AI do real users and companies use?
--
-- READ-ONLY. Aggregate counts from the AI throttle counters, publications and
-- news_ai_usage. No user identity (keys are salted hashes), no writes, no locks.
--
-- Purpose: size the AI limits before Batch C reaches production
-- (docs/REMEDIATION-PLAN.md §9). Run in the PRODUCTION SQL editor by a person;
-- it only SELECTs. scripts/audit-sql-readonly-check.mjs verifies that mechanically.
--
-- WHERE THE DATA COMES FROM
--   public.submission_throttle -- the AI guard's own counters (0057). Since the guard
--     went live on structure-release, synthesize-profile and audience-card it has
--     written one row per (key, form, window):
--       form 'ai:<endpoint>'   key = sha256(salt + user id)   window = 10 minutes
--       form 'ai:company'      key = 'co:<company uuid>'      window = 1 day (UTC)
--       form 'ai:user-day'     key = 'ud:<user hash>'         window = 1 day  (only after Batch C)
--     User keys are salted hashes: this shows usage SHAPES, never who.
--   public.news_ai_usage -- per-call tokens and cost of the news pipeline (separate budget).
--
-- CAVEATS
--   * Only the three routes that already used the guard are counted before
--     Batch C. compose, comms-generate, the extractors and Story Studio had NO
--     counters, so their real volume is not here; see query 5 for a proxy.
--   * Rows older than a day are removed if prune_submission_throttle() is ever
--     run (query 1 shows how far back the data actually goes).

-- 1. How much history is there?
select form, count(*) as rows, min(window_start) as oldest, max(window_start) as newest
from public.submission_throttle
where form like 'ai:%'
group by form
order by form;

-- 2. Per-company daily AI calls (guarded routes): distribution.
select
  count(*)                                                        as company_days,
  max(count)                                                      as max_calls_per_company_day,
  percentile_disc(0.95) within group (order by count)             as p95,
  percentile_disc(0.50) within group (order by count)             as median
from public.submission_throttle
where form = 'ai:company';

-- 3. The busiest company-days (company uuid shown; no user identity).
select substring(ip_hash from 4) as company_id, window_start::date as day, count as calls
from public.submission_throttle
where form = 'ai:company'
order by count desc
limit 20;

-- 4. Per-user burst: calls in a 10-minute window, per endpoint.
select form as endpoint,
       count(*)                                            as user_windows,
       max(count)                                          as max_calls_in_10_min,
       percentile_disc(0.99) within group (order by count) as p99,
       percentile_disc(0.95) within group (order by count) as p95
from public.submission_throttle
where form like 'ai:%' and form not in ('ai:company', 'ai:user-day')
group by form
order by max_calls_in_10_min desc;

-- 5. Proxy for the routes that had NO counters: AI-produced artefacts per company
--    per day (release revisions, publications), as a rough upper bound on drafting.
select p.company_id, p.created_at::date as day, count(*) as publications
from public.publications p
where p.created_at > now() - interval '90 days'
group by p.company_id, p.created_at::date
order by publications desc
limit 20;

-- 6. News pipeline spend per day (its own budget, AI_DAILY_USD_LIMIT).
select created_at::date as day, count(*) as calls,
       sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens
from public.news_ai_usage
where created_at > now() - interval '60 days'
group by created_at::date
order by day desc
limit 60;
