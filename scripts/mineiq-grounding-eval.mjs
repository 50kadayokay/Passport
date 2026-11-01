// a19: Mine IQ grounding and citations — offline evaluation harness.
//
//   node scripts/mineiq-grounding-eval.mjs           mocked provider (default, free)
//   node scripts/mineiq-grounding-eval.mjs --verbose also prints why each bad answer failed
//   node scripts/mineiq-grounding-eval.mjs --real    real provider -- COSTS MONEY,
//                                                    needs the user's approval and
//                                                    MINEIQ_EVAL_REAL_APPROVED=1
//
// WHAT RUNS
// ---------
// The SHIPPED handler (api/compose.js, mode "ask") against fixture company
// records (scripts/fixtures/mineiq-grounding.json). The network is stubbed:
// Supabase answers like the database would (auth, entitlement, the companies
// row, mineiq_search with its 0050a contract), and the AI provider is a scripted
// mock that is never called for real unless --real is passed.
//
// WHAT IS CHECKED
// ---------------
//   A. Retrieval reaching the prompt: the right records, each with its date (so
//      it can be cited); superseded facts and other companies' records absent.
//   B. Deterministic refusals: no readable company record -> canned refusal,
//      provider never called; another company's id -> refused by the guard.
//   C. The grader (api/_mineiqGrounding.js + the rules below) on scripted
//      answers: every "good" answer passes, every "bad" one -- invented drill
//      result, invented resource or financials, missing citation, stale value
//      only, change hidden, one side of a contradiction -- fails for the
//      expected reason. This proves the grader can tell them apart before it is
//      trusted on a real model.
//   D. The response the UI receives: grounded is false for a refusal, and an
//      invented figure comes back in unsupported_figures.
//   E. (--real only) the same cases with the real model's answers, graded.
//
// Supersession is enforced in SQL (mineiq_search: f.superseded_by is null).
// The stub mirrors that contract; scripts/mineiq-search-supersession-check.mjs
// proves the SQL itself on staging (rolled back, run by S4).

import fs from "node:fs";

const REAL = process.argv.includes("--real");
const FIX = JSON.parse(fs.readFileSync(new URL("./fixtures/mineiq-grounding.json", import.meta.url), "utf8"));
const A = "aaaaaaaa-0000-4000-8000-0000000000a1";
const B = "bbbbbbbb-0000-4000-8000-0000000000b2";
const HIDDEN = "cccccccc-0000-4000-8000-0000000000c3"; // a member whose companies row RLS hides

if (REAL) {
  if (process.env.MINEIQ_EVAL_REAL_APPROVED !== "1" || !process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.length < 40) {
    console.log([
      "mineiq-grounding-eval --real: NOT RUN.",
      "A real run calls the AI provider (gpt-4o-mini by default, AI_MODEL_ASK overrides):",
      `${FIX.cases.length} questions, one call each, roughly 3k input + 300 output tokens per call.`,
      "It needs the user's approval. Once approved, run with a real key in the environment:",
      "  MINEIQ_EVAL_REAL_APPROVED=1 OPENAI_API_KEY=<key> node scripts/mineiq-grounding-eval.mjs --real",
    ].join("\n"));
    process.exit(0);
  }
}

const STUB_SB = "https://stub-project.supabase.invalid";
Object.assign(process.env, {
  VITE_SUPABASE_URL: STUB_SB, VITE_SUPABASE_ANON_KEY: "sb_publishable_stubKeyForOfflineTests",
  SUPABASE_SERVICE_ROLE_KEY: "stub-service-key", SUBMISSION_SALT: "stub-salt",
  ...(REAL ? {} : { OPENAI_API_KEY: "stub-openai" }),
});
delete process.env.MINEEX_ENV;
delete process.env.AI_ENDPOINTS_DISABLED;

const IDS = {
  "tok-ownerA":  { id: "u-ownerA", roles: { [A]: "owner" } },
  "tok-viewerA": { id: "u-viewA",  roles: { [A]: "viewer" } },
  "tok-hidden":  { id: "u-hidden", roles: { [HIDDEN]: "owner" } },
};
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const who = (h) => IDS[String((h && (h.Authorization || h.authorization)) || "").replace(/^Bearer /, "")];

