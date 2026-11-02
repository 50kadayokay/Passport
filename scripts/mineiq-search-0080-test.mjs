// 0080 offline: mineiq_search matches ANY significant word, and the API falls
// back to the keyword scan when the search finds nothing.
//   node scripts/mineiq-search-0080-test.mjs        (npm run check:s1-0080)
//
// OFFLINE. The SQL is checked as text against 0050a (what must NOT change: the
// signature, the company check, superseded facts, the index expressions) and the
// rollback against 0050a's definition. The SQL itself is executed on staging by
// scripts/mineiq-search-0080-check.mjs (rolled back). The fallback runs against
// a stubbed Supabase.
import fs from "node:fs";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const read = (f) => fs.readFileSync(f, "utf8");
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

const fn = (sql) => (sql.match(/create or replace function public\.mineiq_search\([\s\S]*?\nend \$\$;/) || [""])[0];
const norm = (s) => s.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
const OLD = fn(read("supabase/migrations/0050a_mineiq_and_publication_push.sql"));
const MIG = read("supabase/migrations/0080_mineiq_search_any_term.sql");
const NEW = fn(MIG);
const RB = read("supabase/rollbacks/0080_mineiq_search_any_term.rollback.sql");

console.log("\n  0080: HOW THE QUESTION BECOMES A QUERY");
ok(!!NEW && !/websearch_to_tsquery/.test(NEW), "the AND query (websearch_to_tsquery) is gone");
ok(/regexp_split_to_table\(left\(coalesce\(p_query, ''\), 2000\), '\\s\+'\)/.test(NEW) && /plainto_tsquery\('english', w\)/.test(NEW),
   "each word goes through plainto_tsquery('english') on its own (stemmed, stopwords dropped, no quoting by hand)");
ok(/continue when t is null or numnode\(t\) = 0;/.test(NEW), "stopwords and punctuation are skipped, not ORed in as empty queries");
ok(/q := case when q is null then t else q \|\| t end;/.test(NEW), "words are ORed (tsquery ||)");
ok(/exit when n >= 32;/.test(NEW), "at most 32 words, so a pasted paragraph cannot build a huge query");
ok(/if q is null then\s+return;/.test(NEW), "a question with no significant word returns nothing");

console.log("\n  0080: WHAT DOES NOT CHANGE");
const head = (s) => norm(s.slice(0, s.indexOf("$$")));
ok(head(NEW) === head(OLD), "same signature and return table");
ok(norm(NEW).indexOf("if not public.owns_company(p_company)") < norm(NEW).indexOf("plainto_tsquery"), "the company check still runs FIRST (42501)");
const body = (s) => norm(s.slice(s.indexOf("return query")));
ok(body(NEW) === body(OLD), "the three branches are character-for-character 0050a: superseded facts excluded, published releases, 0050b's index expressions");
ok(/revoke execute on function public\.mineiq_search\(uuid, text, integer\) from public, anon;/.test(MIG) && /grant\s+execute on function public\.mineiq_search\(uuid, text, integer\) to authenticated;/.test(MIG),
   "grants stay as 0056 left them (authenticated only)");
ok(/^begin;$/m.test(MIG) && /^commit;$/m.test(MIG) && /NOT APPLIED/.test(MIG), "one transaction, marked not applied");

console.log("\n  ROLLBACK");
ok(norm(fn(RB)) === norm(OLD), "the rollback restores 0050a's mineiq_search exactly");
ok(/revoke execute[^;]*from public, anon;/.test(RB) && /grant\s+execute[^;]*to authenticated;/.test(RB), "...with the same grants");

console.log("\n  THE API FALLS BACK WHEN NOTHING MATCHES (api/_mineiqSearch.js)");
{
  const STUB = "https://stub-project.supabase.invalid";
  Object.assign(process.env, { VITE_SUPABASE_URL: STUB, VITE_SUPABASE_ANON_KEY: "sb_publishable_stubKeyForOfflineTests", SUPABASE_SERVICE_ROLE_KEY: "stub-service-key" });
  delete process.env.MINEEX_ENV;
  const A = "aaaaaaaa-0000-4000-8000-00000000000a";
  let rpcRows = [], rpcCode = null; const hits = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.origin !== STUB) throw new Error(`unexpected egress: ${url.host}`);
    hits.push(url.pathname);
    if (url.pathname === "/rest/v1/rpc/mineiq_search") return rpcCode ? json({ code: rpcCode, message: "x" }, 403) : json(rpcRows);
    if (url.pathname === "/rest/v1/updates") return json([{ body: "The Company closed a placement for gross proceeds of C$2,100,000.", detected: { headline: "Closes C$2.1 Million Placement" }, published_on: "2026-10-28",
      publications: [{ destination_id: "passport", status: "published" }] }]);
    return json([]);
  };
  const S = await import("../api/_mineiqSearch.js");
  let out = await S.mineIqSearch("tok", A, "What did the placement raise?");
  ok(out.blocks.some((b) => /C\$2,100,000/.test(b.text)) && out.degraded, "the search returned no rows: the keyword scan finds the release (marked degraded)");
  rpcCode = "42501"; hits.length = 0;
  out = await S.mineIqSearch("tok", A, "What did the placement raise?");
  ok(out.blocks.length === 0 && !hits.includes("/rest/v1/updates"), "42501 (not this company) is still NOT a fallback: nothing is read");
}

console.log(`\n  mineiq-search-0080: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
