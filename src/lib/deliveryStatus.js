// Where a published release has actually been DELIVERED (D22 Phase 4).
//
// Publication status and delivery status are different things. "Published" is
// a fact about the release record: the publish transaction committed. Delivery
// is what the outbox dispatcher did afterwards, per destination -- the investor
// feed, the Pro Profile timeline, follower notifications, MineIQ. A release can
// be published while its delivery is still pending, retrying, or has failed.
//
// Read through publication_delivery_status() (migration 0071), as the signed-in
// user: the database returns rows only to members of the release's company and
// platform admins, and never returns error text -- a company sees THAT a
// destination failed, never why (that is internal, for the MineEx team).
//
// States per destination (from the RPC): delivered | retrying | failed. A
// 'retrying' row that has not been attempted yet is shown as pending.
// A destination with no row yet is pending too: deliveries are created when
// the dispatcher first picks the release up.
//
// "Delivered" means the destination finished processing the release. Some
// destinations finish by deliberately doing nothing -- follower notifications
// are not sent for a backdated/historical release or a demo -- and that is
// still complete, not pending.

import { SUPABASE_URL } from "./supabase.js";
import { authHeaders } from "./auth.js";

// What each event is delivered to. Mirrors listener_subscriptions (0008, 0051,
// 0071); a destination the database reports that is not listed here is shown
// under its own name rather than hidden.
export const EXPECTED = {
  PUBLICATION_PUBLISHED: ["feed_projection_v1", "profile_timeline_v1", "in_app_notifications_v1", "mineiq_facts_v1"],
  PUBLICATION_REVISED: ["feed_projection_v1", "profile_timeline_v1", "mineiq_facts_v1"],
  PUBLICATION_UNPUBLISHED: ["feed_projection_v1", "profile_timeline_v1"],
};

export const DESTINATIONS = {
  feed_projection_v1: "Investor feed",
  profile_timeline_v1: "Pro Profile timeline",
  in_app_notifications_v1: "Follower notifications",
  mineiq_facts_v1: "MineIQ knowledge",
  device_push_v1: "Mobile push",
};

export const EVENT_LABEL = {
  PUBLICATION_PUBLISHED: "Publication",
  PUBLICATION_REVISED: "Correction",
  PUBLICATION_UNPUBLISHED: "Withdrawal",
};

// A release whose publication record is this old with no delivery record at
// all was most likely published before delivery tracking existed; anything
// newer is queued. Measured from publications.created_at -- when it was
// published through the portal -- never published_at, which a backdated
// (historical) release sets to its original date.
export const QUEUED_WINDOW_MS = 24 * 3600e3;

/** Order of severity, worst first: the overall state is the worst destination's. */
const RANK = { failed: 0, retrying: 1, pending: 2, delivered: 3 };

/**
 * Pure: turn the RPC's rows into what the portal shows.
 * Returns { state, event, destinations: [{ listener, label, state, attempts, updatedAt }] }
 * state: delivered | pending | retrying | failed | untracked
 */
export function summarise(rows, { createdAt = null, now = Date.now() } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    const recent = !createdAt || now - Date.parse(createdAt) < QUEUED_WINDOW_MS;
    return { state: recent ? "pending" : "untracked", event: null, destinations: [] };
  }
  const event = list[0].event_type || null;
  const seen = new Map(list.map((r) => [r.listener, r]));
  const listeners = [...new Set([...(EXPECTED[event] || []), ...list.map((r) => r.listener)])];
  const destinations = listeners.map((listener) => {
    const r = seen.get(listener);
    const state = !r ? "pending"
      : r.state === "delivered" ? "delivered"
      : r.state === "failed" ? "failed"
      : Number(r.attempts) > 0 ? "retrying" : "pending";
    return { listener, label: DESTINATIONS[listener] || listener, state, attempts: r ? Number(r.attempts) || 0 : 0, updatedAt: r ? r.updated_at : null };
  });
  const state = destinations.reduce((w, d) => (RANK[d.state] < RANK[w] ? d.state : w), "delivered");
  return { state, event, destinations };
}

/** Is there nothing left to wait for? */
export const settled = (s) => !!s && (s.state === "delivered" || s.state === "failed" || s.state === "untracked");

/**
 * Fetch one release's delivery status.
 * Resolves { ok: true, ...summarise() } or { ok: false, reason: "unavailable" | "error" }.
 * "unavailable": the database does not have the status function (before 0071).
 */
export async function fetchDeliveryStatus(publicationId, { createdAt = null } = {}) {
  if (!publicationId) return { ok: false, reason: "error" };
  try {
    const h = await authHeaders();
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/publication_delivery_status`, {
      method: "POST", headers: { ...h, "content-type": "application/json" },
      body: JSON.stringify({ p_publication: publicationId }),
    });
    if (r.status === 404) return { ok: false, reason: "unavailable" };
    if (!r.ok) return { ok: false, reason: "error" };
    const rows = await r.json().catch(() => null);
    if (!Array.isArray(rows)) return { ok: false, reason: "error" };
    return { ok: true, ...summarise(rows, { createdAt }) };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/**
 * Statuses for many releases, a few at a time (one small RPC each). Calls
 * onEach(publicationId, status) as they arrive. Returns a cancel function.
 */
export function fetchManyDeliveryStatuses(items, onEach, { concurrency = 4 } = {}) {
  let cancelled = false;
  const queue = items.slice();
  const worker = async () => {
    while (!cancelled && queue.length) {
      const { publicationId, createdAt } = queue.shift();
      const s = await fetchDeliveryStatus(publicationId, { createdAt });
      if (!cancelled) onEach(publicationId, s);
    }
  };
  for (let i = 0; i < Math.min(concurrency, queue.length); i++) worker();
  return () => { cancelled = true; };
}

/** The passport publication of a published `updates` row (listPublished embeds them). */
export function passportPublication(row) {
  const pubs = (row && row.publications) || [];
  return pubs.find((p) => p.destination_id === "passport" && p.status === "published") || null;
}
