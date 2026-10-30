// D23 live verification -- Company Memory's AI against the STAGING database,
// through the real client helpers, the real API guard and real RLS.
//
//   node scripts/memory-ai-live-test.mjs
//
// Starts the local staging API server (MINEEX_ENV=staging: tripwire + egress
// guard; Anthropic is MOCKED with deterministic "[staging mock]" output, never
// called) and signs in the seeded fixtures. For each role it runs exactly what
// the console runs -- loadMemoryAccess, reanalyzeFromMemory with the real
// memory.js document readers, summarizeSteps, mergeExtraction, saveCompanyProfile
// -- and then reads companies.profile back from the database to see what was
// actually persisted, and re-reads it as the user to see what the refreshed
// console would show.
//
// HOW THE BROWSER CODE RUNS UNDER NODE. The client helpers call relative
// `/api/...` and, under plain node, their Supabase URL resolves to the built-in
// default (the production project) because Vite's env is absent. A fetch shim
// installed BEFORE they are imported rewrites `/api/...` to the local staging
// server and that default host to the staging project, and THROWS on any other
// host. The production host is therefore never contacted; the shim records every
// rewrite and the run fails if any request would have left for anywhere else.
//
// WHAT IT WRITES (staging only): three documents for company A whose filenames
// start "[d23-live]" (deleted at the end, by that prefix only), company A's
// profile (snapshotted first and restored at the end), and the reflected flag on
// its own documents. Refuses to run unless the target is the staging project.
// Prints no secrets.

import fs from "node:fs";
import { spawn, spawnSync } from "node:child_process";

const readEnvFile = (f) => fs.existsSync(f)
  ? Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }))
  : {};
const iso = readEnvFile("supabase/staging/.isolation-env");
const apiEnv = readEnvFile("supabase/staging/.api-env");
const SB = (iso.ISOLATION_SUPABASE_URL || "").replace(/\/+$/, ""), ANON = iso.ISOLATION_ANON_KEY, SERVICE = apiEnv.STAGING_SUPABASE_SERVICE_ROLE_KEY;
if (!SB || /rvptronniomlqumjhyrr/.test(SB) || !/jmljfovtfxcdhjmtlnva/.test(SB)) { console.error("  refusing: not the staging project"); process.exit(2); }
if (!SERVICE) { console.error("  STAGING_SUPABASE_SERVICE_ROLE_KEY missing from supabase/staging/.api-env"); process.exit(3); }
const STAGING_HOST = new URL(SB).host;
const CLIENT_DEFAULT_HOST = "rvptronniomlqumjhyrr.supabase.co";   // rewritten, never contacted
const A = iso.ISOLATION_COMPANY_A_ID, B_SLUG = iso.ISOLATION_COMPANY_B_SLUG, A_SLUG = iso.ISOLATION_COMPANY_A_SLUG;
const MARK = "[d23-live]";

// Reseed first: it resets the AI throttle counters (this suite makes dozens of
// mocked AI calls; the real per-user limits are left exactly as they are) and
// guarantees the analyst fixture exists.
{
  const seed = spawnSync(process.execPath, ["scripts/seed-isolation-fixtures.mjs"], { encoding: "utf8" });
  if (seed.status !== 0) { console.error("  seeding failed"); process.exit(1); }
  Object.assign(iso, readEnvFile("supabase/staging/.isolation-env"));
}

