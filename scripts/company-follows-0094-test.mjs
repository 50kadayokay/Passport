// 0094 (company_follows: UPDATE on user_id, company_id for the installed apps'
// follow() upsert) OFFLINE: the migration and rollback, the premise that no
// non-admin UPDATE policy exists, the installed request it serves, the manifest
// and plan, and the staging check's cases and guard. The live proof is
// scripts/company-follows-0094-check.mjs (staging, rolled back; S4).
//   node scripts/company-follows-0094-test.mjs
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

const F = "0094_company_follows_upsert_grant";
const mig = code(read(`supabase/migrations/${F}.sql`));
const rb = code(read(`supabase/rollbacks/${F}.rollback.sql`));
const GRANT = "grant update (user_id, company_id) on public.company_follows to authenticated;";

console.log("\n  THE MIGRATION");
ok(mig.startsWith("begin; do $$") && mig.endsWith(`end $$; ${GRANT} commit;`), "one transaction: a self-check, then exactly the column grant", mig.slice(-160));
const body = mig.replace(/do \$\$[\s\S]*?end \$\$;/, "").replace(/\s+/g, " ");
ok(body === `begin; ${GRANT} commit;`, "nothing else is granted, revoked or changed", body);
ok(!/\bpolicy\b/i.test(body) && !/\banon\b|service_role/.test(body), "no policy, no other role");
const guard = (/do \$\$([\s\S]*?)end \$\$;/.exec(mig) || [])[1] || "";
ok(/relrowsecurity/.test(guard) && /raise exception '0094: RLS is off/.test(guard), "self-check: refuses if RLS is off on company_follows");
ok(/cmd in \('UPDATE', 'ALL'\)/.test(guard) && /is_admin/.test(guard) && /raise exception '0094: company_follows has a non-admin UPDATE policy/.test(guard), "self-check: refuses if any UPDATE/ALL policy is not admin-only");
ok((guard.match(/using errcode = '55000'/g) || []).length === 2, "both refusals are errors (55000), so the transaction aborts before the grant");
{
  // The guard's regex, as PostgreSQL will read it, against pg_policies' qual texts.
  const lit = (/!~ '([^']+)'/.exec(guard) || [])[1];
  const re = new RegExp(lit);
  ok(re.test("is_admin()") && re.test("(is_admin())") && re.test("public.is_admin()"), "the admin-only pattern accepts admin_all's qual", lit);
  ok(!re.test("(user_id = auth.uid())") && !re.test("(is_admin() OR (user_id = auth.uid()))") && !re.test(""), "...and rejects an own-row, a mixed or an empty (true) qual");
}

console.log("\n  THE PREMISE: NO NON-ADMIN UPDATE POLICY");
const m09 = read("supabase/migrations/0009_feed_listeners.sql");
const pols = [...m09.matchAll(/create policy "([a-z_]+)"\s+on public\.company_follows for (\w+)/g)].map((m) => `${m[1]}:${m[2]}`);
ok(JSON.stringify(pols) === JSON.stringify(["own_select:select", "own_insert:insert", "own_delete:delete", "admin_all:all"]), "0009: own_select, own_insert, own_delete, and admin_all", pols.join(" "));
ok(/create policy "admin_all"\s+on public\.company_follows for all to authenticated using \(public\.is_admin\(\)\)/.test(m09), "admin_all is is_admin() only");
const later = fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql") && f > "0009_feed_listeners.sql" && !f.startsWith(F))
  .filter((f) => /policy[^;]*on public\.company_follows/i.test(read(`supabase/migrations/${f}`).replace(/--[^\n]*/g, "")));
ok(later.length === 0, "no later migration adds or changes a company_follows policy", later.join(", "));
const m61a = code(read("supabase/migrations/0061a_table_privilege_hardening.sql"));
ok(/revoke all on public\.company_follows from anon, authenticated;/.test(m61a) && /grant select, insert, delete on public\.company_follows to authenticated;/.test(m61a), "0061a leaves authenticated select, insert, delete (no UPDATE), which 0094 does not touch");

console.log("\n  THE REQUEST IT SERVES");
const g = spawnSync("git", ["show", "prod-v1.3.2:src/lib/feed.js"], { encoding: "utf8" });
if (g.status === 0) {
  const s = g.stdout;
  const call = s.slice(s.indexOf("/rest/v1/company_follows`"), s.indexOf("/rest/v1/company_follows`") + 400);
  ok(/method: "POST"/.test(call) && /Prefer: "resolution=merge-duplicates,return=minimal"/.test(call), "prod-v1.3.2 follow(): POST with merge-duplicates (ON CONFLICT DO UPDATE)");
  ok(/body: JSON\.stringify\(\{ user_id: u\.id, company_id: companyId \}\)/.test(call), "...with exactly user_id and company_id: the SET list 0094 grants");
  ok(!/on_conflict=/.test(call), "...and no on_conflict, so the conflict target is the primary key (id)");
} else console.log("  - prod-v1.3.2 not in this clone: the installed request is not re-read");
ok(/Prefer: "resolution=ignore-duplicates,return=minimal"/.test(read("src/lib/feed.js")), "the current web code needs no UPDATE (ignore-duplicates); 0094 is for installed builds and stale tabs");
ok(/create table if not exists public\.company_follows \(\s*id uuid primary key default gen_random_uuid\(\),/.test(m09) && /unique \(user_id, company_id\)/.test(m09), "the primary key is id; (user_id, company_id) is a separate unique constraint");

console.log("\n  THE ROLLBACK");
ok(rb === "begin; revoke update (user_id, company_id) on public.company_follows from authenticated; commit;", "revokes exactly the column grant", rb);

console.log("\n  MANIFEST, PLAN, CHECKLIST, MATRIX");
ok(`${F}.sql` in PENDING && /0061a/.test(PENDING[`${F}.sql`]), "0094 is PENDING, and says it runs right after 0061a");
ok(JSON.stringify(PREREQUISITES[`${F}.sql`]) === JSON.stringify(["0061a_table_privilege_hardening.sql"]), "PREREQUISITES: 0094 needs 0061a");
const plan = read("docs/PRODUCTION-ROLLOUT-PLAN.md");
const rows = [...plan.matchAll(/^\| (\d+) \| `([^`]+)` \| ([^|]+) \|/gm)].map((m) => ({ n: +m[1], f: m[2], phase: m[3].trim() }));
const i61 = rows.findIndex((r) => r.f === "0061a_table_privilege_hardening.sql"), i94 = rows.findIndex((r) => r.f === `${F}.sql`);
ok(i94 === i61 + 1 && rows[i94].phase === "3", "the rollout plan runs 0094 in Phase 3, immediately after 0061a");
ok(rows[i94 + 1] && rows[i94 + 1].phase !== "3", "...as the last file of Phase 3");
ok(/After the last file of each phase \(0094, 0066, 0078, 0091\)/.test(plan) && /- \*\*Phase 3, after 0094:\*\*/.test(plan), "the runbook's phase-end audit and the Phase 3 checkpoint follow 0094");
ok(/follow request \(merge-duplicates\) on `company_follows` succeeds for the test investor \(0094\)/.test(plan), "the Phase 3 checkpoint names it");
ok(/0094 right after 0061a/.test(plan), "the runbook's apply steps name it");
const list = read("docs/PRODUCTION-LAUNCH-CHECKLIST.md");
{
  // The Phase 3 row records 0061a + 0094 as applied (2026-11-02) and the rest of group A (with 0095) as remaining.
  const row = list.split("\n").find((l) => /\| Phase 3:/.test(l)) || "";
  ok(/0061a and 0094 applied to production 2026-11-02/.test(row) && /Remaining group A: 0058, \*\*0095\*\*.*0077, 0092, 0093/.test(row), "the launch checklist's Phase 3 row lists it (applied with 0061a; group A with 0095 remaining)", row.slice(0, 160));
}
const matrix = read("docs/INSTALLED-APP-COMPATIBILITY-MATRIX.md");
ok(/\| I12 \|[^\n]*fixed by 0094[^\n]*\| ✅ \| ✅ \| ✅ \| ✅ \| ✅ \|/.test(matrix), "the compatibility matrix reads I12 as fixed by 0094");

console.log("\n  THE STAGING CHECK");
const chk = read("scripts/company-follows-0094-check.mjs");
ok(/await c\.query\("begin"\)/.test(chk) && /finally \{\s*await c\.query\("rollback"\)/.test(chk) && !/["'`]commit/i.test(chk), "one transaction, always rolled back");
ok(chk.includes("on conflict (id) do update set user_id = excluded.user_id, company_id = excluded.company_id"), "it sends PostgREST's merge-duplicates statement");
for (const [label, re] of [
  ["the baseline 42501", /refused 42501 -- the I12 break/],
  ["the premise (RLS on, admin-only UPDATE policies)", /RLS is on for company_follows[\s\S]*every UPDATE\/ALL policy is admin-only/],
  ["the self-check refusing", /0094 refuses to run \(55000, nothing granted\)/],
  ["the installed follow stored", /42501 → 201/],
  ["an existing follow unchanged", /refused 23505 \(unique user_id, company_id\), the row unchanged[\s\S]*full UPDATE grant/],
  ["another user cannot touch it", /another user's UPDATE of it matches 0 rows[\s\S]*another user's upsert onto its id is refused by RLS/],
  ["anon gets nothing", /anon: still nothing[\s\S]*anon: \$\{label\} → refused/],
  ["the rollback", /the rollback restores 0061a's grants exactly[\s\S]*refused again \(42501\)/],
]) ok(re.test(chk), `covers: ${label}`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cf0094-"));
fs.mkdirSync(path.join(tmp, "supabase/staging"), { recursive: true });
fs.writeFileSync(path.join(tmp, "supabase/staging/.connection"), `postgresql://nobody@db.${PRODUCTION_REFS[0]}.supabase.invalid:5432/postgres\n`);
const run = spawnSync(process.execPath, [path.resolve("scripts/company-follows-0094-check.mjs")], { cwd: tmp, encoding: "utf8", timeout: 20000 });
ok(run.status === 2 && /REFUSING: not the staging project/.test(run.stderr), "the check refuses a production connection (exit 2) before connecting", `${run.status} ${(run.stderr || "").slice(0, 200)}`);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n  company-follows-0094: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
