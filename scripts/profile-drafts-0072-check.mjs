// a04 / d28 / d29: verify migration 0072 against the STAGING database inside
// ONE transaction that is always ROLLED BACK -- schema, permissions, the
// approved role policy, drafts kept off the public profile, concurrency,
// atomic publish (including a forced mid-publish failure), unrelated live
// fields preserved, go-live narrowed, and the rollback file itself.
//   node scripts/profile-drafts-0072-check.mjs
//
// BEGIN; apply 0072 exactly as the guarded runner would (runnerBody strips the
// file's own begin/commit); test; apply the ROLLBACK in a savepoint and check
// it restores 0035's company_go_live; ROLLBACK; then confirm in fresh queries
// that nothing persisted. Staging only. Prints no secrets.

import fs from "node:fs";
import pg from "pg";
import { runnerBody, scanMigrationSql } from "./_db-egress.mjs";

const ALLOWED_REFS = ["jmljfovtfxcdhjmtlnva"], PRODUCTION_REFS = ["rvptronniomlqumjhyrr"];
const url = (process.env.STAGING_DATABASE_URL || fs.readFileSync("supabase/staging/.connection", "utf8")).trim();
if (PRODUCTION_REFS.some((r) => url.includes(r)) || !ALLOWED_REFS.some((r) => url.includes(r))) { console.error("  REFUSING: not the allowlisted staging project."); process.exit(2); }
const env = Object.fromEntries(fs.readFileSync("supabase/staging/.isolation-env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const A = env.ISOLATION_COMPANY_A_ID, B = env.ISOLATION_COMPANY_B_ID;

const MIG = fs.readFileSync("supabase/migrations/0072_profile_drafts.sql", "utf8");
const RB = fs.readFileSync("supabase/rollbacks/0072_profile_drafts.rollback.sql", "utf8");

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, a) => (await c.query(s, a)).rows;
const one = async (s, a) => (await q(s, a))[0];
const defHash = async (fn) => (await q(`select md5(pg_get_functiondef(p.oid)) h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1 order by 1`, [fn])).map((r) => r.h).join(",");
const exec = async (role, fnSig) => (await one(`select has_function_privilege($1, $2, 'EXECUTE') x`, [role, fnSig])).x;
const tablePriv = async (role, table, priv) => (await one(`select has_table_privilege($1, $2, $3) x`, [role, table, priv])).x;
const asService = async () => { await c.query(`reset role`); await c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true), set_config('request.jwt.claim.sub', '', true)`); await c.query(`set local role service_role`); };
const asUser = async (uid) => {
  await c.query(`reset role`);
  await c.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [JSON.stringify({ sub: uid, role: "authenticated" }), uid]);
  await c.query(`set local role authenticated`);
};
const asAnon = async () => { await c.query(`reset role`); await c.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('request.jwt.claim.sub', '', true)`); await c.query(`set local role anon`); };
let sp = 0;
const tryq = async (sql, args) => { const n = `s${++sp}`; await c.query(`savepoint ${n}`); try { const r = await q(sql, args); await c.query(`release savepoint ${n}`); return { ok: true, r }; } catch (e) { await c.query(`rollback to savepoint ${n}`); return { ok: false, e: e.message }; } };
const fn = async (sql, args) => (await one(sql, args)).j;

const uid = async (k) => (await one(`select id from auth.users where email = $1`, [env[`ISOLATION_${k}_EMAIL`]]))?.id;
const ownerA = (await one(`select owner_id from public.companies where id = $1`, [A])).owner_id;
const ownerB = (await one(`select owner_id from public.companies where id = $1`, [B])).owner_id;
const U = { ownerA, ownerB, coadmin: await uid("COADMIN"), editor: await uid("EDITOR"), publisher: await uid("PUBLISHER"), analyst: await uid("ANALYST"), viewer: await uid("STAFF"), investor: await uid("INVESTOR"), admin: await uid("ADMIN") };
const missing = Object.entries(U).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) { console.error(`  fixture users missing: ${missing.join(", ")} (run scripts/seed-isolation-fixtures.mjs)`); process.exit(3); }

