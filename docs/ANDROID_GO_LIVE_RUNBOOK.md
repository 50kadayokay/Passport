# MineEx Android — Go-Live Runbook

Ordered checklist to get from `5d473f2` to a Play-Internal-Testing install.
**Order matters.** Each stage says why.

🧑 = you (console/credentials) · 🤖 = hand back to me · ⏱️ = rough time

> **The current 10 MB AAB is a PLACEHOLDER.** It was built before the Google and
> Firebase credentials existed, so it ships with the Google button hidden and push
> disabled. It must be rebuilt in Stage C. Do not upload the current one.

---

## Stage A — Database + deploy ⏱️ ~20 min

Nothing Android-specific. Safe to do now; it also fixes the duplicate-notification
bug on the **iOS** side.

### A1 🧑 Check the constraint name (10 seconds, prevents a failed migration)

Supabase → SQL Editor:

```sql
select conname from pg_constraint
where conrelid = 'public.notification_outbox'::regclass;
```

You should see `notification_outbox_status_check`. If it is named something else,
tell me before running A2 — migration 0041 drops it by that exact name, and a
mismatch makes the migration fail halfway.

### A2 🧑 Apply migration 0041

Supabase → SQL Editor → paste the entire contents of
`supabase/migrations/0041_outbox_claim_lease.sql` → Run.

Verify:
```sql
select routine_name from information_schema.routines
where routine_name in ('claim_notification_outbox','finish_notification_outbox');
-- expect 2 rows
```

### A3 🧑 Apply migration 0042

Same, with `supabase/migrations/0042_push_token_ownership.sql`.

```sql
select routine_name from information_schema.routines
where routine_name in ('claim_push_token','release_push_token');
-- expect 2 rows
```

### A4 🧑 Deploy the `integration` branch to Vercel

**Must come after A2.** The new sender requires the 0041 RPC and deliberately
fails closed without it (returns 500, sends nothing — rather than risking
duplicate delivery).

### A5 🧑 Optional but recommended

Vercel → Environment Variables → `PUBLIC_APP_URL = https://mineex.ca`
(the code already defaults to this; the env var just makes it explicit).

> ⚠️ **Do not rebuild/ship iOS yet.** `src/lib/push.js` now calls `claim_push_token`.
> That is native-only code, so the *currently shipping* iOS app is unaffected — but
> any new iOS build must come after A3.

---

## Stage B — Google + Firebase credentials ⏱️ ~45 min

### B1 🧑 Google Cloud — Web OAuth client

console.cloud.google.com → project **871146667116** (same one as the iOS client)
→ APIs & Services → Credentials → **Create credentials → OAuth client ID → Web application**
→ name it `MineEx Web` → Create.

**Copy the Client ID** (ends `.apps.googleusercontent.com`). Ignore the client
*secret* — MineEx never uses it and it must never enter the app.

### B2 🧑 Google Cloud — Android OAuth clients

Same screen → **Create credentials → OAuth client ID → Android**, once per
certificate. Package name is `com.liquidjungle.mineex` for all of them.

| Name it | SHA-1 |
|---|---|
| `MineEx Android (debug)` | `EC:F0:BA:F8:D3:85:C1:1D:09:FE:7E:EA:1B:01:3C:27:1C:A8:AE:2A` |
| `MineEx Android (upload)` | `B2:FA:32:10:0C:7B:3B:4E:97:1D:22:C2:7F:CC:0B:47:78:1D:5A:CA` |
| `MineEx Android (Play)` | ⏳ **Stage E** — does not exist until Play App Signing is on |

### B3 🧑 Supabase — accept the Web client as an audience

Supabase → Authentication → Providers → **Google** → *Authorized Client IDs* must
contain **both**:

- the existing **iOS** client ID `871146667116-5n20tj4gp1ajp1ssrj1e75er7534i2q5…` ← keeps iOS working
- the new **Web** client ID from B1 ← the Android token audience

Additive. iOS is unaffected.

> **Why the Web ID and not the Android one:** Android's Credential Manager mints its
> ID token for the *Web* client. The Android client only authorises the app to ask.
> Putting the Android ID here is the classic "works in testing, fails in production".

### B4 🧑 Firebase — Android app

