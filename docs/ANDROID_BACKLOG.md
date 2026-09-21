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
| B10 | **Email confirmation appears disabled in Supabase.** `signUp()` returned an immediately-usable, `confirmed:true` session for an unroutable address, contradicting the comment at `src/lib/auth.js:50`. Anyone can register with an address they do not control. | Phase 4 | Product/security decision, not a port issue. **Release gate G3.** | Before launch (G3) |
| B11 | **Stray test user `no-such-user@example.invalid`** created accidentally during Phase 4 testing. Session revoked server-side (HTTP 204); the `auth.users` row remains. | Phase 4 | Deleting production data needs owner confirmation. | Owner action |
| B12 | **Android `signOut()` does not clear Credential Manager state** (`SocialLogin.logout` not called). Chooser should still appear given `autoSelectEnabled=false`, but unverified. | Phase 4 | Needs a working Google sign-in to verify. | Phase 7 (QA) |
| B13 | **`signOut()` does not delete the device's `push_tokens` row**, so a logged-out device keeps receiving the previous user's notifications until the token dies naturally. Pre-existing on iOS; now also true on Android. | Phase 5 | Shared logout behaviour; changing it affects iOS. | Before launch |
| B14 | **No Android notification small icon.** Without `com.google.firebase.messaging.default_notification_icon` meta-data Android draws the launcher icon as a white square. | Phase 5 | Needs a designed white-silhouette asset. | Phase 8 |
| B15 | **Android notification tap navigation is implemented but unverified** — cannot fire without Firebase. iOS taps remain a deliberate no-op. | Phase 5 | Blocked on Firebase config. | Phase 7 (QA) |
| B16 | **Foreground notification behaviour undefined.** Capacitor raises `pushNotificationReceived` in the foreground and does not auto-display; MineEx has no handler, so a foregrounded user sees nothing. Matches iOS today. | Phase 5 | Product decision. | Before launch |
| W1-W4 | **Pre-existing outbox delivery weaknesses**: no claim/lease (overlapping runs can double-send), `attempts` hardcoded to 1, `failed` is terminal so retryable errors never retry, no `sending` state. Detailed in ANDROID_PHASE5_REPORT.md §15. | Phase 5 | Redesigning delivery semantics is out of scope; reported as instructed. | Owner call |
| B17 | **Dead Share button in `Reels`** (`PassportProto.jsx` ~line 6540): a `Share2` icon button with **no `onClick`** — non-functional on every platform, not just Android. Pre-existing. | Phase 6 | Out of phase scope (audit finding only). | Phase 7 (QA) |
| B18 | **Story-reader clipboard fallback is silent.** When sharing is unavailable, `shareStory()` copies the link with no toast, unlike the media viewer which flashes "Link copied". Pre-existing inconsistency; now only reachable on platforms without a share mechanism. | Phase 6 | UX decision, not a port defect. | Owner call |
| B19 | **MediaViewer share not reachable in a guest session.** Its payload and the Android transport were verified directly, but the company media-grid UI entry point needs a signed-in account with company media posts. | Phase 6 | Needs credentials. | Phase 7 (QA) |
| B20 | **Reels `Save` button is inert** (`PassportProto.jsx`, sibling of the Share control fixed in Phase 6.5): no `onClick`. Reachable in the Media tab. | Phase 6.5 | Out of R7's scope (Share only). | Phase 7 (QA) |
| B21 | **Legal links still point at `passport-xi-five.vercel.app`** (privacy/terms in the app footer and settings). User-facing but not shares, so outside R6's stated scope. | Phase 6.5 | Scope discipline. | Phase 8 |

---

## Release gates (blocking — owner-set, Phase 4 approval)

These must PASS before Android is production-complete. Tracked at Phase 7 (QA) and
Phase 8 (Play readiness).

| Gate | Description | Earliest verifiable |
|---|---|---|
| **G1** | Real Google account -> Google ID token -> Supabase -> **persistent MineEx session** on Android. | Once an Android OAuth client exists for a signing cert in the owner's Google Cloud project, and a Google account is available on the test device. |
| **G2** | The same flow from a build installed through **Google Play Internal Testing**, signed with the **Google Play App Signing certificate**. | Only after the app exists in Play Console and Android OAuth client #3 (Play signing SHA-1) is registered. |
| **G3 (B11)** | **Email ownership verification.** Phase 4 testing indicates Supabase email confirmation may currently be disabled: `signUp()` returned an immediately-usable `confirmed:true` session for an unroutable `.invalid` address, contradicting the comment at `src/lib/auth.js:50`. Before public Android launch, verify the actual Supabase Auth email-confirmation configuration. If email/password registration grants authenticated access without proving ownership of the submitted address, propose the smallest safe correction. **Production Supabase Auth settings must NOT be changed during Phase 5.** | Requires owner access to Supabase Auth settings. |

### Release blockers (owner-set, Phase 5 approval)

Must be resolved before public Android production. **Not** to be fixed during Phase 6.

| Blocker | Item |
|---|---|
| ~~W1~~ | ~~Notification sender has no atomic claim/lease mechanism.~~ **FIXED Phase 6.5** (migration 0041) — pending application to production. |
| ~~W2~~ | ~~`attempts` hardcoded.~~ **FIXED Phase 6.5.** |
| ~~W3~~ | ~~Retryable failures have no retry lifecycle.~~ **FIXED Phase 6.5.** |
| ~~W4~~ | ~~No `sending`/claimed state.~~ **FIXED Phase 6.5** (migration 0041). |
| ~~B13~~ | ~~Logout does not disassociate the device push token.~~ **FIXED Phase 6.5** (migration 0042). |
| **B11 / G3** | Email ownership. **CONFIRMED Phase 6.5**: `mailer_autoconfirm: true` — Confirm email is OFF. Dashboard action required; see ANDROID_PHASE65_REPORT.md §5. |
| **G1** | Phase 4 Google auth verified end-to-end with a real account. |
| **G2** | …and again through a Play-signed build. |
| **G4** | Phase 5 FCM verified end-to-end once Firebase is configured. |

Android Google authentication is explicitly **"implemented / locally exercised, but NOT end-to-end production verified"** until G1 and G2 both pass.

---

**Deep-link/QR entry → Android back → exit** is *accepted behaviour* for Android v1 (owner decision, Phase 3 approval). No artificial history is manufactured for deep-link entry.
