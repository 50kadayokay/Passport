// a21 regression tests -- bespoke service requests.
//   node scripts/service-requests-test.mjs
//
// OFFLINE. Runs the real api/service-request.js against a mocked Supabase
// (auth, my_company_role, profiles, service_requests, companies) and a mocked
// Postmark. The database rules (0086: who may create, admin-only status changes,
// the stamping trigger, isolation) are proven against staging, rolled back, by
// scripts/service-requests-0086-check.mjs.

import fs from "node:fs";

process.env.VITE_SUPABASE_URL = "https://offline-test.supabase.co";   // never contacted: fetch is stubbed
process.env.POSTMARK_SERVER_TOKEN = "offline-test";
process.env.MESSAGES_FROM_EMAIL = "noreply@example.test";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

const CO = "11111111-1111-4111-8111-111111111111";
const TOKENS = {
  owner: { id: "u-owner", email: "owner@a.test", role: "owner" },
  editor: { id: "u-editor", email: "ed@a.test", role: "editor" },
  viewer: { id: "u-viewer", email: "view@a.test", role: "viewer" },
  analyst: { id: "u-analyst", email: "an@a.test", role: "analyst" },
  other: { id: "u-other", email: "b@b.test", role: null },
  padmin: { id: "u-padmin", email: "ops@mineex.test", role: null, platform: true },
};

const state = { table: "ok", insertReply: null, postmark: 200, mails: [], inserts: [] };
globalThis.fetch = async (url, o = {}) => {
  const u = String(url);
  const tok = String((o.headers && o.headers.Authorization) || "").replace("Bearer ", "");
  const who = TOKENS[tok];
  const J = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
  if (u.startsWith("https://api.postmarkapp.com/")) { state.mails.push(JSON.parse(o.body)); return J(state.postmark, {}); }
  if (u.endsWith("/auth/v1/user")) return who ? J(200, { id: who.id, email: who.email }) : J(401, { msg: "bad jwt" });
  if (u.endsWith("/rest/v1/rpc/my_company_role")) return J(200, who && JSON.parse(o.body).cid === CO ? who.role : null);
  if (u.includes("/rest/v1/profiles?")) return J(200, [{ role: who && who.platform ? "admin" : "investor" }]);
  if (u.includes("/rest/v1/companies?")) return J(200, [{ name: "Company A", slug: "company-a" }]);
  if (u.includes("/rest/v1/service_requests")) {
    state.inserts.push({ tok, body: JSON.parse(o.body) });
    if (state.table === "missing") return J(404, { message: "relation does not exist" });
    if (state.table === "burst") return J(400, { code: "54000", message: "too many service requests today for this company" });
    if (state.table === "rls") return J(403, { code: "42501", message: "new row violates row-level security policy" });
    const b = JSON.parse(o.body);
    return J(201, [{ id: "req-1", company_id: b.company_id, service: b.service, details: b.details, status: "requested", admin_note: "", history: [{ status: "requested" }] }]);
  }
  throw new Error(`unexpected fetch ${u}`);
};

const { default: handler, SERVICE_LABEL, REQUEST_ROLES } = await import("../api/service-request.js");
const call = async ({ method = "POST", token, body }) => {
  const req = { method, headers: token ? { authorization: `Bearer ${token}` } : {}, body };
  const res = { code: 0, body: undefined, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; }, setHeader(k, v) { this.headers[k] = v; } };
  await handler(req, res); return res;
};

console.log("\n  CREATE: who may ask");
{
  let r = await call({ method: "GET", token: "owner" });
  ok(r.code === 405, "GET refused");
  r = await call({ body: { companyId: CO, service: "websites" } });
  ok(r.code === 401, "signed out -> 401");
  r = await call({ token: "owner", body: { companyId: CO, service: "yachts" } });
  ok(r.code === 400 && state.inserts.length === 0, "unknown service -> 400, nothing stored");
  for (const role of ["viewer", "analyst"]) {
    r = await call({ token: role, body: { companyId: CO, service: "websites", details: "x" } });
    ok(r.code === 403 && state.inserts.length === 0, `${role} -> 403 (read only), nothing stored`);
  }
  r = await call({ token: "other", body: { companyId: CO, service: "websites" } });
  ok(r.code === 403 && state.inserts.length === 0, "another company's member -> 403");
  r = await call({ token: "owner", body: { companyId: "not-a-uuid", service: "websites" } });
  ok(r.code === 400, "malformed companyId -> 400");
}

