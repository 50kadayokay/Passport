// a04 / d28 / d29 regression tests -- /api/profile-draft and the portal editor.
//   node scripts/profile-draft-test.mjs
//
// OFFLINE. The real handler runs against a stub Supabase (auth, my_company_role,
// profiles, and the 0072 functions, which record what they were called with).
// The database's own logic (roles, versions, atomic publish) is proven against
// staging by scripts/profile-drafts-0072-check.mjs; this proves the ROUTE:
// the approved role gate before any database call, the actor taken only from
// the verified session, every database refusal surfaced as an explicit HTTP
// error (never a 200), payload cleaning, and that the portal editor no longer
// writes the live profile.

import fs from "node:fs";

const SB = "https://stub-project.supabase.invalid";
Object.assign(process.env, { VITE_SUPABASE_URL: SB, VITE_SUPABASE_ANON_KEY: "sb_publishable_offline_stub_key", SUPABASE_SERVICE_ROLE_KEY: "stub-service-key" });
delete process.env.MINEEX_ENV;

const CO = "aaaaaaaa-0000-4000-8000-00000000000a";
const USERS = {
  "tok-owner": { id: "u-owner", role: "owner" }, "tok-coadmin": { id: "u-coadmin", role: "admin" }, "tok-editor": { id: "u-editor", role: "editor" },
  "tok-publisher": { id: "u-publisher", role: "publisher" }, "tok-analyst": { id: "u-analyst", role: "analyst" }, "tok-viewer": { id: "u-viewer", role: "viewer" },
  "tok-other": { id: "u-other", role: null }, "tok-padmin": { id: "u-padmin", role: null, platformAdmin: true },
};
let rpcCalls = [], rpcReply = () => ({ ok: true }), rpcStatus = 200, roleDown = false;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.origin !== SB) throw new Error(`unexpected egress to ${url.host}`);
  const h = init.headers || {};
  const token = String(h.Authorization || h.authorization || "").replace(/^Bearer /, "");
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
  if (url.pathname === "/auth/v1/user") return USERS[token] ? json({ id: USERS[token].id, email: `${USERS[token].id}@stub.invalid` }) : json({ msg: "bad" }, 401);
  if (url.pathname === "/rest/v1/rpc/my_company_role") { if (roleDown) return json({}, 500); return json(USERS[token] ? USERS[token].role : null); }
  if (url.pathname === "/rest/v1/profiles") { const u = Object.values(USERS).find((x) => `eq.${x.id}` === url.searchParams.get("id")); return json(u && u.platformAdmin ? [{ role: "admin" }] : [{ role: "company" }]); }
  const m = /^\/rest\/v1\/rpc\/(\w+)$/.exec(url.pathname);
  if (m) {
    if (token !== "stub-service-key") return json({ message: "permission denied" }, 401);
    const body = JSON.parse(init.body || "{}");
    rpcCalls.push({ fn: m[1], body });
    if (rpcStatus !== 200) return json({ code: "PGRST202", message: "not found" }, rpcStatus);
    return json(rpcReply(m[1], body));
  }
  return json({ message: "no route" }, 404);
};

const mod = await import("../api/profile-draft.js");
const handler = mod.default;
async function call(token, body, method = "POST") {
  const res = { statusCode: 200, body: null }; res.status = (c) => { res.statusCode = c; return res; }; res.json = (b) => { res.body = b; return res; };
  await handler({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, body }, res);
  return res;
}
const draft = { projects: [{ name: "Alpha" }], pp: { COMPANY: { name: "Iso Alpha" } } };
const FP = "0123456789abcdef0123456789abcdef";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const reset = () => { rpcCalls = []; rpcReply = () => ({ ok: true, version: 1 }); rpcStatus = 200; roleDown = false; };

