// api/news-push-send.js — the push sender: drains notification_outbox to the
// provider that matches each row's RECORDED platform.
//
//   pending outbox -> partition by platform -> ios  -> APNs (HTTP/2 + ES256 JWT)
//                                           -> android -> FCM HTTP v1 (OAuth2)
//
// CORE INVARIANT: a token is only ever sent to the provider for its recorded
// platform. No fallback, no token-format sniffing. Anything not exactly
// "ios"/"android" is parked as 'skipped', never guessed onto a provider.
//
// The two providers are isolated: an FCM outage cannot stop APNs rows going out,
// and an APNs/credential failure cannot stop FCM rows. Each bucket has its own
// try/catch and its own configuration check.
//
// The APNs path below is unchanged from the shipping iOS sender.
//
// APNs requires HTTP/2 + a short-lived ES256 JWT signed with the .p8 auth key.
// We use Node's built-in http2 + crypto (no SDK). One JWT signs the whole batch
// (valid ~1h). Each row → POST /3/device/<token>; the response reason updates the
// row (sent / failed). Idempotent by construction (a 'sent' row is never re-picked).
//
// Env: APNS_KEY_ID, APNS_TEAM_ID, APNS_P8 (the .p8 PEM), APNS_BUNDLE_ID
// (default com.liquidjungle.mineex), APNS_ENV ('production' default | 'sandbox').
//
// Modes:
//   POST/GET (authed)            → drain up to BATCH pending rows.
//   ?probe=<deviceToken|any>     → send ONE test push (verifies credentials without
//                                  the outbox). A dummy token returns 400 BadDeviceToken
//                                  = creds ACCEPTED; 403 InvalidProviderToken = creds bad.
import crypto from "node:crypto";
import http2 from "node:http2";
import { serviceConfigured, serviceRest } from "./_service.js";
import { checkNewsAuth } from "./_news.js";
import { deliverBatch, buildApnsPayload, buildFcmMessage } from "./_push.js";
import { fcmConfigured, fcmAccessToken, fcmSendOne } from "./_fcm.js";

export const config = { maxDuration: 120 };

