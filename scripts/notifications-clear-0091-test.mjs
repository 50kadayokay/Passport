// 0091 (Clear all: no platform-admin bypass) OFFLINE: the migration, its
// rollback, the manifest and the staging check, read from source. The live
// behaviour is scripts/notifications-clear-0091-check.mjs (staging, rolled back;
// S4 runs it). The portal side is scripts/notifications-clear-ui-test.mjs.
//   node scripts/notifications-clear-0091-test.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PENDING, PREREQUISITES } from "./_migration-manifest.mjs";
import { PRODUCTION_REFS } from "./_target-guard.mjs";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const read = (f) => fs.readFileSync(f, "utf8");

const F = "0091_notification_clear_no_platform_admin";
const mig = read(`supabase/migrations/${F}.sql`);
const rb = read(`supabase/rollbacks/${F}.rollback.sql`);
const m90 = read("supabase/migrations/0090_notification_clear_roles.sql");
const body = (s) => s.match(/create or replace function public\.mark_notifications_cleared[\s\S]*?end \$\$;/)[0];
const code = (s) => body(s).replace(/--.*$/gm, "");
const grants = (s) => s.match(/revoke execute[\s\S]*?to authenticated;/)[0];
const head = (s) => body(s).split("\nbegin\n")[0], tail = (s) => body(s).split(/end if;\n/)[1];

console.log("\n  THE CHECK");
ok(!/has_company_role|profile_actor_role|is_admin|platform_admin|profiles/.test(code(mig)), "0091 consults no platform-admin path (not has_company_role, profile_actor_role, is_admin, profiles)");
ok(/c\.id = p_company and c\.owner_id = auth\.uid\(\)/.test(code(mig)), "admits the company's owner_id");
ok(/m\.company_id = p_company and m\.user_id = auth\.uid\(\)\s+and m\.status = 'active' and m\.role in \('owner','admin'\)/.test(code(mig)), "admits the caller's own ACTIVE owner/admin membership of p_company, nothing wider");
ok((code(mig).match(/exists \(/g) || []).length === 2 && /if not \(exists[\s\S]*\bor exists[\s\S]*\)\) then/.test(code(mig)), "exactly those two, OR'd, inside one negated condition");
ok(/using errcode = '42501'/.test(body(mig)) && /'not authorized to clear this company''s notifications'/.test(body(mig)), "keeps the 42501 refusal and its message");

console.log("\n  EVERYTHING ELSE IS 0090's");
ok(head(mig) === head(m90), "signature, returns, security definer, search_path identical");
ok(head(mig).length > 100 && tail(mig).length > 100, "(the comparison covers the header and the write)");
ok(tail(mig) === tail(m90), "the write after the check is identical (cleared_at and seen_at)");
ok(grants(mig) === grants(m90) && /from public, anon;/.test(grants(mig)), "grants identical (authenticated only)");
ok(!/company_notifications\(|mark_notifications_seen|alter table|drop |create table|policy/i.test(mig.replace(/^--.*$/gm, "")), "touches nothing else: list, seen, tables, policies");
ok(/^begin;$/m.test(mig) && /^commit;$/m.test(mig), "one transaction");

console.log("\n  ROLLBACK");
ok(body(rb) === body(m90) && grants(rb) === grants(m90), "restores 0090's function and grants verbatim");
ok(/^begin;$/m.test(rb) && /^commit;$/m.test(rb) && !/drop |alter table/i.test(rb.replace(/^--.*$/gm, "")), "one transaction, replaces the function only");

console.log("\n  MANIFEST");
ok(`${F}.sql` in PENDING && /0090/.test(PENDING[`${F}.sql`]), "0091 is PENDING, and says it follows 0090");
ok(JSON.stringify(PREREQUISITES[`${F}.sql`]) === JSON.stringify(["0090_notification_clear_roles.sql"]), "PREREQUISITES: 0091 needs 0090");
ok(/ROLLBACK: supabase\/rollbacks\/0091_notification_clear_no_platform_admin\.rollback\.sql/.test(mig) && /notifications-clear-0091-check\.mjs/.test(mig), "the header names its rollback and its staging check");

console.log("\n  THE STAGING CHECK");
const chk = read("scripts/notifications-clear-0091-check.mjs");
ok(/await c\.query\("begin"\)/.test(chk) && /finally \{\s*await c\.query\("rollback"\);/.test(chk) && !/\bcommit\b/i.test(chk.replace(/^\/\/.*$/gm, "").replace(/strip = [^\n]*/, "")), "one transaction, always rolled back, never committed");
for (const [label, re] of [
  ["platform admin, no membership: baseline allowed under 0090", /baseline: under 0090 a platform admin with no membership CAN clear/],
  ["platform admin, no membership: refused", /refused\("ADMIN", "platform admin with no membership"\)/],
  ["platform admin, editor membership: refused", /refused\("ADMIN", "platform admin with an editor membership"\)/],
  ["platform admin, suspended admin membership: refused", /refused\("ADMIN", "platform admin with a suspended admin membership"\)/],
  ["platform admin, active admin membership: allowed", /platform admin with an active admin membership of their own: clears/],
  ["owner and admin: allowed", /owner \(owner_id\): clears[\s\S]*"admin: clears"/],
  ["editor, analyst, viewer, other company, investor, anon: refused", /\["STAFF", "viewer"\], \["ANALYST", "analyst"\], \["EDITOR", "editor"\], \["COMPANY_B", [^\]]+\], \["INVESTOR", [^\]]+\], \["anon", "anon"\]\]\) await refused/],
  ["the rollback restores 0090 exactly", /\(await def\(\)\) === before, "the rollback restores 0090's definition exactly"/],
]) ok(re.test(chk), `covers: ${label}`);

// Run it where only a production connection string exists: it must refuse before connecting.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nc0091-"));
fs.mkdirSync(path.join(tmp, "supabase/staging"), { recursive: true });
fs.writeFileSync(path.join(tmp, "supabase/staging/.connection"), `postgresql://nobody@db.${PRODUCTION_REFS[0]}.supabase.invalid:5432/postgres\n`);
const run = spawnSync(process.execPath, [path.resolve("scripts/notifications-clear-0091-check.mjs")], { cwd: tmp, encoding: "utf8", timeout: 20000 });
ok(run.status === 2 && /REFUSING: not the staging project/.test(run.stderr), "the check refuses a production connection (exit 2) before connecting", `${run.status} ${run.stderr.slice(0, 200)}`);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n  notifications-clear-0091: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
