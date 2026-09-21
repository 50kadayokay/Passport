# MineEx — Phase 6.5 Completion Report (Production Reliability)

_Branch `integration`. Checkpoint: `9a06af6`._

**No production notifications sent. No production users or data deleted. No Supabase settings changed. No secrets committed. `cap sync ios` not run; `ios/` unchanged.**

---

## Fixed in code

| # | Issue | Resolution |
|---|---|---|
| **R1** | Overlapping senders could deliver the same row twice | `claim_notification_outbox()` — `FOR UPDATE SKIP LOCKED` + status flip in one transaction (migration 0041) |
| **R2** | `attempts` hardcoded, retryable = terminal, no backoff, stranded `sending` rows | `finish_notification_outbox()` owns every transition; attempts increment, exponential backoff, 300 s lease with reclaim, `MAX_ATTEMPTS` 5 |
| **R3** | Platform isolation must survive | Unchanged; 70 routing assertions green plus new concurrency coverage |
| **R4** | Device kept receiving the previous investor's pushes | `claim_push_token()` / `release_push_token()` (migration 0042) + `signOut()` release |
| **R6** | Shares exposed `passport-xi-five.vercel.app` | `companyShareUrl()` → `https://mineex.ca/app?c=<slug>`; `share-news.js` default → `mineex.ca` |
| **R7** | Reels Share button had no handler | It **is** reachable — wired through the Phase 6 helper with the canonical company URL |

## Requires production configuration

| # | Action | Why it is not in code |
|---|---|---|
| **P1** | **Apply migration `0041_outbox_claim_lease.sql`** | Schema change to a production table |
| **P2** | **Apply migration `0042_push_token_ownership.sql`** | Adds two `SECURITY DEFINER` functions |
| **P3** | **R5 — turn ON Supabase “Confirm email”** | Dashboard-only setting that affects real users (details below) |
| **P4** | *(optional)* set `PUBLIC_APP_URL=https://mineex.ca` in Vercel | Env override; the code default now already points there |

> **Deployment ordering matters.** `api/news-push-send.js` now *requires* the 0041 RPC and **fails closed** without it (returns 500, sends nothing) rather than falling back to the duplicating drain. Apply **P1 before or with** the next deploy.
>
> **`src/lib/push.js` now calls `claim_push_token`.** That code only runs in a *native* build, so the current iOS app is unaffected until someone rebuilds it — but **do not ship a new iOS build before P2 is applied**, or iOS token registration will start failing.

## Deferred / non-blocking

- Reels **Save** button is still inert (sibling of the Share one fixed here) — new finding **B20**.
- Legal links (`privacy.html`, `terms.html`) still point at `passport-xi-five.vercel.app` — user-facing but not shares; out of R6's stated scope. **B21**.
- `platform.js` `API_BASE`, admin `PASSPORT_BASE`, Conference Mode QR origins deliberately unchanged (deployment/tooling decisions, and Conference Mode is out of scope).
- MediaViewer and Reels share **UI entry points** still unreachable in a guest session (B19) — handlers verified in the shipped bundle instead.

---

## 1. Notification state machine

```
pending ──claim()──▶ sending ──success────────▶ sent     (terminal)
   ▲                    │
   │                    ├──permanent token────▶ failed   (terminal, token removed)
   │                    ├──attempts = MAX─────▶ failed   (terminal)
   │                    │
   ├──retryable─────────┤  attempts+1, next_attempt_at = now()+backoff
   │                    │
   └──config ───────────┘  released, **no attempt burned**
   ▲
   └── lease expiry (worker died) — reclaimable after lease_expires_at

unroutable platform ──▶ skipped (terminal, never transported)
```

Constants: `LEASE_SECONDS 300` · `MAX_ATTEMPTS 5` · backoff `60·2^n` capped at 3600 s.

## 2. Concurrency mechanism — and why it cannot double-claim

