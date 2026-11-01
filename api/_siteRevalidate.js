// Website revalidation (a15): after the website copy of a release is delivered,
// tell the company's site to refetch. Site Contract §5.
//
// Called ONLY by the site_content_v1 listener (api/_listeners.js), server side.
// A failure throws, so the delivery is retried with the dispatcher's backoff and
// shows as failed in Delivery ops; it never blocks or undoes the publish itself.
//
// THE REQUEST
//   POST <company_destinations.config.revalidate_url>   (destination 'website', enabled)
//   X-MineEx-Timestamp: <unix seconds>
//   X-MineEx-Signature: sha256=<hex hmac of "<timestamp>.<body>">
//   X-MineEx-Key: v1
//   X-MineEx-Delivery: <event id>          (the same on every retry)
//   { "contract": "1.0", "companyId", "event": "content.published" | "content.revised" | "content.unpublished",
//     "version": { "publicationId", "seq" } }
//   The body names what changed; the site fetches the content itself with its
//   own token. Signing the timestamp with the body lets a site refuse replays.
//
// THE SECRET
//   One per company, DERIVED: hmac_sha256(SITE_REVALIDATE_SECRET, "site-revalidate:v1:<companyId>").
//   The master lives only in the server environment; nothing is stored in the
//   database, and no route returns either value. A leaked company key exposes
//   only that company's hook; rotating the master (and bumping KEY_ID) rotates
//   every key. Handing a key to a site operator is a staff operation outside the
//   app (not built here).
//
// SSRF
//   The URL comes from the company's own destination config, so it is treated as
//   hostile: https only, port 443, no credentials, no IP literal or internal name
//   that is private, and every address the name resolves to must be public. The
//   connection uses the address that was checked (a pinned lookup), so DNS cannot
//   be rebound between the check and the connect. Redirects are not followed.
//
// STAGING
//   No connection is ever opened: the request is answered by a recording mock
//   (revalidateLog(), plus STAGING_EGRESS_LOG when set). The egress guard would
//   block it anyway -- a company's host is not on its allowlist.

import crypto from "node:crypto";
import net from "node:net";
import dns from "node:dns";
import https from "node:https";

export const KEY_ID = "v1";
export const CONTRACT = "1.0";
export const TIMEOUT_MS = 5000;
export const TOLERANCE_SECONDS = 300;
const EVENT_NAMES = {
  PUBLICATION_PUBLISHED: "content.published",
  PUBLICATION_REVISED: "content.revised",
  PUBLICATION_UNPUBLISHED: "content.unpublished",
};

// ---- signing ----------------------------------------------------------------

/** The per-company key, or null when the server has no master secret. */
export function companyKey(companyId, master = process.env.SITE_REVALIDATE_SECRET) {
  if (!master || !companyId) return null;
  return crypto.createHmac("sha256", master).update(`site-revalidate:${KEY_ID}:${companyId}`).digest("hex");
}

export function sign(key, timestamp, body) {
  return "sha256=" + crypto.createHmac("sha256", key).update(`${timestamp}.${body}`).digest("hex");
}

/** What a site does with an incoming request. Exported for sites and tests. */
export function verify(key, { timestamp, signature, body }, now = Date.now()) {
  const ts = Number(timestamp);
  if (!key || !Number.isInteger(ts) || typeof signature !== "string") return false;
  if (Math.abs(now / 1000 - ts) > TOLERANCE_SECONDS) return false;
  const want = Buffer.from(sign(key, ts, String(body)));
  const got = Buffer.from(signature);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

// ---- SSRF -------------------------------------------------------------------

const BLOCKED = new net.BlockList();
for (const [a, p] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
]) BLOCKED.addSubnet(a, p, "ipv4");
for (const [a, p] of [
  // Not ::ffff:0:0/96: BlockList would match every IPv4 address against it.
  // IPv4-mapped addresses are unwrapped and checked as IPv4 below instead.
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["100::", 64], ["2001:db8::", 32],
  ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
]) BLOCKED.addSubnet(a, p, "ipv6");

/** Is this address somewhere a server must not be sent? */
export function isPrivateAddress(address) {
  const kind = net.isIP(address);
  if (!kind) return true;
  if (kind === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);   // ::ffff:10.0.0.1
    if (mapped) return isPrivateAddress(mapped[1]);
  }
  return BLOCKED.check(address, kind === 4 ? "ipv4" : "ipv6");
}

/** The URL if it may be called, else throws with the reason. No network. */
export function checkUrl(raw) {
  let u;
  try { u = new URL(String(raw || "")); } catch { throw new Error("revalidate_url is not a URL"); }
  if (u.protocol !== "https:") throw new Error("revalidate_url must be https");
  if (u.username || u.password) throw new Error("revalidate_url must not carry credentials");
  if (u.port && u.port !== "443") throw new Error("revalidate_url must use port 443");
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("revalidate_url points at a private address");
  } else if (!host.includes(".") || /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain)\.?$/.test(host)) {
    throw new Error("revalidate_url is not a public host name");
  }
  return u;
}