console.firebase.google.com → **add Firebase to the existing Google Cloud project
871146667116** (do not make a new project, or the OAuth clients won't line up)
→ Add app → **Android** → package `com.liquidjungle.mineex`.

Add the same SHA-1s from B2 while you are there.

Download **`google-services.json`**.

### B5 🧑 Firebase — service account for the server

Firebase → Project settings → **Service accounts** → *Generate new private key*
→ downloads a JSON file. **Never commit it.**

From that JSON, set in **Vercel** → Environment Variables:

| Vercel var | JSON field |
|---|---|
| `FCM_PROJECT_ID` | `project_id` |
| `FCM_CLIENT_EMAIL` | `client_email` |
| `FCM_PRIVATE_KEY` | `private_key` (paste whole, `\n` escapes are handled) |

Redeploy Vercel so they take effect.

### B6 🧑 Hand me three things

1. `google-services.json` → drop it at `android/app/google-services.json`
2. The **Web client ID** from B1
3. Confirmation that B3 and B5 are done

---

## Stage C — Rebuild the real AAB 🤖 ⏱️ ~5 min

I will:

1. Place `google-services.json`
2. Build with `VITE_GOOGLE_WEB_CLIENT_ID=<B1>` and `VITE_ANDROID_PUSH_ENABLED=true`
3. Rebuild + re-inspect the signed AAB (permissions, package, signature, secrets)
4. Verify on the emulator that Firebase initialises and an FCM token is issued
5. Run the isolated FCM test — one known test token only, never the production outbox

Result: the AAB you actually upload.

---

## Stage D — Play Console ⏱️ ~60 min

### D1 🧑 Create the app

play.google.com/console → Create app.

| Field | Value |
|---|---|
| App name | `MineEx` — **check availability**; "MineEx" was taken on the App Store, where you used "MineEx Mining App" |
| Default language | English (Canada) |
| App or game | **App** |
| Free or paid | **Free** |
| Declarations | tick both (policy + US export) |

### D2 🧑 Enable Play App Signing

Release → Setup → App integrity → **Play App Signing: enable**. Required for
Stage E and for upload-key recovery.

### D3 🧑 Store listing

- **Short description (≤80):** `Junior mining news, drill results and company updates in one feed.`
- **Full description:** reuse the App Store copy in `docs/APP_STORE_SUBMISSION.md`
- **App icon:** 512×512 — regenerate from `assets/app-icon.svg`
- **Feature graphic 1024×500:** ⚠️ **does not exist — must be created**
- **Phone screenshots:** 2–8. The existing set is iOS 1320×2868; retake on Android
- **Tablet screenshots:** not required (phone-portrait app)

### D4 🧑 Policy declarations — *derived from the app, but yours to confirm*

| Section | Answer | Basis |
|---|---|---|
| Privacy policy | `https://mineex.ca/privacy.html` | live |
| **Data Safety** | Collected & linked to identity, **App Functionality only**, **no tracking, no ads**: email, name, user ID, user content (profile, messages) | matches the App Store label |
| | ⚠️ Also declare the "Remember me" credential stored in Android Keystore | `src/main.jsx` SecureStorage |
| Account deletion | in-app: Profile → Settings → Delete account | exists |
| | ⚠️ **web deletion URL — does not exist, Play requires one** | you must create it |
| Ads | **No ads** | provably true: AD_ID removed |
| Content rating | questionnaire → expect **Everyone**; answer *unrestricted web access* **No** | source links open in the system browser |
| Target audience | **18+** | investor product — your call |
| App access | account required; give the reviewer login from `APP_STORE_SUBMISSION.md` | ⚠️ confirm it still works |
| Contact email | `support@mineex.ca` or `nitrospicexxx@gmail.com` | your call |

### D5 🧑 Upload to **Internal testing** (not Production)

Testing → Internal testing → Create release → upload the **Stage C** AAB →
add yourself as a tester → Save → Review → **Start rollout to Internal testing**.

Copy the opt-in link.

---

## Stage E — Play signing ↔ Google OAuth ⏱️ ~10 min

**Mandatory. Skipping this means Google sign-in works in testing and fails in production.**

### E1 🧑 Get the Play signing SHA-1

Play Console → Release → Setup → App integrity → **App signing key certificate**
→ copy the **SHA-1**. (This is Google's key, not your upload key.)

### E2 🧑 Register it

Google Cloud → Credentials → **Create OAuth client ID → Android**
→ `MineEx Android (Play)` → package `com.liquidjungle.mineex` → that SHA-1.

Also add it in Firebase → Project settings → your Android app → Add fingerprint.

No rebuild needed — this is server-side registration.

---

## Stage F — Verify on a real phone ⏱️ ~30 min

Install **from the Play opt-in link**, not adb. A Play-distributed install is the
only thing that exercises the Play App Signing certificate.

Walk through: launch · signup/login · **Google Sign-In** · session persists across
restart · logout · login again · feed · Explore/Search · company profile ·
following · press releases · media · **share → sheet shows a `mineex.ca` URL** ·
Android Back from detail screens · notification permission · **push received** ·
**notification tap opens the right company** · external links · background/resume ·
cold launch.

🤖 Send me anything that misbehaves.

---

## Before PUBLIC launch (not needed for Internal Testing)

### G1 🧑 Turn on email confirmation

Production GoTrue currently reports `mailer_autoconfirm: true` — anyone can
register with an address they do not control and get a working session.

1. Authentication → URL Configuration → **Site URL** `https://mineex.ca`;
   **Redirect URLs** add `https://mineex.ca/**` (keep the vercel.app one)
2. Send one test confirmation and check the link returns correctly
3. Authentication → Providers → Email → **Confirm email: ON**

No code change needed — `signUp()` already returns `needsConfirmation` and the UI
renders the "check your email" state. Existing users, login, password reset and
social sign-in are unaffected.

### G2 🧑 Web account-deletion URL (Play requirement)

### G3 🧑 Back up `~/.mineex-release/`

Keystore + password. With Play App Signing a lost **upload** key is recoverable
(request a reset); back it up anyway.

---

## Known issues that do NOT block Internal Testing

| Issue | Status |
|---|---|
| JMN news thumbnails don't load | Upstream: the site 403s non-browser clients. Some stored `image_url`s are tracking pixels, not images. **Affects iOS and web equally** — an ingest bug, not Android |
| `SystemBars` safe-area warning at startup | Cosmetic log noise; layout is correct |
| MediaViewer / Reels share UI paths untested | Need a signed-in account with company media |
| ~6 MB of desktop/admin/portal chunks in the app | Unreachable on mobile but legitimately served to the website from the same `dist`; excluding them needs a routing split |
