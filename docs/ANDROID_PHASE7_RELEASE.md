# MineEx Android — Phase 7 Release Dashboard

_Branch `integration`. Checkpoint: `90d00db`. AAB: `android/app/build/outputs/bundle/release/app-release.aab` (12 MB)._

**No production notifications sent · no production data changed · no secrets committed · `ios/` untouched · `cap sync ios` not run · nothing submitted to Play.**

---

## Dashboard

| # | Area | Status | Detail |
|---|---|---|---|
| 1 | **Migrations** | 🔴 **RED** | Confirmed **not applied**. Deployment order below. No DDL path exists from here. |
| 2 | **Email verification** | 🔴 **RED** | `mailer_autoconfirm: true` — still OFF. Dashboard-only. |
| 3 | **Firebase** | 🔴 **RED** | Not configured. `VITE_ANDROID_PUSH_ENABLED` correctly left **false**. |
| 4 | **FCM end-to-end** | 🔴 **RED** | Blocked by #3. |
| 5 | **Google auth** | 🔴 **RED** | No Web/Android OAuth client → button hidden in this build. |
| 6 | **Play signing** | 🟢 **GREEN** | Upload key generated, Gradle wired, secrets outside the repo. |
| 7 | **AAB** | 🟢 **GREEN** | Built, signed, inspected. Two real defects found and fixed. |
| 8 | **Play Console** | 🟡 **YELLOW** | Full checklist prepared; 5 items need your decision. |
| 9 | **Play App Signing ↔ OAuth** | 🔴 **RED** | Cannot exist until the app is created in Play. |
| 10 | **Internal Testing** | 🔴 **RED** | Not uploaded; no Play-distributed install. |
| 11 | **Product bugs** | 🟢/🟡 | 3 fixed; 3 reported. |

**MineEx is not yet installed through Internal Testing.** Everything that can be done without your consoles is done; the remaining gates all need credentials or dashboards only you hold.

---

## 1. Migrations — exact deployment order

Verified read-only against production:

```
claim_notification_outbox   HTTP 404  PGRST202  -> ABSENT
claim_push_token            HTTP 404  PGRST202  -> ABSENT
notification_outbox.claimed_at  400  42703 "column does not exist"
```

**Neither migration is applied.** There is no Supabase CLI, no linked project, no migration runner, and PostgREST cannot execute DDL — so I stopped rather than improvising around missing access.

**Safe order — migrations FIRST, then deploy:**

| Step | Action | Why this order |
|---|---|---|
| 1 | Apply `0041_outbox_claim_lease.sql` | Purely additive (nullable columns, widened CHECK, two functions). The **currently deployed** sender does `status=eq.pending` + PATCH and is unaffected by extra columns. |
| 2 | Apply `0042_push_token_ownership.sql` | Adds two functions only. No schema or RLS change, so the **shipping iOS app** (which upserts `push_tokens` directly) is unaffected. |
| 3 | Deploy the `integration` web/API build | The new sender *requires* the 0041 RPC and **fails closed** without it. |
| 4 | Only then rebuild iOS | `src/lib/push.js` now calls `claim_push_token`; native-only, so today's iOS app is fine until rebuilt. |

**Reverse order is unsafe:** deploying first creates a window where the sender 500s and delivers nothing.

**Your action:** Supabase → SQL Editor → run each file's contents. One caveat to check at apply time: `0041` does `drop constraint if exists notification_outbox_status_check`. Migration 0025 created it inline, so Postgres should have auto-named it exactly that — if your database named it differently, the DROP silently no-ops and the ADD fails on the duplicate. Verify with:
`select conname from pg_constraint where conrelid='public.notification_outbox'::regclass;`

## 2. Email verification

Unchanged since Phase 6.5 — I did not touch production Auth. Full 7-point impact analysis is in `ANDROID_PHASE65_REPORT.md` §5. Summary of your actions:

1. Authentication → URL Configuration → **Site URL** `https://mineex.ca`; **Redirect URLs** add `https://mineex.ca/**` (keep `https://passport-xi-five.vercel.app/**`).
2. *Verify redirects work* by sending one test confirmation **before** step 3.
3. Authentication → Providers → Email → **Confirm email: ON**.

No code change is needed — `signUp()` already returns `{session: null, needsConfirmation: true}` and the UI renders the "check your email" state. Existing users, login, password reset and social sign-in are all unaffected. Native note: `capacitor://localhost` can't receive an emailed link, so confirmation completes in the browser and the user returns to the app — the same deliberate pattern password reset already uses.

## 3–5. Firebase, FCM, Google auth

All blocked on consoles I do not have. Instructions are in `ANDROID_PHASE5_REPORT.md` §12 (Firebase) and `ANDROID_PHASE4_REPORT.md` §7 (Google OAuth). The flags are correctly left off, so this AAB is *safe* — it simply has push and Google sign-in disabled rather than half-configured and crashing.

