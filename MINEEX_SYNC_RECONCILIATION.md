# Sync-branch reconciliation audit — `sync/main-into-appupdate-2026-10` vs `origin/main`

**Date:** 2026-10-11. **Read-only audit. No changes made. No merge, no deploy.**
**Refs:** this branch HEAD `833f7ff`; `origin/main` HEAD `dc68209` ("0048 and 0049 applied: the portal's database work is complete"); merge-base `1058cd5`.

## Headline
The analytics, DB-hardening, follower, and notification backend you asked to build **already exists on `origin/main`** and — per that HEAD commit and the 2026-10-06 reconciliation audit — **is applied in production**. This branch is simply **behind** `origin/main` by the `0036–0056` migration chain plus the portal frontend. It introduces **no divergent migrations**. Reconciliation is low-risk.

## Migrations

- **Present on `origin/main`, MISSING here (22):** `0036_publish_timeline_phase1`, `0037_storage_docs_authorization`, `0038_media_assets`, `0039_media_asset_sources`, `0040_storage_write_fix`, `0041_source_transcripts`, `0042_source_inventories`, `0043_verification_canonical`, `0044_persist_rpcs`, `0045_phase3_privilege_hardening`, `0046_service_role_no_direct_writes`, `0047_company_messaging_access`, **`0048_company_engagement_analytics`**, **`0049_company_notifications`**, `0050a_mineiq_and_publication_push`, `0050b_mineiq_search_indexes`, `0051_release_revisions_and_timeline`, `0052_messaging_privilege_hardening`, `0053_phase3_0041_privilege_hardening`, `0054_phase3_0041_immutability`, `0055_enable_device_push`, `0056_function_execute_hardening`.
- **Present here, MISSING on `origin/main`:** **none.** `0001–0035` are byte-identical on both branches; this branch's `0041_outbox_claim_lease` and `0042_push_token_ownership` also exist on `origin/main`.
- **Numbering collision (pre-existing on `origin/main`):** prefixes `0041` and `0042` each have **two** files on `origin/main` (`0041_outbox_claim_lease` + `0041_source_transcripts`; `0042_push_token_ownership` + `0042_source_inventories`). Supabase applies by filename sort, so both run; this is an existing prod reality, **not** introduced by this branch. Flag for awareness; no action required to reconcile.

## Analytics RPCs (the user's goal) — already on `origin/main`, NOT here
From `0048_company_engagement_analytics` — **aggregates only, company-scoped** (a company sees *how many* investors engaged, never *which* one):
- `company_engagement_totals(p_company uuid)`
- `company_engagement_daily(p_company uuid, p_days int default 30)`
- `company_post_engagement(p_company uuid, p_limit int default 20)`

From `0049_company_notifications` (named, deliberate acts — follows/likes):
- `company_notifications(p_company uuid, p_limit int default 50)`
- `mark_notifications_seen(p_company uuid)`

## Event collection — already exists (both branches, since 0009/0016)
- `post_events` (0009): kinds `impression | open | save | unsave | dwell`, RLS `user_id = auth.uid()`.
- `company_follows` (0009): follows keyed by **`company_id`**.
- `user_company_relationships` (0016): follows keyed by **`company_slug`** — the **second follow source**.
- `post_likes` / `post_saves` (0016): keyed by `company_slug` + `post_key`.

**Follower reconciliation** = unifying the two follow sources above (by `company_id` vs `company_slug`). `0048` already reads and reconciles them inside the aggregate RPCs on `origin/main`.

## Security / DB hardening — already on `origin/main`, NOT here
`0045` (privilege hardening — anon/authenticated grant cleanup), `0046` (service-role: no direct writes, force validated RPCs), `0052` (messaging privilege), `0053`/`0054` (phase-3 privilege + immutability), `0056` (function-execute hardening). Plus `0044` (trusted persist RPCs) and `0043` (verification canonical).

## Conflict assessment (for reconciliation)
- **Migration-level conflicts: none** (no divergent local migrations).
- **Frontend overlap (changed on BOTH sides since merge-base) — only 5 files:**
  - `src/aiBrief/PassportProto.jsx` — **substantive.** This branch: brief benchmark (committed `db6ba5f`) + uncommitted account switcher/profile/follower work. `origin/main`: portal-related edits. Manual merge required; **preserve the approved brief + switcher work.**
  - `package.json`, `.gitignore`, `vite.config.js`, `src/lib/structureReleases.js` — minor/mechanical.
- `origin/main` changed **125 files** since merge-base (portal frontend `src/portal/Analytics.jsx`, `Notifications.jsx`, `MineIQ.jsx`, …, supporting `api/*`, and the `0036–0056` migrations). None except the 5 above overlap this branch's changes.

## Work to preserve on this branch (must survive reconciliation)
- Brief benchmark `db6ba5f` (dev-only, gated) + the Phase 1A Brief generator (`api/_briefGen.js`, `scripts/gen-briefs.mjs`, `scripts/compare-briefs.mjs`, `?briefgen=1`) — currently uncommitted.
- Account switcher / profile / follower-count work (uncommitted in `PassportProto.jsx`, `main.jsx`, `src/lib/portal.js`).
- Marketing site, QA scripts, `structure-release.js` AI changes, brand assets.

## Recommended reconciliation (pending approval — not executed)
1. **Verify prod** with the read-only queries below (confirm `0036–0056` applied + the 5 RPCs present).
2. **Merge `origin/main` into this branch** (not the reverse; never into `main`). Expect conflicts only in the 5 files; resolve `PassportProto.jsx` by keeping both the approved brief/switcher work and origin's portal edits.
3. Result: this branch gains the analytics/hardening/follower/notification backend + portal frontend with **no new migrations**, preserving all approved app + press-release work.
4. The remaining *new* work for "companies see discovery/engagement" is then the **portal Analytics frontend** wiring to `company_engagement_*` + the **event-tracking spec** (web/iOS/Android/QR; view/unique-visitor/engagement definitions) — not backend migrations.

## Prod verification queries (read-only — run in Supabase SQL editor)
```sql
-- 1) Which migrations are applied?
select version, name from supabase_migrations.schema_migrations order by version;

-- 2) Are the analytics + notification RPCs present?
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('company_engagement_totals','company_engagement_daily',
                  'company_post_engagement','company_notifications','mark_notifications_seen')
order by proname;

-- 3) Are the engagement/follower tables present?
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('post_events','company_follows','user_company_relationships','post_likes','post_saves')
order by table_name;
```
Expected if the prod line matches `origin/main`: (1) includes `0036`–`0056`; (2) returns all 5 RPCs; (3) returns all 5 tables.
