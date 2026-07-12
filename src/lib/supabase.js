// Supabase config. The URL + publishable ("anon") key are read from Vite env
// vars (set in .env locally and in Vercel for prod). Both are safe to ship in
// the client — never put the service-role/secret key here. Fallbacks keep local
// dev working without a .env; production should always set the env vars.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://rvptronniomlqumjhyrr.supabase.co";
export const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_NNxikHZSGZ0CYnzN7jckLg_vPvrRCTl";

const headers = {
  apikey: SUPABASE_ANON,
  Authorization: `Bearer ${SUPABASE_ANON}`,
};

// Fetch one company row by slug. Returns the full row ({ slug, name, profile, … })
// or null if not found. Throws on network / HTTP errors so callers can surface it.
export async function fetchCompany(slug) {
  const url =
    `${SUPABASE_URL}/rest/v1/companies` +
    `?slug=eq.${encodeURIComponent(slug)}&select=*&limit=1`;
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
