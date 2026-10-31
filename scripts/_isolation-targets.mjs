// Inventory the tenant-isolation suite runs against. Separated from the runner so
// the target list can be reviewed (and diffed when a migration adds a table)
// without reading the harness.
//
// Derived mechanically from supabase/migrations/*.sql — every table carrying a
// company_id or company_slug column. If you add a company-scoped table and do not
// add it here, scripts/tenant-isolation-test.mjs FAILS on the completeness check
// rather than silently skipping it.

// ---- directly company-scoped: the column names the tenant ------------------
// WRITE-ONLY TABLES. A company may INSERT but never SELECT, so the
// "can the owner read its own row" control does not apply -- it is not a
// broken policy, it is the design. listing_reports is a report inbox: you
// file one, you do not read the queue.
export const WRITE_ONLY = new Set(["listing_reports"]);

// USER-SCOPED, NOT COMPANY-SCOPED. company_claims is keyed on user_id: its
// policies are `user_id = auth.uid() OR is_admin()`, and company_slug names
// the company BEING CLAIMED, not the owner of the row. Listing it as
// company-scoped made the suite read a claim company A had filed about
// company B and call it a leak. The real property is asserted separately:
// one user must not read another user's claims.
// SERVICE-ROLE ONLY. Carries a company_id for bookkeeping, but no end user may
// read or write it at all: RLS on, no policies, every privilege revoked from
// anon and authenticated. stripe_events (0069b, F9) is the webhook's
// idempotency ledger. Asserted: anon, company users and investors are refused
// even their "own" company's rows. Where the migration is not applied yet the
// suite reports SKIP, never a pass.
export const SERVICE_ONLY = [
  ["stripe_events", "company_id"],
  // 0072 (a04/d28): unpublished profile drafts. Reached only through
  // api/profile-draft.js (service role, after a role check); never public.
  ["company_profile_drafts", "company_id", () => ({ company_id: process.env.ISOLATION_COMPANY_A_ID, draft: { pp: {}, projects: [] }, base_fingerprint: "probe" })],
];

export const USER_SCOPED = [
  ["company_claims", "user_id", "company_slug"],
];

export const COMPANY_SCOPED = [
  // Added 2026-10-30 after the suite's own inventory check reported these
  // uncovered. They are among the most sensitive tables in the system: Mine IQ
  // holds whatever documents a company uploaded, and site_credentials holds the
  // tokens a bespoke website authenticates with. Isolation on all three was
  // confirmed by hand that day; this puts them in the default run so it is not
  // confirmed by hand again.
  ["mineiq_threads", "company_id"],
  ["mineiq_messages", "company_id"],
  ["site_credentials", "company_id"],
  ["activity_log", "company_id"],
  ["brand_kits", "company_id"],
  ["canonical_sources", "company_id"],
  ["canonical_spans", "company_id"],
  ["company_agreement_acceptances", "company_id"],
  ["company_blueprints", "company_id"],
  ["company_destinations", "company_id"],
  ["company_features", "company_id"],
  ["company_follows", "company_id"],
  ["company_invitations", "company_id"],
  ["company_memberships", "company_id"],
  ["company_notification_reads", "company_id"],
  ["company_profile_versions", "company_id"],
  ["company_subscriptions", "company_id"],
  ["conversations", "company_slug"],
  ["documents", "company_id"],
  ["events", "company_id"],
  ["extraction_attempts", "company_id"],
  ["facts", "company_id"],
  ["listing_reports", "company_slug"],
  ["media_asset_sources", "company_id"],
  ["media_assets", "company_id"],
  ["mineiq_ingestions", "company_id"],
  ["news_item_companies", "company_id"],
  ["notification_prefs", "company_id"],
  ["notifications", "company_id"],
  ["post_likes", "company_slug"],
  ["post_saves", "company_slug"],
  ["posts", "company_id"],
  ["publications", "company_id"],
  ["quotes", "company_id"],
  ["release_revisions", "company_id"],
  ["source_inventories", "company_id"],
  ["source_inventory_blocks", "company_id"],
  ["source_inventory_notes", "company_id"],
  ["source_inventory_parts", "company_id"],
  ["source_transcripts", "company_id"],
  ["story_projects", "company_id"],
  ["updates", "company_id"],
  ["user_company_relationships", "company_slug"],
  ["verification_findings", "company_id"],
  ["verification_runs", "company_id"],
];

