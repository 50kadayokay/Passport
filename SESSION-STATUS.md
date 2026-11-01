# S2 Distribution — session status

Branch `claude/portal-s2-distribution-5f84c4` (from 8b9e18f). Local commits only:
nothing pushed, merged, deployed or applied anywhere. No staging credentials
were used; every database check below is a script for S4 to run.

## Items

| Req | State | Commit | Offline evidence | Needs S4 |
|---|---|---|---|---|
| a17 Conference content sync | **integrated by S4 (ea6ceca)**; 0085 rolled-back 24/0; awaiting apply | 13b2587 | `conference-live-config-test` 36/0; booth on the dev server: no API -> compiled package; cached record -> published look, offline | approve + apply **0085**; `conference-booth-0085-check` (rolled back); `investor-app-live-test` |
| a21 Bespoke service requests | **integrated by S4 (ea6ceca)**; 0086 rolled-back 30/0; awaiting apply | f48c75e | `service-requests-test` 22/0; UI on a local mock harness (request, list, admin status change) | approve + apply **0086**; `service-requests-0086-check` (rolled back) |
| a14 Website content UI | implemented, offline-tested | f1abd1b | `site-selection-test` 29/0; `site-contract-test` 66/0; UI on the mock harness (toggle, publish, tokens) | `site-website-live-test` (no migration) |
| a13 Analytics events | implemented, offline-tested | ff05f8a | `audience-events-test` 30/0; `impressions-test` 29/0; Analytics tiles on the mock harness | approve + apply **0087**; `audience-events-0087-check` (rolled back); `investor-app-live-test` (PassportProto changed additively) |
| a15 Content fan-out | **slices 1–2** implemented, offline-tested | 0f16655, 6b421d9 | `content-fanout-test` 48/0; mineiq 76/0, publishing-reliability 97/0, dispatch-scheduler 30/0, delivery-ops 71/0 | approve + apply **0088** (after 0085); `content-fanout-0088-check` (rolled back); `content-fanout-live-test` |
| a22 Social publishing | deferred, scope note only | (this commit) | `specs/a22-social-publishing-scope.md` | none |

Whole branch: `npm test` passes (exit 0), `vite build` passes, `check:imports` ok,
all five migrations + rollbacks parse (`sql-parse-check`, pglast).

