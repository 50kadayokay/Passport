// The listing-report cap alert (migration 0093) in /api/ops and the ops alerts.
//   node scripts/listing-report-ops-test.mjs
//
// OFFLINE. The real handler and evaluateAlerts run against a stub Supabase
// (auth, profiles, listing_report_limits, submission_throttle, ops_alerts, the
// 0071 tables) and a stub Postmark. Covers:
//   - the status: capHit at the limit (and above it, after the limit is lowered),
//     not below; the 80% warning; recent cap hits from earlier windows; network
//     hotspots (counts only); windowStart computed exactly as 0093's guard does
//   - /api/ops: summary and ?view=listing-reports carry listingReports for a
//     platform admin; anon 401, company users and investors 403; without 0093 the
//     summary still loads and says so
//   - the alert: raised once with one email, held (no second email) within the
//     hour, still active the window after, resolved (one email) once a window
//     passes; resolve refused while it holds; absent without 0093
import fs from "node:fs";

const SB = "https://stub-project.supabase.invalid";
Object.assign(process.env, {
  VITE_SUPABASE_URL: SB, VITE_SUPABASE_ANON_KEY: "sb_publishable_offline_stub_key", SUPABASE_SERVICE_ROLE_KEY: "stub-service-key",
  POSTMARK_SERVER_TOKEN: "stub-postmark", MESSAGES_FROM_EMAIL: "noreply@stub.invalid", OPS_ALERT_TO: "ops@stub.invalid",
});
delete process.env.MINEEX_ENV;

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

const USERS = { "tok-admin": { id: "u-admin", email: "admin@stub.invalid", role: "admin" }, "tok-owner": { id: "u-owner", email: "owner@stub.invalid", role: "company" }, "tok-investor": { id: "u-inv", email: "inv@stub.invalid", role: "investor" } };
let T, mails;
const LIMITS = { id: true, per_client: 5, client_window_minutes: 10, per_network: 20, network_window_minutes: 60, global_per_window: 600, global_window_minutes: 60 };
function reset({ with0093 = true } = {}) {
  T = { event_deliveries: [], events: [], dispatcher_runs: [], ops_alerts: [], publications: [], companies: [] };
  if (with0093) { T.listing_report_limits = [{ ...LIMITS }]; T.submission_throttle = []; }
  mails = [];
}
const json = (o, s = 200, extra = {}) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", ...extra } });
const cmp = (a, b) => (typeof a === "number" || /^-?\d+(\.\d+)?$/.test(String(a))) && /^-?\d+(\.\d+)?$/.test(b) ? Number(a) - Number(b) : Date.parse(a) - Date.parse(b);
function filt(rows, sp) {
  return rows.filter((r) => {
    for (const [k, v] of sp) {
      if (["select", "order", "limit", "on_conflict"].includes(k)) continue;
      const i = v.indexOf("."); const op = v.slice(0, i), x = v.slice(i + 1), cur = r[k];
      if (op === "eq" && !(String(cur) === x || (k === "window_start" && Date.parse(cur) === Date.parse(x)))) return false;
      if (op === "is" && x === "null" && cur != null) return false;
      if (op === "not" && x === "is.null" && cur == null) return false;
      if (op === "in" && !x.replace(/[()]/g, "").split(",").includes(String(cur))) return false;
      if (op === "lt" && !(cmp(cur, x) < 0)) return false;
      if (op === "lte" && !(cmp(cur, x) <= 0)) return false;
      if (op === "gte" && !(cmp(cur, x) >= 0)) return false;
    }
    return true;
  });
}
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const method = (init.method || "GET").toUpperCase();
  const h = init.headers || {};
  if (url.host === "api.postmarkapp.com") { mails.push(JSON.parse(init.body)); return json({ MessageID: "m" }); }
  if (url.origin !== SB) throw new Error(`unexpected egress to ${url.host}`);
  const token = String(h.Authorization || "").replace(/^Bearer /, "");
  if (url.pathname === "/auth/v1/user") return USERS[token] ? json({ id: USERS[token].id, email: USERS[token].email }) : json({ msg: "bad jwt" }, 401);
  const sp = url.searchParams, p = url.pathname.replace("/rest/v1/", "");
  if (p === "profiles") { const u = Object.values(USERS).find((x) => `eq.${x.id}` === sp.get("id")); return json(u && USERS[token] && USERS[token].id === u.id ? [{ role: u.role }] : []); }
  if (token !== "stub-service-key") return json({ message: "permission denied" }, 401);
  const t = T[p]; if (!t) return json({ code: "42P01", message: `relation "public.${p}" does not exist` }, 404);
  const body = typeof init.body === "string" && init.body ? JSON.parse(init.body) : null;
  const prefer = String(h.Prefer || "");
  if (method === "GET") {
    let out = filt(t, sp);
    const ord = sp.get("order"); if (ord) { const [c, d] = ord.split(",")[0].split("."); out = out.slice().sort((a, b) => (cmp(a[c], String(b[c])) < 0 ? -1 : 1) * (d === "desc" ? -1 : 1)); }
    const total = out.length; const lim = sp.get("limit"); if (lim) out = out.slice(0, +lim);
    return json(out, 200, /count=exact/.test(prefer) ? { "content-range": `0-${Math.max(0, out.length - 1)}/${total}` } : {});
  }
  if (method === "POST") {
    const key = sp.get("on_conflict");
    for (const b of Array.isArray(body) ? body : [body]) {
      const hit = key && t.find((r) => r[key] === b[key]);
      if (hit) Object.assign(hit, b); else t.push({ ...b });
    }
    return json([], 201);
  }
  if (method === "PATCH") { const hit = filt(t, sp); for (const r of hit) Object.assign(r, body); return json(/representation/.test(prefer) ? hit : [], 200); }
  return json({ message: "unsupported" }, 405);
};

