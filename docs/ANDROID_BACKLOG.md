# MineEx Android — Deferred Findings Backlog

Issues discovered during the Android port that were deliberately NOT fixed in the
phase that found them. Each names the phase that found it and the reason it was
deferred. Nothing here is a regression introduced by the port unless stated.

| # | Finding | Found in | Why deferred | Suggested phase |
|---|---|---|---|---|
| B1 | **`leaveCompany()` pushes instead of popping.** The in-app back chevron does `pushState({}, "/app")` rather than `history.back()`, so history grows on every enter/leave cycle and a later back press can walk *forward* into a previously visited company. Pre-existing on web and iOS. Android hardware back avoids it (it calls `history.back()`). | Phase 3 | Shared navigation architecture; fixing it changes web + iOS behaviour. Owner decision. | Post-v1 / owner call |
| B2 | **External news thumbnails fail to load.** 13 of 21 `<img>` on a guest profile, all `https://www.juniorminingnetwork.com/images/jmn_feeder/…`. Company-owned imagery (logo, hero, icons) loads fine. Cause not established — emulator egress, hotlink protection, or source-side 403. Unknown whether iOS is affected. | Phase 2 | Out of phase scope. | Phase 7 (QA) |
| B3 | **`Error injecting safe area CSS`** ×3 at startup. Capacitor 8's `SystemBars` injects `--safe-area-inset-*` before `document.documentElement` exists. Harmless on WebView ≥140 (native `env()` passthrough is used instead), but matters for older WebViews where Capacitor pads the decor view. | Phase 2 | Cosmetic on current targets. | Inset/layout phase |
| B4 | **Stale "Passport / Get the app" guest banner.** Gated on `guest && !bannerOff`, **not** on platform, so it renders inside the native app with a "Get the app" button and the pre-rebrand "Passport" wordmark. Affects the **iOS** QR-scan/shared-link guest flow identically. Cross-platform content bug, not an Android regression. | Phase 2 | Shared shipping code, outside phase scope. | Owner call |
| B5 | **Inline row menus / expanders not closed by Android back** (`CompanyListRow`, `ActivityRow`). Deliberate: inline affordances, not overlays. | Phase 3 | By design; low value, adds per-row noise. | Won't fix unless requested |
| B6 | **Tab history is not traversable.** Tab switches create no history entries; back returns to the home tab rather than retracing tab order. | Phase 3 | Adding history per tab switch would change web behaviour and is atypical mobile UX. | Won't fix unless requested |
| B7 | **Signed-in Android surfaces not yet exercised on-device** (Messages, Saved, Settings sub-panels, Following, media viewer). Back handlers are registered and build clean but were not tested without a login. | Phase 3 | Needed credentials. | Phase 7 (QA) |
| B8 | **Template test boilerplate has the wrong package** — `android/app/src/{test,androidTest}/java/com/getcapacitor/myapp/`. Stock Capacitor leftovers. | Phase 2 | No unrelated refactoring. | Housekeeping |
| B9 | **`avdmanager` device-catalogue warning** (`devices.xml` missing from cmdline-tools). AVD falls back to a default profile; works fine. Installing Android Studio supplies the catalogue. | Phase 2 | Cosmetic, local tooling only. | Optional |
| B10 | **Email confirmation appears disabled in Supabase.** `signUp()` returned an immediately-usable, `confirmed:true` session for an unroutable address, contradicting the comment at `src/lib/auth.js:50`. Anyone can register with an address they do not control. | Phase 4 | Product/security decision, not a port issue. | Before launch |
| B11 | **Stray test user `no-such-user@example.invalid`** created accidentally during Phase 4 testing. Session revoked server-side (HTTP 204); the `auth.users` row remains. | Phase 4 | Deleting production data needs owner confirmation. | Owner action |
| B12 | **Android `signOut()` does not clear Credential Manager state** (`SocialLogin.logout` not called). Chooser should still appear given `autoSelectEnabled=false`, but unverified. | Phase 4 | Needs a working Google sign-in to verify. | Phase 7 (QA) |

**Deep-link/QR entry → Android back → exit** is *accepted behaviour* for Android v1 (owner decision, Phase 3 approval). No artificial history is manufactured for deep-link entry.
