// Machine-readable deployment classification. docs/DEPLOYMENT-MANIFEST.md is the
// prose; this is what tooling reads, so the two cannot drift into disagreement
// without scripts/replay-migrations.mjs noticing.
//
// Every file in supabase/migrations/ must appear in exactly one bucket below.
// An unclassified file is a HARD FAILURE, not a default -- the whole point is
// that nothing is skipped silently.

// Deliberately not applied to production. Kept, per decision 2026-10-07:
// the features may be wanted later and deleting the migrations would destroy
// the record of what was considered.
export const DEFERRED = {
  "0011_outbox_ops.sql":
    "Outbox operator tooling (app_secrets, outbox_health, reconcile_outbox). The dispatcher runs without it.",
  "0027_market_quotes.sql":
    "Market-price feature (quotes). Not built.",
  "0028_story_studio.sql":
    "Story Studio (brand_kits, story_projects, story_renders). Not shipped.",
  "0029_company_self_serve.sql":
    "Self-serve claim flow (company_claims). Companies are provisioned by concierge via 0023 instead.",
  "0061b_companies_column_grants.sql":
    "Withholds owner_id + preview_token from anon on companies. BLOCKED: the native apps bundle the web build (capacitor webDir: dist, no server.url), so installed binaries still send companies?select=* and column grants make that FAIL, not omit. App Store adoption is not a mitigation. See the file header for the preview_token side-table route.",

  "0055_enable_device_push.sql":
    "Arms real push to investors' phones. Requires 0041 (from main) first, and a deliberate decision.",
  "0058_close_public_insert.sql":
    "HELD by the user 2026-11-02 (Phase 3 group A): 0058 revokes the anon INSERT that mineex.ca's live homepage lead form (old code, LeadForm -> demo_bookings) uses; Re-enable after the lead-form compatibility fix is verified and approved.",
  "0077_listing_reports_installed_app_compat.sql":
    "HELD by the user 2026-11-02 (Phase 3 group A): 0058 revokes the anon INSERT that mineex.ca's live homepage lead form (old code, LeadForm -> demo_bookings) uses; needs 0058. Re-enable after the lead-form compatibility fix is verified and approved.",
  "0092_listing_reports_column_insert.sql":
    "HELD by the user 2026-11-02 (Phase 3 group A): 0058 revokes the anon INSERT that mineex.ca's live homepage lead form (old code, LeadForm -> demo_bookings) uses; needs 0077. Re-enable after the lead-form compatibility fix is verified and approved.",
  "0093_listing_reports_rate_limit.sql":
    "HELD by the user 2026-11-02 (Phase 3 group A): 0058 revokes the anon INSERT that mineex.ca's live homepage lead form (old code, LeadForm -> demo_bookings) uses; needs 0092. Re-enable after the lead-form compatibility fix is verified and approved.",
};

