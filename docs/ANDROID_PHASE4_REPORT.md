# MineEx Android — Phase 4 Completion Report (Authentication)

_Branch `integration`. Phase 4 checkpoint: `90af19a`._

---

## ⚠️ Read first — a test account I created by mistake

While testing the email failure path on Android I submitted deliberately invalid credentials, but the form was in **sign-up** mode rather than sign-in. That request **created a real user in your production Supabase**:

```
email      no-such-user@example.invalid      (unroutable .invalid TLD)
user id    fc97af42-…
created    2026-09-21T05:50:04Z
```

I revoked its session server-side (`/auth/v1/logout` → HTTP 204) and cleared it from the device, so it has **no active session**. The `auth.users` row (and any `profiles` row the `handle_new_user` trigger created) still exists. I did not delete it — deleting production data is your call. Remove it from Supabase → Authentication → Users, or tell me and I will use the app's in-app account deletion.

**This surfaced a genuine product finding.** `signUp()` returned an immediately-usable session with `confirmed: true`, so **email confirmation appears to be OFF** in this Supabase project. The comment in `src/lib/auth.js:50` says the opposite ("Email-confirmation flow is on: no session until the user confirms"). As configured, anyone can register with an address they do not control and get a working session. Worth a deliberate decision before launch. Not changed here — out of Phase 4 scope.

---

## 1. Authentication architecture (audit)

No server routes are involved at all. The client talks **directly to Supabase GoTrue**; `supabase-js` is not used.

| Concern | Implementation |
|---|---|
| Methods exposed | Email+password sign-up / sign-in, password reset, **Apple** (native, iOS), **Google** (native) |
| Magic link | Not implemented |
| Supabase config | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` with inline fallbacks (`src/lib/supabase.js`) |
| Session persistence | `localStorage` key `pp.session` — `{access_token, refresh_token, expires_at, user}` |
| Refresh | Manual, on demand. `save()` sets `expires_at = now + expires_in − 60s`; `getSession()` refreshes past expiry via `grant_type=refresh_token`; a failed refresh clears the session |
| Logout | `signOut()` clears local state **synchronously first**, then best-effort `POST /auth/v1/logout` |
| Social exchange | Provider `id_token` → `POST /auth/v1/token?grant_type=id_token` → same session shape as password login |
| Redirects / deep links | Only one: password reset → `${origin}/reset`, and on native `origin` is rewritten to the Vercel host (`capacitor://localhost` can't receive an emailed link) |
| iOS-specific | `GOOGLE_IOS_CLIENT_ID` inline; `apple: {}` init; reversed-client-id URL scheme in `Info.plist`; `applesignin` entitlement |
| Web-specific | Social block is gated on `isNativeApp`, so web shows email/password only |
| Server routes | **None** — no `api/` route touches auth |
| Secrets | None in source. OAuth **client IDs** are public client config; no client *secret* is used anywhere |

**Shared vs Android-specific:** everything after the `id_token` is obtained is shared and needed no change. Only *how* the token is obtained, and *which OAuth client it is minted for*, differ.

## 2. Every change

| File | Change |
|---|---|
| `src/lib/auth.js` | `nativePlatform()`; `appleAvailable()` (iOS only); `googleConfigured()` per-platform; `socialInit()` initialises only completable providers; `signInWithGoogle()` sends `scopes` on iOS only |
| `src/main.jsx` | Apple button gated on `appleAvailable()`; whole social block gated on `(appleAvailable() \|\| googleConfigured())` so Android never renders an empty "or" divider |
| `.env.example` | `VITE_GOOGLE_WEB_CLIENT_ID` documented as publishable client config |

3 files, +74 / −12. No native Android file changed — `MainActivity` stays stock.

## 3. Google → Android → Supabase token flow

