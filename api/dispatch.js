// Outbox Dispatcher — drains PUBLICATION_* events to independent, idempotent,
// VERSIONED listeners (api/_listeners.js).
//
// TRIGGERS.
//   GET  + Authorization: Bearer <CRON_SECRET>   the SCHEDULER (Vercel Cron, D22
//        Phase 3; see api/_cronAuth.js). The schedule itself lives in vercel.json
//        and is NOT enabled until approved -- until then nothing calls this.
//   POST + x-dispatch-secret                     the best-effort nudges from
//        /api/publish, /api/unpublish and /api/revise-release (to selfBaseUrl(),
//        never a request header: F5/F11), and manual runs.
//   GET  ?health=1 + Bearer <DISPATCH_HEALTH_TOKEN>   liveness for an external
//        monitor: 200 if a run finished in the last 3 minutes, else 503.
// Every run writes a heartbeat (dispatcher_runs) and evaluates the alert
// conditions (ops_alerts; api/_dispatchOps.js). Overlapping runs are safe: the
// claims are leased with SKIP LOCKED, and the 40 s budget keeps a run inside a
// 1-minute schedule.
//
// SECURITY: refuses to run without a valid x-dispatch-secret. It uses the service
// role (never exposed to the browser) to claim work and write projections.
//
// RELIABILITY (D22 Phase 1):
//   * Claims are leased (claim_deliveries: FOR UPDATE SKIP LOCKED, lease 120 s),
//     so concurrent dispatchers never process the same delivery; a crashed run's
//     leases are reclaimed. complete_delivery owns attempts, backoff (30 s·2ⁿ)
//     and dead-lettering after 6 attempts.
//   * A listener that throws is retried; one that returns { skipped } is
//     completed and COUNTED in the summary (historical, unpublished, already
//     done) -- nothing is skipped silently.
//   * A TIME BUDGET: no new claim after RUN_BUDGET_MS, and claims are small
//     (AI extraction 2 at a time), so a run ends well inside maxDuration instead
//     of being killed mid-write. Unclaimed work waits for the next run.
//
// ADMIN BACKFILL (explicit, platform admins only). Historical events are not
// extracted automatically (isHistorical in _listeners.js). A platform admin may
// run Mine IQ extraction for one publication on purpose:
//   POST /api/dispatch  Authorization: Bearer <admin JWT>
//   { "action": "backfill", "listener": "mineiq_facts_v1", "publication_id": "<uuid>" }

import { serviceConfigured, serviceRpc, serviceDb, checkDispatchSecret } from "./_service.js";
import { requireAdmin } from "./_entitlement.js";
import { isTrustedCron, isHealthReader } from "./_cronAuth.js";
import { recordRunStart, recordRunFinish, evaluateAlerts, dispatcherHealth } from "./_dispatchOps.js";
import { LISTENERS } from "./_listeners.js";

export const config = { maxDuration: 60 };

const LEASE_SECONDS = 120;   // > this function's maxDuration, so a crash is reclaimed, not stranded.
export const RUN_BUDGET_MS = 40_000;   // stop claiming after this; leaves room to finish a batch
// Batch per claim. AI extraction is slow (a model call per release), so it is
// claimed two at a time; projections are fast.
export const BATCH = { mineiq_facts_v1: 2, default: 20 };
const batchFor = (name) => BATCH[name] || BATCH.default;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function runListener(listener, worker, db, deadline, now) {
  const out = { listener: listener.name, claimed: 0, ok: 0, failed: 0, skipped: {}, lease_lost: 0, rounds: 0 };
  // Claim again while batches come back full and the budget allows.
  while (now() < deadline) {
    const limit = batchFor(listener.name);
    const r = await serviceRpc("claim_deliveries", { p_listener: listener.name, p_worker: worker, p_limit: limit, p_lease_seconds: LEASE_SECONDS });
    if (!r.ok) { out.error = `claim failed (${r.status})`; break; }
    const events = (await r.json().catch(() => [])) || [];
    out.rounds++;
    out.claimed += events.length;
    for (const event of events) {
      let ok = true, err = null, result = null;
      try { result = await listener.handle(event, db); } catch (e) { ok = false; err = String((e && e.message) || e).slice(0, 500); }
      // complete only applies if we still hold the lease (false: it expired and
      // another worker reclaimed it, so this result is discarded).
      const c = await serviceRpc("complete_delivery", ok
        ? { p_event_id: event.id, p_listener: listener.name, p_worker: worker, p_ok: true }
        : { p_event_id: event.id, p_listener: listener.name, p_worker: worker, p_ok: false, p_error: err });
      const applied = c.ok ? await c.json().catch(() => null) : null;
      if (applied === false) out.lease_lost++;
      if (!ok) out.failed++;
      else {
        out.ok++;
        if (result && result.skipped) out.skipped[result.skipped] = (out.skipped[result.skipped] || 0) + 1;
      }
    }
    if (events.length < limit) break;   // drained for now
  }
  if (now() >= deadline) out.budget_exhausted = true;
  return out;
}

