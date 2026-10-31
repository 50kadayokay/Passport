// a05: verify migration 0074 against the STAGING database inside ONE
// transaction that is always ROLLED BACK.
//   node scripts/profile-history-0074-check.mjs
//
// Builds real publish history through publish_profile_draft (0072), then:
// the approved role policy for history / preview / restore-into-draft, that a
// restore never touches the live profile and publishing it is the ordinary
// reviewed publish, compare-and-set, audit, company isolation, RETENTION
// (publish snapshots cannot be deleted or relabelled by anyone while the
// company exists; deleting the company still cascades; clients may insert only
// 'manual' snapshots), and the rollback file. Staging only. Prints no secrets.

import fs from "node:fs";
import pg from "pg";
import { runnerBody, scanMigrationSql } from "./_db-egress.mjs";

const url = (process.env.STAGING_DATABASE_URL || fs.readFileSync("supabase/staging/.connection", "utf8")).trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the allowlisted staging project."); process.exit(2); }
const env = Object.fromEntries(fs.readFileSync("supabase/staging/.isolation-env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const A = env.ISOLATION_COMPANY_A_ID, B = env.ISOLATION_COMPANY_B_ID;
const MIG = fs.readFileSync("supabase/migrations/0074_profile_revision_history.sql", "utf8");
const RB = fs.readFileSync("supabase/rollbacks/0074_profile_revision_history.rollback.sql", "utf8");

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, a) => (await c.query(s, a)).rows;
const one = async (s, a) => (await q(s, a))[0];
const j = async (s, a) => (await one(s, a)).j;
let sp = 0;
const tryq = async (sql, args) => { const n = `s${++sp}`; await c.query(`savepoint ${n}`); try { const r = await q(sql, args); await c.query(`release savepoint ${n}`); return { ok: true, r }; } catch (e) { await c.query(`rollback to savepoint ${n}`); return { ok: false, e: e.message, code: e.code }; } };
const asPostgres = async () => { await c.query(`reset role`); await c.query(`select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true)`); };
const asUser = async (uid) => { await c.query(`reset role`); await c.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [JSON.stringify({ sub: uid, role: "authenticated" }), uid]); await c.query(`set local role authenticated`); };
const asService = async () => { await c.query(`reset role`); await c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true), set_config('request.jwt.claim.sub', '', true)`); await c.query(`set local role service_role`); };
const exec = async (role, sig) => (await one(`select has_function_privilege($1, $2, 'EXECUTE') x`, [role, sig])).x;
const fnDigest = async (name) => (await one(`select md5(pg_get_functiondef(p.oid)) d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`, [name]))?.d || null;
const policyDigest = async () => (await one(`select md5(coalesce(with_check,'')) d from pg_policies where schemaname='public' and tablename='company_profile_versions' and policyname='profile_versions_insert'`)).d;
const hasKind = async () => (await one(`select count(*)::int n from information_schema.columns where table_schema='public' and table_name='company_profile_versions' and column_name='kind'`)).n === 1;

const uid = async (k) => (await one(`select id from auth.users where email = $1`, [env[`ISOLATION_${k}_EMAIL`]]))?.id;
const U = { ownerA: (await one(`select owner_id from public.companies where id = $1`, [A])).owner_id, ownerB: (await one(`select owner_id from public.companies where id = $1`, [B])).owner_id,
  coadmin: await uid("COADMIN"), editor: await uid("EDITOR"), publisher: await uid("PUBLISHER"), analyst: await uid("ANALYST"), viewer: await uid("STAFF"), investor: await uid("INVESTOR"), admin: await uid("ADMIN") };
if (Object.values(U).some((v) => !v)) { console.error("  fixture users missing"); process.exit(3); }

console.log("\n  STATIC");
ok(scanMigrationSql(MIG).length === 0 && scanMigrationSql(RB).length === 0, "0074 and its rollback contain no database egress");
let body = ""; try { body = runnerBody(MIG); ok(true, "the runner can govern 0074's transaction"); } catch (e) { ok(false, "runnerBody accepts 0074", e.message); }
const applied = await hasKind();
if (applied) { console.error("  0074 is already applied; this check is for the unapplied migration."); process.exit(4); }
const pre = { publish: await fnDigest("publish_profile_draft"), policy: await policyDigest() };
const liveBefore = await one(`select profile, updated_at from public.companies where id = $1`, [A]);

try {
  await c.query("begin");
  await asPostgres();
  await q(body);
  ok(true, "0074 applies to the staging schema without error");

  console.log("\n  PERMISSIONS");
  for (const sig of ["public.list_profile_versions(uuid, uuid, integer)", "public.get_profile_version(uuid, uuid, uuid)", "public.restore_profile_version_to_draft(uuid, uuid, uuid, integer)"]) {
    ok(!(await exec("anon", sig)) && !(await exec("authenticated", sig)) && (await exec("service_role", sig)), `${sig.split("(")[0].replace("public.", "")}: service role only`);
  }

  console.log("\n  REAL PUBLISH HISTORY (two publishes through 0072's workflow)");
  await asService();
  const pp0 = (await one(`select profile from public.companies where id = $1`, [A])).profile || {};
  const draftWith = (name) => JSON.stringify({ projects: pp0.projects ?? [], pp: { ...(pp0.pp || {}), COMPANY: { ...((pp0.pp || {}).COMPANY || {}), name } } });
  const fp = async () => (await j(`select public.load_profile_draft($1, $2) j`, [A, U.editor])).live_fingerprint;
  let r = await j(`select public.save_profile_draft($1, $2, $3::jsonb, null, $4) j`, [A, U.editor, draftWith("[0074] V-one"), await fp()]);
  r = await j(`select public.publish_profile_draft($1, $2, 1) j`, [A, U.ownerA]);
  ok(r.ok, "publish 1 (owner)");
  r = await j(`select public.save_profile_draft($1, $2, $3::jsonb, null, $4) j`, [A, U.editor, draftWith("[0074] V-two"), await fp()]);
  r = await j(`select public.publish_profile_draft($1, $2, 1) j`, [A, U.coadmin]);
  ok(r.ok, "publish 2 (company admin)");
  const kinds = await q(`select kind, note from public.company_profile_versions where company_id = $1 order by created_at`, [A]);
  ok(kinds.length === 2 && kinds.every((k) => k.kind === "publish"), "each publish snapshot is recorded as kind = 'publish'");

  console.log("\n  ROLES (approved): view + restore = owner, company admin, editor, platform admin");
  for (const [k, u] of [["owner", U.ownerA], ["company admin", U.coadmin], ["editor", U.editor], ["platform admin", U.admin]]) {
    const x = await j(`select public.list_profile_versions($1, $2) j`, [A, u]);
    ok(x.ok && x.versions.length === 2, `${k}: sees the 2 versions`);
  }
  for (const [k, u] of [["publisher", U.publisher], ["analyst", U.analyst], ["viewer", U.viewer], ["investor", U.investor], ["company B's owner", U.ownerB]]) {
    const x = await j(`select public.list_profile_versions($1, $2) j`, [A, u]);
    const v = await j(`select public.get_profile_version($1, $2, $3) j`, [A, u, (await one(`select id from public.company_profile_versions where company_id = $1 limit 1`, [A])).id]);
    const rr = await j(`select public.restore_profile_version_to_draft($1, $2, $3, null) j`, [A, u, (await one(`select id from public.company_profile_versions where company_id = $1 limit 1`, [A])).id]);
    ok(x.error === "forbidden" && !x.versions && v.error === "forbidden" && !v.fields && rr.error === "forbidden", `${k}: list, preview and restore all refused, nothing returned`);
  }
  const list = (await j(`select public.list_profile_versions($1, $2) j`, [A, U.editor])).versions;
  ok(Date.parse(list[0].created_at) >= Date.parse(list[1].created_at) && list[0].by_label && list[0].kind === "publish", `newest first, labelled by who replaced it (${list.map((v) => v.by_label).join(", ")})`);
  // now() is constant inside this one transaction, so both snapshots share a
  // timestamp: identify them by who published (publish 2 was the company admin).
  const newest = list.find((v) => /coadmin/.test(v.by_label));   // taken by publish 2 = the V-one state
  const older = list.find((v) => /owner/.test(v.by_label));      // taken by publish 1 = the original state
  const prev = await j(`select public.get_profile_version($1, $2, $3) j`, [A, U.editor, newest.id]);
  ok(prev.ok && prev.fields.pp.COMPANY.name === "[0074] V-one" && Object.keys(prev.fields).sort().join(",") === "pp,projects", "preview returns only the editor-owned fields of that version (V-one)");
  await asService();
  const leak = await j(`select public.get_profile_version($1, $2, $3) j`, [B, U.ownerB, newest.id]);
  ok(leak.ok === false && leak.error === "not_found", "company B's owner asking for A's version under B -> not_found (no cross-company read)");

  console.log("\n  RESTORE INTO A DRAFT (never the live profile)");
  const liveMid = await one(`select profile, updated_at from public.companies where id = $1`, [A]);
  r = await j(`select public.restore_profile_version_to_draft($1, $2, $3, null) j`, [A, U.editor, newest.id]);
  ok(r.ok && r.version === 1, "editor restores V-one into a new draft (version 1)");
  const liveAfterRestore = await one(`select profile, updated_at from public.companies where id = $1`, [A]);
  ok(JSON.stringify(liveAfterRestore.profile) === JSON.stringify(liveMid.profile) && String(liveAfterRestore.updated_at) === String(liveMid.updated_at), "the live profile is untouched (still V-two, same updated_at)");
  const d = await one(`select draft, base_fingerprint from public.company_profile_drafts where company_id = $1`, [A]);
  ok(d.draft.pp.COMPANY.name === "[0074] V-one" && d.base_fingerprint === (await j(`select public.load_profile_draft($1, $2) j`, [A, U.editor])).live_fingerprint, "the draft holds V-one, based on the CURRENT live fields (so publish still detects later live changes)");
  ok(!!(await one(`select 1 x from public.activity_log where company_id = $1 and action = 'profile_version_restored_to_draft' and actor_id = $2`, [A, U.editor])), "audited (who restored which version)");
  r = await j(`select public.restore_profile_version_to_draft($1, $2, $3, null) j`, [A, U.coadmin, older.id]);
  ok(r.ok === false && r.error === "stale_draft", "a second restore that does not know the current draft -> stale_draft (no silent overwrite)");
  r = await j(`select public.restore_profile_version_to_draft($1, $2, $3, 1) j`, [A, U.coadmin, older.id]);
  ok(r.ok && r.version === 2, "with the draft version it saw -> version 2 (older version restored)");
  r = await j(`select public.restore_profile_version_to_draft($1, $2, $3, 2) j`, [A, U.editor, newest.id]);
  ok(r.ok && r.version === 3, "editor restores V-one again (version 3)");
  r = await j(`select public.publish_profile_draft($1, $2, 3) j`, [A, U.editor]);
  ok(r.ok === false && r.error === "forbidden", "the editor cannot publish the restored draft");
  r = await j(`select public.publish_profile_draft($1, $2, 3) j`, [A, U.ownerA]);
  ok(r.ok, "the owner publishes it -- the ordinary reviewed publish");
  ok((await one(`select profile->'pp'->'COMPANY'->>'name' n from public.companies where id = $1`, [A])).n === "[0074] V-one", "live is now V-one");
  ok((await one(`select count(*)::int n from public.company_profile_versions where company_id = $1 and kind = 'publish'`, [A])).n === 3, "and V-two was itself kept as a publish snapshot (3 now)");

  console.log("\n  RETENTION: publish history cannot be removed");
  const pubSnap = (await one(`select id from public.company_profile_versions where company_id = $1 and kind = 'publish' limit 1`, [A])).id;
  await asPostgres();
  let t = await tryq(`delete from public.company_profile_versions where id = $1`, [pubSnap]);
  ok(!t.ok && t.code === "42501", "even the table owner cannot delete a publish snapshot while the company exists");
  t = await tryq(`update public.company_profile_versions set kind = 'manual' where id = $1`, [pubSnap]);
  ok(!t.ok && t.code === "42501", "nor relabel it 'manual' to make it prunable");
  await asUser(U.ownerA);
  t = await tryq(`delete from public.company_profile_versions where id = $1`, [pubSnap]);
  ok(!t.ok && t.code === "42501", "the owner (0013 delete policy) cannot delete it either");
  t = await tryq(`insert into public.company_profile_versions (company_id, slug, profile, note, created_by, kind) values ($1, 'x', '{}', 'forged', $2, 'publish')`, [A, U.ownerA]);
  ok(!t.ok, "the owner cannot INSERT a fake 'publish' snapshot");
  t = await tryq(`insert into public.company_profile_versions (company_id, slug, profile, note, created_by) values ($1, 'x', '{}', 'owner manual', $2) returning id`, [A, U.ownerA]);
  ok(t.ok, "a 'manual' snapshot (admin tools' kind) still inserts as before");
  const manualId = t.ok ? t.r[0].id : null;
  t = await tryq(`delete from public.company_profile_versions where id = $1`, [manualId]);
  ok(t.ok, "and a 'manual' snapshot can still be pruned");
  await asPostgres();
  const zc = (await one(`insert into public.companies (slug, name, owner_id, status) values ('zz-0074', 'Z', $1, 'draft') returning id`, [U.ownerB])).id;
  await q(`insert into public.company_profile_versions (company_id, slug, profile, note, kind) values ($1, 'zz-0074', '{}', 'before profile publish', 'publish')`, [zc]);
  t = await tryq(`delete from public.companies where id = $1`, [zc]);
  ok(t.ok && (await one(`select count(*)::int n from public.company_profile_versions where company_id = $1`, [zc])).n === 0, "deleting a whole company still cascades its history (retention does not block company deletion)");

  console.log("\n  ROLLBACK FILE");
  await q(`savepoint rb`);
  await q(runnerBody(RB));
  ok((await fnDigest("publish_profile_draft")) === pre.publish, "rollback restores 0072's publish_profile_draft exactly");
  ok((await policyDigest()) === pre.policy, "rollback restores 0013's insert policy exactly");
  ok(!(await hasKind()) && (await fnDigest("list_profile_versions")) === null, "rollback removes the kind column and the history functions (snapshot rows kept)");
  await q(`rollback to savepoint rb`);
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  await c.query("rollback").catch(() => {});
}

console.log("\n  AFTER ROLLBACK (fresh queries)");
await c.query("reset role").catch(() => {});
ok(!(await hasKind()) && (await fnDigest("publish_profile_draft")) === pre.publish && (await policyDigest()) === pre.policy, "nothing persisted: no kind column, publish function and insert policy as before");
const liveAfter = await one(`select profile, updated_at from public.companies where id = $1`, [A]);
ok(JSON.stringify(liveAfter.profile) === JSON.stringify(liveBefore.profile) && String(liveAfter.updated_at) === String(liveBefore.updated_at), "company A's live profile identical to before");
ok((await one(`select count(*)::int n from public.company_profile_versions where company_id = $1`, [A])).n === 0 && (await one(`select count(*)::int n from public.company_profile_drafts`)).n === 0, "no test snapshots or drafts persisted");
await c.end();
console.log(`\n  profile-history-0074 (staging, rolled back): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
