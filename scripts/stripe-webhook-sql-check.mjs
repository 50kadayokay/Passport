// F9: exercise the REAL SQL of migration 0069b against the staging database,
// inside ONE transaction that is always ROLLED BACK.
//   node scripts/stripe-webhook-sql-check.mjs
//
// It does not apply the migration. BEGIN; run the migration's body; run every
// scenario through public.stripe_apply_event(); check the rows; ROLLBACK; then
// confirm in a fresh query that public.stripe_events and the new columns do
// NOT exist. Concurrency across connections cannot be shown this way (nothing
// is committed, so a second connection cannot see the function); the offline
// model covers that, and a live run needs the migration applied (approval).
//
// Refuses anything but the allowlisted staging project. Prints no secrets.

import fs from "node:fs";
import pg from "pg";

const ALLOWED_REFS = ["jmljfovtfxcdhjmtlnva"], PRODUCTION_REFS = ["rvptronniomlqumjhyrr"];
const url = (process.env.STAGING_DATABASE_URL || fs.readFileSync("supabase/staging/.connection", "utf8")).trim();
if (PRODUCTION_REFS.some((r) => url.includes(r)) || !ALLOWED_REFS.some((r) => url.includes(r))) { console.error("  REFUSING: not the allowlisted staging project."); process.exit(2); }
const env = Object.fromEntries(fs.readFileSync("supabase/staging/.isolation-env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const A = env.ISOLATION_COMPANY_A_ID, B = env.ISOLATION_COMPANY_B_ID;

const sql = fs.readFileSync("supabase/migrations/0069b_stripe_events.sql", "utf8");
// The file wraps itself in begin/commit; this check supplies its own transaction.
const body = sql.replace(/^\s*begin;\s*$/m, "").replace(/^\s*commit;\s*$/m, "");
if (/^\s*commit;\s*$/m.test(body)) { console.error("  could not strip the migration's commit"); process.exit(1); }

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const T = (s) => new Date(s * 1000).toISOString();
const apply = async (id, type, created, company, sub, kind, status, stripeStatus, tier, renews = null, verified = null, client = c) =>
  (await client.query(`select public.stripe_apply_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as o`, [id, type, T(created), company, sub, kind, status, stripeStatus, tier, renews, verified])).rows[0].o;
const row = async (cid) => (await c.query(`select plan_id, status, note, stripe_subscription_id, stripe_status, stripe_event_at from public.company_subscriptions where company_id=$1`, [cid])).rows[0];
const tierOf = async (cid) => (await c.query(`select tier from public.companies where id=$1`, [cid])).rows[0].tier;

// Applied already? Then the scenarios run against the real schema (still in a
// rolled-back transaction, so no scenario data persists) and the cross-
// connection concurrency section runs too.
const APPLIED = (await c.query(`select count(*)::int n from pg_proc where proname='stripe_apply_event'`)).rows[0].n > 0;
console.log(`\n  0069b ON STAGING (${APPLIED ? "APPLIED; scenarios in a rolled-back transaction" : "NOT applied; migration + scenarios in a rolled-back transaction"})`);
try {
  await c.query("begin");
  if (!APPLIED) { await c.query(body); ok(true, "the migration body runs on the staging schema without error"); }
  // Start from known rows for the fixtures (all inside the transaction).
  await c.query(`delete from public.company_subscriptions where company_id = any($1)`, [[A, B]]);
  await c.query(`insert into public.company_subscriptions (company_id, plan_id, status, note) values ($1, 'passport_managed', 'active', 'manual')`, [B]);
  const bBefore = JSON.stringify(await row(B));
  // From here on, act exactly as the webhook does through PostgREST with the
  // service key: role service_role, JWT claims role=service_role. (The
  // company_owner_guard trigger lets a tier change through only for that role
  // or a platform admin -- connected as postgres with no claims, it refuses.)
  await c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
  await c.query(`set local role service_role`);

  let o = await apply("evt_sql_1", "checkout.session.completed", 1_800_000_000, A, "sub_A1", "bind", "active", "active", "basic");
  let r = await row(A);
  ok(o === "applied" && r.status === "active" && r.plan_id === "passport" && r.stripe_subscription_id === "sub_A1" && (await tierOf(A)) === "basic", "checkout -> applied: active on passport, bound to sub_A1, tier basic", JSON.stringify(r));
  o = await apply("evt_sql_1", "checkout.session.completed", 1_800_000_000, A, "sub_A1", "bind", "active", "active", "basic");
  ok(o === "duplicate", "the same event id again -> duplicate");
  ok((await c.query(`select count(*)::int n from public.stripe_events where id='evt_sql_1'`)).rows[0].n === 1, "  ...one row in stripe_events");
  o = await apply("evt_sql_2", "customer.subscription.updated", 1_800_000_200, A, "sub_A1", "sync", "past_due", "past_due", "basic");
  ok(o === "applied" && (await row(A)).status === "past_due", "a newer update -> applied (past_due)");
  o = await apply("evt_sql_3", "customer.subscription.updated", 1_800_000_100, A, "sub_A1", "sync", "active", "active", "basic");
  ok(o === "stale" && (await row(A)).status === "past_due", "an OLDER 'active' -> stale; stays past_due");
  o = await apply("evt_sql_4", "customer.subscription.updated", 1_800_000_250, A, "sub_A1", "sync", "active", "active", "pro");
  ok(o === "applied" && (await row(A)).plan_id === "passport_managed" && (await tierOf(A)) === "pro", "upgrade to pro -> passport_managed, tier pro");
  o = await apply("evt_sql_5", "invoice.payment_failed", 1_800_000_260, A, "sub_A1", "payment_failed", "past_due", "past_due", null);
  ok(o === "applied" && (await row(A)).plan_id === "passport_managed" && (await row(A)).status === "past_due", "payment failed (no tier) -> past_due, plan KEPT");
  o = await apply("evt_sql_6", "customer.subscription.deleted", 1_800_000_200, A, "sub_OTHER", "delete", "cancelled", "canceled", null);
  ok(o === "other_subscription" && (await row(A)).status === "past_due", "deletion of a subscription A is not bound to -> other_subscription");
  o = await apply("evt_sql_7", "customer.subscription.deleted", 1_800_000_300, A, "sub_A1", "delete", "cancelled", "canceled", null);
  ok(o === "applied" && (await row(A)).status === "cancelled" && (await row(A)).stripe_status === "canceled", "deletion of the bound subscription -> cancelled");
  o = await apply("evt_sql_8", "customer.subscription.updated", 1_800_000_300, A, "sub_A1", "sync", "active", "active", "pro");
  ok(o === "terminal" && (await row(A)).status === "cancelled", "an 'active' for the canceled subscription (same second) -> terminal");
  o = await apply("evt_sql_9", "customer.subscription.created", 1_800_000_400, A, "sub_A2", "sync", "active", "active", "basic");
  ok(o === "applied" && (await row(A)).stripe_subscription_id === "sub_A2", "subscription.created for a new subscription after cancellation -> re-bound");
  o = await apply("evt_sql_10", "customer.subscription.created", 1_800_000_500, A, "sub_A3", "sync", "active", "active", "basic");
  ok(o === "other_subscription" && (await row(A)).stripe_subscription_id === "sub_A2", "subscription.created for a THIRD subscription while sub_A2 is active -> other_subscription");
  o = await apply("evt_sql_11", "customer.subscription.updated", 1_800_000_600, "cccccccc-0000-4000-8000-00000000000c", "sub_Z", "sync", "active", "active", "basic");
  ok(o === "unknown_company", "metadata naming no company -> unknown_company");
  o = await apply("evt_sql_12", "invoice.paid", 1_800_000_700, null, null, "ignore", null, null, null);
  ok(o === "ignored", "an ignored type -> ignored, and still recorded (so its retries are duplicates)");
  ok(JSON.stringify(await row(B)) === bBefore && (await tierOf(B)) !== undefined, "company B's manual billing row is untouched throughout");
  // FIRST BINDING of an existing, unbound company (every pre-0069b row).
  await c.query("reset role");
  await c.query(`update public.company_subscriptions set stripe_subscription_id=null, stripe_status=null, stripe_event_at=null, status='active', plan_id='passport_managed' where company_id=$1`, [A]);
  await c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
  await c.query(`set local role service_role`);
  o = await apply("evt_sql_fb1", "customer.subscription.deleted", 1_800_001_000, A, "sub_old", "delete", "cancelled", "canceled", null);
  ok(o === "needs_verification" && (await c.query(`select count(*)::int n from public.stripe_events where id='evt_sql_fb1'`)).rows[0].n === 0 && (await row(A)).status === "active",
     "unbound company, non-checkout event, no proof -> needs_verification; claim RELEASED, nothing changed");
  o = await apply("evt_sql_fb1", "customer.subscription.deleted", 1_800_001_000, A, "sub_old", "delete", "cancelled", "canceled", null, null, "sub_current");
  ok(o === "unverified_binding" && (await row(A)).status === "active" && (await row(A)).stripe_subscription_id === null, "...the caller proves the CURRENT subscription is a different one -> unverified_binding: no cancellation, no binding");
  o = await apply("evt_sql_fb2", "invoice.payment_failed", 1_800_001_010, A, null, "payment_failed", "past_due", "past_due", null, null, "sub_current");
  ok(o === "unverified_binding", "an invoice naming no subscription cannot establish a binding");
  o = await apply("evt_sql_fb3", "checkout.session.completed", 1_800_001_020, A, "sub_dead", "bind", "cancelled", "canceled", "pro");
  ok(o === "dead_checkout" && (await row(A)).status === "active" && (await row(A)).stripe_subscription_id === null, "a checkout for a canceled subscription -> dead_checkout; the active row is untouched");
  o = await apply("evt_sql_fb4", "customer.subscription.updated", 1_800_001_030, A, "sub_current", "sync", "past_due", "past_due", "pro", null, "sub_current");
  ok(o === "applied" && (await row(A)).stripe_subscription_id === "sub_current" && (await row(A)).status === "past_due" && (await row(A)).plan_id === "passport_managed", "the current subscription's event, proven -> applied and bound");
  o = await apply("evt_sql_fb5", "customer.subscription.deleted", 1_800_001_040, A, "sub_old", "delete", "cancelled", "canceled", null);
  ok(o === "other_subscription" && (await row(A)).status === "past_due", "once bound, the old subscription is other_subscription");

  const outcomes = (await c.query(`select id, outcome from public.stripe_events where id like 'evt_sql_%' order by id`)).rows;
  ok(outcomes.length === 17 && outcomes.every((x) => !["pending", "needs_verification"].includes(x.outcome)), "every recorded event carries its final outcome (none 'pending'; needs_verification never recorded)", String(outcomes.length));

  // A failure mid-transaction rolls back the event row too.
  await c.query("savepoint s_fail");
  let threw = false;
  try { await apply("evt_sql_bad", "x", 1_800_000_800, A, "sub_A2", "nonsense", "active", "active", null); } catch { threw = true; }
  await c.query("rollback to savepoint s_fail");
  ok(threw && (await c.query(`select count(*)::int n from public.stripe_events where id='evt_sql_bad'`)).rows[0].n === 0, "an exception inside the function leaves NO event row (a retry is processed, not treated as a duplicate)");
  await c.query("savepoint s_id");
  threw = false;
  try { await apply("not_an_evt_id", "x", 1_800_000_800, null, null, "ignore", null, null, null); } catch { threw = true; }
  await c.query("rollback to savepoint s_id");
  ok(threw, "an id that is not evt_... violates the table's check constraint");

  // Privileges: users can neither call the function nor read the table.
  await c.query("reset role");
  for (const role of ["authenticated", "anon"]) {
    await c.query("savepoint s_role");
    let denied = false;
    try { await c.query(`set local role ${role}`); await c.query(`select public.stripe_apply_event('evt_sql_role','x',now(),null,null,'ignore',null,null,null,null,null)`); } catch (e) { denied = /permission denied/.test(e.message); }
    await c.query("rollback to savepoint s_role");
    ok(denied, `${role}: EXECUTE on stripe_apply_event denied`);
    await c.query("savepoint s_role2");
    denied = false;
    try { await c.query(`set local role ${role}`); await c.query(`select * from public.stripe_events limit 1`); } catch (e) { denied = /permission denied/.test(e.message); }
    await c.query("rollback to savepoint s_role2");
    ok(denied, `${role}: SELECT on stripe_events denied`);
  }
  await c.query("savepoint s_svc");
  let svc = null;
  try { await c.query(`set local role service_role`); svc = (await c.query(`select public.stripe_apply_event('evt_sql_svc','invoice.paid',now(),null,null,'ignore',null,null,null,null,null) as o`)).rows[0].o; } catch (e) { svc = `error: ${e.message}`; }
  await c.query("rollback to savepoint s_svc");
  ok(svc === "ignored", "service_role: may execute (the webhook's role)", String(svc));
} catch (e) {
  fail++; console.error(`  ✗ unexpected error: ${e.message}`);
} finally {
  await c.query("rollback").catch(() => {});
}
const left = (await c.query(`select to_regclass('public.stripe_events') as t,
  (select count(*)::int from information_schema.columns where table_schema='public' and table_name='company_subscriptions' and column_name in ('stripe_subscription_id','stripe_status','stripe_event_at')) as cols,
  (select count(*)::int from pg_proc where proname='stripe_apply_event') as fns,
  (select count(*)::int from public.company_subscriptions where company_id = any($1)) as subrows`, [[A, B]])).rows[0];
if (!APPLIED) {
  ok(left.t === null && left.cols === 0 && left.fns === 0, "AFTER ROLLBACK: no stripe_events table, no new columns, no function -- nothing was applied", JSON.stringify(left));
} else {
  ok(left.t !== null && left.cols === 3 && left.fns === 1 && (await c.query(`select count(*)::int n from public.stripe_events where id like 'evt_sql_%'`)).rows[0].n === 0,
     "AFTER ROLLBACK: the applied schema is intact and no scenario event persisted");
}

// ---- REAL CONCURRENCY across separate connections (only once applied) -------
// Committed work on company A's fixture row; A's row and the test events are
// restored/removed afterwards.
if (APPLIED) {
  console.log("\n  CONCURRENT DELIVERIES ACROSS SEPARATE DATABASE CONNECTIONS (committed, then restored)");
  const snap = (await c.query(`select * from public.company_subscriptions where company_id=$1`, [A])).rows[0] || null;
  const tierBefore = await tierOf(A);
  const conns = [];
  try {
    for (let i = 0; i < 8; i++) { const k = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } }); await k.connect(); conns.push(k); }
    const asService = async (k) => { await k.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', false)`); await k.query(`set role service_role`); };
    for (const k of conns) await asService(k);
    const tag = `evt_sqlc_${Date.now()}`;
    // Start from a bound row so the scenarios exercise idempotency and ordering.
    await c.query(`delete from public.company_subscriptions where company_id=$1`, [A]);
    const bind = await apply(`${tag}_bind`, "checkout.session.completed", 1_900_000_000, A, "sub_conc", "bind", "active", "active", "basic", null, null, conns[0]);
    ok(bind === "applied", "setup: a checkout binds A to sub_conc (committed)");
    for (let round = 0; round < 5; round++) {
      const id = `${tag}_dup_${round}`;
      const outs = await Promise.all(conns.map((k) => apply(id, "customer.subscription.updated", 1_900_000_100 + round, A, "sub_conc", "sync", round % 2 ? "active" : "past_due", round % 2 ? "active" : "past_due", "basic", null, null, k)));
      const applied = outs.filter((x) => x === "applied").length, dups = outs.filter((x) => x === "duplicate").length;
      ok(applied === 1 && dups === 7, `round ${round + 1}: the SAME event delivered on 8 connections at once -> exactly 1 applied, 7 duplicate`, outs.join(","));
    }
    const shuffled = [1_900_000_400, 1_900_000_250, 1_900_000_500, 1_900_000_300, 1_900_000_450, 1_900_000_350, 1_900_000_200, 1_900_000_275];
    const outs = await Promise.all(shuffled.map((t, i) => apply(`${tag}_ord_${i}`, "customer.subscription.updated", t, A, "sub_conc", "sync", t === 1_900_000_500 ? "past_due" : "active", t === 1_900_000_500 ? "past_due" : "active", "basic", null, null, conns[i])));
    const r = (await c.query(`select status, stripe_event_at from public.company_subscriptions where company_id=$1`, [A])).rows[0];
    ok(r.status === "past_due" && new Date(r.stripe_event_at).getTime() === 1_900_000_500 * 1000, "8 DIFFERENT events with shuffled timestamps on 8 connections at once -> the NEWEST (past_due) wins; the rest stale or superseded", `${outs.join(",")} -> ${JSON.stringify(r)}`);
    const recorded = (await c.query(`select count(*)::int n from public.stripe_events where id like $1`, [`${tag}%`])).rows[0].n;
    ok(recorded === 1 + 5 + 8, `stripe_events holds exactly one row per distinct event (${recorded})`);
  } finally {
    for (const k of conns) await k.end().catch(() => {});
    await c.query(`delete from public.stripe_events where id like 'evt_sqlc_%'`);
    await c.query(`delete from public.company_subscriptions where company_id=$1`, [A]);
    if (snap) {
      const cols = Object.keys(snap);
      await c.query(`insert into public.company_subscriptions (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`, cols.map((k) => snap[k]));
    }
    await c.query(`select set_config('app.provisioning','on',false)`);
    await c.query(`update public.companies set tier=$2 where id=$1`, [A, tierBefore]);
    const after = (await c.query(`select * from public.company_subscriptions where company_id=$1`, [A])).rows[0] || null;
    ok(JSON.stringify(after) === JSON.stringify(snap) && (await tierOf(A)) === tierBefore && (await c.query(`select count(*)::int n from public.stripe_events where id like 'evt_sqlc_%'`)).rows[0].n === 0,
       "cleanup: A's subscription row and tier restored exactly; concurrency test events removed");
  }
}
await c.end();
console.log(`\n  stripe-webhook-sql (staging, rolled back): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
