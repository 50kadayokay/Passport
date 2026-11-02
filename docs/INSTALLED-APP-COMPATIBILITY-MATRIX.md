# Installed investor apps vs the production rollout: compatibility matrix (2026-11-02)

**Status: static audit only.** Nothing was run against staging or production. Every
verdict below comes from reading the shipped source (`git show <ref>:<file>`) and
the pending migration SQL. `scripts/installed-app-compat-matrix-test.mjs` (offline)
asserts the matrix against that SQL.

## Builds covered

The native shell ships its web bundle, so a phone runs the code of its store build
until the user updates. Every build calls the production API at
`https://passport-xi-five.vercel.app` (`src/lib/platform.js`), so after Phase 1
**old clients talk to the new API**.

| Build | Ref | Notes |
|---|---|---|
| 1.3.2 (19) | `prod-v1.3.2` (15f9ec0) | Current store build. Adds the owner's company-profile editor (`?manage=`), push via `claim_push_token`, and likes. |
| 1.3.1 (17) | 9761492 | Push upserts `push_tokens` directly. No owner editor. |
| 1.1 (6) / 1.0 (5) | c1bf1b7 / dff4f8d | August builds. They make the same investor calls as 1.3.1, without push or likes. |

Every older build makes a subset of 1.3.2's calls, plus 1.3.1's direct `push_tokens` upsert (I22).

None of them uses realtime: "new posts" and threads are polled over REST.

## Columns

- **(a)** after the Phase 1 web/API deploy, before any migration
- **(b)** after Phase 3 (0058, 0077, 0092, 0093, 0061a)
- **(c)** after Phase 4 (0062–0066)
- **(d)** after Phase 5 (0068–0078)
- **(e)** after Phase 5b (0080–0091)

Each phase includes the ones before it.

Legend:
- ✅ works as today;
- ⚠️ works, but its behaviour changes (see the notes);
- ❌ refused.

Line numbers refer to `prod-v1.3.2`.

## Installed native apps

