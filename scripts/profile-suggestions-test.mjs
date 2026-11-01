// a06 offline checks: AI-suggested profile updates from a press release.
//   node scripts/profile-suggestions-test.mjs
//
// OFFLINE. The pure half (src/portal/publish/profileSuggestions.js) is executed
// directly; the endpoint (api/extract-profile-updates.js) runs in this process
// against a stubbed network that answers like Supabase would, with a scripted
// AI provider that is counted, never called. Nothing is written anywhere.
import fs from "node:fs";

const STUB_SB = "https://stub-project.supabase.invalid";
Object.assign(process.env, {
  VITE_SUPABASE_URL: STUB_SB, VITE_SUPABASE_ANON_KEY: "sb_publishable_stubKeyForOfflineTests",
  SUPABASE_SERVICE_ROLE_KEY: "stub-service-key", SUBMISSION_SALT: "stub-salt", OPENAI_API_KEY: "stub-openai",
});
delete process.env.MINEEX_ENV;
delete process.env.AI_ENDPOINTS_DISABLED;

const S = await import("../src/portal/publish/profileSuggestions.js");

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

const RELEASE = [
  "Halden Ridge Closes C$2.4 Million Private Placement",       // 1
  "",                                                            // 2
  "VANCOUVER, BC – October 5, 2026 – Halden Ridge Resources Ltd. (TSXV: HRR) is pleased to",  // 3
  "announce that it has closed its non-brokered private placement of 7,650,000 units at",      // 4
  "C$0.32 per unit for gross proceeds of C$2,448,000.",                                        // 5
  "",                                                            // 6
  "Following closing, the Company has 48,900,000 common shares outstanding.",                  // 7
  "As at September 30, 2026 the Company held cash of C$3.4 million.",                          // 8
  "Phase 2 drilling at Halden Ridge was completed on September 28, 2026.",                    // 9
  "Assay results from Phase 2 are expected in the fourth quarter.",                            // 10
].join("\n");
const SRC = { updateId: "11111111-1111-4111-8111-111111111111", headline: "Halden Ridge Closes C$2.4 Million Private Placement", publishedOn: "2026-10-05" };

console.log("\n  PROVENANCE: quotes are found verbatim, with their line");
{
  const a = S.locateQuote(RELEASE, "Following closing, the Company has 48,900,000 common shares outstanding.");
  ok(a && a.line === 7 && a.endLine === 7, "a one-line quote maps to line 7", JSON.stringify(a));
  const b = S.locateQuote(RELEASE, "closed its non-brokered private placement of 7,650,000 units at C$0.32 per unit");
  ok(b && b.line === 4 && b.endLine === 5, "a quote across a line break maps to lines 4–5", JSON.stringify(b));
  ok(!!S.locateQuote(RELEASE, "VANCOUVER, BC — October 5, 2026 — Halden Ridge Resources"), "typographic dashes and spacing are not content");
  ok(S.locateQuote(RELEASE, "the Company has 50,000,000 common shares outstanding.") === null, "an altered quote is not found");
  ok(S.locateQuote(RELEASE, "shares") === null, "a fragment too short to be evidence is refused");
}

