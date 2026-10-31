// api/ops.js — platform-admin delivery operations (D22 Phase 4).
//
// The ONLY route that shows delivery internals (last_error, workers, leases,
// heartbeats, alerts) and the ONLY way to replay a delivery. Platform admins
// only (requireAdmin: 401 signed out, 403 anyone else, whatever company they
// name); reads and writes use the service role AFTER that check. Company users
// see their own releases' delivery state through publication_delivery_status()
// (migration 0071), which never returns error text.
//
// GET  ?view=summary                      dispatcher health, last successful run,
//                                         counts by listener and status, alerts,
//                                         recent runs and recent replays
// GET  ?view=deliveries&status=dead       a page of deliveries (pending, processing,
//      [&listener=][&company=][&before=]  failed, dead, succeeded; comma list),
//                                         newest change first
// GET  ?view=delivery&id=<uuid>           one delivery in full, its event, its
//                                         release, sibling deliveries and whether
//                                         it may be replayed (and why not)
// GET  ?view=history[&publication=]       events newest first with every delivery
//      [&company=][&before=]              of each: the historical record
// POST { action: "replay", delivery_id, expected_updated_at, confirm: true }
// POST { action: "acknowledge" | "resolve", condition }
//
// REPLAY IS DELIBERATELY NARROW. One delivery per request, never a list (there
// is no mass replay here; reconcile_outbox is not called). Only a dead letter
// (status 'dead'): a 'failed' delivery already retries on its own schedule.
// Never a superseded event (the release has a newer publish/unpublish/revision:
// replaying the old one is at best a no-op). Compare-and-set on the status AND
// the updated_at the admin was shown, so a double click, a second tab or a
// change in between is a 409, never a second redispatch. Attempts are kept, so
// a replay buys exactly ONE more attempt before the delivery is dead again.
// At most REPLAY_LIMIT replays a minute across all admins. Every replay is
// recorded in dispatcher_runs (trigger 'replay', which is never a heartbeat).
// Listeners re-check the release's current state, so a replay can never
// re-publish a withdrawn release, and old events still skip notifications.

import { requireAdmin } from "./_entitlement.js";
import { serviceConfigured, serviceRest, invokeDispatchBestEffort } from "./_service.js";
import { dispatcherHealth, outboxConditions, RUN_TRIGGERS } from "./_dispatchOps.js";
import { isHistorical } from "./_listeners.js";

export const STATUSES = ["pending", "processing", "failed", "dead", "succeeded"];
export const REPLAY_LIMIT = 10;              // replays per minute, all admins together
export const PAGE_MAX = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LISTENER = /^[a-z0-9_]{1,64}$/;
const enc = encodeURIComponent;
const isoOk = (v) => typeof v === "string" && v.length <= 40 && Number.isFinite(Date.parse(v));

async function rows(path) {
  const r = await serviceRest(path);
  if (!r.ok) { const e = new Error(`read failed (${r.status})`); e.status = r.status; throw e; }
  return (await r.json().catch(() => [])) || [];
}
async function count(path) {
  const r = await serviceRest(path, { prefer: "count=exact" });
  if (!r.ok) throw new Error(`count failed (${r.status})`);
  const n = Number(String(r.headers.get("content-range") || "").split("/")[1]);
  return Number.isFinite(n) ? n : 0;
}
const ids = (list) => [...new Set(list.filter((x) => x && UUID.test(x)))];

/** Company names and release headlines for display. */
async function labels(companyIds, publicationIds) {
  const c = ids(companyIds), p = ids(publicationIds);
  const [cos, pubs] = await Promise.all([
    c.length ? rows(`companies?id=in.(${c.join(",")})&select=id,name,slug`) : [],
    p.length ? rows(`publications?id=in.(${p.join(",")})&select=id,status,published_at,headline:content->>headline`) : [],
  ]);
  return { companies: Object.fromEntries(cos.map((x) => [x.id, x])), publications: Object.fromEntries(pubs.map((x) => [x.id, x])) };
}

/** A run is successful when it finished and no listener errored. */
const runOk = (r) => !!r.finished_at && Array.isArray(r.summary && r.summary.summary) && !r.summary.summary.some((s) => s && s.error);

