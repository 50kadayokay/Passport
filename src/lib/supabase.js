// Supabase config. The URL + publishable ("anon") key are read from Vite env
// vars (set in .env locally and in Vercel for prod). Both are safe to ship in
// the client — never put the service-role/secret key here. Only a PRODUCTION
// build falls back to the production project (Vercel sets the vars; the native
// apps are built with `vite build` and rely on the fallback). Anything else --
// `vite` dev, `vite build --mode development`, a node test -- gets a host that
// cannot resolve, so a local preview never talks to production by accident.
// (2026-11-01: a signed-out dev portal polled production once a minute.)
// `import.meta.env` exists under Vite and is undefined under plain node. Reading it
// as a whole (rather than reaching straight through it) keeps Vite's build-time
// substitution working while letting this module be imported by a node test — which
// is what lets the ingestion invariants be proven by execution instead of by
// reading the source.
const ENV = (import.meta && import.meta.env) || {};

// A STAGING bundle (VITE_MINEEX_ENV=staging, set by vite.config.js) has no
// fallback: the production values below would make a staging UI read and write
// production. vite.config.js already refuses to build one without the staging
// URL; this is the same rule at runtime, for any bundle built some other way.
const STAGING_URL = "https://jmljfovtfxcdhjmtlnva.supabase.co";
const IS_STAGING = ENV.VITE_MINEEX_ENV === "staging";
if (IS_STAGING && (String(ENV.VITE_SUPABASE_URL || "").replace(/\/+$/, "") !== STAGING_URL || !ENV.VITE_SUPABASE_ANON_KEY)) {
  throw new Error("[staging tripwire] this staging bundle is not configured for the staging Supabase project.");
}

// __MINEEX_PRODUCTION_BUILD__ is a literal from vite.config.js (true only for
// `vite build` in production mode), so any other bundle drops the production
// values entirely; it is undefined under node and in test bundles. A page on
// plain http (a local `vite preview` of a production build) gets no fallback
// either: the deploy is https, and the native apps load from
// capacitor://localhost (iOS) and https://localhost (Android).
// eslint-disable-next-line no-undef
const BUILT_FOR_PRODUCTION = typeof __MINEEX_PRODUCTION_BUILD__ !== "undefined" && __MINEEX_PRODUCTION_BUILD__ === true;
const PLAIN_HTTP_PAGE = typeof location !== "undefined" && location.protocol === "http:";
const PRODUCTION_BUILD = BUILT_FOR_PRODUCTION && !PLAIN_HTTP_PAGE;
export const NOT_CONFIGURED_URL = "https://supabase-url-not-configured.invalid";
if (!IS_STAGING && !PRODUCTION_BUILD && !ENV.VITE_SUPABASE_URL && typeof console !== "undefined") {
  console.error("[supabase] VITE_SUPABASE_URL is not set: this is not a production build, so there is no fallback. " +
                "Requests go to an unresolvable host. Set VITE_SUPABASE_URL (and VITE_SUPABASE_ANON_KEY) to the project you mean.");
}

export const SUPABASE_URL = IS_STAGING ? STAGING_URL
  : (ENV.VITE_SUPABASE_URL || (PRODUCTION_BUILD ? "https://rvptronniomlqumjhyrr.supabase.co" : NOT_CONFIGURED_URL));
export const SUPABASE_ANON = IS_STAGING ? ENV.VITE_SUPABASE_ANON_KEY
  : (ENV.VITE_SUPABASE_ANON_KEY || (PRODUCTION_BUILD ? "sb_publishable_NNxikHZSGZ0CYnzN7jckLg_vPvrRCTl" : "sb_publishable_not_configured"));

const headers = {
  apikey: SUPABASE_ANON,
  Authorization: `Bearer ${SUPABASE_ANON}`,
};

// Fetch one company row by slug. Returns the full row ({ slug, name, profile, … })
// or null if not found. Throws on network / HTTP errors so callers can surface it.
// Columns are listed EXPLICITLY, not `select=*`. Migration 0061 revokes anon's
// table-wide SELECT on companies and re-grants it per column, withholding
// owner_id and preview_token. Under a column grant `select=*` does not quietly
// omit what you may not read -- it FAILS the whole request -- so this list is
// what keeps the public investor app working across that change. It is also
// forward-safe: it works identically before and after the migration, which is
// what lets the deploy and the migration happen at different times.
//
// A column added to companies later must be added here too, or it will not
// reach the investor app.
const PUBLIC_COMPANY_COLS =
  "id,slug,name,primary_ticker,status,profile,created_at,updated_at,tier,managed_by_admin";

export async function fetchCompany(slug) {
  const url =
    `${SUPABASE_URL}/rest/v1/companies` +
    `?slug=eq.${encodeURIComponent(slug)}&select=${PUBLIC_COMPANY_COLS}&limit=1`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Supabase read failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

// Fetch a DRAFT (or any) company by slug using its private preview token. Calls
// the token-gated SECURITY DEFINER function, so it works for unpublished spec
// profiles that the public RLS policy would otherwise hide. Returns the row
// ({ slug, name, profile, … }) or null if the slug+token don't match.
export async function fetchPreviewCompany(slug, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_preview_company`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ p_slug: slug, p_token: token }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Preview read failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  const row = await res.json();
  return row && typeof row === "object" ? row : null;
}

// List every company (newest first) for the admin dashboard. Pass the admin's
// authed headers so RLS shows all rows (incl. drafts) via is_admin().
export async function fetchCompanies(reqHeaders = headers) {
  const url =
    `${SUPABASE_URL}/rest/v1/companies` +
    `?select=id,slug,name,primary_ticker,status,profile,preview_token,created_at,updated_at,owner_id` +
    `&order=updated_at.desc.nullslast`;
  const res = await fetch(url, { headers: reqHeaders });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Supabase read failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  return res.json();
}

// Delete a company row by slug. Used to clear out draft/test companies from the admin.
// is_admin() lets an admin delete any row; RLS blocks non-admins. Returns true on success.
export async function deleteCompany(slug, reqHeaders = headers) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/companies?slug=eq.${encodeURIComponent(slug)}`, {
    method: "DELETE",
    headers: { ...reqHeaders, Prefer: "return=representation" },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Delete failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0;   // false = RLS no-op (protected/not found)
}

// Create a company row. Used by the JSON importer so onboarding a new company is a
// single paste — the name and ticker come out of the payload rather than being typed
// first. Starts as a draft; the operator reviews and publishes.
export async function createCompany(fields, reqHeaders = headers) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/companies`, {
    method: "POST",
    headers: { ...reqHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ status: "draft", ...fields }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Create failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

// Patch a company row by slug (e.g. { status: "published" }). Pass the admin's
// authed headers so is_admin() lets it touch any row. Returns the updated row.
export async function updateCompany(slug, patch, reqHeaders = headers) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/companies?slug=eq.${encodeURIComponent(slug)}`, {
    method: "PATCH",
    headers: { ...reqHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Update failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}