console.log("\n  CREATE: stored as the caller, support emailed");
{
  state.mails = []; state.inserts = [];
  let r = await call({ token: "editor", body: { companyId: CO, service: "photography", details: "Site visit in March", status: "done", admin_note: "free", requested_by: "u-x" } });
  ok(r.code === 201 && r.body.request.status === "requested" && r.body.emailed === true, "editor creates a request (201, requested, emailed)", JSON.stringify(r.body));
  const ins = state.inserts[0] || { body: {} };
  ok(ins.tok === "editor", "the insert carries the caller's JWT (RLS decides), not the service key");
  ok(JSON.stringify(Object.keys(ins.body).sort()) === JSON.stringify(["company_id", "details", "service"]), "only company_id/service/details are sent (status, note and author are the database's)", JSON.stringify(ins.body));
  const m = state.mails[0] || {};
  ok(m.To === "support@mineex.ca" && /Photography — Company A/.test(m.Subject) && m.ReplyTo === "ed@a.test" && /Site visit in March/.test(m.TextBody), "support email names the service, the company, the details; reply-to the requester", JSON.stringify(m).slice(0, 200));
  ok(/^MineEx Services </.test(m.From || ""), "sent as MineEx Services");
  state.inserts = [];
  r = await call({ token: "owner", body: { companyId: CO, service: "brand", details: "y".repeat(5000) } });
  ok(r.code === 201 && state.inserts[0].body.details.length === 4000, "details capped at 4000 characters (the database limit)");
  r = await call({ token: "padmin", body: { companyId: CO, service: "managed" } });
  ok(r.code === 201 && /platform admin/.test(state.mails.at(-1).TextBody), "a platform admin may file one on a company's behalf (marked as such)");
  state.postmark = 500;
  r = await call({ token: "owner", body: { companyId: CO, service: "conference" } });
  ok(r.code === 201 && r.body.emailed === false, "email fails -> request still stored, emailed:false");
  state.postmark = 200;
}

console.log("\n  CREATE: database refusals surface plainly");
{
  state.table = "missing";
  let r = await call({ token: "owner", body: { companyId: CO, service: "websites" } });
  ok(r.code === 503, "0086 not applied -> 503 (the page falls back to email)");
  state.table = "burst";
  r = await call({ token: "owner", body: { companyId: CO, service: "websites" } });
  ok(r.code === 429, "21st request in a day -> 429");
  state.table = "rls";
  r = await call({ token: "owner", body: { companyId: CO, service: "websites" } });
  ok(r.code === 403, "RLS refusal -> 403");
  state.table = "ok";
}

console.log("\n  CONTRACT: one vocabulary across database, API and UI");
{
  const sql = fs.readFileSync("supabase/migrations/0086_service_requests.sql", "utf8");
  const lib = fs.readFileSync("src/lib/serviceRequests.js", "utf8");
  const page = fs.readFileSync("src/portal/Services.jsx", "utf8");
  const ids = Object.keys(SERVICE_LABEL);
  ok(ids.every((id) => sql.includes(`'${id}'`)) && ids.every((id) => page.includes(`id: "${id}"`)), "every service id is in the 0086 check and on the Services page");
  ok(["requested", "in_review", "quoted", "in_progress", "done"].every((s) => sql.includes(`'${s}'`) && lib.includes(`"${s}"`)), "the five statuses match the database check");
  ok(sql.includes("array['owner', 'admin', 'editor', 'publisher']") && JSON.stringify(REQUEST_ROLES) === JSON.stringify(["owner", "admin", "editor", "publisher"]), "who may ask matches the 0086 insert policy");
  ok(!/checkout|price:|amount|stripe/i.test(page.replace(/Nothing is ordered or charged[^"]*/g, "").replace(/checkout would be a promise/g, "")), "the page promises no checkout or price");
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
