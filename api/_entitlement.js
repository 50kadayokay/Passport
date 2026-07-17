// Server-side auth + entitlement guard for the AI endpoints.
//
// WHY THIS EXISTS: every /api/* route was previously open to the internet. They
// checked only that ANTHROPIC_API_KEY was set, so anyone with the URL could run
// a $2.50 extraction on our account, and — once features are paid — help
// themselves to the product. A can() helper in React does not stop that; it
// isn't even sent to the server.
//
// HOW IT WORKS: we do not re-implement auth. We take the caller's own Supabase
// access token and ask the database, as that user, whether the company has the
// feature. my_features(cid) already resolves plan + overrides AND checks
// ownership (can_touch_company), so one call answers both questions:
//
//    "are you allowed to touch this company?"  and  "is this feature paid for?"
//
// If RLS says no, the caller sees nothing. The database stays the single source
// of truth and there is no second copy of the rules to drift out of sync.
//
// Files prefixed with _ are not routed by Vercel — this is a helper, not an
// endpoint.

const SB = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;

function bearer(req) {
  const h = req.headers.authorization || req.headers.Authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(String(h).trim());
  return m ? m[1] : "";
}

/**
 * Guard an endpoint. Returns the caller when allowed, or null after having
 * already sent the error response — callers must bail out on null:
 *
 *   const auth = await requireFeature(req, res, { companyId, feature: "company_memory" });
 *   if (!auth) return;
 */
export async function requireFeature(req, res, { companyId, feature }) {
  if (!SB || !ANON) {
    res.status(500).json({ error: "Server not configured: Supabase env is missing." });
    return null;
  }
  const token = bearer(req);
  if (!token) {
    res.status(401).json({ error: "Sign in required." });
    return null;
  }
  if (!companyId) {
    res.status(400).json({ error: "companyId is required." });
    return null;
  }

  // 1) Is the token real and unexpired? Supabase answers; we never parse a JWT
  //    ourselves (an unverified decode would accept a forged token).
  let user = null;
  try {
    const r = await fetch(`${SB}/auth/v1/user`, {
      headers: { apikey: ANON, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      res.status(401).json({ error: "Session expired or invalid. Sign in again." });
      return null;
    }
    user = await r.json();
  } catch {
    res.status(502).json({ error: "Could not verify the session." });
    return null;
  }

  // 2) Ask the DB, AS THIS USER, what this company is entitled to. Ownership is
  //    enforced inside my_features(), so a stranger gets an empty list.
  let features = [];
  try {
    const r = await fetch(`${SB}/rest/v1/rpc/my_features`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ cid: companyId }),
    });
    if (!r.ok) {
      res.status(403).json({ error: "Not allowed for this company." });
      return null;
    }
    const rows = await r.json().catch(() => []);
    features = (Array.isArray(rows) ? rows : [])
      .map((x) => (typeof x === "string" ? x : x && x.my_features))
      .filter(Boolean);
  } catch {
    res.status(502).json({ error: "Could not check entitlements." });
    return null;
  }

  // An empty list means either "not your company" or "no plan". Both are 403 —
  // we deliberately don't distinguish, so this can't be used to probe which
  // company ids exist.
  if (!features.length) {
    res.status(403).json({ error: "Not allowed for this company." });
    return null;
  }
  if (feature && !features.includes(feature)) {
    res.status(403).json({ error: `Your plan doesn't include this. (${feature})`, code: "feature_locked", feature });
    return null;
  }

  return { userId: user.id, email: user.email, features, token };
}

/** Resolve a company's uuid from its slug, as the caller. Null if not visible. */
export async function companyIdFromSlug(slug, token) {
  if (!slug) return null;
  try {
    const r = await fetch(`${SB}/rest/v1/companies?slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`, {
      headers: { apikey: ANON, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!r.ok) return null;
    const rows = await r.json().catch(() => []);
    return rows[0] ? rows[0].id : null;
  } catch {
    return null;
  }
}