async function summaryView() {
  const health = await dispatcherHealth();
  const runs = await rows(`dispatcher_runs?trigger=in.(${RUN_TRIGGERS.join(",")})&select=worker,trigger,started_at,finished_at,summary&order=started_at.desc&limit=50`);
  const lastSuccess = runs.find(runOk) || null;
  const lastCron = runs.find((r) => r.trigger === "cron" && r.finished_at) || null;
  const counts = {};
  for (const status of ["pending", "processing", "failed", "dead"]) {
    for (const r of await rows(`event_deliveries?status=eq.${status}&select=listener&limit=10000`)) {
      (counts[r.listener] ||= { pending: 0, processing: 0, failed: 0, dead: 0 })[status]++;
    }
  }
  const totals = Object.fromEntries(await Promise.all(STATUSES.map(async (s) => [s, await count(`event_deliveries?status=eq.${s}&select=id&limit=1`)])));
  const alerts = await rows(`ops_alerts?select=condition,first_seen,last_sent,resolved_at,detail&order=first_seen.desc`);
  const replays = await rows(`dispatcher_runs?trigger=eq.replay&select=started_at,summary&order=started_at.desc&limit=10`);
  const brief = (r) => r && { trigger: r.trigger, started_at: r.started_at, finished_at: r.finished_at, ok: runOk(r), ms: r.summary && r.summary.ms };
  return {
    health: { ok: health.status === 200, ...health.body },
    last_success: brief(lastSuccess), last_cron: brief(lastCron),
    runs: runs.slice(0, 15).map((r) => ({ ...brief(r), summary: r.summary && r.summary.summary })),
    totals, by_listener: counts, alerts,
    replays: replays.map((r) => ({ at: r.started_at, ...(r.summary || {}) })),
    replay_limit_per_minute: REPLAY_LIMIT,
  };
}

async function deliveriesView(q) {
  const statuses = String(q.status || "dead").split(",").map((s) => s.trim()).filter(Boolean);
  if (!statuses.length || statuses.some((s) => !STATUSES.includes(s))) return [400, { error: `status must be one or more of ${STATUSES.join(", ")}` }];
  if (q.listener && !LISTENER.test(String(q.listener))) return [400, { error: "invalid listener" }];
  if (q.company && !UUID.test(String(q.company))) return [400, { error: "invalid company" }];
  if (q.before && !isoOk(q.before)) return [400, { error: "invalid before" }];
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), PAGE_MAX);
  let path = `event_deliveries?status=in.(${statuses.join(",")})`
    + `&select=id,event_id,listener,status,attempts,next_attempt_at,lease_expires_at,locked_by,last_error,processed_at,created_at,updated_at,`
    + `event:events!inner(event_type,publication_id,company_id,occurred_at,created_at)`
    + `&order=updated_at.desc,id.desc&limit=${limit + 1}`;
  if (q.listener) path += `&listener=eq.${enc(q.listener)}`;
  if (q.company) path += `&event.company_id=eq.${q.company}`;
  if (q.before) path += `&updated_at=lt.${enc(q.before)}`;
  const list = await rows(path);
  const page = list.slice(0, limit);
  const lab = await labels(page.map((d) => d.event.company_id), page.map((d) => d.event.publication_id));
  return [200, {
    statuses, next_before: list.length > limit ? page[page.length - 1].updated_at : null,
    deliveries: page.map((d) => ({
      ...d, last_error: d.last_error ? String(d.last_error).slice(0, 300) : null,
      company: lab.companies[d.event.company_id] || null, publication: lab.publications[d.event.publication_id] || null,
    })),
  }];
}

/** Everything needed to show one delivery and decide whether it may be replayed. */
async function loadDelivery(id) {
  const d = (await rows(`event_deliveries?id=eq.${id}&select=*`))[0];
  if (!d) return null;
  const event = (await rows(`events?id=eq.${d.event_id}&select=id,event_type,event_version,publication_id,company_id,actor_user_id,payload,occurred_at,created_at`))[0] || null;
  const siblings = await rows(`event_deliveries?event_id=eq.${d.event_id}&select=id,listener,status,attempts,updated_at&order=listener.asc`);
  let newest = null, publication = null, company = null;
  if (event && event.publication_id) {
    newest = (await rows(`events?publication_id=eq.${event.publication_id}&select=id,event_type,created_at&order=created_at.desc,id.desc&limit=1`))[0] || null;
    const lab = await labels([event.company_id], [event.publication_id]);
    publication = lab.publications[event.publication_id] || null;
    company = lab.companies[event.company_id] || null;
  }
  return { delivery: d, event, siblings, newest, publication, company };
}

