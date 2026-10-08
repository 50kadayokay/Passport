// Inventory the tenant-isolation suite runs against. Separated from the runner so
// the target list can be reviewed (and diffed when a migration adds a table)
// without reading the harness.
//
// Derived mechanically from supabase/migrations/*.sql — every table carrying a
// company_id or company_slug column. If you add a company-scoped table and do not
// add it here, scripts/tenant-isolation-test.mjs FAILS on the completeness check
// rather than silently skipping it.

// ---- directly company-scoped: the column names the tenant ------------------
export const COMPANY_SCOPED = [
  ["activity_log", "company_id"],
  ["brand_kits", "company_id"],
  ["canonical_sources", "company_id"],
  ["canonical_spans", "company_id"],
  ["company_agreement_acceptances", "company_id"],
  ["company_blueprints", "company_id"],
  ["company_claims", "company_slug"],
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

// ---- every serverless route, with the guard each one is SUPPOSED to have ---
// Deliberately NOT derived by grepping the source: every endpoint in this repo
// rolls its own auth helper (messages.js has a local authUser(), dispatch.js
// checks x-dispatch-secret, publish.js uses _service.js's verifyUser, compose.js
// uses _supabase.js's verifyBearer), so static detection produces false
// positives in both directions. The suite PROBES each route instead.
//
// expect: "user"    -> 401/403 without a valid user JWT
//         "secret"  -> 401 without the shared secret
//         "admin"   -> 403 for a non-admin user
//         "open"    -> intentionally public; must still refuse cross-tenant writes
export const ENDPOINTS = [
  ["audience-card", "open"],      ["build-from-website", "admin"],
  ["comms-generate", "user"],     ["compose", "user"],
  ["conference-inquiry", "open"], ["contact", "open"],
  ["dispatch", "secret"],         ["extract-company", "admin"],
  ["extract-docx", "user"],       ["extract-projects", "admin"],
  ["extract-text", "admin"],      ["market-pull", "secret"],
  ["messages", "user"],           ["news-broadcast", "admin"],
  ["news-notify", "secret"],      ["news-process", "secret"],
  ["news-pull", "secret"],        ["news-push-send", "secret"],
  ["news-review", "admin"],       ["news-usage", "admin"],
  ["og-news", "open"],            ["publish", "user"],
  ["revise-release", "user"],     ["share-news", "open"],
  ["story-extract", "user"],      ["story-fetch", "user"],
  ["stripe-checkout", "user"],    ["stripe-portal", "user"],
  ["stripe-webhook", "secret"],   ["structure-batch", "admin"],
  ["structure-release", "user"],  ["synthesize-profile", "admin"],
  ["unpublish", "user"],          ["verify-source", "user"],
];

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
