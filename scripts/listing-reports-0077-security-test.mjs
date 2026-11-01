// 0077's anon door on listing_reports, OFFLINE: the policy against /api/submit's
// limits, the installed build's request against what the policy and a column
// grant would accept, and the staging check's own guard. The live probe is
// scripts/listing-reports-0077-security-check.mjs (staging, rolled back; S4).
//   node scripts/listing-reports-0077-security-test.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { FORMS } from "../api/_submissions.js";
import { PRODUCTION_REFS } from "./_target-guard.mjs";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const read = (f) => fs.readFileSync(f, "utf8");
const code = (s) => s.replace(/--[^\n]*/g, "");

const M77 = code(read("supabase/migrations/0077_listing_reports_installed_app_compat.sql"));
const M17 = code(read("supabase/migrations/0017_listing_reports.sql"));
const check = (/with check \(([\s\S]*?)\);/.exec(M77) || [])[1] || "";

console.log("\n  WHAT 0077 OPENS");
ok(/grant insert on public\.listing_reports to anon;/.test(M77) && !/grant (select|update|delete|all)/i.test(M77), "anon gets INSERT on listing_reports, nothing else");
ok(/for insert to anon, authenticated/.test(M77) && !/for (select|update|delete|all)/i.test(M77), "the one policy is FOR INSERT; no read policy is created");
ok(!/contact_submissions|demo_bookings/.test(M77), "contact_submissions and demo_bookings stay closed (0058)");
ok(!/user_id/.test(check), "user_id is unconstrained (by design: installed builds send the signed-in id with the anon key)");

console.log("\n  ITS BOUNDS = /api/submit's");
const L = FORMS.listing_report.fields;
const bound = (col) => { const m = new RegExp(`length\\(coalesce\\(${col}, ''\\)\\)\\s*<= (\\d+)`).exec(check); return m && Number(m[1]); };
ok(/length\(company_slug\) between 1 and (\d+)/.exec(check)?.[1] === String(L.company_slug), `company_slug 1..${L.company_slug}`);
for (const col of ["company_name", "message", "contact"]) ok(bound(col) === L[col], `${col} <= ${L[col]}`, `0077: ${bound(col)}`);
ok(/kind in \('error', 'claim'\)/.test(check) && JSON.stringify(FORMS.listing_report.enums.kind) === '["error","claim"]', "kind in (error, claim), as /api/submit");
ok(/throttle/i.test(read("api/_submissions.js")) && !/throttle/i.test(M77), "the throttle (0057) is applied in /api/submit only; 0077 has none (the check reports the burst)");

console.log("\n  WHAT THE INSTALLED BUILD SENDS (prod-v1.3.2 = store 1.3.1 build 17)");
const g = spawnSync("git", ["show", "prod-v1.3.2:src/aiBrief/PassportProto.jsx"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
ok(g.status === 0, "read PassportProto.jsx at prod-v1.3.2 (local git)", (g.stderr || "").slice(0, 200));
const shipped = g.stdout || "";
const at = shipped.indexOf("/rest/v1/listing_reports");
const call = shipped.slice(at, at + 600);
ok(at > 0 && /Authorization: `Bearer \$\{SUPABASE_ANON\}`/.test(call), "it posts to /rest/v1/listing_reports with the ANON key as the bearer (so role anon even when signed in)");
ok(/Prefer: "return=minimal"/.test(call), "Prefer: return=minimal: it never asks for the row back, so refusing RETURNING breaks nothing");
const body = (/JSON\.stringify\(\{([^}]*)\}\)/.exec(call) || [])[1] || "";
const sent = body.split(",").map((s) => s.trim().split(":")[0].trim()).filter(Boolean);
const SIX = ["company_slug", "company_name", "kind", "message", "contact", "user_id"];
ok(JSON.stringify(sent) === JSON.stringify(SIX), `it sends exactly ${SIX.join(", ")}`, sent.join(", "));
ok(!/maxLength/.test(shipped.slice(shipped.indexOf("function ReportListingSheet"), shipped.indexOf("function ReportListingSheet") + 4000)), "(its sheet has no maxLength: a message over 4000 characters, accepted before 0058, is now refused and shows the sheet's error state)");
ok(SIX.every((col) => new RegExp(`\\b${col}\\b`).test(M17)) && /\bid\b.*default gen_random_uuid/.test(M17) && /created_at.*default now\(\)/.test(M17), "the table's other columns, id and created_at, have defaults: a six-column INSERT grant would keep the app working");
const cur = read("src/aiBrief/PassportProto.jsx");
ok(/\/api\/submit\?form=listing_report/.test(cur) && /\/rest\/v1\/listing_reports/.test(cur), "the next build posts to /api/submit and falls back to this same direct insert");

console.log("\n  THE STAGING CHECK");
const chk = read("scripts/listing-reports-0077-security-check.mjs");
ok(/await c\.query\("begin"\)/.test(chk) && /finally \{\s*await c\.query\("rollback"\)/.test(chk) && !/["'`]commit/i.test(chk), "one transaction, always rolled back");
for (const [label, re] of [
  ["anon insert (the installed payload) stored", /as 1\.3\.x sends it -> stored/],
  ["anon SELECT denied", /"SELECT -> refused \(42501\)"/],
  ["RETURNING gives nothing", /RETURNING \* \(PostgREST return=representation\) -> refused, nothing stored/],
  ["upsert / UPDATE / DELETE denied", /upsert \(on conflict do update[\s\S]*UPDATE and DELETE -> refused/],
  ["over-long values refused", /over \$\{limit\} -> refused/],
  ["unknown column refused", /a column that does not exist \(status\) -> refused \(42703\)/],
  ["the throttle burst measured", /20 back-to-back anon reports/],
  ["the column-grant fix tried", /grant insert \(\$\{COLS\}\) on public\.listing_reports to anon/],
]) ok(re.test(chk), `covers: ${label}`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lr0077-"));
fs.mkdirSync(path.join(tmp, "supabase/staging"), { recursive: true });
fs.writeFileSync(path.join(tmp, "supabase/staging/.connection"), `postgresql://nobody@db.${PRODUCTION_REFS[0]}.supabase.invalid:5432/postgres\n`);
const run = spawnSync(process.execPath, [path.resolve("scripts/listing-reports-0077-security-check.mjs")], { cwd: tmp, encoding: "utf8", timeout: 20000 });
ok(run.status === 2 && /REFUSING: not the staging project/.test(run.stderr), "the check refuses a production connection (exit 2) before connecting", `${run.status} ${(run.stderr || "").slice(0, 200)}`);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n  listing-reports-0077-security: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
