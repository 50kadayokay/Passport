// Company engagement — the numbers behind the Analytics page.
//
// The underlying tables (post_events, company_follows, post_likes, post_saves,
// user_company_relationships) are all RLS'd to the investor who owns the row, so
// none of this can be read with a plain select. Migration 0048 adds three
// SECURITY DEFINER functions that return AGGREGATES for a company the caller
// owns -- never a user_id, never a per-investor row.
//
// Everything here fails soft to `null`, which the page renders as "not available
// yet" rather than as zero. A zero is a claim ("nobody read it"); null is the
// truth when we could not ask.

import { SUPABASE_URL } from "./supabase.js";
import { authHeaders } from "./auth.js";

const REST = `${SUPABASE_URL}/rest/v1`;

async function rpc(name, body) {
  try {
    const h = await authHeaders();
    const res = await fetch(`${REST}/rpc/${name}`, {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

/** Headline totals, or null when 0048 is not applied / the call is refused. */
export async function engagementTotals(companyId) {
  if (!companyId) return null;
  const rows = await rpc("company_engagement_totals", { p_company: companyId });
  if (!Array.isArray(rows) || !rows.length) return null;
  const r = rows[0] || {};
  const n = (v) => (v === null || v === undefined ? 0 : Number(v));
  return {
    views: n(r.views),
    reads: n(r.reads),
    avgDwellSecs: r.avg_dwell_secs === null || r.avg_dwell_secs === undefined ? null : Number(r.avg_dwell_secs),
    followers: n(r.followers),
    likes: n(r.likes),
    saves: n(r.saves),
    posts: n(r.posts),
  };
}

/** [{ day, views, reads }] for the trend, oldest first. */
export async function engagementDaily(companyId, days = 30) {
  if (!companyId) return null;
  const rows = await rpc("company_engagement_daily", { p_company: companyId, p_days: days });
  if (!Array.isArray(rows)) return null;
  return rows.map((r) => ({
    day: String(r.day || "").slice(0, 10),
    views: Number(r.views || 0),
    reads: Number(r.reads || 0),
  }));
}

/** Per-release engagement, newest first. */
export async function postEngagement(companyId, limit = 20) {
  if (!companyId) return null;
  const rows = await rpc("company_post_engagement", { p_company: companyId, p_limit: limit });
  if (!Array.isArray(rows)) return null;
  return rows.map((r) => ({
    id: r.post_id,
    title: r.title || "Untitled",
    publishedAt: r.published_at || null,
    views: Number(r.views || 0),
    reads: Number(r.reads || 0),
    likes: Number(r.likes || 0),
  }));
}

/**
 * Read rate: of the people who saw it in a feed, how many opened it. The one
 * derived number worth showing, because it is the only one that says whether
 * the writing worked rather than how much traffic there was.
 */
export function readRate(totals) {
  if (!totals || !totals.views) return null;
  return totals.reads / totals.views;
}
