// Site Contract authorization — who is asking, and for which company.
//
// THE ONE INVARIANT
// -----------------
// The company is resolved FROM THE TOKEN. Nothing a caller sends -- query
// string, body, header -- can name the company whose content comes back. There
// is deliberately no parameter for it, so there is no code path to get wrong.
//
// HASHED AT REST. The database stores sha256(token); the plaintext exists once,
// at issue. A leaked `site_credentials` row is not a usable credential.
//
// TWO KINDS, AND THEY ARE NOT INTERCHANGEABLE
//   site   long-lived, server/build only. Published content; manifest upload.
//   draft  short-lived, minted per preview. Draft content only.
// A site token cannot read drafts and a draft token cannot publish a manifest,
// because each endpoint demands the kind it needs rather than accepting "any
// valid token".
//
// FAIL CLOSED. Every failure path -- malformed, unknown, revoked, expired,
// wrong kind, table absent, Supabase down -- returns a denial. There is no
// branch that resolves to "allow" because something was missing.

import crypto from "node:crypto";
import { serviceRest, serviceConfigured } from "./_service.js";

export const TOKEN_PREFIX = { site: "mxs_", draft: "mxd_" };

/** Deny reasons, separated from the message a caller is told. */
export const DENY = {
  NO_TOKEN: "no-token",
  MALFORMED: "malformed",
  UNKNOWN: "unknown",
  REVOKED: "revoked",
  EXPIRED: "expired",
  WRONG_KIND: "wrong-kind",
  NOT_PROVISIONED: "not-provisioned",
  BACKEND: "backend",
};

/* A caller learns only that it was refused. "Revoked" and "unknown" read the
   same from outside, so a probe cannot use the API to discover which of a list
   of guessed tokens once existed. The specific reason is for our logs. */
const PUBLIC_MESSAGE = {
  [DENY.NO_TOKEN]: "A site token is required.",
  [DENY.MALFORMED]: "That credential is not valid.",
  [DENY.UNKNOWN]: "That credential is not valid.",
  [DENY.REVOKED]: "That credential is not valid.",
  [DENY.EXPIRED]: "That credential is not valid.",
  [DENY.WRONG_KIND]: "That credential is not valid for this request.",
  [DENY.NOT_PROVISIONED]: "The site contract is not provisioned on this deployment.",
  [DENY.BACKEND]: "Could not verify that credential.",
};

export const hashToken = (token) => crypto.createHash("sha256").update(String(token), "utf8").digest("hex");

/** Mint a token. Returns { token, hash } — the plaintext is never persisted. */
export function mintToken(kind) {
  const prefix = TOKEN_PREFIX[kind];
  if (!prefix) throw new Error(`unknown credential kind: ${kind}`);
  const token = `${prefix}${crypto.randomBytes(24).toString("base64url")}`;
  return { token, hash: hashToken(token) };
}

/**
 * Read a query parameter, whatever the runtime.
 *
 * `req.query` is a Vercel convenience and is NOT populated by every handler
 * host -- this deployment's dev server leaves it undefined. Relying on it meant
 * `?draft=1` silently did nothing and `?contract=2.0` was never rejected: both
 * read as absent, both took the default path. Parsing the URL is the behaviour
 * that holds everywhere, with req.query used only as a fast path.
 */
export function queryParam(req, name) {
  const direct = req?.query?.[name];
  if (direct !== undefined) return Array.isArray(direct) ? direct[0] : String(direct);
  try {
    const url = new URL(req?.url || "", "http://local");
    const v = url.searchParams.get(name);
    return v === null ? undefined : v;
  } catch { return undefined; }
}

/** Pull a bearer token out of the request. Case-insensitive scheme. */
export function siteToken(req) {
  const raw = req.headers?.authorization || req.headers?.Authorization || "";
  const m = String(raw).match(/^\s*bearer\s+(\S+)\s*$/i);
  return m ? m[1] : "";
}

const deny = (reason) => ({
  ok: false, reason,
  status: reason === DENY.NOT_PROVISIONED ? 503 : reason === DENY.BACKEND ? 502 : 401,
  error: PUBLIC_MESSAGE[reason] || PUBLIC_MESSAGE[DENY.UNKNOWN],
});

/**
 * Verify a token and resolve its company.
 *
 * `store` is injectable so the authorization rules can be exercised exhaustively
 * without a database -- see scripts/site-contract-test.mjs. Production passes
 * nothing and gets the service-role reader below.
 */
export async function verifySiteToken(token, { kind, store = defaultStore, now = () => new Date() } = {}) {
  if (!token) return deny(DENY.NO_TOKEN);

  const expected = TOKEN_PREFIX[kind];
  if (!expected) throw new Error(`unknown credential kind: ${kind}`);

  // Shape-check before touching the database: a token that cannot be ours is
  // refused without a lookup, so garbage costs nothing and probing is cheap to
  // absorb.
  if (typeof token !== "string" || token.length < 16 || token.length > 200) return deny(DENY.MALFORMED);
  if (!/^mx[sd]_[A-Za-z0-9_-]+$/.test(token)) return deny(DENY.MALFORMED);

  // A draft token presented where a site token belongs is refused on its prefix,
  // before any lookup. The stored `kind` is checked again below -- the prefix is
  // a convenience, never the authority.
  if (!token.startsWith(expected)) return deny(DENY.WRONG_KIND);

  let row;
  try {
    row = await store.findByHash(hashToken(token));
  } catch (e) {
    if (e && e.notProvisioned) return deny(DENY.NOT_PROVISIONED);
    return deny(DENY.BACKEND);
  }
  if (!row) return deny(DENY.UNKNOWN);

  // The authority on kind is the stored row, not the prefix the caller sent.
  if (row.kind !== kind) return deny(DENY.WRONG_KIND);
  if (row.revoked_at) return deny(DENY.REVOKED);
  if (row.expires_at && new Date(row.expires_at).getTime() <= now().getTime()) return deny(DENY.EXPIRED);
  if (!row.company_id) return deny(DENY.UNKNOWN);

  // Best effort, never blocking: a failed touch must not deny a valid request.
  store.touch?.(row.id).catch?.(() => {});

  return { ok: true, companyId: row.company_id, credentialId: row.id, kind: row.kind, label: row.label || "" };
}

/* The production store. Service role, because `site_credentials` is read by a
   server with no user session -- the website's build. RLS still protects the
   table from every browser; this path is server-only and never reachable from
   one. */
export const defaultStore = {
  async findByHash(hash) {
    if (!serviceConfigured()) {
      const e = new Error("service role not configured"); e.notProvisioned = true; throw e;
    }
    const r = await serviceRest(
      `site_credentials?token_hash=eq.${encodeURIComponent(hash)}` +
      `&select=id,company_id,kind,label,expires_at,revoked_at&limit=1`);
    if (r.status === 404 || r.status === 406) {
      // PostgREST reports an absent table this way: 0068 has not been applied.
      const e = new Error("site_credentials missing"); e.notProvisioned = true; throw e;
    }
    if (!r.ok) throw new Error(`site_credentials lookup failed (${r.status})`);
    const rows = await r.json().catch(() => []);
    return rows[0] || null;
  },
  async touch(id) {
    await serviceRest(`site_credentials?id=eq.${id}`, {
      method: "PATCH", prefer: "return=minimal",
      body: { last_used_at: new Date().toISOString() },
    }).catch(() => {});
  },
};
