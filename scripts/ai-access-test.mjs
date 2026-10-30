// Batch C (F4) regression tests: who may spend AI, for which company.
//   node scripts/ai-access-test.mjs
//
// OFFLINE. Every AI route runs in this process against a stubbed network that
// answers like the database would: my_features(cid) for members of cid (any role)
// and platform admins; my_company_role(cid) with the caller's membership role;
// profiles.role for the admin check; the atomic throttle counter. Providers
// (Anthropic, OpenAI) are counted, never called. The live staging run of the same
// matrix is in api-authz-test.mjs.
//
// Policy under test (proposed, docs/REMEDIATION-PLAN.md §8):
//   drafting / content creation  owner, admin, editor, publisher of THAT company; platform admin
//   Mine IQ ask                  any member role of that company (viewer, analyst included)
//   admin-only tools             platform admin only (Story Studio, website builder)
//   extractors with no company   platform admin only (onboarding concierge) -- unchanged
//   investors, other companies   never

import { spawnSync } from "node:child_process";
import fs from "node:fs";

const STUB_SB = "https://stub-project.supabase.invalid";
Object.assign(process.env, {
  VITE_SUPABASE_URL: STUB_SB, VITE_SUPABASE_ANON_KEY: "sb_publishable_stubKeyForOfflineTests",
  SUPABASE_SERVICE_ROLE_KEY: "stub-service-key", SUBMISSION_SALT: "stub-salt",
  ANTHROPIC_API_KEY: "stub-anthropic", OPENAI_API_KEY: "stub-openai",
});
delete process.env.MINEEX_ENV;
delete process.env.AI_ENDPOINTS_DISABLED;

const A = "aaaaaaaa-0000-4000-8000-00000000000a", B = "bbbbbbbb-0000-4000-8000-00000000000b";
// token -> { id, profileRole, roles: { companyId: membershipRole } }
const IDS = {
  "tok-ownerA":     { id: "u-ownerA", profileRole: "company", roles: { [A]: "owner" } },
  "tok-publisherA": { id: "u-pubA",   profileRole: "company", roles: { [A]: "publisher" } },
  "tok-editorA":    { id: "u-edA",    profileRole: "company", roles: { [A]: "editor" } },
  "tok-viewerA":    { id: "u-viewA",  profileRole: "company", roles: { [A]: "viewer" } },
  "tok-analystA":   { id: "u-anA",    profileRole: "company", roles: { [A]: "analyst" } },
  "tok-ownerB":     { id: "u-ownerB", profileRole: "company", roles: { [B]: "owner" } },
  "tok-investor":   { id: "u-inv",    profileRole: "investor", roles: {} },
  "tok-admin":      { id: "u-admin",  profileRole: "admin", roles: {} },
};
const FEATURES = ["portal_access", "company_memory", "communications_center", "passport_profile"];
const counters = new Map();
let provider = 0;
const bumps = [];
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const who = (h) => IDS[String((h && (h.Authorization || h.authorization)) || "").replace(/^Bearer /, "")];

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  const body = typeof init.body === "string" ? init.body : "";
  const caller = who(init.headers);
  if (url.host === "api.anthropic.com" || url.host === "api.openai.com") {
    provider++;
    if (url.host === "api.openai.com") return json({ choices: [{ message: { role: "assistant", content: "Draft." } }], output_text: "Draft.", usage: {} });
    return json({ content: [{ type: "text", text: "{}" }], usage: { input_tokens: 1, output_tokens: 1 } });
  }
  if (url.origin !== STUB_SB) return new Response("<html><title>Release</title><body>Iso release text.</body></html>", { status: 200, headers: { "content-type": "text/html" } });
  const p = url.pathname;
  if (p === "/auth/v1/user") return caller ? json({ id: caller.id, email: `${caller.id}@stub.invalid` }) : json({ msg: "bad jwt" }, 401);
  if (p === "/rest/v1/rpc/ai_enabled") return json(true);
  if (p === "/rest/v1/rpc/my_features") {
    const cid = JSON.parse(body || "{}").cid;
    if (!caller) return json([]);
    return json(caller.profileRole === "admin" || caller.roles[cid] ? FEATURES : []);
  }
  if (p === "/rest/v1/rpc/my_company_role") { const cid = JSON.parse(body || "{}").cid; return json(caller ? caller.roles[cid] ?? null : null); }
  if (p === "/rest/v1/profiles") return json(caller ? [{ role: caller.profileRole }] : []);
  if (p === "/rest/v1/rpc/bump_submission_throttle") {
    const a = JSON.parse(body); const k = `${a.p_ip_hash}|${a.p_form}|${a.p_window_start}`;
    const n = (counters.get(k) || 0) + 1; counters.set(k, n); bumps.push(a.p_ip_hash); return json(n);
  }
  if (p === "/rest/v1/company_memberships") return json([]);
  return json([]);
};

