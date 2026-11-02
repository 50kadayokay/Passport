# Production test accounts for the post-launch smoke

`scripts/production-smoke.mjs` (launch gate g11) needs these accounts in production:

| Variable | What it is | Required |
|---|---|---|
| `SMOKE_INVESTOR_EMAIL` / `SMOKE_INVESTOR_PASSWORD` | an investor | yes |
| `SMOKE_OWNER_EMAIL` / `SMOKE_OWNER_PASSWORD` | the owner of the test company | yes |
| `SMOKE_VIEWER_EMAIL` / `SMOKE_VIEWER_PASSWORD` | a viewer of the test company | optional (adds the viewer refusals) |
| `SMOKE_COMPANY_SLUG` | the test company's slug | recommended |

**Only you do these steps.** No SQL is needed. Each step uses the Supabase dashboard, the MineEx admin
console or the portal, exactly as a real company is onboarded. Nobody else needs the passwords.

## 0. Before you start

- Create four entries in your password manager: the three users, plus a note for the company. Let it generate
  each password (long and random) and choose the emails. Use addresses you control; plus-addressing is fine,
  for example `you+smoke-owner@…`, `you+smoke-viewer@…`, `you+smoke-investor@…`.
- Choose a company name and slug that no real company will ever match: name
  **`ZZ Smoke Test (internal, not a company)`**. The admin console derives the slug from the name:
  **`zz-smoke-test-internal-not-a-company`**. The news importer creates and links companies by name, so a realistic name is a risk.

## 1. The three users (Supabase dashboard)

Production project → **Authentication → Users → Add user → Create new user**, once for each of the three emails:

- Paste the password from your password manager.
- Tick **Auto Confirm User**. The smoke signs in with a password, which fails for an unconfirmed address.

The sign-up trigger (`handle_new_user`) makes every new user an **investor**. That is final for the investor,
and the next steps change the other two. Don't use the public sign-up page for these; it would send
confirmation emails and nothing else differs.

## 2. The test company (MineEx admin console)

1. Sign in at `/admin` with your platform-admin account.
2. Open **Bulk-add listings** and paste the one line `ZZ Smoke Test (internal, not a company)`. Check that it
   says **1 new**, then add it.
3. **Do not publish it.** It is created as a **draft**, and draft is what hides it (section 5). Never press
   "review and publish" or go-live on it.

## 3. Hand it to the owner

1. In the admin console, select the test company → **Hand off** → enter the owner email → copy the link
   (`/portal?invite=…`; it expires after 14 days).
2. In a private browser window, open the link and sign in as the owner.

Accepting the invite does everything the portal needs:
- it makes that user the company's owner (owner membership and `owner_id`);
- it sets their profile role to `company`;
- it creates an **active subscription** on the free `passport` plan, which includes portal access.

No Stripe, no payment and no admin billing change are involved.

If the portal shows the company agreement, accepting it is fine. That is setup, not part of the smoke.

## 4. The viewer (optional; the portal's Team page)

1. Still signed in as the owner: **Settings → Team → Invite someone**, enter the viewer email, choose the role
   **Viewer**, and copy the link.
2. In a fresh private window, open the link and sign in as the viewer.

This adds a viewer membership and nothing else; the viewer's profile stays `investor`. Don't use the admin
**Hand off** for the viewer: that is the owner handoff, and it would make them a company account.

Then close every window. Do nothing else as these users. In particular, don't upload documents, write or
publish releases, edit or publish the profile, send messages, or set up a booth. Some of those records are
append-only and would block deleting the company later (section 7).

## 5. Why the test company stays invisible

Its only hiding control is `companies.status`, which can be `draft` or `published`. Staying `draft` keeps it
out of every investor-facing place:

| Where | What keeps a draft out |
|---|---|
| Company list, directory, search, profile pages (web and the installed apps) | RLS on `companies`: anon sees `status = 'published'` only (0001). Signed-in users also see rows they own or belong to (0001, 0076). The directory also filters `status=eq.published` itself. |
| News feed, `feed_*` | posts are readable only when the company is published (0009). The news importer links items only to published companies (`api/news-process.js`). |
| Mine IQ, notifications | owner and members only (`owns_company`); anon cannot execute them. |
| `/api/site-content`, `/api/market-pull`, share and OG pages | published only, or a site token the test company never gets. |

Two known edges:
- Anyone holding the company's **preview link** (`preview_token`, shown in the admin console) can see the draft. Don't share it.
- `/api/messages` looks a slug up with the service role and does not check status. A signed-in investor who
  types its slug could start a thread with it. That is harmless for a test company, and it is tracked
  as an S3 follow-up.

**The draft does not stop the smoke.** Every owner check (portal access, role, notifications, Mine IQ,
billing read) depends on membership and the subscription, not on status. The investor checks read a real
published company (the first in the public list), because the test company is not public. They only read it.

## 6. What the smoke writes: nothing of yours

- The script refuses every request except GET/HEAD, the password sign-in, sign-out, and POSTs to five read-only
  RPCs: `company_follower_count`, `my_features`, `company_notifications`, `has_company_role`, `mineiq_search`.
  All five are declared `stable`, and Postgres refuses writes inside them. `production-smoke-test.mjs` proves the guard.
- It does not call analytics (`record_company_events`), messaging, Clear all, or anything that publishes.
- It checks the viewer's refusals by asking `has_company_role`, never by trying the write.
- **Supabase Auth itself records the sign-ins:**
  - a session and refresh token, closed when the smoke signs out at the end;
  - `last_sign_in_at`;
  - Auth audit-log entries.
  That is all it records.

## 7. Running it (your shell only)

The passwords live in your password manager. They go into the environment of **one shell you opened yourself**,
for one run. Never put them in chat, a file in the repository, a `.env` file, or shell history.

```bash
export SMOKE_INVESTOR_EMAIL='…' SMOKE_OWNER_EMAIL='…' SMOKE_VIEWER_EMAIL='…' SMOKE_COMPANY_SLUG='zz-smoke-test-internal-not-a-company'
```

```bash
read -rs "SMOKE_INVESTOR_PASSWORD?investor password: " && export SMOKE_INVESTOR_PASSWORD; echo
```

```bash
read -rs "SMOKE_OWNER_PASSWORD?owner password: " && export SMOKE_OWNER_PASSWORD; echo
```

```bash
read -rs "SMOKE_VIEWER_PASSWORD?viewer password: " && export SMOKE_VIEWER_PASSWORD; echo
```

(`read -rs` takes the password without echoing it or saving it to history; the `?prompt` form is zsh's.
If your password manager has a CLI that injects secrets into one command, that works too.)

```bash
node scripts/production-smoke.mjs --app <production app URL> --supabase https://rvptronniomlqumjhyrr.supabase.co --production
```

It never prints a password or token. Exit codes: 0 PASS, 1 FAIL, 2 REFUSED, 3 INCOMPLETE (an account
missing). Afterwards, close that shell or run `unset SMOKE_INVESTOR_PASSWORD SMOKE_OWNER_PASSWORD SMOKE_VIEWER_PASSWORD`.

## 8. Removing everything after the pilot

The order matters: delete the company first, then the users. The company's `owner_id` and the accepted
invitation still point at the users, so deleting the users first fails.

1. **Company:** admin console → select `zz-smoke-test-internal-not-a-company` → the trash icon → **Yes**. Its memberships, invitations,
   subscription, notification state and other company rows go with it.
   - If the delete fails, someone uploaded a document or published a release on it (append-only records,
     section 4). Stop and ask; don't force it.
2. **Users:** Supabase dashboard → Authentication → Users → delete the owner, the viewer and the investor.
   Their profiles go with them.
3. Delete the four password-manager entries, or mark them retired.
4. To check: the admin console no longer lists the company, and signing in as any of the three fails.

To keep the accounts for later smokes, skip this section; nothing about them expires. The only exception is
an unaccepted invitation link, which expires after 14 days.