```sql
with claimable as (
  select o.id from public.notification_outbox o
  where o.attempts < p_max_attempts
    and ( (o.status='pending'  and (o.next_attempt_at is null or o.next_attempt_at <= now()))
       or (o.status='sending' and o.lease_expires_at is not null and o.lease_expires_at < now()) )
  order by o.created_at asc
  limit p_limit
  for update skip locked            -- ← the guarantee
)
update public.notification_outbox o
   set status='sending', claimed_at=now(),
       lease_expires_at=now()+make_interval(secs=>p_lease_seconds), claimed_by=p_worker
  from claimable c where o.id=c.id
returning o.*;
```

1. `FOR UPDATE` takes a row-level write lock held until **commit**.
2. `SKIP LOCKED` makes a concurrent claimer **skip** those rows — it neither blocks nor returns them.
3. The `UPDATE` to `sending` is in the **same transaction**, so once the lock drops the rows no longer match the predicate.

There is no read-then-write window. This is a database-level guarantee, not a client-side check. Proven in `push-reliability-test.mjs`: worker B claims **0** rows while A holds them, and across 4 interleaved workers every row is claimed **exactly once**.

## 3. Retry behaviour

| Condition | Outcome | attempts | Next |
|---|---|---|---|
| 2xx | `sent` | +1 | terminal |
| Retryable (429/500/503/network/unknown) | `retry` | +1 | `pending` at `now()+backoff` |
| `attempts+1 >= 5` | `failed` | +1 | terminal |
| Permanent token (`UNREGISTERED`, `SENDER_ID_MISMATCH`, `BadDeviceToken`, `Unregistered`) | `failed` | +1 | terminal, token deleted **for that platform only** |
| Provider **config** (401/400/`UNAUTHENTICATED`/`INVALID_ARGUMENT`) | `release` | **+0** | `pending` immediately |
| Worker died | — | +0 | reclaimable after the lease |

Unknown codes are retryable so a token is never destroyed on a guess.

## 4. Token ownership lifecycle

| Event | Behaviour |
|---|---|
| First registration | `claim_push_token(token, platform)` — upsert for `auth.uid()`, detach that token from every other account |
| **Logout** | `release_push_token(token)` **before** the session is cleared (needs `auth.uid()`) |
| **Login as another account** | that account's `claim_push_token` detaches the device from the previous user — the safety net when logout never happened |
| Token rotation | new row; the stale one dies via `UNREGISTERED` |
| Reinstall | new token, same path |
| Duplicate registration | idempotent upsert on `(user_id, token)` |
| Permission revoked | `checkPermissions()` ≠ granted → returns before `register()` |
| Same user signs back in | idempotent |

Matching is always the **exact token string** = one app install on one device, so an investor's **other devices are never touched**, and `release_push_token` is scoped to `auth.uid()` so it cannot affect another account.

## 5. Email verification status — R5 **answered authoritatively, not guessed**