export function assessReplay({ delivery: d, event, newest, publication }, now = Date.now()) {
  const warnings = [];
  if (d.status !== "dead") {
    const why = d.status === "succeeded" ? "it was delivered"
      : d.status === "failed" ? `it is already retrying automatically (next attempt ${d.next_attempt_at})`
      : `it is ${d.status} -- the dispatcher has it`;
    return { allowed: false, reason: `Only a dead-letter delivery can be replayed; ${why}.`, warnings };
  }
  if (!event) return { allowed: false, reason: "Its event no longer exists.", warnings };
  if (newest && newest.id !== event.id) {
    return { allowed: false, reason: `Superseded: the release has a newer event (${newest.event_type}, ${newest.created_at}). Replaying this one would be stale.`, warnings };
  }
  if (!publication) warnings.push("The release no longer exists: the listener will complete without doing anything.");
  else if (event.event_type !== "PUBLICATION_UNPUBLISHED" && publication.status !== "published") warnings.push(`The release is now ${publication.status}: the listener will skip it rather than re-publish it.`);
  if (isHistorical(event, now)) warnings.push("This event is older than the delivery window: notifications, device push and Mine IQ will skip it (no follower is notified); the feed and timeline are reconciled to the release's current state.");
  warnings.push(`Attempts are kept (${d.attempts}): this replay allows ONE more attempt before the delivery is a dead letter again.`);
  return { allowed: true, reason: null, warnings };
}

async function deliveryView(q) {
  if (!UUID.test(String(q.id || ""))) return [400, { error: "id must be a delivery uuid" }];
  const x = await loadDelivery(q.id);
  if (!x) return [404, { error: "No such delivery." }];
  return [200, { ...x, replay: assessReplay(x) }];
}

async function historyView(q) {
  if (q.publication && !UUID.test(String(q.publication))) return [400, { error: "invalid publication" }];
  if (q.company && !UUID.test(String(q.company))) return [400, { error: "invalid company" }];
  if (q.before && !isoOk(q.before)) return [400, { error: "invalid before" }];
  const limit = Math.min(Math.max(Number(q.limit) || 25, 1), PAGE_MAX);
  let path = `events?select=id,event_type,publication_id,company_id,occurred_at,created_at,deliveries:event_deliveries(id,listener,status,attempts,updated_at,processed_at)`
    + `&order=created_at.desc,id.desc&limit=${limit + 1}`;
  if (q.publication) path += `&publication_id=eq.${q.publication}`;
  if (q.company) path += `&company_id=eq.${q.company}`;
  if (q.before) path += `&created_at=lt.${enc(q.before)}`;
  const list = await rows(path);
  const page = list.slice(0, limit);
  const lab = await labels(page.map((e) => e.company_id), page.map((e) => e.publication_id));
  return [200, {
    next_before: list.length > limit ? page[page.length - 1].created_at : null,
    events: page.map((e) => ({ ...e, company: lab.companies[e.company_id] || null, publication: lab.publications[e.publication_id] || null })),
  }];
}

async function replay(admin, body) {
  if (Array.isArray(body.delivery_id) || Array.isArray(body.delivery_ids) || body.all) return [400, { error: "One delivery per request. There is no bulk replay." }];
  if (!UUID.test(String(body.delivery_id || ""))) return [400, { error: "delivery_id must be a delivery uuid" }];
  if (body.confirm !== true) return [400, { error: "Replay must be confirmed (confirm: true)." }];
  if (!isoOk(body.expected_updated_at)) return [400, { error: "expected_updated_at (the version you were shown) is required" }];

  const since = new Date(Date.now() - 60e3).toISOString();
  const recent = await count(`dispatcher_runs?trigger=eq.replay&started_at=gte.${enc(since)}&select=id&limit=1`);
  if (recent >= REPLAY_LIMIT) return [429, { error: `Replay limit reached (${REPLAY_LIMIT} a minute across all admins). Wait and try again.` }];

  const x = await loadDelivery(body.delivery_id);
  if (!x) return [404, { error: "No such delivery." }];
  const verdict = assessReplay(x);
  if (!verdict.allowed) return [409, { error: "not_replayable", reason: verdict.reason, status: x.delivery.status }];
  if (Date.parse(x.delivery.updated_at) !== Date.parse(body.expected_updated_at)) {
    return [409, { error: "changed", reason: "This delivery changed since you loaded it. Reload and check it again.", status: x.delivery.status }];
  }

  // Compare-and-set: only the dead row, at exactly the version the admin saw.
  const now = new Date().toISOString();
  const r = await serviceRest(`event_deliveries?id=eq.${x.delivery.id}&status=eq.dead&updated_at=eq.${enc(x.delivery.updated_at)}`, {
    method: "PATCH", prefer: "return=representation",
    body: { status: "pending", next_attempt_at: now, locked_at: null, lease_expires_at: null, locked_by: null, updated_at: now },
  });
  if (!r.ok) return [502, { error: `Replay failed (${r.status}). Nothing was changed.` }];
  const changed = (await r.json().catch(() => [])) || [];
  if (!changed.length) return [409, { error: "changed", reason: "Already replayed, or changed at the same moment. Nothing was redispatched twice." }];

  const audit = await serviceRest("dispatcher_runs", {
    method: "POST", prefer: "return=minimal",
    body: { worker: `replay:${admin.userId}`, trigger: "replay", finished_at: now, summary: {
      delivery_id: x.delivery.id, event_id: x.delivery.event_id, listener: x.delivery.listener,
      publication_id: x.event.publication_id, company_id: x.event.company_id, event_type: x.event.event_type,
      by: admin.userId, by_email: admin.email || null,
      previous: { status: x.delivery.status, attempts: x.delivery.attempts, last_error: x.delivery.last_error ? String(x.delivery.last_error).slice(0, 300) : null },
    } },
  }).catch(() => null);
  const nudge = await invokeDispatchBestEffort();
  return [200, { ok: true, delivery: { id: changed[0].id, status: changed[0].status, attempts: changed[0].attempts, updated_at: changed[0].updated_at },
    warnings: verdict.warnings, audit_recorded: !!(audit && audit.ok), nudged: !!nudge.dispatched }];
}