// Applied to production on 2026-10-08 and verified. Listed here, not in
// PENDING, so replay-migrations.mjs stops describing them as unapplied.
//   0057 - throttle table + ai_controls kill switch (drill-tested both ways)
//   0060 - publish_publication revoked from public/anon/authenticated
// Verified applied by the read-only production audit of 2026-11-01:
//   0053, 0054, 0056, 0059 (sign-up trigger identical to staging; NEVER run
//   0059's rollback in production), 0067.
//
// Written this session; awaiting approval. Replay applies these in staging.
export const PENDING = {
  // Verified absent from production on 2026-10-30 by
  // supabase/audit/verify_unverified_migrations.sql. Until this session they
  // were silently classified APPLIED by the derived default.
  "0065a_analytics_breakdown.sql":
    "Four read-only analytics RPCs (content performance, engagement by type, unattributed engagement, follower growth). Production has NONE of them, so the Analytics page's breakdowns render their empty states. No new table, event kind or instrumentation.",

  "0065b_engagement_corrections.sql":
    "Corrects three RPCs 0048 already created: dwell is stored in ms and was reported as seconds, impressions are structurally 0 (nothing emits one), saves counts currently-saved rather than save presses. Production still runs 0048's versions, so those three numbers are wrong on screen today. MUST follow 0065a.",

  "0065c_analytics_indexes.sql":
    "Three supporting indexes for the 0065a/b queries. CREATE INDEX CONCURRENTLY, so each statement runs OUTSIDE a transaction block -- run them one at a time, not as a batch.",

  "0066_mineiq_conversations.sql":
    "mineiq_threads + mineiq_messages and their RLS. Absent from production, so Mine IQ cannot persist a conversation: every session starts empty and nothing is retained.",

  "0068_site_contract.sql":
    "site_credentials + the blueprint read/write policies behind the Site Contract. Absent from production, so the four /api/site-* handlers have no table to authenticate against. Deploy the handlers only AFTER this is applied.",

  "0000_baseline.sql":
    "The 18 unversioned objects. No-op on production; required for every other environment.",

  "0058_close_public_insert.sql":
    "Revokes anon INSERT on the three public forms. MUST follow the /api/submit deploy.",

  "0064_notification_clearing.sql":
    "Clear-all for the company Notifications page: company_notification_reads.cleared_at + mark_notifications_cleared(), and company_notifications() hides events at or before it. Deletes NOTHING -- follows and likes are the investor's rows and are untouched. NULL cleared_at = pre-migration behaviour exactly.",

  "0063_company_initiated_threads.sql":
    "Lets a company START a thread with another company from the portal: conversations.sender_company_id + two partial unique indexes (replacing 0014's constraint, which NULLs would have broken) + extended 0047 policies. Additive; every existing row keeps its meaning.",

  "0062_message_attachments.sql":
    "Files on investor<->company messages: message_attachments + can_touch_conversation() + a PRIVATE message-attachments bucket with size/MIME limits. Additive; nothing existing changes behaviour. The portal UI degrades to 'no attachments' until applied.",

  // Verified absent from production by the read-only audit of 2026-11-01
  // (supabase/audit/production_readiness_2026_10_31.sql). Until then the derived
  // default classified all of these APPLIED. Staging has them (0077/0078 since
  // 2026-11-01). Order and gates: docs/PRODUCTION-ROLLOUT-PLAN.md.
  "0069b_stripe_events.sql":
    "Stripe webhook ledger: de-duplication, ordering and subscription binding for /api/stripe-webhook (F9).",
  "0071_publishing_reliability.sql":
    "Publishing reliability: posts.media_url and the corrected publish_publication. Production's publish_publication matches NO repo version (function drift) -- read its source before writing the production rollback.",
  "0072_profile_drafts.sql":
    "Profile drafts and the role-gated publish path (a04).",
  "0073a_impression_dedupe_index.sql":
    "Impression de-duplication index. CREATE INDEX CONCURRENTLY -- outside a transaction.",
  "0073b_impression_tracking.sql":
    "Impression tracking RPC (a12). Needs a new native build to emit from the apps.",
  "0073c_post_events_client_guard.sql":
    "Stops clients writing backdated impressions directly (post_events insert policy).",
  "0074_profile_revision_history.sql":
    "Profile revision history with restore-into-draft (a05).",
  "0075_profile_versions_privileges.sql":
    "Privilege fix for company_profile_versions.",
  "0076_company_roles.sql":
    "Company roles (a03). Its brand_kits/story_projects statements are guarded (0028 is deferred in production). Production's accept_company_invitation matches no repo version (function drift) -- keep production's first-owner handoff.",
  "0077_listing_reports_installed_app_compat.sql":
    "Keeps anon INSERT on listing_reports for installed 1.3.x apps. Apply in the SAME session as 0058, right after it.",
  "0078_storage_role_hardening.sql":
    "Storage writes/deletes follow the a03 drafting roles; investors can no longer upload to the public buckets. Needs 0076's has_company_role.",
  "0085_conference_booth_config.sql":
    "a17: the booth's look (template/theme/accent) as a published record the booth fetches and caches; public read via conference_booth_config(slug). Applied to staging 2026-11-01.",
  "0086_service_requests.sql":
    "a21: bespoke-service requests with status history; drafting roles create, platform admins update. Needs 0076's has_company_role. Applied to staging 2026-11-01.",
  "0087_audience_events.sql":
    "a13: company_events (profile views, unique visitors, shares, video progress) written only through record_company_events(); members-only aggregates. Additive; no installed-app table touched. Applied to staging 2026-11-01.",
  "0088_content_fanout.sql":
    "a15: destination_content plus the site_content_v1 and conference_content_v1 listeners (active_from = now(), nothing historical replays). Deploy api/_listeners.js with it. Applied to staging 2026-11-01.",
  "0080_mineiq_search_any_term.sql":
    "a19: mineiq_search ORs the question's significant words (was AND), so natural questions retrieve context. Same signature, owns_company guard and supersession rule. Applied to staging 2026-11-01.",
  "0090_notification_clear_roles.sql":
    "Company-wide \"Clear all\" notifications limited to owner/admin (and platform admins) via has_company_role; was any member. Needs 0064 and 0076. Applied to staging 2026-11-01.",
  "0093_listing_reports_rate_limit.sql":
    "A database-enforced rate limit and a one-row-per-request cap on DIRECT client inserts into listing_reports (anon/authenticated: the installed 1.3.x path 0077 keeps open). Client = cf-connecting-ip, else the LAST x-forwarded-for hop (gateway-set only), stored as a salted hash; limits 5 per 10 min per client, 20 per hour per /24 or /48 network, 600 per hour globally (editable in listing_report_limits); expired counters pruned by the trigger. Refusals are PT429/PT400. The service role (/api/submit), direct sessions and platform admins are unaffected. Apply in the SAME runner session as 0092, right after it. Applied to staging 2026-11-02.",
  "0092_listing_reports_column_insert.sql":
    "listing_reports INSERT for anon/authenticated narrowed from the whole table to the six columns installed 1.3.x builds send, so a guest can no longer set id or created_at (backdating, id oracle). 0077's policy unchanged. Apply in the SAME runner session as 0077, right after it. Applied to staging 2026-11-02.",
  "0091_notification_clear_no_platform_admin.sql":
    "\"Clear all\" admits only the company's owner_id or an active owner/admin membership; platform admins no longer pass by being platform admins (user decision 2026-11-01). Replaces 0090's check only; same signature and grants. MUST follow 0090. Applied to staging 2026-11-01.",
  "0061a_table_privilege_hardening.sql":
    "Revokes the default all-7 grant on company_follows/post_events/post_likes/user_company_relationships; re-grants only what traced call sites need. anon gets nothing. NO code deploy required.",
  "0094_company_follows_upsert_grant.sql":
    "UPDATE on company_follows (user_id, company_id) for authenticated: installed 1.0-1.3.2 follow() upserts with merge-duplicates (ON CONFLICT DO UPDATE), which 0061a's select/insert/delete refuses (42501, reproduced on staging). No non-admin UPDATE policy exists, so RLS still refuses every real update; the migration checks that before granting. Run right after 0061a (Phase 3). Applied to staging 2026-11-02.",

};

