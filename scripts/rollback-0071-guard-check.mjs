// 0071's rollback refuses to run while 0088 is applied (R2), verified on
// STAGING in ONE transaction that is always ROLLED BACK.
//   node scripts/rollback-0071-guard-check.mjs
//
// FOR S4 TO RUN (needs supabase/staging/.connection). Staging has 0071 and 0088
// applied. Every rollback here runs inside savepoints that are undone; nothing
// persists and nothing calls out.
//   - with 0088 applied the 0071 rollback raises the guard's error (naming the
//     order) before changing anything
//   - each 0088 marker alone (a subscription, destination_content, either
//     function) is enough to refuse
//   - after 0088's rollback, 0071's runs and removes active_from -- with 0087
//     still applied, which it does not depend on
import fs from "node:fs";
import pg from "pg";
import { runnerBody } from "./_db-egress.mjs";

const url = (process.env.STAGING_DATABASE_URL || fs.readFileSync("supabase/staging/.connection", "utf8")).trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the staging project."); process.exit(2); }
const RB_0071 = runnerBody(fs.readFileSync("supabase/rollbacks/0071_publishing_reliability.rollback.sql", "utf8"));
const RB_0088 = runnerBody(fs.readFileSync("supabase/rollbacks/0088_content_fanout.rollback.sql", "utf8"));

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const one = async (s, a) => (await c.query(s, a)).rows[0];
let sp = 0;
const attempt = async (sql) => {
  const n = `g${++sp}`; await c.query(`savepoint ${n}`);
  try { await c.query(sql); await c.query(`release savepoint ${n}`); return { ok: true }; }
  catch (e) { await c.query(`rollback to savepoint ${n}`); return { ok: false, msg: e.message, hint: e.hint || "" }; }
};
const state = () => one(`select
  (select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'listener_subscriptions' and column_name = 'active_from') active_from,
  to_regclass('public.dispatcher_runs') is not null dispatcher_runs,
  (select md5(pg_get_functiondef('public.claim_deliveries(text, text, integer, integer)'::regprocedure))) claim,
  (select count(*)::int from public.listener_subscriptions where listener in ('site_content_v1', 'conference_content_v1')) subs,
  to_regclass('public.destination_content') is not null destination_content,
  to_regprocedure('public.record_company_events(jsonb)') is not null audience_0087`);
const refused = (r) => !r.ok && /0071 rollback refused: 0088_content_fanout is still applied/.test(r.msg) && /0088_content_fanout\.rollback\.sql first/.test(r.hint);

await c.query("begin");
try {
  await c.query("set local lock_timeout = '10s'");
  const s0 = await state();
  ok(s0.active_from === 1 && s0.dispatcher_runs && s0.subs === 6 && s0.destination_content, "staging has 0071 and 0088 applied (6 subscriptions)", JSON.stringify(s0));

  console.log("\n  0088 APPLIED: the 0071 rollback refuses");
  let r = await attempt(RB_0071);
  ok(refused(r), "it raises the guard's error, with the hint to roll back 0088 first", `${r.msg} | ${r.hint}`);
  const s1 = await state();
  ok(JSON.stringify(s1) === JSON.stringify(s0), "nothing changed (active_from, dispatcher_runs, claim_deliveries intact)");

  console.log("\n  EACH 0088 MARKER ALONE IS ENOUGH");
  for (const [label, strip] of [
    ["only subscriptions left", `drop function public.deliver_destination_content(text, uuid, uuid, integer, boolean, jsonb); drop function public.conference_booth_releases(text, integer); drop table public.destination_content cascade`],
    ["only destination_content left", `delete from public.event_deliveries where listener in ('site_content_v1', 'conference_content_v1'); delete from public.listener_subscriptions where listener in ('site_content_v1', 'conference_content_v1'); drop function public.deliver_destination_content(text, uuid, uuid, integer, boolean, jsonb); drop function public.conference_booth_releases(text, integer)`],
    ["only deliver_destination_content left", `delete from public.event_deliveries where listener in ('site_content_v1', 'conference_content_v1'); delete from public.listener_subscriptions where listener in ('site_content_v1', 'conference_content_v1'); drop function public.conference_booth_releases(text, integer); drop table public.destination_content cascade`],
    ["only conference_booth_releases left", `delete from public.event_deliveries where listener in ('site_content_v1', 'conference_content_v1'); delete from public.listener_subscriptions where listener in ('site_content_v1', 'conference_content_v1'); drop function public.deliver_destination_content(text, uuid, uuid, integer, boolean, jsonb); drop table public.destination_content cascade`],
  ]) {
    await c.query("savepoint marker");
    try {
      const pre = await attempt(strip);
      const x = pre.ok ? await attempt(RB_0071) : pre;
      ok(pre.ok && refused(x), `${label}: refused`, pre.ok ? x.msg : `setup failed: ${pre.msg}`);
    } finally { await c.query("rollback to savepoint marker"); }
  }

  console.log("\n  REVERSE ORDER: 0088 first, then 0071");
  await c.query("savepoint order");
  try {
    const a = await attempt(RB_0088);
    ok(a.ok, "0088's rollback runs", a.msg);
    const b = await attempt(RB_0071);
    ok(b.ok, "then 0071's rollback runs (0087 still applied: it does not depend on active_from)", b.msg);
    const s2 = await state();
    ok(s2.active_from === 0 && !s2.dispatcher_runs && s2.claim !== s0.claim && s2.audience_0087, "active_from and dispatcher_runs are gone, claim_deliveries is 0008's, 0087 untouched", JSON.stringify(s2));
  } finally { await c.query("rollback to savepoint order"); }

  ok(JSON.stringify(await state()) === JSON.stringify(s0), "staging is exactly as it started (before the transaction's final ROLLBACK)");
} catch (e) {
  fail++; console.error(`  ✗ unexpected: ${e.message}`);
} finally {
  await c.query("rollback").catch(() => {});
  await c.end();
}
console.log(`\n  rollback-0071-guard (staging, rolled back): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
