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
import { isPortalDemo } from "./demoMode.js";
import { authHeaders } from "./auth.js";

const REST = `${SUPABASE_URL}/rest/v1`;

// Why the last call to each function failed: "missing" (the database does not
// have the function -- PostgREST 404 -- so it needs an update) or "failed"
// (anything else: a refusal, an outage, the network). The page words the two
// differently; telling someone to wait for a database update during an outage
// would be untrue.
const lastFailure = {};
export const failureKind = (name) => lastFailure[name] || null;

async function rpc(name, body) {
  try {
    const h = await authHeaders();
    const res = await fetch(`${REST}/rpc/${name}`, {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { lastFailure[name] = res.status === 404 ? "missing" : "failed"; return null; }
    const out = await res.json().catch(() => null);
    lastFailure[name] = out === null ? "failed" : null;
    return out;
  } catch {
    lastFailure[name] = "failed";
    return null;
  }
}

/** Headline totals, or null when 0048 is not applied / the call is refused. */
// Demo harness: /portaldemo has no company UUID, so the real queries below
// cannot resolve and every page shows its "not switched on yet" state --
// correct, but it leaves the finished design invisible. These branches serve
// synthetic fixtures instead. import.meta.env.DEV is a literal false in a
// production build. It must be the LEADING term of the condition: Rollup cannot
// see through the isPortalDemo() call on its own, and with the call first the
// branch survives and the fixtures ship as a real chunk. Verified by grepping
// dist/ for a fixture string after building.
export async function engagementTotals(companyId) {
  if (import.meta.env && import.meta.env.DEV && isPortalDemo()) return (await import("../portal/__fixtures/updatesDemo.js")).TOTALS;
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

/* `days` is the period the page's toggle is on: a number of days, or NULL for
   all time. Null is passed through to the RPC as null, where it means "no lower
   bound" -- it is not a missing argument to be defaulted. Every windowed call
   on the page is given the same value, so a reader cannot end up comparing a
   30-day chart against a 90-day column. */

/** [{ day, views, reads }] for the trend, oldest first. */
export async function engagementDaily(companyId, days = 30) {
  if (import.meta.env && import.meta.env.DEV && isPortalDemo()) return (await import("../portal/__fixtures/updatesDemo.js")).dailyFor(days);
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
  if (import.meta.env && import.meta.env.DEV && isPortalDemo()) return (await import("../portal/__fixtures/updatesDemo.js")).POSTS;
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

/* ── 0065: breakdowns derived from data already recorded ───────────────────
   Each returns null when 0065 is absent, so the page shows "not available"
   rather than a confident zero. None of these adds coverage: impressions,
   profile views, shares and video remain uncollected and must be rendered as
   untracked, not as 0. */

/* A NOTE ON SAVES, because two different measurements used to be added
   together. `saves` is CURRENT STATE -- rows in post_saves, which investorData's
   savePost() inserts and unsavePost() deletes, so it answers "saved right now".
   `saveActions` is a HISTORICAL COUNT -- post_events of kind 'save', append-only,
   written when an investor saves from the feed; 'unsave' is never emitted by
   anything, so an action can never be taken back. A feed save produces only an
   event (the feed's own saved list is device-local localStorage), so saveActions
   legitimately exceeds saves. Never sum them. */

/** [{ postType, posts, reads, avgDwellSecs, likes, saves, saveActions }] */
export async function engagementByType(companyId, days = null) {
  if (!companyId) return null;
  if (import.meta.env && import.meta.env.DEV && isPortalDemo()) return (await import("../portal/__fixtures/updatesDemo.js")).byTypeFor(days);
  const rows = await rpc("company_engagement_by_type", { p_company: companyId, p_days: days });
  if (!Array.isArray(rows)) return null;
  return rows.map((r) => ({
    postType: r.post_type || "press_release",
    posts: Number(r.posts || 0),
    reads: Number(r.reads || 0),
    avgDwellSecs: r.avg_dwell_secs == null ? null : Number(r.avg_dwell_secs),
    likes: Number(r.likes || 0),
    saves: Number(r.saves || 0),
    saveActions: Number(r.save_actions || 0),
  }));
}

/** [{ day, newFollowers }] oldest first. */
export async function followerGrowth(companyId, days = 30) {
  if (!companyId) return null;
  if (import.meta.env && import.meta.env.DEV && isPortalDemo()) return (await import("../portal/__fixtures/updatesDemo.js")).followerGrowthFor(days);
  const rows = await rpc("company_follower_growth", { p_company: companyId, p_days: days });
  if (!Array.isArray(rows)) return null;
  return rows.map((r) => ({ day: String(r.day || "").slice(0, 10), newFollowers: Number(r.new_followers || 0) }));
}

/** Every published item with lifetime AND recent performance. */
export async function contentPerformance(companyId, days = 30) {
  if (!companyId) return null;
  if (import.meta.env && import.meta.env.DEV && isPortalDemo()) return (await import("../portal/__fixtures/updatesDemo.js")).contentFor(days);
  const rows = await rpc("company_content_performance", { p_company: companyId, p_days: days, p_limit: 200 });
  if (!Array.isArray(rows)) return null;
  return rows.map((r) => ({
    id: r.post_id,
    title: r.title || "Untitled",
    postType: r.post_type || "press_release",
    publishedAt: r.published_at || null,
    reads: Number(r.reads || 0),
    readsRecent: Number(r.reads_recent || 0),
    avgDwellSecs: r.avg_dwell_secs == null ? null : Number(r.avg_dwell_secs),
    likes: Number(r.likes || 0),
    saves: Number(r.saves || 0),
    saveActions: Number(r.save_actions || 0),
  }));
}

/* Everything that is real engagement but can never appear in the item list:
   opens and likes on retired (unpublished) posts, and likes/saves whose
   post_key matches no post at all. Every other figure on the page counts live
   posts only, so the lifetime total equals the sum of the visible list -- an
   identity a reader can check by adding up the column. This is how the
   remainder stays on screen instead of silently disappearing. */
export async function unattributedEngagement(companyId) {
  if (!companyId) return null;
  if (import.meta.env && import.meta.env.DEV && isPortalDemo()) return (await import("../portal/__fixtures/updatesDemo.js")).UNATTRIBUTED;
  const rows = await rpc("company_engagement_unattributed", { p_company: companyId });
  if (!Array.isArray(rows) || !rows.length) return null;
  const r = rows[0] || {};
  const n = (v) => Number(v || 0);
  return {
    retiredPosts: n(r.retired_posts), retiredReads: n(r.retired_reads),
    retiredLikes: n(r.retired_likes), retiredSaves: n(r.retired_saves),
    orphanLikes: n(r.orphan_likes),   orphanSaves: n(r.orphan_saves),
  };
}

/* Impressions (a12, migration 0073b). Recorded only from the moment the app
   started sending them, so the summary carries `firstRecordedAt` and the read
   rate is computed ONLY over opens since then -- opens from before had no
   impression to be measured against. `firstRecordedAt === null` means nothing
   has been recorded yet: the page says so instead of showing 0 or 0%.
   null (not an object) = the function is missing or the call was refused. */
export async function impressionSummary(companyId, days = null) {
  if (!companyId) return null;
  const rows = await rpc("company_impression_summary", { p_company: companyId, p_days: days });
  if (!Array.isArray(rows) || !rows.length) return null;
  const r = rows[0];
  const impressions = Number(r.impressions || 0), opensSince = Number(r.opens_since || 0);
  return {
    firstRecordedAt: r.first_recorded_at || null,
    impressions, viewers: Number(r.viewers || 0), opensSince,
    readRate: r.first_recorded_at && impressions > 0 ? opensSince / impressions : null,
  };
}

/** { [postId]: { impressions, impressionsRecent } } for live posts, or null. */
export async function postImpressions(companyId, days = 30) {
  if (!companyId) return null;
  const rows = await rpc("company_post_impressions", { p_company: companyId, p_days: days });
  if (!Array.isArray(rows)) return null;
  return Object.fromEntries(rows.map((r) => [r.post_id, { impressions: Number(r.impressions || 0), impressionsRecent: Number(r.impressions_recent || 0) }]));
}

/* ── a13 audience events (migration 0087) ─────────────────────────────────── */

/** Profile views, unique visitors, shares, video progress for the window, or
    null when 0087 is not applied / the call is refused. Same window rules as
    impressionSummary; `firstRecordedAt` null = nothing recorded yet. */
export async function audienceSummary(companyId, days = null) {
  if (!companyId) return null;
  const rows = await rpc("company_audience_summary", { p_company: companyId, p_days: days });
  if (!Array.isArray(rows) || !rows.length) return null;
  const r = rows[0];
  const n = (v) => Number(v || 0);
  return {
    firstRecordedAt: r.first_recorded_at || null,
    profileViews: n(r.profile_views), uniqueVisitors: n(r.unique_visitors), signedInVisitors: n(r.signed_in_visitors),
    shares: n(r.shares), videoViewers: n(r.video_viewers), videoCompletions: n(r.video_completions),
  };
}

/** { [postId]: { r25, r50, r75, r100 } } distinct viewers per milestone, or null. */
export async function videoProgress(companyId, days = null) {
  if (!companyId) return null;
  const rows = await rpc("company_video_progress", { p_company: companyId, p_days: days });
  if (!Array.isArray(rows)) return null;
  return Object.fromEntries(rows.map((r) => [r.post_id, { r25: Number(r.reached_25 || 0), r50: Number(r.reached_50 || 0), r75: Number(r.reached_75 || 0), r100: Number(r.reached_100 || 0) }]));
}
