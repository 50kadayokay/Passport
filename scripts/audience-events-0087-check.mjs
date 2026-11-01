// 0087 (a13 audience events), verified on STAGING in ONE transaction that is
// always ROLLED BACK.   node scripts/audience-events-0087-check.mjs
//
// FOR S4 TO RUN (needs supabase/staging/.connection and .isolation-env).
// Applies 0087 inside the transaction (company A is marked published and one of
// its live posts given a test media URL, both rolled back), then:
//   - anon with a device id records a view; a second view the same day is not counted
//   - a malformed device id, an unknown / unpublished company, a bad kind are skipped
//   - a signed-in investor is recorded as themselves (visitor from auth.uid(),
//     a client-sent device id ignored)
//   - video milestones: by media URL, once per visitor/post/milestone/day,
//     non-milestones skipped, another company's post never matched
//   - shares capped at 20 per visitor/company/day; > 20 events per call refused
//   - nobody but a platform admin can read the table; anon/clients cannot write it
//   - summary/progress readers: members of A only; figures match what was recorded
//   - the rollback removes everything
import fs from "node:fs";
import pg from "pg";

const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the staging project."); process.exit(2); }
const MIG = fs.readFileSync("supabase/migrations/0087_audience_events.sql", "utf8");
const RB = fs.readFileSync("supabase/rollbacks/0087_audience_events.rollback.sql", "utf8");
const strip = (sql) => sql.replace(/^\s*begin;\s*$/gim, "").replace(/^\s*commit;\s*$/gim, "");
const rd = (f) => Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const iso = rd("supabase/staging/.isolation-env");

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, a) => (await c.query(s, a)).rows;