// ---- indirectly scoped: no company column; isolation depends on a JOIN -----
// These are the highest-risk rows in the schema. A direct-column policy is hard
// to get wrong; a policy that has to reach through a parent is easy to get wrong,
// and if it IS wrong there is no column on the row to reveal it.
export const INDIRECTLY_SCOPED = [
  ["messages", "conversation_id", "conversations", "company_slug"],
  ["publication_media", "publication_id", "publications", "company_id"],
  ["update_documents", "update_id", "updates", "company_id"],
  ["event_deliveries", "event_id", "events", "company_id"],
  ["story_renders", "project_id", "story_projects", "company_id"],
];

// ---- legitimately public: anon MUST still read these -----------------------
// Negative tests alone are worthless — a database that denies everything would
// pass them all. These are the positive controls.
export const PUBLIC_READABLE = [
  ["companies", "status=eq.published"],
  ["posts", "removed_at=is.null"],
  ["news_items", "status=eq.live&review_state=eq.approved"],
  ["news_item_companies", ""],
];

// ---- company-scoped tables whose READ is public by design -------------------
// Both lists above name these, which is a contradiction the suite could not see
// until company B had rows: `posts` is the public investor feed (policy
// public_read, 0009: removed_at is null AND the company is published), and
// `news_item_companies` is public outright. "A cannot read B's posts" is false
// by design, and passed only because B's tenant was empty -- a false PASS.
//
// Cross-tenant WRITES on these stay fully tested. For READ, the property that
// actually holds is narrower and sharper: the HIDDEN subset stays hidden. Where
// a hidden subset exists the seeder plants one row of it (env var below) and the
// suite asserts nobody else can read it. Where none exists (null), there is no
// read assertion to make, and the suite says so rather than recording a PASS.
export const PUBLIC_BY_DESIGN = new Map([
  ["posts", { hiddenEnv: "ISOLATION_HIDDEN_POST_B", why: "removed post: public_read requires removed_at is null" }],
  ["news_item_companies", null],
]);

// ---- serverless routes -------------------------------------------------------
// The former ENDPOINTS list lived here. It is REMOVED, not kept alongside its
// replacement: it declared the wrong guard for 9 routes, omitted 3, and was
// probed with one malformed body for every route -- so routes with no guard at
// all could score PASS. Its replacement is API_ROUTES in ./_api-routes.mjs,
// run by ./api-authz-test.mjs, which every route must appear in (enforced).

// ---- storage ---------------------------------------------------------------
// Taken from live `storage.buckets` and the live storage.objects policies, NOT
// guessed. Two earlier versions of this file were wrong in ways worth recording,
// because both produced a PASS that meant nothing:
//
//   1. it invented a bucket called "public-assets", which does not exist. A
//      bucket that does not exist returns 404, which the suite reads as
//      "denied" -- a FALSE PASS.
//   2. it probed the prefix `<company_id>/`. The real convention is
//      `<user_uuid>/.../<company_uuid>/file`: media policies match
//      `(storage.foldername(name))[1] = auth.uid()::text` (FIRST segment, the
//      uploader) and docs_path_company() reads the LAST segment as the company.
//      Listing by a company-id prefix therefore returns nothing whatever the
//      policy says -- another FALSE PASS.
//
// PRIVATE buckets are the isolation targets. The other two are PUBLIC BY DESIGN:
// `media_public_read` grants anon SELECT on company-media and company-logos, so
// asserting cross-tenant denial on them would fail correctly and mean nothing.
// They are positive controls instead -- they must STAY readable.
export const BUCKETS_PRIVATE = [
  // bucket, the policy that gates reads, what it keys on
  ["company-docs", "docs_company_read", "join documents.storage_path + can_touch_company"],
  ["company-media-private", "privmedia_company_read", "join media_assets.storage_path + can_touch_company"],
];

export const BUCKETS_PUBLIC = ["company-media", "company-logos"];

// A listing probe cannot prove isolation on its own -- an empty result is
// ambiguous between "denied" and "nothing there". The meaningful probe is a
// fetch of a KNOWN object belonging to the other tenant, so these paths must be
// seeded and passed in. Absent them the suite reports SKIP, not PASS.
export const SEEDED_OBJECT_ENV = [
  ["company-docs", "ISOLATION_COMPANY_B_DOC_PATH"],
  ["company-media-private", "ISOLATION_COMPANY_B_PRIVMEDIA_PATH"],
];