// 0067_conference_mode_feature.sql is APPLIED (verified 2026-10-30): the
// conference_mode row is in public.features. It needs no entry -- the derived
// default below is correct for it.
//
// THE UNVERIFIED BUCKET, AND WHY IT IS EMPTY
// ------------------------------------------
// APPLIED_BY_DEFAULT is a derived default, and a derived default cannot tell
// "deliberately applied" from "written last week and never run". On 2026-10-29
// it was doing exactly that for six files -- three of them orphaned by an entry
// naming 0065_analytics_breakdown.sql, a file that has never existed, because
// the work shipped as 0065a/b/c. Five of the six turned out to be absent.
//
// So: a migration whose production state nobody has checked goes in UNVERIFIED
// with a read-only `verify` query, and the planner refuses to produce a
// production plan while anything sits here. Guessing in the safe-looking
// direction is still guessing -- 0066 and 0068 use bare `create policy`, which
// throws if the policy already exists, so re-running one that IS applied fails.
export const UNVERIFIED = {
};

// Applied to production and verified against live catalog metadata.
// Everything not named in DEFERRED or PENDING is expected to be here; the
// replay planner derives this set rather than restating 50 filenames, so a new
// migration cannot be quietly assumed applied.
export const APPLIED_BY_DEFAULT = true;

// Ordering constraints the filename sort does not express.
export const PREREQUISITES = {
  "0055_enable_device_push.sql": ["0041_outbox_claim_lease.sql"],
  "0058_close_public_insert.sql": ["0057_submission_throttle.sql"],
  "0061a_table_privilege_hardening.sql": ["0052_messaging_privilege_hardening.sql"],
  "0065b_engagement_corrections.sql": ["0048_company_engagement_analytics.sql"],
  "0065c_analytics_indexes.sql": ["0065a_analytics_breakdown.sql"],
  "0076_company_roles.sql": ["0072_profile_drafts.sql"],
  "0077_listing_reports_installed_app_compat.sql": ["0058_close_public_insert.sql"],
  "0078_storage_role_hardening.sql": ["0076_company_roles.sql"],
  "0086_service_requests.sql": ["0076_company_roles.sql"],
  "0080_mineiq_search_any_term.sql": ["0050a_mineiq_and_publication_push.sql"],
  // S2 production-shape review R2: rolling 0071 back under 0087/0088 drops listener_subscriptions.active_from and
  // restores 0008's claim_deliveries, so their listeners would replay every historical event (incl. signed revalidates).
  "0087_audience_events.sql": ["0071_publishing_reliability.sql"],
  "0088_content_fanout.sql": ["0071_publishing_reliability.sql"],
  "0090_notification_clear_roles.sql": ["0064_notification_clearing.sql", "0076_company_roles.sql"],
  "0091_notification_clear_no_platform_admin.sql": ["0090_notification_clear_roles.sql"],
  "0092_listing_reports_column_insert.sql": ["0077_listing_reports_installed_app_compat.sql"],
  "0093_listing_reports_rate_limit.sql": ["0057_submission_throttle.sql", "0092_listing_reports_column_insert.sql"],
  "0094_company_follows_upsert_grant.sql": ["0061a_table_privilege_hardening.sql"],
};

// Sections that need the SQL-editor role (postgres), not a pooled lesser role.
// CREATE EVENT TRIGGER is privileged: run as the wrong role and the statement
// fails while everything above it succeeds, leaving the RLS net missing.
export const NEEDS_SUPERUSER = {
  "0000_baseline.sql": "section 7 creates the ensure_rls EVENT TRIGGER",
};