// ------------------------------------------------------------------- server --
const PORT = 8787 + Math.floor(Math.random() * 500);
const server = spawn(process.execPath, ["scripts/staging-api-server.mjs", "--port", String(PORT)], { stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
server.stdout.on("data", (d) => { serverLog += d; });
server.stderr.on("data", (d) => { serverLog += d; });
process.on("exit", () => { try { server.kill(); } catch {} ; if (process.env.SHOW_SERVER_LOG) console.log(serverLog); });
const API = `http://127.0.0.1:${PORT}`;

// --------------------------------------------------------------- fetch shim --
const realFetch = globalThis.fetch;
const API_CALLS = [];
let rewrites = 0;
const strayHosts = new Set();
globalThis.fetch = async (input, init = {}) => {
  let raw = String(input instanceof Request ? input.url : input);
  if (raw.startsWith("/api/")) {
    const r = await realFetch(`${API}${raw}`, init);
    const clone = r.clone(); const body = await clone.json().catch(() => ({}));
    API_CALLS.push({ route: raw.slice(5).split("?")[0], status: r.status, companyId: (() => { try { return JSON.parse(init.body || "{}").companyId || null; } catch { return null; } })(), error: body && body.error });
    return r;
  }
  const u = new URL(raw);
  if (u.host === CLIENT_DEFAULT_HOST) {
    // Host AND the client's built-in publishable key: both name the default
    // project, so both are swapped for staging's. The user's own bearer token
    // (a staging session) is left exactly as the client set it.
    rewrites++; raw = `${SB}${u.pathname}${u.search}`;
    const h = { ...(init.headers || {}) };
    for (const k of Object.keys(h)) {
      if (k.toLowerCase() === "apikey") h[k] = ANON;
      if (k.toLowerCase() === "authorization" && !/^Bearer eyJ/.test(String(h[k])) ) h[k] = `Bearer ${ANON}`;
    }
    init = { ...init, headers: h };
  }
  else if (!(u.host === STAGING_HOST || u.host === `127.0.0.1:${PORT}`)) { strayHosts.add(u.host); throw new Error(`blocked: ${u.host}`); }
  return realFetch(raw, init);
};
for (let i = 0; i < 40; i++) { if (await fetch(`${API}/__staging/egress`).then((r) => r.ok).catch(() => false)) break; await new Promise((r) => setTimeout(r, 250)); }
const egressLog = async () => ((await (await fetch(`${API}/__staging/egress`)).json()).log || []);

// --------------------------------------------------------------- identities --
let session = null;
globalThis.localStorage = { getItem: (k) => (k === "pp.session" && session ? JSON.stringify(session) : null), setItem() {}, removeItem() {} };
const signIn = async (key) => {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email: iso[`ISOLATION_${key}_EMAIL`], password: iso[`ISOLATION_${key}_PASS`] }) });
  const j = r.ok ? await r.json() : null;
  return j ? { access_token: j.access_token, refresh_token: "", expires_at: Date.now() + 50 * 60e3, user: j.user } : null;
};
const ROLES = { COMPANY_A: "owner", COADMIN: "admin", EDITOR: "editor", PUBLISHER: "publisher", STAFF: "viewer", ANALYST: "analyst", ADMIN: "platform admin", INVESTOR: "investor", COMPANY_B: "owner of B" };
const who = {};
for (const k of Object.keys(ROLES)) who[k] = await signIn(k);
const missing = Object.keys(ROLES).filter((k) => !who[k]);
if (missing.length) { console.error(`  could not sign in: ${missing.join(", ")} -- run scripts/seed-isolation-fixtures.mjs`); process.exit(3); }

const SR = await import("../src/lib/structureReleases.js");
const MA = await import("../src/lib/memoryAccess.js");
const MEM = await import("../src/lib/memory.js");
const { mergeExtraction, mergeIncremental } = await import("../src/lib/profileToPP.js");

