// a08 offline: a taken-down release leaves Mine IQ retrieval, text and facts.
//   node scripts/mineiq-a08-retrieval-test.mjs        (npm run check:s1-a08-retrieval)
//
// OFFLINE. No network, no model. A stubbed Supabase models the tables the rule
// reads (updates, publications, facts) and the 0050a mineiq_search contract
// (42501 for another company; updates.status = 'published'; current facts),
// which is exactly what lets a taken-down release through without a08: the
// take-down flips the publication, not updates.status. The staging half is
// scripts/mineiq-a08-retrieval-check.mjs (rolled back).
import fs from "node:fs";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const read = (f) => fs.readFileSync(f, "utf8");
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

const STUB_SB = "https://stub-project.supabase.invalid";
Object.assign(process.env, { VITE_SUPABASE_URL: STUB_SB, VITE_SUPABASE_ANON_KEY: "sb_publishable_stubKeyForOfflineTests", SUPABASE_SERVICE_ROLE_KEY: "stub-service-key" });
delete process.env.MINEEX_ENV;

// ── the stubbed database ────────────────────────────────────────────────────
const A = "aaaaaaaa-0000-4000-8000-00000000000a", B = "bbbbbbbb-0000-4000-8000-00000000000b";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U_LIVE = id(1), U_DOWN = id(2), U_GONE = id(3), U_B = id(4);
const P_LIVE = id(11), P_DOWN = id(12), P_WEB = id(13), P_B = id(14);
const F_LIVE = id(21), F_DOWN = id(22), F_GONE = id(23), F_B = id(24);
const DOC = id(31);
const db = {
  updates: [
    { id: U_LIVE, company_id: A, status: "published", headline: "Kestrel drilling live", body: "Kestrel drilling returned 12.4 g/t gold." },
    { id: U_DOWN, company_id: A, status: "published", headline: "Kestrel placement down", body: "Kestrel placement raised C$9.9 million." },
    { id: U_GONE, company_id: A, status: "published", headline: "Kestrel deleted pub", body: "Kestrel deleted publication text." },
    { id: U_B, company_id: B, status: "published", headline: "Kestrel other company", body: "Kestrel other company secret." },
  ],
  publications: [
    { id: P_LIVE, company_id: A, update_id: U_LIVE, destination_id: "passport", status: "published" },
    { id: P_DOWN, company_id: A, update_id: U_DOWN, destination_id: "passport", status: "draft" },   // unpublish_publication
    { id: P_WEB, company_id: A, update_id: U_DOWN, destination_id: "website", status: "published" }, // another destination is not the profile
    { id: P_B, company_id: B, update_id: U_B, destination_id: "passport", status: "published" },
    // U_GONE: its publication was deleted.
  ],
  facts: [
    { id: F_LIVE, company_id: A, publication_id: P_LIVE, quote: "Kestrel 12.4 g/t gold" },
    { id: F_DOWN, company_id: A, publication_id: P_DOWN, quote: "Kestrel C$9.9 million placement" },
    { id: F_GONE, company_id: A, publication_id: null, quote: "Kestrel deleted fact" },   // on delete set null
    { id: F_B, company_id: B, publication_id: P_B, quote: "Kestrel other company fact" },
  ],
  documents: [{ id: DOC, company_id: A, filename: "kestrel.pdf", text: "Kestrel technical report." }],
};
const TOKENS = { "tok-A": [A], "tok-B": [B] };
let rpcMissing = false, failLiveness = false, rpcLimit = null;
const calls = [];