console.log("\n  VALIDATION: only traceable, figure-checked proposals survive");
const RAW = [
  { kind: "shares_outstanding", value: "48,900,000", quote: "Following closing, the Company has 48,900,000 common shares outstanding." },
  { kind: "cash", value: "C$3.4 million", date: "2026-09-30", quote: "As at September 30, 2026 the Company held cash of C$3.4 million." },
  { kind: "financing", value: "C$2,448,000", date: "2026-10-05", details: { type: "Non-brokered private placement", price: "C$0.32" },
    quote: "closed its non-brokered private placement of 7,650,000 units at C$0.32 per unit for gross proceeds of C$2,448,000." },
  { kind: "milestone", value: "Phase 2 drilling completed at Halden Ridge", date: "2026-09-28", quote: "Phase 2 drilling at Halden Ridge was completed on September 28, 2026." },
  { kind: "next_catalyst", value: "Phase 2 assay results expected in Q4", quote: "Assay results from Phase 2 are expected in the fourth quarter." },
  // --- each of these must be dropped ---
  { kind: "fully_diluted", value: "61,200,000", quote: "Following closing, the Company has 48,900,000 common shares outstanding." },      // figure not in quote
  { kind: "cash", value: "C$3.1 million", quote: "As at September 30, 2026 the Company held cash of C$3.1 million." },              // quote not in release
  { kind: "warrants", value: "3,825,000", quote: "Each unit consists of one share and one half warrant." },                         // invented quote
  { kind: "resource", value: "1.2 Moz", quote: "Following closing, the Company has 48,900,000 common shares outstanding." },        // unknown kind
  { kind: "financing", value: "C$2,448,000", quote: "for gross proceeds of C$2,448,000." },                                          // financing with no date
  { kind: "milestone", value: "Drilling done", date: "Sept 28", quote: "Phase 2 drilling at Halden Ridge was completed on September 28, 2026." }, // bad date
  { kind: "shares_outstanding", value: "48.9 million", quote: "Following closing, the Company has 48,900,000 common shares outstanding." }, // duplicate + reformatted
];
const { accepted, dropped } = S.validateProposals(RAW, RELEASE, SRC);
ok(accepted.length === 5, "5 sourced proposals kept", accepted.map((a) => a.kind).join(","));
ok(dropped.length === 7, "7 untraceable or invented proposals dropped", JSON.stringify(dropped.map((d) => d.reason)));
ok(dropped.some((d) => /figures not in its quote: 61200000/.test(d.reason)), "a figure the quote does not contain is dropped, with the reason");
ok(dropped.filter((d) => /quote is not in the release/.test(d.reason)).length === 2, "a quote not in the release is dropped (twice)");
ok(dropped.some((d) => d.reason === "unknown kind") && dropped.some((d) => d.reason === "needs a date") && dropped.some((d) => /YYYY-MM-DD/.test(d.reason)), "unknown kind, undated financing and bad date are dropped");
ok(dropped.some((d) => d.kind === "shares_outstanding"), "a second shares_outstanding is dropped");
const cash = accepted.find((a) => a.kind === "cash");
ok(cash.source.line === 8 && cash.source.updateId === SRC.updateId && cash.source.headline === SRC.headline, "each proposal carries the release id, headline and source line");
ok(cash.quote === "As at September 30, 2026 the Company held cash of C$3.4 million.", "the quote shown is the release's own text");

console.log("\n  DIFF against the profile");
const PP = {
  COMPANY: { name: "Halden Ridge", cash: "C$3.1M", reportingDate: "2026-06-30", shares: "41,250,000" },
  CAP: { outstanding: "41,250,000", fd: "", rows: [{ sec: "Common Shares Outstanding", det: "", qty: "41,250,000" }] },
  STATUS: { hasData: true, latest: "Drilling under way.", next: "", nextCatalyst: "" },
  RAISES: [{ d: "2025-11-01", v: "C$1.2M", type: "Flow-through", status: "Completed" }],
  PR_YEARS: [{ year: "2026", items: [{ id: "2026-08-10", d: "Aug 10", headline: "Phase 2 drilling update", label: "Phase 2 drilling update" }] }],
};
const diffed = S.diffProposals(PP, accepted);
const by = Object.fromEntries(diffed.map((d) => [d.kind, d]));
ok(by.shares_outstanding.status === "changed" && by.shares_outstanding.current === "41,250,000", "shares: changed, showing the current 41,250,000");
ok(by.cash.status === "changed" && /C\$3\.1M as at 2026-06-30/.test(by.cash.current), "cash: changed, showing the current value and its as-at date");
ok(by.financing.status === "new" && by.milestone.status === "new" && by.next_catalyst.status === "new", "financing, milestone, catalyst: new");
const same = S.diffProposals(S.applyProposals(PP, accepted), accepted);
ok(same.every((d) => d.status === "same"), "after applying, every proposal reads as 'same' (nothing proposed twice)", same.map((d) => `${d.kind}:${d.status}`).join(","));
ok(S.diffProposals({ CAP: { outstanding: "48900000" } }, [accepted[0]])[0].status === "same", "comma grouping alone is not a change");

