// src/lib/push.js — device push registration (client side of the push system whose
// backend is api/news-notify.js + api/news-push-send.js + migration 0025).
//
// iOS/native ONLY (a no-op on web). Requests permission, registers with APNs, and
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
      body: JSON.stringify([{ user_id: u.id, token: value, platform: "ios" }]),
    });
    const body = res.ok ? "" : (" — " + (await res.text().catch(() => "")));
    dbg("save HTTP " + res.status + body);
  } catch (e) { dbg("save threw: " + (e && e.message)); }
}

export async function registerPush() {
  if (!Capacitor.isNativePlatform()) return;   // native app only
  const user = getUser();
  if (!user || !user.id) { dbg("no user yet — will retry on sign-in"); return; }

  try {
    if (!_listenersWired) {
      _listenersWired = true;
      // APNs handed us a device token → persist it for the signed-in user.
      PushNotifications.addListener("registration", (token) => { dbg("APNs token: " + String(token && token.value).slice(0, 16) + "…"); saveToken(token && token.value); });
      PushNotifications.addListener("registrationError", (err) => { dbg("APNs registrationError: " + JSON.stringify(err)); });
      // Tapping a notification (later: deep-link to the story/company via action.notification.data).
      PushNotifications.addListener("pushNotificationActionPerformed", () => { /* bring app forward */ });
    }

    let perm = await PushNotifications.checkPermissions();
    dbg("perm before: " + perm.receive);
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
      dbg("perm after request: " + perm.receive);
    }
    if (perm.receive !== "granted") { dbg("not granted — stop"); return; }

    await PushNotifications.register();           // fires the "registration" listener above
    dbg("register() called");
  } catch (e) { dbg("registerPush threw: " + (e && e.message)); }
}
