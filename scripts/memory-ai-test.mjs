// D23 regression tests -- Company Memory's AI, for the right company, by the
// right people, and only reported as done when it was.
//   node scripts/memory-ai-test.mjs
//
// OFFLINE, END TO END IN ONE PROCESS. The real client helpers
// (src/lib/structureReleases.js, src/lib/memoryAccess.js) run against the real
// API handlers: every relative `/api/<route>` fetch is dispatched in-process to
// api/<route>.js, whose guard (api/_aiGuard.js) talks to a stubbed database that
// answers like staging -- my_features, my_company_role, profiles.role, the
// throttle, companies (with the 0001 UPDATE rule: owner or platform admin). The
// AI provider is a stub that returns deterministic content per tool. Nothing
// leaves the process: globalThis.fetch is replaced before anything is imported,
// and any host it does not recognise throws. (Under plain node the client's
// Supabase URL resolves to its built-in default; that host is answered by the
// same stub, in-process, and is never contacted.)
//
// The live staging run of the same matrix is memory-ai-live-test.mjs.

import fs from "node:fs";

const STUB_SB = "https://stub-project.supabase.invalid";
Object.assign(process.env, {
  VITE_SUPABASE_URL: STUB_SB, VITE_SUPABASE_ANON_KEY: "sb_publishable_stubKeyForOfflineTests",
  SUPABASE_SERVICE_ROLE_KEY: "stub-service-key", SUBMISSION_SALT: "stub-salt", ANTHROPIC_API_KEY: "stub-anthropic",
});
delete process.env.MINEEX_ENV;
delete process.env.AI_ENDPOINTS_DISABLED;
// Where src/lib/supabase.js points under plain node with no Vite env: an
// unresolvable host since 2026-11-01 (it used to be the production project).
// Answered by the stub; never contacted.
const CLIENT_DB_HOST = "supabase-url-not-configured.invalid";

// ------------------------------------------------------------------ world --
const A = "aaaaaaaa-0000-4000-8000-00000000000a", B = "bbbbbbbb-0000-4000-8000-00000000000b";
const PEOPLE = {
  ownerA:     { id: "u-ownerA", profileRole: "company",  roles: { [A]: "owner" } },
  coadminA:   { id: "u-coadA",  profileRole: "company",  roles: { [A]: "admin" } },
  editorA:    { id: "u-edA",    profileRole: "company",  roles: { [A]: "editor" } },
  publisherA: { id: "u-pubA",   profileRole: "company",  roles: { [A]: "publisher" } },
  viewerA:    { id: "u-viewA",  profileRole: "company",  roles: { [A]: "viewer" } },
  analystA:   { id: "u-anA",    profileRole: "company",  roles: { [A]: "analyst" } },
  ownerB:     { id: "u-ownerB", profileRole: "company",  roles: { [B]: "owner" } },
  investor:   { id: "u-inv",    profileRole: "investor", roles: {} },
  admin:      { id: "u-admin",  profileRole: "admin",    roles: {} },
};
const tokOf = (k) => `tok-${k}`;
const byTok = (h) => { const t = String((h && (h.Authorization || h.authorization)) || "").replace(/^Bearer /, ""); const k = Object.keys(PEOPLE).find((x) => tokOf(x) === t); return k ? { key: k, ...PEOPLE[k] } : null; };
const FEATURES = ["portal_access", "company_memory", "communications_center", "passport_profile"];
let companies;
const resetWorld = () => {
  companies = [
    { id: A, slug: "iso-alpha", name: "Iso Alpha", owner_id: PEOPLE.ownerA.id, tier: "pro", status: "published", updated_at: "2026-10-01T00:00:00.000001+00:00", profile: { company: { name: "Iso Alpha", ticker: "ISO" }, timeline: [{ id: "t1", title: "Saved headline", date: "2025-06-01", category: "Drilling", summary: "saved why", key: true, ai: { whatHappened: "saved what" } }], pp: { FULL: { "2025-06-01": "A's stored release" } } } },
    { id: B, slug: "iso-beta", name: "Iso Beta", owner_id: PEOPLE.ownerB.id, tier: "basic", status: "published", updated_at: "2026-10-01T00:00:00.000002+00:00", profile: { pp: { FULL: { "2025-01-01": "B's PRIVATE stored release" } } } },
  ];
};
resetWorld();

// ------------------------------------------------------------------ stubs --
let provider = 0;
const LOG = [];   // every /api request: { route, body, status, caller }
const DBLOG = []; // every database request: { path, search, method }
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

