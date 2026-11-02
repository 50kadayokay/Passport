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

// The last token this device registered, so logout can detach it without asking
// the plugin again (the plugin may not answer once permission is gone).
const TOKEN_KEY = "mineex.pushToken.v1";
const rememberToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (_) {} };
const lastToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (_) { return ""; } };

/**
 * Detach THIS device from the signed-in user. Called on logout while the session
 * is still valid (RLS needs auth.uid()).
 *
 * Scoped to (this user, this token): it cannot touch another account, and it
 * cannot touch the same investor's OTHER devices, whose token strings differ.
 */
export async function unregisterPush() {
  const token = lastToken();
  if (!token) return;
  try {
    const headers = await authHeaders();
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/release_push_token`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ p_token: token }),
    });
    dbg("released push token on logout");
  } catch (e) { dbg("release failed: " + (e && e.message)); }
  rememberToken("");
}

async function saveToken(value) {
  try {
    const u = getUser();
    if (!u || !u.id || !value) { dbg("save skipped: user=" + (!!u) + " token=" + (!!value)); return; }
    const headers = await authHeaders();
    // claim_push_token (migration 0042) upserts for auth.uid() AND deletes rows
    // holding the SAME token for any other user, atomically. RLS cannot do the
    // second half from this session, and without it a device keeps receiving the
    // previous account's notifications when that account never logged out cleanly.
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/claim_push_token`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      // The RECORDED platform is what the sender routes on, so it must be the real
      // one — never a default. An 'ios' row means APNs, 'android' means FCM, and
      // the sender refuses to guess for anything else.
      body: JSON.stringify({ p_token: value, p_platform: Capacitor.getPlatform() }),
    });
    const body = res.ok ? "" : (" — " + (await res.text().catch(() => "")));
    dbg("save HTTP " + res.status + body);
    if (res.ok) rememberToken(value);
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
      // A release notification should open THAT release, not just bring the app forward
      // (iOS) or the company profile (old Android). The payload carries the release id
      // (news_item_id for pipeline news, post_id for a company's own post) + company_slug.
      // Prefer the release deep-link `?release=<id>` (handled by PassportProto.jsx, which
      // opens the reader in the Today feed); fall back to `?c=<slug>` when there is no
      // release id. Applies to iOS AND Android now — both platforms deep-link.
      PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        try {
          const data = (action && action.notification && action.notification.data) || {};
          const releaseId = String(data.news_item_id || data.post_id || "").trim();
          const slug = data.company_slug ? String(data.company_slug) : "";
          const url = releaseId ? `/?release=${encodeURIComponent(releaseId)}`
                    : slug ? `/?c=${encodeURIComponent(slug)}` : "";
          if (!url) return;                                      // nothing to navigate to
          const mounted = !!(document.getElementById("root") && document.getElementById("root").children.length);
          if (mounted && window.history && typeof window.history.pushState === "function") {
            // Warm app (foreground/background): route in place, no reload.
            window.history.pushState({}, "", url);
            if (releaseId) window.dispatchEvent(new CustomEvent("mineex:open-release", { detail: { id: releaseId } }));
            else window.dispatchEvent(new PopStateEvent("popstate"));   // company: existing ?c= route
          } else {
            // Cold start / terminated: boot straight into the release (or company).
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
