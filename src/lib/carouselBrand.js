// A company's Brand Kit for social output, derived from what the company has
// already approved on its profile -- never hardcoded, and never invented.
//
// Everything here is read from the SAME company record the investor profile
// renders from, so a second company gets its own identity by existing, not by
// someone adding a branch to this file.

const s = (v) => (v == null ? "" : String(v)).trim();

// The one accent used when a company has not chosen one. Companies store a
// brand colour on their profile; this one does not yet, so the kit falls back
// and the editor lets them set it. Guessing a colour out of the logo would be
// a brand decision taken on their behalf.
export const DEFAULT_ACCENT = "#2563eb";

/**
 * company: the row (id, name, profile, primary_ticker)
 * Returns { name, logo, avatar, hero, accent, tickers[], projects[], family }.
 */
export function brandKit(company) {
  const c = company || {};
  const p = c.profile || {};
  const b = p.brand || (p.company && p.company.brand) || {};
  const listings = (p.company && p.company.listings) || p.listings || [];

  return {
    name: s(c.name) || s(p.name),
    logo: s(b.logo) || s(b.avatar) || s(p.logo),
    avatar: s(b.avatar) || s(b.logo),
    hero: s(b.hero),
    // The company's stated jurisdiction, read from its own profile. Premium
    // designs set it beneath the company name; absent, they simply omit it.
    location: [s(p.jurisdiction) || s(p.location) || s((p.company || {}).jurisdiction),
               s((p.company || {}).country) || s(p.country)].filter(Boolean).join(", "),
    accent: s(b.color) || s(b.accent) || DEFAULT_ACCENT,
    accentIsDefault: !(s(b.color) || s(b.accent)),
    tickers: (Array.isArray(listings) ? listings : [])
      .map((l) => ({ ex: s(l && l.ex), sym: s(l && l.sym) }))
      .filter((l) => l.sym),
    projects: (Array.isArray(p.projects) ? p.projects : [])
      .map((x) => s(x && (x.name || x.title))).filter(Boolean),
  };
}

// WHICH DESIGN FAMILY THIS COMPANY USES.
//
// Stored per company so the second release looks like the first -- a social
// feed is a brand surface, and a company whose posts change character every
// month reads as a different company every month. Kept in local storage for
// now because the portal has no per-company preferences table yet; the key is
// company-scoped so nothing leaks between tenants, and moving it to a column
// later is a one-function change.
const FAMILY_KEY = (companyId) => `mineex.brand.family.${companyId || "none"}`;
const ACCENT_KEY = (companyId) => `mineex.brand.accent.${companyId || "none"}`;
const GROUND_KEY = (companyId) => `mineex.brand.ground.${companyId || "none"}`;

export function savedFamily(companyId, fallback) {
  try { return localStorage.getItem(FAMILY_KEY(companyId)) || fallback; }
  catch { return fallback; }
}
export function saveFamily(companyId, family) {
  try { localStorage.setItem(FAMILY_KEY(companyId), String(family)); } catch { /* preference only */ }
}
export function savedAccent(companyId, fallback) {
  try { return localStorage.getItem(ACCENT_KEY(companyId)) || fallback; }
  catch { return fallback; }
}
export function saveAccent(companyId, accent) {
  try { localStorage.setItem(ACCENT_KEY(companyId), String(accent)); } catch { /* preference only */ }
}

// The ground is a preference like the accent: remembered per company so the
// next release opens wearing the same surface. "" means the family's own.
export function savedGround(companyId, fallback = "") {
  try { const v = localStorage.getItem(GROUND_KEY(companyId)); return v == null ? fallback : v; }
  catch { return fallback; }
}
export function saveGround(companyId, ground) {
  try { localStorage.setItem(GROUND_KEY(companyId), String(ground || "")); } catch { /* preference only */ }
}
