// What each LIVE surface depends on in the database, and which pending
// migrations touch those dependencies. Static analysis only: reads source and
// migration files, contacts nothing.
//   node scripts/surface-inventory.mjs [--json out.json]
//
// SURFACES are import graphs from their real entry points (React.lazy and
// import() included). The investor app is AppRoot's dynamic import of
// aiBrief/PassportProto.jsx (web /app and the native shell), plus the /p/<id>
// deep link and main.jsx's own static imports. Portal, admin, studio and the
// console are separate surfaces -- if an investor-app graph ever reaches them,
// that crossing is reported.
//
// Per file it extracts: REST tables (/rest/v1/<t>), RPC functions (rpc/<f>),
// storage buckets (/storage/v1/object/[public|sign]/<b>), and /api/<route>
// calls. A path built entirely at runtime (`/rest/v1/${table}`) cannot be
// resolved statically and is listed for manual review rather than ignored.
// /api routes are followed into api/*.js, whose service-role REST/RPC use is
// attributed to the surface that calls the route.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const rel = (f) => path.relative(ROOT, f);
const EXT = ["", ".js", ".jsx", ".ts", ".tsx", ".mjs", "/index.js", "/index.jsx", "/index.ts", "/index.tsx"];
const resolve = (from, spec) => {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const e of EXT) { const f = base + e; if (fs.existsSync(f) && fs.statSync(f).isFile()) return f; }
  return null;
};
const read = (f) => fs.readFileSync(f, "utf8");
const importsOf = (src) => [
  ...[...src.matchAll(/(?:import|export)\s[^'"`;]*?from\s*["']([^"']+)["']/g)].map((m) => m[1]),
  ...[...src.matchAll(/import\s*["']([^"']+)["']/g)].map((m) => m[1]),
  ...[...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]),
];
function graph(entries, { stopAt = [] } = {}) {
  const seen = new Set(), crossings = [];
  const walk = (f, from) => {
    if (!f || seen.has(f)) return;
    if (stopAt.some((d) => rel(f).startsWith(d))) { crossings.push(`${rel(from)} -> ${rel(f)}`); return; }
    seen.add(f);
    for (const s of importsOf(read(f))) walk(resolve(f, s), f);
  };
  for (const e of entries) walk(path.resolve(ROOT, e), null);
  return { files: [...seen], crossings };
}
// Comments mention routes and tables that the code does not call; drop them.
// (A `//` preceded by ':' is a URL, not a comment.)
const noComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
function extract(raw) {
  const src = noComments(raw);
  const out = { tables: new Set(), rpcs: new Set(), buckets: new Set(), api: new Set(), dynamic: [] };
  for (const m of src.matchAll(/\/rest\/v1\/(rpc\/)?([a-z_][a-z0-9_]*)/g)) { if (m[2] !== "rpc") (m[1] ? out.rpcs : out.tables).add(m[2]); }
  for (const m of src.matchAll(/["'`]rpc\/([a-z_][a-z0-9_]*)/g)) out.rpcs.add(m[1]);
  for (const m of src.matchAll(/serviceRpc\(\s*["']([a-z_][a-z0-9_]*)["']/g)) out.rpcs.add(m[1]);
  for (const m of src.matchAll(/serviceRest\(\s*[`"']([a-z_][a-z0-9_]*)/g)) out.tables.add(m[1]);
  // Local REST helpers: `${REST}/table`, and investorData's call("table?...").
  for (const m of src.matchAll(/\$\{REST\}\/(rpc\/)?([a-z_][a-z0-9_]*)/g)) { if (m[2] !== "rpc") (m[1] ? out.rpcs : out.tables).add(m[2]); }
  for (const m of src.matchAll(/\bcall\(\s*[`"'](rpc\/)?([a-z_][a-z0-9_]*)[?`"']/g)) (m[1] ? out.rpcs : out.tables).add(m[2]);
  for (const m of src.matchAll(/\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?([a-z][a-z0-9_-]*)/g)) out.buckets.add(m[1]);
  for (const m of src.matchAll(/uploadToBucket\(\s*["']([a-z][a-z0-9_-]*)["']/g)) out.buckets.add(m[1]);
  for (const m of src.matchAll(/\/api\/([a-z0-9_-]+)/g)) out.api.add(m[1]);
  for (const m of src.matchAll(/\/rest\/v1\/\$\{([^}]+)\}/g)) out.dynamic.push(m[1].trim());
  return out;
}
function surface(name, entries, opts) {
  const { files, crossings } = graph(entries, opts);
  const acc = { tables: new Set(), rpcs: new Set(), buckets: new Set(), api: new Set(), dynamic: new Set(), files: files.length };
  const add = (x, f) => { for (const k of ["tables", "rpcs", "buckets", "api"]) x[k].forEach((v) => acc[k].add(v)); x.dynamic.forEach((d) => acc.dynamic.add(`${rel(f)}: \${${d}}`)); };
  for (const f of files) add(extract(read(f)), f);
  // Follow /api routes into the server code they run (service-role access).
  const apiSeen = new Set();
  const queue = [...acc.api];
  while (queue.length) {
    const r = queue.shift(); if (apiSeen.has(r)) continue; apiSeen.add(r);
    const f = path.join(ROOT, "api", `${r}.js`); if (!fs.existsSync(f)) continue;
    for (const g of graph([rel(f)]).files) { const x = extract(read(g)); add(x, g); x.api.forEach((a) => queue.push(a)); }
  }
  return { name, entries, ...acc, crossings };
}

const STOP = ["src/portal/", "src/admin/", "src/studio/", "src/console/"];
const surfaces = [
  surface("investor-app", ["src/aiBrief/PassportProto.jsx", "src/aiBrief/Feed.jsx", "src/lib/investorData.js"], { stopAt: STOP }),
  surface("public-site", ["src/marketing/MarketingSite.jsx", "src/site/Site.jsx", "src/aiBrief/conferenceV3/ConferenceV3Booth.jsx"], { stopAt: STOP }),
  surface("portal", ["src/portal/Portal.jsx", "src/portal/PortalGate.jsx"]),
  surface("admin", ["src/admin/MissionControl.jsx", "src/studio/Studio.tsx", "src/console/CompanyConsole.jsx"]),
];
// main.jsx's own static imports (auth, investorData) belong to the app shell.
{
  const m = read("src/main.jsx");
  const statics = [...m.matchAll(/^import[^;]*?from\s*["'](\.[^"']+)["']/gm)].map((x) => resolve(path.resolve("src/main.jsx"), x[1])).filter(Boolean);
  // The router itself is shared by EVERY surface, so it is its own bucket and
  // counted as live (conservatively, like the investor app).
  surfaces.splice(1, 0, surface("app-shell (main.jsx router, shared)", statics.map(rel), { stopAt: STOP }));
}

// ---- pending migrations: what each one touches ------------------------------
const MIG = "supabase/migrations";
const pending = fs.readdirSync(MIG).filter((f) => /^00(5[3-9]|6\d|7\d)/.test(f) && f.endsWith(".sql")).sort();
const strip = (s) => s.replace(/--[^\n]*/g, "");
function touches(sql) {
  // Function bodies (`as $$ ... $$`) run at CALL time, not at migration time:
  // the migration only replaces the function. DO blocks run now, so they stay.
  const s = strip(sql).replace(/\bas\s+\$([a-z_]*)\$[\s\S]*?\$\1\$/gi, "as $$<function body>$$");
  const t = { tables: new Map(), functions: new Map() };
  const note = (map, name, what) => { if (!name) return; name = name.toLowerCase().replace(/^public\./, ""); if (!map.has(name)) map.set(name, new Set()); map.get(name).add(what); };
  for (const m of s.matchAll(/create\s+table\s+if\s+not\s+exists\s+public\.([a-z_0-9]+)/gi)) note(t.tables, m[1], "create table");
  for (const m of s.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?public\.([a-z_0-9]+)\s+([a-z ]{3,40}?)(?:\s|\()/gi)) note(t.tables, m[1], `alter (${m[2].trim().split(" ").slice(0, 2).join(" ")})`);
  for (const m of s.matchAll(/(?:create|drop)\s+policy\s+(?:if\s+exists\s+)?"?[^"]+"?\s+on\s+public\.([a-z_0-9]+)/gi)) note(t.tables, m[1], "policy");
  for (const m of s.matchAll(/(grant|revoke)\s+[a-z ,()_]+?\s+on\s+(?:table\s+)?public\.([a-z_0-9]+)/gi)) note(t.tables, m[2], m[1].toLowerCase());
  for (const m of s.matchAll(/create\s+(?:or\s+replace\s+)?trigger\s+[a-z_0-9]+[\s\S]{0,80}?\son\s+(?:public\.)?([a-z_0-9]+)/gi)) note(t.tables, m[1], "trigger");
  for (const m of s.matchAll(/create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?[a-z_0-9]+\s+on\s+public\.([a-z_0-9]+)/gi)) note(t.tables, m[1], "index");
  for (const m of s.matchAll(/(?:insert\s+into|update|delete\s+from)\s+public\.([a-z_0-9]+)/gi)) note(t.tables, m[1], "data");
  for (const m of s.matchAll(/create\s+or\s+replace\s+function\s+public\.([a-z_0-9]+)/gi)) note(t.functions, m[1], "create/replace");
  for (const m of s.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?public\.([a-z_0-9]+)/gi)) note(t.functions, m[1], "drop");
  for (const m of s.matchAll(/(grant|revoke)\s+execute\s+on\s+function\s+public\.([a-z_0-9]+)/gi)) note(t.functions, m[2], `${m[1].toLowerCase()} execute`);
  // Dynamic loops: foreach x in array array['a', 'public.f(uuid)', ...] + execute format(...)
  for (const m of s.matchAll(/foreach\s+\w+\s+in\s+array\s+array\[([\s\S]*?)\]\s*loop([\s\S]*?)end\s+loop/gi)) {
    const body = m[2].toLowerCase();
    const op = /revoke|grant/.test(body) ? (body.includes("execute on function") ? "revoke/grant execute (loop)" : "revoke/grant (loop)") : /policy/.test(body) ? "policy (loop)" : "loop";
    for (const x of m[1].matchAll(/'([^']+)'/g)) {
      const v = x[1].replace(/^public\./, "");
      if (/\(/.test(v)) note(t.functions, v.split("(")[0], op); else note(t.tables, v, op);
    }
  }
  return t;
}
const migrations = pending.map((f) => ({ file: f, ...touches(read(path.join(MIG, f))) }));

// ---- intersection --------------------------------------------------------------
const app = surfaces[0], shell = surfaces[1], site = surfaces[2];
const live = { tables: new Set([...app.tables, ...shell.tables, ...site.tables]), rpcs: new Set([...app.rpcs, ...shell.rpcs, ...site.rpcs]) };
const users = (kind, n) => [(kind === "t" ? app.tables : app.rpcs).has(n) && "investor-app", (kind === "t" ? shell.tables : shell.rpcs).has(n) && "app-shell", (kind === "t" ? site.tables : site.rpcs).has(n) && "public-site"].filter(Boolean).join("+");
const hits = [];
for (const m of migrations) {
  for (const [tbl, ops] of m.tables) if (live.tables.has(tbl)) hits.push({ migration: m.file, kind: "table", name: tbl, ops: [...ops].join(", "), used_by: users("t", tbl) });
  for (const [fn, ops] of m.functions) if (live.rpcs.has(fn)) hits.push({ migration: m.file, kind: "function", name: fn, ops: [...ops].join(", "), used_by: users("f", fn) });
}

const fmt = (s) => [...s].sort().join(", ") || "-";
for (const s of surfaces) {
  console.log(`\n== ${s.name} (${s.files} files) ==`);
  console.log(`  tables: ${fmt(s.tables)}`);
  console.log(`  rpcs:   ${fmt(s.rpcs)}`);
  console.log(`  buckets: ${fmt(s.buckets)}   api: ${fmt(s.api)}`);
  if (s.dynamic.size) console.log(`  runtime-built REST paths (review): ${[...s.dynamic].join(" | ")}`);
  if (s.crossings && s.crossings.length) console.log(`  CROSSES INTO non-app code: ${s.crossings.join(" | ")}`);
}
console.log(`\n== pending migrations x live investor-app / public-site dependencies: ${hits.length} ==`);
for (const h of hits) console.log(`  ${h.migration.padEnd(42)} ${h.kind.padEnd(8)} ${h.name.padEnd(30)} ${h.used_by.padEnd(22)} ${h.ops}`);
const jsonIdx = process.argv.indexOf("--json");
if (jsonIdx > 0) fs.writeFileSync(process.argv[jsonIdx + 1], JSON.stringify({
  surfaces: surfaces.map((s) => ({ name: s.name, files: s.files, tables: [...s.tables].sort(), rpcs: [...s.rpcs].sort(), buckets: [...s.buckets].sort(), api: [...s.api].sort(), dynamic: [...s.dynamic], crossings: s.crossings })),
  migrations: migrations.map((m) => ({ file: m.file, tables: Object.fromEntries([...m.tables].map(([k, v]) => [k, [...v]])), functions: Object.fromEntries([...m.functions].map(([k, v]) => [k, [...v]])) })),
  hits,
}, null, 1));