## 6. Play signing

| | |
|---|---|
| Keystore | `~/.mineex-release/mineex-upload.jks` — RSA 4096, valid to 2054 |
| Credentials | `~/.mineex-release/keystore.properties`, `chmod 600`, **outside the repo** |
| Upload key SHA-1 | `B2:FA:32:10:0C:7B:3B:4E:97:1D:22:C2:7F:CC:0B:47:78:1D:5A:CA` |
| Upload key SHA-256 | `6D:44:6E:37:54:0F:F1:93:66:9B:7A:0A:57:D3:62:66:03:20:1B:47:D6:38:7C:D4:08:61:3E:7A:79:06:96:E7` |
| Gradle resolution | `android/keystore.properties` → `~/.mineex-release/keystore.properties` → `MINEEX_*` env vars (CI) |
| If nothing resolves | Release build is left **unsigned** — never falls back to the debug key |

**Back this up.** Copy `~/.mineex-release/` to your password manager or encrypted backup. With **Play App Signing** enabled, losing the *upload* key is recoverable (request a reset in Play Console); Google holds the actual app-signing key, which is the one that must never be lost.

## 7. Versioning

`versionName 1.3.1` (matches shipping iOS) · `versionCode 1` (first Play upload).

**Rule:** every Play upload must use a versionCode **strictly greater** than every previous Play upload — including uploads you later discard. It is deliberately **not** tied to the iOS build number; the two stores have independent counters and a shared `versionName` is what keeps the public version aligned.

## 8. AAB — inspected, not assumed

| Check | Result |
|---|---|
| Build | ✅ `bundleRelease` succeeded |
| Package | ✅ `com.liquidjungle.mineex` |
| versionName / versionCode | ✅ `1.3.1` / `1` |
| minSdk / targetSdk / compileSdk | ✅ `26` / `36` / `36` |
| Label | ✅ `MineEx` |
| `android:debuggable` | ✅ **absent** |
| Signature | ✅ upload key, v2 scheme, cert SHA-1 matches |
| service_role / secret strings | ✅ 0 |
| APNs / FCM private key material | ✅ 0 |
| localhost dev URLs | ✅ 0 |
| Production backend | ✅ Supabase + `mineex.ca` canonical shares |
| Firebase config | ⚠️ absent by design (push disabled) |

### Two defects the inspection caught

**a) Advertising-ID permissions.** The build declared `com.google.android.gms.permission.AD_ID` plus four `ACCESS_ADSERVICES_*` permissions and `BIND_GET_INSTALL_REFERRER`. Manifest-merger blame traced them to `com.facebook.android:facebook-core:18.1.3`, bundled by `@capgo/capacitor-social-login` — **MineEx never uses Facebook login.** Declaring an advertising ID contradicts MineEx's own privacy label ("no data used for tracking") and forces a Data Safety declaration. Fixed via the plugin's config (`facebook:false, twitter:false`): AD_ID and all four AdServices permissions gone, **zero `com.facebook.*` classes**, 13 MB → 12 MB.

> `capacitor.config.json` is **shared**. This also drops the unused Facebook/Twitter SDKs from the next **iOS** build — correct, and Apple sign-in is unaffected (`apple:true`) — but it is a change iOS picks up when next rebuilt.

**b) Missing CAMERA / VIBRATE.** Never declared, so the **QR scanner and haptics would have failed on Android**. Added, with `uses-feature camera required="false"`. iOS parity: `NSCameraUsageDescription`.

Final permission set — all justified: `INTERNET`, `CAMERA`, `VIBRATE`, `USE_CREDENTIALS`, `USE_BIOMETRIC`, `USE_FINGERPRINT`, `ACCESS_NETWORK_STATE`, `POST_NOTIFICATIONS`, `WAKE_LOCK`, `c2dm.RECEIVE`, Capacitor's internal receiver permission.

## 9. Play Console checklist

Derived from the app and `docs/APP_STORE_SUBMISSION.md`. **Items marked 🔷 need your decision — I have not invented policy answers.**

