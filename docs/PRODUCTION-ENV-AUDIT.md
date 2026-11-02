# Production environment audit: names only (2026-11-01)

Built from every `process.env.*` read in `api/` and every `import.meta.env.VITE_*` read in `src/` on
`portal-work`. Production's actual Vercel variable list has **not** been seen (no CLI login, no dashboard
access from this session). Compare it in Vercel → Project → Settings → Environment Variables →
Production, reading **names only**. Never reveal or copy a value.

Every risky flag below is **off unless its value is exactly `"true"`** (or `"1"` where noted), so a
missing variable is always the safe state.

## A. Must be present for the pilot

| Name | Used by | Note |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | web bundle and API | already in production (the app works today) |
| `SUPABASE_SERVICE_ROLE_KEY` (or legacy `SUPABASE_SERVICE_KEY`) | API | already present; server only |
| `SUBMISSION_SALT` | `/api/submit`, AI counters | **must exist before 0058** |
| `SITE_REVALIDATE_SECRET` | `api/_siteRevalidate.js` | **new**; server only, never a `VITE_` copy; before 0088 |
| `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY` | billing | keep; pilot companies are invoiced by hand, but the webhook must verify |
| `MESSAGES_INBOUND_SECRET`, `POSTMARK_SERVER_TOKEN`, `POSTMARK_INBOUND_HASH`, `MESSAGES_FROM_EMAIL` | messaging email | keep unchanged |
| `OPENAI_API_KEY` (and/or `ANTHROPIC_API_KEY`) | Mine IQ and AI drafting | already present if Mine IQ works in production today |
| `NEWS_PULL_SECRET`, `CRON_SECRET`, `EODHD_API_KEY`, `JINA_API_KEY`, `NEWS_PROXY_URL` | existing news crons (`api/_news.js` and `api/_cronAuth.js` check `CRON_SECRET`) | existing behaviour; unchanged by the pilot. `/api/dispatch` also accepts `CRON_SECRET`, but `vercel.json` schedules no dispatch cron |
| `CONTACT_TO`, `CONFERENCE_INQUIRY_TO` | public forms | existing |
| `DISPATCH_SECRET` | publish, unpublish, revise and Ops replay nudge `/api/dispatch` with it | **required for the pilot**: unset, publishing never runs the feed, timeline, Mine IQ facts or website projections (no cron drains them). Confirm the name exists; keep its value |

## B. Must be ABSENT (or not "true") in production

| Name | Why |
|---|---|
| `MINEEX_ENV` | `staging` turns on the egress guard and makes the website revalidate a mock |
| `STAGING_CRON_SECRET`, `STAGING_EGRESS_LOG`, `STAGING_SELF_HOSTS` | staging-only |
| `PUSH_ENABLED` | `news-push-send` sends nothing unless `"true"`; push stays off for the pilot (0055 deferred). **Never switch it on without first clearing `notification_outbox`:** `news-notify` keeps queuing follower pushes as pending, and the first run would send the oldest 200 per hour, possibly weeks-old news (procedure in docs/PILOT-DISABLED-DELIVERY.md) |
| `VITE_ANDROID_PUSH_ENABLED` | Android push registration only when `"true"` |
| `NEWS_AUTOCREATE_ENABLED`, `NEWS_AUTO_APPROVE_ENABLED` | news auto-create / auto-approve only when `"true"`; if set today, that is existing behaviour, but confirm it is intended |
| `VITE_NEWS_FIXTURES`, `VITE_STUDIO_MOCK` | dev fixtures / mock extraction (`"1"`) |
| `VITE_STUDIO_API_BASE` | dev-only Studio API override |
| any `VITE_*REVALIDATE*` | would put the revalidate secret in the browser bundle (`check:s2-revalidate-bundle` refuses it) |
| `DISPATCH_HEALTH_TOKEN`, `DELIVERY_EPOCH` | Phase 6 (scheduled delivery) only; not for the pilot |

## C. Optional, safe defaults (set only to override)

`AI_MODEL*`, `ANTHROPIC_MODEL*`, `TEXT_MODEL`, `COMMS_MODEL`, `BATCH_MODEL`, `STUDIO_EXTRACT_MODEL`,
`AI_TIMEOUT_MS`, `AI_USER_DAILY_CAP`, `AI_COMPANY_DAILY_CAP`, `AI_CALLS_PER_WINDOW`, `AI_DAILY_USD_LIMIT`,
`AI_PRICING_VERIFIED` (`"1"`), `DISPATCH_BUDGET_MS`, `NEWS_CRON_PROCESS_LIMIT`, `NEWS_CHAIN_LIMIT`,
`PUBLIC_BASE_URL`, `PUBLIC_APP_URL`, `OPS_ALERT_TO`, `STRIPE_PRICE_BASIC`, `STRIPE_PRICE_PRO`,
`VITE_GOOGLE_WEB_CLIENT_ID`.

Spend and kill switches, off by default: `AI_PAID_ENABLED` (website builder; no paid AI unless `"true"`),
`AI_VISION_ENABLED` (`"true"`), `AI_ENDPOINTS_DISABLED` (`"true"` disables AI endpoints).

`FCM_*` and `APNS_*` are push
credentials; harmless while `PUSH_ENABLED` is off. `VERCEL_URL` and `VERCEL_REGION` are set by Vercel.

## D. No longer read (remove only after Phase 1 is confirmed)

`MINEEX_BRIEF_API_KEY`, `MINEEX_BRIEF_MODEL`.

## E. Production as seen in Vercel (names only, 2026-11-01, from the user's screenshots)

- Present for Production: `SUBMISSION_SALT`, `DISPATCH_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`,
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_BASIC`, `STRIPE_PRICE_PRO`, `POSTMARK_SERVER_TOKEN` (Vercel shows
  "Needs Attention"), `MESSAGES_FROM_EMAIL`, `CRON_SECRET`, `NEWS_PULL_SECRET`, `JINA_API_KEY`,
  `NEWS_CRON_PROCESS_LIMIT`, `NEWS_CHAIN_LIMIT`, `AI_PAID_ENABLED`, `AI_DAILY_USD_LIMIT`,
  `NEWS_AUTOCREATE_ENABLED`, `NEWS_AUTO_APPROVE_ENABLED`, `FCM_*`, `APNS_*`.
- Absent, as required: `MINEEX_ENV`, `STAGING_*`, any secret `VITE_*`. `PUSH_ENABLED` exists for Preview only.
- To add: `SITE_REVALIDATE_SECRET`.
- Absent, acceptable for the pilot: `POSTMARK_INBOUND_HASH` (investor messages are not emailed to the company;
  they appear in the portal inbox), `MESSAGES_INBOUND_SECRET` (inbound email replies refused with 503, fail
  closed), `CONTACT_TO` / `CONFERENCE_INQUIRY_TO` (default support@mineex.ca), `EODHD_API_KEY` (manual
  market pull only), `NEWS_PROXY_URL`.
- Values unknown, existing behaviour, confirm intended: `AI_PAID_ENABLED` (website builder paid AI, capped by
  `AI_DAILY_USD_LIMIT`), `NEWS_AUTOCREATE_ENABLED`, `NEWS_AUTO_APPROVE_ENABLED`.
- Preview scope holds production `SUPABASE_SERVICE_ROLE_KEY`, `DISPATCH_SECRET`, Supabase URL and anon key:
  turn preview builds off before any push (checklist 3b).
