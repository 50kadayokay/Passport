// Listing-report rate limit status (migration 0093) for platform admins.
//
// 0093 caps direct listing_reports inserts from the installed 1.3.x apps:
// GLOBAL per window (form listing_report_db_global, key 'lr:global'), then per
// /24 or /48 NETWORK, then per CLIENT, all in 0057's submission_throttle. A
// refused insert rolls its own increments back, so a refusal leaves no trace;
// what is left is the counter itself. When the global cap trips, the current
// window's global counter equals listing_report_limits.global_per_window (it
// cannot pass it). Counters are pruned a day after their window, so the last
// day's windows are still readable: a cap that tripped while nobody was
// looking is still reported (recentCapHits).
//
// Read with the SERVICE ROLE only (both tables are revoked from clients). The
// counter keys are salted hashes; nothing here can show an address or a
// network, only counts.
//
// Used by api/ops.js (the summary and ?view=listing-reports) and by
// _dispatchOps.js (the 'listing_report_global_cap' alert condition).

import { serviceRest } from "./_service.js";

export const FORMS = { global: "listing_report_db_global", network: "listing_report_db_network", client: "listing_report_db_client" };
export const GLOBAL_KEY = "lr:global";
export const WARN_RATIO = 0.8;
export const ALERT_CONDITION = "listing_report_global_cap";
const DEFAULTS = { global_per_window: 600, global_window_minutes: 60, per_network: 20, network_window_minutes: 60 };

// The window a timestamp falls in, exactly as 0093's guard computes it:
// to_timestamp(floor(epoch / (minutes * 60)) * (minutes * 60)).
export function windowStart(nowMs, minutes) {
  const s = minutes * 60;
  return new Date(Math.floor(nowMs / 1000 / s) * s * 1000).toISOString();
}

/**
 * Pure: the status from what was read. Exported for tests.
 *   limits      the listing_report_limits row (or null: defaults)
 *   globalRows  [{ window_start, count }] for 'lr:global', the last day
 *   networkRows [{ count }] network counters in the current network window
 */
export function summarize({ limits, globalRows = [], networkRows = [], now = Date.now() }) {
  const l = { ...DEFAULTS, ...(limits || {}) };
  const win = windowStart(now, l.global_window_minutes);
  const at = (iso) => Date.parse(iso);
  const current = globalRows.filter((r) => at(r.window_start) === at(win)).reduce((n, r) => n + (Number(r.count) || 0), 0);
  const capHit = current >= l.global_per_window;
  const warn = !capHit && current >= Math.ceil(l.global_per_window * WARN_RATIO);
  const recentCapHits = globalRows
    .filter((r) => (Number(r.count) || 0) >= l.global_per_window && at(r.window_start) !== at(win))
    .map((r) => new Date(at(r.window_start)).toISOString())
    .sort().reverse();
  const nets = networkRows.map((r) => Number(r.count) || 0).sort((a, b) => b - a);
  return {
    available: true,
    windowStart: win,
    windowMinutes: l.global_window_minutes,
    globalCount: current,
    globalLimit: l.global_per_window,
    ratio: l.global_per_window ? Math.round((current / l.global_per_window) * 100) / 100 : 0,
    capHit, warn,
    recentCapHits,
    networkHotspots: {
      limit: l.per_network, windowMinutes: l.network_window_minutes,
      atLimit: nets.filter((n) => n >= l.per_network).length,
      top: nets.slice(0, 5),
    },
  };
}

const read = async (path) => {
  const r = await serviceRest(path);
  if (!r.ok) { const e = new Error(`read failed (${r.status})`); e.status = r.status; throw e; }
  return (await r.json().catch(() => [])) || [];
};

/** The current status, read as the service role. Never throws. */
export async function listingReportStatus(now = Date.now()) {
  try {
    const [limits] = await read("listing_report_limits?id=eq.true&select=global_per_window,global_window_minutes,per_network,network_window_minutes");
    const l = { ...DEFAULTS, ...(limits || {}) };
    const dayAgo = encodeURIComponent(new Date(now - 24 * 3600 * 1000).toISOString());
    const globalRows = await read(`submission_throttle?form=eq.${FORMS.global}&ip_hash=eq.${encodeURIComponent(GLOBAL_KEY)}&window_start=gte.${dayAgo}&select=window_start,count&order=window_start.desc&limit=100`);
    const netWin = encodeURIComponent(windowStart(now, l.network_window_minutes));
    const floor = Math.max(1, Math.ceil(l.per_network * WARN_RATIO));
    const networkRows = await read(`submission_throttle?form=eq.${FORMS.network}&window_start=eq.${netWin}&count=gte.${floor}&select=count&order=count.desc&limit=200`);
    return summarize({ limits, globalRows, networkRows, now });
  } catch (e) {
    const missing = e && (e.status === 404 || /42P01|PGRST20/.test(String(e.message)));
    return { available: false, reason: missing ? "Listing-report limits need migration 0093." : "Listing-report limits could not be read." };
  }
}

/**
 * The alert condition for _dispatchOps.evaluateAlerts: active while the cap is
 * hit in the current window, or was hit in the previous one (so a run soon
 * after the hour still raises it). null when 0093 is not there.
 */
export async function listingReportCondition(now = Date.now()) {
  const s = await listingReportStatus(now);
  if (!s.available) return null;
  const prev = new Date(Date.parse(s.windowStart) - s.windowMinutes * 60 * 1000).toISOString();
  const active = s.capHit || s.recentCapHits.includes(prev);
  return { active, detail: { window_start: s.windowStart, global_count: s.globalCount, global_limit: s.globalLimit, previous_window_hit: s.recentCapHits.includes(prev), networks_at_limit: s.networkHotspots.atLimit } };
}
