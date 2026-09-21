// src/lib/androidBack.js — the ONLY Android-specific navigation code in MineEx.
//
// Translates the hardware back gesture/button into the navigation model the app
// already has. It adds no routes, no screen stack and no state of its own:
//
//   1. an overlay is open   -> ask the shared registry to dismiss the topmost one
//                              (src/lib/backStack.js — plain React state transitions)
//   2. app history exists   -> window.history.back(), which fires the popstate
//                              listener PassportProto already installs for `?c=<slug>`
//   3. genuinely at the root-> App.exitApp() (normal Android behaviour)
//
// Ordering matters: overlays first, because an overlay drawn over a company profile
// must close before the profile itself is popped off history.
//
// NO DOUBLE-HANDLING. Capacitor's AppPlugin only performs its own default
// (webView.goBack() / finish) when NO "backButton" listener is registered; once we
// register one it merely emits the event and leaves the decision to us. So exactly
// one thing reacts to a back press.
//
// iOS and web never load this: wireAndroidBack() returns immediately unless the
// Capacitor platform is literally "android".
import { Capacitor } from "@capacitor/core";
import { runBackHandler } from "./backStack.js";

let wired = false;

export async function wireAndroidBack() {
  try {
    if (wired) return;
    if (typeof window === "undefined") return;
    if (!Capacitor || typeof Capacitor.getPlatform !== "function") return;
    if (Capacitor.getPlatform() !== "android") return; // iOS + web: no-op
    wired = true;

    // Imported lazily so the plugin is never pulled into the iOS/web bundle path.
    const { App } = await import("@capacitor/app");

    App.addListener("backButton", ({ canGoBack }) => {
      // 1. Topmost overlay / drill-down that lives in React state.
      if (runBackHandler()) return;

      // 2. Anything the app itself put in history — today that is the company
      //    profile (loadSlug/leaveCompany pushState). Delegating to history.back()
      //    means Android reuses the SAME popstate handler as browser back rather
      //    than a parallel code path.
      //
      //    We do NOT trust `canGoBack` alone. Measured on Android 16 / API 36:
      //    after an in-page navigation the plugin reported canGoBack:false while
      //    window.history.length was 2 — Capacitor reads the native WebView
      //    back-forward list, which does not track the app's own history entries
      //    under the custom localhost scheme. `history.state` is the reliable
      //    signal: it is null on a cold entry (deep link, first paint) and
      //    non-null exactly once the app has pushed a state of its own.
      if (canGoBack || window.history.state != null) {
        window.history.back();
        return;
      }

      // 3. Root: normal Android exit.
      App.exitApp();
    });
  } catch (_) {
    // A failure here must never break app start; back simply keeps Capacitor's
    // default behaviour.
    wired = false;
  }
}

export default wireAndroidBack;