const inList = (v) => (String(v || "").match(/^in\.\((.*)\)$/) || [, ""])[1].split(",").filter(Boolean);
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  if (url.origin !== STUB_SB) throw new Error(`unexpected egress: ${url.host}`);
  const tok = String((init.headers && (init.headers.Authorization || init.headers.authorization)) || "").replace(/^Bearer /, "");
  const mine = TOKENS[tok] || [];                        // RLS: the caller's companies
  const sp = url.searchParams, p = url.pathname;
  calls.push(`${p}?${sp.toString()}`);
  if (p === "/rest/v1/rpc/mineiq_search") {
    if (rpcMissing) return json({ code: "42883", message: "function does not exist" }, 404);
    const a = JSON.parse(init.body || "{}");
    rpcLimit = a.p_limit;
    if (!mine.includes(a.p_company)) return json({ code: "42501", message: "not authorized for this company" }, 403);
    return json([
      ...db.facts.filter((f) => f.company_id === a.p_company).map((f) => ({ source: "fact", id: f.id, label: "fact", body: f.quote, rank: 1 })),
      ...db.updates.filter((u) => u.company_id === a.p_company && u.status === "published").map((u) => ({ source: "release", id: u.id, label: u.headline, body: u.body, rank: 1 })),
      ...db.documents.filter((d) => d.company_id === a.p_company).map((d) => ({ source: "document", id: d.id, label: d.filename, body: d.text, rank: 1 })),
    ]);
  }
  if (p === "/rest/v1/publications") {
    if (failLiveness) return json({ message: "boom" }, 500);
    const ids = inList(sp.get("update_id"));
    return json(db.publications.filter((x) => mine.includes(x.company_id) && ids.includes(x.update_id)
      && x.destination_id === (sp.get("destination_id") || "").replace(/^eq\./, "")
      && x.status === (sp.get("status") || "").replace(/^eq\./, "")).map((x) => ({ update_id: x.update_id })));
  }
  if (p === "/rest/v1/facts") {
    if (failLiveness) return json({ message: "boom" }, 500);
    const ids = inList(sp.get("id"));
    const inner = /publications!inner\(status\)/.test(sp.get("select") || "") && sp.get("publications.status") === "eq.published";
    return json(db.facts.filter((f) => mine.includes(f.company_id) && ids.includes(f.id)).filter((f) => {
      const pub = db.publications.find((x) => x.id === f.publication_id);
      return inner ? !!pub && pub.status === "published" : true;
    }).map((f) => ({ id: f.id })));
  }
  if (p === "/rest/v1/updates") {                       // the legacy scan
    return json(db.updates.filter((u) => mine.includes(u.company_id) && u.status === "published").map((u) => ({
      body: u.body, detected: { headline: u.headline }, published_on: "2026-10-01",
      publications: /publications\(/.test(sp.get("select") || "") ? db.publications.filter((x) => x.update_id === u.id).map(({ destination_id, status }) => ({ destination_id, status })) : undefined,
    })));
  }
  if (p === "/rest/v1/documents") return json(db.documents.filter((d) => mine.includes(d.company_id)).map((d) => ({ filename: d.filename, extracted_text: d.text })));
  return json([]);
};

const has = (out, s) => out.blocks.some((b) => b.text.includes(s));
const search = async (mod, tok, company, q = "Kestrel") => mod.mineIqSearch(tok, company, q, { limit: 12 });

console.log("\n  THE RULE (src/lib/mineiqActive.js)");
{
  const M = await import("../src/lib/mineiqActive.js");
  const rows = [{ source: "release", id: U_LIVE }, { source: "release", id: U_DOWN }, { source: "fact", id: F_LIVE }, { source: "fact", id: F_DOWN }, { source: "document", id: DOC }];
  const paths = M.activeFilterPaths(rows);
  ok(/^publications\?update_id=in\.\([^)]*\)&destination_id=eq\.passport&status=eq\.published&select=update_id$/.test(paths.releases), "releases are checked against their PROFILE publication being published", paths.releases);
  ok(/^facts\?id=in\.\([^)]*\)&select=id,publications!inner\(status\)&publications\.status=eq\.published$/.test(paths.facts), "facts are checked against their own publication (inner join: a deleted publication drops the fact)", paths.facts);
  ok(M.activeFilterPaths([{ source: "release", id: "x),evil" }]).releases === null, "only uuids reach the filter path");
  const kept = M.keepActive(rows, { updateIds: [U_LIVE], factIds: [F_LIVE] }).map((r) => r.id);
  ok(kept.join() === [U_LIVE, F_LIVE, DOC].join(), "keepActive keeps live releases, live facts and documents");
  ok(M.keepActive(rows, null).map((r) => r.id).join() === DOC, "when liveness is unknown, releases and facts are withheld; documents stay");
}