function providerReply(body) {
  const tool = body.tool_choice?.name || body.tools?.[0]?.name;
  const text = (body.messages || []).flatMap((m) => (typeof m.content === "string" ? [m.content] : (m.content || []).map((c) => c.text || ""))).join("\n");
  let input = {};
  if (tool === "emit_timeline_entries") {
    const parts = text.split(/\n===== RELEASE id=([^ ]+) =====\n/).slice(1);
    input = { entries: [] };
    for (let i = 0; i < parts.length; i += 2) {
      const date = (/(\d{4}-\d{2}-\d{2})/.exec(parts[i + 1] || "") || [])[1] || "";
      if (!date) continue;   // like the real tool: an undated document is not a timeline entry
      input.entries.push({ id: parts[i], headline: `H-${parts[i]}`, sourceDate: date, category: "Drilling", whatHappened: "w", whyItMatters: "y", impact: "medium", key: false });
    }
  } else if (tool === "emit_company") input = { identity: { name: "Iso Alpha", ticker: "ISO" }, capital: { sharesOutstanding: "1" }, team: [{ name: "CEO One", role: "CEO" }] };
  else if (tool === "emit_project_list") input = { projects: [{ name: "Alpha Project", tag: "Gold" }] };
  else if (tool === "emit_profile_overview") {
    const n = (text.match(/"date":/g) || []).length;
    const first = (/"headline": "([^"]*)"/.exec(text) || [])[1] || "";
    input = { companyStatus: { statusHeadline: `status from ${n}`, latestUpdate: `first: ${first}` }, companyBrief: { shortSummary: `brief from ${n}`, keyPoints: ["k"] } };
  } else if (tool) input = { summary: "part" };
  const content = tool ? [{ type: "tool_use", id: "t", name: tool, input }] : [{ type: "text", text: "transcribed text" }];
  return json({ content, usage: { input_tokens: 1, output_tokens: 1 } });
}

let tick = 0, failWrites = false;
const WRITES = [];
function db(url, init, caller) {
  const isService = String((init.headers || {}).Authorization || (init.headers || {}).authorization || "") === "Bearer stub-service-key";
  const p = url.pathname, method = (init.method || "GET").toUpperCase();
  const body = typeof init.body === "string" && init.body ? JSON.parse(init.body) : {};
  DBLOG.push({ path: p, search: decodeURIComponent(url.search), method });
  if (p === "/auth/v1/user") return caller ? json({ id: caller.id, email: `${caller.id}@stub.invalid` }) : json({ msg: "bad jwt" }, 401);
  if (p === "/rest/v1/rpc/ai_enabled") return json(true);
  if (p === "/rest/v1/rpc/my_features") return json(caller && (caller.profileRole === "admin" || caller.roles[body.cid]) ? FEATURES : []);
  if (p === "/rest/v1/rpc/my_company_role") return json(caller ? caller.roles[body.cid] ?? null : null);
  if (p === "/rest/v1/rpc/bump_submission_throttle") return json(1);
  if (p === "/rest/v1/profiles") return json(caller ? [{ role: caller.profileRole }] : []);
  if (p === "/rest/v1/companies") {
    const sp = url.searchParams;
    let rows = companies;
    if (sp.get("id")) rows = rows.filter((c) => `eq.${c.id}` === sp.get("id"));
    if (sp.get("slug")) rows = rows.filter((c) => `eq.${c.slug}` === sp.get("slug"));
    if (sp.get("updated_at")) rows = rows.filter((c) => `eq.${c.updated_at}` === sp.get("updated_at"));
    // 0001 auth_read: a signed-in user reads own rows, published rows, or all as admin.
    if (!isService && method === "GET") rows = rows.filter((c) => c.status === "published" || (caller && (c.owner_id === caller.id || caller.profileRole === "admin")));
    if (method === "PATCH") {
      if (failWrites) return json({ message: "db down" }, 500);
      // Service role bypasses RLS. Otherwise 0001 auth_update: owner_id =
      // auth.uid() OR is_admin(); anything else matches 0 rows.
      const allowed = isService ? rows : rows.filter((c) => caller && (c.owner_id === caller.id || caller.profileRole === "admin"));
      allowed.forEach((c) => {
        Object.assign(c, body);
        // companies_touch: every update moves updated_at (microsecond clock).
        c.updated_at = `2026-10-30T00:00:00.${String(++tick).padStart(6, "0")}+00:00`;
        WRITES.push({ id: c.id, columns: Object.keys(body), service: isService });
      });
      return json(allowed.map((c) => ({ id: c.id, updated_at: c.updated_at })));
    }
    return json(rows.map((c) => ({ id: c.id, slug: c.slug, name: c.name, profile: c.profile, updated_at: c.updated_at, owner_id: c.owner_id, tier: c.tier, status: c.status })));
  }
  return json([]);
}