**Migration apply order:** 0085, 0086, 0087, 0088. Each is additive and has a rollback.
The code ships safely before them: every reader treats a missing table or function
as "not provisioned" (booth = compiled package, Services = mailto, Analytics = "needs
a database update", fan-out listeners never claimed, `releases: null`).

### a17 — Conference content sync
- `0085_conference_booth_config`: `conference_booth_configs` holds one published look per company. The version bumps only on a real change, and a trigger whitelists the keys. Members and admins read it, and only platform admins write it. `conference_booth_config(slug)` can be called anonymously.
- `api/conference-config.js` (new, public GET, anon key only) returns 200 with the look and, since a15, the releases. It returns 204 when nothing is published and 503 when the backend is unavailable.
- `src/conference/liveConfig.js` (new): the order of authority is URL params, then the published look, then the compiled package, then defaults. It caches per device, times out after 4 s and never throws.
- `ConferenceV3Booth.jsx` gets an additive hook. The compiled `registry.js` is untouched and remains the fallback.
- `ConferenceStudio.jsx` now has "Save & publish to booths". The portal's Conference page shows "Live on booths".

### a21 — service requests
- `0086_service_requests` defines the statuses requested, in_review, quoted, in_progress and done. Owners, admins, editors and publishers can create a request. The row is stamped `requested` and the requester recorded as the caller. Only platform admins update, and only the status and the note. Each status change is added to the history. No client can delete, and each company is capped at 20 requests per day.
- `api/service-request.js` inserts as the caller, then sends a best-effort Postmark email to support. `sendSupportEmail` is now exported from `api/conference-inquiry.js`, with no behaviour change.
- `Services.jsx` adds a form, "Your requests" with a status stepper and the admin note. It falls back to mailto. There is no checkout and no prices.
- New admin view `src/admin/ServiceRequests.jsx`.

### a14 — Website page
- New `src/portal/Website.jsx`: show or hide sections, switch the posts/media feeds, save a draft or publish to the website, and list and revoke site and draft tokens. `token_hash` is never requested.
- `src/lib/siteSelection.js` is shared with `api/_siteContent.js`. Site tokens get `data.published` (the snapshot). Draft tokens get the working copy. Hidden sections never leave the server.
- Blueprints from before a14 serve exactly as before. Their first draft save freezes the live copy first, so it cannot publish by accident. Saves are compare-and-set on `updated_at`.
- Only owners and admins can manage this in the UI. The database also allows editors and publishers to write blueprints (0076). That is unchanged.

### a13 — analytics events
- `0087_audience_events` adds `company_events`. It is append-only and no client can read or write it directly. Writes go through `record_company_events`, open to anonymous and signed-in callers, published companies only, at most 20 events per call.
  - Profile views count once per visitor, company and UTC day. Video milestones (25/50/75/100%) count once per visitor, post, milestone and day. Shares are capped at 20 per visitor per day.
  - The visitor is `auth.uid()` when signed in, otherwise a random device id. No PII is stored.
  - Read access is members only, through `company_audience_summary` and `company_video_progress`.
- `src/lib/analytics.js` queues and batches events and never throws or blocks. It records nothing for embed, preview, booth, mock or the portal demo.
- `PassportProto.jsx` changes are additive:
  - one effect that records a profile view, firing on open and on an in-app company swap
  - share events (sheet or copy) at the 3 share buttons
  - video milestones from `onTimeUpdate` in the media viewer, matched by media URL
- `post_events` is untouched.
- `Analytics.jsx` shows real figures with "recorded since". Before recording starts it shows "not recorded yet", never zero.

### a15 — content fan-out (slice 1 of 3)
**Done:**
- The record is the `publications` row, unchanged.
- New listeners `site_content_v1` and `conference_content_v1` on the existing outbox write to `destination_content`. Each destination has its own `event_deliveries` state, backoff, dead letter and replay. The investor feed is still `feed_projection_v1`.
- A version guard (`publish_seq`) in `deliver_destination_content` means an out-of-order retry cannot resurrect a withdrawn release. The current publication status wins.
- The website reads `content.releases` and `version.releases` from `/api/site-content`. The booth reads `releases` from `/api/conference-config`, cached with its look.
- `publication_delivery_status` already lists the new listeners per publication.
- Subscriptions are `active_from now()`, so no history is replayed.

**Left (precise):**
1. ~~Booth rendering~~ **done in 6b421d9.** The 2 newest releases from the last 180 days join `profile.timeline`, which is every template's milestones band. They are marked NEWS and de-duplicated. `&news=0` turns them off. Each template applies its own order.
2. **Website revalidate hook.** This is Site Contract §5: a POST to the site's registered hook URL on delivery, from `site_content_v1`. It needs a place for the hook URL (`company_destinations` row, `destination_id='website'`) and a staging egress allowlist entry. That is an outbound call to customer infrastructure, so it needs your approval.
3. **Portal display of per-destination state.** Map the listener names to "Investor feed / Website / Conference" wherever `publication_delivery_status` is shown (S1's publish UI, S3's DeliveryOps label map). The data is there now.
4. **Media posts on the booth.** Videos are fanned out with their thumbnail only. Playing them on the booth is a template decision.

### a22: deferred
`specs/a22-social-publishing-scope.md` covers what already fits (publications plus one listener per network on the a15 pattern), what you need to do first (developer apps, review, where tokens are stored, the X API cost) and the order to build in. No code.

Merged portal-work (ea6ceca) into this branch at 42f8472; npm test still passes (exit 0).

## S3 a28 review: defects in S2 pages, fixed
- 1a58255 (Conference):
  - A failed `my_features` call is now reported instead of silently showing the sales page.
  - The QR preview no longer spins forever.
  - The preview links only show for a published profile.
  - No more "Invalid Date".
  - "Try again" resets the entitlement, so the retry is visible.
  - Evidence: `conference-entitlement-test` 7/0 (new; needs adding to `npm test`), qr-check and catalog-check ok.
- 1680542 (Analytics):
  - The content list shows a spinner while loading, and an outage now says "could not be loaded" instead of "needs a database update".
  - The tiles show "—" and "Loading…" while loading instead of 0.
  - Evidence: impressions-test 29/0.

## Requests to other sessions
- **S3 (`src/portal/Portal.jsx`):** a navigation entry "Website" that renders `src/portal/Website.jsx` (default export, prop `company`). It could be a tab next to Conference, or a sidebar item.
- **S3 (`src/admin/Admin.jsx`):** an admin nav entry "Service requests" that renders `src/admin/ServiceRequests.jsx` (no props).
- **S3 (`src/admin/DeliveryOps.jsx`):** add these labels to `LISTENERS`: `site_content_v1: "Website"`, `conference_content_v1: "Conference booth"`.
- **S1 (publish UI):** the same labels wherever `publication_delivery_status` rows are shown.
- **S4 (`package.json`):** add `conference-entitlement-test` to `npm test`, plus:
  - `conference-live-config-test`
  - `service-requests-test`
  - `site-selection-test`
  - `audience-events-test`
  - `content-fanout-test`
- **S4 (`scripts/_api-routes.mjs` / authz):** two new routes.
  - `api/conference-config.js`: public GET, by design.
  - `api/service-request.js`: POST with a user JWT. Allowed for owner, admin, editor, publisher, or a platform admin.
- **S4 (staging, after your approval):**
  1. Run the four rolled-back checks.
  2. Apply 0085–0088.
  3. Run `site-website-live-test`, `content-fanout-live-test` and `investor-app-live-test`.
- **Owner of `src/main.jsx` (optional):** add `postId: r.id` to the media rows built at about line 603. Video progress would then match by post id instead of media URL. Today it works by URL.

## Shared contracts changed
- **New outbox listeners:** `site_content_v1` and `conference_content_v1`, subscribed to `PUBLICATION_PUBLISHED`, `PUBLICATION_REVISED` and `PUBLICATION_UNPUBLISHED`. No new event types. Anyone adding a destination should follow the same pattern.
- **Site Contract payload (additive):** `content.releases[]` and `version.releases`. Both are `null` until 0088 is applied.
- **`api/conference-inquiry.js`:** `sendSupportEmail` is now exported. This is additive.

## Blockers
- None for S2. The four migrations wait for your approval and S4.
- The a15 website revalidate hook needs your approval because it is an outbound call to customer sites.
