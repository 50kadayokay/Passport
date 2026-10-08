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
  "0055_enable_device_push.sql":
    "Arms real push to investors' phones. Requires 0041 (from main) first, and a deliberate decision.",
};

// Written this session; awaiting approval. Replay applies these in staging.
export const PENDING = {
  "0000_baseline.sql":
    "The 18 unversioned objects. No-op on production; required for every other environment.",
  "0057_submission_throttle.sql":
    "Submission throttle table + atomic increment. Additive.",
  "0058_close_public_insert.sql":
    "Revokes anon INSERT on the three public forms. MUST follow the /api/submit deploy.",
  "0059_auth_user_trigger.sql":
    "on_auth_user_created on auth.users. No-op on production.",
  "0060_publish_actor_hardening.sql":
    "Revokes browser EXECUTE on publish_publication. Drop-in.",
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
};

// Sections that need the SQL-editor role (postgres), not a pooled lesser role.
// CREATE EVENT TRIGGER is privileged: run as the wrong role and the statement
// fails while everything above it succeeds, leaving the RLS net missing.
export const NEEDS_SUPERUSER = {
  "0000_baseline.sql": "section 7 creates the ensure_rls EVENT TRIGGER",
};