// ---- company-scoped RPCs: the tenant arrives as a CALLER-SUPPLIED ARGUMENT -
// The sharpest edge in the schema, and the reason this list exists separately
// from the tables above. Every table target is protected by RLS, which the
// database applies whether or not the query asks for it. These functions are
// SECURITY DEFINER: they execute as the owner, RLS DOES NOT APPLY INSIDE THEM,
// and the only thing between an investor and another company's engagement
// figures is the `owns_company(p_company)` check on the first line of the body.
// Move a query above that check, or write a new function without it, and
// nothing else in the stack says no.
//
// `p_company` is the tenant argument in every one of them.
//
// class:
//   "company-read"  -- owner and active staff may call it for THEIR OWN
//                      company; nobody else, for any company. Platform admins
//                      included: owns_company() (0006) is owner-or-active-
//                      membership and deliberately does not consult is_admin().
//   "company-write" -- same, and a breach mutates rather than merely reads.
//   "internal"      -- service-role only. No end-user JWT may call it AT ALL,
//                      including the owner's.
//   "admin-only"    -- a platform-admin function. is_admin() is the guard, so
//                      the admin is ALLOWED for any company and every other
//                      identity is denied -- the inverse of the rows above.
//
// actor_can_publish is "internal" because 0008 revokes it from public, anon and
// authenticated and grants it to service_role alone. That revoke is issued
// inside a `foreach ... execute format(...)` loop rather than as a literal
// statement, so grepping for `revoke execute on function
// public.actor_can_publish` finds nothing and the function looks exposed. It is
// not. Worth knowing before anyone "fixes" it: it would otherwise be an
// authorization oracle over companies.owner_id, since p_actor is an argument.
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export const COMPANY_SCOPED_RPCS = [
  // name,                          args besides p_company,     class
  ["company_engagement_totals",     {},                         "company-read"],
  ["company_engagement_daily",      { p_days: 30 },             "company-read"],
  ["company_engagement_by_type",    {},                         "company-read"],
  ["company_post_engagement",       { p_limit: 5 },             "company-read"],
  ["company_content_performance",   { p_days: 30, p_limit: 5 }, "company-read"],
  ["company_follower_growth",       { p_days: 30 },             "company-read"],
  // 0073b (a12): impressions, member-only like 0065a.
  ["company_impression_summary",    { p_days: null },           "company-read"],
  ["company_post_impressions",      { p_days: 30 },             "company-read"],
  ["company_engagement_unattributed", {},                       "company-read"],
  ["company_notifications",         { p_limit: 5 },             "company-read"],
  ["mark_notifications_seen",       {},                         "company-write"],
  ["mark_notifications_cleared",    {},                         "company-write"],
  ["mineiq_search",                 { p_query: "drill", p_limit: 3 }, "company-read"],
  ["upsert_timeline_entry",         { p_entry: {} },            "internal"],
  // 0071 (proposed, D22): service-role only, like upsert_timeline_entry.
  ["remove_timeline_entry",         { p_key: "pub:probe" },     "internal"],
  ["actor_can_publish",             { p_actor: NIL_UUID },      "internal"],
  // 0072 (a04/d28): service-role only; api/profile-draft.js passes the verified
  // caller as p_actor and each function re-checks that actor's role.
  ["profile_actor_role",            { p_actor: NIL_UUID },      "internal"],
  ["load_profile_draft",            { p_actor: NIL_UUID },      "internal"],
  ["save_profile_draft",            { p_actor: NIL_UUID, p_draft: { pp: {}, projects: [] }, p_expected_version: null, p_base_fingerprint: "probe" }, "internal"],
  ["publish_profile_draft",         { p_actor: NIL_UUID, p_expected_version: 1 }, "internal"],
  ["discard_profile_draft",         { p_actor: NIL_UUID, p_expected_version: 1 }, "internal"],
  ["admin_set_billing",             { p_tier: null, p_status: "active", p_renews_at: null }, "admin-only"],
];

// A note on what the list above is NOT. Sixteen SECURITY DEFINER functions in
// the schema still carry Postgres's default EXECUTE grant to PUBLIC, and that
// is mostly correct rather than mostly wrong, so they are not targets here:
//   • owns_company, can_touch_company, company_has_feature are called from RLS
//     policy expressions, which are evaluated as the QUERYING role. Revoking
//     them from `authenticated` would make every guarded table return nothing,
//     silently. 0056 records nearly making exactly that mistake.
//   • feed_latest, feed_discover, feed_following, am_following, post_engagement
//     and company_follower_count are the investor app's and the public site's
//     read surface, intentionally reachable.
//   • my_company_role, my_features and portal_readiness take no tenant
//     argument; they report on auth.uid() and cannot be aimed at a company.
//   • sync_owner_membership is a trigger function, which needs no caller grant.
// That leaves accept_company_invitation, create_company_invitation and
// bump_conversation as the only three worth a second look, and all three guard
// internally. None of them is a tenant boundary of the p_company shape, so they
// belong to a grant review, not to this suite.
