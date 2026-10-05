# MineEx Android — Phase 3 Completion Report (Navigation)

_Branch `integration`. Phase 3 checkpoint: `c7dad37` (parent `755a3eb`)._

Android back now unwinds MineEx state instead of killing the app. **76 insertions, 0 deletions.** No iOS file touched, no `cap sync ios`, no behaviour removed.

---

## 1. Audit findings (before any change)

| # | Question | Finding |
|---|---|---|
| 1 | Major navigation states | Root `App`: `nav` (today/explore/messages/following/profile/scan), `inCompany`, `focused`, `exiting`. Plus ~20 overlay states local to individual components. |
| 2 | States that create history | **Exactly one**: the company profile. `loadSlug()` → `pushState({c:slug}, "/app?c=…")`; `leaveCompany()` → `pushState({}, "/app")`. That is the *only* `pushState` in the whole app. |
| 3 | States that do NOT | Everything else — readers, media viewer, timeline detail, search/filter/sort, settings + sub-panels, Saved, conversations, team/CEO profile, lightbox, bottom sheets, and tab switching. All plain React state. |
| 4 | Modal precedence | By z-index: reader `z-110`, settings sub-panels `z-97`, settings/scan/share `z-95`, search/filter/CEO profile `z-90`, photo `z-85`, lightbox `z-80`. Bottom sheets carry no `z-[…]` class at all (they portal), so z-index alone is not a reliable probe. |
| 5 | Existing `popstate` | One listener in `PassportProto`: reads `?c=`; no slug → `setInCompany(false)`; same slug → `setInCompany(true)`; different slug → `loadSlug(slug, {push:false})`. Handles both directions correctly. |
| 6 | Capacitor 8 back support | Not in `@capacitor/core`. Lives in `@capacitor/app` (was present only as a *transitive* dep of secure-storage; now pinned directly at `^8.1.1`). |
| 7 | Smallest implementation | A dismiss registry + a 3-step bridge. See below. |

**Baseline measured on-device:** on a company profile with `history.length = 2`, one back press → launcher. Confirmed the reported bug.

## 2. How Android back enters the existing model

Three files. Only the third is platform-specific.

```
src/lib/backStack.js       LIFO registry of "close the topmost thing" + priority
src/lib/useBackHandler.js  one-line React binding
src/lib/androidBack.js     the ONLY Android-specific file
```

Resolution order in the bridge:

```js
App.addListener("backButton", ({ canGoBack }) => {
  if (runBackHandler()) return;                               // 1. topmost overlay (React state)
  if (canGoBack || window.history.state != null) {            // 2. app history
    window.history.back();                                    //    -> existing popstate handler
    return;
  }
  App.exitApp();                                              // 3. genuine root
});
```

**This is not a second navigation system.** The registry stores no routes, screens or history — only how to undo what is currently on top. The company profile is deliberately *not* registered: it already lives in history, so Android reuses the **same** `popstate` handler as browser back rather than duplicating it. Each state is owned by exactly one mechanism, so one back press is handled exactly once.

**Priority exists for a real reason.** React runs child effects *before* parent effects, so the root's tab-fallback handler would otherwise register last and shadow every child overlay. `TAB_FALLBACK (0) < OVERLAY (10)` fixes that deterministically.

### Two platform facts that shaped the design — both measured, not assumed

**a) Installing `@capacitor/app` silently broke root exit.** Its `OnBackPressedCallback` is enabled by default and, with no JS listener and `canGoBack == false`, does *nothing*:

```java
if (!hasListeners(EVENT_BACK_BUTTON)) {
    if (bridge.getWebView().canGoBack()) { bridge.getWebView().goBack(); }
    // no else — the press is swallowed
}
```

The press was swallowed on the signed-out welcome screen, where `PassportProto`'s `App` is not mounted. Fix: the listener is wired **once in `src/main.jsx`** (entry level), so a back contract always exists for every surface.

**b) `canGoBack` is unreliable here.** Measured: `{"canGoBack": false, "histLen": 2, "search": "?c=argenta-silver-corp"}`. Capacitor reads the *native* WebView back-forward list, which does not track the app's own entries under the custom `localhost` scheme. The bridge therefore also accepts `history.state != null` — null on a cold/deep-link entry, non-null exactly once the app has pushed state of its own.

### Where handlers were registered (14 call sites, one line each)

Root `App` (scan overlay, tab fallback) · `AppRoot` in main.jsx (auth form) · `Overview` · `TimelineView` · `UpdatesView` · `CapitalView` · `ProjectGallery` · `TeamView` · `TodayScreen` · `DiscoverScreen` · `MessagesScreen` · `SavedPanel` · `ProfileScreen` · `BasicListing`.

