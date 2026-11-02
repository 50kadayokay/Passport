// 0092 (listing_reports: INSERT on the app's six columns only) OFFLINE: the
// migration and rollback, the columns against what the installed build sends,
// the manifest and plan, and the staging check's own cases and guard. The live
// proof is scripts/listing-reports-0092-check.mjs (staging, rolled back; S4).
//   node scripts/listing-reports-0092-test.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PENDING, PREREQUISITES } from "./_migration-manifest.mjs";
import { PRODUCTION_REFS } from "./_target-guard.mjs";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const read = (f) => fs.readFileSync(f, "utf8");
const code = (s) => s.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();

const F = "0092_listing_reports_column_insert";
const mig = code(read(`supabase/migrations/${F}.sql`));
const rb = code(read(`supabase/rollbacks/${F}.rollback.sql`));
const SIX = ["company_slug", "company_name", "kind", "message", "contact", "user_id"];

console.log("\n  THE MIGRATION");
ok(mig === `begin; revoke insert on public.listing_reports from anon, authenticated; grant insert (${SIX.join(", ")}) on public.listing_reports to anon, authenticated; commit;`,
  "exactly: revoke table-level INSERT from anon and authenticated, grant INSERT on the six columns, in one transaction", mig);
ok(!/policy|select|update|delete|alter table|service_role/i.test(mig.replace(/revoke insert|grant insert/g, "")), "touches no policy, no other privilege, no other role (0077's policy and bounds stay)");
ok(!/\bid\b|created_at/.test(mig), "id and created_at are not granted (they take their defaults)");

console.log("\n  THE SIX COLUMNS = WHAT THE INSTALLED BUILD SENDS");
const g = spawnSync("git", ["show", "prod-v1.3.2:src/aiBrief/PassportProto.jsx"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
ok(g.status === 0, "read PassportProto.jsx at prod-v1.3.2 (local git)", (g.stderr || "").slice(0, 200));
const shipped = g.stdout || "";
const call = shipped.slice(shipped.indexOf("/rest/v1/listing_reports"), shipped.indexOf("/rest/v1/listing_reports") + 600);
const sent = ((/JSON\.stringify\(\{([^}]*)\}\)/.exec(call) || [])[1] || "").split(",").map((s) => s.trim().split(":")[0].trim()).filter(Boolean);
ok(JSON.stringify(sent) === JSON.stringify(SIX), `prod-v1.3.2 sends exactly ${SIX.join(", ")}`, sent.join(", "));
ok(/Prefer: "return=minimal"/.test(call), "...with return=minimal, so it never needs SELECT on any column");
const cur = read("src/aiBrief/PassportProto.jsx");
const curCall = cur.slice(cur.indexOf("/rest/v1/listing_reports"), cur.indexOf("/rest/v1/listing_reports") + 600);
const curSent = ((/JSON\.stringify\(\{([^}]*)\}\)/.exec(curCall) || [])[1] || "").split(",").map((s) => s.trim().split(":")[0].trim()).filter(Boolean);
ok(curSent.every((k) => SIX.includes(k)), "the next build's fallback sends only those columns too", curSent.join(", "));
const t17 = read("supabase/migrations/0017_listing_reports.sql");
ok(/created_at\s+timestamptz not null default now\(\)/.test(t17) && /id\s+uuid primary key default gen_random_uuid\(\)/.test(t17), "id and created_at have defaults (0017), so a six-column insert is complete");
const sub = read("api/_submissions.js");
ok(/table: "listing_reports"/.test(sub) && /serviceRest|service/i.test(sub), "/api/submit writes as the service role, which 0092 does not touch");

console.log("\n  THE ROLLBACK");
ok(rb === "begin; revoke insert on public.listing_reports from anon, authenticated; grant insert on public.listing_reports to anon, authenticated; commit;",
  "restores the post-0077 grants: table-level INSERT for both (REVOKE on the table first, which drops the column grants)", rb);
const m77 = code(read("supabase/migrations/0077_listing_reports_installed_app_compat.sql"));
const m17 = code(t17);
ok(/grant insert on public\.listing_reports to anon;/.test(m77) && /grant insert on public\.listing_reports to anon, authenticated;/.test(m17), "...which is what 0017 (authenticated) and 0077 (anon) grant");

console.log("\n  MANIFEST AND PLAN");
ok(`${F}.sql` in PENDING && /0077/.test(PENDING[`${F}.sql`]), "0092 is PENDING, and says it runs with 0077");
ok(JSON.stringify(PREREQUISITES[`${F}.sql`]) === JSON.stringify(["0077_listing_reports_installed_app_compat.sql"]), "PREREQUISITES: 0092 needs 0077");
const plan = read("docs/PRODUCTION-ROLLOUT-PLAN.md");
const rows = [...plan.matchAll(/^\| (\d+) \| `([^`]+)` \| ([^|]+) \|/gm)].map((m) => ({ n: +m[1], f: m[2], phase: m[3].trim() }));
const i77 = rows.findIndex((r) => r.f === "0077_listing_reports_installed_app_compat.sql"), i92 = rows.findIndex((r) => r.f === `${F}.sql`);
ok(i92 === i77 + 1 && rows[i92].phase === "3", "the rollout plan runs 0092 in Phase 3, immediately after 0077");
ok(/A guest cannot set `id` or `created_at` on a listing report \(0092\)/.test(plan), "the Phase 3 checkpoint names it");

console.log("\n  THE STAGING CHECK");
const chk = read("scripts/listing-reports-0092-check.mjs");
ok(/await c\.query\("begin"\)/.test(chk) && /finally \{\s*await c\.query\("rollback"\)/.test(chk) && !/["'`]commit/i.test(chk), "one transaction, always rolled back");
for (const [label, re] of [
  ["the baseline (0077 lets a guest set created_at and id)", /under 0077 a guest CAN set created_at \(backdate\) and id/],
  ["the installed payload is stored (both kinds, signed out and in)", /anon, signed out \(user_id null\), six columns -> stored[\s\S]*anon key \+ user_id/],
  ["id and created_at are refused", /created_at -> refused \(42501\)[\s\S]*id -> refused \(42501\)/],
  ["the id oracle is gone", /the id oracle is gone/],
  ["0077's policy unchanged and its bounds still apply", /0077's policy is byte-for-byte unchanged[\s\S]*0077's bounds still apply/],
  ["the service role still writes", /the service role \(\/api\/submit\) still writes/],
  ["bulk arrays and the rate limit noted as findings", /finding\("still no rate limit[\s\S]*finding\("one request still stores many rows/],
  ["the rollback restores the post-0077 grants exactly", /the rollback restores the post-0077 grants exactly/],
]) ok(re.test(chk), `covers: ${label}`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lr0092-"));
fs.mkdirSync(path.join(tmp, "supabase/staging"), { recursive: true });
fs.writeFileSync(path.join(tmp, "supabase/staging/.connection"), `postgresql://nobody@db.${PRODUCTION_REFS[0]}.supabase.invalid:5432/postgres\n`);
const run = spawnSync(process.execPath, [path.resolve("scripts/listing-reports-0092-check.mjs")], { cwd: tmp, encoding: "utf8", timeout: 20000 });
ok(run.status === 2 && /REFUSING: not the staging project/.test(run.stderr), "the check refuses a production connection (exit 2) before connecting", `${run.status} ${(run.stderr || "").slice(0, 200)}`);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n  listing-reports-0092: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
