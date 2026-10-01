# MineEx — Android Port Readiness Report

_Audit date: 2026-09-20. Audited from the `portal-work` worktree at `83ace08`. No source or iOS project files were modified to produce this report._

**Verdict:** The port is architecturally straightforward. MineEx is already a single shared web app inside a thin Capacitor shell, and only **four JS files** touch native at all. There is no rewrite here. The real work is *platform plumbing* — FCM, Google Credential Manager, an Android native project, a Play release pipeline — plus one genuine backend change (the push sender is APNs-only).

**The port is not blocked by code. It is blocked by accounts, credentials and a local toolchain that does not exist on this machine.** See §13.

---

## 1. Existing mobile architecture

| Layer | What it actually is |
|---|---|
| UI / app code | React 18.3 + Vite 5.4, plain JS/JSX (no TS except `src/studio`). No router library — surfaces are chosen by `window.location.pathname` at boot in [src/main.jsx:80-120](src/main.jsx:80); in-app navigation is React state. |
| The mobile app itself | [src/aiBrief/PassportProto.jsx](src/aiBrief/PassportProto.jsx) — 10,904 lines, plus `Feed.jsx`, `PullToRefresh.jsx`, `ProHighlightsCarousel.jsx`, `conferenceUI.jsx`, `ConferenceScenes.jsx`. Tabs: today / explore / messages / following / profile, plus a full-screen QR `scan` overlay. |
| Native wrapper | **Capacitor 8.5.0**. `appId` `com.liquidjungle.mineex`, `appName` `MineEx`, `webDir` `dist` ([capacitor.config.json](capacitor.config.json)). |
| iOS native project | `ios/App` — **Swift Package Manager** flavour (`ios/App/CapApp-SPM/Package.swift`), not CocoaPods. `IPHONEOS_DEPLOYMENT_TARGET 15.0`, `MARKETING_VERSION 1.3.1`, `CURRENT_PROJECT_VERSION 17`, `DEVELOPMENT_TEAM CN22GUC825`. Stock `AppDelegate` + `SceneDelegate` with **one** hand-written addition: APNs token forwarding to the Capacitor push plugin ([ios/App/App/AppDelegate.swift:38-48](ios/App/App/AppDelegate.swift:38)). |
| Build & ship (iOS) | `vite build` → `npx cap sync ios` → Xcode archive → `ios/ExportOptions-upload.plist` (`method: app-store`, team `CN22GUC825`). Documented in [docs/APP_STORE_SUBMISSION.md](docs/APP_STORE_SUBMISSION.md). |
| Backend | **Supabase** `rvptronniomlqumjhyrr` — called with raw `fetch` against GoTrue (`/auth/v1`) and PostgREST (`/rest/v1`). **`supabase-js` is not used at all.** 40 migrations in `supabase/migrations/`. |
| Server functions | Vercel serverless, 38 handlers in `api/`. 4 crons (news pull / process / notify / push-send) in [vercel.json](vercel.json). |
| Native → backend | The native shell is served from `capacitor://localhost`, so relative `/api/...` has no server. [src/lib/platform.js:18](src/lib/platform.js:18) rewrites the base to `https://passport-xi-five.vercel.app` when native. |
| Auth | Hand-rolled GoTrue client, [src/lib/auth.js](src/lib/auth.js). Session in `localStorage` under `pp.session`, manual refresh 60s before expiry. Social sign-in exchanges a provider `id_token` via `grant_type=id_token`. |
| Native plugins (all 3) | `@capacitor/push-notifications` 8.1.2, `@capgo/capacitor-social-login` 8.5.0, `@aparajita/capacitor-secure-storage` 8.0.0. |
| PWA | `public/sw.js` + `manifest.webmanifest`, registered only when `hostname !== "localhost"` ([index.html:27-30](index.html:27)) — so it is **skipped in the native shell on both platforms**. Nothing to change. |

