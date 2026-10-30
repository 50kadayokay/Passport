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
};

// Applied to production on 2026-10-08 and verified. Listed here, not in
// PENDING, so replay-migrations.mjs stops describing them as unapplied.
//   0057 - throttle table + ai_controls kill switch (drill-tested both ways)
//   0060 - publish_publication revoked from public/anon/authenticated
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
  "0059_auth_user_trigger.sql":
    "on_auth_user_created on auth.users. No-op on production.",

  "0064_notification_clearing.sql":
    "Clear-all for the company Notifications page: company_notification_reads.cleared_at + mark_notifications_cleared(), and company_notifications() hides events at or before it. Deletes NOTHING -- follows and likes are the investor's rows and are untouched. NULL cleared_at = pre-migration behaviour exactly.",

  "0063_company_initiated_threads.sql":
    "Lets a company START a thread with another company from the portal: conversations.sender_company_id + two partial unique indexes (replacing 0014's constraint, which NULLs would have broken) + extended 0047 policies. Additive; every existing row keeps its meaning.",

  "0062_message_attachments.sql":
    "Files on investor<->company messages: message_attachments + can_touch_conversation() + a PRIVATE message-attachments bucket with size/MIME limits. Additive; nothing existing changes behaviour. The portal UI degrades to 'no attachments' until applied.",

  "0061a_table_privilege_hardening.sql":
    "Revokes the default all-7 grant on company_follows/post_events/post_likes/user_company_relationships; re-grants only what traced call sites need. anon gets nothing. NO code deploy required.",

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
};

// Sections that need the SQL-editor role (postgres), not a pooled lesser role.
// CREATE EVENT TRIGGER is privileged: run as the wrong role and the statement
// fails while everything above it succeeds, leaving the RLS net missing.
export const NEEDS_SUPERUSER = {
  "0000_baseline.sql": "section 7 creates the ensure_rls EVENT TRIGGER",
};