// The scripted model. `nextAnswer` is what it says; `lastPrompt` is what it was sent.
let nextAnswer = "";
let lastPrompt = null;
let providerCalls = 0;
const realFetch = globalThis.fetch;

const words = (t) => String(t || "").toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) || [];

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  const body = typeof init.body === "string" ? init.body : "";
  const caller = who(init.headers);
  if (url.host === "api.openai.com" || url.host === "api.anthropic.com") {
    providerCalls++;
    const sent = JSON.parse(body || "{}");
    lastPrompt = (sent.messages || []).map((m) => (typeof m.content === "string" ? m.content : "")).join("\n\n");
    if (REAL && url.host === "api.openai.com") return realFetch(input, init);
    return json({ choices: [{ message: { role: "assistant", content: nextAnswer } }], usage: {} });
  }
  if (url.origin !== STUB_SB) throw new Error(`unexpected egress: ${url.host}`);
  const p = url.pathname;
  if (p === "/auth/v1/user") return caller ? json({ id: caller.id }) : json({ msg: "bad jwt" }, 401);
  if (p === "/rest/v1/rpc/ai_enabled") return json(true);
  if (p === "/rest/v1/rpc/my_features") {
    const cid = JSON.parse(body || "{}").cid;
    return json(caller && caller.roles[cid] ? ["portal_access", "company_memory"] : []);
  }
  if (p === "/rest/v1/rpc/my_company_role") { const cid = JSON.parse(body || "{}").cid; return json(caller ? caller.roles[cid] ?? null : null); }
  if (p === "/rest/v1/profiles") return json(caller ? [{ role: "company" }] : []);
  if (p === "/rest/v1/rpc/bump_submission_throttle") return json(1);
  if (p === "/rest/v1/companies") {
    // RLS: a caller reads only a company they belong to. HIDDEN has no row.
    const id = (url.searchParams.get("id") || "").replace(/^eq\./, "");
    const co = FIX.companies[id];
    return json(caller && caller.roles[id] && co ? [{ name: co.name, slug: "x", profile: co.profile }] : []);
  }
  if (p === "/rest/v1/rpc/mineiq_search") {
    // 0050a's contract: 42501 unless the caller owns p_company; current facts
    // only (superseded_by is null); full-text match on the query.
    const a = JSON.parse(body || "{}");
    if (!caller || !caller.roles[a.p_company]) return json({ code: "42501", message: "not authorized for this company" }, 403);
    const co = FIX.companies[a.p_company];
    const q = new Set(words(a.p_query));
    const rows = (co ? co.search : [])
      .filter((r) => !(r.source === "fact" && r.superseded_by))
      .filter((r) => (r.terms || []).some((t) => q.has(t)) || words(r.body).some((t) => q.has(t) && t.length > 4))
      .map(({ source, id, label, body: b, occurred_on, rank }) => ({ source, id, label, body: b, occurred_on, rank }));
    return json(rows);
  }
  if (p === "/rest/v1/company_memberships") return json([]);
  return json([]);
};

const { default: compose, ASK_SYSTEM } = await import("../api/compose.js");
const G = await import("../api/_mineiqGrounding.js");

function mkRes() {
  const r = { statusCode: 200, body: undefined, headers: {} };
  r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.end = () => r;
  return r;
}
async function ask(token, companyId, question, answer = "") {
  nextAnswer = answer; lastPrompt = null;
  const before = providerCalls; const res = mkRes();
  await compose({ method: "POST", query: {}, url: "/api/compose",
    headers: { "x-real-ip": "203.0.113.9", authorization: `Bearer ${token}` },
    body: { mode: "ask", companyId, question } }, res);
  return { status: res.statusCode, body: res.body || {}, prompt: lastPrompt, calls: providerCalls - before };
}

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) pass++; else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

// ---- the grader -------------------------------------------------------------
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** A citation is the disclosure's date in any usual spelling, or its ISO form. */
function citesDate(text, iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const mon = MONTHS[m - 1];
  const forms = [iso, `${mon} ${d}`, `${mon.slice(0, 3)} ${d}`, `${mon.slice(0, 3)}. ${d}`, `${d} ${mon}`, `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`];
  return forms.some((f) => new RegExp(`\\b${f.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(?!\\d)`, "i").test(text));
}
const hasFigure = (text, f) => G.figuresIn(text).includes(G.figuresIn(f)[0] ?? f) || new RegExp(`\\b${f}\\b`, "i").test(text);