```
User taps "Continue with Google"
  └─ SocialLogin.initialize({ google: { webClientId: VITE_GOOGLE_WEB_CLIENT_ID } })
  └─ SocialLogin.login({ provider: "google", options: {} })      ← no custom scopes
       └─ Android Credential Manager (androidx.credentials + Sign in with Google)
            · authorises the CALLER by  package name + signing SHA-1
              → must match an ANDROID OAuth client in Google Cloud
            · mints an ID token whose  aud = the WEB client id
              → must be listed in Supabase's Google provider
       └─ returns { idToken }
  └─ POST {SUPABASE_URL}/auth/v1/token?grant_type=id_token { provider:"google", id_token }
       └─ GoTrue validates the signature and checks `aud` against its allowed client IDs
       └─ returns { access_token, refresh_token, expires_in, user }
  └─ save() → localStorage "pp.session" → identical to email/password from here on
```

**The trap in one line:** the Android OAuth client *authorises the app*; the **Web** client is the *token audience*. Using the Android client id as `webClientId` is the classic failure (`[28444] Developer console is not set up correctly`).

Because the Supabase user is keyed on the verified Google identity (email/`sub`), the **same Google account yields the same MineEx user** on Android and iOS — no duplicate accounts, provided both client IDs are registered against one Supabase Google provider.

## 4. Android test results (debug build, Android 16 / API 36)

### Verified now

| Test | Result |
|---|---|
| Apple button hidden on Android | **PASS** |
| No orphaned "or" divider | **PASS** (screenshot) |
| Email/password UI intact | **PASS** |
| Google button hidden when client ID unset | **PASS** — fail-safe |
| Google button shown when client ID set | **PASS** |
| `initialize()` takes the Android path | **PASS** — `{"google":{"webClientId":…}}` |
| Plugin reports the Cloud-registration triple | **PASS** — `package=com.liquidjungle.mineex`, `signingSha1=EC:F0:…:2A` |
| Credential Manager actually invoked | **PASS** — `executeGetCredential`, `callingPackage com.liquidjungle.mineex` |
| Custom-scopes rejection found and removed | **PASS** — see §"scopes" below |
| **Cancelled** Google sign-in | **PASS** — `"Google Sign-In cancelled by user"`, swallowed by the existing `/cancel/i` filter, no crash, no toast |
| App survives a failed/aborted Google flow | **PASS** — process alive, no JS error |
| GoTrue reachable from Android | **PASS** — sign-up round-trip returned a real session |
| Session persisted to `localStorage` | **PASS** — `pp.session` written with access + refresh token and expiry |
| Server-side logout | **PASS** — `/auth/v1/logout` → HTTP 204, local session cleared |

**The `scopes` finding.** The first Android attempt failed with `"You CANNOT use scopes without modifying the main activity"`. Reading `GoogleProvider.java` showed the plugin already requests `userinfo.email` + `userinfo.profile` + `openid` by default and only demands a subclassed `MainActivity` for a **custom** scopes array. Since `["email","profile"]` is exactly the default set and we never call a Google API, the fix was to omit `scopes` on Android — no native code, and iOS keeps its exact shipped call.

### Not verified (blocked on credentials I must not create)

First sign-in, account chooser, successful Supabase session **from Google**, session persistence across restart from a Google login, token refresh, logout→login-again, network-failure behaviour, and no-duplicate-user confirmation.

Two independent blockers:
1. The emulator has **no Google account**, and Credential Manager launched Google's *add an account* flow. Creating/signing into a Google account is not something I will do on your behalf.
2. Even with an account, there is **no Android OAuth client** registered for this debug SHA-1 in your Google Cloud project, and I must not modify your console.

Email/password **success** paths (login, persistence across restart, refresh) were likewise not driven through the UI, because entering a password to authenticate is outside what I will do. The mechanism is proven by the accidental sign-up: a real session was minted, stored, and revoked correctly.

## 5. Web regression

| Check | Result |
|---|---|
| `Capacitor.getPlatform()` | `"web"` |
| Apple / Google buttons on web | **absent** (unchanged — social block is `isNativeApp`-gated) |
| Welcome screen renders | **PASS** |
| GoTrue bad password | **HTTP 400 "Invalid login credentials"**, no session created |
| App console errors | **none** (only the intentional 400) |

## 6. iOS

