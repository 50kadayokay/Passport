# S3 — Experience & access: status

Branch `claude/portal-s3-experience-bdec7b` (worktree `.claude/worktrees/portal-s3-experience-bdec7b`),
from `8b9e18f`. Local commits only: nothing pushed, merged, deployed or applied.
No migrations written (0090–0094 unused). No staging or Stripe access used.

## Items

| Item | State | Commits | Offline evidence | Needs S4 live |
|---|---|---|---|---|
| a02 gate + shell | implemented, offline-tested | `5764c45` (+ `1bf1fb9`, see note) | `portal-gate-test` 60/0; qa/s3 browser run | yes, see below |
| a10 messaging UI | implemented, offline-tested | `cfc8366`, `359fd48` | `messaging-ui-test` 34/0; `messaging-flow-test` 75/0; qa/s3 click-through | yes |
| a20 billing / Stripe | implemented, offline-tested | `1bf1fb9` | `billing-ui-test` 41/0 (real handlers, Stripe stubbed); `billing-access-test` 59/0 | Stripe test mode needs the user's keys + approval |
| a28 states + narrow | implemented for my pages; S1/S2 defects listed below | `18a7852`, `359fd48` | `admin-app-links-test` 9/0; qa/s3 browser run | no |
| a16 Conference | verified (reading + harness); 2 S2 defects; QR & Share draft warning fixed (mine) | `see below` | see "a16" below | — |

Also passing on this branch: `company-roles-ui-test` 50/0, `check-imports` ok, `npm run build` ok
(harness not in `dist/`).

Note for integration: `PortalGate.jsx` (a02 commit) imports `src/portal/Billing.jsx`, which
lands in the a20 commit. Merge the commits together, not a02 alone.

## a02 — what changed
Defects found and fixed in `PortalGate.jsx` (new `src/lib/portalGate.js`):
- A failed or refused lookup told a company member **"No company portal on this account"**
  (memberships) or **"Subscription needed"** (entitlement): the old helpers return `[]` for every
  failure. Now: server refused token (401) → "Your session has expired"; network/5xx/junk →
  "Couldn't load your portal" with Retry.
- A click in the multi-company chooser that threw left the loader up forever.
- Platform admin with an unknown `?company=` slug → "Company not found" (was generic error).
- A missing/malformed membership role entered as whatever `|| "owner"` fallbacks gave; now viewer.
- Locked screen: "Check again", "Choose another company" (multi), and the billing panel for
  owners/admins (a past-due card company could not reach Billing at all). Copy names the actual
  state (payment failed / active-but-no-access / ended).
Covered by `scripts/portal-gate-test.mjs`: signed out, investor, chooser (both outcomes),
subscription needed per role, platform admin (+ forged `?company=`), "Admins only" at /admin,
expired session (refresh refused / refresh OK / 401), lookup failures, invitation links, role
normalisation, each role's shell controls. Browser (qa/s3) confirmed each screen and the
chooser → locked → billing path.

## a10 — what changed
- **Replies in a thread the company started were refused by RLS** (sent as `sender='company'`;
  0076 needs `'investor'`, the initiating side). Fixed via `mySide()`.
- Those threads showed our messages as the other side's, were named after our own user,
  counted as unread forever (inbox and sidebar badge), and were "marked read" (0047 refuses).
- After "New", the new thread sat on a spinner until the next 20 s poll.
- Files staged in one thread were sent with the next thread's reply.
- Failed inbox read → "No messages yet"; failed poll blanked the open thread; expired session
  → "You do not have access". All now honest.
- Read-only for analyst/viewer per a03 (New, compose, reply hidden; notice shown) — unchanged,
  verified. Attachments: UI unchanged; upload into a company-started thread not verified
  (needs live storage policy check, below).

## a20 — what changed (`src/portal/Billing.jsx`, `src/lib/billing.js`)
States shown honestly: loading (no plan buttons yet), couldn't load (Retry), none, active card
("Renews"), active invoiced ("Paid through"), past due (card: "Update payment method"),
cancelled ("ended"), expired-but-active per 0033 ("Expired"). Fixed: past-due had no way to the
Stripe portal; an active plan could start a second checkout for the other tier ("Contact us to
switch" now); `?checkout=success|cancelled` and `?section=billing` return URLs were ignored (now
open Settings → Billing with a notice; the URL is cleaned); `/api/stripe-*` were called with the
anon fallback (expired session read as a role error); any redirect URL was followed (https only).

