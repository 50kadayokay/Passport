// a12: verify the analytics migrations against the STAGING database inside
// ONE transaction that is always ROLLED BACK.
//   node scripts/analytics-0065-0073-check.mjs
//
// Staging already runs 0065a/0065b (it applies everything); production runs
// 0048. So, inside the transaction, this:
//   1. applies the 0065b and 0065a ROLLBACK files -> the database is back at
//      0048, i.e. what production runs (and the rollbacks are rehearsed);
//   2. builds a controlled fixture (a throwaway company, posts, events, likes,
//      saves, follows) and shows 0048's defects on it;
//   3. applies the PRODUCTION PATH in order: 0065a, 0065b, 0065c, 0073a, 0073b
//      (CONCURRENTLY stripped -- it cannot run inside a transaction; the real
//      apply runs those files on their own);
//   4. checks every analytics function against HAND-COMPUTED expected numbers,
//      impression de-duplication, per-day semantics, honest "recorded since",
//      and access (members yes; another company, investors, anon no);
//   5. rehearses every rollback back to 0048;
// then ROLLBACK, and confirms in fresh queries that nothing persisted.
// Staging only. Prints no secrets.

import fs from "node:fs";
import pg from "pg";
import { runnerBody, scanMigrationSql } from "./_db-egress.mjs";

const ALLOWED_REFS = ["jmljfovtfxcdhjmtlnva"], PRODUCTION_REFS = ["rvptronniomlqumjhyrr"];
const url = (process.env.STAGING_DATABASE_URL || fs.readFileSync("supabase/staging/.connection", "utf8")).trim();
if (PRODUCTION_REFS.some((r) => url.includes(r)) || !ALLOWED_REFS.some((r) => url.includes(r))) { console.error("  REFUSING: not the allowlisted staging project."); process.exit(2); }
const env = Object.fromEntries(fs.readFileSync("supabase/staging/.isolation-env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const read = (f) => fs.readFileSync(f, "utf8");
const M = {
  a: read("supabase/migrations/0065a_analytics_breakdown.sql"), b: read("supabase/migrations/0065b_engagement_corrections.sql"),
  c: read("supabase/migrations/0065c_analytics_indexes.sql"), ia: read("supabase/migrations/0073a_impression_dedupe_index.sql"),
  ib: read("supabase/migrations/0073b_impression_tracking.sql"), ic: read("supabase/migrations/0073c_post_events_client_guard.sql"),
};
const R = {
  a: read("supabase/rollbacks/0065a_analytics_breakdown.rollback.sql"), b: read("supabase/rollbacks/0065b_engagement_corrections.rollback.sql"),
  c: read("supabase/rollbacks/0065c_analytics_indexes.rollback.sql"), ia: read("supabase/rollbacks/0073a_impression_dedupe_index.rollback.sql"),
  ib: read("supabase/rollbacks/0073b_impression_tracking.rollback.sql"), ic: read("supabase/rollbacks/0073c_post_events_client_guard.rollback.sql"),
};
// For use inside the test transaction only.
const noConcurrently = (sql) => sql.replace(/--[^\n]*/g, "").replace(/\bconcurrently\s+/gi, "");
const strip = (sql) => runnerBody(sql);

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const eq = (got, want, m) => ok(JSON.stringify(got) === JSON.stringify(want), m, `got ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, a) => (await c.query(s, a)).rows;
const one = async (s, a) => (await q(s, a))[0];
const FNS = ["company_engagement_totals", "company_engagement_daily", "company_post_engagement", "company_engagement_by_type", "company_follower_growth", "company_content_performance", "company_engagement_unattributed", "record_post_impressions", "company_impression_summary", "company_post_impressions"];
const digest = async () => (await q(`select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')=' || md5(pg_get_functiondef(p.oid)) || ' acl=' || coalesce(array_to_string(p.proacl, ' '), '') x
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any($1) order by 1`, [FNS])).map((r) => r.x).join("\n");
const indexes = async () => (await q(`select indexname from pg_indexes where schemaname = 'public' and indexname in ('idx_post_likes_slug_key','idx_post_saves_slug_key','idx_ucr_slug_following','post_events_impression_once') order by 1`)).map((r) => r.indexname);
let sp = 0;
const tryq = async (sql, args) => { const n = `s${++sp}`; await c.query(`savepoint ${n}`); try { const r = await q(sql, args); await c.query(`release savepoint ${n}`); return { ok: true, r }; } catch (e) { await c.query(`rollback to savepoint ${n}`); return { ok: false, e: e.message, code: e.code }; } };
const asPostgres = async () => { await c.query(`reset role`); await c.query(`select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true)`); };
const asUser = async (uid) => {
  await c.query(`reset role`);
  await c.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [JSON.stringify({ sub: uid, role: "authenticated" }), uid]);
  await c.query(`set local role authenticated`);
};
const asAnon = async () => { await c.query(`reset role`); await c.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('request.jwt.claim.sub', '', true)`); await c.query(`set local role anon`); };
const num = (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === null ? null : (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v)) ? Number(v) : v instanceof Date ? v.toISOString() : v]));

