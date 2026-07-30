// Outbox Dispatcher — drains PUBLICATION_* events to independent, idempotent,
// VERSIONED listeners. Invoked two ways, both hitting this same protected endpoint:
//   • Supabase Cron (pg_cron + pg_net) every minute — the guaranteed drain.
//   • Best-effort immediate call from /api/publish — so posts appear within seconds.
//
// SECURITY: refuses to run without a valid x-dispatch-secret. It uses the service
// role (never exposed to the browser) to claim work and write projections.
//
// CHECKPOINT 1: the LISTENERS registry is intentionally EMPTY — this is the spine
// and dispatcher framework. Checkpoint 2 registers feed_projection_v1 and
// in_app_notifications_v1. Each listener:
//   { name, handle(event) -> Promise<void> }  — throwing schedules a retry; the
//   claim/complete RPCs own attempts, exponential backoff and dead-lettering.

import { serviceConfigured, serviceRpc, serviceDb, checkDispatchSecret } from "./_service.js";
import { LISTENERS } from "./_listeners.js";

export const config = { maxDuration: 60 };

const BATCH = 20;
const LEASE_SECONDS = 120;   // > this function's maxDuration, so a crash is reclaimed, not stranded.

async function runListener(listener, worker, db) {
  // Claim a batch of due deliveries under a lease (marks them processing with a
  // lease + worker id, FOR UPDATE SKIP LOCKED — concurrent runs never double-grab,
  // and an expired lease from a crashed run is reclaimed).
  const r = await serviceRpc("claim_deliveries", { p_listener: listener.name, p_worker: worker, p_limit: BATCH, p_lease_seconds: LEASE_SECONDS });
  if (!r.ok) return { listener: listener.name, error: `claim failed (${r.status})` };
  const events = await r.json().catch(() => []);
  let ok = 0, failed = 0;
  for (const event of Array.isArray(events) ? events : []) {
    try {
      await listener.handle(event, db);
      // complete only applies if we still hold the lease (returns false if it was reclaimed).
      await serviceRpc("complete_delivery", { p_event_id: event.id, p_listener: listener.name, p_worker: worker, p_ok: true });
      ok++;
    } catch (e) {
      await serviceRpc("complete_delivery", { p_event_id: event.id, p_listener: listener.name, p_worker: worker, p_ok: false, p_error: String(e && e.message || e).slice(0, 500) });
      failed++;
    }
  }
  return { listener: listener.name, claimed: (events || []).length, ok, failed };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!checkDispatchSecret(req)) return res.status(401).json({ error: "unauthorized" });
  if (!serviceConfigured()) return res.status(500).json({ error: "Server not configured: Supabase service env missing." });

  // A unique worker id per invocation so lease ownership is attributable and a
  // reclaimed delivery can't be completed by the crashed worker that lost it.
  const worker = (globalThis.crypto?.randomUUID?.() || `w-${Date.now()}-${Math.floor(Math.random() * 1e9)}`);
  const db = serviceDb();
  const summary = [];
  for (const listener of LISTENERS) {
    try { summary.push(await runListener(listener, worker, db)); }
    catch (e) { summary.push({ listener: listener.name, error: String(e && e.message || e) }); }
  }
  return res.status(200).json({ ok: true, worker, listeners: LISTENERS.map((l) => l.name), summary });
}