| Field | Value |
|---|---|
| App name | `MineEx` 🔷 *("MineEx" was taken on the App Store, where you used "MineEx Mining App" — check Play availability)* |
| Package | `com.liquidjungle.mineex` |
| Default language | English (Canada) |
| App or game | **App** |
| Free or paid | **Free** *(no IAP, no purchases in the build)* |
| Play App Signing | **Enable** (required for §10) |
| Category | Finance (secondary: News) |
| Contact details | 🔷 support email — currently `nitrospicexxx@gmail.com`; `support@mineex.ca` is referenced in the Portal |
| Privacy policy | `https://mineex.ca/privacy.html` ✅ live |
| Terms | `https://mineex.ca/terms.html` ✅ live |
| **Data Safety** | Collected & linked to identity, **App Functionality only**, **no tracking, no ads**: email, name, user ID, user content (profile, messages). In-app account deletion exists (Profile → Settings → Delete account). 🔷 **You must also supply a web account-deletion URL** — Play requires one and it does not exist yet. 🔷 Declare the "Remember me" credential stored in Android Keystore. |
| Content rating | Questionnaire → expected **Everyone**; no violence/sexual/gambling content. 🔷 answer "unrestricted web access" **No** (attributed source links open in the system browser). |
| Target audience | 18+ / adults only 🔷 — it is an investor product |
| Ads declaration | **Contains ads: NO** (now provably true — AD_ID removed) |
| App access | Account required. Provide the reviewer account from `APP_STORE_SUBMISSION.md` 🔷 confirm it still works |
| Short description (≤80) | `Junior mining news, drill results and company updates in one feed.` |
| Full description | Reuse the App Store copy in `docs/APP_STORE_SUBMISSION.md` |
| App icon | 512×512 — regenerate from `assets/app-icon.svg` |
| Feature graphic | **1024×500 — does not exist yet** 🔷 |
| Phone screenshots | 2–8 needed. Existing set is iOS 1320×2868; Android captures should be retaken |
| Tablet screenshots | Only if you list tablet support — the app is phone-portrait, so **not required** |
| Track | **Internal testing** (not Production) |

## 10. Play App Signing ↔ Google OAuth

Mandatory before production Google auth can be called verified:

1. Create the app in Play Console, enable **Play App Signing**.
2. Setup → App integrity → App signing → copy the **App signing key certificate SHA-1**.
3. Google Cloud → Credentials → create an **Android** OAuth client: package `com.liquidjungle.mineex` + that SHA-1.
4. Keep the existing Android clients for the **debug** key (`EC:F0:…:2A`) and the **upload** key (`B2:FA:…:CA`).
5. Ensure the **Web** client ID is in `VITE_GOOGLE_WEB_CLIENT_ID` *and* in Supabase → Auth → Google → Authorized Client IDs, alongside the iOS client ID.

## 11. Existing findings — re-inspected

**Fixed (user-facing / obsolete branding):**
- **Passport banner** — rendered inside the native app with the pre-rebrand wordmark and a pointless "Get the app". Hidden natively on both platforms, rebranded MineEx for web.
- **B21 legal links** — Privacy/Terms now `mineex.ca`.
- **B20 Reels Save** — was inert; wired to `savedStore` (correct id-based `has()`, plus a subscription so the icon updates).

**Reported, not fixed:**
- **JMN thumbnails** — `juniorminingnetwork.com` returns **403 to any non-browser client even at its root**, with or without a referer. This is upstream bot-blocking, **not** Android- or emulator-specific. Separately, some stored `image_url` values are **tracking pixels, not images** (`rt.newswire.ca/rt.gif?...`, `thenewswire.com/api/apps/tnw/t/….gif?r=…`) — a news-ingest data-quality bug affecting **iOS and web equally**. Fixing it belongs in the ingester, not the Android release.
- **SystemBars startup warning** — Capacitor injects `--safe-area-inset-*` before `document.documentElement` exists. Harmless on WebView ≥140 (native `env()` passthrough is used), cosmetic log noise.
- **B19 MediaViewer / Reels share UI paths** — still unreachable in a guest session; handlers verified in the shipped bundle. Needs a signed-in account with company media.
- **NEW — internal artifacts ship inside the app**: `__design-system.html` (36 KB), `kingsmen-resources-backup.json` (28 KB) and `public/marketing/` (1.8 MB) are bundled into the Android assets because everything in `public/` is copied. ~1.9 MB of dead weight and internal material in a production binary. Not user-facing; worth excluding before Production.

## 12. Manual actions required from you

**Blocking Internal Testing:**
1. Apply migrations **0041** then **0042** (order in §1).
2. Create the Firebase project + `google-services.json`, set `FCM_*` in Vercel, then `VITE_ANDROID_PUSH_ENABLED=true`.
3. Create Google **Web** + **Android** OAuth clients; set `VITE_GOOGLE_WEB_CLIENT_ID`; add the Web ID to Supabase.
4. Create the app in Play Console, enable Play App Signing, upload the AAB to **Internal testing**.
5. Add the Play app-signing SHA-1 as an Android OAuth client (§10).

**Blocking public launch (not Internal Testing):**
6. Turn **Confirm email ON** (§2).
7. Provide a **web account-deletion URL** (Play requirement).
8. Feature graphic 1024×500; Android screenshots.
9. Decide the Play listing name and support email.

**Housekeeping:** back up `~/.mineex-release/`.