console.log("\n  STATIC");
ok(scanMigrationSql(MIG).length === 0, "0072 contains no database egress (static scan)");
let body = "";
try { body = runnerBody(MIG); ok(!/^\s*(begin|commit)\s*;/im.test(body), "the runner can govern 0072's transaction (its own begin/commit stripped)"); } catch (e) { ok(false, "runnerBody accepts 0072", e.message); }
const code = MIG.replace(/--[^\n]*/g, "");
ok(!/\bdrop\s+(table|policy|column)\b|\btruncate\b|alter\s+table\s+public\.companies/i.test(code), "0072 drops nothing and does not alter companies");
// APPLIED MODE: once 0072 is on staging, the same checks run against the
// persistent schema (inside a rolled-back transaction, so no test data
// persists), and the rollback is compared with the PRE-0072 digest from a
// snapshot (node scripts/profile-drafts-0072-check.mjs --pre <profile-drafts-snapshot.json>).
const APPLIED = (await one(`select count(*)::int n from pg_tables where schemaname='public' and tablename='company_profile_drafts'`)).n > 0;
const preArg = process.argv.indexOf("--pre");
const preSnap = preArg > 0 ? JSON.parse(fs.readFileSync(process.argv[preArg + 1], "utf8")) : null;
if (APPLIED && !preSnap) { console.error("  0072 is applied: pass --pre <pre-0072 profile-drafts snapshot> so the rollback can be compared"); process.exit(4); }
const preGoLive = APPLIED ? preSnap.functions.find((f) => f.proname === "company_go_live").d : await defHash("company_go_live");
const postGoLive = APPLIED ? await defHash("company_go_live") : null;
const liveBefore = (await one(`select profile, updated_at from public.companies where id = $1`, [A]));