// ---------------------------------------------------------------- database --
const db = async (path, init = {}) => {
  const r = await realFetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json", ...(init.headers || {}) } });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
const privOfA = async () => (await db(`companies?id=eq.${A}&select=id,owner_id,tier,status,slug,name`)).body[0];
const updatedAtOfA = async () => ((await db(`companies?id=eq.${A}&select=updated_at`)).body[0] || {}).updated_at;
const saveAs = async (k, body) => {
  const r = await realFetch(`${API}/api/memory-save`, { method: "POST", headers: { "content-type": "application/json", ...(k ? { authorization: `Bearer ${who[k].access_token}` } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const profileOfA = async () => ((await db(`companies?id=eq.${A}&select=profile`)).body[0] || {}).profile || {};

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

// ------------------------------------------------------------------ fixture --
console.log(`\n  staging ${STAGING_HOST.split(".")[0]}`);
const ORIGINAL = await profileOfA();
const clean = await db(`documents?company_id=eq.${A}&filename=like.${encodeURIComponent(MARK + "*")}`, { method: "DELETE" });
if (clean.status >= 300) { console.error(`  could not clear old test documents (${clean.status})`); process.exit(1); }
const TEST_DOCS = [
  { filename: `${MARK} 2026-02-01 drill results.txt`, doc_date: "2026-02-01", extracted_text: "2026-02-01 Iso Alpha drills 31 m of 4.8 g/t gold at the Alpha project." },
  { filename: `${MARK} 2026-03-15 financing.txt`, doc_date: "2026-03-15", extracted_text: "2026-03-15 Iso Alpha closes a C$5M placement to fund drilling." },
  { filename: `${MARK} board.html`, doc_date: null, extracted_text: "Board of directors and share structure of Iso Alpha. No dates in this page." },
];
const ins = await db("documents", { method: "POST", headers: { Prefer: "return=representation" },
  body: JSON.stringify(TEST_DOCS.map((d) => ({ company_id: A, uploaded_by: who.COMPANY_A.user.id, ...d }))) });
if (ins.status !== 201) { console.error(`  could not insert test documents (${ins.status}) ${JSON.stringify(ins.body).slice(0, 200)}`); process.exit(1); }
const deps = { documentsForExtraction: MEM.documentsForExtraction, downloadDocumentBase64: MEM.downloadDocumentBase64, saveDocumentText: MEM.saveDocumentText, unreflectedDocuments: MEM.unreflectedDocuments };
const corpusDocs = (await db(`documents?company_id=eq.${A}&extracted_text=not.is.null&select=id,doc_date,filename`)).body;
const DATED = corpusDocs.filter((d) => /\d{4}-\d{2}-\d{2}/.test(d.filename || "") || d.doc_date).length;

// What the console does, step for step (CompanyMemory.jsx reanalyze), minus
// the preflight -- run deliberately for every role to show what the server and
// the database decide on their own.
async function consoleRebuild(key) {
  session = who[key];
  API_CALLS.length = 0;
  const logStart = (await egressLog()).length;
  const access = await MA.loadMemoryAccess(A);
  let profile = null, results = null, sum = null, saveErr = null, thrown = null;
  try {
    const read = await MA.readCompanyProfile(A);
    profile = read.profile;
    results = await SR.reanalyzeFromMemory(A, { token: session.access_token, deps, existingTimeline: profile.timeline || [] });
    const nTl = (results.timelineEntries || []).length;
    sum = MA.summarizeSteps(results.steps, { timeline: nTl, projects: (results.projects && results.projects.projects || []).length, leaders: (results.company && results.company.team || []).length });
    if (sum.level !== "error") {
      const next = mergeExtraction(profile, results);
      try { await MA.saveCompanyProfile(A, next, read.updatedAt); } catch (e) { saveErr = e; }
    }
  } catch (e) { thrown = e; }
  const log = (await egressLog()).slice(logStart);
  const ai = log.filter((e) => e.provider === "anthropic").length;
  const calls = API_CALLS.slice();
  session = null;
  return { access, results, sum, saveErr, thrown, ai, calls, log };
}
// Staging sets AI_CALLS_PER_WINDOW=12 (per user, per endpoint, per 10 min) so
// the API suite can exercise throttling; one owner rebuild uses up to 5
// extract-projects calls. The counters (not the limit) are reset between the
// owner's phases, as the seeder does.
const resetAiCounters = async () => {
  const r = await db("submission_throttle?form=like.ai%3A*", { method: "DELETE" });
  if (r.status >= 300) throw new Error(`could not reset staging AI counters (${r.status})`);
};
const restore = async () => db(`companies?id=eq.${A}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ profile: ORIGINAL }) });

try {
  // ===================================================== who may save ==
  console.log("\n  WHO MAY RUN AND SAVE (asked of staging as each user)");
  const want = { COMPANY_A: [true, true], ADMIN: [true, true], COADMIN: [true, true], EDITOR: [true, false], PUBLISHER: [true, false], STAFF: [false, false], ANALYST: [false, false], INVESTOR: [false, false], COMPANY_B: [false, false] };
  for (const [k, [an, sv]] of Object.entries(want)) {
    session = who[k]; const a = await MA.loadMemoryAccess(A); session = null;
    ok(a.canAnalyze === an && a.canSave === sv, `${ROLES[k].padEnd(15)} analyze=${an} save=${sv}`, JSON.stringify(a));
  }

  // ============================================== owner: full rebuild ==
  console.log("\n  OWNER OF A: full rebuild, persisted");
  await resetAiCounters();
  await restore();
  const before = await profileOfA();
  const o = await consoleRebuild("COMPANY_A");
  ok(!o.thrown, "the run completes", o.thrown && o.thrown.message);
  ok(o.calls.length > 0 && o.calls.every((c) => c.companyId === A && c.status === 200), `every AI request names company A and is admitted (${o.calls.length} requests)`, o.calls.map((c) => `${c.route}:${c.status}:${c.companyId ? "A" : "-"}`).join(","));
  ok(o.results && Object.values(o.results.steps).every((s) => s.ok), "every step ok", o.results && JSON.stringify(o.results.steps));
  ok(o.ai > 0 && o.log.every((e) => e.action !== "block"), `AI was (mock-)called ${o.ai} times; nothing blocked`);
  ok(o.sum && o.sum.level === "ok" && /status card and AI brief regenerated/.test(o.sum.text), `the console would report: "${o.sum && o.sum.text}"`);
  ok(!o.thrown && o.sum && !o.saveErr, "save verified: one row written", (o.saveErr || o.thrown || {}).message);
  const after = await profileOfA();
  ok(after.companyStatus && /^\[staging mock\] status from \d+ releases$/.test(after.companyStatus.statusHeadline || ""), `DATABASE: companies.profile.companyStatus regenerated -> "${after.companyStatus && after.companyStatus.statusHeadline}"`);
  ok(after.companyBrief && /^\[staging mock\] brief from/.test(after.companyBrief.shortSummary || ""), "DATABASE: companies.profile.companyBrief regenerated");
  ok(/first headline: \[staging mock\] release m\d+/.test((after.companyStatus || {}).latestUpdate || ""), "DATABASE: the overview was written from the REBUILT chronology (its headlines reached the model)", (after.companyStatus || {}).latestUpdate);
  ok(Array.isArray(after.timeline) && after.timeline.length >= 2 && after.timeline.every((e) => /^\d{4}-\d{2}-\d{2}/.test(e.date)), `DATABASE: timeline rebuilt from the dated documents (${(after.timeline || []).length} entries, all dated)`);
  ok((after.team || []).some((m) => /\[staging mock\] chief executive/.test(m.name)) && (after.projects || []).some((p) => /\[staging mock\] project/.test(p.name)), "DATABASE: leadership and projects persisted");
  ok(after.pp && JSON.stringify(after.pp) !== JSON.stringify(before.pp), "DATABASE: the render payload (pp) was recomputed");
  session = who.COMPANY_A;
  const reread = (await MA.readCompanyProfile(A)).profile;   // what the console's refresh() re-reads
  session = null;
  ok(reread.companyStatus && reread.companyStatus.statusHeadline === after.companyStatus.statusHeadline, "REFRESH: re-read as the owner (what onSaved -> refresh loads) shows the new status card");

  // ============================================= platform admin rebuild ==
  console.log("\n  PLATFORM ADMIN: rebuild of company A, persisted");
  await restore();
  const ad = await consoleRebuild("ADMIN");
  ok(ad.calls.length > 0 && ad.calls.every((c) => c.companyId === A && c.status === 200), "every request names A; admitted");
  ok(!ad.saveErr && /^\[staging mock\] status from/.test(((await profileOfA()).companyStatus || {}).statusHeadline || ""), "DATABASE: status card regenerated and saved by the platform admin", ad.saveErr && ad.saveErr.message);

  // ======================================== company admin: runs AND saves ==
  console.log("\n  COMPANY ADMIN: rebuild of company A, saved through /api/memory-save");
  await restore();
  await resetAiCounters();
  {
    const priv = await privOfA();
    const r = await consoleRebuild("COADMIN");
    const p = await profileOfA();
    ok(r.calls.length > 0 && r.calls.every((c) => c.companyId === A && c.status === 200), "AI requests for A admitted");
    ok(!r.thrown && !r.saveErr, "save verified (the server wrote exactly one row)", (r.saveErr || r.thrown || {}).message);
    ok(/^\[staging mock\] status from \d+ releases$/.test((p.companyStatus || {}).statusHeadline || "") && /^\[staging mock\] brief/.test((p.companyBrief || {}).shortSummary || ""), "DATABASE: status card and brief regenerated and stored by the company admin");
    ok(JSON.stringify(await privOfA()) === JSON.stringify(priv), "DATABASE: owner_id, tier, status, slug and name unchanged");
    session = who.COADMIN; const rr = (await MA.readCompanyProfile(A)).profile; session = null;
    ok(rr.companyStatus && rr.companyStatus.statusHeadline === p.companyStatus.statusHeadline, "REFRESH: the company admin re-reads the new card");
  }

  // ============================ editor / publisher: AI yes, save no ==
  console.log("\n  EDITOR / PUBLISHER: AI admitted (Batch C), save refused by the server -- and SAID so");
  for (const k of ["EDITOR", "PUBLISHER"]) {
    await restore();
    const snap = JSON.stringify(await profileOfA());
    const r = await consoleRebuild(k);
    ok(r.calls.filter((c) => c.route !== "memory-save").length > 0 && r.calls.filter((c) => c.route !== "memory-save").every((c) => c.companyId === A && c.status === 200), `${ROLES[k]}: AI requests for A admitted (drafting role)`);
    const sv = r.calls.find((c) => c.route === "memory-save");
    ok(sv && sv.status === 403 && r.saveErr && /not saved/.test(r.saveErr.message), `${ROLES[k]}: /api/memory-save 403; reported "${r.saveErr && r.saveErr.message}"`);
    ok(JSON.stringify(await profileOfA()) === snap, `${ROLES[k]}: DATABASE: profile unchanged`);
    ok(r.access.canAnalyze && !r.access.canSave && /owner or admins/.test(r.access.reason), `${ROLES[k]}: the console's preflight would have stopped BEFORE spending, with that reason`);
  }

  // ========================= viewer / analyst / investor / other company ==
  console.log("\n  VIEWER / ANALYST / INVESTOR / OWNER OF B: refused, nothing spent, nothing saved");
  for (const k of ["STAFF", "ANALYST", "INVESTOR", "COMPANY_B"]) {
    await restore();
    const snap = JSON.stringify(await profileOfA());
    const r = await consoleRebuild(k);
    if (k === "INVESTOR" || k === "COMPANY_B") {
      // Not a member: RLS hides company A's documents from them, so there is
      // nothing to send -- the run stops at "No documents" before any AI call.
      ok(r.results === null && r.calls.length === 0, `${ROLES[k]}: cannot even read company A's documents (RLS) -- no AI request made`, `results=${r.results ? "non-null" : "null"} calls=${r.calls.length}`);
    } else {
      ok(r.calls.length > 0 && r.calls.every((c) => c.status === 403), `${ROLES[k]}: reads A's documents (member) but every AI request is 403`, r.calls.map((c) => `${c.route}:${c.status}`).join(","));
      ok(r.sum && r.sum.level === "error" && /refused/.test(r.sum.text), `${ROLES[k]}: reported "Nothing was rebuilt ... refused" (not a zero success)`, r.sum && r.sum.text);
    }
    ok(r.ai === 0, `${ROLES[k]}: AI provider never called`, `${r.ai}`);
    ok(JSON.stringify(await profileOfA()) === snap, `${ROLES[k]}: DATABASE: profile unchanged`);
  }

  // ======================================================= manipulation ==
  console.log("\n  ISOLATION: the subject cannot be redirected");
  {
    const call = async (k, route, body) => {
      const r = await realFetch(`${API}/api/${route}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${who[k].access_token}` }, body: JSON.stringify(body) });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    };
    const logStart = (await egressLog()).length;
    let r = await call("COMPANY_A", "extract-company", { companyId: A, slug: B_SLUG });
    ok(r.status === 400 && r.body.code === "subject_mismatch", "owner of A: companyId A + slug B -> 400 subject_mismatch (B's stored releases not read)", `${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
    r = await call("COMPANY_A", "extract-projects", { companyId: A, slug: B_SLUG, part: "discover" });
    ok(r.status === 400, "extract-projects: the same -> 400");
    r = await call("COMPANY_B", "structure-batch", { companyId: A, releases: [{ id: "x", text: "y" }] });
    ok(r.status === 403, "owner of B naming company A -> 403");
    r = await call("COMPANY_B", "synthesize-profile", { companyId: A, slug: A_SLUG, timeline: [{ date: "2026-01-01" }] });
    ok(r.status === 403, "owner of B with A's id AND A's slug -> 403");
    r = await call("EDITOR", "extract-company", { companyId: A, slug: A_SLUG, releases: [{ date: "2026-01-01", text: "x".repeat(40) }] });
    ok(r.status === 200, "positive control: editor of A, consistent subject -> 200");
    const spent = (await egressLog()).slice(logStart).filter((e) => e.provider === "anthropic").length;
    ok(spent === 1, `AI spent only on the positive control (${spent})`);
  }

  // ================================================= /api/memory-save ==
  console.log("\n  /api/memory-save ON STAGING: roles, payload, isolation, concurrency");
  {
    await restore();
    const good = { companyStatus: { statusHeadline: `${MARK} probe` } };
    const priv = await privOfA();
    const snap = JSON.stringify(await profileOfA());
    for (const [k, want] of [[null, 401], ["EDITOR", 403], ["PUBLISHER", 403], ["STAFF", 403], ["ANALYST", 403], ["INVESTOR", 403], ["COMPANY_B", 403]]) {
      const r = await saveAs(k, { companyId: A, fields: good, baseUpdatedAt: await updatedAtOfA() });
      ok(r.status === want, `${k ? ROLES[k] : "anonymous"} -> ${want}`, `${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
    }
    const cases = [
      ["forged slug (A's id, B's slug)", { companyId: A, slug: B_SLUG, fields: good }, 400],
      ["owner_id in fields", { companyId: A, fields: { owner_id: who.COMPANY_B.user.id } }, 400],
      ["tier / status / slug in fields", { companyId: A, fields: { tier: "pro", status: "draft", slug: "stolen" } }, 400],
      ["pp (render payload) in fields", { companyId: A, fields: { pp: {} } }, 400],
      ["company.slug inside company", { companyId: A, fields: { company: { slug: "stolen" } } }, 400],
      ["no baseUpdatedAt", { companyId: A, fields: good, noBase: true }, 400],
    ];
    for (const [name, body, want] of cases) {
      const b = { ...body }; if (!b.noBase) b.baseUpdatedAt = await updatedAtOfA(); delete b.noBase;
      const r = await saveAs("COMPANY_A", b);
      ok(r.status === want, `owner of A, ${name} -> ${want}`, `${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
    }
    ok(JSON.stringify(await profileOfA()) === snap && JSON.stringify(await privOfA()) === JSON.stringify(priv), "DATABASE: after all refusals, profile and privileged columns unchanged");
    const r = await saveAs("COMPANY_B", { companyId: iso.ISOLATION_COMPANY_B_ID, slug: A_SLUG, fields: good, baseUpdatedAt: "x" });
    ok(r.status === 400, "owner of B: B's id with A's slug -> 400 (cannot be steered at A)");

    // Concurrency: owner, company admin and platform admin save on ONE base at once.
    for (let round = 0; round < 3; round++) {
      await restore();
      const b0 = await updatedAtOfA();
      const racers = ["COMPANY_A", "COADMIN", "ADMIN", "COMPANY_A", "COADMIN"];
      const rs = await Promise.all(racers.map((k, i) => saveAs(k, { companyId: A, fields: { companyStatus: { statusHeadline: `${MARK} racer ${i}` } }, baseUpdatedAt: b0 })));
      const winner = rs.findIndex((x) => x.status === 200);
      const stored = ((await profileOfA()).companyStatus || {}).statusHeadline;
      ok(rs.filter((x) => x.status === 200).length === 1 && rs.filter((x) => x.status === 409).length === 4 && stored === `${MARK} racer ${winner}`,
         `round ${round + 1}: 5 concurrent saves on one base -> one 200, four 409; the database holds the winner's card`, rs.map((x) => `${x.status}:${x.body.code || ""}`).join(","));
    }
    await restore();
    const stale = await updatedAtOfA();
    await saveAs("COMPANY_A", { companyId: A, fields: { companyStatus: { statusHeadline: `${MARK} first` } }, baseUpdatedAt: stale });
    const late = await saveAs("COADMIN", { companyId: A, fields: { companyStatus: { statusHeadline: `${MARK} late` } }, baseUpdatedAt: stale });
    ok(late.status === 409 && late.body.code === "stale_base" && ((await profileOfA()).companyStatus || {}).statusHeadline === `${MARK} first`, "a save from a stale read -> 409 stale_base; the newer save survives");
  }

  // ======================================== no other way to the profile ==
  console.log("\n  EDITORS AND PUBLISHERS HAVE NO OTHER WAY TO THE LIVE PROFILE");
  for (const k of ["EDITOR", "PUBLISHER"]) {
    await restore();
    const snap = JSON.stringify(await profileOfA());
    const H = { apikey: ANON, Authorization: `Bearer ${who[k].access_token}`, "content-type": "application/json" };
    let r = await realFetch(`${SB}/rest/v1/companies?id=eq.${A}`, { method: "PATCH", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ profile: { companyStatus: { statusHeadline: "bypass" } } }) });
    const rows = await r.json().catch(() => null);
    ok(Array.isArray(rows) && rows.length === 0, `${ROLES[k]}: direct PATCH of companies (the ProfileEditor / publish.js path) -> 0 rows (RLS)`);
    r = await realFetch(`${SB}/rest/v1/rpc/upsert_timeline_entry`, { method: "POST", headers: H, body: JSON.stringify({ p_company: A, p_entry: { key: "bypass", date: "2026-01-01" } }) });
    ok(r.status === 401 || r.status === 403 || r.status === 404, `${ROLES[k]}: rpc upsert_timeline_entry -> ${r.status} (revoked from users; the publishing pipeline only)`);
    // Real argument names, so a refusal is the function's own "not authorized",
    // not PostgREST failing to find the function.
    r = await realFetch(`${SB}/rest/v1/rpc/admin_set_billing`, { method: "POST", headers: H, body: JSON.stringify({ p_company: A, p_tier: "pro" }) });
    const rb = await r.json().catch(() => ({}));
    ok(r.status >= 400 && /not authorized/i.test(JSON.stringify(rb)), `${ROLES[k]}: rpc admin_set_billing -> ${r.status} "not authorized" (is_admin() check)`, JSON.stringify(rb).slice(0, 120));
    r = await realFetch(`${API}/api/build-from-website`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${who[k].access_token}` }, body: JSON.stringify({ companyId: A, url: "https://iso.invalid" }) });
    ok(r.status === 403, `${ROLES[k]}: /api/build-from-website (the other server-side profile writer) -> ${r.status}`);
    ok(JSON.stringify(await profileOfA()) === snap, `${ROLES[k]}: DATABASE: profile unchanged`);
  }

  // ================================================== saved-timeline path ==
  console.log("\n  STATUS CARD FROM THE SAVED TIMELINE (documents date nothing new)");
  await resetAiCounters();
  {
    await restore();
    // Make the saved profile hold a timeline, and leave only the undated page as text.
    await db(`companies?id=eq.${A}`, { method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ profile: { ...ORIGINAL, timeline: [{ id: "s1", title: "Saved live headline", date: "2025-06-01", category: "Drilling", summary: "why", key: true, ai: { whatHappened: "what" } }] } }) });
    const datedIds = corpusDocs.filter((d) => /\[d23-live\] 2026/.test(d.filename || "")).map((d) => d.id);
    await db(`documents?id=in.(${datedIds.join(",")})`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ extracted_text: null }) });
    const r = await consoleRebuild("COMPANY_A");
    const p = await profileOfA();
    ok(r.results && r.results.steps.overview.ok && r.results.steps.overview.source === "saved timeline", "overview step used the saved timeline", r.results && JSON.stringify(r.results.steps.overview));
    ok(/first headline: Saved live headline/.test((p.companyStatus || {}).latestUpdate || "") && /status from 1 releases/.test((p.companyStatus || {}).statusHeadline || ""), "DATABASE: status card regenerated from the saved timeline", JSON.stringify(p.companyStatus));
    ok(/from your saved timeline/.test(r.sum.text), `reported: "${r.sum.text}"`);
    for (const d of TEST_DOCS.filter((x) => x.doc_date)) {
      await db(`documents?company_id=eq.${A}&filename=eq.${encodeURIComponent(d.filename)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ extracted_text: d.extracted_text }) });
    }
  }

  // ===================================================== analyze new ==
  console.log("\n  ANALYZE NEW DOCUMENTS (owner), then reflected only after a verified save");
  await resetAiCounters();
  {
    await restore();
    await db(`documents?company_id=eq.${A}&filename=like.${encodeURIComponent(MARK + "*")}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ meta: {} }) });
    session = who.COMPANY_A; API_CALLS.length = 0;
    let r = null, err = null;
    try {
      r = await SR.analyzeNewDocuments(A, { token: session.access_token, deps });
      const sum = MA.summarizeSteps(r.steps, { timeline: r.routing.timelineAdded });
      if (sum.level === "error") throw new Error(sum.text);
      const { profile, updatedAt } = await MA.readCompanyProfile(A);
      const next = mergeIncremental(profile, r);
      await MA.saveCompanyProfile(A, next, updatedAt);
      await MEM.markReflected(r.reflectedIds);
    } catch (e) { err = e; }
    session = null;
    ok(!err && r && r.routing.newDocs >= 3, `runs to completion (it threw "str is not defined" before) -- ${r && JSON.stringify(r.routing)}`, err && err.message);
    ok(API_CALLS.length > 0 && API_CALLS.every((c) => c.companyId === A && c.status === 200), `every request names A, admitted (${API_CALLS.length})`, API_CALLS.map((c) => `${c.route}:${c.status}:${c.companyId ? "A" : "-"}:${c.error || ""}`).join(" | "));
    const docs = (await db(`documents?company_id=eq.${A}&filename=like.${encodeURIComponent(MARK + "*")}&select=meta`)).body;
    ok(docs.length === 3 && docs.every((d) => d.meta && d.meta.reflected), "DATABASE: the new documents are marked reflected after the save");
    // A viewer's run: refused, nothing marked.
    await db(`documents?company_id=eq.${A}&filename=like.${encodeURIComponent(MARK + "*")}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ meta: {} }) });
    session = who.STAFF;
    const v = await SR.analyzeNewDocuments(A, { token: session.access_token, deps }).catch((e) => ({ error: e }));
    session = null;
    ok(v.error ? true : MA.summarizeSteps(v.steps, {}).level === "error", "viewer: analyze-new is refused (or sees no documents) -> nothing saved");
    const docs2 = (await db(`documents?company_id=eq.${A}&filename=like.${encodeURIComponent(MARK + "*")}&select=meta`)).body;
    ok(docs2.every((d) => !(d.meta && d.meta.reflected)), "DATABASE: nothing marked reflected by the viewer's run");
  }

  // ============================================================ boundary ==
  ok(strayHosts.size === 0, "no request was addressed to any host but the local staging server and the staging project", [...strayHosts].join(", "));
  const log = await egressLog();
  ok(log.every((e) => e.action !== "block"), "staging egress guard: nothing blocked");
  ok(log.filter((e) => e.provider === "anthropic").every((e) => e.action === "mock"), "every AI call was the staging mock (none reached Anthropic)");
} finally {
  const r = await restore();
  const d = await db(`documents?company_id=eq.${A}&filename=like.${encodeURIComponent(MARK + "*")}`, { method: "DELETE" });
  const back = JSON.stringify(await profileOfA()) === JSON.stringify(ORIGINAL);
  console.log(`\n  cleanup: profile restored ${r.status < 300 && back ? "(verified identical)" : "FAILED"}; test documents removed (${d.status})`);
  if (!back) fail++;
}

console.log(`  memory-ai-live (staging): ${pass} passed, ${fail} failed  (client host rewrites to staging: ${rewrites})\n`);
process.exit(fail ? 1 : 0);
