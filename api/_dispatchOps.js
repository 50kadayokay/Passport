// Dispatcher heartbeat, alerting and health (D22 Phase 3).
//
// Tables from migration 0071 (service-role only): dispatcher_runs (one row per
// run) and ops_alerts (one row per condition). Every function here is
// best-effort where it must be -- a monitoring write that fails is logged and
// never stops delivery -- and strict where it matters: health answers 503 when
// it cannot prove the dispatcher ran recently.
//
// ALERT CONDITIONS (evaluated at the end of every run):
//   dead_deliveries   a delivery exhausted its retries (status dead)
//   stuck_leases      a lease expired without completion (a run died mid-batch)
//   backlog_age       a due delivery has waited longer than BACKLOG_ALERT_SECONDS
// One email per condition per ALERT_RESEND_MINUTES while it holds, and one when
// it resolves, to OPS_ALERT_TO through the existing Postmark path. Without
// OPS_ALERT_TO (or Postmark) the alert is RECORDED in ops_alerts only.
// A platform admin can ACKNOWLEDGE an open alert (api/ops.js): reminders stop
// until it resolves; the acknowledgement is kept in detail while it holds and
// dropped on resolution, so a recurrence is a fresh, unacknowledged alert.
// A STOPPED dispatcher cannot alert about itself: that is what health is for --
// an external monitor polls it and pages when it returns 503.

import { serviceRest } from "./_service.js";

export const BACKLOG_ALERT_SECONDS = 300;
export const ALERT_RESEND_MINUTES = 60;
export const HEALTH_MAX_AGE_SECONDS = 180;   // a per-minute schedule may miss a run (Vercel: best effort)
// dispatcher_runs triggers that are real dispatch runs. api/ops.js also records
// each manual replay there (trigger 'replay') as its audit trail; those rows
// are NOT runs and must never count as a heartbeat.
export const RUN_TRIGGERS = ["cron", "nudge", "manual"];
const RUNS = `trigger=in.(${RUN_TRIGGERS.join(",")})`;

const rows = async (r) => (r && r.ok ? (await r.json().catch(() => [])) || [] : null);

export async function recordRunStart(worker, trigger) {
  try {
    const r = await serviceRest("dispatcher_runs", { method: "POST", prefer: "return=representation", body: { worker, trigger } });
    const out = await rows(r);
    return out && out[0] ? out[0].id : null;
  } catch { return null; }
}

export async function recordRunFinish(runId, summary) {
  if (!runId) return false;
  try {
    const r = await serviceRest(`dispatcher_runs?id=eq.${runId}`, { method: "PATCH", prefer: "return=minimal", body: { finished_at: new Date().toISOString(), summary } });
    return r.ok;
  } catch { return false; }
}

async function count(path) {
  const r = await serviceRest(path, { prefer: "count=exact" });
  if (!r.ok) throw new Error(`count failed (${r.status})`);
  const cr = r.headers.get("content-range") || "";
  const n = Number(cr.split("/")[1]);
  return Number.isFinite(n) ? n : 0;
}

/** The current outbox conditions, read as the service role. */
export async function outboxConditions(now = Date.now()) {
  const iso = (ms) => encodeURIComponent(new Date(ms).toISOString());
  const dead = await count(`event_deliveries?status=eq.dead&select=id&limit=1`);
  const stuck = await count(`event_deliveries?status=eq.processing&lease_expires_at=lt.${iso(now)}&select=id&limit=1`);
  const oldest = await rows(await serviceRest(`event_deliveries?status=in.(pending,failed)&next_attempt_at=lte.${iso(now)}&select=next_attempt_at&order=next_attempt_at.asc&limit=1`));
  const oldestSeconds = oldest && oldest[0] ? Math.max(0, Math.round((now - Date.parse(oldest[0].next_attempt_at)) / 1000)) : 0;
  return {
    dead_deliveries: { active: dead > 0, detail: { dead } },
    stuck_leases: { active: stuck > 0, detail: { stuck } },
    backlog_age: { active: oldestSeconds > BACKLOG_ALERT_SECONDS, detail: { oldest_due_seconds: oldestSeconds } },
  };
}

