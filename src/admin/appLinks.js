// Where admin "View Company" / "Open Conference Mode" / preview links open.
//
// These were hard-coded to https://passport-xi-five.vercel.app, so the staging
// admin opened PRODUCTION's app -- a staging-only company showed "not found",
// and a slug that exists in both showed production's data as if it were the
// one just edited. The admin console is served by the same deployment as /app
// (src/main.jsx routes both), so the app to open is the one on this origin:
// production admin -> production app, staging -> staging, localhost -> local.
//
// NOT for anything printed or shared: a QR code or a link sent to investors
// must point at the canonical public origin (lib/brand.js CANONICAL_ORIGIN /
// profileUrl), never at whichever host the admin happened to be opened on.

export const FALLBACK_APP_ORIGIN = "https://passport-xi-five.vercel.app";

export function appOrigin(loc = typeof window !== "undefined" ? window.location : null) {
  try {
    if (loc && (loc.protocol === "https:" || loc.protocol === "http:") && loc.origin && loc.origin !== "null") return loc.origin;
  } catch { /* fall through */ }
  return FALLBACK_APP_ORIGIN;
}

/** /app?c=<slug> on this deployment, with optional extra query (e.g. "&ipad=1"). */
export function appCompanyUrl(slug, extra = "", loc) {
  return `${appOrigin(loc)}/app?c=${encodeURIComponent(String(slug || ""))}${extra}`;
}