/** Grade one answer. Returns the list of rules it broke (empty = pass). */
function grade(c, answer, prompt) {
  const e = c.expect;
  const broke = [];
  const unsupported = G.unsupportedFigures(answer, `${prompt || ""}\n${c.question}`);
  if (unsupported.length) broke.push(`figures not in the sources: ${unsupported.join(", ")}`);
  if (e.refuse && !G.isRefusal(answer)) broke.push("should say it could not find the answer");
  if (!e.refuse && G.isRefusal(answer)) broke.push("refused although the record answers it");
  for (const iso of e.cite || []) if (!citesDate(answer, iso)) broke.push(`does not cite the ${iso} disclosure`);
  for (const f of e.mustInclude || []) if (!hasFigure(answer, f)) broke.push(`missing ${f}`);
  for (const f of e.mustNotInclude || []) if (hasFigure(answer, f)) broke.push(`contains ${f}, which must not appear`);
  if (e.change && !e.change.some((f) => hasFigure(answer, f))) broke.push(`hides the change (earlier value ${e.change[0]})`);
  if (e.conflict && !G.flagsConflict(answer)) broke.push("does not flag the contradiction");
  return broke;
}

// ---- 0. grounding helper units ---------------------------------------------
console.log("\n=== 0. grounding helpers ===");
ok(JSON.stringify(G.figuresIn("14.2 g/t over 6.0 m, 1,250,000 shares, hole 7")) === JSON.stringify(["14.2", "6.0", "1250000"]), "figuresIn normalises grouping and skips single digits");
ok(G.unsupportedFigures("12.40 g/t", "12.4 g/t").length === 0, "trailing zeros are formatting, not a new figure");
ok(G.unsupportedFigures("38.2 million", "38,200,000 shares").join() === "38.2", "a reformatted figure is flagged");
ok(G.unsupportedFigures("1,250,000", "1250000").length === 0, "comma grouping matches either way");
ok(G.unsupportedFigures("2026", "2026-10-01").length === 0, "a year inside an ISO date is supported");
ok(G.isRefusal("I couldn't find that in your company record."), "refusal: couldn't find");
ok(G.isRefusal("The record does not contain a resource estimate."), "refusal: record does not contain");
ok(!G.isRefusal("27 holes as of the October 1 release."), "an answer is not a refusal");
ok(G.flagsConflict("[CONFLICT: 3.4 vs 2.9]") && G.flagsConflict("The sources contradict each other."), "conflict markers");
ok(citesDate("as of the October 5, 2026 release", "2026-10-05") && !citesDate("as of October 15", "2026-10-05"), "citation by date, no partial match");