const L = await import("../api/_listingReportOps.js");
const { evaluateAlerts } = await import("../api/_dispatchOps.js");
const { default: ops } = await import("../api/ops.js");
const call = async (token, query = {}, method = "GET", body = null) => {
  let status = 0, out = null;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json(o) { out = o; return this; } };
  await ops({ method, query, body, headers: token ? { authorization: `Bearer ${token}` } : {}, url: "/api/ops" }, res);
  return { status, body: out };
};
const H = 3600 * 1000;
const NOW = Date.parse("2026-11-02T14:37:12Z");
const win = (ms) => L.windowStart(ms, 60);
const g = (ms, count) => ({ ip_hash: "lr:global", form: L.FORMS.global, window_start: win(ms), count });

console.log("\n  THE STATUS (pure)");
ok(L.windowStart(NOW, 60) === "2026-11-02T14:00:00.000Z" && L.windowStart(NOW, 10) === "2026-11-02T14:30:00.000Z", "windowStart is 0093's to_timestamp(floor(epoch / w) * w)");
let s = L.summarize({ limits: LIMITS, globalRows: [g(NOW, 600)], now: NOW });
ok(s.capHit && !s.warn && s.globalCount === 600 && s.globalLimit === 600 && s.windowStart === "2026-11-02T14:00:00.000Z", "count = limit: capHit");
s = L.summarize({ limits: { ...LIMITS, global_per_window: 100 }, globalRows: [g(NOW, 250)], now: NOW });
ok(s.capHit, "count above the limit (the limit was lowered mid-window): capHit");
s = L.summarize({ limits: LIMITS, globalRows: [g(NOW, 599)], now: NOW });
ok(!s.capHit && s.warn, "599 of 600: not hit, warning");
s = L.summarize({ limits: LIMITS, globalRows: [g(NOW, 480)], now: NOW });
ok(!s.capHit && s.warn && s.ratio === 0.8, "480 of 600 (80%): warning");
s = L.summarize({ limits: LIMITS, globalRows: [g(NOW, 479)], now: NOW });
ok(!s.capHit && !s.warn, "479 of 600: neither");
s = L.summarize({ limits: LIMITS, globalRows: [], now: NOW });
ok(!s.capHit && !s.warn && s.globalCount === 0, "no counter this window: 0, quiet");
s = L.summarize({ limits: LIMITS, globalRows: [g(NOW, 3), g(NOW - H, 600), g(NOW - 5 * H, 600), g(NOW - 6 * H, 12)], now: NOW });
ok(!s.capHit && JSON.stringify(s.recentCapHits) === JSON.stringify([win(NOW - H), win(NOW - 5 * H)]), "earlier windows that filled are listed newest first; the current one is not", JSON.stringify(s.recentCapHits));
s = L.summarize({ limits: LIMITS, globalRows: [g(NOW, 10)], networkRows: [{ count: 20 }, { count: 16 }, { count: 20 }], now: NOW });
ok(s.networkHotspots.atLimit === 2 && JSON.stringify(s.networkHotspots.top) === "[20,20,16]" && s.networkHotspots.limit === 20, "network hotspots: how many are at their limit, top counts, nothing else");
s = L.summarize({ limits: null, globalRows: [g(NOW, 600)], now: NOW });
ok(s.capHit && s.globalLimit === 600, "no limits row: 0093's defaults (600 / 60 min)");
ok(!JSON.stringify(L.summarize({ limits: LIMITS, globalRows: [g(NOW, 1)], networkRows: [{ count: 20, ip_hash: "ln:abc" }], now: NOW })).includes("ln:abc"), "no counter key ever leaves the status");

