// api/news-push-send.js — the APNs sender: drains notification_outbox to Apple.
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

export const config = { maxDuration: 120 };

const BATCH = 200;
const BUNDLE = () => process.env.APNS_BUNDLE_ID || "com.liquidjungle.mineex";
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
  if (!process.env.APNS_KEY_ID || !process.env.APNS_TEAM_ID || !process.env.APNS_P8) {
    return res.status(500).json({ error: "APNS not configured (need APNS_KEY_ID, APNS_TEAM_ID, APNS_P8)" });
  }

  let jwt;
  try { jwt = apnsJwt(); }
  catch (e) { return res.status(500).json({ error: `JWT signing failed: ${String((e && e.message) || e)}` }); }

  const q = { ...(req.query || {}), ...(req.body || {}) };
  const client = http2.connect(HOST());
  const clientErr = new Promise((r) => client.on("error", (e) => r(String((e && e.message) || e))));

  try {
    // PROBE — verify credentials without the outbox / a real token.
    if (q.probe) {
      const token = String(q.probe) === "1" ? "00".repeat(32) : String(q.probe);
      const out = await Promise.race([
        sendOne(client, token, jwt, { aps: { alert: { title: "MineEx", body: "Push credential probe" } } }),
        clientErr.then((e) => ({ status: 0, reason: e })),
      ]);
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

    // DRAIN — pending rows, oldest first.
    const r = await serviceRest(`notification_outbox?status=eq.pending&order=created_at.asc&limit=${BATCH}&select=id,token,title,body,data`);
    if (!r.ok) return res.status(500).json({ error: `outbox query HTTP ${r.status}` });
    const rowsPending = await r.json().catch(() => []);
    if (!rowsPending.length) return res.status(200).json({ ok: true, sent: 0, failed: 0, message: "outbox empty" });

    let sent = 0, failed = 0;
    for (const row of rowsPending) {
      const payload = { aps: { alert: { title: row.title, body: row.body }, sound: "default" }, ...(row.data || {}) };
      const out = await sendOne(client, row.token, jwt, payload);
      const ok = out.status === 200;
      if (ok) sent++; else failed++;
      // A dead token → drop it so we stop trying it.
      if (out.reason === "BadDeviceToken" || out.reason === "Unregistered") {
        await serviceRest(`push_tokens?token=eq.${encodeURIComponent(row.token)}`, { method: "DELETE", prefer: "return=minimal" }).catch(() => {});
      }
      await serviceRest(`notification_outbox?id=eq.${row.id}`, {
        method: "PATCH",
        body: { status: ok ? "sent" : "failed", attempts: 1, last_error: ok ? null : (out.reason || `status ${out.status}`), sent_at: ok ? new Date().toISOString() : null },
        prefer: "return=minimal",
      }).catch(() => {});
    }
    return res.status(200).json({ ok: true, sent, failed, batch: rowsPending.length });
  } finally {
    try { client.close(); } catch { /* ignore */ }
  }
}