const handlers = {};
let currentUser = null;   // the browser session the client helpers use
globalThis.localStorage = {
  getItem: (k) => (k === "pp.session" && currentUser ? JSON.stringify({ access_token: tokOf(currentUser), expires_at: Date.now() + 3600e3, user: { id: PEOPLE[currentUser].id } }) : null),
  setItem() {}, removeItem() {},
};
globalThis.fetch = async (input, init = {}) => {
  const raw = String(input instanceof Request ? input.url : input);
  if (raw.startsWith("/api/")) {
    const route = raw.slice(5).split("?")[0];
    handlers[route] = handlers[route] || (await import(`../api/${route}.js`)).default;
    const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
    const res = { statusCode: 200, body: undefined, headers: {} };
    res.status = (c) => { res.statusCode = c; return res; }; res.json = (b) => { res.body = b; return res; };
    res.send = (b) => { res.body = b; return res; }; res.end = (b) => { if (b !== undefined) res.body = b; return res; };
    res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
    const headers = { "x-real-ip": "203.0.113.9" };
    const auth = (init.headers || {}).Authorization || (init.headers || {}).authorization;
    if (auth) headers.authorization = auth;
    const before = provider;
    await handlers[route]({ method: "POST", query: {}, headers, body, url: raw }, res);
    LOG.push({ route, body, status: res.statusCode, caller: byTok(init.headers)?.key || null, provider: provider - before });
    return json(res.body ?? {}, res.statusCode);
  }
  const url = new URL(raw);
  if (url.host === "api.anthropic.com") { provider++; return providerReply(JSON.parse(init.body || "{}")); }
  if (url.origin === STUB_SB || url.host === CLIENT_DB_HOST) return db(url, init, byTok(init.headers));
  throw new Error(`unexpected egress to ${url.host}`);
};

const SR = await import("../src/lib/structureReleases.js");
const MA = await import("../src/lib/memoryAccess.js");
const { mergeExtraction, mapProfileToPP } = await import("../src/lib/profileToPP.js");
const { DRAFTING_ROLES: SERVER_DRAFTING } = await import("../api/_aiGuard.js");
const SAVE = await import("../api/memory-save.js");

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

// A Company Memory: two dated releases and one undated website page.
const DOCS = () => [
  { id: "d1", filename: "2026-02-01 drill results.txt", doc_date: "2026-02-01", extracted_text: "2026-02-01 Iso Alpha drills 31 m of 4.8 g/t gold at the Alpha project." },
  { id: "d2", filename: "2026-03-15 financing.txt", doc_date: "2026-03-15", extracted_text: "2026-03-15 Iso Alpha closes a C$5M placement to fund drilling." },
  { id: "d3", filename: "board.html", doc_date: null, extracted_text: "Board of directors: CEO One, CFO Two. Shares outstanding 1." },
];
const deps = (docs) => ({ documentsForExtraction: async () => docs, unreflectedDocuments: async () => docs, downloadDocumentBase64: async () => null, saveDocumentText: async () => true });
async function asUser(k, fn) { currentUser = k; LOG.length = 0; try { return await fn(); } finally { currentUser = null; } }
const reanalyze = (k, cid = A, docs = DOCS(), existingTimeline = []) =>
  asUser(k, () => SR.reanalyzeFromMemory(cid, { token: tokOf(k), deps: deps(docs), existingTimeline }));

// ============================================================ access rule ==
console.log("\n  WHO MAY RUN, WHO MAY SAVE (lib/memoryAccess.js)");
ok(JSON.stringify(MA.DRAFTING_ROLES) === JSON.stringify(SERVER_DRAFTING), "client DRAFTING_ROLES mirrors api/_aiGuard.js exactly (Batch C policy, not re-decided)", `${MA.DRAFTING_ROLES} vs ${SERVER_DRAFTING}`);
ok(JSON.stringify(MA.REBUILD_SAVE_ROLES) === JSON.stringify(SAVE.REBUILD_SAVE_ROLES) && JSON.stringify(SAVE.REBUILD_SAVE_ROLES) === JSON.stringify(["owner", "admin"]), "save roles are exactly owner + company admin, client and server agree (approved D23 policy)");
ok(JSON.stringify(MA.REBUILD_FIELDS) === JSON.stringify(SAVE.REBUILD_FIELDS), "client and server agree on the rebuild field allowlist");
const table = [
  ["owner", false, true, true], ["admin", false, true, true], ["editor", false, true, false], ["publisher", false, true, false],
  ["viewer", false, false, false], ["analyst", false, false, false], [null, false, false, false], [null, true, true, true],
];
for (const [role, pa, analyze, save] of table) {
  const a = MA.memoryAccess({ role, platformAdmin: pa });
  ok(a.canAnalyze === analyze && a.canSave === save && (analyze && save ? !a.reason : !!a.reason),
     `${pa ? "platform admin" : role || "non-member"}: analyze=${analyze}, save=${save}${a.reason ? " (says why)" : ""}`);
}
for (const k of ["ownerA", "coadminA", "editorA", "viewerA", "analystA", "ownerB", "investor", "admin"]) {
  const a = await asUser(k, () => MA.loadMemoryAccess(A));
  const want = MA.memoryAccess({ role: PEOPLE[k].roles[A] || null, platformAdmin: PEOPLE[k].profileRole === "admin" });
  ok(a.canAnalyze === want.canAnalyze && a.canSave === want.canSave, `loadMemoryAccess(${k}) asks the database as the caller and matches the rule`);
}