const uid = async (k) => (await one(`select id from auth.users where email = $1`, [env[`ISOLATION_${k}_EMAIL`]]))?.id;
const U = { ownerB: (await one(`select owner_id from public.companies where id = $1`, [env.ISOLATION_COMPANY_B_ID])).owner_id, ownerA: (await one(`select owner_id from public.companies where id = $1`, [env.ISOLATION_COMPANY_A_ID])).owner_id,
  viewer: await uid("STAFF"), analyst: await uid("ANALYST"), i1: await uid("INVESTOR"), i2: await uid("INVESTOR_B") };
if (Object.values(U).some((v) => !v)) { console.error("  fixture users missing (run scripts/seed-isolation-fixtures.mjs)"); process.exit(3); }

console.log("\n  STATIC");
for (const [k, s] of Object.entries({ ...M, ra: R.a, rb: R.b, rc: R.c, ria: R.ia, rib: R.ib, ric: R.ic })) if (scanMigrationSql(s).length) ok(false, `${k}: no database egress`);
ok(true, "no database egress in 0065a/b/c, 0073a/b or their rollbacks (static scan)");
ok(/create unique index concurrently/i.test(M.ia.replace(/--[^\n]*/g, "")) && !/^\s*begin\s*;/im.test(M.ia), "0073a builds CONCURRENTLY with no begin/commit (the runner runs it on its own)");
ok(/^\s*begin\s*;/im.test(M.ib) && !/concurrently/i.test(M.ib.replace(/--[^\n]*/g, "")), "0073b is transactional");
ok(!/\b(drop\s+table|truncate|delete\s+from|alter\s+table|create\s+policy|drop\s+policy)\b/i.test(M.ia.replace(/--[^\n]*/g, "") + M.ib.replace(/--[^\n]*/g, "")), "0073a/b drop, delete, alter and re-policy nothing");
const S0 = await digest(), I0 = await indexes();
// APPLIED MODE: once 0073 is on staging, it is rolled back first INSIDE the
// transaction too, so step 1 still reaches production's 0048 state.
const APPLIED_0073 = /record_post_impressions/.test(S0);
const policyDef = async () => (await one(`select md5(coalesce(with_check,'')) d from pg_policies where schemaname='public' and tablename='post_events' and policyname='own_insert'`)).d;
const APPLIED_0073C = (await one(`select count(*)::int n from pg_trigger where tgname = 'post_events_client_guard'`)).n > 0;
const P0 = await policyDef();
ok(/company_engagement_by_type/.test(S0) && /company_engagement_totals/.test(S0), `staging today: 0065a/0065b present; 0073 ${APPLIED_0073 ? "APPLIED" : "absent"}`);
if (APPLIED_0073) ok(I0.includes("post_events_impression_once"), "0073a's index is present on staging");
ok(true, `0065c on staging: ${["idx_post_likes_slug_key", "idx_post_saves_slug_key", "idx_ucr_slug_following"].map((i) => i + (I0.includes(i) ? " present" : " MISSING")).join(", ")}`);
const dups = await q(`select count(*)::int n from (select 1 from public.post_events where kind = 'impression' group by post_id, user_id, (created_at at time zone 'UTC')::date having count(*) > 1) d`);
ok(dups[0].n === 0, "0073a pre-check on staging: no duplicate impressions (the index can build)");

