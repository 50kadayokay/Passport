// Service-key Supabase REST client for the runner. Uses the SAME endpoints an Edge Function
// would (server-side, service role) — reads a draft company + its documents, writes the profile.
import { CONFIG } from "./config.mjs";

const headers = () => ({
  apikey: CONFIG.serviceKey,
  Authorization: `Bearer ${CONFIG.serviceKey}`,
  "Content-Type": "application/json",
});

async function rest(pathAndQuery, opts = {}) {
  const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/${pathAndQuery}`, {
    ...opts,
    headers: { ...headers(), ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Supabase ${opts.method || "GET"} ${pathAndQuery} → ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return res.status === 204 ? null : res.json();
}

export async function getCompany(slug) {
  const rows = await rest(`companies?slug=eq.${encodeURIComponent(slug)}&select=id,slug,name,status,profile&limit=1`);
  return (Array.isArray(rows) && rows[0]) || null;
}

export async function getDocuments(companyId) {
  const rows = await rest(
    `documents?company_id=eq.${encodeURIComponent(companyId)}&select=id,filename,kind,doc_date,extracted_text,meta&order=doc_date.desc.nullslast`
  );
  return Array.isArray(rows) ? rows : [];
}

export async function writeProfile(slug, profile) {
  return rest(`companies?slug=eq.${encodeURIComponent(slug)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ profile }),
  });
}