`ios/` and `capacitor.config.json` **unchanged** (`git diff --quiet`). `cap sync ios` not run. No signing, entitlement or credential change. The iOS code path is byte-for-byte what shipped: same `iOSClientId`, same `apple: {}`, same `scopes: ["email","profile"]`, same exchange.

`src/lib/auth.js` and `src/main.jsx` are shared and reach iOS/web on their next build — review as production changes. The behavioural deltas are guarded by `nativePlatform()`, which returns `"ios"`/`"web"` off Android.

## 7. Production configuration checklist

### A. Google Cloud Console — project `871146667116`

1. **APIs & Services → Credentials → Create OAuth client → Web application** (if one does not already exist). Copy its **Client ID** → this is `VITE_GOOGLE_WEB_CLIENT_ID`. *Never put its client secret in the app.*
2. **Create OAuth client → Android**, one per signing certificate, all with package name `com.liquidjungle.mineex`:

   | # | Certificate | SHA-1 | When available |
   |---|---|---|---|
   | 1 | Local debug | `EC:F0:BA:F8:D3:85:C1:1D:09:FE:7E:EA:1B:01:3C:27:1C:A8:AE:2A` | **now** (this machine's `~/.android/debug.keystore`) |
   | 2 | Upload key | from your upload keystore | when you create it (Phase 8) |
   | 3 | **Play App Signing** | from Play Console | **only after** the app exists in Play Console |

   Every developer machine has a *different* debug keystore, so each needs its own entry.
3. Web and Android clients must live in the **same** Google Cloud project.
4. OAuth consent screen: publish, or add testers while in Testing.
5. Ensure the app does **not** request `com.google.android.gms.permission.AD_ID` (Play flags it).

### B. Google Play Console — Phase 8

1. Create the app, `com.liquidjungle.mineex`, and enable **Play App Signing**.
2. **Setup → App integrity → App signing** → copy the **SHA-1 of the App signing key certificate** (not only the upload key).
3. Add that SHA-1 as Android OAuth client **#3** above.
4. **This is the step that decides whether production Google sign-in works.** Skipping it gives the classic "works in testing, fails in production" failure, because Play re-signs your bundle with a certificate Google Cloud has never seen.

### C. Supabase — Authentication → Providers → Google

1. Enable Google.
2. **Authorized Client IDs** must list **both**:
   - the existing **iOS** client ID `871146667116-5n20tj4gp1ajp1ssrj1e75er7534i2q5…` (keeps iOS working)
   - the new **Web** client ID (the Android token audience)
   Additive — it does not affect iOS.
3. Leave Apple as-is (iOS only for v1).
4. Decide on **email confirmation** (see the warning at the top).

### D. Build configuration

Set `VITE_GOOGLE_WEB_CLIENT_ID` wherever the Android bundle is built — locally in `.env`, and in Vercel for the web build. Unset ⇒ the Google button hides itself rather than failing.

## 8. Cannot be verified until Play distribution

- Google sign-in under the **Play App Signing certificate** — that certificate does not exist until the app is created in Play Console, and cannot be simulated locally.
- Behaviour of an internal-testing / production-track install.
- Therefore: **do not treat production Google authentication as verified.** The correct gate is an internal-testing build installed *from Play*, signed by Play, with Android OAuth client #3 registered. Everything up to that point is implemented and locally exercised.

## 9. New findings recorded (not fixed)

| # | Finding |
|---|---|
| B10 | **Email confirmation appears disabled** in Supabase — sign-up returns an immediately-confirmed session. Contradicts the comment at `src/lib/auth.js:50`. Security/product decision needed. |
| B11 | Stray test user `no-such-user@example.invalid` in production Supabase (see the warning above). Session revoked; row awaiting your decision. |
| B12 | On Android, `signOut()` does not call `SocialLogin.logout({provider:"google"})`, so Credential Manager keeps its own state. With `filterByAuthorizedAccounts=false` and `autoSelectEnabled=false` the chooser should still appear, but this is unverified until a real Google sign-in is possible. |