## a28 — what changed (my pages)
- Admin "View Company" / "Open Conference Mode" / preview links opened production from staging.
  `src/admin/appLinks.js`: same origin as the admin console (prod → prod, staging → staging);
  printed QR codes keep the fixed public origin.
- **Documents now has a home**: sidebar item after Mine IQ. Upload/delete for drafting roles
  (0076/0078); analysts/viewers open and download. Delete confirms (permanent), reports failure;
  failed list read is not "No documents yet"; date-only `doc_date` no longer shows the day before.
- Notifications: only a missing 0049 says "needs a database update"; other failures say
  "couldn't load"; failed "Clear all" says so.
- Team: malformed answer no longer crashes; no "Invalid Date"; Retry; blocked clipboard reported.
- Updates: single page heading (Messages/Notifications h1 suppressed, as Content/Conference do).
- Narrow width: the portal renders only at ≥1024px (`DesktopOnly` in main.jsx). At 1024 no section
  overflows horizontally (checked: home, updates, documents, settings, conference).

## Needs S4 live tests (staging)
1. Gate: real 401 path — sign in, revoke/expire the session server-side, reload /portal →
   "Your session has expired" (not "No company portal"). Investor account → denied screen.
   Unentitled company owner → locked screen with billing panel; reading `company_subscriptions`
   while locked works (`can_touch_company` is membership-based — please confirm).
2. Messaging: company A starts a thread with B in the **portal UI**, then A replies again from the
   portal (should now be 201 as `sender='investor'`); B replies; A's inbox shows "Gamma…"-style
   name and no unread dot. Analyst/viewer of A: no New / no reply box.