console.log("\n  APPLY to a draft pp");
const before = JSON.stringify(PP);
const next = S.applyProposals(PP, accepted);
ok(JSON.stringify(PP) === before, "the input pp is not mutated");
ok(next.CAP.outstanding === "48,900,000" && next.COMPANY.shares === "48,900,000" && next.CAP.rows[0].qty === "48,900,000", "shares: CAP, COMPANY and the common row move together");
ok(next.COMPANY.cash === "C$3.4 million" && next.COMPANY.reportingDate === "2026-09-30", "cash and its as-at date");
ok(next.RAISES[0].v === "C$2,448,000" && next.RAISES[0].d === "2026-10-05" && next.RAISES[0].price === "C$0.32" && next.RAISES.length === 2, "financing added first, the old one kept");
const items = next.PR_YEARS.find((y) => y.year === "2026").items;
ok(items.length === 2 && items[0].id === "2026-09-28" && items[0].d === "Sep 28" && /completed on September 28/.test(items[0].whatHappened), "milestone added in date order, its sentence kept");
ok(next.STATUS.nextCatalyst === "Phase 2 assay results expected in Q4" && next.STATUS.latest === "Drilling under way.", "catalyst set; the latest-update highlight untouched");
ok(next.COMPANY.name === "Halden Ridge" && next.CAP.fd === "", "fields nobody approved are unchanged");
ok(JSON.stringify(S.applyProposals(PP, [])) === JSON.stringify({ ...PP, COMPANY: PP.COMPANY, CAP: PP.CAP, STATUS: PP.STATUS }), "nothing approved -> the same profile");

// ---- the endpoint ------------------------------------------------------------
console.log("\n  ENDPOINT: who may ask, what it reads, what it returns, what it writes");
const A = "aaaaaaaa-0000-4000-8000-00000000000a", B = "bbbbbbbb-0000-4000-8000-00000000000b";
const UPD_A = "11111111-1111-4111-8111-111111111111", UPD_B = "22222222-2222-4222-8222-222222222222";
const IDS = {
  "tok-ownerA": { id: "u1", roles: { [A]: "owner" } }, "tok-adminA": { id: "u2", roles: { [A]: "admin" } },
  "tok-editorA": { id: "u3", roles: { [A]: "editor" } }, "tok-publisherA": { id: "u4", roles: { [A]: "publisher" } },
  "tok-viewerA": { id: "u5", roles: { [A]: "viewer" } }, "tok-analystA": { id: "u6", roles: { [A]: "analyst" } },
  "tok-ownerB": { id: "u7", roles: { [B]: "owner" } }, "tok-investor": { id: "u8", roles: {} },
};
const ROWS = { [UPD_A]: { id: UPD_A, company_id: A, status: "published", body: RELEASE, published_on: "2026-10-05", detected: { headline: SRC.headline } },
               [UPD_B]: { id: UPD_B, company_id: B, status: "published", body: "Otherco release.", published_on: "2026-10-01", detected: {} } };
