# Deployment manifest

What is applied to production, what is deferred, what is superseded, and why.

There is no ledger table — migrations are applied by hand through the Supabase SQL
editor — so this file **is** the ledger. It is derived from live catalog metadata,
not from memory: `supabase/audit/schema_snapshot_oneshot.sql` run against
production, diffed against what each migration creates.

Status vocabulary, used strictly:

| Status | Meaning |
|---|---|
| **APPLIED** | Its objects exist live and were verified |
| **DEFERRED** | Deliberately not applied. The feature is not wanted *yet*. Keep the file |
| **SUPERSEDED** | Was applied; a later migration replaced its effect. Keep for history |
| **PENDING** | Written this session, not yet applied, awaiting approval |

---

## DEFERRED — five migrations, kept on purpose

Per decision 2026-10-07: **keep all six tables and their migrations. Do not
delete them, and do not apply them to production merely to eliminate a schema
difference.** They are deferred until it is established whether the features are
required.

| Migration | Creates | Verified absent live | Why deferred |
|---|---|---|---|
| `0011_outbox_ops` | `app_secrets`, `outbox_health()`, `reconcile_outbox()` | 0/1 tables, 0/2 functions | Operator tooling for the outbox. The dispatcher runs without it; these are diagnostics |
| `0027_market_quotes` | `quotes` | 0/1 tables | Market-price feature, not built |
| `0028_story_studio` | `brand_kits`, `story_projects`, `story_renders` | 0/3 tables | Story Studio, not shipped |
| `0029_company_self_serve` | `company_claims` | 0/1 tables | Self-serve claim flow. Companies are provisioned by concierge (`0023`) instead |
| `0055_enable_device_push` | push arming | — | Arms real notifications to investors' phones. Requires `0041` (main) first |

**`0029` is cleanly unapplied, not partial.** Its `company_owner_guard()` *is*
live, which looks like partial application — but `0030` and `0031` also define
that function with `create or replace`, and the live definition carries `0031`'s
`app.provisioning` bypass. The function comes from `0031`.

### How a replay handles them

Not by skipping silently. `scripts/replay-migrations.mjs` reads this file,
classifies **every** migration, and **refuses to run** if any file is
unclassified. Deferred ones are skipped loudly, named in the output and recorded
in the replay report, so a staging schema that contains the six tables is an
explained difference rather than a surprise.

A staging replay **will create all six**, because replay applies the file set.
That is the expected divergence recorded in the comparison, not drift.

---

## DEFERRED — prerequisite ordering

```
0041  outbox claim lease   (from main)  — PREREQUISITE for 0055. Without it two
                                          overlapping sender runs claim the same
                                          rows and deliver twice.
0055  enable device push               — arms real notifications.
```

Apply in that order, and only when investors' phones are meant to buzz.

---

## APPLIED 2026-10-08, verified

| Migration | Evidence |
|---|---|
| `0057_submission_throttle` | Both tables present, RLS on with **0 policies**, browser grants `[]`, function ACLs `postgres \| service_role` only, `search_path = public, pg_temp` on all three. Counter test: 20 calls → 20 distinct values, 1–20, final 20. Kill switch verified **both ways** — `enabled=false` → endpoints `503 ai-disabled-db`, re-enabled → back to normal |
| `0060_publish_actor_hardening` | `publish_publication` went from `=X/postgres \| anon=X \| authenticated=X \| service_role=X` to `postgres=X/postgres \| service_role=X/postgres` — matching the already-hardened `revise_publication` and `unpublish_publication`. The 2-arg signature from `0008` no longer exists, so the guarded second revoke was a no-op |

Note on `0060`: the revoke had to name **`public`**, not just `anon, authenticated`.
The leading `=X/` in an aclitem is the grant to PUBLIC and every role belongs to
it, so an earlier draft that revoked only the two named roles would have closed
nothing. All 13 pre-existing revokes in this set include `public`.

## APPLIED earlier and verified

From the live metadata: 62 tables, 71 functions, 43 triggers, 7 event triggers,
4 storage buckets, 12 storage policies.

