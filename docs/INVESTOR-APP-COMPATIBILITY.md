# Investor app ↔ Company Portal: production compatibility (2026-10-31)

**Status: analysis and staging evidence complete; production comparison waits
on the read-only audit. Nothing has been deployed or changed in production.**

## Isolation, stated plainly

There is **one production database** (Supabase `rvptronniomlqumjhyrr`,
"Passport V1"). The investor app (web `/app`, the iOS/Android shell, `/p/<id>`
links), the public site, the Company Portal and Mission Control are one web
bundle and one API, all using that database. The portal is **not** isolated
from the app at the database level: every portal migration runs against the
tables the live app uses. Isolation therefore has to come from (a) migrations
that do not change what the app relies on, (b) a rollout order that keeps the
deployed code and the schema compatible at every step, and (c) a tested
rollback for each step.

**The live app is not today's code.** The native app ships its web bundle
inside the store build: version **1.3.1 (build 17)**, release tag
**`prod-v1.3.2`** (commit `15f9ec0`, 2026-10-26). Phones keep running that code
until users update. Compatibility is therefore checked against BOTH the
shipped release and the current code.

## Method

1. `scripts/surface-inventory.mjs` (static, contacts nothing) maps every live
   surface's database dependencies by following its real import graph:
   REST tables, RPC functions, storage buckets and `/api` routes (followed
   into the server code). It also lists what each pending migration (0053–0076)
   changes, separating migration-time changes from function bodies that run
   later, and intersects the two.
2. The same analysis was run on the shipped release (`prod-v1.3.2`, exported
   read-only) and compared with HEAD.
3. `scripts/investor-app-live-test.mjs` reproduces the app's actual calls
   (same paths, payloads, headers, upsert modes; source line cited per step)
   against STAGING, where every pending migration is applied, as a guest and
   as a throwaway signed-up investor that is deleted at the end through the
   app's own delete-account RPC.

## The investor app's database surface (HEAD)

| | |
|---|---|
| Tables read | `news_public`, `posts`, `companies` (named columns only), `notifications`, `conversations`, `messages`, `message_attachments`, `profiles` |
| Tables written directly (as the user, or anon) | `investor_profiles`, `investor_preferences`, `user_company_relationships`, `post_likes`, `post_saves`, `company_follows`, `post_events`, `notification_preferences`, `notification_prefs`, **`listing_reports` (anon key)** |
| RPCs | `company_follower_count`, `get_preview_company`, `record_post_impressions` (HEAD only), `claim_push_token`, `release_push_token`, `delete_own_account` |
| API routes | `/api/messages` (investor send), `/api/dispatch` |
| Storage | `company-media` (public) |
| Auth | sign-up fires the `auth.users` trigger that creates the profile |

The shipped release differs only in ways that reduce risk: it does not call
`record_post_impressions` (added by 0073b), and it uses the same direct
writes. **No migration touch point exists only for the shipped build.**

## What the pending migrations change that the app depends on

29 touch points (full list: `node scripts/surface-inventory.mjs`). Classified:

| Class | Touch points | Evidence |
|---|---|---|
| **Additive, harmless** | new columns (0063 `sender_company_id`, 0071 `posts.media_url`), new tables (0062, 0071), indexes (0065c, 0073a) | additive DDL; app selects named columns or `*` on tables that only gain columns |
| **Privilege/policy changes, verified safe** | 0061a (follows, likes, events, watchlist: revoke-all then re-grant exactly what the app uses), 0061b (companies column grants; app's columns all granted), 0073b/0073c (impressions RPC + `post_events` guard: app's kinds `open/dwell/save/like` allowed, guests never send impressions), 0076 (conversations/messages/companies: investor reads and investor-side inserts unchanged; company-side insert restricted) | staging suite: all pass |
| **BREAKS the shipped app** | **0058** revokes anon INSERT on `listing_reports`; the app's "Report this listing / Claim this company" sheet writes it with the anon key (`PassportProto.jsx:9667`, since 2026-08-28, so in every store build) | staging suite: refused (401/42501) |
| **Breaks unless deployed in order** | **0063** drops the `(investor_id, company_slug)` unique constraint that the **shipped API** (`prod-v1.3.2` `api/messages.js`) upserts on → every investor message would fail (42P10, the D20 defect). **0058** also breaks the shipped public-site forms, which insert with the anon key (`prod-v1.3.2` has no `/api/submit`) | code comparison; D20 reproduced on staging (`messaging-flow-test`) |
| **Needs production evidence** | **0059** (re)creates the sign-up trigger; if production already has an equivalent trigger under another name, two would fire and sign-ups could fail | audit Q16 (all `auth.users` triggers) |

## Staging results (all pending migrations applied)

`scripts/investor-app-live-test.mjs`: **32 passed, 0 failed, 1 breaking finding.**

Passed:
- **Guest:** news feed, company posts, `/p/` deep link, company cards (exact columns), follower count, preview lookup, guest impressions correctly not sent.
- **Signed-in investor:** sign-up (trigger creates exactly one investor profile), onboarding, preferences, watchlist, like/unlike, save/unsave, follow/unfollow, notification preferences and settings, notifications list, analytics events, signed-in impressions, push token register/release.
- **Messaging:** send via `/api/messages`, inbox, thread, attachments, read receipts.
- **Account:** `delete_own_account` removes the account, and no rows are left.

Breaking: **"Report this listing" (anon insert into `listing_reports`)**,
refused under 0058.

## Required before any production migration (proposed; nothing done)

1. **Listing reports.** Route the app's report/claim sheet through the
   existing `/api/submit?form=listing_report` (it already validates this form)
   in the next app release, AND keep production's anon INSERT on
   `listing_reports` until store adoption of that release is high, i.e. apply a
   production variant of 0058 that closes `contact_submissions` and
   `demo_bookings` but NOT `listing_reports` yet. Decision needed.
2. **Rollout order** (each step keeps the live code and schema compatible):
   1. Deploy the current API (D20 find-or-create messaging, `/api/submit`, F8)
      and web bundle. No schema change; works on the current production schema.
   2. Verify in production (read-only checks + smoke tests).
   3. Only then apply 0063 (needs the new messaging code) and the 0058 variant
      (needs `/api/submit` for the site forms).
   4. Then the portal migrations (0068 → 0076) in order, each with its tested
      rollback, after the audit confirms production's starting state.
3. **0059**: apply only if audit Q16 shows no other profile-creating trigger.
4. **Rollbacks.** 0065a–0076 have rollback files (0076's verified exact on
   staging); 0061a–0064, 0066–0069b document rollback inside the migration;
   **0053–0060 have none**. Any of those still pending in production (per the
   audit; the manifest lists 0058 and 0059) needs a written and staging-verified
   rollback before it is applied.

## What the audit adds

Q01 (which migrations production already has), Q08/Q17 (policy digests on the
tables 0076 and the app touch, vs staging), Q09 (grants on the app's direct-write
tables), Q10 (function digests), Q16 (`auth.users` triggers). With those, every
touch point above becomes "already in production", "pending and safe", or
"pending and needs the step above", measured against production's real state.