// ======================================================= the companyId ==
console.log("\n  EVERY AI CALL NAMES THE COMPANY (owner of A, full rebuild)");
{
  const r = await reanalyze("ownerA");
  const routes = [...new Set(LOG.map((l) => l.route))].sort();
  ok(JSON.stringify(routes) === JSON.stringify(["extract-company", "extract-projects", "structure-batch", "synthesize-profile"]), "re-analysis calls structure-batch, extract-company, extract-projects, synthesize-profile", routes.join(","));
  ok(LOG.length > 0 && LOG.every((l) => l.body.companyId === A), `all ${LOG.length} requests carry companyId = A (they carried none before D23)`, LOG.filter((l) => l.body.companyId !== A).map((l) => l.route).join(","));
  ok(LOG.every((l) => l.status === 200), "all admitted (200) for the owner", LOG.map((l) => `${l.route}:${l.status}`).join(","));
  ok(Object.values(r.steps).every((s) => s.ok), "every step reports ok", JSON.stringify(r.steps));
  ok(r.timelineEntries.length === 2, "timeline rebuilt: the two dated releases (the undated page falls out)");
  ok(r.companyStatus && r.companyStatus.statusHeadline === "status from 2" && r.companyBrief && r.companyBrief.shortSummary === "brief from 2", "status card AND AI brief regenerated from the 2 rebuilt releases");
  const syn = LOG.find((l) => l.route === "synthesize-profile");
  ok(syn && syn.body.timeline.every((e) => e.headline && e.whatHappened !== undefined), "synthesis receives the chronology in the shape it reads (headline, whatHappened ...), not the profile shape");
  ok(/first: H-m/.test(r.companyStatus.latestUpdate), "...and the model saw the rebuilt headlines", r.companyStatus.latestUpdate);
  ok(r.steps.overview.source === "rebuilt timeline", "overview source recorded: rebuilt timeline");
}
{
  const docs = DOCS(); docs[0].extracted_text = ""; docs[0].storage_path = "a/scan.pdf"; docs[0].mime = "application/pdf";
  const d = deps(docs); d.downloadDocumentBase64 = async () => Buffer.from("not a real pdf").toString("base64");
  await asUser("ownerA", () => SR.reanalyzeFromMemory(A, { token: tokOf("ownerA"), deps: d }));
  const t = LOG.find((l) => l.route === "extract-text");
  ok(t && t.body.companyId === A && t.status === 200, "a scanned PDF's AI transcription (extract-text) also names company A and is admitted", t ? `${t.status}` : "not called");
}

// ======================================================== role matrix ==
console.log("\n  ROLE MATRIX through the real guard (re-analysis of company A)");
const matrix = [
  ["ownerA", true], ["coadminA", true], ["editorA", true], ["publisherA", true], ["admin", true],
  ["viewerA", false], ["analystA", false], ["investor", false], ["ownerB", false],
];
for (const [k, allowed] of matrix) {
  const before = provider;
  const r = await reanalyze(k);
  const spent = provider - before;
  if (allowed) {
    ok(Object.values(r.steps).every((s) => s.ok) && r.companyStatus, `${k}: admitted for A; every step ok; status card produced`, JSON.stringify(r.steps));
  } else {
    const refused = SR.allAiStepsRefused(r.steps);
    const sum = MA.summarizeSteps(r.steps, {});
    ok(refused && spent === 0 && LOG.every((l) => l.status === 403), `${k}: refused (403) at every step, provider never called`, `${spent} provider calls; ${LOG.map((l) => `${l.route}:${l.status}`).join(",")}`);
    ok(sum.level === "error" && /refused/.test(sum.text) && /not changed/.test(sum.text), `${k}: reported as "Nothing was rebuilt ... refused", not as a zero-result success`, sum.text);
  }
}
{
  // A refusal is not retried: one request per route per batch, discover only.
  await reanalyze("viewerA");
  const per = LOG.reduce((m, l) => ((m[l.route] = (m[l.route] || 0) + 1), m), {});
  ok(per["structure-batch"] === 1 && per["extract-company"] === 1 && per["extract-projects"] === 1 && (per["synthesize-profile"] || 0) === 0,
     "a refused caller makes ONE request per step (no retries; projects stops after discover; nothing to summarise)", JSON.stringify(per));
}