<!-- matrix:start -->
| # | Call (prod-v1.3.2 source) | (a) | (b) | (c) | (d) | (e) |
|---|---|---|---|---|---|---|
| I01 | `news_public` SELECT, anon (`lib/news.js:29`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| I02 | `posts` SELECT: feed, company posts, the new-posts count, `media_url` (`lib/feed.js:104,149,164`; `main.jsx:729`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| I03 | `companies` SELECT: the directory (anon), the signed-in single-company read and feed cards (`main.jsx:821,860`; `lib/feed.js:119`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| I04 | `companies` PATCH `profile`: the 1.3.2 owner editor (`PassportProto.jsx:9769` → `lib/portal.js:161`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| I05 | `company_memberships` SELECT of the caller's own role, for manage mode (`main.jsx:883`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| I06 | Storage upload to `company-media` with `x-upsert` in the uploader's folder: the 1.3.2 owner editor (`lib/storage.js:17`) | ✅ | ✅ | ✅ | ⚠️ | ⚠️ |
| I07 | Storage public read and `render/image` from `company-media` (`PassportProto.jsx:200`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| I08 | Upserts with merge-duplicates on `investor_profiles`, `investor_preferences` and `notification_preferences`; `post_saves` with ignore-duplicates (`lib/investorData.js:106,138,241,278`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| I10 | `user_company_relationships`: upsert with merge-duplicates and return=representation, plus SELECT and DELETE. This is the in-app Follow, Favourite and Watch (`lib/investorData.js:172,181,191`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| I11 | `post_likes`: INSERT with ignore-duplicates, plus SELECT and DELETE (`lib/investorData.js:198,211,221`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| I12 | `company_follows` INSERT with **merge-duplicates**: `follow()` on the `/p/<id>` page (`lib/feed.js:23`) | ✅ | ❌ | ❌ | ❌ | ❌ |
| I13 | `company_follows` SELECT and DELETE: `isFollowing` and `unfollow` (`lib/feed.js:37,47,72`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| I14 | `post_events` INSERT of `open`, `dwell`, `like` and `save`, return=minimal (`lib/feed.js:184`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| I15 | `listing_reports` INSERT with the anon key: one row, six columns, return=minimal (`PassportProto.jsx:10237`) | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| I16 | `notifications` list, count and PATCH `read_at`; `notification_prefs` read and write (`lib/notifications.js:11–65`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| I17 | `conversations` SELECT: the inbox (`PassportProto.jsx:8817`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| I18 | `messages` SELECT: a thread (`PassportProto.jsx:8837`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| I19 | `profiles` SELECT of `role` (`lib/auth.js:214`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| I20 | `POST /api/messages` with `{ companySlug, body }` and the Bearer session (`PassportProto.jsx:8859`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| I21 | RPCs: `company_follower_count`, `get_preview_company`, `delete_own_account`, `claim_push_token`, `release_push_token`, `company_followers_list` | ✅ | ✅ | ✅ | ✅ | ✅ |
| I22 | 1.3.1 only: `push_tokens` upsert with merge-duplicates (`9761492:src/lib/push.js:24`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| I23 | `delete_own_account` completes for an investor: no new FK to `auth.users` blocks it | ✅ | ✅ | ✅ | ✅ | ✅ |
| I24 | Sign-up creates one profile (0059 is already applied, so it is not part of this rollout) | ✅ | ✅ | ✅ | ✅ | ✅ |
<!-- matrix:end -->

## The web app at /app (redeployed in Phase 1)

`/app` serves the current code from Phase 1 on. Its service worker fetches page loads from the network first, so a reload picks up the new code. A tab left open keeps the old JavaScript until it is reloaded. Until then it behaves like the installed rows above, including I12.

The staging suites (`investor-app-live-test`, `messaging-schema-compat-check`) cover the current code with every migration applied. These rows cover the gap between Phase 1 and each migration landing:

<!-- web-matrix:start -->
| # | Call (current source) | (a) | (b) | (c) | (d) | (e) |
|---|---|---|---|---|---|---|
| W01 | `follow()` uses ignore-duplicates, so it needs no UPDATE (`lib/feed.js`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| W02 | Listing report, contact and demo go through `/api/submit` as the service role, which 0093 does not limit | ✅ | ✅ | ✅ | ✅ | ✅ |
| W03 | Message attachments: the app shows none until 0062 exists (`lib/attachments.js`) | ⚠️ | ⚠️ | ✅ | ✅ | ✅ |
| W04 | `record_post_impressions`: the 404 is dropped until 0073b exists (`lib/impressions.js`) | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ |
| W05 | `record_company_events`: the 404 is dropped until 0087 exists (`lib/analytics.js`) | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| W06 | The profile editor via `/api/profile-draft`, on the web and in the next store build: 503 "profile drafts need migration 0072" until Phase 5 | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ |
<!-- web-matrix:end -->

## The one break: I12, `company_follows` after 0061a

**What breaks.**
- Every installed build's `follow()` (`src/lib/feed.js`) sends `Prefer: resolution=merge-duplicates`.
- PostgREST turns that into `INSERT … ON CONFLICT (id) DO UPDATE SET user_id, company_id`.
- PostgreSQL requires the UPDATE privilege on those columns for any ON CONFLICT DO UPDATE, even when no conflict happens.
- **0061a** (Phase 3) revokes all privileges and grants back only `select, insert, delete`. The request then fails with 42501.

0061a's own header expects this. It removes the need for UPDATE through "the accompanying patch", which changed `follow()` to ignore-duplicates (3212e72, 2026-10-29). That patch is not in any store build: `prod-v1.3.2` was tagged on 2026-10-26.

**Who is affected.**
- **Native shells: no one in practice.** `FollowButton` is rendered only on the `/p/<id>` page (`Feed.jsx`), which `main.jsx` routes by path. The shell always boots at `/`, so that page cannot be reached. Every in-app Follow, Favourite and Watch writes `user_company_relationships` instead (I10), and 0061a grants UPDATE there.
- **Web:** after Phase 1, `/p/<id>` serves the fixed code. Only a tab still running the pre-deploy bundle hits the break: the Follow button snaps back.

**Minimal fix, if you want installed and stale clients covered too.** Add this one line to 0061a, which is still unapplied, or to a follow-up migration:

```sql
grant update (user_id, company_id) on public.company_follows to authenticated;
```

`company_follows` has no non-admin UPDATE policy (0009 defines `own_select`, `own_insert`, `own_delete` and `admin_all`). So RLS still refuses every real UPDATE, and the grant only satisfies the planner's privilege check. The offline test verifies that this line satisfies I12.

Nothing was changed: 0061a isn't S3's file, and the decision is yours.

**Not verified live.** `investor-app-live-test` follows with `Prefer: return=minimal`, not the app's header, so it could not see this. To confirm on staging (where 0061a is applied), run one request as a throwaway investor:

```
POST /rest/v1/company_follows   Prefer: resolution=merge-duplicates,return=minimal
```

Expect 401/403 with code 42501. With the grant above, expect 201.

## Notes on the ⚠️ cells and on behaviour the matrix doesn't capture

1. **I15, listing reports, Phase 3.**
   - 0058 closes anon INSERT and 0077 reopens it. They are separate transactions in one runner session, so for the seconds between the two commits an installed report fails.
   - After 0077:
     - `message` over 4000 characters, or `contact` or `company_name` over 200, is refused. The installed textarea has no limit.
     - Kinds are `error` and `claim`, which is all the installed app sends.
   - After 0092: the six columns the app sends are exactly the six granted.
   - After 0093, a seventh report is refused in any of these cases:
     - a sixth report from one IP within 10 minutes;
     - more than 20 within an hour from one /24 (or /48) network;
     - more than 600 within an hour globally.
   - A refused report shows the sheet's generic error. Behind conference Wi-Fi (one public IP), the per-client and per-network limits apply to the whole venue. That is the accepted pilot design, not a break.
2. **I06, storage, Phase 5 (0078).** Uploads now need staff status: the `owner_id` owner, an active owner/admin/editor/publisher member, or a platform admin.
   - In 1.3.2's manage mode, a viewer or analyst member is now refused. The editor swallows the upload error and keeps the old photo.
   - Their profile PATCH was already refused, because 0001's `auth_update` admits only the owner. Owners are unaffected.
3. **I04, owner edits after 0072.**
   - The 1.3.2 editor writes `companies.profile` live, bypassing drafts. That is today's behaviour, unchanged.
   - If a portal draft is open at the time, its later publish is refused by the fingerprint check. That is the designed conflict detection, not data loss.
4. **I17, inbox after 0063.** A user who is also company staff may see threads their company started listed among their own, because `investor_id` is the acting user. The display is read-only; investors are unaffected.
5. **I20, `/api/messages` from the new API.**
   - The send shape, the session requirement and the reply (`ok`, `conversationId`) are unchanged.
   - New: a message to an unpublished company gets 404 `company-not-found`, the same answer as an unknown slug, unless a thread already exists.
   - Neither the old nor the new API sends CORS headers, and the shell has no `CapacitorHttp`. So whether native sends get through today is not settled by this audit: the rollout neither fixes nor breaks it. Not verified on a device.
6. **I23, account deletion.** New FKs to `auth.users` either cascade or set null, except `site_credentials.created_by` (0068) and `company_profile_drafts.created_by` / `updated_by` (0072). Only company staff create those rows. Staff deletion was already blocked by older FKs (for example `activity_log.actor_id`), so the class is unchanged.
7. **W06, the next store build (Phase 2).** Its profile editor uses `/api/profile-draft`. If that build reaches users before Phase 5, owners get an honest "needs migration 0072" error instead of a save. There is no false success. Sequencing note only.

## Method

1. I exported the four builds from git (read-only) and ran `scripts/surface-inventory.mjs` on each. I then read every REST, RPC, storage and `/api` call site in the investor app, the app shell and `lib/`, along with its method, Prefer header, columns and payload.
2. For each table, RPC and storage policy those calls use, I listed every pending migration that mentions it, using the phases in `PRODUCTION-ROLLOUT-PLAN.md`. I read each GRANT, REVOKE, policy, trigger and function change.
3. The offline test replays the GRANT/REVOKE statements phase by phase on the tables the app writes. Rows the grant model cannot decide get targeted assertions on the SQL. When the refs are in the clone, it also re-checks the frozen call shapes against each build.