console.log(APPLIED ? "\n  0072 IS APPLIED: checks run on the persistent schema, inside a transaction that is rolled back" : "\n  0072 APPLIED INSIDE A TRANSACTION THAT IS ROLLED BACK");
try {
  await c.query("begin");
  if (!APPLIED) { await c.query(body); ok(true, "0072 applies to the staging schema without error"); }

  console.log("\n  A. PERMISSIONS: drafts are server-only, never public");
  for (const role of ["anon", "authenticated"]) {
    ok(!(await tablePriv(role, "public.company_profile_drafts", "SELECT")) && !(await tablePriv(role, "public.company_profile_drafts", "INSERT")) && !(await tablePriv(role, "public.company_profile_drafts", "UPDATE")), `${role}: no SELECT / INSERT / UPDATE on company_profile_drafts`);
    for (const sig of ["public.profile_actor_role(uuid, uuid)", "public.load_profile_draft(uuid, uuid)", "public.save_profile_draft(uuid, uuid, jsonb, integer, text)", "public.publish_profile_draft(uuid, uuid, integer)", "public.discard_profile_draft(uuid, uuid, integer)"]) {
      if (await exec(role, sig)) ok(false, `${role} cannot EXECUTE ${sig}`);
    }
    ok(true, `${role}: cannot EXECUTE any draft function`);
  }
  ok(await exec("service_role", "public.publish_profile_draft(uuid, uuid, integer)"), "service_role can EXECUTE them (api/profile-draft.js)");
  ok((await one(`select relrowsecurity r from pg_class where oid = 'public.company_profile_drafts'::regclass`)).r, "RLS enabled on company_profile_drafts");
  await asUser(ownerA);
  let t = await tryq(`select * from public.company_profile_drafts`);
  ok(!t.ok && /permission denied/.test(t.e), "owner of A, directly: permission denied on the drafts table");
  t = await tryq(`select public.save_profile_draft($1, $2, '{"pp":{},"projects":[]}'::jsonb, null, 'x')`, [A, ownerA]);
  ok(!t.ok && /permission denied/.test(t.e), "owner of A, directly: permission denied on save_profile_draft (the route is the only way in)");
  await asAnon();
  t = await tryq(`select profile from public.companies where id = $1`, [A]);
  ok(t.ok, "anon still reads companies.profile (unchanged) -- which is why drafts cannot live there");

  console.log("\n  B. ROLES (approved policy)");
  await asService();
  const role = async (u, co = A) => (await one(`select public.profile_actor_role($1, $2) r`, [co, u])).r;
  ok(await role(U.ownerA) === "owner" && await role(U.coadmin) === "admin" && await role(U.editor) === "editor" && await role(U.publisher) === "publisher" && await role(U.analyst) === "analyst" && await role(U.viewer) === "viewer" && await role(U.admin) === "platform_admin" && await role(U.investor) === null && await role(U.ownerB) === null,
    "profile_actor_role: owner, admin, editor, publisher, analyst, viewer, platform_admin; investor and B's owner: none");
  const live = await fn(`select public.load_profile_draft($1, $2) j`, [A, U.editor]);
  ok(live.ok && live.role === "editor" && live.can_publish === false && live.draft === null && typeof live.live_fingerprint === "string", "editor loads: live profile, no draft, cannot publish");
  for (const [k, u] of [["publisher", U.publisher], ["analyst", U.analyst], ["viewer", U.viewer], ["investor", U.investor], ["B's owner", U.ownerB]]) {
    const r = await fn(`select public.load_profile_draft($1, $2) j`, [A, u]);
    ok(r.ok === false && r.error === "forbidden" && !r.live, `${k}: load refused (forbidden), no profile returned`);
  }
  ok((await fn(`select public.load_profile_draft($1, $2) j`, [A, U.admin])).can_publish === true, "platform admin loads and can publish");

  const fp = live.live_fingerprint;
  const draftOf = (name) => JSON.stringify({ projects: live.live.projects ?? [], pp: { ...(live.live.pp || {}), COMPANY: { ...((live.live.pp || {}).COMPANY || {}), name: name } }, timeline: ["must-not-be-stored"] });
  for (const [k, u] of [["publisher", U.publisher], ["analyst", U.analyst], ["viewer", U.viewer], ["investor", U.investor], ["B's owner", U.ownerB]]) {
    const r = await fn(`select public.save_profile_draft($1, $2, $3::jsonb, null, $4) j`, [A, u, draftOf("X"), fp]);
    ok(r.ok === false && r.error === "forbidden", `${k}: save refused (forbidden)`);
  }
  ok((await one(`select count(*)::int n from public.company_profile_drafts`)).n === 0, "  ...and no draft row was written");

  console.log("\n  C. DRAFT: saved apart from the live profile");
  let r = await fn(`select public.save_profile_draft($1, $2, $3::jsonb, null, $4) j`, [A, U.editor, draftOf("[0072-check] Draft Name"), fp]);
  ok(r.ok && r.version === 1 && r.created, "editor saves the first draft (version 1)");
  const stored = await one(`select draft, base_fingerprint, created_by from public.company_profile_drafts where company_id = $1`, [A]);
  ok(Object.keys(stored.draft).sort().join(",") === "pp,projects" && stored.base_fingerprint === fp && stored.created_by === U.editor, "only {projects, pp} are stored (an extra key is dropped), with the base fingerprint and author");
  const liveNow = await one(`select profile, updated_at from public.companies where id = $1`, [A]);
  ok(JSON.stringify(liveNow.profile) === JSON.stringify(liveBefore.profile) && String(liveNow.updated_at) === String(liveBefore.updated_at), "the LIVE profile is untouched by a draft save (content and updated_at)");
  await asAnon();
  ok(!JSON.stringify((await one(`select profile from public.companies where id = $1`, [A])).profile).includes("[0072-check] Draft Name"), "anon (the investor app) does not see the draft");
  await asService();
  r = await fn(`select public.save_profile_draft($1, $2, $3::jsonb, 1, null) j`, [A, U.coadmin, draftOf("[0072-check] Draft v2")]);
  ok(r.ok && r.version === 2, "company admin saves on top of version 1 -> version 2");
  r = await fn(`select public.save_profile_draft($1, $2, $3::jsonb, 1, null) j`, [A, U.editor, draftOf("[0072-check] stale tab")]);
  ok(r.ok === false && r.error === "stale_draft" && r.version === 2 && r.updated_by === U.coadmin, "a stale tab (expected version 1) -> stale_draft, naming who saved and the current version");
  ok((await one(`select draft->'pp'->'COMPANY'->>'name' n from public.company_profile_drafts where company_id = $1`, [A])).n === "[0072-check] Draft v2", "  ...and did not overwrite the newer draft");
  r = await fn(`select public.save_profile_draft($1, $2, $3::jsonb, null, $4) j`, [A, U.ownerA, draftOf("[0072-check] second first"), fp]);
  ok(r.ok === false && r.error === "stale_draft", "a second 'first save' while a draft exists -> stale_draft (no silent overwrite)");
  r = await fn(`select public.save_profile_draft($1, $2, '{"pp":"nope","projects":[]}'::jsonb, 2, null) j`, [A, U.editor]);
  ok(r.ok === false && r.error === "invalid", "a malformed draft -> invalid");
  const reload = await fn(`select public.load_profile_draft($1, $2) j`, [A, U.editor]);
  ok(reload.draft && reload.draft.version === 2 && reload.draft.stale === false && reload.draft.draft.pp.COMPANY.name === "[0072-check] Draft v2", "draft RECOVERY: reloading returns the saved draft (version 2, not stale)");

  console.log("\n  D. PUBLISH: role, version, unrelated fields, atomicity");
  for (const [k, u] of [["editor", U.editor], ["publisher", U.publisher], ["viewer", U.viewer], ["B's owner", U.ownerB]]) {
    r = await fn(`select public.publish_profile_draft($1, $2, 2) j`, [A, u]);
    ok(r.ok === false && r.error === "forbidden", `${k}: publish refused (forbidden)`);
  }
  r = await fn(`select public.publish_profile_draft($1, $2, 1) j`, [A, U.ownerA]);
  ok(r.ok === false && r.error === "stale_draft", "owner publishing a stale version (1) -> stale_draft");
  // A release is published meanwhile: the timeline service writes the live profile.
  await q(`select public.upsert_timeline_entry($1, $2::jsonb)`, [A, JSON.stringify({ key: "pub:0072-check", id: "0072-check", title: "[0072-check] timeline entry written meanwhile", date: "2026-10-31", source: "publication" })]);
  const snapsBefore = (await one(`select count(*)::int n from public.company_profile_versions where company_id = $1`, [A])).n;
  const actsBefore = (await one(`select count(*)::int n from public.activity_log where company_id = $1`, [A])).n;

  // Forced failure mid-publish: the audit insert raises AFTER the snapshot and the live update.
  // (Creating a trigger needs the table owner, so the harness steps out of service_role for that.)
  await q(`reset role`);
  await q(`create or replace function pg_temp.fail_audit() returns trigger language plpgsql as $$ begin raise exception 'forced audit failure'; end $$`);
  await q(`create trigger zz_fail_audit before insert on public.activity_log for each row execute function pg_temp.fail_audit()`);
  await asService();
  t = await tryq(`select public.publish_profile_draft($1, $2, 2) j`, [A, U.ownerA]);
  await q(`reset role`);
  await q(`drop trigger zz_fail_audit on public.activity_log`);
  await asService();
  const afterFail = await one(`select profile from public.companies where id = $1`, [A]);
  ok(!t.ok && /forced audit failure/.test(t.e), "a failure inside publish (audit insert) aborts it");
  ok(afterFail.profile.pp.COMPANY?.name !== "[0072-check] Draft v2"
     && (await one(`select count(*)::int n from public.company_profile_versions where company_id = $1`, [A])).n === snapsBefore
     && (await one(`select version from public.company_profile_drafts where company_id = $1`, [A]))?.version === 2,
     "  ...ALL-OR-NOTHING: live profile unchanged, no snapshot row, draft still there (version 2)");

  r = await fn(`select public.publish_profile_draft($1, $2, 2) j`, [A, U.coadmin]);
  ok(r.ok && r.published_version === 2, "company admin publishes version 2", JSON.stringify(r));
  const pub = (await one(`select profile from public.companies where id = $1`, [A])).profile;
  ok(pub.pp.COMPANY.name === "[0072-check] Draft v2", "live pp now has the draft's change");
  ok((pub.timeline || []).some((e) => e && e.key === "pub:0072-check"), "the timeline entry written by another service meanwhile is PRESERVED");
  ok(Object.keys(liveBefore.profile || {}).every((k) => k === "pp" || k === "projects" || k === "timeline" || JSON.stringify(pub[k]) === JSON.stringify(liveBefore.profile[k])), "every other live key is unchanged");
  const snap = await one(`select profile, note, created_by from public.company_profile_versions where company_id = $1 order by created_at desc limit 1`, [A]);
  ok(snap && snap.note === "before profile publish" && snap.created_by === U.coadmin && snap.profile.pp?.COMPANY?.name !== "[0072-check] Draft v2", "a snapshot of the PRE-publish live profile was written (restorable)");
  // (now() is constant inside one transaction, so rows are found by action, not by recency.)
  const act = await one(`select action, actor_id, actor_kind, new_value from public.activity_log where company_id = $1 and action = 'profile_published'`, [A]);
  ok((await one(`select count(*)::int n from public.activity_log where company_id = $1`, [A])).n === actsBefore + 1 && act.action === "profile_published" && act.actor_id === U.coadmin && act.actor_kind === "company" && act.new_value.draft_version === 2, "an audit row records who published which draft version");
  ok((await one(`select count(*)::int n from public.company_profile_drafts where company_id = $1`, [A])).n === 0, "the draft is completed (removed)");
  r = await fn(`select public.save_profile_draft($1, $2, $3::jsonb, 2, null) j`, [A, U.editor, draftOf("[0072-check] after publish")]);
  ok(r.ok === false && r.error === "draft_missing", "an editor still on the published draft -> draft_missing (reload), not a silent new draft");
  r = await fn(`select public.publish_profile_draft($1, $2, 2) j`, [A, U.ownerA]);
  ok(r.ok === false && r.error === "no_draft", "publishing again -> no_draft");

  console.log("\n  E. CONFLICT: live editor fields changed since the draft began");
  const fp2 = (await fn(`select public.load_profile_draft($1, $2) j`, [A, U.editor])).live_fingerprint;
  r = await fn(`select public.save_profile_draft($1, $2, $3::jsonb, null, $4) j`, [A, U.editor, draftOf("[0072-check] draft 2"), fp2]);
  ok(r.ok, "a new draft (version 1)");
  r = await fn(`select public.save_profile_draft($1, $2, $3::jsonb, null, 'old-fingerprint') j`, [B, U.ownerB, JSON.stringify({ projects: [], pp: {} }), ]);
  ok(r.ok === false && r.error === "stale_base", "first save from a stale page load (fingerprint no longer live) -> stale_base");
  // A Company Memory rebuild / admin edit changes live pp.
  await q(`update public.companies set profile = jsonb_set(profile, '{pp,COMPANY,slogan}', '"[0072-check] changed by a rebuild"') where id = $1`, [A]);
  ok((await fn(`select public.load_profile_draft($1, $2) j`, [A, U.editor])).draft.stale === true, "load flags the draft as stale");
  const beforeConflict = (await one(`select profile from public.companies where id = $1`, [A])).profile;
  r = await fn(`select public.publish_profile_draft($1, $2, 1) j`, [A, U.ownerA]);
  ok(r.ok === false && r.error === "live_changed", "publish -> live_changed (would overwrite the rebuild)");
  ok(JSON.stringify((await one(`select profile from public.companies where id = $1`, [A])).profile) === JSON.stringify(beforeConflict) && (await one(`select count(*)::int n from public.company_profile_drafts where company_id = $1`, [A])).n === 1, "  ...nothing changed; the draft is kept for the user to review");

  console.log("\n  F. DISCARD");
  for (const [k, u] of [["publisher", U.publisher], ["viewer", U.viewer]]) {
    r = await fn(`select public.discard_profile_draft($1, $2, 1) j`, [A, u]);
    ok(r.ok === false && r.error === "forbidden", `${k}: discard refused`);
  }
  r = await fn(`select public.discard_profile_draft($1, $2, 9) j`, [A, U.editor]);
  ok(r.ok === false && r.error === "stale_draft", "discard with a stale version -> stale_draft");
  r = await fn(`select public.discard_profile_draft($1, $2, 1) j`, [A, U.editor]);
  ok(r.ok && (await one(`select count(*)::int n from public.company_profile_drafts where company_id = $1`, [A])).n === 0, "editor discards: draft gone");
  ok(!!(await one(`select 1 x from public.activity_log where company_id = $1 and action = 'profile_draft_discarded' and actor_id = $2`, [A, U.editor])), "  ...audited (who discarded)");
  r = await fn(`select public.discard_profile_draft($1, $2, 1) j`, [A, U.editor]);
  ok(r.ok && r.already, "discard again -> idempotent");

  console.log("\n  G. GO-LIVE (d29): owner / company admin / platform admin only");
  // Make A an unpublished company that meets every other gate, inside the transaction.
  await q(`select set_config('app.provisioning', 'on', true)`);
  await q(`update public.companies set status = 'draft' where id = $1`, [A]);
  const V = "0072-check";
  await q(`insert into public.company_agreement_acceptances (company_id, agreement_version, user_id) values ($1, $2, $3) on conflict do nothing`, [A, V, U.ownerA]);
  for (const [k, u] of [["viewer", U.viewer], ["analyst", U.analyst], ["editor", U.editor], ["publisher", U.publisher], ["B's owner", U.ownerB], ["investor", U.investor]]) {
    await asUser(u);
    r = (await one(`select public.company_go_live($1, $2) j`, [A, V])).j;
    ok(r.ok === false && r.error === "forbidden", `${k}: company_go_live refused (forbidden)`);
  }
  await asService();
  ok((await one(`select status from public.companies where id = $1`, [A])).status === "draft", "  ...A is still unpublished");
  await asUser(U.coadmin);
  t = await tryq(`select public.company_go_live($1, $2) j`, [A, V]);
  ok(t.ok && (t.r[0].j.ok === true || ["subscription_required", "profile_incomplete"].includes(t.r[0].j.error)), `company admin: admitted past the role check (${t.ok ? JSON.stringify(t.r[0].j) : t.e})`);
  await asService();

  console.log("\n  ROLLBACK FILE");
  await q(`reset role`);
  await q(`savepoint rb`);
  await q(runnerBody(RB));
  ok((await defHash("company_go_live")) === preGoLive, "rollback restores 0035's company_go_live exactly (definition digest)");
  ok((await one(`select count(*)::int n from pg_tables where schemaname='public' and tablename='company_profile_drafts'`)).n === 0 && (await one(`select count(*)::int n from pg_proc where proname in ('profile_actor_role','load_profile_draft','save_profile_draft','publish_profile_draft','discard_profile_draft','profile_editor_fingerprint')`)).n === 0, "rollback removes the table and all six functions");
  await q(`rollback to savepoint rb`);
} catch (e) {
  ok(false, "unexpected error", e.message);
} finally {
  await c.query("rollback").catch(() => {});
}