/** dns.lookup with every answer checked; the connection uses what was checked. */
export function pinnedLookup(resolve = dns.lookup) {
  return (hostname, options, cb) => {
    resolve(hostname, { all: true, verbatim: true }, (err, addrs) => {
      if (err) return cb(err);
      const list = Array.isArray(addrs) ? addrs : [{ address: addrs, family: net.isIP(addrs) }];
      if (!list.length) return cb(new Error("revalidate host did not resolve"));
      const bad = list.find((a) => isPrivateAddress(a.address));
      if (bad) return cb(Object.assign(new Error("revalidate host resolves to a private address"), { code: "ESSRF" }));
      const first = list[0];
      if (options && options.all) return cb(null, list);
      cb(null, first.address, first.family);
    });
  };
}

// ---- transport ---------------------------------------------------------------

/** The real request: pinned lookup, no redirects, a hard timeout, body discarded. */
export function httpsTransport({ lookup = pinnedLookup() } = {}) {
  return (url, { headers, body, timeoutMs }) => new Promise((resolve, reject) => {
    const req = https.request(url, { method: "POST", headers, lookup, timeout: timeoutMs, agent: false }, (res) => {
      res.resume();   // read and drop: nothing in the reply is trusted or kept
      res.on("end", () => resolve({ status: res.statusCode }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error(`revalidate timed out after ${timeoutMs} ms`)));
    req.on("error", reject);
    req.end(body);
  });
}

const STAGING_LOG = [];
/** What the staging mock would have sent: host, path, whether it was signed. Never a body or key. */
export const revalidateLog = () => STAGING_LOG.slice();

function stagingTransport() {
  return async (url, { headers }) => {
    const u = new URL(url);
    const entry = { ts: new Date().toISOString(), action: "mock", via: "site-revalidate", provider: "site-revalidate",
      method: "POST", host: u.host, path: u.pathname.slice(0, 120), signed: /^sha256=[0-9a-f]{64}$/.test(headers["X-MineEx-Signature"] || "") };
    STAGING_LOG.push(entry);
    if (STAGING_LOG.length > 500) STAGING_LOG.shift();
    const file = process.env.STAGING_EGRESS_LOG;
    if (file) { try { (await import("node:fs")).appendFileSync(file, JSON.stringify(entry) + "\n"); } catch { /* logging never breaks delivery */ } }
    return { status: 202 };
  };
}

const defaultTransport = () => (process.env.MINEEX_ENV === "staging" ? stagingTransport() : httpsTransport());

// ---- the call ----------------------------------------------------------------

/** The website destination's hook, or null when the company has none. */
export async function hookFor(db, companyId) {
  const rows = await db.getRows(`company_destinations?company_id=eq.${companyId}&destination_id=eq.website&select=enabled,config`);
  const row = rows[0];
  const url = row && row.enabled !== false && row.config && typeof row.config.revalidate_url === "string" ? row.config.revalidate_url.trim() : "";
  return url || null;
}

// Best effort, never throws: the contract records the hook's state on the
// destination row so the portal can show it. The delivery state is the record
// that retries; this is only the latest outcome.
async function noteOutcome(db, companyId, error) {
  try {
    await db.write(`company_destinations?company_id=eq.${companyId}&destination_id=eq.website`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: error ? "error" : "connected", last_error: error ? String(error).slice(0, 300) : null, updated_at: new Date().toISOString() }),
    });
  } catch { /* the delivery's own state already holds the outcome */ }
}

/**
 * Revalidate one company's website. Returns { skipped } when there is nothing to
 * call; resolves { status } on a 2xx; THROWS otherwise (the delivery retries).
 */
export async function revalidateSite(db, { event, pub, version }, deps = {}) {
  const url = await hookFor(db, pub.company_id);
  if (!url) return { skipped: "no revalidate hook" };
  try {
    checkUrl(url);
    const key = companyKey(pub.company_id, deps.master !== undefined ? deps.master : process.env.SITE_REVALIDATE_SECRET);
    if (!key) throw new Error("revalidate is not configured on this server (SITE_REVALIDATE_SECRET)");
    const timestamp = Math.floor((deps.now ? deps.now() : Date.now()) / 1000);
    const body = JSON.stringify({ contract: CONTRACT, companyId: pub.company_id, event: EVENT_NAMES[event.event_type] || "content.revised",
      version: { publicationId: pub.id, seq: version } });
    const headers = {
      "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(body)), "User-Agent": "MineEx-Revalidate/1",
      "X-MineEx-Timestamp": String(timestamp), "X-MineEx-Signature": sign(key, timestamp, body),
      "X-MineEx-Key": KEY_ID, "X-MineEx-Delivery": String(event.id || ""),
    };
    const send = deps.transport || defaultTransport();
    const r = await send(url, { headers, body, timeoutMs: TIMEOUT_MS });
    if (!(r && r.status >= 200 && r.status < 300)) throw new Error(`revalidate hook answered ${r ? r.status : "nothing"}`);
    await noteOutcome(db, pub.company_id, null);
    return { status: r.status };
  } catch (e) {
    const msg = `website revalidate failed: ${String((e && e.message) || e).slice(0, 200)}`;
    await noteOutcome(db, pub.company_id, msg);
    throw new Error(msg);
  }
}