## 3. Test results (Android 16 / API 36 emulator)

| Scenario | Result |
|---|---|
| Back at application root (welcome) | **PASS** — exits to launcher |
| Welcome → auth form → back | **PASS** — returns to welcome, app alive |
| Feed reader overlay → back | **PASS** — `z-110` overlay closes, app alive |
| Explore tab → company (real `pushState`) | **PASS** — `state={"c":"argenta-silver-corp"}`, `hist` 3→4 |
| …→ back | **PASS** — URL cleared, app alive (**the Phase-2 bug**) |
| Non-home tab → back | **PASS** — returns to home tab |
| Company → Timeline → press-release detail | **PASS** — sheet opens (DOM 17→21 elements) |
| …→ back | **PASS** — sheet closes (21→17), profile intact |
| Repeated back presses | **PASS** — unwinds and exits cleanly; no loop, no freeze |
| Back at true root after unwinding | **PASS** — launcher |
| Background (HOME) → resume → back | **PASS** — state preserved, back still works |
| JS errors across all runs | **0** |
| **Web**: `Capacitor.getPlatform()` | `"web"` — bridge no-ops |
| **Web**: `pushState` → `history.back()` | **PASS** — app restored via existing popstate |
| **Web**: console errors | **0** |
| `typecheck`, `check:anchors`, onboarding-classify (21/21), blueprint-projection (38/38) | **PASS** |

A crash I introduced mid-phase and fixed: the `Overview` hook initially referenced `whyFollowOpen`, declared ~50 lines later — a temporal dead zone that blanked the app (`ReferenceError: Cannot access 'K' before initialization`, root rendered 0 children). Fixed by moving the hook below the state it reads, and a scan now confirms **every** hook sits after all state it references.

## 4. States that still cannot be represented cleanly

1. **`leaveCompany()` pushes instead of popping.** Tapping the in-app back chevron does `pushState({}, "/app")` rather than `history.back()`, so history grows on every enter/leave cycle and a later back press can walk *forward* into a previously-visited company. Pre-existing on web and iOS; Android back itself avoids it (it uses `history.back()`). Changing it would alter shared web/iOS behaviour, so it is left for your decision.
2. **Per-row inline menus** (`CompanyListRow`) and **inline expanders** (`ActivityRow`) are not registered. Back does not collapse them. Deliberate: they are inline affordances, not overlays, and registering per-row handlers would add noise for little gain.
3. **Tab history is not traversable.** Tab switches create no history entries, so back goes home rather than retracing tab order. Adding entries per tab switch would change web behaviour and is not typical mobile UX.
4. **Deep-link entry exits on first back.** Opening `?c=<slug>` cold has `history.state == null`, so back exits. Correct Android behaviour for a deep link, but worth confirming it matches your intent for QR-scanned profiles.
5. **Signed-in-only surfaces were not exercised on-device.** Messages, Saved, Settings sub-panels, Following and the media viewer have handlers registered and build clean, but testing them needs a real login; I did not enter credentials. They should be re-checked in Phase 7 QA.

## 5. Shared / web behaviour

Unchanged by construction and by measurement. `androidBack.js` returns immediately unless the platform is literally `"android"`, and it is the **only** consumer of the registry — on web and iOS handlers register, unregister and are never called. The web build reports platform `"web"`, logs zero console errors, and `pushState` → `history.back()` still restores the app through its existing `popstate` handler.

## 6. iOS

`ios/` and `capacitor.config.json` are **byte-identical** to the Phase 2 checkpoint (verified with `git diff --quiet`). `npx cap sync ios` was never run; only `npx cap sync android`. No signing, entitlement, APNs or iOS auth change.

Note: the shared files touched (`src/main.jsx`, `src/aiBrief/PassportProto.jsx`) do ship to iOS and web on their next build/deploy. The additions are inert off-Android, but they are production changes and should be reviewed as such.

## 7. Files

**Added:** `src/lib/backStack.js`, `src/lib/useBackHandler.js`, `src/lib/androidBack.js`, this report.
**Modified:** `src/main.jsx` (+14), `src/aiBrief/PassportProto.jsx` (+56), `package.json` / lock (`@capacitor/app` pinned direct), `android/app/capacitor.build.gradle` + `android/capacitor.settings.gradle` (regenerated by `cap sync android`).

## 8. Not touched (per scope discipline)

Junior Mining Network image failures · SystemBars safe-area warning · stale "Passport / Get the app" banner · Google auth · push · native sharing · Conference Mode.