async function alertAction(admin, body) {
  const condition = String(body.condition || "");
  if (!/^[a-z_]{1,64}$/.test(condition)) return [400, { error: "condition is required" }];
  const row = (await rows(`ops_alerts?condition=eq.${condition}&select=*`))[0];
  if (!row) return [404, { error: "No such alert." }];
  const now = new Date().toISOString();
  if (row.resolved_at) return [200, { ok: true, already: "resolved", alert: row }];
  if (body.action === "acknowledge") {
    if (row.detail && row.detail.acknowledged_at) return [200, { ok: true, already: "acknowledged", alert: row }];
    const detail = { ...(row.detail || {}), acknowledged_at: now, acknowledged_by: admin.email || admin.userId };
    const r = await serviceRest(`ops_alerts?condition=eq.${condition}&resolved_at=is.null`, { method: "PATCH", prefer: "return=representation", body: { detail } });
    if (!r.ok) return [502, { error: `Could not acknowledge (${r.status}).` }];
    return [200, { ok: true, alert: ((await r.json().catch(() => [])) || [])[0] || null }];
  }
  // resolve: only when the condition no longer holds. Otherwise the next run
  // would raise it again at once, and a "resolved" that isn't is a lie.
  const conds = await outboxConditions();
  if (conds[condition] && conds[condition].active) {
    return [409, { error: "still_active", reason: `The condition still holds (${JSON.stringify(conds[condition].detail)}). Fix or replay the deliveries, or acknowledge the alert to stop reminders.` }];
  }
  const detail = { ...(row.detail || {}), resolved_by: admin.email || admin.userId };
  delete detail.acknowledged_at; delete detail.acknowledged_by;
  const r = await serviceRest(`ops_alerts?condition=eq.${condition}&resolved_at=is.null`, { method: "PATCH", prefer: "return=representation", body: { resolved_at: now, detail } });
  if (!r.ok) return [502, { error: `Could not resolve (${r.status}).` }];
  return [200, { ok: true, alert: ((await r.json().catch(() => [])) || [])[0] || null }];
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const admin = await requireAdmin(req, res);   // 401 / 403 / 502 sent on refusal
  if (!admin) return;
  if (!serviceConfigured()) return res.status(500).json({ error: "Server not configured." });
  res.setHeader("Cache-Control", "no-store");
  try {
    let out;
    if (req.method === "GET") {
      const q = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);
      const view = String(q.view || "summary");
      if (view === "summary") out = [200, await summaryView()];
      else if (view === "deliveries") out = await deliveriesView(q);
      else if (view === "delivery") out = await deliveryView(q);
      else if (view === "history") out = await historyView(q);
      else out = [400, { error: "view must be summary, deliveries, delivery or history" }];
    } else {
      const body = (req.body && typeof req.body === "object") ? req.body : {};
      if (body.action === "replay") out = await replay(admin, body);
      else if (body.action === "acknowledge" || body.action === "resolve") out = await alertAction(admin, body);
      else out = [400, { error: "action must be replay, acknowledge or resolve" }];
    }
    return res.status(out[0]).json(out[1]);
  } catch (e) {
    // A missing 0071 table reads as 404/42P01 from PostgREST: say so plainly.
    const missing = e && (e.status === 404 || /42P01|PGRST20/.test(String(e.message)));
    return res.status(missing ? 503 : 500).json({ error: missing ? "Delivery operations need migration 0071 (dispatcher_runs, ops_alerts)." : "Delivery operations failed to load." });
  }
}