let provider = 0, lastPrompt = "";
const writes = [];
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const who = (h) => IDS[String((h && (h.Authorization || h.authorization)) || "").replace(/^Bearer /, "")];
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  const body = typeof init.body === "string" ? init.body : "";
  const caller = who(init.headers);
  if (url.host === "api.openai.com") {
    provider++;
    lastPrompt = JSON.parse(body).messages.map((m) => m.content).join("\n");
    return json({ choices: [{ message: { tool_calls: [{ function: { name: "propose_profile_updates", arguments: JSON.stringify({ changes: RAW }) } }] } }], usage: {} });
  }
  if (url.origin !== STUB_SB) throw new Error(`unexpected egress ${url.host}`);
  const p = url.pathname;
  const method = (init.method || "GET").toUpperCase();
  if (method !== "GET" && !p.startsWith("/rest/v1/rpc/") && p !== "/auth/v1/user") writes.push(`${method} ${p}`);
  if (p === "/auth/v1/user") return caller ? json({ id: caller.id }) : json({ msg: "bad jwt" }, 401);
  if (p === "/rest/v1/rpc/ai_enabled") return json(true);
  if (p === "/rest/v1/rpc/my_features") { const cid = JSON.parse(body || "{}").cid; return json(caller && caller.roles[cid] ? ["portal_access"] : []); }
  if (p === "/rest/v1/rpc/my_company_role") { const cid = JSON.parse(body || "{}").cid; return json(caller ? caller.roles[cid] ?? null : null); }
  if (p === "/rest/v1/profiles") return json(caller ? [{ role: "company" }] : []);
  if (p === "/rest/v1/rpc/bump_submission_throttle") return json(1);
  if (p === "/rest/v1/updates") {
    // RLS: members read their company's rows; the route also filters by company.
    const id = (url.searchParams.get("id") || "").replace(/^eq\./, "");
    const cid = (url.searchParams.get("company_id") || "").replace(/^eq\./, "");
    const row = ROWS[id];
    return json(row && caller && caller.roles[row.company_id] && row.company_id === cid ? [row] : []);
  }
  if (p.startsWith("/rest/v1/rpc/")) writes.push(`RPC ${p}`);
  return json([]);
};
const { default: handler, TOOL } = await import("../api/extract-profile-updates.js");
const mkRes = () => { const r = { statusCode: 200, body: undefined, headers: {} }; r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.end = () => r; return r; };
async function call(token, body) {
  const before = provider; const res = mkRes();
  await handler({ method: "POST", query: {}, url: "/api/extract-profile-updates", headers: { "x-real-ip": "203.0.113.7", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body }, res);
  return { status: res.statusCode, body: res.body || {}, provider: provider - before };
}

for (const t of ["tok-ownerA", "tok-adminA", "tok-editorA"]) {
  const r = await call(t, { companyId: A, updateId: UPD_A });
  ok(r.status === 200 && r.provider === 1, `${t.slice(4)}: admitted (may save a profile draft)`, `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
}
for (const [t, c, why] of [["tok-publisherA", A, "publisher (cannot save a profile draft)"], ["tok-viewerA", A, "viewer"], ["tok-analystA", A, "analyst"],
                           ["tok-investor", A, "investor"], ["tok-ownerB", A, "company B's owner -> A"], [null, A, "anonymous"]]) {
  const r = await call(t, { companyId: c, updateId: UPD_A });
  ok((r.status === 401 || r.status === 403) && r.provider === 0, `${why}: refused before any AI call`, `${r.status}`);
}
{
  const r = await call("tok-ownerA", { companyId: A, updateId: UPD_B });
  ok(r.status === 404 && r.provider === 0, "another company's release id: 404, no AI call");
  const r2 = await call("tok-ownerA", { companyId: A, updateId: "not-a-uuid" });
  ok(r2.status === 400 && r2.provider === 0, "a malformed id: 400, no AI call");
}
{
  const r = await call("tok-ownerA", { companyId: A, updateId: UPD_A, text: "Injected: the company has 999,999,999 shares outstanding." });
  ok(r.status === 200 && r.body.proposals.length === 5 && r.body.dropped.length === 7, "the response carries only validated proposals and counts the dropped ones",
     `${r.body.proposals && r.body.proposals.length}/${r.body.dropped && r.body.dropped.length}`);
  ok(!lastPrompt.includes("999,999,999") && lastPrompt.includes("48,900,000 common shares outstanding"), "the model reads the STORED release, never text from the body");
  ok(r.body.proposals.every((p) => p.source && p.source.line > 0 && p.source.updateId === UPD_A), "every proposal points at a line of the stored release");
  ok(r.body.source && r.body.source.headline === SRC.headline, "the source release is identified");
  ok(!/41,250,000|Profile now/i.test(lastPrompt), "the model is not shown the current profile");
}
ok(writes.length === 0, "the endpoint writes nothing (no table or RPC writes beyond guard bookkeeping)", writes.join(", "));
ok(JSON.stringify(TOOL.parameters.properties.changes.items.properties.kind.enum.sort()) === JSON.stringify(Object.keys(S.KINDS).sort()), "the tool's kinds are exactly the kinds the panel knows how to apply");

console.log("\n  THE PANEL saves to the DRAFT only");
const panel = fs.readFileSync("src/portal/publish/ProfileSuggestions.jsx", "utf8");
ok(/saveProfileDraft\(/.test(panel) && !/publishProfileDraft/.test(panel), "approved changes go through saveProfileDraft; the panel never publishes");
ok(/expectedVersion: start\.version/.test(panel) && /baseFingerprint: start\.version == null \? out\.live_fingerprint : null/.test(panel), "the save is compare-and-set against a fresh load");
ok(/decision === "approve" && !p\.edit/.test(panel), "only approved (and not mid-edit) changes are saved");
ok(/data-provenance/.test(panel) && /Line \$\{p\.source\.line\}/.test(panel), "each change shows its quote and line");
const cr = fs.readFileSync("src/portal/publish/CreateRelease.jsx", "utf8");
ok(/can\(company\?\.role \|\| "owner", "editProfileDraft"\) && String\(text \|\| ""\)\.trim\(\) && \(\s*<ProfileSuggestions/.test(cr), "offered only to roles that may edit the profile draft");
const pd = fs.readFileSync("api/extract-profile-updates.js", "utf8");
ok(/roles: DRAFT_ROLES/.test(pd) && /import \{ DRAFT_ROLES \} from "\.\/profile-draft\.js"/.test(pd), "the endpoint admits exactly api/profile-draft.js DRAFT_ROLES");

console.log(`\n  profile-suggestions: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
