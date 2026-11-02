# Phase 3 — securing the public submission forms

## What was wrong

`contact_submissions`, `demo_bookings` and `listing_reports` each carried an
INSERT policy of `with check (true)` for the `anon` role. The anon key ships
inside the client bundle, so **anyone who loaded mineex.ca could insert unlimited
rows of arbitrary content into three production tables** — no size limit, no rate
limit, no validation, no spam gate.

Reads were never exposed. RLS is enabled on all three and the SELECT side is
correctly closed. This was a write-side hole only.

Three call sites, two of which bypassed the server entirely:

| Call site | Path | Status |
|---|---|---|
| `src/marketing/home2/ContactPage.jsx:72` | → `/api/contact` → service role | already correct |
| `src/marketing/sections/Close.jsx:261` | → `/rest/v1/demo_bookings` with anon key | **bypassed** |
| `src/site/Site.jsx:197` | → `/rest/v1/{table}` with anon key | **bypassed** |

`insertLead()` is duplicated verbatim in `Site.jsx:10` and `Close.jsx:228`.

## What replaces it

`api/submit.js` — one server-controlled door, `POST /api/submit?form=contact|demo|listing_report`.

| Layer | Mechanism |
|---|---|
| Size | 16 KB body ceiling, checked before the payload is touched |
| Validation | Per-form required fields and length caps; prose truncates, required fields reject |
| Honeypot | `website_url` — any value returns `200 {discarded:"honeypot"}` and stores nothing |
| Rate limit | 5 per 10-minute window per salted IP hash, counted in Postgres (`0057`) |
| Spam heuristics | 3+ links, BBCode/anchor markup, 25+ identical-character runs, majority non-Latin script |
| Write | Service role only — **no anon fallback** |

The honeypot returning `200` is deliberate: a bot told it failed adapts, a bot
told it succeeded stops. The throttle **fails open** — a broken throttle must not
take the contact form down, and the other layers bound the cost.

The IP is salted-SHA-256 hashed before storage. The throttle needs to recognise a
repeat caller, not identify one, and a raw IP log is a liability for no gain. Set
`SUBMISSION_SALT` in the deployment; without it each instance generates a random
per-process salt, so the throttle still works but does not persist across cold
starts.

### Deliberately not included

No CAPTCHA. Cloudflare Turnstile is the right next layer — free, privacy-
respecting — but it needs an account and a site key, so it is left documented
rather than half-wired.

## Files

| File | Status |
|---|---|
| `api/_submissions.js` | new — schemas, validation, spam gate, throttle client |
| `api/submit.js` | new — the endpoint |
| `supabase/migrations/0057_submission_throttle.sql` | new — throttle table + atomic increment. **Additive, safe any time** |
| `supabase/migrations/0058_close_public_insert.sql` | new — revokes anon INSERT. **Must not be applied until the client is deployed** |
| `scripts/submissions-test.mjs` | new — 38 unit tests, passing |
| `docs/patches/phase3-client-submissions.patch` | prepared, **not applied** — repoints the two bypassing call sites |

## Schema caveat — read before applying

`demo_bookings` and `contact_submissions` **are not defined in
`supabase/migrations/`**. They were created by hand in the prototype era. The
column lists in `api/_submissions.js` are therefore *inferred* from the client
code that writes them successfully today, not read from a schema.

A column that does not exist makes PostgREST reject the whole insert, so confirm
the real shape before deploying:

    select column_name, data_type, is_nullable
      from information_schema.columns
     where table_schema = 'public'
       and table_name in ('demo_bookings', 'contact_submissions')
     order by table_name, ordinal_position;

Then reconcile `FORMS` in `api/_submissions.js` against it. This is the same
version-control gap that blocks the Phase 2 staging environment — see
`docs/TENANT-ISOLATION-TESTING.md`.

## Order of operations

Getting this wrong breaks the public forms, so the sequence is not optional.

1. **STAGING** — run the column query above; reconcile `FORMS`
2. **LOCAL** — `npm run check:submissions` (38 tests)
3. **PRODUCTION, low risk** — apply `0057`. Additive; creates one table and two
   service-role-only functions, touches no existing policy
4. **PRODUCTION** — set `SUBMISSION_SALT`
5. **PRODUCTION** — deploy `api/submit.js`, `api/_submissions.js`, and the client
   patch. The old anon path still works at this point, so this is reversible
6. **PRODUCTION** — submit all three forms for real and confirm the rows land
7. **PRODUCTION** — only now apply `0058`
8. **PRODUCTION** — submit all three forms again

Between steps 5 and 7 both doors are open. That is the intended overlap: it makes
step 7 a clean switch rather than a cutover.

## Rollback

`0058` carries its own rollback block, which restores the previous grants and
policies exactly. It reopens a known hole, so it is a stopgap while the endpoint
is fixed, not a resting state.

`0057` is additive — rolling it back is `drop table public.submission_throttle`
and `drop function public.bump_submission_throttle, public.prune_submission_throttle`.
With the table gone, `checkThrottle()` fails open and submissions continue
unthrottled.

## Follow-ups

- Cloudflare Turnstile on all three forms
- Schedule `prune_submission_throttle()` — rows older than a day are dead weight;
  it fits the existing `crons` block in `vercel.json`
- De-duplicate `insertLead()` — once both call sites use the endpoint, both
  copies are dead code
- Fold `api/contact.js` into `/api/submit?form=contact`, retiring its anon
  fallback at `contact.js:73-79`. Kept separate for now because the pricing page
  depends on it and it also sends mail