function mkReq(token, body) {
  return { method: "POST", query: {}, headers: { "x-real-ip": "203.0.113.5", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body, url: "/api/x" };
}
function mkRes() {
  const r = { statusCode: 200, body: undefined, headers: {} };
  r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; };
  r.send = (b) => { r.body = b; return r; }; r.end = (b) => { if (b !== undefined) r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  return r;
}
const mods = {};
async function run(route, token, body) {
  mods[route] = mods[route] || (await import(`../api/${route}.js`)).default;
  const before = provider; const res = mkRes();
  await mods[route](mkReq(token, body), res);
  return { status: res.statusCode, body: res.body, provider: provider - before };
}

// Child mode for the per-user daily cap: started by the parent with
// AI_USER_DAILY_CAP=2, before any handler module is imported.
if (process.env.AI_ACCESS_CAP_CHILD === "1") {
  const codes = []; let last = null;
  for (let i = 0; i < 3; i++) { last = await run("compose", "tok-ownerA", { mode: "draft", companyId: A, details: `cap ${i}` }); codes.push(last.status); }
  console.log(`CAP ${codes.join(",")} providerOn3=${last.provider}`);
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const denied = (r) => (r.status === 401 || r.status === 403) && r.provider === 0;
// Admitted = the guard let it through: anything but a refusal from the guard.
const admitted = (r) => r.status !== 401 && r.status !== 403 && !(r.body && /companyId is required/.test(JSON.stringify(r.body)));

// ---- the routes -------------------------------------------------------------------------
const TL = [{ date: "2026-01-01", title: "Iso" }];
const DRAFTING = {
  "compose (draft)":    ["compose", (c) => ({ mode: "draft", companyId: c, details: "Iso drill program begins." })],
  "compose (caption)":  ["compose", (c) => ({ mode: "caption", companyId: c, hint: "Core trays at the logging shed." })],
  "compose (revise)":   ["compose", (c) => ({ mode: "revise", companyId: c, current: "Iso release.", instruction: "Shorter." })],
  "comms-generate":     ["comms-generate", (c) => ({ companyId: c, update: "Iso drill program begins.", destinations: ["passport"] })],
  "structure-release":  ["structure-release", (c) => ({ companyId: c, text: "Iso Resources intersects 31.4 m of 4.8 g/t gold." })],
  "audience-card":      ["audience-card", (c) => ({ companyId: c, timeline: TL })],
  "synthesize-profile": ["synthesize-profile", (c) => ({ companyId: c, timeline: TL })],
  "extract-text":       ["extract-text", (c) => ({ companyId: c, text: "Iso Resources intersects 31.4 m of 4.8 g/t gold." })],
  "structure-batch":    ["structure-batch", (c) => ({ companyId: c, releases: [{ id: "r1", text: "Iso drill results." }] })],
  "extract-company":    ["extract-company", (c) => ({ companyId: c })],
  "extract-projects":   ["extract-projects", (c) => ({ companyId: c })],
};
const ASK = ["compose", (c) => ({ mode: "ask", companyId: c, question: "What did we drill in 2025?" })];
const ADMIN_ONLY = {
  "story-extract":      ["story-extract", () => ({ text: "Iso release text." })],
  "story-fetch":        ["story-fetch", () => ({ url: "https://example.com/iso-release" })],
  "build-from-website": ["build-from-website", (c) => ({ companyId: c })],
};

console.log("\n  DRAFTING ROUTES (11): who may create content, for which company");
for (const [label, [route, body]] of Object.entries(DRAFTING)) {
  for (const t of ["tok-ownerA", "tok-publisherA", "tok-editorA", "tok-admin"]) {
    const r = await run(route, t, body(A));
    ok(admitted(r), `${label}: ${t.slice(4)} -> company A is admitted`, `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
  }
  for (const [t, c, why] of [["tok-viewerA", A, "viewer (read-only role)"], ["tok-analystA", A, "analyst (read-only role)"],
                             ["tok-investor", A, "investor"], ["tok-ownerB", A, "company B's owner -> A"],
                             ["tok-ownerA", B, "company A's owner -> B"], [null, A, "anonymous"]]) {
    const r = await run(route, t, body(c));
    ok(denied(r), `${label}: ${why} is refused, provider not called`, `${r.status} provider=${r.provider} ${JSON.stringify(r.body).slice(0, 100)}`);
  }
  const v = await run(route, "tok-viewerA", body(A));
  ok(v.body && v.body.code === "role_not_permitted", `${label}: the viewer's refusal says why (role_not_permitted)`, JSON.stringify(v.body));
}
console.log(`    ...${pass} checks so far`);

console.log("\n  MINE IQ ASK: any member of the company, nobody else");
for (const t of ["tok-ownerA", "tok-publisherA", "tok-viewerA", "tok-analystA", "tok-admin"]) {
  const r = await run(ASK[0], t, ASK[1](A));
  ok(admitted(r), `ask: ${t.slice(4)} -> company A is admitted`, `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
}
for (const [t, c, why] of [["tok-investor", A, "investor"], ["tok-ownerB", A, "company B's owner -> A"], ["tok-viewerA", B, "A's viewer -> B"], [null, A, "anonymous"]]) {
  const r = await run(ASK[0], t, ASK[1](c));
  ok(denied(r), `ask: ${why} is refused, provider not called`, `${r.status} provider=${r.provider}`);
}
{ const r = await run("compose", "tok-ownerA", { mode: "ask", question: "x" });
  ok(r.status === 400 && r.provider === 0, "ask with no company named is refused 400 (never a guessed company)"); }

console.log("\n  ADMIN-ONLY TOOLS: Story Studio and the website builder");
for (const [label, [route, body]] of Object.entries(ADMIN_ONLY)) {
  const r = await run(route, "tok-admin", body(A));
  ok(admitted(r), `${label}: platform admin is admitted`, `${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
  for (const [t, why] of [["tok-ownerA", "a company owner, even naming their own company"], ["tok-publisherA", "a publisher"], ["tok-investor", "an investor"], [null, "anonymous"]]) {
    const rr = await run(route, t, body(A));
    ok(denied(rr), `${label}: ${why} is refused, nothing fetched or billed`, `${rr.status} provider=${rr.provider}`);
  }
}

console.log("\n  EXTRACTORS WITH NO COMPANY: the onboarding concierge stays admin-only");
for (const route of ["extract-text", "structure-batch", "extract-company", "extract-projects"]) {
  const body = route === "extract-text" ? { text: "Iso." } : route === "structure-batch" ? { releases: [{ id: "r", text: "Iso." }] } : { releases: [{ date: "2026-01-01", text: "Iso." }] };
  ok(admitted(await run(route, "tok-admin", body)), `${route}: admin with no company is admitted (concierge, unchanged)`);
  ok(denied(await run(route, "tok-ownerA", body)), `${route}: an owner with no company named is refused`);
  ok(denied(await run(route, "tok-investor", body)), `${route}: an investor with no company named is refused`);
}

console.log("\n  CROSS-COMPANY RESOURCES");
{
  bumps.length = 0;
  const r = await run("compose", "tok-ownerA", { mode: "draft", companyId: B, details: "x" });
  ok(denied(r), "A's owner naming company B is refused");
  ok(!bumps.some((k) => k === `co:${B}`), "  ...and company B's daily AI budget is NOT consumed");
  bumps.length = 0;
  await run("compose", "tok-ownerA", { mode: "draft", companyId: A, details: "x" });
  ok(bumps.includes(`co:${A}`), "an admitted draft is charged to the AUTHORISED company (A)");
}

console.log("\n  CONFIGURATION IS CHECKED AFTER AUTHORISATION (F10)");
{
  const saved = { a: process.env.ANTHROPIC_API_KEY, o: process.env.OPENAI_API_KEY };
  delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY;
  for (const [label, [route, body]] of Object.entries({ ...DRAFTING, ...ADMIN_ONLY })) {
    const r = await run(route, null, body(A));
    ok(r.status === 401, `${label}: anonymous with the provider key UNSET gets 401, not a configuration 500`, `${r.status}`);
  }
  process.env.ANTHROPIC_API_KEY = saved.a; process.env.OPENAI_API_KEY = saved.o;
}

console.log("\n  KILL SWITCH COVERS EVERY AI ROUTE");
{
  process.env.AI_ENDPOINTS_DISABLED = "true";
  for (const [label, [route, body]] of Object.entries({ ...DRAFTING, ...ADMIN_ONLY, "compose (ask)": ASK })) {
    const r = await run(route, "tok-admin", body(A));
    ok(r.status === 503 && r.provider === 0, `${label}: AI_ENDPOINTS_DISABLED=true -> 503, provider not called`, `${r.status}`);
  }
  delete process.env.AI_ENDPOINTS_DISABLED;
}

console.log("\n  INVESTOR-FACING CODE NEVER CALLS AN AI ENDPOINT");
{
  const AI = ["compose", "comms-generate", "structure-release", "audience-card", "synthesize-profile", "extract-text", "structure-batch",
              "extract-company", "extract-projects", "story-extract", "story-fetch", "build-from-website"];
  const files = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = `${d}/${e.name}`; e.isDirectory() ? walk(p) : /\.(jsx?|tsx?)$/.test(p) && files.push(p); } })("src");
  const callers = files.filter((f) => AI.some((r) => new RegExp(`/api/${r}\\b`).test(fs.readFileSync(f, "utf8"))));
  const allowed = /^src\/(portal|admin|console|studio|lib|Onboarding\.jsx|aiBrief\/PassportProto\.jsx)/;
  const outside = callers.filter((f) => !allowed.test(f));
  ok(outside.length === 0, "every caller of an AI endpoint is company, admin or onboarding code -- none is in the investor app", outside.join(", "));
  const libUsers = files.filter((f) => /from ["'][./]*lib\/(compose|mineiq|mineiqChat|structureReleases)\.js["']/.test(fs.readFileSync(f, "utf8")));
  const libOutside = libUsers.filter((f) => !/^src\/(portal|admin|console|studio|lib|Onboarding\.jsx)/.test(f));
  ok(libOutside.length === 0, "the AI client helpers are imported only by portal, console, admin and onboarding code", libOutside.join(", "));
}

console.log("\n  PER-USER DAILY CAP (separate process, cap = 2)");
{
  const child = spawnSync(process.execPath, ["scripts/ai-access-test.mjs"], { encoding: "utf8",
    env: { PATH: process.env.PATH, AI_ACCESS_CAP_CHILD: "1", AI_USER_DAILY_CAP: "2" } });
  const out = (child.stdout || "").trim().split("\n").pop();
  ok(/^CAP (\d+),(\d+),(\d+) providerOn3=0$/.test(out) && out.startsWith("CAP 200,200,429"), "a user's 3rd AI call of the day is refused 429 with no provider call", out || child.stderr.slice(0, 300));
}

console.log(`\nai access: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
