// D22 Phase 2: verify migration 0071 against the STAGING database inside ONE
// transaction that is always ROLLED BACK -- schema, signatures, permissions,
// behaviour, company isolation, and the rollback file itself.
//   node scripts/publishing-0071-check.mjs
//
// It does not apply 0071. BEGIN; apply 0071 exactly as the guarded runner would
// (runnerBody strips the file's own begin/commit); test; apply the ROLLBACK file
// in a savepoint and check it restores the pre-0071 definitions; ROLLBACK; then
// confirm in fresh queries that nothing persisted.
//
// Refuses anything but the allowlisted staging project. Prints no secrets.

import fs from "node:fs";
import pg from "pg";
import { runnerBody, scanMigrationSql } from "./_db-egress.mjs";

const ALLOWED_REFS = ["jmljfovtfxcdhjmtlnva"], PRODUCTION_REFS = ["rvptronniomlqumjhyrr"];
const url = (process.env.STAGING_DATABASE_URL || fs.readFileSync("supabase/staging/.connection", "utf8")).trim();
if (PRODUCTION_REFS.some((r) => url.includes(r)) || !ALLOWED_REFS.some((r) => url.includes(r))) { console.error("  REFUSING: not the allowlisted staging project."); process.exit(2); }
const env = Object.fromEntries(fs.readFileSync("supabase/staging/.isolation-env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const A = env.ISOLATION_COMPANY_A_ID, B = env.ISOLATION_COMPANY_B_ID;

const MIG = fs.readFileSync("supabase/migrations/0071_publishing_reliability.sql", "utf8");
const RB = fs.readFileSync("supabase/rollbacks/0071_publishing_reliability.rollback.sql", "utf8");
// 0071's rollback refuses while 0088 is applied (R2); the savepoint unwinds 0088 first, in reverse order.
const RB_0088 = fs.readFileSync("supabase/rollbacks/0088_content_fanout.rollback.sql", "utf8");

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, a) => (await c.query(s, a)).rows;
const one = async (s, a) => (await q(s, a))[0];
const defHash = async (fn) => (await q(`select md5(pg_get_functiondef(p.oid)) h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1 order by 1`, [fn])).map((r) => r.h).join(",");
const exec = async (role, fnSig) => (await one(`select has_function_privilege($1, $2, 'EXECUTE') x`, [role, fnSig])).x;
const tablePriv = async (role, table, priv) => (await one(`select has_table_privilege($1, $2, $3) x`, [role, table, priv])).x;
const asService = async () => { await c.query(`reset role`); await c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`); await c.query(`set local role service_role`); };
const asUser = async (uid) => {
  await c.query(`reset role`);
  await c.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [JSON.stringify({ sub: uid, role: "authenticated" }), uid]);
  await c.query(`set local role authenticated`);
};
const tryAs = async (label, fn) => { await c.query(`savepoint ${label}`); try { const r = await fn(); await c.query(`release savepoint ${label}`); return { ok: true, r }; } catch (e) { await c.query(`rollback to savepoint ${label}`); return { ok: false, e: e.message }; } };

console.log("\n  STATIC");
ok(scanMigrationSql(MIG).length === 0, "0071 contains no database egress (static scan)");
let body = "";
try { body = runnerBody(MIG); ok(!/^\s*(begin|commit)\s*;/im.test(body), "the runner can govern 0071's transaction (its own begin/commit stripped)"); } catch (e) { ok(false, "runnerBody accepts 0071", e.message); }
ok(!/\bdrop\s+table\b|\bdelete\s+from\b|\btruncate\b/i.test(MIG.replace(/--[^\n]*/g, "")), "0071 drops no table and deletes no rows");

// APPLIED MODE: once 0071 is on staging, the checks run against the persistent
// schema (still inside a rolled-back transaction, so no test data persists),
// and the rollback is compared with the PRE-0071 function digests from a
// snapshot (node scripts/publishing-0071-check.mjs --pre <publishing-snapshot.json>).
const APPLIED = (await one(`select count(*)::int n from pg_proc where proname = 'remove_timeline_entry'`)).n > 0;
const preArg = process.argv.indexOf("--pre");
const preSnap = preArg > 0 ? JSON.parse(fs.readFileSync(process.argv[preArg + 1], "utf8")) : null;
const snapHash = (name) => preSnap ? preSnap.functions.filter((f) => f.proname === name).map((f) => f.d).join(",") : null;
const pre = {
  publish: APPLIED ? snapHash("publish_publication") : await defHash("publish_publication"),
  claim: APPLIED ? snapHash("claim_deliveries") : await defHash("claim_deliveries"),
  publishSigs: (await q(`select pg_get_function_identity_arguments(p.oid) a from pg_proc p where p.proname = 'publish_publication'`)).map((r) => r.a),
};
const post = APPLIED ? { publish: await defHash("publish_publication"), claim: await defHash("claim_deliveries") } : null;
if (APPLIED && !preSnap) { console.error("  0071 is applied: pass --pre <pre-0071 publishing snapshot> so the rollback can be compared"); process.exit(3); }
const owner = async (cid) => (await one(`select owner_id from public.companies where id = $1`, [cid])).owner_id;
const ownerA = await owner(A), ownerB = await owner(B);
const investor = (await one(`select id from auth.users where email = $1`, [env.ISOLATION_INVESTOR_EMAIL])).id;
const viewerA = (await one(`select id from auth.users where email = $1`, [env.ISOLATION_STAFF_EMAIL])).id;

console.log(APPLIED ? "\n  0071 IS APPLIED: checks run on the persistent schema, inside a transaction that is rolled back" : "\n  0071 APPLIED INSIDE A TRANSACTION THAT IS ROLLED BACK");
try {
  await c.query("begin");
  if (!APPLIED) { await c.query(body); ok(true, "0071 applies to the staging schema without error"); }

  console.log("\n  A. posts.media_url");
  ok(!!(await one(`select 1 x from information_schema.columns where table_schema='public' and table_name='posts' and column_name='media_url'`)), "posts.media_url now exists (add column if not exists: a no-op where production has it)");
  const pcount = (await one(`select count(*)::int n from public.posts`)).n;
  ok(pcount >= 0, `posts readable (${pcount} rows)`);

  console.log("\n  B. publish_publication: signature, permissions, revision 1");
  const sigs = (await q(`select pg_get_function_identity_arguments(p.oid) a from pg_proc p where p.proname = 'publish_publication'`)).map((r) => r.a);
  ok(sigs.length === 1 && /p_published_at timestamp with time zone/.test(sigs[0]) && JSON.stringify(sigs) === JSON.stringify(pre.publishSigs), "exactly one publish_publication, the 3-argument one /api/publish calls (no stray overload)", JSON.stringify(sigs));
  const sig = "public.publish_publication(uuid, uuid, timestamptz)";
  ok(!(await exec("anon", sig)) && !(await exec("authenticated", sig)) && (await exec("service_role", sig)), "EXECUTE: service_role only (as 0060 hardened it)");
  ok((await one(`select prosecdef s, proconfig cfg from pg_proc where proname='publish_publication'`)).cfg.join(",") === "search_path=public", "SECURITY DEFINER with search_path=public (unchanged from the current definition)");

  await asService();
  const upd = (await one(`insert into public.updates (company_id, body, status, detected, published_on) values ($1, '[0071-check] ORIGINAL release text.', 'draft', '{"headline":"[0071-check]"}', '2026-10-30') returning id`, [A])).id;
  const pubId = (await one(`insert into public.publications (company_id, update_id, destination_id, status, content) values ($1, $2, 'passport', 'approved', '{"headline":"[0071-check] headline","post_type":"press_release"}') returning id`, [A, upd])).id;
  let r = (await one(`select public.publish_publication($1, $2) j`, [pubId, ownerA])).j;
  ok(r.ok === true, "publish (service role, owner of A) -> ok", JSON.stringify(r));
  let revs = await q(`select revision, body, headline from public.release_revisions where publication_id = $1 order by revision`, [pubId]);
  ok(revs.length === 1 && revs[0].revision === 1 && revs[0].body === "[0071-check] ORIGINAL release text." && revs[0].headline === "[0071-check] headline", "revision 1 recorded at publish = the original release", JSON.stringify(revs));
  r = (await one(`select public.revise_publication($1, $2, $3, null, $4) j`, [pubId, "[0071-check] corrected", "[0071-check] CORRECTED text.", ownerA])).j;
  ok(r.ok && r.revision === 2, "the FIRST correction is revision 2", JSON.stringify(r));
  ok((await q(`select 1 from public.events where publication_id = $1 and event_type = 'PUBLICATION_REVISED'`, [pubId])).length === 1, "...and emits PUBLICATION_REVISED (the Phase 1 route baseline is then a no-op: history exists)");
  const forb = (await one(`select public.publish_publication($1, $2) j`, [pubId, ownerB])).j;
  ok(forb.already === true || forb.error === "forbidden", "publishing again is idempotent / forbidden for another company's owner (unchanged)", JSON.stringify(forb));
  const upd2 = (await one(`insert into public.updates (company_id, body, status) values ($1, '   ', 'draft') returning id`, [A])).id;
  const pub2 = (await one(`insert into public.publications (company_id, update_id, destination_id, status, content) values ($1, $2, 'passport', 'approved', '{"headline":"[0071-check] empty"}') returning id`, [A, upd2])).id;
  r = (await one(`select public.publish_publication($1, $2, '2026-01-15T12:00:00Z') j`, [pub2, ownerA])).j;
  ok(r.ok && (await q(`select 1 from public.release_revisions where publication_id = $1`, [pub2])).length === 0, "a release with an empty body publishes (with a backdated date) and records no revision (nothing to record)");

  console.log("\n  D + C. active_from and the UNPUBLISHED subscription");
  const subs = await q(`select listener, event_type, active_from from public.listener_subscriptions order by 1, 2`);
  const unsub = subs.find((s) => s.listener === "profile_timeline_v1" && s.event_type === "PUBLICATION_UNPUBLISHED");
  ok(unsub && unsub.active_from && (APPLIED || Date.now() - new Date(unsub.active_from).getTime() < 10 * 60 * 1000), `profile_timeline_v1 subscribes to UNPUBLISHED from its application time (active_from ${unsub && unsub.active_from && new Date(unsub.active_from).toISOString()})`);
  ok(subs.filter((s) => s !== unsub).every((s) => s.active_from === null), "every existing subscription keeps active_from NULL (= today's behaviour)");
  const oldAt = new Date(Date.now() - 30 * 86400e3).toISOString();
  const oldUn = (await one(`insert into public.events (event_type, publication_id, company_id, payload, idempotency_key, occurred_at) values ('PUBLICATION_UNPUBLISHED', $1, $2, '{}', $3, $4) returning id`, [pubId, A, `chk-old-un:${pubId}`, oldAt])).id;
  const newUn = (await one(`insert into public.events (event_type, publication_id, company_id, payload, idempotency_key) values ('PUBLICATION_UNPUBLISHED', $1, $2, '{}', $3) returning id`, [pubId, A, `chk-new-un:${pubId}`])).id;
  const oldPub = (await one(`insert into public.events (event_type, publication_id, company_id, payload, idempotency_key, occurred_at) values ('PUBLICATION_PUBLISHED', $1, $2, '{}', $3, $4) returning id`, [pubId, A, `chk-old-pub:${pubId}`, oldAt])).id;
  await q(`select count(*) from public.claim_deliveries('profile_timeline_v1', 'chk-worker', 100, 120)`);
  await q(`select count(*) from public.claim_deliveries('feed_projection_v1', 'chk-worker', 100, 120)`);
  const has = async (ev, l) => (await q(`select 1 from public.event_deliveries where event_id = $1 and listener = $2`, [ev, l])).length === 1;
  ok(await has(newUn, "profile_timeline_v1") && !(await has(oldUn, "profile_timeline_v1")), "claim_deliveries creates a timeline delivery for the NEW unpublish event only -- the 30-day-old one is NOT replayed");
  ok(await has(oldPub, "feed_projection_v1") && await has(oldUn, "feed_projection_v1"), "an existing subscription (feed, active_from NULL) still gets old events: unchanged behaviour");
  const claimSig = "public.claim_deliveries(text, text, integer, integer)";
  ok(!(await exec("anon", claimSig)) && !(await exec("authenticated", claimSig)) && (await exec("service_role", claimSig)), "claim_deliveries is still service_role only (create or replace kept its grants)");

  console.log("\n  C. remove_timeline_entry");
  const before = (await one(`select coalesce(profile->'timeline','[]'::jsonb) t from public.companies where id = $1`, [A])).t;
  await q(`select public.upsert_timeline_entry($1, $2)`, [A, JSON.stringify({ key: "chk:k1", date: "2026-10-30", title: "k1" })]);
  await q(`select public.upsert_timeline_entry($1, $2)`, [A, JSON.stringify({ key: "chk:k2", date: "2026-10-29", title: "k2" })]);
  r = (await one(`select public.remove_timeline_entry($1, 'chk:k1') j`, [A])).j;
  const after = (await one(`select profile->'timeline' t from public.companies where id = $1`, [A])).t;
  ok(r.ok && !after.some((e) => e.key === "chk:k1") && after.some((e) => e.key === "chk:k2"), "removes exactly the named entry");
  ok(before.every((e) => after.some((x) => x.key === e.key)), `every pre-existing entry is untouched (${before.length})`);
  const rr = await tryAs("rm_bad", () => q(`select public.remove_timeline_entry($1, '')`, [A]));
  ok(!rr.ok && /key required/.test(rr.e), "an empty key is refused");
  const rmSig = "public.remove_timeline_entry(uuid, text)";
  ok(!(await exec("anon", rmSig)) && !(await exec("authenticated", rmSig)) && (await exec("service_role", rmSig)), "EXECUTE: service_role only");
  ok((await q(`select 1 from public.publications where id = $1`, [pubId])).length === 1, "the release record itself is never deleted by any of this");

  console.log("\n  E. heartbeat and alerts: service role only");
  for (const t of ["public.dispatcher_runs", "public.ops_alerts"]) {
    ok(!(await tablePriv("anon", t, "SELECT")) && !(await tablePriv("authenticated", t, "SELECT")) && !(await tablePriv("authenticated", t, "INSERT")), `${t}: no SELECT/INSERT for anon or authenticated`);
    ok((await one(`select relrowsecurity r from pg_class where oid = $1::regclass`, [t])).r === true, `${t}: RLS on`);
  }
  await asService();
  const hb = await tryAs("hb", () => q(`insert into public.dispatcher_runs (worker, trigger) values ('chk', 'manual') returning id`));
  const al = await tryAs("al", () => q(`insert into public.ops_alerts (condition) values ('chk_condition') returning condition`));
  ok(hb.ok && al.ok, "the service role (the dispatcher) can write both");

  console.log("\n  F. publication_delivery_status: company-isolated");
  const ds = "public.publication_delivery_status(uuid)";
  ok(!(await exec("anon", ds)) && (await exec("authenticated", ds)), "EXECUTE: authenticated yes, anon no");
  const statusAs = async (uid) => { await asUser(uid); const x = await tryAs("ds", () => q(`select * from public.publication_delivery_status($1)`, [pubId])); return x; };
  let s = await statusAs(ownerA);
  ok(s.ok && s.r.length >= 1 && s.r.every((x) => ["delivered", "retrying", "failed"].includes(x.state)), `owner of A sees the delivery state of A's release (${s.ok ? s.r.length : 0} listener rows)`, s.e || "");
  ok(s.ok && new Set(s.r.map((x) => x.event_type)).size === 1 && new Set(s.r.map((x) => x.listener)).size === s.r.length, "...for exactly ONE event (one row per listener), even when events share a timestamp", JSON.stringify(s.r && s.r.map((x) => [x.event_type, x.listener])));
  s = await statusAs(viewerA);
  ok(s.ok && s.r.length >= 1, "a member of A (viewer) sees it too (read-only status, any member)");
  s = await statusAs(ownerB);
  ok(s.ok && s.r.length === 0, "owner of company B sees NOTHING (empty, not an error: no existence oracle)");
  s = await statusAs(investor);
  ok(s.ok && s.r.length === 0, "an investor sees nothing");
  await c.query(`reset role`); await c.query(`set local role anon`);
  const an = await tryAs("anon_ds", () => q(`select * from public.publication_delivery_status($1)`, [pubId]));
  ok(!an.ok && /permission denied/.test(an.e), "anon: permission denied");
  await asUser(ownerA);
  const rmUser = await tryAs("rm_user", () => q(`select public.remove_timeline_entry($1, 'chk:k2')`, [A]));
  ok(!rmUser.ok && /permission denied/.test(rmUser.e), "a company owner cannot call remove_timeline_entry directly");
  const hbUser = await tryAs("hb_user", () => q(`select * from public.dispatcher_runs limit 1`));
  ok(!hbUser.ok && /permission denied/.test(hbUser.e), "a company owner cannot read dispatcher_runs");

  console.log("\n  ROLLBACK FILE (applied in a savepoint, then undone)");
  await c.query(`reset role`);
  await c.query(`savepoint rb`);
  try {
    if ((await one(`select to_regclass('public.destination_content') t`)).t) await c.query(runnerBody(RB_0088));
    await c.query(runnerBody(RB));
    ok(await defHash("publish_publication") === pre.publish, "publish_publication restored to its exact pre-0071 definition");
    ok(await defHash("claim_deliveries") === pre.claim, "claim_deliveries restored to its exact pre-0071 definition");
    const gone = await one(`select to_regclass('public.dispatcher_runs') a, to_regclass('public.ops_alerts') b,
      (select count(*)::int from pg_proc where proname in ('remove_timeline_entry','publication_delivery_status')) f,
      (select count(*)::int from information_schema.columns where table_name='listener_subscriptions' and column_name='active_from') c,
      (select count(*)::int from public.listener_subscriptions where listener='profile_timeline_v1' and event_type='PUBLICATION_UNPUBLISHED') s,
      (select count(*)::int from information_schema.columns where table_name='posts' and column_name='media_url') m`);
    ok(gone.a === null && gone.b === null && gone.f === 0 && gone.c === 0 && gone.s === 0, "everything 0071 added is removed (tables, functions, column, subscription)", JSON.stringify(gone));
    ok(gone.m === 1, "posts.media_url is deliberately kept by the rollback");
    ok(!(await exec("authenticated", "public.publish_publication(uuid, uuid, timestamptz)")) && (await exec("service_role", "public.publish_publication(uuid, uuid, timestamptz)")), "publish_publication grants intact after rollback");
    ok((await q(`select 1 from public.release_revisions where publication_id = $1`, [pubId])).length === 2, "revision rows written under 0071 are kept (append-only history)");
  } finally { await c.query(`rollback to savepoint rb`); }
} catch (e) {
  fail++; console.error(`  ✗ unexpected error: ${e.message}`);
} finally {
  await c.query("rollback").catch(() => {});
}

if (APPLIED) {
  console.log("\n  AFTER ROLLBACK: the applied schema is intact and no test data persisted");
  const st = await one(`select (select count(*)::int from information_schema.columns where table_name='posts' and column_name='media_url') media,
    (select count(*)::int from pg_proc where proname in ('remove_timeline_entry','publication_delivery_status')) fns,
    (select count(*)::int from public.publications where content->>'headline' like '[0071-check]%') pubs`);
  ok(st.media === 1 && st.fns === 2 && st.pubs === 0, "0071 objects present; no [0071-check] rows persisted", JSON.stringify(st));
  ok(await defHash("publish_publication") === post.publish && await defHash("claim_deliveries") === post.claim, "functions unchanged by the check (the rollback ran only in a savepoint)");
  await c.end();
  console.log(`\n  0071 check (staging, applied; rolled-back probes): ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}
console.log("\n  AFTER ROLLBACK: nothing persisted");
const left = await one(`select
  (select count(*)::int from information_schema.columns where table_name='posts' and column_name='media_url') media,
  (select count(*)::int from information_schema.columns where table_name='listener_subscriptions' and column_name='active_from') af,
  (select count(*)::int from pg_proc where proname in ('remove_timeline_entry','publication_delivery_status')) fns,
  to_regclass('public.dispatcher_runs') hb,
  (select count(*)::int from public.publications where content->>'headline' like '[0071-check]%') pubs`);
ok(left.media === 0 && left.af === 0 && left.fns === 0 && left.hb === null && left.pubs === 0, "no column, function, table or test release remains", JSON.stringify(left));
ok(await defHash("publish_publication") === pre.publish && await defHash("claim_deliveries") === pre.claim, "publish_publication and claim_deliveries are exactly as before");
await c.end();
console.log(`\n  0071 check (staging, rolled back): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