try {
  await c.query("begin");
  await asPostgres();

  console.log("\n  1. BACK TO PRODUCTION'S STATE (0048), BY THE ROLLBACK FILES");
  if (APPLIED_0073C) await q(strip(R.ic));
  const P48 = await policyDef();
  if (APPLIED_0073) { await q(strip(R.ib)); await q(noConcurrently(R.ia)); }
  await q(strip(R.b)); await q(strip(R.a));
  const D48 = await digest();
  const fns48 = (await q(`select proname from pg_proc where pronamespace = 'public'::regnamespace and proname = any($1) order by 1`, [FNS])).map((r) => r.proname);
  eq(fns48, ["company_engagement_daily", "company_engagement_totals", "company_post_engagement"], "only 0048's three functions remain");
  ok(!/\/ 1000/.test((await one(`select pg_get_functiondef('public.company_engagement_totals(uuid)'::regprocedure) d`)).d), "company_engagement_totals is 0048's body again (no ms->s conversion)");

  console.log("\n  2. CONTROLLED FIXTURE");
  const slug = "zz-a12-check";
  const co = (await one(`insert into public.companies (slug, name, owner_id, status) values ($1, 'A12 Check', $2, 'published') returning id`, [slug, U.ownerB])).id;
  await q(`insert into public.company_memberships (company_id, user_id, role, status) values ($1, $2, 'viewer', 'active'), ($1, $3, 'analyst', 'active')`, [co, U.viewer, U.analyst]);
  const pub = async () => {
    const upd = (await one(`insert into public.updates (company_id, body, status) values ($1, 'a12 fixture', 'published') returning id`, [co])).id;
    return (await one(`insert into public.publications (company_id, update_id, destination_id, status, content) values ($1, $2, 'passport', 'published', '{}') returning id`, [co, upd])).id;
  };
  const post = async (title, type, removed) => (await one(`insert into public.posts (publication_id, company_id, title, published_at, post_type, removed_at) values ($1, $2, $3, now() - interval '20 days', $4, $5) returning id`, [await pub(), co, title, type, removed ? new Date() : null])).id;
  const P1 = await post("Release one", "press_release", false), M1 = await post("Media one", "media", false), R1 = await post("Retired release", "press_release", true);
  const ev = (p, u, kind, value, daysAgo = 0) => q(`insert into public.post_events (post_id, user_id, kind, value, created_at) values ($1, $2, $3, $4, now() - ($5 || ' days')::interval)`, [p, u, kind, value, String(daysAgo)]);
  await ev(P1, U.i1, "open", null); await ev(P1, U.i2, "open", null); await ev(P1, U.i1, "open", null, 40);
  await ev(P1, U.i1, "dwell", 4000); await ev(P1, U.i2, "dwell", 8000); await ev(P1, U.i1, "save", null);
  await ev(M1, U.i1, "open", null); await ev(M1, U.i1, "dwell", 2000);
  await ev(R1, U.i1, "open", null);
  await q(`insert into public.post_saves (user_id, company_slug, post_key) values ($1, $3, $4), ($2, $3, $4)`, [U.i1, U.i2, slug, P1]);
  await q(`insert into public.post_likes (user_id, company_slug, post_key) values ($1, $3, $4), ($2, $3, $5), ($1, $3, $6), ($2, $3, 'no-such-post')`, [U.i1, U.i2, slug, P1, M1, R1]);
  await q(`insert into public.company_follows (user_id, company_id, created_at) values ($1, $3, now()), ($2, $3, now() - interval '10 days')`, [U.i1, U.i2, co]);
  ok(true, "throwaway company: 2 live posts (release, media) + 1 retired; opens, dwell (ms), a save press, current saves, likes (incl. retired + orphan), follows");

  console.log("\n  3. 0048 ON THIS DATA (production today) -- the defects");
  await asUser(U.ownerB);
  const t48 = num(await one(`select * from public.company_engagement_totals($1)`, [co]));
  ok(Number(t48.avg_dwell_secs) === 4666.7, `0048 reports avg_dwell_secs = ${t48.avg_dwell_secs} for reads of 4, 8 and 2 seconds (milliseconds shown as seconds)`);
  ok(Number(t48.saves) === 3, `0048 reports saves = ${t48.saves}: 2 currently saved + 1 save press, summed (two different measurements)`);
  ok(Number(t48.reads) === 5, `0048 reports reads = ${t48.reads}, including the retired post's open, which no list on the page can show`);
  await asPostgres();

  console.log("\n  4. PRODUCTION PATH: 0065a, 0065b, 0065c, 0073a, 0073b");
  for (const [name, sql] of [["0065a", strip(M.a)], ["0065b", strip(M.b)], ["0065c (concurrently stripped for the transaction)", noConcurrently(M.c)], ["0073a (concurrently stripped)", noConcurrently(M.ia)], ["0073b", strip(M.ib)], ["0073c", strip(M.ic)]]) {
    const r = await tryq(sql);
    ok(r.ok, `${name} applies over 0048 without error`, r.e);
  }
  eq(await indexes(), ["idx_post_likes_slug_key", "idx_post_saves_slug_key", "idx_ucr_slug_following", "post_events_impression_once"], "all four indexes present");
  const acl = await q(`select proname, array_to_string(proacl, ' ') a from pg_proc where pronamespace = 'public'::regnamespace and proname = any($1)`, [FNS]);
  ok(acl.length === 10 && acl.every((r) => /authenticated=X/.test(r.a) && !/anon=X/.test(r.a) && !/(^|\s)=X\//.test(r.a)), "all ten functions: EXECUTE for authenticated (and owner/service), never anon or PUBLIC");

  console.log("\n  5. EXPECTED NUMBERS (hand-computed from the fixture)");
  await asUser(U.ownerB);
  eq(num(await one(`select * from public.company_engagement_totals($1)`, [co])),
    { views: 0, reads: 4, avg_dwell_secs: 4.7, followers: 2, likes: 2, saves: 2, posts: 2 },
    "totals: live posts only; dwell in SECONDS (4.67 -> 4.7); saves = currently saved (2); no impressions yet");
  const bt = (await q(`select * from public.company_engagement_by_type($1, null) order by post_type`, [co])).map(num);
  eq(bt, [{ post_type: "media", posts: 1, reads: 1, avg_dwell_secs: 2, likes: 1, saves: 0, save_actions: 0 },
          { post_type: "press_release", posts: 1, reads: 3, avg_dwell_secs: 6, likes: 1, saves: 2, save_actions: 1 }],
    "by type, all time: release 3 reads / 6.0 s / 2 saved / 1 save press; media 1 / 2.0 s");
  const bt30 = (await q(`select post_type, reads from public.company_engagement_by_type($1, 30) order by post_type`, [co])).map(num);
  eq(bt30, [{ post_type: "media", reads: 1 }, { post_type: "press_release", reads: 2 }], "by type, 30 days: the 40-day-old open drops out");
  const cp = (await q(`select title, reads, reads_recent, avg_dwell_secs, likes, saves, save_actions from public.company_content_performance($1, 30, 200) order by title`, [co])).map(num);
  eq(cp, [{ title: "Media one", reads: 1, reads_recent: 1, avg_dwell_secs: 2, likes: 1, saves: 0, save_actions: 0 },
          { title: "Release one", reads: 3, reads_recent: 2, avg_dwell_secs: 6, likes: 1, saves: 2, save_actions: 1 }],
    "per item: lifetime vs last 30 days; the retired post is NOT listed");
  ok(cp.reduce((a, r) => a + r.reads, 0) === 4 && bt.reduce((a, r) => a + r.reads, 0) === 4, "identity: sum of the item list = sum of the split = lifetime total (4 reads)");
  eq(num(await one(`select * from public.company_engagement_unattributed($1)`, [co])),
    { retired_posts: 1, retired_reads: 1, retired_likes: 1, retired_saves: 0, orphan_likes: 1, orphan_saves: 0 },
    "unattributed: the retired post's open and like, and the orphan like, reported on their own line");
  const fg = (await q(`select * from public.company_follower_growth($1, 30)`, [co])).map(num);
  ok(fg.reduce((a, r) => a + r.new_followers, 0) === 2 && fg.filter((r) => r.new_followers).length === 2, "follower growth: 2 first follows on 2 different days");
  const daily = (await q(`select * from public.company_engagement_daily($1, 30)`, [co])).map(num);
  ok(daily.length === 30 && daily.reduce((a, r) => a + r.reads, 0) === 3 && daily.every((r) => r.views === 0), "daily (30 UTC days): 3 opens in the window, 0 impressions");
  eq(num(await one(`select * from public.company_impression_summary($1, null)`, [co])), { first_recorded_at: null, impressions: 0, viewers: 0, opens_since: 0 },
    "no impression recorded yet: first_recorded_at NULL, so the portal says 'not recorded' -- not 0%");

  console.log("\n  6. IMPRESSIONS: recording and de-duplication");
  await asUser(U.i1);
  eq((await one(`select public.record_post_impressions($1::uuid[]) n`, [[P1, M1, R1, P1]])).n, 2, "investor 1 sees release, media, a retired post and the release again -> 2 recorded (retired ignored, repeat ignored)");
  eq((await one(`select public.record_post_impressions($1::uuid[]) n`, [[P1]])).n, 0, "the same investor, same post, same UTC day -> 0 (database de-duplication)");
  let r = await tryq(`insert into public.post_events (post_id, user_id, kind) values ($1, $2, 'impression')`, [P1, U.i1]);
  ok(!r.ok && r.code === "42501", "0073c: a client's DIRECT impression insert is refused by policy (impressions only via the function)", r.code);
  r = await tryq(`insert into public.post_events (post_id, user_id, kind, created_at) values ($1, $2, 'open', '2026-01-15T12:00:00Z') returning created_at`, [M1, U.i1]);
  await asPostgres();
  const lastOpen = (await one(`select created_at from public.post_events where post_id = $1 and kind = 'open' order by created_at desc limit 1`, [M1])).created_at;
  ok(Date.now() - new Date(lastOpen).getTime() < 3600e3 && (await one(`select count(*)::int n from public.post_events where post_id = $1 and created_at < '2026-02-01'`, [M1])).n === 0, "0073c: a backdated client insert is stored with created_at = now() (no invented history)");
  await q(`delete from public.post_events where post_id = $1 and kind = 'open' and created_at = $2`, [M1, lastOpen]);   // keep the hand-computed figures exact
  r = await tryq(`insert into public.post_events (post_id, user_id, kind) values ($1, $2, 'impression')`, [P1, U.i1]);
  ok(!r.ok && r.code === "23505", "even the table owner cannot write a same-day duplicate impression (23505, the index)");
  await asUser(U.i1);
  r = await tryq(`select public.record_post_impressions($1::uuid[]) n`, [Array.from({ length: 51 }, () => P1)]);
  ok(!r.ok && r.code === "22023", "more than 50 ids in one call -> refused");
  await asUser(U.i2);
  eq((await one(`select public.record_post_impressions($1::uuid[]) n`, [[P1]])).n, 1, "investor 2, same post -> 1 (one per investor)");
  await asAnon();
  r = await tryq(`select public.record_post_impressions($1::uuid[]) n`, [[P1]]);
  ok(!r.ok && /permission denied/.test(r.e), "anon cannot record impressions");
  await asPostgres();
  await q(`insert into public.post_events (post_id, user_id, kind, created_at) values ($1, $2, 'impression', now() - interval '1 day')`, [P1, U.i1]);
  ok(true, "investor 1 also saw the release YESTERDAY (a different UTC day is a new impression)");

  const first = (await one(`select min(created_at) m from public.post_events where post_id = any($1) and kind = 'impression'`, [[P1, M1, R1]])).m.toISOString();
  await asUser(U.ownerB);
  const sAll = num(await one(`select * from public.company_impression_summary($1, null)`, [co]));
  eq(sAll, { first_recorded_at: first, impressions: 4, viewers: 2, opens_since: 3 }, "summary, all time: recorded since yesterday; 4 impressions by 2 investors; 3 opens since recording began (read rate 3/4 -- the 40-day-old open is NOT counted)");
  eq(num(await one(`select impressions, viewers, opens_since from public.company_impression_summary($1, 1)`, [co])), { impressions: 3, viewers: 2, opens_since: 3 }, "summary, today only: 3 impressions, 2 viewers, 3 opens");
  const pi = Object.fromEntries((await q(`select post_id, impressions, impressions_recent from public.company_post_impressions($1, 1)`, [co])).map((x) => [x.post_id, num(x)]));
  ok(pi[P1].impressions === 3 && pi[P1].impressions_recent === 2 && pi[M1].impressions === 1 && pi[M1].impressions_recent === 1 && !pi[R1], "per post: release 3 lifetime / 2 today, media 1 / 1; retired post not listed");
  ok(Number((await one(`select views from public.company_engagement_totals($1)`, [co])).views) === 4, "0065b's totals now count the de-duplicated impressions (views = 4)");
  ok((await q(`select views from public.company_engagement_daily($1, 30)`, [co])).reduce((a, x) => a + Number(x.views), 0) === 4, "daily views sum to 4 across yesterday and today");

  console.log("\n  7. ACCESS");
  const READERS = [["company_engagement_totals", "$1"], ["company_engagement_by_type", "$1, null"], ["company_content_performance", "$1, 30, 200"], ["company_engagement_unattributed", "$1"], ["company_follower_growth", "$1, 30"], ["company_engagement_daily", "$1, 30"], ["company_impression_summary", "$1, null"], ["company_post_impressions", "$1, 30"]];
  for (const [who, u] of [["viewer member", U.viewer], ["analyst member", U.analyst]]) {
    await asUser(u);
    let all = true; for (const [fn, a] of READERS) { const x = await tryq(`select * from public.${fn}(${a})`, [co]); if (!x.ok) all = false; }
    ok(all, `${who}: every analytics function readable (owns_company admits active members)`);
  }
  for (const [who, u] of [["another company's owner", U.ownerA], ["an investor", U.i1]]) {
    await asUser(u);
    let all = true; for (const [fn, a] of READERS) { const x = await tryq(`select * from public.${fn}(${a})`, [co]); if (x.ok || x.code !== "42501") all = false; }
    ok(all, `${who}: every analytics function refused with 42501`);
  }
  await asAnon();
  { let all = true; for (const [fn, a] of READERS) { const x = await tryq(`select * from public.${fn}(${a})`, [co]); if (x.ok || !/permission denied/.test(x.e)) all = false; } ok(all, "anon: no EXECUTE on any analytics function"); }
  await asPostgres();

  console.log("\n  8. ROLLBACK REHEARSAL (newest first)");
  await q(`savepoint rb`);
  for (const [name, sql] of [["0073c", strip(R.ic)], ["0073b", strip(R.ib)], ["0073a (concurrently stripped)", noConcurrently(R.ia)], ["0065c (concurrently stripped)", noConcurrently(R.c)], ["0065b", strip(R.b)], ["0065a", strip(R.a)]]) {
    const x = await tryq(sql); ok(x.ok, `${name} rollback applies`, x.e);
  }
  ok((await digest()) === D48, "after all rollbacks the analytics functions are byte-for-byte 0048 again (definitions and grants)");
  ok((await policyDef()) === P48 && (await one(`select count(*)::int n from pg_trigger where tgname = 'post_events_client_guard'`)).n === 0, "0073c's rollback restores 0009's insert policy exactly and removes the trigger");
  ok((await indexes()).length === 0, "and the 0065c / 0073a indexes are gone");
  await q(`rollback to savepoint rb`);
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  await c.query("rollback").catch(() => {});
}

console.log("\n  AFTER ROLLBACK (fresh queries)");
await c.query("reset role").catch(() => {});
ok((await digest()) === S0 && (await policyDef()) === P0, "staging's analytics functions and the post_events insert policy are exactly as before");
eq(await indexes(), I0, "staging's indexes are exactly as before");
ok((await one(`select count(*)::int n from public.companies where slug = 'zz-a12-check'`)).n === 0, "the throwaway company and its events did not persist");
await c.end();
console.log(`\n  analytics-0065-0073 (staging, rolled back): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
