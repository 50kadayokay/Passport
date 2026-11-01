# Pilot: scheduled delivery, outbox drain and push stay disabled

S2, 2026-11-01. This is an offline proof from the repo at the commit that adds this file. It checks the
code that will be deployed, not production's live environment; the environment items are marked
**[env]** and are confirmed by you in Vercel.

Every row below is checked by `npm run check:s2-pilot-disabled`
(`scripts/pilot-disabled-test.mjs`, in `npm test`). The test fails in two cases:
- a cited line no longer holds the quoted text, so the evidence has moved and this page needs
  updating;
- any of the structural checks at the end changes.

## Checklist

| # | Claim | Evidence | Quoted text at that line |
|---|---|---|---|
| 1 | Vercel Cron schedules only the four news jobs. | `vercel.json:36` | `"crons": [` |
| 1a | | `vercel.json:37` | `{ "path": "/api/news-pull", "schedule": "0 */3 * * *" },` |
| 1b | | `vercel.json:38` | `{ "path": "/api/news-process", "schedule": "30 */6 * * *" },` |
| 1c | | `vercel.json:39` | `{ "path": "/api/news-notify", "schedule": "45 */6 * * *" },` |
| 1d | | `vercel.json:40` | `{ "path": "/api/news-push-send", "schedule": "20 * * * *" }` |
| 2 | No scheduled GET can run the dispatcher: a GET authenticates only with the cron bearer, and no cron points at `/api/dispatch`. | `api/dispatch.js:119` | `if (!isTrustedCron(req)) return res.status(401).json({ error: "unauthorized" });` |
| 3 | A POST runs the dispatcher only with `x-dispatch-secret` (or is the platform-admin backfill of one publication). | `api/dispatch.js:125` | `if (!checkDispatchSecret(req)) return res.status(401).json({ error: "unauthorized" });` |
| 3a | | `api/dispatch.js:124` | `if (body.action === "backfill" && !req.headers["x-dispatch-secret"]) return backfill(req, res);` |
| 4 | The only in-app callers are the best-effort nudges: publish, unpublish, revise, and an admin replay in Ops. | `api/publish.js:116` | `await invokeDispatchBestEffort();` |
| 4a | | `api/unpublish.js:53` | `await invokeDispatchBestEffort();` |
| 4b | | `api/revise-release.js:126` | `await invokeDispatchBestEffort();` |
| 4c | | `api/ops.js:225` | `const nudge = await invokeDispatchBestEffort();` |
| 5 | A nudge is skipped when `DISPATCH_SECRET` is unset **[env]**, and it never waits more than 1.5 s or fails the publish. | `api/_service.js:136` | `if (!secret) return { dispatched: false, reason: "DISPATCH_SECRET not set" };` |
| 5a | | `api/_service.js:141` | `signal: AbortSignal.timeout(1500),` |
| 6 | The database schedules nothing. `outbox-drain` (pg_cron and pg_net) exists only in 0011, which is deferred; production audit Q15 found pg_cron absent. | `scripts/_migration-manifest.mjs:13` | `"0011_outbox_ops.sql":` |
| 6a | | `docs/PRODUCTION-ROLLOUT-PLAN.md` (Cron state) | `The audit (Q15) found it absent in production.` |
| 7 | Publications never queue a device push: the only subscription for `device_push_v1` is 0055, which is deferred. | `supabase/migrations/0055_enable_device_push.sql:26` | `('device_push_v1', 'PUBLICATION_PUBLISHED')` |
| 7a | | `scripts/_migration-manifest.mjs:24` | `"0055_enable_device_push.sql":` |
| 8 | The push sender delivers only when `PUSH_ENABLED` is exactly `true` **[env]**. | `api/news-push-send.js:96` | `return String(process.env.PUSH_ENABLED \|\| "") === "true";` |
| 8a | Otherwise it only reads the queue and returns a preview; it opens no provider connection. | `api/news-push-send.js:113` | `if (!pushEnabled()) {` |
| 9 | The news fan-out queues follower pushes whatever `PUSH_ENABLED` says (rows wait as `pending`). | `api/news-notify.js:92` | `await serviceRest("notification_outbox?on_conflict=news_item_id,user_id,token", {` |
| 10 | The claim has no age limit: the oldest pending rows go first. | `supabase/migrations/0041_outbox_claim_lease.sql:95` | `order by o.created_at asc` |
| 11 | 0088's listeners start at the moment they subscribe, so a later drain never replays history. | `supabase/migrations/0088_content_fanout.sql:125` | `insert into public.listener_subscriptions (listener, event_type, active_from)` |