console.log("\n  ROLE GATE (approved policy), before any database write");
reset();
{
  let r = await call(null, { action: "load", companyId: CO });
  ok(r.statusCode === 401 && rpcCalls.length === 0, "signed out -> 401, no database call");
  r = await call("tok-owner", { action: "load", companyId: CO }, "GET");
  ok(r.statusCode === 405, "GET -> 405");
  for (const action of ["load", "save", "discard"]) {
    for (const who of ["tok-owner", "tok-coadmin", "tok-editor", "tok-padmin"]) {
      reset();
      r = await call(who, { action, companyId: CO, draft, expectedVersion: action === "load" ? null : 1, baseFingerprint: FP });
      ok(r.statusCode === 200 && rpcCalls.length === 1, `${who.slice(4)}: ${action} admitted`);
    }
    for (const who of ["tok-publisher", "tok-analyst", "tok-viewer", "tok-other"]) {
      reset();
      r = await call(who, { action, companyId: CO, draft, expectedVersion: 1, baseFingerprint: FP });
      ok(r.statusCode === 403 && r.body.error === "forbidden" && rpcCalls.length === 0, `${who.slice(4)}: ${action} -> 403 with a reason, nothing called`);
    }
  }
  for (const who of ["tok-owner", "tok-coadmin", "tok-padmin"]) {
    reset();
    r = await call(who, { action: "publish", companyId: CO, expectedVersion: 3 });
    ok(r.statusCode === 200 && rpcCalls[0].fn === "publish_profile_draft", `${who.slice(4)}: publish admitted`);
  }
  for (const who of ["tok-editor", "tok-publisher", "tok-viewer", "tok-other"]) {
    reset();
    r = await call(who, { action: "publish", companyId: CO, expectedVersion: 3 });
    ok(r.statusCode === 403 && /owner or admins/.test(r.body.reason) && rpcCalls.length === 0, `${who.slice(4)}: publish -> 403, explicit`);
  }
  reset(); roleDown = true;
  r = await call("tok-owner", { action: "save", companyId: CO, draft, baseFingerprint: FP });
  ok(r.statusCode === 502 && rpcCalls.length === 0, "role check unavailable -> 502 (fails closed)");
}

console.log("\n  THE ACTOR IS THE VERIFIED USER, NEVER THE BODY");
reset();
{
  const r = await call("tok-editor", { action: "save", companyId: CO, draft, baseFingerprint: FP, p_actor: "u-owner", actor: "u-owner" });
  ok(r.statusCode === 200 && rpcCalls[0].body.p_actor === "u-editor", "p_actor is the session's user id (body fields ignored)");
  ok(rpcCalls[0].fn === "save_profile_draft" && rpcCalls[0].body.p_company === CO && rpcCalls[0].body.p_expected_version === null && rpcCalls[0].body.p_base_fingerprint === FP, "first save: no expected version, with the loaded live fingerprint");
}

console.log("\n  PAYLOAD");
reset();
{
  let r = await call("tok-editor", { action: "save", companyId: CO, draft: { ...draft, timeline: [{ x: 1 }], status: "published", owner_id: "u-editor" }, baseFingerprint: FP });
  ok(r.statusCode === 200 && Object.keys(rpcCalls[0].body.p_draft).sort().join(",") === "pp,projects", "only {projects, pp} reach the database (timeline / status / owner_id dropped)");
  reset();
  r = await call("tok-editor", { action: "save", companyId: CO, draft: { pp: JSON.parse('{"__proto__":{"x":1}}'), projects: [] }, baseFingerprint: FP });
  ok(r.statusCode === 400 && rpcCalls.length === 0, "a forbidden key -> 400");
  r = await call("tok-editor", { action: "save", companyId: CO, draft: { pp: "nope", projects: [] }, baseFingerprint: FP });
  ok(r.statusCode === 400 && rpcCalls.length === 0, "pp not an object -> 400");
  r = await call("tok-editor", { action: "save", companyId: CO, draft });
  ok(r.statusCode === 400 && rpcCalls.length === 0, "a first save without the live fingerprint -> 400");
  r = await call("tok-owner", { action: "publish", companyId: CO });
  ok(r.statusCode === 400 && rpcCalls.length === 0, "publish without the draft version seen -> 400");
  r = await call("tok-owner", { action: "save", companyId: "not-a-uuid", draft, baseFingerprint: FP });
  ok(r.statusCode === 400, "a malformed companyId -> 400");
  r = await call("tok-owner", { action: "save", companyId: CO, draft: { projects: [], pp: { big: "x".repeat(3.2 * 1024 * 1024) } }, baseFingerprint: FP });
  ok(r.statusCode === 413 && rpcCalls.length === 0, "over 3 MB -> 413");
  r = await call("tok-owner", { action: "explode", companyId: CO });
  ok(r.statusCode === 400, "unknown action -> 400");
}