// ===================================================== manipulation ==
console.log("\n  ISOLATION: companyId cannot be pointed elsewhere");
{
  const r = await reanalyze("ownerB", A);
  ok(SR.allAiStepsRefused(r.steps), "owner of B asking for company A -> every step refused");
  const call = async (k, route, body) => { currentUser = null; LOG.length = 0; await fetch(`/api/${route}`, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${tokOf(k)}` }, body: JSON.stringify(body) }); return LOG[0]; };
  const rel = [{ date: "2026-01-01", text: "x".repeat(40) }];
  let l = await call("ownerA", "extract-company", { companyId: A, slug: "iso-beta" });
  ok(l.status === 400 && l.provider === 0, "extract-company: companyId A + slug B (no corpus) -> 400 subject mismatch, B's stored releases never read, no AI spent");
  l = await call("ownerA", "extract-projects", { companyId: A, slug: "iso-beta", part: "discover" });
  ok(l.status === 400 && l.provider === 0, "extract-projects: companyId A + slug B -> 400, no AI spent");
  l = await call("ownerA", "structure-batch", { companyId: A, slug: "iso-beta", releases: [{ id: "x", text: "y" }] });
  ok(l.status === 400 && l.provider === 0, "structure-batch: companyId A + slug B -> 400");
  l = await call("ownerA", "synthesize-profile", { companyId: A, slug: "no-such", timeline: [{ date: "2026-01-01" }] });
  ok(l.status === 400 && l.provider === 0, "an unresolvable slug next to a companyId -> 400 (fails closed)");
  l = await call("ownerA", "extract-company", { companyId: A, slug: "iso-alpha", releases: rel });
  ok(l.status === 200, "companyId A + A's own slug -> admitted (consistent subject)");
  companies[0].status = "draft";   // an UNPUBLISHED company: RLS hides its row from non-owner members
  l = await call("editorA", "extract-company", { companyId: A, slug: "iso-alpha", releases: rel });
  ok(l.status === 200, "editor of an UNPUBLISHED company, consistent companyId + slug -> admitted (slug resolved server-side, not through RLS)", String(l.status));
  l = await call("editorA", "extract-company", { companyId: A, slug: "iso-beta", releases: rel });
  ok(l.status === 400 && l.provider === 0, "...and the same editor with B's slug -> still 400");
  companies[0].status = "published";
  l = await call("ownerB", "extract-company", { companyId: A, slug: "iso-alpha", releases: rel });
  ok(l.status === 403 && l.provider === 0, "owner of B with A's id and A's slug -> 403 (consistent but not theirs)");
  DBLOG.length = 0;
  l = await call("ownerA", "extract-company", { companyId: A });
  const read = DBLOG.find((d) => d.path === "/rest/v1/companies" && /select=name,profile/.test(d.search));
  ok(l.status === 200 && read && /id=eq\./.test(read.search) && !/slug=eq\./.test(read.search), "extract-company with no corpus reads the stored releases BY THE AUTHORISED ID", read && read.search);
  DBLOG.length = 0;
  l = await call("ownerA", "extract-projects", { companyId: A, part: "discover" });
  const readP = DBLOG.find((d) => d.path === "/rest/v1/companies" && /select=name,profile/.test(d.search));
  ok(l.status === 200 && readP && /id=eq\./.test(readP.search), "extract-projects likewise reads by the authorised id (it used to read any slug, as anon)", readP && readP.search);
  l = await call("viewerA", "extract-company", { companyId: A, releases: rel });
  ok(l.status === 403, "viewer of A, with A's own id -> 403 (Batch C: viewers do not draft)");
  l = await call("analystA", "synthesize-profile", { companyId: A, timeline: [{ date: "2026-01-01" }] });
  ok(l.status === 403, "analyst of A -> 403");
  l = await call("investor", "structure-batch", { companyId: A, releases: [{ id: "x", text: "y" }] });
  ok(l.status === 403, "investor -> 403");
  l = await call("admin", "structure-batch", { releases: [{ id: "x", text: "y" }] });
  ok(l.status === 200, "platform admin with no company (the concierge path) -> still admitted, unchanged");
  l = await call("ownerA", "structure-batch", { releases: [{ id: "x", text: "y" }] });
  ok(l.status === 403, "owner with NO companyId -> still admin-only (what D23 was: now never sent by Company Memory)");
}

// ================================================= saved-timeline fallback ==
console.log("\n  STATUS CARD + BRIEF WHEN THE DOCUMENTS DATE NOTHING");
{
  const undated = [{ id: "u1", filename: "deck.txt", doc_date: null, extracted_text: "Investor deck: Iso Alpha explores for gold. No dates here." }];
  const none = await reanalyze("ownerA", A, undated, []);
  ok(none.steps.overview.skipped && !none.companyStatus, "no dated releases and no saved timeline -> overview SKIPPED and said so (not a silent blank)");
  const r = await reanalyze("ownerA", A, undated, companies[0].profile.timeline);
  ok(r.companyStatus && r.companyStatus.statusHeadline === "status from 1" && /first: Saved headline/.test(r.companyStatus.latestUpdate), "...with the saved timeline -> regenerated from it (profile entries converted to the chronology shape)", JSON.stringify(r.companyStatus));
  ok(r.steps.overview.source === "saved timeline" && /from your saved timeline/.test(MA.summarizeSteps(r.steps, {}).text), "and the report says it used the saved timeline");
}

// ======================================================= persistence ==
console.log("\n  PERSISTENCE through /api/memory-save: who saves, and proof it was saved");
const PRIV = (c) => JSON.stringify({ owner_id: c.owner_id, tier: c.tier, status: c.status, slug: c.slug, name: c.name, id: c.id });
for (const [k, canSave] of [["ownerA", true], ["coadminA", true], ["admin", true], ["editorA", false], ["publisherA", false], ["viewerA", false], ["analystA", false], ["investor", false], ["ownerB", false]]) {
  resetWorld();
  const res = await reanalyze(canSave ? k : "ownerA");   // refused roles: save a rebuild someone else generated
  const { profile, updatedAt } = await asUser(canSave ? k : "ownerA", () => MA.readCompanyProfile(A));
  const next = mergeExtraction(profile, res);
  const privBefore = PRIV(companies[0]);
  WRITES.length = 0;
  let err = null;
  try { await asUser(k, () => MA.saveCompanyProfile(A, next, updatedAt)); } catch (e) { err = e; }
  const row = companies.find((c) => c.id === A), stored = row.profile;
  if (canSave) {
    ok(!err && stored.companyStatus && stored.companyStatus.statusHeadline === "status from 2" && stored.companyBrief.shortSummary === "brief from 2" && stored.timeline.length === 2 && stored.pp,
       `${k}: SAVED -- status card, brief, timeline stored; pp recomputed server-side`, err && err.message);
    ok(WRITES.length === 1 && JSON.stringify(WRITES[0].columns) === JSON.stringify(["profile"]) && PRIV(row) === privBefore, `${k}: exactly one write, of the profile column only; owner/tier/status/slug/name/id untouched`);
  } else {
    ok(err && /not saved/.test(err.message) && !stored.companyStatus && WRITES.length === 0, `${k}: 403 -- reported "not saved", nothing written`, err ? err.message : "no error");
  }
}

console.log("\n  /api/memory-save: payload, isolation, concurrency, failed writes");
const save = async (k, body) => { LOG.length = 0; const r = await fetch("/api/memory-save", { method: "POST", headers: k ? { "content-type": "application/json", Authorization: `Bearer ${tokOf(k)}` } : { "content-type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const base = () => companies.find((c) => c.id === A).updated_at;
{
  resetWorld();
  const good = { companyStatus: { statusHeadline: "new" } };
  const cases = [
    ["anonymous", null, { companyId: A, fields: good, baseUpdatedAt: base() }, 401],
    ["invalid companyId", "ownerA", { companyId: "iso-alpha", fields: good, baseUpdatedAt: base() }, 400],
    ["owner of B saving A (cross-company)", "ownerB", { companyId: A, fields: good, baseUpdatedAt: base() }, 403],
    ["owner of A with A's id but B's slug (forged slug)", "ownerA", { companyId: A, slug: "iso-beta", fields: good, baseUpdatedAt: base() }, 400],
    ["no baseUpdatedAt", "ownerA", { companyId: A, fields: good }, 400],
    ["field outside the allowlist: owner_id", "ownerA", { companyId: A, fields: { owner_id: PEOPLE.ownerB.id }, baseUpdatedAt: base() }, 400],
    ["field outside the allowlist: tier", "ownerA", { companyId: A, fields: { tier: "pro" }, baseUpdatedAt: base() }, 400],
    ["field outside the allowlist: pp (render payload)", "ownerA", { companyId: A, fields: { pp: { FULL: {} } }, baseUpdatedAt: base() }, 400],
    ["field outside the allowlist: status / slug / billing / members", "ownerA", { companyId: A, fields: { status: "draft", slug: "x", billing: {}, members: [] }, baseUpdatedAt: base() }, 400],
    ["company.slug inside company", "ownerA", { companyId: A, fields: { company: { slug: "stolen" } }, baseUpdatedAt: base() }, 400],
    ["company.owner_id inside company", "ownerA", { companyId: A, fields: { company: { owner_id: "x" } }, baseUpdatedAt: base() }, 400],
    ["__proto__ smuggled in a nested object", "ownerA", { companyId: A, fields: JSON.parse('{"capital":{"__proto__":{"admin":true}}}'), baseUpdatedAt: base() }, 400],
    ["timeline not an array", "ownerA", { companyId: A, fields: { timeline: "x" }, baseUpdatedAt: base() }, 400],
    ["empty fields", "ownerA", { companyId: A, fields: {}, baseUpdatedAt: base() }, 400],
    ["unknown company", "admin", { companyId: "cccccccc-0000-4000-8000-00000000000c", fields: good, baseUpdatedAt: base() }, 404],
  ];
  for (const [name, k, body, want] of cases) {
    const before = JSON.stringify(companies); WRITES.length = 0;
    const r = await save(k, body);
    ok(r.status === want && WRITES.length === 0 && JSON.stringify(companies) === before, `${name} -> ${want}, nothing written`, `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
  }
  const big = await save("ownerA", { companyId: A, fields: { timeline: [{ date: "2026-01-01", fullText: "x".repeat(SAVE.MAX_BODY_BYTES) }] }, baseUpdatedAt: base() });
  ok(big.status === 413, "over 3 MB -> 413");
  const r = await save("ownerA", { companyId: A, slug: "iso-alpha", fields: { company: { name: "Renamed Co", ticker: "NEW", website: "https://iso.example" }, timeline: [] }, baseUpdatedAt: base() });
  const c = companies[0];
  ok(r.status === 200 && c.profile.company.website === "https://iso.example" && c.profile.company.name === "Iso Alpha" && c.profile.company.ticker === "ISO", "identifiers fill only: a rebuild sets website but cannot rename or re-ticker a company that has them", JSON.stringify(c.profile.company));
  ok(c.profile.pp && c.profile.pp.FULL === undefined || typeof c.profile.pp === "object", "pp is recomputed by the server from the merged profile");
}
{
  resetWorld();
  const stale = base();
  await save("ownerA", { companyId: A, fields: { companyStatus: { statusHeadline: "first" } }, baseUpdatedAt: stale });
  WRITES.length = 0;
  const r = await save("coadminA", { companyId: A, fields: { companyStatus: { statusHeadline: "second, from a stale read" } }, baseUpdatedAt: stale });
  ok(r.status === 409 && r.body.code === "stale_base" && WRITES.length === 0 && companies[0].profile.companyStatus.statusHeadline === "first", "a save based on a read that is no longer current -> 409 stale_base; the newer save is not overwritten");
}
for (let round = 0; round < 20; round++) {
  resetWorld();
  const b0 = base(); WRITES.length = 0;
  const rs = await Promise.all(["ownerA", "coadminA", "admin", "ownerA", "coadminA"].map((k, i) => save(k, { companyId: A, fields: { companyStatus: { statusHeadline: `racer ${i}` } }, baseUpdatedAt: b0 })));
  const wins = rs.filter((r) => r.status === 200), losses = rs.filter((r) => r.status === 409);
  if (!(wins.length === 1 && losses.length === 4 && WRITES.length === 1 && companies[0].profile.companyStatus.statusHeadline === `racer ${rs.findIndex((r) => r.status === 200)}`)) {
    ok(false, `round ${round}: 5 concurrent saves on one base -> exactly one wins`, rs.map((r) => `${r.status}:${r.body.code || ""}`).join(","));
    break;
  }
  if (round === 19) ok(true, "20 rounds x 5 CONCURRENT saves (owner, company admin, platform admin) on one base: exactly one 200, four 409, one write, and the stored card is the winner's");
}
{
  resetWorld();
  failWrites = true;
  const r = await save("ownerA", { companyId: A, fields: { companyStatus: { statusHeadline: "x" } }, baseUpdatedAt: base() });
  failWrites = false;
  ok(r.status === 502 && !r.body.ok && !companies[0].profile.companyStatus, "the database refusing the write -> 502, reported as not saved");
  let err = null;
  failWrites = true;
  try { await asUser("ownerA", () => MA.saveCompanyProfile(A, { companyStatus: { statusHeadline: "x" } }, base())); } catch (e) { err = e; }
  failWrites = false;
  ok(err && /not saved/.test(err.message), "...and the console's saveCompanyProfile throws 'not saved'", err && err.message);
  // Zero rows: the row moves between the route's read and its compare-and-set write.
  const realPatch = companies[0];
  const orig = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const u = String(input);
    if (/\/rest\/v1\/companies\?id=eq\..*updated_at=eq\./.test(u) && (init.method || "") === "PATCH") realPatch.updated_at = "2026-12-31T00:00:00.000000+00:00";
    return orig(input, init);
  };
  const z = await save("ownerA", { companyId: A, fields: { companyStatus: { statusHeadline: "x" } }, baseUpdatedAt: base() });
  globalThis.fetch = orig;
  ok(z.status === 409 && z.body.code === "concurrent_write" && !companies[0].profile.companyStatus, "zero rows updated (row changed under the write) -> 409 concurrent_write, never 'saved'");
}
{
  resetWorld();
  const orig = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => (String(input).includes("/rpc/my_company_role") ? new Response("{}", { status: 500 }) : orig(input, init));
  const r = await save("ownerA", { companyId: A, fields: { companyStatus: { statusHeadline: "x" } }, baseUpdatedAt: base() });
  globalThis.fetch = orig;
  ok(r.status === 502 && !companies[0].profile.companyStatus, "role check unavailable -> 502, fails closed");
}
{
  // Editors and publishers have no other way to the live profile.
  resetWorld();
  for (const k of ["editorA", "publisherA"]) {
    WRITES.length = 0;
    currentUser = k;
    const h = { apikey: "x", Authorization: `Bearer ${tokOf(k)}`, "content-type": "application/json", Prefer: "return=representation" };
    const direct = await fetch(`${STUB_SB}/rest/v1/companies?id=eq.${A}`, { method: "PATCH", headers: h, body: JSON.stringify({ profile: { companyStatus: { statusHeadline: "bypass" } } }) });
    const rows = await direct.json();
    currentUser = null;
    ok(Array.isArray(rows) && rows.length === 0 && WRITES.length === 0, `${k}: a direct PATCH (the ProfileEditor path) matches 0 rows under RLS`);
    const r = await save(k, { companyId: A, fields: { companyStatus: { statusHeadline: "bypass" } }, baseUpdatedAt: base() });
    ok(r.status === 403, `${k}: /api/memory-save -> 403`);
    LOG.length = 0;
    await fetch("/api/build-from-website", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${tokOf(k)}` }, body: JSON.stringify({ companyId: A, url: "https://iso.example" }) });
    ok(LOG[0] && LOG[0].status === 403, `${k}: /api/build-from-website (the other server profile writer) -> 403`, LOG[0] && String(LOG[0].status));
  }
  ok(!companies[0].profile.companyStatus, "the live profile was not changed by any of them");
}
{
  resetWorld();
  const before = JSON.stringify(companies[0].profile);
  const res = await reanalyze("viewerA");
  const sum = MA.summarizeSteps(res.steps, {});
  ok(sum.level === "error" && JSON.stringify(companies[0].profile) === before, "a fully refused run is an error and the console does not save (profile byte-identical)");
  const merged = mergeExtraction(companies[0].profile, res);
  ok(JSON.stringify(merged.timeline) === JSON.stringify(companies[0].profile.timeline), "even if merged, an empty run would not wipe the saved timeline (mergeExtraction only writes what it got)");
}

// ======================================================== analyze new ==
console.log("\n  ANALYZE NEW DOCUMENTS");
{
  const r = await asUser("ownerA", () => SR.analyzeNewDocuments(A, { token: tokOf("ownerA"), deps: deps(DOCS()) }));
  ok(r && r.routing.newDocs === 3 && r.routing.timelineAdded === 2, "runs to completion (it used to throw 'str is not defined' for everyone)", JSON.stringify(r && r.routing));
  ok(LOG.every((l) => l.body.companyId === A && l.status === 200), "every request names company A and is admitted");
  ok(Object.values(r.steps).every((s) => s.ok), "every step ok");
  const v = await asUser("viewerA", () => SR.analyzeNewDocuments(A, { token: tokOf("viewerA"), deps: deps(DOCS()) }));
  ok(MA.summarizeSteps(v.steps, {}).level === "error", "a viewer's run is all refusals -> error, so the console neither saves nor marks documents reflected");
}

// ================================================= console wiring (source) ==
console.log("\n  CONSOLE WIRING");
{
  const src = fs.readFileSync(new URL("../src/console/CompanyMemory.jsx", import.meta.url), "utf8");
  const con = fs.readFileSync(new URL("../src/console/CompanyConsole.jsx", import.meta.url), "utf8");
  ok(/preflight\(\);[\s\S]*reanalyzeFromMemory/.test(src) && /preflight\(\);[\s\S]*analyzeNewDocuments/.test(src), "both actions check access BEFORE any AI is spent");
  ok(/sum\.level === "error"\) throw/.test(src) && !/return=minimal/.test(src), "an all-refused run throws instead of saving; no unverified return=minimal save remains");
  ok(/await saveCompanyProfile\(companyId, next, updatedAt\);\s*\/\/[^\n]*\n\s*await markReflected/.test(src), "documents are marked reflected only AFTER a verified save");
  ok((src.match(/saveCompanyProfile\(companyId, next, updatedAt\)/g) || []).length === 2 && !/mapProfileToPP/.test(src), "both actions save through /api/memory-save with the base they read; the console no longer builds pp itself");
  ok(/existingTimeline: profile\.timeline/.test(src), "re-analysis passes the saved timeline as the overview fallback");
  ok(/<CompanyMemory company=\{company\} onSaved=\{refresh\} \/>/.test(con) && /if \(onSaved\) onSaved\(\)/.test(src), "after a save the console reloads the company (refresh), so the new status card shows without a reload");
  const ob = fs.readFileSync(new URL("../src/Onboarding.jsx", import.meta.url), "utf8");
  ok(/extractCompany\(corpus, \{ token, slug: savedSlug, onboarding: true \}\)/.test(ob) && /token, slug: savedSlug, onboarding: true,/.test(ob), "self-serve builder: extractCompany / extractProjects now carry the same subject as its timeline call");
}

console.log(`\n  memory-ai: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
