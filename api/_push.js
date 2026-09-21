// api/_push.js — provider-neutral push helpers: platform partitioning, payload
// construction and error classification.
//
// Everything here is a PURE function with no network and no env access, so the
// routing and payload invariants can be proven by scripts/push-routing-test.mjs
// without credentials and without touching production.
//
// CORE INVARIANT (tested)
//   A device token is only ever handed to the provider matching its RECORDED
//   platform. ios -> APNs. android -> FCM. No fallback, no sniffing the token
//   format, no defaulting an unknown platform onto a provider.

/** Platforms we can actually deliver to today. */
export const IOS = "ios";
export const ANDROID = "android";

/**
 * Split pending outbox rows into per-provider buckets.
 *
 * Anything whose platform is not exactly "ios" or "android" (e.g. the 'web'
 * value the schema permits, or a future platform) goes to `unroutable` and is
 * NEVER guessed into a provider — the caller parks it instead of delivering it
 * to the wrong service.
 */
export function partitionByPlatform(rows) {
  const apns = [];
  const fcm = [];
  const unroutable = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const p = typeof row?.platform === "string" ? row.platform.trim().toLowerCase() : "";
    if (p === IOS) apns.push(row);
    else if (p === ANDROID) fcm.push(row);
    else unroutable.push(row);
  }
  return { apns, fcm, unroutable };
}

/**
 * The shared notification data contract.
 *
 * Both platforms carry the same semantic fields so the app can navigate to the
 * right company/news item. APNs takes them as top-level keys beside `aps`
 * (unchanged from what iOS has always received); FCM requires every `data`
 * value to be a STRING, so the same fields are stringified there.
 *
 * Rule: a field that is absent/null/empty is OMITTED, never sent as "null" or
 * "undefined". Only these keys are part of the contract.
 */
const DATA_KEYS = ["news_item_id", "company_slug", "category"];

/** Coerce one contract value to a non-empty string, or null to omit it. */
function dataString(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") { const s = v.trim(); return s === "" ? null : s; }
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  if (typeof v === "boolean") return v ? "true" : "false";
  // objects/arrays are never part of the contract — drop rather than serialise
  // something the client has no agreement about.
  return null;
}

/**
 * FCM HTTP v1 `data` map: string keys -> string values, only.
 * Guarantees: no null, no undefined, no objects, no arrays, no numbers, no
 * booleans survive as non-strings, and no empty-string values.
 */
export function buildFcmData(data) {
  const out = {};
  const src = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  for (const k of DATA_KEYS) {
    const s = dataString(src[k]);
    if (s !== null) out[k] = s;
  }
  return out;
}

/**
 * A full FCM HTTP v1 message body for one outbox row.
 *
 * `notification` gives the system tray its title/body; `data` carries the
 * navigation contract. android.notification.channel_id must match the channel
 * the client creates, or Android 8+ drops the notification silently.
 */
export function buildFcmMessage(row, { channelId = "default" } = {}) {
  const data = buildFcmData(row?.data);
  return {
    message: {
      token: row?.token,
      notification: {
        title: String(row?.title ?? ""),
        body: String(row?.body ?? ""),
      },
      android: {
        priority: "high",
        notification: {
          channel_id: channelId,
          // Matches the APNs `sound: "default"` behaviour iOS already has.
          default_sound: true,
        },
      },
      ...(Object.keys(data).length ? { data } : {}),
    },
  };
}

/**
 * The APNs payload — byte-for-byte what the shipping iOS sender already builds.
 * Kept here only so both providers are visible side by side; the behaviour is
 * unchanged (aps.alert + sound, with the data contract spread top-level).
 */
export function buildApnsPayload(row) {
  return {
    aps: { alert: { title: row?.title, body: row?.body }, sound: "default" },
    ...(row?.data || {}),
  };
}

/* ------------------------------------------------------------------ errors */
//
// Three outcomes, deliberately distinct:
//   "permanent_token"  the TOKEN is dead -> remove it (that platform's row only)
//   "retryable"        provider/network hiccup -> leave the token alone
//   "config"           OUR credentials/payload are wrong -> never blame the token

export const PERMANENT_TOKEN = "permanent_token";
export const RETRYABLE = "retryable";
export const CONFIG = "config";

/**
 * Classify an APNs response. Mirrors the shipping behaviour exactly: only
 * BadDeviceToken and Unregistered drop a token.
 */
export function classifyApns(status, reason) {
  if (status === 200) return null;
  if (reason === "BadDeviceToken" || reason === "Unregistered") return PERMANENT_TOKEN;
  if (reason === "InvalidProviderToken" || reason === "ExpiredProviderToken" || status === 403) return CONFIG;
  if (reason === "DeviceTokenNotForTopic" || reason === "TopicDisallowed" || reason === "BadTopic") return CONFIG;
  return RETRYABLE;
}