console.log("\n  DATABASE REFUSALS ARE EXPLICIT (never a 200)");
for (const [error, code] of [["forbidden", 403], ["stale_draft", 409], ["stale_base", 409], ["draft_missing", 409], ["no_draft", 409], ["live_changed", 409], ["too_large", 413], ["invalid", 400], ["not_found", 404]]) {
  reset(); rpcReply = () => ({ ok: false, error, version: 4 });
  const r = await call("tok-owner", { action: "publish", companyId: CO, expectedVersion: 3 });
  ok(r.statusCode === code && r.body.ok === false && r.body.error === error, `${error} -> ${code}`);
}
reset(); rpcReply = () => ({ ok: false, error: "stale_draft", version: 5, updated_by: "u-coadmin" });
{
  const r = await call("tok-editor", { action: "save", companyId: CO, draft, expectedVersion: 4 });
  ok(r.statusCode === 409 && r.body.version === 5 && r.body.updated_by === "u-coadmin", "stale_draft carries the current version and who saved it");
}
reset(); rpcStatus = 404;
{
  const r = await call("tok-owner", { action: "load", companyId: CO });
  ok(r.statusCode === 503 && /0072/.test(r.body.error), "migration 0072 missing -> 503, said plainly");
}
reset(); rpcReply = () => null;
{
  const r = await call("tok-owner", { action: "load", companyId: CO });
  ok(r.statusCode === 502, "an empty database answer -> 502, not success");
}

console.log("\n  CLIENT AND EDITOR");
{
  const lib = fs.readFileSync("src/lib/profileDraft.js", "utf8");
  const arr = (name, src) => JSON.stringify(JSON.parse(new RegExp(`export const ${name} = (\\[[^\\]]*\\])`).exec(src)[1]));
  ok(arr("DRAFT_ROLES", lib) === JSON.stringify(mod.DRAFT_ROLES) && arr("PUBLISH_ROLES", lib) === JSON.stringify(mod.PUBLISH_ROLES), "client role lists mirror the route's (owner/admin/editor; owner/admin)");
  ok(JSON.stringify(mod.DRAFT_ROLES) === JSON.stringify(["owner", "admin", "editor"]) && JSON.stringify(mod.PUBLISH_ROLES) === JSON.stringify(["owner", "admin"]), "the route enforces exactly the approved policy");
  const ed = fs.readFileSync("src/portal/ProfileEditor.jsx", "utf8");
  ok(!/rest\/v1\/companies/.test(ed) && !/method:\s*"PATCH"/.test(ed), "the portal editor no longer reads or PATCHes companies directly (d28: no silent zero-row saves)");
  ok(/saveProfileDraft\(/.test(ed) && /publishProfileDraft\(/.test(ed) && /discardProfileDraft\(/.test(ed) && /loadProfileDraft\(/.test(ed), "the editor uses load / save / publish / discard through the route");
  ok(/Draft preview — not public/.test(ed) && /Unpublished draft/.test(ed) && !/Live — changes publish immediately/.test(ed), "unpublished changes are labelled; the 'changes publish immediately' banner is gone");
  ok(/draft\.canPublish/.test(ed), "Publish is offered only to roles the server says can publish");
  const { editorStart, messageFor } = await import("../src/lib/profileDraft.js");
  const s = editorStart({ live: { projects: [{ n: 1 }], pp: { a: 1 }, timeline: [{ k: 1 }] }, draft: { version: 3, stale: false, draft: { projects: [{ n: 2 }], pp: { a: 2 } } } });
  ok(s.version === 3 && s.pp.a === 2 && s.profile.projects[0].n === 2 && s.profile.timeline[0].k === 1, "draft recovery: the editor resumes the saved draft over the live profile (timeline kept)");
  ok(editorStart({ live: { pp: { a: 1 } }, draft: null }).version === null, "no draft: editing starts from the live profile");
  ok(/Company Memory rebuild/.test(messageFor({ error: "live_changed" })) && /Reload/.test(messageFor({ error: "stale_draft" })), "conflict messages say what happened and what to do");
  const panel = fs.readFileSync("src/portal/OnboardingPanel.jsx", "utf8");
  ok(/owner or an admin can take the profile live/.test(panel), "go-live refusal names the approved roles");
}

console.log(`\n  profile-draft: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
