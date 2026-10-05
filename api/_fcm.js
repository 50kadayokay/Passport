// api/_fcm.js — FCM HTTP v1 transport (server-side only).
//
// HTTP v1, NOT the retired legacy /fcm/send endpoint. Auth is a Google service
// account: sign a JWT with the account's private key, exchange it at Google's
// token endpoint for a short-lived OAuth2 access token, then Bearer it to
// https://fcm.googleapis.com/v1/projects/<id>/messages:send
//
// Uses only node:crypto — no Firebase Admin SDK dependency, matching how the
// APNs sender already signs its ES256 JWT with node:crypto + node:http2.
//
// ENV (server-side only — never VITE_, never in the client bundle):
//   FCM_PROJECT_ID    Firebase project id             e.g. mineex-xxxxx
//   FCM_CLIENT_EMAIL  service account client_email    e.g. fcm-sender@<proj>.iam.gserviceaccount.com
//   FCM_PRIVATE_KEY   service account private_key PEM (literal \n escapes tolerated)
import crypto from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** True when all three server-side FCM vars are present. */
export function fcmConfigured() {
  return !!(process.env.FCM_PROJECT_ID && process.env.FCM_CLIENT_EMAIL && process.env.FCM_PRIVATE_KEY);
}

export function fcmProjectId() {
  return process.env.FCM_PROJECT_ID || "";
}

function privateKey() {
  // Vercel/CI env vars usually carry the PEM with literal \n sequences.
  return String(process.env.FCM_PRIVATE_KEY || "").replace(/\\n/g, "\n");
}

/**
 * Mint an OAuth2 access token for the service account (RS256 JWT bearer grant).
 * Cached in module scope for its lifetime minus a safety margin, so a batch of
 * sends performs one token exchange rather than one per message.
 */
let _token = null; // { value, expiresAt }

export async function fcmAccessToken() {
  if (_token && Date.now() < _token.expiresAt) return _token.value;

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: process.env.FCM_CLIENT_EMAIL,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat,
      exp,
    })
  );
  const signingInput = `${header}.${claims}`;
  const sig = crypto.sign("RSA-SHA256", Buffer.from(signingInput), privateKey());
  const assertion = `${signingInput}.${b64url(sig)}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    const detail = body.error_description || body.error || `HTTP ${res.status}`;
    throw new Error(`FCM auth failed: ${detail}`);
  }
  // Refresh a minute early, mirroring the session logic in src/lib/auth.js.
  _token = { value: body.access_token, expiresAt: Date.now() + ((body.expires_in || 3600) * 1000) - 60000 };
  return _token.value;
}

/**
 * Send one already-built HTTP v1 message body.
 * Returns { status, body } — classification is the caller's job (api/_push.js),
 * so transport and policy stay separable and unit-testable.
 */
export async function fcmSendOne(accessToken, message) {
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(fcmProjectId())}/messages:send`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  } catch (e) {
    // Network-level failure: surface as a retryable 0, never as a dead token.
    return { status: 0, body: { error: { status: "UNAVAILABLE", message: String((e && e.message) || e) } } };
  }
}

/** Test seam: drop the cached access token. */
export function _resetFcmTokenCache() {
  _token = null;
}