```
0001–0010   foundation, storage, RLS lockdown, comms, portal, invitations,
            publish spine, feed listeners, publish lockdown
0012–0026   blueprints, profile versions, messaging, investor accounts,
            listing reports, news foundation, AI usage, account types,
            news automation, push notifications
0030–0040   selfserve fixes, invite provisioning, admin billing, agreements,
            publish timeline, storage docs authorization, media assets,
            media asset sources, storage write fix
0041        source_transcripts        (from portal-work)
0042        push token ownership      (from main — closed a live privacy bug)
0042        source_inventories        (from portal-work)
0043–0046   verification canonical, privilege hardening, service-role no-direct-writes
0047        company messaging access
0048        company engagement analytics
0049        company notifications
0050a       MineIQ schema, functions, outbox widening
0050b       MineIQ full-text indexes  (CREATE INDEX CONCURRENTLY, one at a time)
0051        release revisions, profile timeline, event chain
0052        messaging privilege hardening
0053        Phase 3 (0041 tables) privilege hardening
0054        Phase 3 (0041 tables) immutability triggers
0056        function EXECUTE hardening
```

### The 0041 / 0042 number collision

Two migrations share each number — written in parallel on `main` and
`portal-work` before either branch saw the other. **Both sets are real and both
are applied.** Deliberately not renumbered: each file records what was pasted
into production under that name, and renaming afterwards would make the history
describe something that never happened. **Read the filename, not the number.**
Everything from `0043` on is unambiguous.

---

## SUPERSEDED

| Migration | What it did | Replaced by |
|---|---|---|
| `0002_storage` policies `pp_public_read`, `pp_auth_read`, `pp_upload_own`, `pp_update_own`, `pp_delete_own` | Broad per-bucket rules | `0037_storage_docs_authorization` and `0040_storage_write_fix` — live policies are `docs_*`, `media_*`, `privmedia_*`. `0002`'s four **buckets** are still live and current |
| `0004_harden_signup_role`'s `handle_new_user()` | Allowlisted role to `('company','investor')` | `0023_account_types` — signup is now always `'investor'`, client metadata ignored entirely. `0004`'s **revokes on `profiles` remain in force** and are load-bearing |
| `0029`/`0030`'s `company_owner_guard()` | Owner-field guard | `0031_invite_provisioning` — adds the `app.provisioning` transaction-local bypass |

---

## PENDING — written this session, not applied

| Migration | What | Risk | Order |
|---|---|---|---|
| `0000_baseline` | The 18 unversioned objects: 4 tables, 3 functions, 3 indexes, 5 policies, 1 trigger, 1 event trigger | **No-op on production** — everything is `IF NOT EXISTS` / `OR REPLACE` / guarded. Needed only so other environments can be built | Staging first |
| `0059_auth_user_trigger` | `on_auth_user_created` on `auth.users` | No-op on production | With `0000` |
| `0058_close_public_insert` | Revokes anon INSERT on the three public forms | **Breaks the forms unless `/api/submit` is deployed first** | After the client ships |

`0000` and `0059` must be applied **as the SQL-editor role (`postgres`)** —
`CREATE EVENT TRIGGER` is privileged. Run as a lesser role, §7 fails while
everything above it succeeds, leaving the RLS net silently missing.

---

## Verifying this file

Re-run `supabase/audit/schema_snapshot_oneshot.sql` and compare. A migration
listed APPLIED whose objects are absent, or DEFERRED whose objects are present,
means this manifest has drifted and is no longer the ledger.

`npm run check:deps` proves every reference in the set resolves in order. It does
**not** prove the set was applied — only a snapshot diff does that.

## Correction from the production read-only audit (2026-11-01)

The audit (`supabase/audit/production_readiness_2026_10_31.sql`, results in the
gitignored `supabase/audit/results/`) verified production directly:

- **Applied:** 0053, 0054, 0056, 0057, 0059, 0060, 0067. 0059's trigger is
  identical to staging, so never run its rollback in production.
- **Pending, previously misclassified as applied by the derived default:**
  0069b, 0071, 0072, 0073a/b/c, 0074, 0075, 0076, plus the new 0077 and 0078. All
  are now in `PENDING` in `scripts/_migration-manifest.mjs`, with ordering in
  `PREREQUISITES`: 0076 after 0072, 0077 after 0058, 0078 after 0076.
- **Still pending as before:** 0058, 0061a, 0062, 0063, 0064, 0065a/b/c, 0066, 0068.
- **Deferred:** 0011, 0027, 0028, 0029, 0055, 0061b.
