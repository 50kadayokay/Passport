// Compare function SOURCE read from a database (by
// supabase/audit/production_function_source_2026_11_01.sql) with every version
// of that function in supabase/migrations/, and show only the differences.
//   node scripts/function-drift-diff.mjs <results.json>
//
// The source is treated as sensitive. Before anything is shown or written,
// every body is scanned for secret-shaped text (API keys, JWTs, bearer tokens,
// long hex/base64 runs, quoted values next to password/secret/key/token words);
// each hit is replaced with [REDACTED-<kind>] and counted. Only the redacted
// unified diffs are printed, and they are saved next to the results file in the
// gitignored supabase/audit/results/ folder. Nothing connects to a database.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const file = process.argv[2];
if (!file || !/^supabase\/audit\/results\/[\w.-]+\.json$/.test(file)) { console.error("  usage: node scripts/function-drift-diff.mjs supabase/audit/results/<file>.json"); process.exit(2); }
const res = JSON.parse(fs.readFileSync(file, "utf8"));
const rows = (res.results || []).flatMap((r) => (r.error ? [] : r.rows || []));
if (!rows.length) { console.error("  no function rows in that file"); process.exit(3); }

const SECRETS = {
  stripe: /\b[sr]k_(live|test)_[A-Za-z0-9]{8,}/g,
  jwt: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(\.[A-Za-z0-9_-]+)?/g,
  bearer: /bearer\s+[A-Za-z0-9._-]{16,}/gi,
  assigned: /((?:password|passwd|secret|api_?key|token|service_role)\w*\s*(?::=|=|=>|,)\s*)'[^']{6,}'/gi,
  hex: /\b[0-9a-f]{32,}\b/gi,
  base64: /\b[A-Za-z0-9+/]{40,}={0,2}/g,
};
function redact(text) {
  const hits = {};
  for (const [k, re] of Object.entries(SECRETS)) {
    text = text.replace(re, (m, pre) => { hits[k] = (hits[k] || 0) + 1; return k === "assigned" ? `${pre}'[REDACTED-${k}]'` : `[REDACTED-${k}]`; });
  }
  return { text, hits };
}

// Every "create or replace function public.<name>(...)" block in the migrations,
// up to the closing dollar-quote, in file order.
function repoVersions(name) {
  const out = [];
  for (const f of fs.readdirSync("supabase/migrations").filter((x) => x.endsWith(".sql")).sort()) {
    const sql = fs.readFileSync(`supabase/migrations/${f}`, "utf8");
    const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`, "gi");
    let m;
    while ((m = re.exec(sql))) {
      const rest = sql.slice(m.index);
      const tag = (rest.match(/\bas\s+(\$[A-Za-z_]*\$)/i) || [])[1];
      if (!tag) continue;
      const open = rest.indexOf(tag), close = rest.indexOf(tag, open + tag.length);
      if (close < 0) continue;
      out.push({ where: `${f}`, body: rest.slice(open + tag.length, close) });
    }
  }
  return out;
}
const bodyOf = (def) => { const tag = (def.match(/\bAS\s+(\$[A-Za-z_]*\$)/) || [])[1]; if (!tag) return def; const a = def.indexOf(tag); return def.slice(a + tag.length, def.indexOf(tag, a + tag.length)); };
const norm = (b) => b.split("\n").map((l) => l.replace(/--.*$/, "").replace(/\s+/g, " ").trim()).filter(Boolean).join("\n") + "\n";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fndrift-"));
const udiff = (a, b, la, lb) => {
  fs.writeFileSync(`${tmp}/a`, a); fs.writeFileSync(`${tmp}/b`, b);
  const r = spawnSync("diff", ["-u", "--label", la, "--label", lb, `${tmp}/a`, `${tmp}/b`], { encoding: "utf8" });
  return r.stdout;
};
const changed = (d) => d.split("\n").filter((l) => /^[+-](?![+-])/.test(l)).length;

let report = "";
const say = (s = "") => { report += s + "\n"; console.log(s); };
let totalHits = 0;
for (const r of rows) {
  const name = r.signature.replace(/\(.*$/, "");
  const { text: def, hits } = redact(r.definition || "");
  const n = Object.values(hits).reduce((a, b) => a + b, 0); totalHits += n;
  say(`\n=== ${r.signature}   owner=${r.owner} security_definer=${r.security_definer} config=${r.config || "-"} digest=${r.digest}`);
  say(`    secret scan: ${n ? `${n} redacted ${JSON.stringify(hits)}` : "nothing secret-shaped found"}`);
  const prod = norm(bodyOf(def));
  const versions = repoVersions(name).map((v) => ({ ...v, d: udiff(norm(redact(v.body).text), prod, `repo ${v.where}`, `${res.target} (live)`) }));
  if (!versions.length) { say("    no repo version found"); continue; }
  for (const v of versions) say(`    vs ${v.where}: ${changed(v.d)} changed line(s) (whitespace/comments ignored)`);
  const best = versions.reduce((a, b) => (changed(b.d) < changed(a.d) ? b : a));
  say(changed(best.d) ? `    nearest: ${best.where}; differences:\n${best.d.replace(/^/gm, "      ")}` : `    identical in substance to ${best.where}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
const outFile = file.replace(/\.json$/, ".drift.txt");
fs.writeFileSync(outFile, report);
console.log(`\n  ${rows.length} function(s) compared; ${totalHits} secret-shaped value(s) redacted; redacted report -> ${outFile}`);
