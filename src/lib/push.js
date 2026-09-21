// src/lib/push.js — device push registration (client side of the push system whose
// backend is api/news-notify.js + api/news-push-send.js + migration 0025).
//
// NATIVE ONLY (a no-op on web). Requests permission, registers with the platform's
// push service (APNs on iOS, FCM on Android), and
// upserts the device token into public.push_tokens under the SIGNED-IN user (RLS
// requires auth.uid() = user_id, so we send the user's id + the authed headers).
// Best-effort + idempotent — safe to call on every app open.
import { PushNotifications } from "@capacitor/push-notifications";
import { Capacitor } from "@capacitor/core";
import { SUPABASE_URL } from "./supabase.js";
import { getUser, authHeaders } from "./auth.js";

// TEMP on-device diagnostics — flip PUSH_DEBUG to false (or delete) once verified.
const PUSH_DEBUG = false;
function dbg(msg) { try { if (PUSH_DEBUG) window.alert("[push] " + msg); } catch (_) {} }

let _listenersWired = false;

async function saveToken(value) {
  try {
    const u = getUser();
    if (!u || !u.id || !value) { dbg("save skipped: user=" + (!!u) + " token=" + (!!value)); return; }
    const headers = await authHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/push_tokens?on_conflict=user_id,token`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      // The RECORDED platform is what the sender routes on, so it must be the real
      // one — never a default. An 'ios' row means APNs, 'android' means FCM, and
      // the sender refuses to guess for anything else.
      body: JSON.stringify([{ user_id: u.id, token: value, platform: Capacitor.getPlatform() }]),
    });
    const body = res.ok ? "" : (" — " + (await res.text().catch(() => "")));
    dbg("save HTTP " + res.status + body);
  } catch (e) { dbg("save threw: " + (e && e.message)); }
}

// Android push is OFF until Firebase is actually configured for the build.
//
// This is a CRASH GUARD, not a feature flag. Verified on-device: calling
// PushNotifications.register() on Android without google-services.json throws
//   java.lang.IllegalStateException: Default FirebaseApp is not initialized
// from PushNotificationsPlugin.register() — an uncaught NATIVE exception that
// kills the process. A JS try/catch cannot intercept it. Because registerPush()
// runs on every app open for a signed-in user, an unguarded call would crash
// every Android user the moment they signed in.
//
// Set VITE_ANDROID_PUSH_ENABLED=true only once android/app/google-services.json
// is in place. iOS and web are unaffected by this flag.
const ANDROID_PUSH_ENABLED =
  String((typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_ANDROID_PUSH_ENABLED) || "").toLowerCase() === "true";

export async function registerPush() {
  if (!Capacitor.isNativePlatform()) return;   // native app only
  if (Capacitor.getPlatform() === "android" && !ANDROID_PUSH_ENABLED) {
    dbg("android push disabled — no Firebase config (VITE_ANDROID_PUSH_ENABLED not set)");
    return;                                    // never reach register() -> never crash
  }
  const user = getUser();
  if (!user || !user.id) { dbg("no user yet — will retry on sign-in"); return; }

  try {
    if (!_listenersWired) {
      _listenersWired = true;
      // APNs handed us a device token → persist it for the signed-in user.
      PushNotifications.addListener("registration", (token) => { dbg("APNs token: " + String(token && token.value).slice(0, 16) + "…"); saveToken(token && token.value); });
      PushNotifications.addListener("registrationError", (err) => { dbg("APNs registrationError: " + JSON.stringify(err)); });
      // Tapping a notification.
      //
      // iOS behaviour is deliberately UNCHANGED: it has always been a no-op that
      // simply brings the app forward, and Phase 5 must not alter the shipping iOS
      // pipeline. Android gets navigation, built on the routing the app already
      // has — the `?c=<slug>` URL that loadSlug()/popstate in PassportProto.jsx
      // already understand — rather than a second deep-link architecture.
      PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        try {
          if (Capacitor.getPlatform() !== "android") return;     // iOS: unchanged no-op
          const data = (action && action.notification && action.notification.data) || {};
          const slug = data.company_slug ? String(data.company_slug) : "";
          if (!slug) return;                                     // nothing to navigate to
          const url = `/?c=${encodeURIComponent(slug)}`;
          const mounted = !!(document.getElementById("root") && document.getElementById("root").children.length);
          if (mounted && window.history && typeof window.history.pushState === "function") {
            // Warm app (foreground/background): reuse the existing popstate route.
            window.history.pushState({ c: slug }, "", url);
            window.dispatchEvent(new PopStateEvent("popstate"));
          } else {
            // Cold start / terminated: let the app boot straight into the company.
            window.location.assign(url);
          }
        } catch (_) { /* a tap must never crash the app */ }
      });
    }

    let perm = await PushNotifications.checkPermissions();
    dbg("perm before: " + perm.receive);
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
      dbg("perm after request: " + perm.receive);
    }
    if (perm.receive !== "granted") { dbg("not granted — stop"); return; }

    // Android 8+ drops any notification whose channel does not exist. The FCM
    // payload we send sets android.notification.channel_id = "default", so the
    // channel has to exist before the first message arrives. Creating it is
    // idempotent; iOS has no channels and the call is skipped there.
    if (Capacitor.getPlatform() === "android") {
      try {
        await PushNotifications.createChannel({
          id: "default",
          name: "Company news",
          description: "Updates from companies you follow",
          importance: 4,        // IMPORTANCE_HIGH — heads-up, matching APNs alert priority
          visibility: 1,        // VISIBILITY_PUBLIC
        });
      } catch (e) { dbg("createChannel failed: " + (e && e.message)); }
    }

    await PushNotifications.register();           // fires the "registration" listener above
    dbg("register() called");
  } catch (e) { dbg("registerPush threw: " + (e && e.message)); }
}