console.log("\n  AFTER ROLLBACK (fresh queries)");
await c.query("reset role").catch(() => {});
if (APPLIED) {
  ok((await one(`select count(*)::int n from pg_tables where schemaname='public' and tablename='company_profile_drafts'`)).n === 1 && (await one(`select count(*)::int n from public.company_profile_drafts`)).n === 0, "the applied drafts table is still there, with no test drafts left");
  ok((await defHash("company_go_live")) === postGoLive, "company_go_live still the 0072 definition (the rollback rehearsal was rolled back)");
} else {
  ok((await one(`select count(*)::int n from pg_tables where schemaname='public' and tablename='company_profile_drafts'`)).n === 0, "no company_profile_drafts table persisted");
  ok((await defHash("company_go_live")) === preGoLive, "company_go_live unchanged on staging");
}
const liveAfter = await one(`select profile, updated_at, status from public.companies where id = $1`, [A]);
ok(JSON.stringify(liveAfter.profile) === JSON.stringify(liveBefore.profile) && String(liveAfter.updated_at) === String(liveBefore.updated_at), "company A's live profile identical to before (content and updated_at)");
ok((await one(`select count(*)::int n from public.activity_log where action in ('profile_published', 'profile_draft_discarded')`)).n === 0, "activity_log: no profile_published / profile_draft_discarded rows persisted");
await c.end();
console.log(`\n  profile-drafts-0072 (staging, rolled back): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
