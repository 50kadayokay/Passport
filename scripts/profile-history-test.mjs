// a05 regression tests -- revision history through /api/profile-draft, and the
// admin pruning rule that must never delete publish history.
//   node scripts/profile-history-test.mjs
//
// OFFLINE. The real route runs against a stub Supabase; the real
// src/lib/profileVersions.js pruneVersions() runs against a stub REST. The
// database's own rules (roles, retention trigger, restore-into-draft) are
// proven against staging by scripts/profile-history-0074-check.mjs.

import fs from "node:fs";

const SB = "https://stub-project.supabase.invalid";
Object.assign(process.env, { VITE_SUPABASE_URL: SB, VITE_SUPABASE_ANON_KEY: "sb_publishable_offline_stub_key", SUPABASE_SERVICE_ROLE_KEY: "stub-service-key" });
delete process.env.MINEEX_ENV;
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
store.set("pp.session", JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.x", refresh_token: "r", expires_at: Date.now() + 3600e3, user: { id: "u-admin" } }));

const CO = "aaaaaaaa-0000-4000-8000-00000000000a", VER = "bbbbbbbb-0000-4000-8000-00000000000b";
const USERS = { "tok-owner": "owner", "tok-coadmin": "admin", "tok-editor": "editor", "tok-publisher": "publisher", "tok-analyst": "analyst", "tok-viewer": "viewer", "tok-other": null };
let rpc = [], rest = [], pruneMode = "ok";
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input)); const h = init.headers || {};
  const token = String(h.Authorization || h.authorization || "").replace(/^Bearer /, "");
  if (url.pathname === "/auth/v1/user") return token in USERS ? json({ id: `u-${token.slice(4)}`, email: "x@stub.invalid" }) : json({}, 401);
  if (url.pathname === "/rest/v1/rpc/my_company_role") return json(USERS[token] ?? null);
  if (url.pathname === "/rest/v1/profiles") return json([{ role: "company" }]);
  if (url.pathname.startsWith("/rest/v1/rpc/")) { rpc.push({ fn: url.pathname.split("/").pop(), body: JSON.parse(init.body || "{}") }); return json({ ok: true, versions: [], version: 2 }); }
  if (url.pathname === "/rest/v1/company_profile_versions") {
    rest.push({ method: (init.method || "GET").toUpperCase(), search: decodeURIComponent(url.search) });
    if ((init.method || "GET") === "GET") {
      if (pruneMode === "no-kind") return json({ code: "42703", message: "column company_profile_versions.kind does not exist" }, 400);
      return json(Array.from({ length: 23 }, (_, i) => ({ id: `m${i}` })));   // already filtered to kind=manual by the query
    }
    return new Response(null, { status: 204 });
  }
  return json([], 200);
};

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const handler = (await import("../api/profile-draft.js")).default;
const call = async (token, body) => { const res = { statusCode: 200, body: null }; res.status = (c) => { res.statusCode = c; return res; }; res.json = (b) => { res.body = b; return res; }; await handler({ method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body }, res); return res; };

console.log("\n  HISTORY ACTIONS: approved roles (owner, company admin, editor; platform admins separately)");
for (const action of ["history", "version", "restore"]) {
  for (const t of ["tok-owner", "tok-coadmin", "tok-editor"]) {
    rpc = [];
    const r = await call(t, { action, companyId: CO, versionId: VER, expectedVersion: action === "restore" ? 1 : undefined });
    ok(r.statusCode === 200 && rpc.length === 1, `${t.slice(4)}: ${action} admitted -> ${rpc[0] && rpc[0].fn}`);
  }
  for (const t of ["tok-publisher", "tok-analyst", "tok-viewer", "tok-other"]) {
    rpc = [];
    const r = await call(t, { action, companyId: CO, versionId: VER });
    ok(r.statusCode === 403 && /profile history/.test(r.body.reason) && rpc.length === 0, `${t.slice(4)}: ${action} -> 403, nothing called`);
  }
}
rpc = [];
let r = await call("tok-editor", { action: "restore", companyId: CO, versionId: VER, expectedVersion: 4, p_actor: "u-owner" });
ok(rpc[0].fn === "restore_profile_version_to_draft" && rpc[0].body.p_actor === "u-editor" && rpc[0].body.p_expected_version === 4 && rpc[0].body.p_version === VER, "restore passes the session's user (never the body's) and the draft version it saw");
rpc = [];
r = await call("tok-editor", { action: "version", companyId: CO, versionId: "nope" });
ok(r.statusCode === 400 && rpc.length === 0, "a malformed versionId -> 400");
ok((await call(null, { action: "history", companyId: CO })).statusCode === 401, "signed out -> 401");

console.log("\n  ADMIN PRUNING NEVER DELETES PUBLISH HISTORY");
const { pruneVersions } = await import("../src/lib/profileVersions.js");
rest = []; pruneMode = "ok";
let out = await pruneVersions(CO, 20);
const get = rest.find((x) => x.method === "GET"), del = rest.find((x) => x.method === "DELETE");
ok(get && /kind=eq\.manual/.test(get.search), "pruning only ever lists kind = 'manual' snapshots");
ok(out.pruned === 3 && del && /m20,m21,m22/.test(del.search), "keeps the newest 20 manual snapshots, deletes only the 3 older manual ones");
rest = []; pruneMode = "no-kind";
out = await pruneVersions(CO, 20);
ok(out.pruned === 0 && !rest.some((x) => x.method === "DELETE") && /0074/.test(out.skipped || ""), "before 0074 (no kind column): nothing is pruned at all -- history cannot be told apart, so none is deleted");
const pv = fs.readFileSync("src/lib/profileVersions.js", "utf8");
ok(/PUBLISH HISTORY IS NEVER PRUNED/.test(pv), "the rule is stated where the pruning lives");

console.log("\n  EDITOR");
const ed = fs.readFileSync("src/portal/ProfileEditor.jsx", "utf8");
ok(/listProfileVersions\(/.test(ed) && /getProfileVersion\(/.test(ed) && /restoreProfileVersion\(/.test(ed), "the editor lists, previews and restores through the route");
ok(/Restore as draft/.test(ed) && /Nothing goes live until the draft is published/.test(ed) && /preview only/.test(ed), "restore is labelled as going into the draft, and a preview is labelled as not saved");
ok(/expectedVersion: draft \? draft\.version : null/.test(ed), "restore sends the draft version on screen (compare-and-set)");

console.log(`\n  profile-history: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