console.log("\n  /api/ops: WHO SEES IT");
reset();
T.submission_throttle.push(g(Date.now(), 600));
for (const [who, token, want] of [["signed out", null, 401], ["a company user", "tok-owner", 403], ["an investor", "tok-investor", 403]]) {
  const a = await call(token), b = await call(token, { view: "listing-reports" });
  ok(a.status === want && b.status === want && !JSON.stringify([a.body, b.body]).includes("globalCount"), `${who}: ${want} for the summary and the view, no counts`);
}
let r = await call("tok-admin");
ok(r.status === 200 && r.body.listingReports && r.body.listingReports.capHit === true && r.body.listingReports.globalCount === 600, "a platform admin: the summary carries listingReports with capHit", JSON.stringify(r.body && r.body.listingReports));
r = await call("tok-admin", { view: "listing-reports" });
ok(r.status === 200 && r.body.listingReports.capHit === true && r.body.listingReports.globalLimit === 600, "?view=listing-reports answers the same");
r = await call("tok-admin", { view: "nonsense" });
ok(r.status === 400 && /listing-reports/.test(r.body.error), "an unknown view is a 400 that names listing-reports");
reset({ with0093: false });
r = await call("tok-admin");
ok(r.status === 200 && r.body.listingReports && r.body.listingReports.available === false && /0093/.test(r.body.listingReports.reason), "without 0093 the summary still loads and says what is missing", JSON.stringify(r.body && r.body.listingReports));

console.log("\n  THE ALERT (one email per window)");
reset();
const t0 = Date.now();
T.submission_throttle.push(g(t0, 600));
let out = await evaluateAlerts(t0);
const cap = () => T.ops_alerts.find((a) => a.condition === L.ALERT_CONDITION);
ok(out[L.ALERT_CONDITION] === "raised" && out[`${L.ALERT_CONDITION}_email`] === "sent" && mails.length === 1 && /listing_report_global_cap/.test(mails[0].Subject) && /refused/.test(mails[0].TextBody), "the cap hits: raised, one email to OPS_ALERT_TO", JSON.stringify(out));
ok(!/lr:|ln:/.test(mails[0].TextBody) && cap().detail.global_count === 600 && cap().detail.global_limit === 600, "the email and the alert carry counts only");
out = await evaluateAlerts(t0 + 20 * 60 * 1000);
ok(out[L.ALERT_CONDITION] === "held" && mails.length === 1, "20 minutes later, still full: held, no second email");
r = await call("tok-admin", {}, "POST", { action: "resolve", condition: L.ALERT_CONDITION });
ok(r.status === 409 && r.body.error === "still_active" && /window passes/.test(r.body.reason), "resolving while it holds is refused (409)", JSON.stringify(r.body));
out = await evaluateAlerts(t0 + H);
ok(out[L.ALERT_CONDITION] === "reminded" || out[L.ALERT_CONDITION] === "held", "the next window (cap was hit in the previous one): still active", out[L.ALERT_CONDITION]);
const mailsBefore = mails.length;
out = await evaluateAlerts(t0 + 2 * H + 60 * 1000);
ok(out[L.ALERT_CONDITION] === "resolved" && mails.length === mailsBefore + 1 && /resolved/.test(mails.at(-1).Subject) && cap().resolved_at, "two windows on, nothing full: resolved, one email");
reset();
T.submission_throttle.push(g(t0, 480));
out = await evaluateAlerts(t0);
ok(out[L.ALERT_CONDITION] === "clear" && !mails.length, "80% is a banner warning, not an alert email");
reset({ with0093: false });
out = await evaluateAlerts(t0);
ok(!(L.ALERT_CONDITION in out) && out.dead_deliveries === "clear" && !out.error, "without 0093 the condition is absent and the outbox conditions still evaluate", JSON.stringify(out));

console.log("\n  THE PAGE");
const page = fs.readFileSync("src/admin/DeliveryOps.jsx", "utf8");
ok(/function ListingReports\(\{ lr \}\)/.test(page) && /<ListingReports lr=\{s\.listingReports\} \/>/.test(page), "the Delivery operations page renders the listing-report status first");
ok(/lr\.capHit[\s\S]{0,200}role="alert"[\s\S]{0,120}bg-rose-600/.test(page) && /listing-reports-warn/.test(page), "a red alert banner when capHit, amber at 80%");

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
