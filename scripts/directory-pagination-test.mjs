// The investor app's directory loader (src/main.jsx, dirPromise), run as
// written against a mocked PostgREST that caps pages at 1000 rows.
//   node scripts/directory-pagination-test.mjs
// a29: with no limit, PostgREST silently returned the first 1000 of 1421
// published companies. Production now has 1492.
import fs from "node:fs";

const src = fs.readFileSync("src/main.jsx", "utf8");
const a = src.indexOf("const dirPromise = (async () => {");
const b = src.indexOf("})();", a);
if (a < 0 || b < 0) { console.error("  could not find dirPromise in src/main.jsx"); process.exit(2); }
const body = src.slice(a + "const dirPromise = ".length, b + 4);   // "(async () => {...})()"

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? ` -- ${d}` : ""}`); } };

// rows: sorted by the server per the request's order= parameter.
function server(rows, { maxRows = 1000, failOffsets = [] } = {}) {
  const calls = [];
  const fetch = async (url, opts = {}) => {
    calls.push(url);
    const u = new URL(url);
    const order = (u.searchParams.get("order") || "").split(",");
    const sorted = [...rows].sort((x, y) => { for (const k of order) { if (x[k] < y[k]) return -1; if (x[k] > y[k]) return 1; } return 0; });
    // name-only ordering: ties come back in a different order per request, as Postgres may
    if (order.length === 1) for (let i = 1; i < sorted.length; i++) if (sorted[i].name === sorted[i - 1].name && calls.length % 2 === 0) [sorted[i], sorted[i - 1]] = [sorted[i - 1], sorted[i]];
    const off = Number(u.searchParams.get("offset") || 0), lim = Math.min(Number(u.searchParams.get("limit") || Infinity), maxRows);
    if (failOffsets.includes(off)) return { ok: false, json: async () => ({ message: "boom" }), headers: new Map() };
    const page = sorted.slice(off, off + lim);
    const headers = new Map([["content-range", `${off}-${off + page.length - 1}/${opts.headers?.Prefer === "count=exact" ? rows.length : "*"}`]]);
    return { ok: true, json: async () => page, headers: { get: (k) => headers.get(k) } };
  };
  return { fetch, calls };
}
async function load(rows, { embedded = false, ...o } = {}) {
  const s = server(rows, o);
  const fn = new Function("fetch", "SUPABASE_URL", "SUPABASE_ANON", "DIR_COLS", "embeddedProfile", `return ${body};`);
  const out = await fn(s.fetch, "https://example.invalid", "anon", "slug,name,ctier:tier", embedded);
  return { out, calls: s.calls };
}
const make = (n, dupEvery = 0) => Array.from({ length: n }, (_, i) => ({ slug: `co-${String(i).padStart(5, "0")}`, name: dupEvery && i % dupEvery === 1 ? `Name ${String(i - 1).padStart(5, "0")}` : `Name ${String(i).padStart(5, "0")}` }));
const uniq = (rows) => new Set(rows.map((r) => r.slug)).size;

let r = await load(make(1492));
ok(r.out.length === 1492 && uniq(r.out) === 1492, "1,492 published companies (production today): all returned, none repeated", `${r.out.length}/${uniq(r.out)}`);
ok(r.calls.length === 2, "two requests (first page + one concurrent page)", String(r.calls.length));
r = await load(make(1000));
ok(r.out.length === 1000 && r.calls.length === 1, "exactly 1,000: one request, all returned");
r = await load(make(2600));
ok(r.out.length === 2600 && uniq(r.out) === 2600 && r.calls.length === 3, "2,600: three requests, all returned");
r = await load([]);
ok(Array.isArray(r.out) && r.out.length === 0, "no companies: empty list, no error");
r = await load(make(1492), { embedded: true });
ok(r.out.length === 1000 && r.calls.length === 1, "embedded profile (?embed=1): keeps the single cheap page, as designed");
r = await load(make(1492, 2));
ok(r.out.length === 1492 && uniq(r.out) === 1492, "duplicate company names across the page boundary: none repeated or skipped (order=name,slug)", `${uniq(r.out)} unique`);
ok(r.calls.every((u) => /order=name,slug/.test(u)), "every page request uses the stable order");
r = await load(make(1492), { failOffsets: [1000] });
ok(r.out.length === 1000, "a failed later page degrades to the first page instead of crashing the app (known limitation: partial list)");
console.log(`\n  directory-pagination: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