The structural checks run in the same test:
- `vercel.json` has exactly those four cron paths, and none is `/api/dispatch`.
- No PENDING migration creates `pg_cron` or `pg_net`, or calls `cron.schedule` or `net.http_*` (comments ignored).
- 0011 and 0055 are DEFERRED, not PENDING.
- `invokeDispatchBestEffort` has exactly those four callers.
- No provider call (`http2.connect`, `fcmSendOne`, `claim_notification_outbox`) comes before the `PUSH_ENABLED` branch.
- `device_push_v1` is subscribed only by 0055, and `site_content_v1` and `conference_content_v1` only by 0088 (with `active_from`).
- The rollout plan still lists `PUSH_ENABLED=true` as must-not-set.

## What actually runs in the pilot

- **Scheduled:** only the four news jobs (row 1). Nothing schedules the dispatcher, and production has no pg_cron or pg_net (row 6).
- **Dispatcher:** runs only when invoked:
  - **Publish, unpublish, revise:** each fires one best-effort nudge (rows 4 and 5) if `DISPATCH_SECRET` is set **[env]** and a base URL is known (`PUBLIC_BASE_URL`, else Vercel's own `VERCEL_URL`). One run has a 40 s budget and drains whatever is claimable for every subscribed listener. That includes the existing `feed_projection_v1`, `in_app_notifications_v1`, `mineiq_facts_v1` and `profile_timeline_v1`, and after 0088 `site_content_v1` and `conference_content_v1`.
  - **Platform admin:** a replay from Ops (row 4c), or a Mine IQ backfill of one publication (row 3a).
  - **With `DISPATCH_SECRET` unset,** nothing runs the dispatcher at all. Events wait in `events`, and their deliveries are created at the first claim.
- **Site and conference deliveries with no drain (after 0088):**
  - They are processed only by those nudged runs.
  - A delivery that fails is retried with backoff, but only when the next nudge happens (the next publish, unpublish or revise, or an admin replay). Nothing retries it on a timer, so it can wait indefinitely.
  - A website revalidate POST leaves only for a company that has configured a `revalidate_url`, and only inside a nudged run.
  - Nothing older than the subscription is ever offered (row 11). The 72-hour historical rule does not apply to these two listeners, so a delivery that waits days is still delivered when a run finally claims it.
- **Device push from publications:** never, while 0055 stays deferred (row 7).

## Push: what happens if `PUSH_ENABLED` were set by mistake

- **Today (unset):** `news-notify` (cron, every 6 h) keeps queuing follower pushes for newly approved news into `notification_outbox` as `pending` (row 9). `news-push-send` (cron, hourly at :20) reads up to 200 pending rows and returns them as a preview. It delivers nothing, opens no APNs or FCM connection, and leaves the rows `pending`; only `?skip=1` marks them `skipped`.
- **If set to exactly `true`:** the next hourly run claims up to 200 of the **oldest** pending rows (row 10; there is no age limit). It sends them:
  - to APNs, if `APNS_KEY_ID`, `APNS_TEAM_ID` and `APNS_P8` are set;
  - to FCM, if `FCM_*` is set.

  Every later hour sends the next 200 until the backlog is gone. Investors who follow a company would receive real pushes about news that may be days or weeks old. Publications still would not push, because 0055 is deferred.
- Any other value (`1`, `yes`, `TRUE`, `"true "`) keeps it off.
- **Before push is ever enabled deliberately:** count the pending backlog with a read-only audit (it needs approval). Mark the stale rows skipped by calling `news-push-send?skip=1` with push still off (200 per call) until it reports `wouldSend: 0`, and only then set the variable.
- **[env] for the pilot:** `PUSH_ENABLED` absent from Vercel production. It is already on the rollout plan's must-not-set list.
