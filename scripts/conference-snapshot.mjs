// Conference dataset import utility — OPT-IN ONLY.
//
// Conference Mode OWNS its datasets (src/conference/companies/<slug>/dataset.json). They are curated,
// verified Conference data and are NOT mirrors of the MineEx investor profile. This tool therefore
// never overwrites a Conference dataset by default.
//
//   node scripts/conference-snapshot.mjs <slug>
//       → refuses (prints this help). Nothing is read or written.
//   node scripts/conference-snapshot.mjs <slug> --from-app-profile
//       → READ-ONLY comparison: fetches the published MineEx investor profile and prints a field diff
//         against the Conference dataset. Writes nothing.
//   node scripts/conference-snapshot.mjs <slug> --from-app-profile --force
//       → prints the same diff, then writes ONLY the differing comparable fields into dataset.json and
//         bumps dataset.version. Use only when a human has decided the app values are the right ones.
import fs from "node:fs";
import path from "node:path";

const [slug, ...flags] = process.argv.slice(2);
const FROM_APP = flags.includes("--from-app-profile"), FORCE = flags.includes("--force");
const file = slug && path.resolve(`src/conference/companies/${slug}/dataset.json`);

if (!slug || !FROM_APP) {
  console.error("Refusing: Conference datasets are Conference-owned and are never overwritten by default.\n" +
    "  Compare with the MineEx app profile (read-only):  --from-app-profile\n" +
    "  Import the differing fields (explicit):           --from-app-profile --force");
  process.exit(1);
}
if (!fs.existsSync(file)) { console.error("No Conference dataset at", file); process.exit(2); }
const ds = JSON.parse(fs.readFileSync(file, "utf8"));

const URL = "https://rvptronniomlqumjhyrr.supabase.co";
const ANON = (fs.readFileSync(path.resolve("src/lib/supabase.js"), "utf8").match(/sb_publishable_[A-Za-z0-9_\-]+/) || [])[0];
const res = await fetch(`${URL}/rest/v1/companies?slug=eq.${encodeURIComponent(slug)}&status=eq.published&select=profile`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
const rows = await res.json();
if (!Array.isArray(rows) || !rows[0]) { console.error("App profile not found / not published:", slug); process.exit(3); }
const p = rows[0].profile || {}, co = p.company || {}, cap = p.capital || {};

// Comparable fields only (Conference path ← app path). Everything else in the dataset is Conference-only.
const MAP = [
  ["company.name", co.name], ["company.jurisdiction", co.jurisdiction],
  ["capital.sharesOutstanding", cap.outstanding], ["capital.fullyDiluted", cap.fd],
  ["team", Array.isArray(p.team) ? p.team.map((m) => ({ name: m.name, role: m.role })) : undefined],
];
const get = (o, k) => k.split(".").reduce((a, x) => (a == null ? a : a[x]), o);
const set = (o, k, v) => { const ks = k.split("."); let a = o; ks.slice(0, -1).forEach((x) => (a = a[x] = a[x] || {})); a[ks[ks.length - 1]] = v; };
const diffs = MAP.filter(([k, v]) => v !== undefined && JSON.stringify(get(ds, k)) !== JSON.stringify(v));
if (!diffs.length) { console.log("No differences in comparable fields."); process.exit(0); }
for (const [k, v] of diffs) console.log(`~ ${k}\n    conference: ${JSON.stringify(get(ds, k))}\n    app:        ${JSON.stringify(v)}`);
if (!FORCE) { console.log("\nRead-only comparison. Re-run with --force to import these fields."); process.exit(0); }
for (const [k, v] of diffs) set(ds, k, v);
const [a, b, c] = String(ds.dataset.version || "1.0.0").split(".").map(Number);
ds.dataset.version = `${a}.${b}.${(c || 0) + 1}`; ds.dataset.lastImportFromApp = new Date().toISOString();
fs.writeFileSync(file, JSON.stringify(ds, null, 1) + "\n");
console.log(`\nImported ${diffs.length} field(s); dataset.version → ${ds.dataset.version}`);