`GET /auth/v1/settings` (GoTrue's own public config) returns:

```json
{ "disable_signup": false, "mailer_autoconfirm": true, "phone_autoconfirm": false }
```

**`mailer_autoconfirm: true` ⇒ “Confirm email” is DISABLED.** The Phase 4 test was **not** misleading: email/password registration grants an immediately-confirmed session with no proof of ownership. The comment at `src/lib/auth.js:50` (“Email-confirmation flow is on”) is wrong.

This cannot be changed from the repository. Required change and its effects:

| | |
|---|---|
| **1. Current setting** | Authentication → Sign In / Providers → Email → **Confirm email: OFF** (`mailer_autoconfirm: true`) |
| **2. Proposed setting** | **Confirm email: ON** |
| **3. Effect on new users** | `signUp()` returns **no session**; a confirmation email is sent and the account is unusable until the link is clicked. The client already handles this — `signUp()` returns `{session: null, needsConfirmation: true}` and `main.jsx` renders the “check your email” state. **No code change needed.** |
| **4. Effect on existing users** | **None.** Already-confirmed users keep their `confirmed_at`; sessions and refresh tokens are unaffected. |
| **5. Effect on login** | None for confirmed accounts. Any account created while the setting was OFF is already confirmed and logs in normally. Social sign-in (Apple/Google) is unaffected — those identities are provider-verified. |
| **6. Effect on password reset** | Unchanged; `requestPasswordReset()` already emails a `/reset` link. |
| **7. Redirect / deep-link requirements** | The confirmation link needs a valid redirect. Add **`https://mineex.ca/**`** (and keep `https://passport-xi-five.vercel.app/**`) to Authentication → URL Configuration → Redirect URLs, and set Site URL to `https://mineex.ca`. **Native note:** `capacitor://localhost` cannot receive an emailed link, so confirmation completes in the browser and the user returns to the app to sign in — the same pattern `requestPasswordReset()` already uses deliberately. |

**Risk of leaving it OFF:** anyone can register with an address they do not control and obtain an authenticated MineEx session, including squatting an address a real investor later wants.

**I did not change it.** These are the exact instructions.

## 6. Canonical sharing domain — R6 result

Verified live (not assumed) before changing anything:

| URL | Result |
|---|---|
| `https://mineex.ca/app?c=argenta-silver-corp` | **200**, `<title>MineEx</title>` |
| `https://passport-xi-five.vercel.app/app?c=…` | **200** |
| `https://mineex.ca/` | **200** |
| `https://mineex.ca/privacy.html` | **200** |
| `/n/<id>` on both hosts | **200** |

Both hostnames serve the same Vercel deployment, so **already-shared vercel.app links keep working** — nothing was redirected or removed; only newly minted links change. `/n/<id>` already used `mineex.ca` and the OG card already brands it, confirming the intended canonical host.

Verified in the shipped bundle: `const io="https://mineex.ca"; function os(t){…`${io}/app?c=${encodeURIComponent(a)}`…}`.

## 7. Test results

```
scripts/push-reliability-test.mjs   ✓ ALL PASS — 41 passed, 0 failed
scripts/push-routing-test.mjs       ✓ ALL PASS — 70 passed, 0 failed
typecheck · check:anchors · onboarding-classify (21/21) · blueprint-projection (38/38)  ✓
```

Reliability coverage: concurrent claim isolation · 4-worker interleave (every row claimed exactly once) · worker dies after claim · lease not expired → not reclaimable · lease expired → reclaimable · attempts increment · backoff blocks then allows · max attempts terminal · terminal never re-claimed · config release burns no attempt · unconfigured provider releases its claim · mid-bucket throw does not reopen `sent` rows · routing preserved under claiming · full token ownership lifecycle.

**Five Phase 5 assertions were updated, not weakened** — `markRow`'s contract changed from `{status}` to `{outcome}`, and a retryable failure is now genuinely retryable instead of terminal. One assertion was added.

## 8. Database migrations

| File | Contents | Reversible |
|---|---|---|
| `0041_outbox_claim_lease.sql` | 4 nullable columns; widened status CHECK (+`sending`); reindex; `claim_notification_outbox()`; `finish_notification_outbox()` | Yes — additive; existing rows keep working (`next_attempt_at NULL` = eligible now) |
| `0042_push_token_ownership.sql` | `claim_push_token()`, `release_push_token()` | Yes — functions only, no schema change |

Both revoke `public`/`anon`; the outbox functions are service-role only.

## 9. Production actions still required

1. Apply **0041** — *before or with* the next deploy (sender fails closed without it).
2. Apply **0042** — *before* shipping any new **iOS** build.
3. Turn **Confirm email ON** and add the `mineex.ca` redirect URLs (§5).
4. Optional: `PUBLIC_APP_URL=https://mineex.ca` in Vercel.
5. Still outstanding from earlier phases: Firebase config (G4), Google OAuth clients (G1/G2).

## 10. Production safety

**No real users were notified.** `/api/news-push-send` was never invoked against production; the outbox was never claimed or drained; every concurrency, retry and routing behaviour was proven against an in-memory model of the SQL. No production rows were created, modified or deleted; the Phase 4 stray account remains untouched as instructed. No Supabase configuration was changed.

## 11. iOS

`ios/` and `capacitor.config.json` **unchanged** (`git diff --quiet`). `cap sync ios` not run. The shared files touched (`auth.js`, `push.js`, `share.js`, `PassportProto.jsx`) reach iOS only on its next build — see the P2 ordering note.