Environment variables consumed by the client are only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (with hardcoded fallbacks in [src/lib/supabase.js:5](src/lib/supabase.js:5)). Everything else (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_KEY`, `APNS_*`, Stripe) is server-side on Vercel and never reaches a device.

## 2. What is already cross-platform

Effectively the entire product. The grep for any Capacitor/native reference across `src/` and `api/` returns hits in **four files only**:

- [src/lib/platform.js](src/lib/platform.js) — native detection + API base. Detection reads `capacitor:` protocol **or** `window.Capacitor.isNativePlatform()`. Android uses `https://localhost`, so the protocol test fails but the `Capacitor` test succeeds. **Works on Android unchanged.**
- [src/lib/auth.js](src/lib/auth.js) — social sign-in. Needs Android config added (§6).
- [src/lib/push.js](src/lib/push.js) — push registration. Needs platform tagging (§7).
- [src/main.jsx](src/main.jsx) — `SecureStorage` "Remember me". Plugin ships an Android implementation; **works unchanged**.

Also already portable, verified by inspection:
- All data access (PostgREST/GoTrue over `fetch`), all business logic, all rendering, Tailwind + inline styles.
- `viewport-fit=cover` is already set ([index.html:5](index.html:5)) — a prerequisite for Android safe-area passthrough.
- `env(safe-area-inset-*)` is used in 17 places and always with a `0px` fallback — degrades safely.
- `overscroll-behavior-y: contain` on the pull-to-refresh container ([src/aiBrief/PullToRefresh.jsx:61](src/aiBrief/PullToRefresh.jsx:61)) — already suppresses Chrome's native overscroll refresh.
- `popstate` is already wired to in-app navigation ([src/aiBrief/PassportProto.jsx:10802](src/aiBrief/PassportProto.jsx:10802)) — this is the hook the Android back button will use.
- The three installed plugins each ship an `android/` source tree. None needs replacing.
- `notification_outbox` and `push_tokens` already carry a `platform` column, and `push_tokens.platform` already allows `'android'` ([supabase/migrations/0025_push_notifications.sql:22](supabase/migrations/0025_push_notifications.sql:22)). The fan-out in `api/news-notify.js` is already platform-agnostic.
- The investor app contains **zero** `<input type="file">` — no media-picker work, no storage permissions.

## 3. Every iOS-specific dependency or implementation

| # | Item | Location |
|---|---|---|
| 1 | Xcode project, SPM manifest, `AppDelegate`/`SceneDelegate` | `ios/` |
| 2 | Entitlements: `aps-environment: production`, `com.apple.developer.applesignin` | [ios/App/App/App.entitlements](ios/App/App/App.entitlements) |
| 3 | `NSCameraUsageDescription`, orientation lists, `ITSAppUsesNonExemptEncryption`, `CFBundleURLSchemes` (reversed Google iOS client id) | [ios/App/App/Info.plist](ios/App/App/Info.plist) |
| 4 | `"ios": { "contentInset": "never", "backgroundColor": "#ffffff" }` | [capacitor.config.json](capacitor.config.json) |
| 5 | **Hardcoded Google *iOS* OAuth client id**, and `socialInit()` passes only `google: { iOSClientId }` | [src/lib/auth.js:74-82](src/lib/auth.js:74) |
| 6 | Apple sign-in via native `AuthenticationServices` | [src/lib/auth.js:92-100](src/lib/auth.js:92) |
| 7 | **`platform: "ios"` hardcoded** on every device token row | [src/lib/push.js:27](src/lib/push.js:27) |
| 8 | **APNs-only sender** — Node `http2` + ES256 `.p8` JWT, `apns-topic`, `aps` payload, `BadDeviceToken`/`Unregistered` handling. Drains *all* pending outbox rows regardless of `platform`. | [api/news-push-send.js](api/news-push-send.js) |
| 9 | iOS-only error copy: *"Turn it on in Settings → MineEx → Camera"* | [src/aiBrief/PassportProto.jsx:7686](src/aiBrief/PassportProto.jsx:7686) |
| 10 | Comments describing SecureStorage as "iOS Keychain" (behaviour is fine; wording is stale) | [src/main.jsx:9,222](src/main.jsx:9) |
| 11 | Icon pipeline writes the iOS `AppIcon.appiconset` + PWA set only | [scripts/generate-icons.mjs:18-26](scripts/generate-icons.mjs:18) |
| 12 | App Store collateral: `docs/APP_STORE_SUBMISSION.md`, `appstore-screenshots/` (1320×2868) | — |

Nothing on that list is load-bearing for business logic. Items 5–9 are the only ones inside shared code.

## 4. Android equivalents required

| iOS thing | Android equivalent | Effort |
|---|---|---|
| `ios/` Xcode project | `android/` generated by `npx cap add android` (Capacitor 8 template: **compileSdk 36 / targetSdk 36 / minSdk 24**, AGP 8.13, Gradle 8.14.3 — already at the Play requirement) | 1h |
| APNs + `aps-environment` | **FCM**: Firebase project, `android/app/google-services.json`, `firebase-messaging:25.0.1` (pulled in by the plugin) | 2h + account work |
| `.p8` APNs sender | New **FCM HTTP v1** sender path in `api/news-push-send.js` (service-account JWT → OAuth2 token → `POST /v1/projects/<id>/messages:send`) | 4–6h |
| `NSCameraUsageDescription` | `<uses-permission android:name="android.permission.CAMERA"/>` + runtime prompt (Capacitor's `BridgeWebChromeClient` drives it) | 15m |
| `com.apple.developer.applesignin` | Apple OAuth **web** flow: Services ID + a redirect endpoint on Vercel + custom-scheme intent filter (§6). **Optional for v1.** | 6–10h |
| Google iOS OAuth client | Google **Web** client id (`webClientId`, for Credential Manager) **plus** an Android OAuth client per signing cert (package + SHA-1) | 1–2h + console work |
| iOS Keychain (`SecureStorage`) | Same plugin → Android Keystore / `EncryptedSharedPreferences`. No code change. | 0 |
| Home indicator / notch insets | Capacitor 8 `SystemBars` (built in) — see §10 | test-only |
| No back button | `@capacitor/app` `backButton` listener → mapped onto existing `popstate` logic | 2–3h |
| `UISupportedInterfaceOrientations` | `android:screenOrientation="portrait"` (ignored on large screens under Android 16) | 15m |
| `AppIcon.appiconset` | Adaptive icon (`ic_launcher_foreground` + background), all mipmap densities, plus a **white-silhouette notification icon** | 1–2h |
| App Store Connect | Play Console: **AAB**, Play App Signing, Data Safety form, content rating, closed-testing track | see §11 |
| `ExportOptions-upload.plist` | `./gradlew bundleRelease` + upload keystore (or Play App Signing) | 2h |

Recommended additional plugins: `@capacitor/app` (back button, resume), `@capacitor/share` (§5), optionally `@capacitor/haptics` and `@capacitor/status-bar`.

## 5. Anything likely to behave differently on Android

Ordered by how likely it is to bite.

1. **Hardware back button — certain breakage.** Capacitor's default is "go back in WebView history, else exit the app." The app's screens are React state, not history entries, so back will *quit the app* from a company profile, the scan overlay or a sheet. Must be intercepted. The `popstate` handler at [PassportProto.jsx:10802](src/aiBrief/PassportProto.jsx:10802) plus `setInCompany`/`setNav`/overlay state gives a clean place to land.
2. **`navigator.share` — very likely unavailable.** WKWebView implements the Web Share API; **Android System WebView does not**. Both call sites ([PassportProto.jsx:2611](src/aiBrief/PassportProto.jsx:2611) and [:6338](src/aiBrief/PassportProto.jsx:6338)) already fall back to a clipboard copy, so nothing breaks — but Android users would silently lose the share sheet. Fix with `@capacitor/share`. *Confirm on-device before building the fix.*
3. **Safe-area insets — works, with a version split.** Capacitor 8's `SystemBars` plugin: on WebView **≥140** with `viewport-fit=cover` it passes real insets through so `env(safe-area-inset-*)` is correct; on **<140** it pads the decor view instead (so the layout is already inset and `env()` resolving to `0px` is right) and additionally injects `--safe-area-inset-*` **CSS custom properties** — which this codebase does not read. Net: correct on both paths, but needs visual verification on a notched device and a gesture-nav device.
4. **Keyboard/IME.** iOS resizes the WKWebView; Android's behaviour depends on `SystemBars` IME inset handling and `windowSoftInputMode`. The message composer and auth form are the places to check. `100dvh` and the `resize` listeners in the app should cope, but this is an on-device test item.
5. **`screen.orientation.lock("portrait")`** ([PassportProto.jsx:10730](src/aiBrief/PassportProto.jsx:10730)) is a silent no-op on iOS and typically rejects in Android WebView — it is already `.catch()`-ed. Lock in the manifest instead.
6. **Camera permission UX.** `getUserMedia` works (Capacitor serves `https://localhost`, a secure context), but Android shows an OS permission dialog on first use and the "denied" copy is iOS-worded.
7. **`navigator.vibrate`** (haptics, used widely) needs `<uses-permission android:name="android.permission.VIBRATE"/>`, and is weaker/coarser than iOS haptics.
8. **WebView fragmentation.** `minSdk 24` admits devices whose WebView may be far behind Chrome. The app uses `color-mix()`, `backdrop-filter`, `100dvh`, `aspect-ratio` and **three.js/WebGL** (the Conference globe). Recommendation: **raise `minSdkVersion` to 26**, and smoke-test the globe on a low-end device.
9. **External font CDNs** (`api.fontshare.com`, Google Fonts) are fetched at runtime in the native shell on both platforms — equal behaviour, but a cold-start-offline risk worth noting.
10. **Storage durability.** Android's per-app "Clear storage" wipes `localStorage`, taking `pp.session` with it. SecureStorage survives separately, so "Remember me" still works — but users can be logged out more easily than on iOS.
11. **Dark mode.** The app is light-only and the Capacitor template theme is `DayNight`; force a light background so system dark mode cannot produce a black flash behind the WebView.
12. **Tablets / foldables.** Under Android 16, large screens ignore `screenOrientation` and resizability restrictions. The app is a centred `max-w-[480px]` phone layout — it will letterbox or stretch. Acceptable for v1, but it *will* be seen in review screenshots.

## 6. Authentication risks

The backend, session model and RLS are untouched — Android hits the same GoTrue and the same `grant_type=id_token` exchange. The risk is entirely in **token audience configuration**.

- **Google on Android uses Credential Manager**, and the `id_token` it returns is issued for the **Web** client id — *not* the iOS one, and not the Android one. Concretely:
  - `socialInit()` must pass `google: { webClientId }` on Android ([src/lib/auth.js:77](src/lib/auth.js:77)).
  - An **Android OAuth client** (package name + SHA-1) must exist **per signing certificate** — debug, upload, *and* the Play App Signing cert. Missing the Play cert is the classic "works in testing, fails in production" failure (`[28444] Developer console is not set up correctly`).
  - **Supabase → Auth → Google → Authorized Client IDs must list the Web client id alongside the existing iOS one.** This is an additive change to the shared backend; it does not affect iOS.
- **Apple on Android has no native path.** `@capgo/capacitor-social-login` implements it as a web OAuth flow requiring a **Services ID**, a **server redirect URL** (a new `api/` route), a custom-scheme intent filter, and `launchMode="singleTask"`. The resulting `id_token` audience is the Services ID, which Supabase's Apple provider must also accept. **Apple does not require Sign in with Apple on non-Apple platforms** — my recommendation is to ship Android v1 with email/password + Google and add Apple in a follow-up.
- **`SecureStorage` stores the raw password** for "Remember me" ([src/main.jsx:255](src/main.jsx:255)). On Android that lands in Keystore-backed encrypted prefs — acceptable, but it must be declared honestly in the Play **Data Safety** form, and it is worth revisiting in favour of a refresh-token-only approach.
- **Password reset** already redirects to the deployed web `/reset` for native ([src/lib/auth.js:225](src/lib/auth.js:225)) — correct on Android with no change.
- **Google Play requires an account-deletion path**, both in-app *and* at a web URL. In-app deletion exists (Profile → Settings → Delete account); a public web deletion-request page must be added to satisfy the Play listing field.

## 7. Push notification requirements

Current state: fan-out is platform-aware, the **sender is not**.

Required:
1. Firebase project for `com.liquidjungle.mineex`; download `google-services.json` → `android/app/`. (The Capacitor template's `app/build.gradle` already applies the `google-services` plugin when that file is present.)
2. `PushNotifications.register()` already works unchanged — the plugin returns an FCM token.
3. **`src/lib/push.js:27` must stop hardcoding `platform: "ios"`** and send `Capacitor.getPlatform()`.
4. **`api/news-push-send.js` must branch by platform.** Query `notification_outbox` per platform; keep the existing APNs path; add an FCM **HTTP v1** path: service-account JSON → signed JWT → OAuth2 access token → `POST https://fcm.googleapis.com/v1/projects/<project>/messages:send`. New env: `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`.
5. **Payload shape differs.** APNs takes `{ aps: {...}, ...data }`; FCM v1 takes `{ message: { token, notification: {title, body}, android: {...}, data: {...} } }` and **every `data` value must be a string** — the current `data` carries `category: null` and would need coercion.
6. **Dead-token handling differs**: APNs `BadDeviceToken`/`Unregistered` → FCM `UNREGISTERED` / `INVALID_ARGUMENT`. The existing delete-on-dead-token logic must learn the FCM codes.
7. **`POST_NOTIFICATIONS` runtime permission** (API 33+). The plugin declares it; `requestPermissions()` in `registerPush()` already drives the prompt correctly.
8. **Notification channel** (`default`) and a **white-silhouette small icon** — without it Android renders a white square.
9. The cron `/api/news-push-send` (every hour, [vercel.json](vercel.json)) needs no schedule change.

## 8. Deep-link requirements

**There are no deep links today on either platform** — `ios/App/App/App.entitlements` has no `associated-domains`, and the only `CFBundleURLTypes` entry is the reversed Google client id for OAuth. Push taps are an explicit no-op ([src/lib/push.js:52](src/lib/push.js:52)), even though the outbox payload carries `company_slug` and `news_item_id`.

So Android needs:
- **Required for v1:** nothing, to reach parity.
- **Required only if Apple sign-in ships on Android:** a custom-scheme intent filter + `launchMode="singleTask"` for the OAuth callback.
- **Recommended (equal work on both platforms, do it once):** Android App Links for `/p/<id>` and `/app?c=<slug>` via `.well-known/assetlinks.json` on the host, and wiring `pushNotificationActionPerformed` to open the company/story. This is a *parity improvement*, not a port requirement — I'd keep it out of the v1 scope.

## 9. File/media permission requirements

Genuinely light. The investor app has **no file inputs** and does no uploads; `src/lib/storage.js` is used by the desktop portal/admin surfaces, which are not part of the Android app.

| Permission | Why | Required |
|---|---|---|
| `INTERNET` | template default | yes |
| `CAMERA` | QR scanner `getUserMedia` ([PassportProto.jsx:7642](src/aiBrief/PassportProto.jsx:7642)) | yes |
| `VIBRATE` | `navigator.vibrate` haptics | yes |
| `POST_NOTIFICATIONS` | push (API 33+) | yes (declared by plugin) |
| Storage / `READ_MEDIA_*` | — | **no** |
| `AD_ID` | — | **no** — must be *excluded*; the social-login SDK can pull it in transitively and Play will flag it. Remove with a manifest `tools:node="remove"` or declare it in the Console. |

## 10. UI/layout risks

Consolidating §5 into what must actually be looked at on a device:

- Top inset on a notched device and bottom inset with **gesture navigation** vs **3-button navigation** (the bottom nav is the exposure).
- Keyboard-open layout in: sign-in, investor onboarding, the message composer, the "report/claim" sheets.
- Back-button behaviour from every overlay: company profile, scan, reader, sheets, onboarding.
- Pull-to-refresh vs Chrome overscroll on the Today feed.
- The three.js Conference globe on a low-end device (frame rate, memory, thermal).
- Dark-mode flash behind the WebView; splash-screen theme.
- Tablet/foldable letterboxing.
- Font CDN cold start.

## 11. Google Play requirements

- **Target API 36 / compileSdk 36** — already the Capacitor 8 template default. No gradle surgery needed.
- **App Bundle (.aab)**, not APK. **Play App Signing** strongly recommended (it also fixes the "which SHA-1?" problem for Google sign-in — you must register the *Play* signing cert's SHA-1, not only your upload cert's).
- **16 KB page-size compatibility** — required for apps targeting recent API levels on Android 15+. Capacitor itself ships no native `.so`; the risk sits in transitive Firebase/AndroidX libs, which must be kept current. Verify at bundle time.
- **Data Safety form** — must declare: email + user id (account), user content (profile, messages), and the locally stored credential. No tracking, no ads, no analytics SDKs (consistent with the App Store privacy label already written).
- **Content rating** questionnaire; **Privacy Policy URL** (live: `/privacy.html`); **account-deletion URL** (needs creating, §6).
- **Financial-services policy** — MineEx is informational, not brokerage, and already carries "not investment advice" disclaimers. Expect a declaration, possibly a review question.
- **Closed testing requirement** — for personal developer accounts, Play requires a sustained closed test (on the order of **12 testers for 14 continuous days**) before a production release is permitted. **This is the single biggest schedule risk** and it is calendar time, not engineering time. Organisation accounts are exempt. *Verify the current rule in the Console for your account type — Play policy moves, and this report's knowledge of it should not be trusted over what the Console says today.*
- Listing name availability ("MineEx" was taken on the App Store; check Play), plus a fresh screenshot set at Android dimensions and a 1024×500 feature graphic.

## 12. Exact implementation sequence

Each phase ends at a verifiable gate. Phases 0–2 need no Google accounts and can start the moment a JDK + SDK exist.

**Phase 0 — Repo hygiene (blocking, do first)**
0.1 Resolve the branch fork: local `main` is 3 commits ahead (carrying the iOS release state) while `origin/main` is 18 ahead (Conference Mode work). Pick one integration branch and merge. *Without this there is no "shared app" to point two builds at.*
0.2 Create a dedicated `android-port` branch/worktree. The iOS project is not touched in any phase.

**Phase 1 — Toolchain**
1.1 Install JDK 21 + Android Studio + SDK 36; set `ANDROID_HOME`.
1.2 `npm i @capacitor/android@8.5.2 @capacitor/app @capacitor/share` → `npx cap add android`.
1.3 Set `applicationId` `com.liquidjungle.mineex`, `versionName 1.0.0`, `versionCode 1`, app label "MineEx", portrait lock, light theme, `minSdkVersion 26`.
1.4 Add `android` block to `capacitor.config.json` (background `#ffffff`).
**Gate:** `vite build && npx cap sync android && ./gradlew assembleDebug` installs and the app boots signed-out to the welcome splash.

**Phase 2 — Platform behaviour (no external accounts needed)**
2.1 Back-button handler via `@capacitor/app`, mapped onto the existing nav/overlay state + `popstate`.
2.2 `CAMERA` + `VIBRATE` permissions; verify the QR scanner end-to-end; platform-conditional permission copy.
2.3 Replace `navigator.share` with a small `share()` helper that prefers `@capacitor/share` when native.
2.4 Inset / IME / overscroll / dark-mode pass on a notched device and a gesture-nav device.
2.5 Adaptive launcher icon + notification icon; extend `scripts/generate-icons.mjs` to emit the Android sets.
**Gate:** full manual walkthrough — sign in with email/password, onboarding, feed, reader, explore, company profile, scan, messages, profile, sign out — with no layout or back-button defects.

**Phase 3 — Google sign-in** *(needs Google Cloud access)*
3.1 Create the Web OAuth client + Android OAuth clients (debug, upload, Play signing SHA-1s).
3.2 `socialInit()` passes `webClientId` on Android; keep `iOSClientId` for iOS — additive, iOS behaviour unchanged.
3.3 Add the Web client id to Supabase → Auth → Google → Authorized Client IDs.
**Gate:** Google sign-in yields a Supabase session whose `sub` matches the iOS account for the same Google user.

**Phase 4 — Push** *(needs Firebase + Vercel env)*
4.1 Firebase project + `google-services.json`.
4.2 `push.js` sends the real platform.
4.3 FCM v1 sender path in `api/news-push-send.js`, platform-partitioned drain, FCM dead-token codes, string-coerced `data`, `?probe=` support for FCM. **The APNs path must be provably untouched.**
4.4 Notification channel + small icon.
**Gate:** an outbox row for an Android token delivers to a device; an iOS row still delivers via APNs; `?probe=` passes on both.

**Phase 5 — Release engineering**
5.1 Upload keystore (or Play App Signing) with documented custody.
5.2 `bundleRelease`; verify 16 KB alignment and the absence of `AD_ID`.
5.3 Play Console: listing, screenshots, feature graphic, Data Safety, content rating, deletion URL, privacy/terms/support URLs.
5.4 Internal testing track → closed testing (start the 14-day clock **as early as possible**, ideally in parallel with Phase 4).
**Gate:** production rollout.

**Phase 6 — Optional follow-ups (explicitly out of v1)**
Apple sign-in on Android; App Links + push-tap deep linking for both platforms; tablet layout.

Rough engineering estimate, excluding account setup and the Play testing clock: **Phases 1–2 ≈ 3–4 days, Phase 3 ≈ 1 day, Phase 4 ≈ 2 days, Phase 5 ≈ 1–2 days.**

## 13. Blockers

**Hard — work cannot start:**
- **B1. No Android toolchain on this machine.** No JDK (`/usr/libexec/java_home` finds none), no `~/Library/Android/sdk`, no Android Studio, `ANDROID_HOME` unset. Capacitor 8 needs JDK 17+ (21 recommended), AGP 8.13, Gradle 8.14.3.
- **B2. No Google Play developer account** (and if it is a personal account, the closed-testing clock gates the production release — start it early).
- **B3. Branch fork.** `main` and `origin/main` have diverged 3 vs 18 commits across five worktrees. There is currently no single branch that is "the shared MineEx application."

**Hard — needed by Phase 3/4:**
- **B4.** Firebase project + `google-services.json` + an FCM service account.
- **B5.** Google Cloud OAuth clients (Web + one Android client per signing cert) **and** the Supabase Google provider audience update.
- **B6.** Upload keystore creation and custody.

**Decisions I need from you:**
- **D1. Apple sign-in on Android — in or out of v1?** (Out is my recommendation: it needs a Services ID, a new server redirect route and a Supabase audience change, and Apple does not require it off-platform.)
- **D2. `minSdkVersion` 24 or 26?** (26 — it drops the oldest WebViews that are most likely to break `color-mix`, `backdrop-filter` and the WebGL globe.)
- **D3. Play App Signing — yes?** (Yes; it also simplifies the SHA-1 registration for Google sign-in.)
- **D4. Which branch becomes the shared integration branch?**
- **D5.** Does the Android app ship the Conference/globe surfaces, or is Android v1 the investor app only?

**One honesty note on "do not modify the shipping iOS app":** Phases 3 and 4 edit `src/lib/auth.js` and `src/lib/push.js`, which are *shared* files. The changes are additive and platform-guarded, and **the shipped iOS binary is unaffected until someone re-runs `cap sync ios` and submits a new build**. But those files also ship to the web app on the next Vercel deploy, so the changes still need review as production changes — they are not free.
