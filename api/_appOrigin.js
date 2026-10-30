// The ONE origin MineEx sends users back to from third parties (Stripe Checkout,
// the Stripe Billing Portal). F2: these return URLs used to come from the
// request's Origin header, which any caller sets -- a checkout could be made to
// land on a page the attacker controls. Never derived from the request.
//
//   PORTAL_ORIGIN    https://... (validated): where the PORTAL is served;
//                    http:// is accepted only for localhost / 127.0.0.1 (local runs)
//   otherwise        DEFAULT_APP_ORIGIN, the origin these routes already used
//                    as their fallback, so production behaviour is unchanged
//                    when the variable is not set.
//
// Deliberately NOT PUBLIC_APP_URL: share-news.js already uses that for the
// public marketing origin (default https://mineex.ca, the mineex-site project),
// which does not serve /portal. Reusing it would send paying customers to the
// wrong site.

export const DEFAULT_APP_ORIGIN = "https://passport-xi-five.vercel.app";

export function appOrigin(env = process.env) {
  const raw = String(env.PORTAL_ORIGIN || "").trim();
  if (raw) {
    try {
      const u = new URL(raw);
      const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
      if ((u.protocol === "https:" || (u.protocol === "http:" && local)) && !u.username && !u.password) return u.origin;
    } catch { /* fall through to the default */ }
    console.error("[appOrigin] PORTAL_ORIGIN is set but not a usable https origin; using the default");
  }
  return DEFAULT_APP_ORIGIN;
}
