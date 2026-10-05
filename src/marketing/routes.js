// ─────────────────────────────────────────────────────────────────────────────
// Public marketing URLs.
//
// The marketing site is internally routed by query string (/site?pricing=1). That works,
// but it is not a URL anyone would type, share or link to. This maps a readable path onto
// each surface — mineex.ca/pricing — while leaving the query-string routing underneath
// completely intact, so every existing /site?… link, bookmark and QR code keeps working.
//
// Slugs avoid the app's own routes. In particular "/conference" is already the PRODUCTION
// iPad booth (/conference?c=<slug>), so the marketing page is "/conference-mode".
// "/privacy", "/terms" and "/support" are Vercel rewrites to static HTML — also avoided.
// ─────────────────────────────────────────────────────────────────────────────
export const MARKETING_ROUTES = {
  "/home":            "home2=1",
  "/pro":             "pro=1",
  "/conference-mode": "conference=1",
  "/investor":        "investor=1",
  "/pricing":         "pricing=1",
  "/contact":         "contact=1",
  "/compare":         "compare=1",
  "/get-the-app":     "getapp=1",
  "/android":         "android=1",
  "/get-started":     "confstart=1",
};

const norm = (p) => (String(p || "").replace(/\/+$/, "") || "/home");

// The query string this path stands for, or null if it is not a marketing path.
export function routeQueryFor(pathname) {
  return MARKETING_ROUTES[norm(pathname)] || null;
}
export function isMarketingPath(pathname) {
  return routeQueryFor(pathname) !== null;
}

// The search string MarketingSite should route on: the path's own query plus anything the
// URL carried (?plan=pro), so /contact?plan=pro still selects the right plan.
export function effectiveSearch(pathname, search) {
  const q = routeQueryFor(pathname);
  if (!q) return search || "";
  const extra = (search || "").replace(/^\?/, "");
  return "?" + q + (extra ? "&" + extra : "");
}