3. Attachments on a company-started thread (upload as A's editor) — not verified anywhere yet.
4. Billing: Stripe test mode end to end needs the user's test keys and approval (not done).
5. Documents: analyst sees no upload/delete; editor uploads and deletes (0078 on staging).

## Requests to other sessions (via S4)
- **S4 / package.json:** add to `npm test`: `node scripts/portal-gate-test.mjs`,
  `node scripts/billing-ui-test.mjs`, `node scripts/messaging-ui-test.mjs`,
  `node scripts/admin-app-links-test.mjs`. Each is offline (fetch answered in-process).
- **S4 / src/main.jsx (owner unclear):** `DesktopOnly` wraps /portal but always says
  "Onboarding is a desktop tool … Building a company profile needs a larger screen" — wrong page
  name for portal users at <1024px. Suggest a `label` prop ("The Company Portal is a desktop tool").
- **S4 / src/auth/AuthGate.jsx (owner unclear):** with `requireAdmin`, `getMyRole()` throwing
  (offline) leaves the loader up forever (`.then` with no catch). Suggest
  `.catch(() => setRole("error"))` and a "Couldn't check access — Retry" screen.
- **S4 / src/lib/memory.js (owner unclear):** `listDocuments()` returns `[]` on failure; Documents
  now uses its own strict read, but other callers still show "nothing" on error.
- **S4 finding carried over:** viewers can "Clear all" notifications for the whole company
  (0064 RPC has no role check). Not in the a03 matrix; needs a decision before a fix.
- S1 / S2 page defects: see below.

## S1 pages — defects found (not edited)
Read-only code review (subagent), lines as of `8b9e18f`. Not re-verified in a browser unless marked ✔.
- [high] `src/lib/mineiqChat.js:52-60` → MineIQ: any failed probe (network/5xx/401) switches to
  `mode="local"` for good — "Kept in this browser only", new chats written to localStorage. Only a 404 should.
- [med] `MineIQ.jsx:433-436`: "Try again" builds from the stale `thread`, so the question appears twice.
- [low] `mineiqChat.js:95-107` → `MineIQ.jsx:254-265`: a user turn with no assistant row renders blank; Copy writes "undefined".
- [high] `MediaPage.jsx:423` + `mediaPosts.js:36,40`: any fetch failure shows "No media yet".
- [low] `MediaPage.jsx:136`: missing `publishedAt` → "Photo · ".
- [high] `publishDrafts.js:183,198` (`listDrafts`/`listPublished` return [] on `!r.ok`) → ReleaseLibrary
  "No press releases yet" with no error.
- [med] `Publish.jsx:62`: on throw both lists become [], so the error banner sits above "No press releases yet".
- [high] `CreateRelease.jsx:414-458`: reopen IIFE has no try/catch; `getDraft` throwing leaves `phase` "loading" forever.
- [high] `CreateRelease.jsx:440-448, 962, 1013`: a published release whose publications lookup fails leaves
  `pubId` null and offers "Publish to MineEx" again (re-announce risk).
- [med] `CreateRelease.jsx:451-455` + `mediaAssets.js:284-285`: failed asset list → "No images were found" and
  `sanitizeSelection` empties the saved selection.
- [low] `CreateRelease.jsx:802-831`: reopening a draft shows "Uploading your file" with no active step.
- [med] `DraftRelease.jsx:176/188/202`: response without `text` → `text.trim()` crash at :241.
- [med] `ProfileEditor.jsx:649/959`: company with no slug → "Loading profile…" forever.
- [low] `ProfileEditor.jsx:928`: `ok` without `versions` → "Loading history…" forever; `:1605` "saved by undefined".
- [low] `Content.jsx:29-31`: Suspense fallback is plain "Loading…" text, unlike other pages.

## S2 pages — defects found (not edited)
- [med] `Conference.jsx:322-326, 350-352`: QR generation failure (or empty slug) leaves the spinner forever.
- [med] `Conference.jsx:189-194` and `:459-462`: "See it with your data" / "Preview presentation" are not gated on
  published; a draft company opens the booth's "profile unavailable" screen.
- [low] `Conference.jsx:116`: corrupt localStorage date → "Sent from this browser on Invalid Date".
- [med] `Conference` via `lib/conference.js:45-52`: if `my_features` fails but `company_features` succeeds, a paying
  customer sees the sales page with no notice. ✔ reproduced in qa/s3 (`conf=featuresdown`).
- [low] `Conference.jsx:536-539`: "Try again" doesn't reset `ent`, so no feedback.
- [med] `Analytics.jsx:537-539`: `content === null` always says "needs a database update", even for an outage.
- [med] `Analytics.jsx:537-562`: while content loads, "Nothing published in this category yet."
- [low] `Analytics.jsx:361, 486-489`: while `byType` loads, tiles show real 0s.
- `Services.jsx`: no defects found.

## a16 — Conference Mode entitlement / preview / QR
Verified by code reading and in qa/s3 (`conf=active|off|featuresdown`, `draft=1`):
- **No entitlement** (every company until 0067 is applied): sales page, no price, request form. Honest. ✔
- **Entitled**: "Active", template/theme ("Using defaults" until set), preview link, iPad URL
  `mineex.ca/conference?c=…`, change request, QR panel, analytics "not measured". Honest. ✔
- **Switched off** (`company_features.enabled=false`): "Conference Mode is switched off" + note, then sales page. ✔
- **Draft profile**: Conference QR panel warns "Not ready to print" (honest); preview links not gated (S2 defect
  above). Portal's QR & Share tab had no warning at all — **fixed in my file** (`Portal.jsx`, same wording). ✔
- **Lookup failing**: see the `my_features` defect above (S2). If only `company_features` fails: amber
  "could not be confirmed" + Try again. Loader can't hang.
Conclusion: a16 states are right except the two S2 items (partial-failure → sales page; draft preview links).

## Harness
`qa/s3/index.html` + `harness.jsx`: the real AuthGate → PortalGate → Portal tree with every
request answered in-page (Supabase and /api). Start with the stub URL so nothing can leak:
`VITE_SUPABASE_URL=https://stub-project.supabase.invalid VITE_SUPABASE_ANON_KEY=stub node node_modules/vite/bin/vite.js --port 4353`,
then `/qa/s3/?as=owner|editor|analyst|viewer|investor|multi|platform|none&sub=…&fail=…&section=…`
(parameters documented at the top of harness.jsx). Dev server only; `vite build` does not include it.