// ---- A. retrieval reaching the prompt ----------------------------------------
console.log("\n=== A. retrieval and prompt assembly ===");
{
  const r = await ask("tok-ownerA", A, "What was the best intercept in hole HR-26-014?", "x");
  ok(r.status === 200 && r.calls === 1, "owner question reaches the model once", `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
  const sys = ASK_SYSTEM;
  ok(/NEVER ANSWER FROM GENERAL KNOWLEDGE/.test(sys) && /Say which disclosure each figure came from/.test(sys) && /Never invent facts/.test(sys),
     "system prompt carries the refusal, citation and no-invention rules");
  ok(/REPORT THE CHANGE/.test(sys) && /contradicts itself/.test(sys), "system prompt carries the supersession and contradiction rules");
  ok(r.prompt && r.prompt.includes("14.2 g/t Au over 6.0 metres"), "the matching fact is in the prompt");
  ok(r.prompt && /MineIQ fact — Halden Ridge \(2026-09-22\)/.test(r.prompt), "the fact is labelled with its disclosure date (citable)");
  ok(r.prompt && !r.prompt.includes("99.9"), "another company's record never reaches the prompt");
  ok(Array.isArray(r.body.context?.sources) && r.body.context.sources.some((s) => s.includes("2026-09-22")), "sources returned to the UI carry the date");
}
{
  const r = await ask("tok-ownerA", A, "How many shares are outstanding?", "x");
  ok(r.prompt && r.prompt.includes("48,900,000 common shares outstanding"), "the current share count is retrieved");
  ok(r.prompt && !r.prompt.includes("The Company has 41,250,000 common shares outstanding."), "the superseded fact is not retrieved");
  ok(r.prompt && /As at: 2026-06-30/.test(r.prompt), "the profile's older figure carries its as-at date, so the model can order them");
}
{
  const r = await ask("tok-ownerA", A, "How much cash did we have at September 30?", "x");
  ok(r.prompt && r.prompt.includes("C$3.4 million") && r.prompt.includes("C$2.9 million"), "both contradicting documents reach the prompt (neither is dropped)");
}

// ---- B. deterministic refusals -------------------------------------------------
console.log("\n=== B. refusals that never reach the model ===");
{
  const r = await ask("tok-hidden", HIDDEN, "How many shares are outstanding?", "48,900,000");
  ok(r.status === 200 && r.calls === 0, "no readable company record: provider never called", `${r.status} calls=${r.calls}`);
  ok(r.body.grounded === false && G.isRefusal(r.body.text), "...and the canned refusal comes back, grounded=false");
}
{
  const r = await ask("tok-ownerA", B, "How many shares are outstanding?", "120,000,000");
  ok((r.status === 403 || r.status === 401) && r.calls === 0, "another company's id is refused by the guard before any AI call", `${r.status}`);
}

// ---- C. the grader on scripted answers ---------------------------------------
console.log("\n=== C. grader: good answers pass, bad ones fail ===");
let badCaught = 0, badTotal = 0;
for (const c of FIX.cases) {
  const r = await ask("tok-ownerA", A, c.question, c.good);
  const broke = grade(c, c.good, r.prompt);
  ok(broke.length === 0, `${c.id}: the good answer passes`, broke.join("; "));
  for (const b of c.bad) {
    badTotal++;
    const rb = await ask("tok-ownerA", A, c.question, b.text);
    const why = grade(c, b.text, rb.prompt);
    if (why.length) badCaught++;
    if (process.argv.includes("--verbose")) console.log(`    ${c.id} / ${b.why}: ${why.join("; ") || "NOT CAUGHT"}`);
    ok(why.length > 0, `${c.id}: bad answer (${b.why}) is caught`);
  }
}
console.log(`  grader caught ${badCaught}/${badTotal} bad answers`);

// ---- D. what the UI receives ----------------------------------------------------
console.log("\n=== D. the response the portal shows ===");
{
  const r = await ask("tok-ownerA", A, "What is the mineral resource estimate for Halden Ridge?",
    "I couldn't find a mineral resource estimate for Halden Ridge in your company record.");
  ok(r.body.grounded === false, "a refusal is NOT labelled grounded (profile context alone is not an answer)");
  ok(Array.isArray(r.body.unsupported_figures) && r.body.unsupported_figures.length === 0, "...and has no unsupported figures");
}
{
  const r = await ask("tok-ownerA", A, "What grade did hole HR-26-021 return?", "Hole HR-26-021 returned 8.7 g/t Au over 4.5 metres.");
  ok(r.body.grounded === true && JSON.stringify(r.body.unsupported_figures) === JSON.stringify(["8.7", "4.5"]),
     "an invented drill result is reported back as unsupported figures", JSON.stringify(r.body.unsupported_figures));
}
{
  const r = await ask("tok-viewerA", A, "What was the best intercept in hole HR-26-014?",
    "Hole HR-26-014 intersected 14.2 g/t Au over 6.0 metres (September 22, 2026 disclosure).");
  ok(r.status === 200 && r.body.grounded === true && r.body.unsupported_figures.length === 0, "a viewer may ask; a supported answer comes back clean");
}

// ---- E. the real model (approved runs only) -------------------------------------
if (REAL) {
  console.log("\n=== E. real model answers, graded ===");
  for (const c of FIX.cases) {
    const r = await ask("tok-ownerA", A, c.question);
    const broke = grade(c, r.body.text || "", r.prompt);
    ok(broke.length === 0, `${c.id}: real answer passes`, `${broke.join("; ")}\n      answer: ${String(r.body.text || r.body.error).slice(0, 300)}`);
  }
}

console.log(`\nmineiq-grounding-eval${REAL ? " (REAL provider)" : " (mocked provider)"}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