const BATCH = 200;
const BUNDLE = () => process.env.APNS_BUNDLE_ID || "com.liquidjungle.mineex";
const apnsConfigured = () => !!(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_P8);
const HOST = () => (String(process.env.APNS_ENV || "production").toLowerCase() === "sandbox"
  ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com");

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function apnsJwt() {
  const p8 = String(process.env.APNS_P8 || "").replace(/\\n/g, "\n"); // tolerate escaped newlines
  const header = b64url(JSON.stringify({ alg: "ES256", kid: process.env.APNS_KEY_ID }));
  const payload = b64url(JSON.stringify({ iss: process.env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) }));
  const signingInput = `${header}.${payload}`;
  // dsaEncoding 'ieee-p1363' → raw r||s, exactly what JOSE/ES256 expects.
  const sig = crypto.sign("sha256", Buffer.from(signingInput), { key: p8, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${b64url(sig)}`;
}

function sendOne(client, token, jwt, payload) {
  return new Promise((resolve) => {
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": BUNDLE(),
      "apns-push-type": "alert",
      "apns-priority": "10",
    });
    let status = 0, data = "";
    req.on("response", (h) => { status = h[":status"]; });
    req.setEncoding("utf8");
    req.on("data", (c) => { data += c; });
    req.on("end", () => {
      let reason = null;
      try { reason = data ? (JSON.parse(data).reason || null) : null; } catch { /* ignore */ }
      resolve({ status, reason });
    });
    req.on("error", (e) => resolve({ status: 0, reason: String((e && e.message) || e) }));
    req.end(JSON.stringify(payload));
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!checkNewsAuth(req)) return res.status(401).json({ error: "unauthorized" });
  // Provider config is checked PER BUCKET inside the drain, not up front: a
  // missing APNs key must not block a pending Android batch (and vice versa).
  // The route only fails outright when neither provider can send at all.
  if (!apnsConfigured() && !fcmConfigured()) {
    return res.status(500).json({
      error: "No push provider configured (need APNS_KEY_ID/APNS_TEAM_ID/APNS_P8 for iOS, and/or FCM_PROJECT_ID/FCM_CLIENT_EMAIL/FCM_PRIVATE_KEY for Android)",
    });
  }

  const q = { ...(req.query || {}), ...(req.body || {}) };

  try {
    // PROBE — verify APNs credentials without the outbox / a real token.
    if (q.probe) {
      if (!apnsConfigured()) return res.status(500).json({ error: "APNS not configured" });
      let jwt;
      try { jwt = apnsJwt(); }
      catch (e) { return res.status(500).json({ error: `JWT signing failed: ${String((e && e.message) || e)}` }); }
      const token = String(q.probe) === "1" ? "00".repeat(32) : String(q.probe);
      const probeClient = http2.connect(HOST());
      const probeErr = new Promise((r) => probeClient.on("error", (e) => r(String((e && e.message) || e))));
      const out = await Promise.race([
        sendOne(probeClient, token, jwt, { aps: { alert: { title: "MineEx", body: "Push credential probe" } } }),
        probeErr.then((e) => ({ status: 0, reason: e })),
      ]).finally(() => { try { probeClient.close(); } catch { /* ignore */ } });
      const credsOk = out.status === 400 && (out.reason === "BadDeviceToken" || out.reason === "DeviceTokenNotForTopic");
      return res.status(200).json({
        ok: true, mode: "probe", host: HOST(), topic: BUNDLE(),
        apns_status: out.status, apns_reason: out.reason,
        credentials_accepted: credsOk || out.status === 200,
        note: credsOk ? "Credentials ACCEPTED — Apple reached (token was a dummy, as expected)."
          : out.status === 200 ? "Delivered."
          : out.reason === "InvalidProviderToken" || out.status === 403 ? "Credentials REJECTED — check APNS_KEY_ID / APNS_TEAM_ID / APNS_P8."
          : "See apns_status/apns_reason.",
      });
    }

    if (!serviceConfigured()) return res.status(500).json({ error: "Supabase service env missing" });

    // DRAIN — pending rows, oldest first. `platform` decides the provider.
    const r = await serviceRest(`notification_outbox?status=eq.pending&order=created_at.asc&limit=${BATCH}&select=id,token,title,body,data,platform`);
    if (!r.ok) return res.status(500).json({ error: `outbox query HTTP ${r.status}` });
    const rowsPending = await r.json().catch(() => []);
    if (!rowsPending.length) return res.status(200).json({ ok: true, sent: 0, failed: 0, message: "outbox empty" });

    // Delivery is orchestrated by deliverBatch() in ./_push.js — the same code the
    // offline test suite drives (scripts/push-routing-test.mjs), so the routing and
    // isolation invariants proven there are the ones that actually ship.
    let apnsClient = null;
    let apnsJwtValue = null;
    const apnsReady = apnsConfigured();
    if (apnsReady) {
      try { apnsJwtValue = apnsJwt(); } catch (_) { apnsJwtValue = null; }
    }

    let fcmToken = null;
    const fcmReady = fcmConfigured();

    const out = await deliverBatch({
      rows: rowsPending,
      apnsReady: apnsReady && !!apnsJwtValue,
      fcmReady,
      sendApns: async (row) => {
        if (!apnsClient) apnsClient = http2.connect(HOST());   // opened only for real iOS work
        return sendOne(apnsClient, row.token, apnsJwtValue, buildApnsPayload(row));
      },
      sendFcm: async (row) => {
        if (!fcmToken) fcmToken = await fcmAccessToken();       // one exchange per batch
        return fcmSendOne(fcmToken, buildFcmMessage(row));
      },
      markRow: (row, { status, error }) => serviceRest(`notification_outbox?id=eq.${row.id}`, {
        method: "PATCH",
        body: {
          status,
          attempts: 1,
          last_error: error || null,
          sent_at: status === "sent" ? new Date().toISOString() : null,
        },
        prefer: "return=minimal",
      }).catch(() => {}),
      // Platform-scoped: an Android dead token can never delete an iOS registration.
      dropToken: (token, platform) => serviceRest(
        `push_tokens?token=eq.${encodeURIComponent(token)}&platform=eq.${encodeURIComponent(platform)}`,
        { method: "DELETE", prefer: "return=minimal" }
      ).catch(() => {}),
    });

    try { if (apnsClient) apnsClient.close(); } catch { /* ignore */ }

    return res.status(200).json({
      ok: true,
      sent: out.sent, failed: out.failed, skipped: out.skipped,
      batch: rowsPending.length,
      routed: out.routed,
      ...(Object.keys(out.errors).length ? { provider_errors: out.errors } : {}),
    });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