async function sendOpsEmail(subject, text) {
  const to = process.env.OPS_ALERT_TO, token = process.env.POSTMARK_SERVER_TOKEN, from = process.env.MESSAGES_FROM_EMAIL;
  if (!to || !token || !from) return { emailed: false, reason: "ops email not configured" };
  try {
    const r = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: { "content-type": "application/json", Accept: "application/json", "X-Postmark-Server-Token": token },
      body: JSON.stringify({ From: from, To: to, Subject: subject, TextBody: text, MessageStream: "outbound" }),
    });
    return { emailed: r.ok, status: r.status };
  } catch (e) { return { emailed: false, reason: String(e && e.message || e).slice(0, 120) }; }
}

/**
 * Record and notify. Returns { condition: "raised" | "reminded" | "held" | "resolved" | "clear" }.
 * Never throws: monitoring must not break delivery.
 */
export async function evaluateAlerts(now = Date.now()) {
  const out = {};
  let conds;
  try { conds = await outboxConditions(now); } catch (e) { return { error: String(e.message || e) }; }
  const existing = (await rows(await serviceRest(`ops_alerts?select=condition,first_seen,last_sent,resolved_at,detail`))) || [];
  for (const [condition, { active, detail }] of Object.entries(conds)) {
    try {
      const row = existing.find((x) => x.condition === condition);
      const open = row && !row.resolved_at;
      if (active) {
        const ack = open && row.detail && row.detail.acknowledged_at ? { acknowledged_at: row.detail.acknowledged_at, acknowledged_by: row.detail.acknowledged_by || null } : null;
        const due = !open || (!ack && (!row.last_sent || now - Date.parse(row.last_sent) >= ALERT_RESEND_MINUTES * 60 * 1000));
        let sent = null;
        if (due) sent = await sendOpsEmail(`[MineEx ops] ${condition}`, `Dispatcher alert: ${condition}\n${JSON.stringify(detail)}\nSince: ${open ? row.first_seen : new Date(now).toISOString()}`);
        const body = { condition, detail: ack ? { ...detail, ...ack } : detail, resolved_at: null, ...(open ? {} : { first_seen: new Date(now).toISOString() }), ...(due ? { last_sent: new Date(now).toISOString() } : {}) };
        await serviceRest(`ops_alerts?on_conflict=condition`, { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body });
        out[condition] = open ? (due ? "reminded" : "held") : "raised";
        if (sent) out[`${condition}_email`] = sent.emailed ? "sent" : sent.reason || `status ${sent.status}`;
      } else if (open) {
        const sent = await sendOpsEmail(`[MineEx ops] resolved: ${condition}`, `Dispatcher alert resolved: ${condition}\nOpen since: ${row.first_seen}`);
        await serviceRest(`ops_alerts?condition=eq.${condition}`, { method: "PATCH", prefer: "return=minimal", body: { resolved_at: new Date(now).toISOString(), detail } });
        out[condition] = "resolved";
        out[`${condition}_email`] = sent.emailed ? "sent" : sent.reason || `status ${sent.status}`;
      } else out[condition] = "clear";
    } catch (e) { out[condition] = `error: ${String(e.message || e).slice(0, 80)}`; }
  }
  return out;
}

/** Liveness for an external monitor: 200 when a run finished recently, else 503. */
export async function dispatcherHealth(now = Date.now()) {
  const last = await rows(await serviceRest(`dispatcher_runs?${RUNS}&finished_at=not.is.null&select=started_at,finished_at,trigger&order=finished_at.desc&limit=1`));
  if (last === null) return { status: 503, body: { ok: false, reason: "heartbeat unreadable (is migration 0071 applied?)" } };
  const lastCron = await rows(await serviceRest(`dispatcher_runs?trigger=eq.cron&finished_at=not.is.null&select=finished_at&order=finished_at.desc&limit=1`));
  const ageOf = (r) => (r && r[0] ? Math.round((now - Date.parse(r[0].finished_at)) / 1000) : null);
  const age = ageOf(last), cronAge = ageOf(lastCron);
  const open = (await rows(await serviceRest(`ops_alerts?resolved_at=is.null&select=condition`))) || [];
  let conds = null; try { conds = await outboxConditions(now); } catch { /* reported as null */ }
  const fresh = age !== null && age <= HEALTH_MAX_AGE_SECONDS;
  return {
    status: fresh ? 200 : 503,
    body: { ok: fresh, last_run_age_seconds: age, last_cron_age_seconds: cronAge, last_trigger: last[0] ? last[0].trigger : null,
            open_alerts: open.map((o) => o.condition), conditions: conds && Object.fromEntries(Object.entries(conds).map(([k, v]) => [k, v.detail])) },
  };
}