console.log("\n  RETRIEVAL (api/_mineiqSearch.js, mineiq_search present)");
{
  const S = await import("../api/_mineiqSearch.js");
  let out = await search(S, "tok-A", A);
  ok(has(out, "12.4 g/t gold") && out.blocks.some((b) => b.label.startsWith("MineIQ fact") && b.text.includes("12.4")), "published: the release text and its fact are returned");
  ok(!has(out, "C$9.9 million"), "taken down: neither its text nor its fact is returned");
  ok(!has(out, "deleted publication text") && !has(out, "deleted fact"), "deleted publication: neither its text nor its fact is returned");
  ok(has(out, "technical report"), "documents are unaffected");
  ok(!has(out, "other company"), "another company's content is never returned");
  ok(rpcLimit === 24, "the search asks for more than it keeps, so dropped rows do not leave the answer short", `p_limit=${rpcLimit}`);
  ok(!out.degraded, "nothing degraded on the healthy path");

  db.publications.find((x) => x.id === P_DOWN).status = "published";             // publish again
  out = await search(S, "tok-A", A);
  ok(has(out, "C$9.9 million") && out.blocks.filter((b) => b.text.includes("9.9")).length === 2, "republished: its text and its fact are back (nothing was deleted)");
  db.publications.find((x) => x.id === P_DOWN).status = "draft";

  db.updates.find((u) => u.id === U_LIVE).body = "Kestrel drilling returned 14.8 g/t gold (corrected).";   // a saved correction syncs the row
  out = await search(S, "tok-A", A);
  ok(has(out, "14.8 g/t gold (corrected)") && !out.blocks.some((b) => b.label.startsWith("Previous release") && b.text.includes("12.4")), "revised: only the release's current body is returned");
  db.updates.find((u) => u.id === U_LIVE).body = "Kestrel drilling returned 12.4 g/t gold.";

  out = await search(S, "tok-B", A);
  ok(out.blocks.length === 0, "company B asking about company A: nothing (42501 is not a fallback)");

  failLiveness = true;
  out = await search(S, "tok-A", A);
  ok(out.degraded && !has(out, "g/t gold") && !has(out, "C$9.9") && has(out, "technical report"), "liveness read fails: no release or fact is presented as current; documents stay");
  failLiveness = false;
}

console.log("\n  RETRIEVAL (legacy scan, mineiq_search not deployed)");
{
  rpcMissing = true;
  const S = await import(`../api/_mineiqSearch.js?legacy=${Date.now()}`);
  const out = await search(S, "tok-A", A);
  ok(out.degraded && has(out, "12.4 g/t gold"), "the fallback still returns the live release");
  ok(!has(out, "C$9.9 million") && !has(out, "deleted publication text"), "...and not the taken-down or unpublished one");
  ok(calls.some((c) => c.startsWith("/rest/v1/updates?") && /publications%28destination_id%2Cstatus%29|publications\(destination_id,status\)/.test(c)), "the fallback reads each release's publications");
  rpcMissing = false;
}

console.log("\n  THE PORTAL'S OWN COUNTS (src/lib/mineiq.js)");
{
  const src = read("src/lib/mineiq.js");
  ok(/factCount[\s\S]{0,400}select=id,\$\{ACTIVE_FACTS\}/.test(src), "the fact count is live facts only");
  ok(/superseded_by=is\.null&select=kind,\$\{ACTIVE_FACTS\}/.test(src) && /created_at,\$\{ACTIVE_FACTS\}&order/.test(src), "facts by category and the fact list are live facts only");
  ok(/releases: count\(live\)/.test(src) && /_published: live \|\| \[\]/.test(src), "a taken-down release is not counted as published or listed as learned from");
  ok(/factCountForPublication[\s\S]{0,200}countOf\(`facts\?publication_id=eq/.test(src), "the take-down notice still counts that release's own facts (kept as record)");
}

console.log("\n  NOTHING IS DELETED");
{
  const listeners = read("api/_listeners.js"), unpub = read("api/unpublish.js"), active = read("src/lib/mineiqActive.js"), srch = read("api/_mineiqSearch.js");
  ok(!/facts\?[^`"]*["`],\s*\{\s*method:\s*"DELETE"/.test(listeners) && !/facts\?/.test(unpub), "no listener and no unpublish path deletes facts");
  ok(!/method:\s*"(DELETE|PATCH|POST)"/.test(active + srch), "the a08 filter only reads");
  const cr = read("src/portal/publish/CreateRelease.jsx");
  ok(/MineIQ stops using this release/.test(cr) && /kept as a record, and come back if you publish again/.test(cr) && !/they still inform MineIQ answers/.test(cr), "the take-down confirm says Mine IQ stops using it, keeps the record, and restores it on republish");
}

console.log(`\n  mineiq-a08-retrieval: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
