// Compare the read-only production audit (production_replaced_functions_2026_11_01.sql)
// with the repo reference built on staging (all 27 pending migrations unwound, rolled back).
//   node scripts/production-shape-compare.mjs <production.json> <reference.json> <out.md>
// Offline: reads two local JSON files, connects to nothing. Digests and names only.
import fs from "node:fs";

const [prodFile, refFile, outFile] = process.argv.slice(2);
if (!prodFile || !refFile || !outFile) { console.error("usage: <production.json> <reference.json> <out.md>"); process.exit(2); }
const prod = JSON.parse(fs.readFileSync(prodFile, "utf8"));
const ref = JSON.parse(fs.readFileSync(refFile, "utf8"));
if (prod.target !== "production" || prod.read_only_transaction !== true || prod.ended_with !== "ROLLBACK") {
  console.error("refusing: the production file is not a read-only production audit"); process.exit(2);
}
const errors = prod.results.filter((r) => r.error);
const P = Object.fromEntries(prod.results.filter((r) => !r.error).map((r) => [r.label, r.rows]));
const R = Object.fromEntries(ref.results.map((rows) => [rows[0]?.q, rows]));

// 0078 drops and recreates these six by name; anything else permissive survives it.
const DROPPED_BY_0078 = ["media_write_own", "docs_upload_own", "docs_delete_authorized", "privmedia_write", "privmedia_update", "privmedia_company_delete"];
// Which pending migration replaces each function, and what its rollback restores.
const REPLACED_BY = {
  publish_publication: "0071 (rollback restores repo 0036 text)",
  claim_deliveries: "0071 (rollback restores repo 0008 text)",
  company_go_live: "0072 (rollback restores repo 0035 text)",
  accept_company_invitation: "0076 (rollback restores repo 0031 text)",
  mineiq_search: "0080 (rollback restores repo 0050a text)",
};

const lines = [], blockers = [], notes = [];
const say = (s = "") => lines.push(s);
say("# Production shape vs repo (read-only audit, digests only)");
say(`production audit: ${prod.at}; reference: ${ref.at}`);
if (errors.length) { say(`\n**${errors.length} statement(s) errored on production:** ${errors.map((e) => `${e.label}: ${e.error}`).join("; ")}`); blockers.push("audit statements errored; re-run needed"); }

say("\n## Q01 functions the pending migrations replace");
const refFn = new Map((R.Q01 || []).map((r) => [r.signature, r]));
const prodFn = new Map((P.Q01 || []).map((r) => [r.signature, r]));
for (const sig of [...new Set([...refFn.keys(), ...prodFn.keys()])].sort()) {
  const p = prodFn.get(sig), r = refFn.get(sig), name = sig.split("(")[0];
  if (!p) { say(`- ${sig}: MISSING in production (repo expects it)`); blockers.push(`${sig} missing in production before ${REPLACED_BY[name] || "?"}`); continue; }
  if (!r) { say(`- ${sig}: present in production, not in the repo reference (extra overload)`); notes.push(`${sig}: extra overload in production; check the migration's create-or-replace targets the right one`); continue; }
  const same = p.digest === r.digest, secdef = p.security_definer === r.security_definer, acl = p.execute_acl === r.execute_acl;
  say(`- ${sig}: body ${same ? "MATCHES repo" : "DIFFERS (drift)"}; security definer ${secdef ? "same" : `prod ${p.security_definer} vs repo ${r.security_definer}`}; execute grants ${acl ? "same" : "DIFFER"}`);
  if (!same) blockers.push(`${sig}: production body drifted; ${REPLACED_BY[name]} would NOT restore production. Needs a production-exact rollback (capture source with production_function_source_2026_11_01.sql, approval needed)`);
  if (!acl) notes.push(`${sig}: execute grants differ (prod ${p.execute_acl} | repo ${r.execute_acl}); the migration's revoke/grant lines decide the final state`);
  if (!secdef) blockers.push(`${sig}: SECURITY DEFINER differs from the repo`);
}

say("\n## Q02 storage.objects policies");
const refPol = new Map((R.Q02 || []).map((r) => [r.policyname, r]));
const prodPol = new Map((P.Q02 || []).map((r) => [r.policyname, r]));
for (const name of [...new Set([...refPol.keys(), ...prodPol.keys()])].sort()) {
  const p = prodPol.get(name), r = refPol.get(name);
  const tag = DROPPED_BY_0078.includes(name) ? " [0078 replaces]" : "";
  if (!p) { say(`- ${name}${tag}: absent in production (repo has it)`); if (DROPPED_BY_0078.includes(name)) notes.push(`${name}: absent in production; 0078's drop-if-exists is harmless and its create adds it`); else notes.push(`${name}: repo policy missing in production`); continue; }
  if (!r) {
    const risky = p.permissive === "PERMISSIVE" && ["INSERT", "UPDATE", "DELETE", "ALL"].includes(p.cmd) && !DROPPED_BY_0078.includes(name);
    say(`- ${name}: EXTRA in production (${p.cmd}, ${p.permissive}, roles ${p.roles})${risky ? " -- PERMISSIVE WRITE that 0078 does not drop" : ""}`);
    if (risky) blockers.push(`storage policy "${name}" (${p.cmd}) exists only in production and survives 0078: the write hole 0078 closes would stay open (R4). Decide: drop it in a production-only migration, or prove it is harmless`);
    else notes.push(`storage policy "${name}" (${p.cmd}) exists only in production (not a permissive write)`);
    continue;
  }
  const same = p.digest === r.digest;
  say(`- ${name}${tag}: ${same ? "matches repo" : `DIFFERS (prod ${p.cmd}/${p.roles})`}`);
  if (!same && !DROPPED_BY_0078.includes(name)) notes.push(`storage policy "${name}" differs from the repo and 0078 does not replace it`);
}

say("\n## Q03 buckets and posts.media_url");
for (const r of P.Q03 || []) {
  say(`- ${r.item}: ${r.present ? "present" : "MISSING"}`);
  // A bucket a pending migration creates is expected to be missing until then.
  const CREATED_BY = { "message-attachments": "0062" };
  if (!r.present && r.item !== "posts.media_url") {
    if (CREATED_BY[r.item]) notes.push(`bucket ${r.item} missing in production: expected, ${CREATED_BY[r.item]} (pending, before 0078) creates it`);
    else blockers.push(`bucket ${r.item} missing in production; 0078's policies name it`);
  }
  if (r.item === "posts.media_url") notes.push(r.present ? "posts.media_url already exists in production (0071 A adds it if missing; the investor app reads it)" : "posts.media_url absent in production: 0071 adds it; 0087 and the investor app read it only after 0071");
}

say("\n## Blockers"); if (blockers.length) blockers.forEach((b, i) => say(`${i + 1}. ${b}`)); else say("none from this audit");
say("\n## Notes"); if (notes.length) notes.forEach((n) => say(`- ${n}`)); else say("none");
const md = lines.join("\n") + "\n";
fs.writeFileSync(outFile, md);
console.log(md);
console.log(`SUMMARY blockers=${blockers.length} notes=${notes.length} errors=${errors.length}`);
