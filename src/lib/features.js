// Feature permissions — the client half.
//
// Usage:
//   const { can, loading } = useFeatures(company?.id);
//   {can("communications_center") && <CommsCenter />}
//
// IMPORTANT — this is UX, not enforcement. Everything here is bypassable by
// anyone with a browser console. The real boundary is RLS (migration 0005) plus
// the server-side check in api/_entitlement.js. Never gate anything that costs
// money or exposes data on can() alone; use it to decide what to *render*.
//
// Resolution (plan features + per-company overrides, admin sees all) lives in
// one place: the my_features(cid) SQL function. The client just asks.

import { SUPABASE_URL } from "./supabase.js";
import { authHeaders, getMyRole } from "./auth.js";
import { useState, useEffect, useMemo } from "react";

// Every feature id in the catalogue. Kept here only for editor autocomplete and
// so a typo in can("comunications_center") is greppable — the database is the
// source of truth.
export const FEATURES = {
  PORTAL_ACCESS: "portal_access",
  PASSPORT_PROFILE: "passport_profile",
  COMPANY_MEMORY: "company_memory",
  COMMUNICATIONS_CENTER: "communications_center",
  WEBSITE_PUBLISH: "website_publish",
  LINKEDIN_PUBLISH: "linkedin_publish",
  X_PUBLISH: "x_publish",
  NEWSLETTER_PUBLISH: "newsletter_publish",
  PUSH_PUBLISH: "push_publish",
  ANALYTICS: "analytics",
  CUSTOM_WEBSITE: "custom_website",
};

// Resolved feature ids for one company. Returns [] rather than throwing — a
// failed lookup must deny, never accidentally grant.
export async function fetchFeatures(companyId) {
  if (!companyId) return [];
  try {
    const h = await authHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/my_features`, {
      method: "POST",
      headers: { ...h, "content-type": "application/json" },
      body: JSON.stringify({ cid: companyId }),
    });
    if (!res.ok) return [];
    const rows = await res.json().catch(() => []);
    // The function returns setof text — PostgREST gives ["a","b"] or [{my_features:"a"}].
    return (Array.isArray(rows) ? rows : []).map((r) => (typeof r === "string" ? r : r && r.my_features)).filter(Boolean);
  } catch {
    return [];
  }
}

export async function fetchPlan(companyId) {
  if (!companyId) return null;
  try {
    const h = await authHeaders();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/company_subscriptions?company_id=eq.${companyId}&select=plan_id,status,renews_at,plans(label,rank)&limit=1`,
      { headers: h }
    );
    if (!res.ok) return null;
    const rows = await res.json().catch(() => []);
    return rows[0] || null;
  } catch {
    return null;
  }
}

// React hook. `loading` matters: until the features land, can() returns false,
// so render a skeleton rather than flashing a locked state at a paying customer.
export function useFeatures(companyId) {
  const [ids, setIds] = useState(null);       // null = not loaded yet
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let alive = true;
    getMyRole().then((r) => { if (alive) setIsAdmin(r === "admin"); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    if (!companyId) { setIds([]); return; }
    setIds(null);
    fetchFeatures(companyId).then((f) => { if (alive) setIds(f); });
    return () => { alive = false; };
  }, [companyId]);

  return useMemo(() => {
    const set = new Set(ids || []);
    return {
      loading: ids === null,
      isAdmin,
      features: ids || [],
      // Default-deny while loading. my_features() already grants admins
      // everything, so no special-casing here.
      can: (id) => (ids === null ? false : set.has(id)),
      canAny: (...list) => (ids === null ? false : list.some((id) => set.has(id))),
      canAll: (...list) => (ids === null ? false : list.every((id) => set.has(id))),
    };
  }, [ids, isAdmin]);
}
