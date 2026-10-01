// What actually happened when a release was published.
//
// Publishing emits a PUBLICATION_PUBLISHED outbox event; a dispatcher then runs
// idempotent listeners that build the feed post, notify followers and (new)
// extract MineIQ facts. Those run AFTER the transaction commits, so at the
// moment the publish call returns, none of them has necessarily happened yet.
//
// The confirmation screen must therefore not assert them. This polls for the
// rows each listener actually writes and reports only what it can see. Anything
// still pending is reported as pending -- never as done, and never as failed,
// because a slow drain is normal and Supabase Cron is the guaranteed backstop.
//
// DEVICE PUSH IS NOT CHECKED, because it is not wired to this path: the
// in_app_notifications_v1 listener writes in-app notifications only. Device push
// (APNs, via notification_outbox) is driven by the separate news pipeline. Saying
// "followers were pushed" here would be a straightforward lie.

import { SUPABASE_URL } from "./supabase.js";
import { authHeaders } from "./auth.js";

async function count(path) {
  try {
    const h = await authHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { ...h, Prefer: "count=exact", Range: "0-0" },
    });
    if (!res.ok) return null;                       // could not ask ≠ zero
    const cr = res.headers.get("content-range");
    if (cr && cr.includes("/")) {
      const n = Number(cr.split("/")[1]);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * One look at the downstream state. Each value is true (confirmed), false
 * (asked, not there yet) or null (could not ask).
 */
export async function checkOutcome({ companyId, publicationId }) {
  if (!publicationId) return { live: null, post: null, timeline: null, notified: null, mineiq: null, postId: null };

  const [pubRows, postRows] = await Promise.all([
    (async () => {
      try {
        const h = await authHeaders();
        const r = await fetch(`${SUPABASE_URL}/rest/v1/publications?id=eq.${publicationId}&select=status,published_at`, { headers: h });
        return r.ok ? await r.json().catch(() => []) : null;
      } catch { return null; }
    })(),
    (async () => {
      try {
        const h = await authHeaders();
        const r = await fetch(`${SUPABASE_URL}/rest/v1/posts?publication_id=eq.${publicationId}&select=id,removed_at`, { headers: h });
        return r.ok ? await r.json().catch(() => []) : null;
      } catch { return null; }
    })(),
  ]);

  const live = pubRows === null ? null : !!(pubRows[0] && pubRows[0].status === "published");
  const post = postRows === null ? null : !!(postRows[0] && !postRows[0].removed_at);
  const postId = (postRows && postRows[0] && postRows[0].id) || null;

  // Notifications are keyed on the post, so there is nothing to count until the
  // feed projection has run.
  const notified = postId ? await count(`notifications?post_id=eq.${postId}&select=id`) : (post === false ? 0 : null);

  // MineIQ writes facts carrying this publication id.
  const mineiq = companyId
    ? await count(`facts?company_id=eq.${companyId}&data->>publication_id=eq.${publicationId}&select=id`)
    : null;

  // THE TIMELINE IS A SEPARATE SURFACE and must be checked separately.
  //
  // This screen used to tick "added to your company timeline" from the presence
  // of a `posts` row. That was wrong: `posts` is the feed, and the Pro Profile's
  // press-release history renders from companies.profile.timeline, which
  // publishing did not touch at all until profile_timeline_v1 (0051). The claim
  // was unverified, on the one screen built to make only verified claims.
  //
  // Now it looks for the entry the listener actually writes, keyed on this
  // publication.
  let timeline = null;
  if (companyId) {
    try {
      const h = await authHeaders();
      const r = await fetch(`${SUPABASE_URL}/rest/v1/companies?id=eq.${companyId}&select=profile`, { headers: h });
      if (r.ok) {
        const rows = await r.json().catch(() => []);
        const entries = (rows[0] && rows[0].profile && rows[0].profile.timeline) || [];
        timeline = Array.isArray(entries) && entries.some((e) => e && e.key === `pub:${publicationId}`);
      }
    } catch { /* could not ask ≠ absent */ }
  }

  return { live, post, timeline, notified, mineiq, postId };
}

/**
 * Poll until the listeners have landed, or until we stop waiting.
 *
 * Gives up after ~20s and reports what it has. Not finding a post after 20s does
 * not mean failure -- the cron drain may simply not have run -- so the caller
 * shows "processing", not "failed".
 */
export async function waitForOutcome({ companyId, publicationId, onTick, timeoutMs = 20000 }) {
  const started = Date.now();
  let last = await checkOutcome({ companyId, publicationId });
  onTick && onTick(last);

  while (Date.now() - started < timeoutMs) {
    if (last.live && last.post && last.timeline && last.mineiq) break;   // everything we can see has landed
    await new Promise((r) => setTimeout(r, 2500));
    last = await checkOutcome({ companyId, publicationId });
    onTick && onTick(last);
  }
  return last;
}