await c.query("begin");
try {
  const uid = async (k) => (await q(`select id from auth.users where email = $1`, [iso[`ISOLATION_${k}_EMAIL`]]))[0].id;
  const U = {};
  for (const k of ["COMPANY_A", "STAFF", "COMPANY_B", "INVESTOR", "ADMIN"]) U[k] = await uid(k);
  const A = iso.ISOLATION_COMPANY_A_ID;
  const B = iso.ISOLATION_COMPANY_B_ID;
  const slugA = (await q(`select slug from public.companies where id = $1`, [A]))[0].slug;

  const asUser = async (id) => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: id, role: "authenticated" })]); await c.query("set local role authenticated"); };
  const asAnon = async () => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: "anon" })]); await c.query("set local role anon"); };
  const asPostgres = async () => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', '', true)`); };
  let sp = 0;
  const attempt = async (who, sql, args) => {
    if (who === "anon") await asAnon(); else await asUser(U[who]);
    const n = `p${++sp}`; await c.query(`savepoint ${n}`);
    try { const r = await c.query(sql, args); await c.query(`release savepoint ${n}`); return { ok: true, rows: r.rows }; }
    catch (e) { await c.query(`rollback to savepoint ${n}`); return { ok: false, code: e.code, msg: e.message }; }
    finally { await asPostgres(); }
  };
  const rec = async (who, events) => {
    const r = await attempt(who, `select public.record_company_events($1::jsonb) n`, [JSON.stringify(events)]);
    return r.ok ? r.rows[0].n : r;
  };

  ok((await q(`select to_regclass('public.company_events') t`))[0].t === null, "0087 not present before the check");
  await c.query(strip(MIG));
  ok(true, "0087 applies inside the transaction");
  await q(`update public.companies set status = 'published' where id = $1`, [A]);
  const post = (await q(`select id from public.posts where company_id = $1 and removed_at is null limit 1`, [A]))[0];
  const MEDIA = `https://example.test/a13-${Date.now()}.mp4`;
  if (post) await q(`update public.posts set media_url = $2 where id = $1`, [post.id, MEDIA]);
  const D1 = "dev1aaaaaaaaaaaaaaaa", D2 = "dev2bbbbbbbbbbbbbbbb";

  ok(await rec("anon", [{ k: "profile_view", c: slugA, v: D1 }]) === 1, "anon (device id) records a profile view");
  ok(await rec("anon", [{ k: "profile_view", c: slugA, v: D1 }]) === 0, "same device, same day -> not counted again");
  ok(await rec("anon", [{ k: "profile_view", c: A, v: D2 }]) === 1, "a second device, company by id -> counted");
  ok(await rec("anon", [{ k: "profile_view", c: slugA, v: "short" }, { k: "profile_view", c: slugA }]) === 0, "malformed or missing device id -> skipped");
  ok(await rec("anon", [{ k: "profile_view", c: "no-such-company-a13", v: D1 }, { k: "rating", c: slugA, v: D1 }, "junk", null]) === 0, "unknown company, unknown kind, junk items -> skipped, no error");
  const unpublished = (await q(`select slug from public.companies where status <> 'published' and slug is not null limit 1`))[0];
  if (unpublished) ok(await rec("anon", [{ k: "profile_view", c: unpublished.slug, v: D1 }]) === 0, "an unpublished company -> skipped");
  ok(await rec("INVESTOR", [{ k: "profile_view", c: slugA, v: D1 }]) === 1, "signed-in investor recorded as themselves");
  const inv = await q(`select visitor, user_id from public.company_events where company_id = $1 and user_id = $2`, [A, U.INVESTOR]);
  ok(inv.length === 1 && inv[0].visitor === `u:${U.INVESTOR}`, "visitor comes from auth.uid(); the client's device id is ignored");

  if (post) {
    const evs = [25, 50, 75, 100, 33].map((n) => ({ k: "video_progress", c: slugA, m: MEDIA, n: String(n), v: D1 }));
    ok(await rec("anon", evs) === 4, "video milestones by media URL: 4 recorded, 33 % skipped");
    ok(await rec("anon", evs) === 0, "the same milestones again the same day -> none");
    ok(await rec("anon", [{ k: "video_progress", c: slugA, n: "25", v: D1 }]) === 0, "video without a post -> skipped");
    const bSlug = (await q(`select slug from public.companies where id = $1`, [B]))[0].slug;
    await q(`update public.companies set status = 'published' where id = $1`, [B]);
    ok(await rec("anon", [{ k: "video_progress", c: bSlug, m: MEDIA, n: "25", v: D1 }, { k: "video_progress", c: bSlug, p: post.id, n: "25", v: D1 }]) === 0, "another company's post is never matched");
  } else console.log("  (company A has no live post: video assertions skipped)");

  ok(await rec("anon", Array.from({ length: 20 }, () => ({ k: "share", c: slugA, v: D2, d: "sheet" }))) === 20, "20 shares in a call are recorded");
  ok(await rec("anon", [{ k: "share", c: slugA, v: D2, d: "copy" }]) === 0, "the 21st share by that visitor today -> skipped");
  const big = await rec("anon", Array.from({ length: 21 }, () => ({ k: "share", c: slugA, v: D1 })));
  ok(big && big.ok === false && big.code === "22023", "more than 20 events in one call -> refused");

  for (const who of ["anon", "COMPANY_A", "INVESTOR"]) {
    const r = await attempt(who, `insert into public.company_events (company_id, kind, visitor) values ($1, 'profile_view', 'a:forgedforgedforged')`, [A]);
    ok(!r.ok, `${who} cannot insert directly`);
  }
  for (const [who, n] of [["COMPANY_A", 0], ["INVESTOR", 0], ["ADMIN", -1]]) {
    const r = await attempt(who, `select count(*)::int n from public.company_events where company_id = $1`, [A]);
    ok(r.ok && (n === -1 ? r.rows[0].n > 0 : r.rows[0].n === n), `${who} ${n === -1 ? "reads raw events (platform admin)" : "reads no raw events"}`, JSON.stringify(r));
  }
  ok(!(await attempt("anon", `select 1 from public.company_events limit 1`)).ok, "anon cannot read the table");

  const SUM = `select * from public.company_audience_summary($1, null)`;
  const s = await attempt("STAFF", SUM, [A]);
  ok(s.ok && Number(s.rows[0].profile_views) === 3 && Number(s.rows[0].unique_visitors) === 3 && Number(s.rows[0].signed_in_visitors) === 1 && Number(s.rows[0].shares) === 20,
    "a member (viewer) reads the summary: 3 views, 3 visitors (1 signed in), 20 shares", JSON.stringify(s.rows && s.rows[0]));
  if (post) ok(Number(s.rows[0].video_viewers) === 1 && Number(s.rows[0].video_completions) === 1, "video viewers 1, completions 1");
  for (const who of ["COMPANY_B", "INVESTOR"]) {
    const r = await attempt(who, SUM, [A]);
    ok(!r.ok && r.code === "42501", `${who} cannot read A's summary`);
  }
  ok(!(await attempt("anon", SUM, [A])).ok, "anon cannot read the summary");
  if (post) {
    const v = await attempt("COMPANY_A", `select * from public.company_video_progress($1, 30)`, [A]);
    ok(v.ok && v.rows.length === 1 && v.rows[0].post_id === post.id && Number(v.rows[0].reached_100) === 1, "per-video progress for the owner");
  }
  const none = await attempt("COMPANY_A", `select * from public.company_audience_summary($1, 7)`, [A]);
  ok(none.ok && none.rows.length === 1, "always exactly one summary row");

  await c.query(strip(RB));
  const after = await q(`select to_regclass('public.company_events') t, (select count(*)::int from pg_proc where pronamespace = 'public'::regnamespace and proname in ('record_company_events','company_audience_summary','company_video_progress')) f`);
  ok(after[0].t === null && after[0].f === 0, "rollback removes the table and all three functions");
} catch (e) {
  fail++; console.error(`  ✗ unexpected: ${e.message}`);
} finally {
  await c.query("rollback");
  await c.end();
}
console.log(`\n  ${pass} passed, ${fail} failed (transaction ROLLED BACK)\n`);
process.exit(fail ? 1 : 0);
