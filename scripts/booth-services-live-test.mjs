// a17 + a21 LIVE on STAGING (migrations 0085, 0086), through the real API with
// the requests the portal and booth send (src/lib/conference.js publishBoothLook /
// fetchBoothRecord, /api/conference-config as the booth fetches it;
// src/lib/serviceRequests.js createRequest / listCompanyRequests / listAllRequests
// / updateRequest).
//   node scripts/booth-services-live-test.mjs [apiBase=http://127.0.0.1:8899]
//
// WHAT IT WRITES (staging only): one throwaway company "zz-s2-<run>" (owner =
// company A's owner; editor, analyst and viewer fixtures as members), its booth
// config and service requests. Removed with the company at the end (it never
// publishes). The support email is answered by the staging egress mock.
import fs from "node:fs";
import pg from "pg";

const API = (process.argv[2] || "http://127.0.0.1:8899").replace(/\/+$/, "");
const rd = (f) => Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const iso = rd("supabase/staging/.isolation-env");
const SB = iso.ISOLATION_SUPABASE_URL.replace(/\/+$/, ""), ANON = iso.ISOLATION_ANON_KEY;
const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (!/jmljfovtfxcdhjmtlnva/.test(SB) || /rvptronniomlqumjhyrr/.test(SB) || !url.includes("jmljfovtfxcdhjmtlnva") || url.includes("rvptronniomlqumjhyrr")) { console.error("  REFUSING: not the staging project"); process.exit(2); }
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(API)) { console.error("  REFUSING: the API base must be the local staging API server"); process.exit(2); }

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const pgc = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await pgc.connect();
const q = async (s, a) => (await pgc.query(s, a)).rows;
const one = async (s, a) => (await q(s, a))[0];
const signIn = async (key) => {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email: iso[`ISOLATION_${key}_EMAIL`], password: iso[`ISOLATION_${key}_PASS`] }) });
  const j = r.ok ? await r.json() : null;
  return j ? { token: j.access_token, id: j.user.id } : null;
};
const W = {};
for (const k of ["COMPANY_A", "EDITOR", "ANALYST", "STAFF", "COMPANY_B", "INVESTOR", "ADMIN"]) W[k] = await signIn(k);
if (Object.values(W).some((v) => !v)) { console.error("  fixture sign-in failed"); process.exit(3); }
const rest = async (u, path, init = {}) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: ANON, "content-type": "application/json", Authorization: `Bearer ${u ? u.token : ANON}`, ...(init.headers || {}) } });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b };
};
const publishLook = (u, look) => rest(u, "conference_booth_configs?on_conflict=company_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ company_id: X, studio: look }) });
const boothFetch = async () => { const r = await fetch(`${API}/api/conference-config?c=${SLUG}`); return { status: r.status, body: r.status === 200 ? await r.json() : null, cache: r.headers.get("cache-control") }; };
const createReq = async (u, service, details) => { const r = await fetch(`${API}/api/service-request`, { method: "POST", headers: { "content-type": "application/json", ...(u ? { Authorization: `Bearer ${u.token}` } : {}) }, body: JSON.stringify({ companyId: X, service, details }) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const listReqs = (u) => rest(u, `service_requests?company_id=eq.${X}&select=id,service,details,status,admin_note,history,created_at,status_changed_at&order=created_at.desc&limit=100`);
const patchReq = (u, id, patch) => rest(u, `service_requests?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });

const RUN = Date.now().toString(36);
const SLUG = `zz-s2-${RUN}`;
let X = null;
try {
  console.log("\n  FIXTURE");
  await q(`select set_config('app.provisioning', 'on', false)`);
  X = (await one(`insert into public.companies (slug, name, owner_id, status, tier) values ($1, 'S2 Booth Services', $2, 'published', 'pro') returning id`, [SLUG, W.COMPANY_A.id])).id;
  for (const [k, role] of [["EDITOR", "editor"], ["ANALYST", "analyst"], ["STAFF", "viewer"]]) await q(`insert into public.company_memberships (company_id, user_id, role, status) values ($1, $2, $3, 'active')`, [X, W[k].id, role]);
  ok(!!X, "throwaway company with owner, editor, analyst, viewer");

  console.log("\n  a17 · BOOTH LOOK AS A PUBLISHED RECORD");
  let b = await boothFetch();
  ok(b.status === 204, "before anything is published, the booth gets 204 and keeps its compiled look", `${b.status}`);
  for (const who of ["COMPANY_A", "EDITOR", "INVESTOR"]) {
    const r = await publishLook(W[who], { template: "v3", theme: "dark", accent: "#c9a227" });
    ok(r.status >= 400 && !(await one(`select 1 x from public.conference_booth_configs where company_id = $1`, [X])), `${who === "COMPANY_A" ? "the company owner" : who.toLowerCase()} cannot publish a booth look (platform admins only)`, `${r.status}`);
  }
  let r = await publishLook(W.ADMIN, { template: "v3", theme: "dark", accent: "#c9a227", evil: "<script>", template2: "x" });
  ok(r.status === 201 || r.status === 200, "a platform admin publishes the look (Conference Studio)", `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
  const row = await one(`select studio, version from public.conference_booth_configs where company_id = $1`, [X]);
  ok(row && row.version === 1 && JSON.stringify(Object.keys(row.studio).sort()) === JSON.stringify(["accent", "template", "theme"]), "stored as version 1, unknown keys stripped by the database", JSON.stringify(row));
  b = await boothFetch();
  ok(b.status === 200 && b.body.studio.theme === "dark" && b.body.version === 1 && /max-age=30/.test(b.cache || ""), "the booth (signed out) fetches the published look, cacheable for 30 s", JSON.stringify(b).slice(0, 160));
  r = await publishLook(W.ADMIN, { template: "v3", theme: "light", accent: "#c9a227" });
  b = await boothFetch();
  ok(b.status === 200 && b.body.studio.theme === "light" && b.body.version === 2, "a change reaches the booth without a redeploy (version 2)");
  r = await publishLook(W.ADMIN, { template: "v3", theme: "light", accent: "#c9a227" });
  ok((await one(`select version from public.conference_booth_configs where company_id = $1`, [X])).version === 2, "re-publishing the same look does not bump the version");
  for (const who of ["COMPANY_A", "STAFF"]) {
    r = await rest(W[who], `conference_booth_configs?company_id=eq.${X}&select=studio,version`);
    ok(Array.isArray(r.body) && r.body.length === 1, `a company ${who === "STAFF" ? "viewer" : "owner"} reads its booth record (portal Conference page)`);
  }
  r = await rest(W.COMPANY_B, `conference_booth_configs?company_id=eq.${X}&select=studio`);
  ok(Array.isArray(r.body) && r.body.length === 0, "another company cannot read it through the table");
  b = await fetch(`${API}/api/conference-config?c=NOT%20A%20SLUG`);
  ok(b.status === 400, "a malformed slug is refused (400)");

  console.log("\n  a21 · BESPOKE SERVICE REQUESTS");
  r = await createReq(null, "brand", "x");
  ok(r.status === 401, "signed out cannot request (401)", `${r.status}`);
  for (const [who, code] of [["ANALYST", 403], ["STAFF", 403], ["COMPANY_B", 403], ["INVESTOR", 403]]) {
    r = await createReq(W[who], "brand", "x");
    ok(r.status === code, `${who.toLowerCase()} cannot request a service for this company (${code})`, `${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
  }
  r = await createReq(W.EDITOR, "nope", "x");
  ok(r.status === 400, "an unknown service is refused (400)");
  r = await createReq(W.EDITOR, "brand", `New logo please ${RUN}`);
  const req1 = r.body.request;
  ok(r.status === 201 && req1 && req1.status === "requested" && Array.isArray(req1.history) && req1.history.length === 1, "an editor requests Brand & Logo Design; it starts as 'requested' with one history entry", `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
  ok(r.body.emailed === true, "the support inbox is notified (staging mock)", JSON.stringify(r.body.emailed));
  const raw = await rest(W.EDITOR, "service_requests", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: X, service: "photography", details: "direct", status: "done", admin_note: "forged" }) });
  ok(raw.status >= 400, "a client cannot insert a request with its own status or admin note (column grants)", `${raw.status}`);
  for (const who of ["COMPANY_A", "STAFF", "ANALYST"]) {
    r = await listReqs(W[who]);
    ok(Array.isArray(r.body) && r.body.some((x) => x.id === req1.id), `a company ${who === "STAFF" ? "viewer" : who === "ANALYST" ? "analyst" : "owner"} sees the request on the Services page`);
  }
  for (const who of ["COMPANY_B", "INVESTOR"]) {
    r = await listReqs(W[who]);
    ok(Array.isArray(r.body) && r.body.length === 0, `${who === "COMPANY_B" ? "another company" : "an investor"} sees none`);
  }
  r = await patchReq(W.COMPANY_A, req1.id, { status: "done" });
  ok(!(Array.isArray(r.body) && r.body.length) && (await one(`select status from public.service_requests where id = $1`, [req1.id])).status === "requested", "the company cannot move its own request's status");
  for (const s of ["in_review", "quoted", "in_progress", "done"]) {
    r = await patchReq(W.ADMIN, req1.id, { status: s, admin_note: s === "quoted" ? "Quote sent: 3 concepts" : undefined });
    ok(r.status === 200 && r.body[0]?.status === s, `a platform admin moves it to '${s}'`);
  }
  const fin = await one(`select history, admin_note from public.service_requests where id = $1`, [req1.id]);
  ok(fin.history.length === 5 && fin.history.map((h) => h.status).join(">") === "requested>in_review>quoted>in_progress>done" && fin.admin_note === "Quote sent: 3 concepts", "the history records every step in order, with the admin note");
  r = await patchReq(W.ADMIN, req1.id, { status: "shipped" });
  ok(r.status >= 400, "an unknown status is refused by the database");
  r = await rest(W.ADMIN, `service_requests?select=id,companies(name,slug)&company_id=eq.${X}`);
  ok(Array.isArray(r.body) && r.body.length === 1 && r.body[0].companies?.slug === SLUG, "the admin list shows the request with its company (Admin > Service requests)");
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  console.log("\n  CLEANUP");
  if (X) await q(`delete from public.companies where id = $1`, [X]).catch((e) => ok(false, "cleanup", e.message));
}
ok(!(await one(`select 1 x from public.companies where slug = $1`, [SLUG])) && !(await one(`select 1 x from public.service_requests where company_id = $1`, [X])) && !(await one(`select 1 x from public.conference_booth_configs where company_id = $1`, [X])), "throwaway company, its booth record and requests removed");
await pgc.end();
console.log(`\n  booth-services-live (staging): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