/**
 * Classify an FCM HTTP v1 response.
 *
 * Documented FCM v1 error codes (error.details[].errorCode, or error.status):
 *   UNREGISTERED        404 — token no longer valid (uninstalled/refreshed) -> DEAD
 *   SENDER_ID_MISMATCH  403 — token belongs to a different Firebase sender -> DEAD
 *                              (dead *for us*: we can never deliver to it)
 *   INVALID_ARGUMENT    400 — malformed request/token. Treated as CONFIG, NOT a
 *                              dead token: a payload bug must never mass-delete
 *                              real devices.
 *   UNAUTHENTICATED     401 — our service-account credentials -> CONFIG
 *   QUOTA_EXCEEDED      429 — back off -> RETRYABLE
 *   UNAVAILABLE         503 — transient -> RETRYABLE
 *   INTERNAL            500 — transient -> RETRYABLE
 *   THIRD_PARTY_AUTH_ERROR 401 — APNs cert for an iOS token sent via FCM -> CONFIG
 */
export function classifyFcm(status, errorCode) {
  if (status >= 200 && status < 300) return null;
  const code = String(errorCode || "").toUpperCase();
  if (code === "UNREGISTERED" || code === "SENDER_ID_MISMATCH") return PERMANENT_TOKEN;
  if (status === 404) return PERMANENT_TOKEN;
  if (code === "QUOTA_EXCEEDED" || status === 429) return RETRYABLE;
  if (code === "UNAVAILABLE" || code === "INTERNAL" || status === 503 || status === 500) return RETRYABLE;
  if (code === "UNAUTHENTICATED" || code === "THIRD_PARTY_AUTH_ERROR" || status === 401) return CONFIG;
  if (code === "INVALID_ARGUMENT" || status === 400) return CONFIG;
  if (status === 403) return CONFIG;
  return RETRYABLE; // unknown -> never destroy a token on a guess
}

/** Pull the FCM v1 error code out of a response body, tolerating shape drift. */
export function fcmErrorCode(body) {
  try {
    const err = body && body.error;
    if (!err) return null;
    const details = Array.isArray(err.details) ? err.details : [];
    for (const d of details) {
      if (d && typeof d.errorCode === "string") return d.errorCode;
    }
    return typeof err.status === "string" ? err.status : null;
  } catch (_) {
    return null;
  }
}

/* ------------------------------------------------------- batch orchestration */

/**
 * Deliver one drained batch, routing strictly by recorded platform.
 *
 * Pure orchestration with every side effect injected, so the routing and
 * failure-isolation invariants are provable offline (scripts/push-routing-test.mjs)
 * with no credentials, no network and no production data.
 *
 * Contract of the injected functions:
 *   sendApns(row)  -> { status, reason }        iOS transport
 *   sendFcm(row)   -> { status, body }          Android transport
 *   markRow(row, { status, error })             outbox status write
 *   dropToken(token, platform)                  dead-token removal, platform-scoped
 *   apnsReady / fcmReady : boolean              per-provider configuration
 *
 * Guarantees:
 *   · a row is offered to exactly one transport, chosen by row.platform
 *   · an unroutable platform is parked as 'skipped' and never transported
 *   · if one provider throws or is unconfigured, the other still runs
 *   · a row already marked 'sent' is never re-marked 'pending'
 */
export async function deliverBatch({
  rows,
  sendApns,
  sendFcm,
  markRow,
  dropToken,
  apnsReady = true,
  fcmReady = true,
}) {
  const { apns, fcm, unroutable } = partitionByPlatform(rows);
  const result = {
    sent: 0, failed: 0, skipped: 0,
    routed: { ios: apns.length, android: fcm.length, unroutable: unroutable.length },
    errors: {},
  };

  for (const row of unroutable) {
    result.skipped++;
    await markRow(row, { status: "skipped", error: `unroutable platform: ${String(row?.platform || "(none)")}` });
  }

  if (apns.length) {
    if (!apnsReady) {
      result.errors.apns = "apns_not_configured";
    } else {
      try {
        for (const row of apns) {
          const out = await sendApns(row);
          const verdict = classifyApns(out?.status, out?.reason);
          const ok = verdict === null;
          if (ok) result.sent++; else result.failed++;
          if (verdict === PERMANENT_TOKEN) await dropToken(row.token, IOS);
          await markRow(row, { status: ok ? "sent" : "failed", error: ok ? null : (out?.reason || `status ${out?.status}`) });
        }
      } catch (e) {
        result.errors.apns = String((e && e.message) || e);
      }
    }
  }

  if (fcm.length) {
    if (!fcmReady) {
      result.errors.fcm = "fcm_not_configured";
    } else {
      try {
        for (const row of fcm) {
          const out = await sendFcm(row);
          const code = fcmErrorCode(out?.body);
          const verdict = classifyFcm(out?.status, code);
          const ok = verdict === null;
          if (ok) result.sent++; else result.failed++;
          if (verdict === PERMANENT_TOKEN) await dropToken(row.token, ANDROID);
          await markRow(row, { status: ok ? "sent" : "failed", error: ok ? null : (code || `status ${out?.status}`) });
        }
      } catch (e) {
        result.errors.fcm = String((e && e.message) || e);
      }
    }
  }

  return result;
}