async function backfill(req, res) {
  const admin = await requireAdmin(req, res);   // 401 / 403 / 502 sent on refusal
  if (!admin) return;
  const body = (req.body && typeof req.body === "object") ? req.body : {};
  const listener = LISTENERS.find((l) => l.name === body.listener);
  if (!listener || listener.name !== "mineiq_facts_v1") return res.status(400).json({ error: "Only mineiq_facts_v1 can be backfilled." });
  const pid = String(body.publication_id || "");
  if (!UUID.test(pid)) return res.status(400).json({ error: "publication_id is required." });
  const db = serviceDb();
  // The most recent event for that publication: its latest revision.
  const events = await db.getRows(`events?publication_id=eq.${pid}&event_type=in.(PUBLICATION_PUBLISHED,PUBLICATION_REVISED)&select=*&order=created_at.desc&limit=1`);
  if (!events.length) return res.status(404).json({ error: "No published event for that publication." });
  try {
    const result = await listener.handle(events[0], db, { force: true });
    return res.status(200).json({ ok: true, listener: listener.name, event_id: events[0].id, result: result || null });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String((e && e.message) || e).slice(0, 300) });
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!serviceConfigured()) return res.status(500).json({ error: "Server not configured: Supabase service env missing." });
  let trigger;
  if (req.method === "GET") {
    const q = req.query || {};
    if (q.health !== undefined) {
      if (!isHealthReader(req)) return res.status(401).json({ error: "unauthorized" });
      const h = await dispatcherHealth();
      return res.status(h.status).json(h.body);
    }
    // A scheduled run: ONLY the cron bearer authenticates a GET.
    if (!isTrustedCron(req)) return res.status(401).json({ error: "unauthorized" });
    trigger = "cron";
  } else {
    const body = (req.body && typeof req.body === "object") ? req.body : {};
    // Explicit admin action, authenticated as a platform admin -- never by the dispatch secret.
    if (body.action === "backfill" && !req.headers["x-dispatch-secret"]) return backfill(req, res);
    if (!checkDispatchSecret(req)) return res.status(401).json({ error: "unauthorized" });
    trigger = body.trigger === "immediate" ? "nudge" : "manual";
  }

  // A unique worker id per invocation so lease ownership is attributable and a
  // reclaimed delivery can't be completed by the crashed worker that lost it.
  const worker = (globalThis.crypto?.randomUUID?.() || `w-${Date.now()}-${Math.floor(Math.random() * 1e9)}`);
  const db = serviceDb();
  const started = Date.now();
  const runId = await recordRunStart(worker, trigger);   // heartbeat (best effort: never blocks delivery)
  const now = () => Date.now();
  const deadline = started + (Number(process.env.DISPATCH_BUDGET_MS) > 0 ? Number(process.env.DISPATCH_BUDGET_MS) : RUN_BUDGET_MS);
  const summary = [];
  for (const listener of LISTENERS) {
    if (now() >= deadline) { summary.push({ listener: listener.name, deferred: "run budget used" }); continue; }
    try { summary.push(await runListener(listener, worker, db, deadline, now)); }
    catch (e) { summary.push({ listener: listener.name, error: String((e && e.message) || e) }); }
  }
  const alerts = await evaluateAlerts();
  const result = { ok: true, worker, trigger, ms: Date.now() - started, listeners: LISTENERS.map((l) => l.name), summary, alerts, heartbeat: !!runId };
  await recordRunFinish(runId, { ms: result.ms, summary, alerts });
  return res.status(200).json(result);
}
