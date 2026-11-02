// 0094 (company_follows: UPDATE on user_id, company_id so the installed apps'
// follow() upsert passes the privilege check), verified on STAGING in ONE
// transaction that is always ROLLED BACK.   node scripts/company-follows-0094-check.mjs
//
// FOR S4 TO RUN (needs supabase/staging/.connection and .isolation-env).
// Inside the transaction, with a throwaway published company:
//   - before 0094 (0061a on staging): the installed payload with
//     merge-duplicates is refused (42501); ignore-duplicates is stored
//   - RLS is on and every UPDATE/ALL policy on company_follows is admin-only;
//     0094 refuses to run (55000, nothing granted) when a non-admin UPDATE
//     policy exists
//   - 0094 applies: authenticated holds UPDATE on user_id and company_id only,
//     no table-level UPDATE; anon holds nothing
//   - the installed payload is stored; sent again for an existing follow it is
//     refused 23505 with the row unchanged, exactly as under a full UPDATE grant
//     (production before 0061a)
//   - another user cannot touch the follow (plain UPDATE matches 0 rows; an
//     upsert onto its id is refused by RLS); the owner cannot UPDATE it either
//   - anon gets nothing; unfollow still works
//   - the rollback restores 0061a's grants exactly and the 42501
// The installed request is PostgREST's translation of prod-v1.3.2 lib/feed.js
// follow(): POST { user_id, company_id }, Prefer: resolution=merge-duplicates,
// no on_conflict (so the primary key, id). Nothing is committed; prints no secrets.
import fs from "node:fs";
import pg from "pg";

const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the staging project."); process.exit(2); }
const MIG = fs.readFileSync("supabase/migrations/0094_company_follows_upsert_grant.sql", "utf8");
const RB = fs.readFileSync("supabase/rollbacks/0094_company_follows_upsert_grant.rollback.sql", "utf8");
const strip = (sql) => sql.replace(/^\s*begin;\s*$/gim, "").replace(/^\s*commit;\s*$/gim, "");
const rd = (f) => Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const iso = rd("supabase/staging/.isolation-env");

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, a) => (await c.query(s, a)).rows;

// PostgREST's statements for the two Prefer modes (on_conflict defaults to the primary key).
const MERGE = `insert into public.company_follows (user_id, company_id) values ($1, $2) on conflict (id) do update set user_id = excluded.user_id, company_id = excluded.company_id`;
const IGNORE = `insert into public.company_follows (user_id, company_id) values ($1, $2) on conflict (id) do nothing`;

const grantState = async () => JSON.stringify({
  table: await q(`select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'company_follows' and grantee in ('anon', 'authenticated') order by 1, 2`),
  acl: await q(`select a.attname, a.attacl::text acl from pg_attribute a where a.attrelid = 'public.company_follows'::regclass and a.attnum > 0 and not a.attisdropped and a.attacl is not null order by 1`),
});
const grantsBeforeRun = await grantState();
const followsBefore = (await q(`select count(*)::int n from public.company_follows`))[0].n;

await c.query("begin");
await c.query("select set_config('app.provisioning', 'on', true)");
try {
  const uid = async (k) => (await q(`select id from auth.users where email = $1`, [iso[`ISOLATION_${k}_EMAIL`]]))[0].id;
  const U = {};
  for (const k of ["COMPANY_A", "COMPANY_B", "INVESTOR"]) U[k] = await uid(k);
  const asUser = async (id) => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: id, role: "authenticated" })]); await c.query("set local role authenticated"); };
  const asAnon = async () => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: "anon" })]); await c.query("set local role anon"); };
  const asPostgres = async () => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', '', true)`); };
  let sp = 0;
  const attempt = async (who, sql, args) => {
    if (who === "anon") await asAnon(); else await asUser(U[who]);
    const n = `p${++sp}`; await c.query(`savepoint ${n}`);
    try { const r = await c.query(sql, args); await c.query(`release savepoint ${n}`); return { ok: true, count: r.rowCount }; }
    catch (e) { await c.query(`rollback to savepoint ${n}`); return { ok: false, code: e.code, msg: e.message }; }
    finally { await asPostgres(); }
  };
  const X = (await q(`insert into public.companies (slug, name, owner_id, status, tier) values ($1, 'Zz 0094 Follows', $2, 'published', 'pro') returning id`, [`zz-0094-${Date.now().toString(36)}`, U.COMPANY_A]))[0].id;
  const row = async (u) => (await q(`select id, user_id, company_id, created_at from public.company_follows where user_id = $1 and company_id = $2`, [u, X]))[0] || null;
  const colUpd = async (role, col) => (await q(`select has_column_privilege($1, 'public.company_follows', $2, 'UPDATE') h`, [role, col]))[0].h;
  const tblPriv = async (role, p) => (await q(`select has_table_privilege($1, 'public.company_follows', $2) h`, [role, p]))[0].h;
  const denied = (r) => !r.ok && r.code === "42501";

  // If 0094 is ever on staging, unwind it inside the transaction first (nothing is committed).
  if ((await colUpd("authenticated", "user_id")) && !(await tblPriv("authenticated", "UPDATE"))) { await c.query(strip(RB)); console.log("  (0094 was on staging: unwound inside the transaction)"); }
  const S0 = await grantState();
  ok(!(await tblPriv("authenticated", "UPDATE")) && !(await colUpd("authenticated", "user_id")) && (await tblPriv("authenticated", "INSERT")), "before 0094 (0061a on staging): authenticated has INSERT but no UPDATE");

  console.log("\n  BASELINE (0061a)");
  let r = await attempt("INVESTOR", MERGE, [U.INVESTOR, X]);
  ok(denied(r) && !(await row(U.INVESTOR)), "the installed follow (merge-duplicates) is refused 42501 -- the I12 break", r.code);
  r = await attempt("INVESTOR", IGNORE, [U.INVESTOR, X]);
  ok(r.ok && (await row(U.INVESTOR)), "ignore-duplicates (the current web code) is stored", r.msg);
  await q(`delete from public.company_follows where company_id = $1`, [X]);

  console.log("\n  THE PREMISE: RLS REFUSES EVERY NON-ADMIN UPDATE");
  ok((await q(`select relrowsecurity r from pg_class where oid = 'public.company_follows'::regclass`))[0].r, "RLS is on for company_follows");
  const upd = await q(`select policyname, coalesce(qual, '') qual from pg_policies where schemaname = 'public' and tablename = 'company_follows' and cmd in ('UPDATE', 'ALL') order by 1`);
  ok(upd.every((p) => /^\(?(public\.)?is_admin\(\)\)?$/.test(p.qual)), `every UPDATE/ALL policy is admin-only (${upd.map((p) => `${p.policyname}: ${p.qual}`).join("; ") || "none"})`);
  {
    const n = `p${++sp}`; await c.query(`savepoint ${n}`);
    await q(`create policy zz_0094_probe on public.company_follows for update to authenticated using (user_id = auth.uid())`);
    let refused = null;
    try { await c.query(strip(MIG)); } catch (e) { refused = e; }
    const granted = refused ? false : await colUpd("authenticated", "user_id");
    await c.query(`rollback to savepoint ${n}`);
    ok(refused && refused.code === "55000" && !granted, "0094 refuses to run (55000, nothing granted) if a non-admin UPDATE policy exists", refused ? refused.code : "it ran");
  }

  await c.query(strip(MIG));
  console.log("\n  0094 APPLIED: WHAT EACH ROLE HOLDS");
  ok((await colUpd("authenticated", "user_id")) && (await colUpd("authenticated", "company_id")), "authenticated: UPDATE on user_id and company_id");
  ok(!(await colUpd("authenticated", "id")) && !(await colUpd("authenticated", "created_at")) && !(await tblPriv("authenticated", "UPDATE")), "...and not on id or created_at, and no table-level UPDATE");
  const anonPriv = await Promise.all(["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"].map((p) => tblPriv("anon", p)));
  ok(!anonPriv.some(Boolean) && !(await colUpd("anon", "user_id")), "anon: still nothing", JSON.stringify(anonPriv));

  console.log("\n  THE INSTALLED FOLLOW WORKS");
  r = await attempt("INVESTOR", MERGE, [U.INVESTOR, X]);
  const first = await row(U.INVESTOR);
  ok(r.ok && first, "the installed follow (merge-duplicates) is stored -- 42501 → 201", r.msg);
  r = await attempt("INVESTOR", MERGE, [U.INVESTOR, X]);
  const again = await row(U.INVESTOR);
  ok(!r.ok && r.code === "23505" && JSON.stringify(again) === JSON.stringify(first), "sent again for an existing follow: refused 23505 (unique user_id, company_id), the row unchanged", r.code);
  {
    const n = `p${++sp}`; await c.query(`savepoint ${n}`);
    await q(`grant update on public.company_follows to authenticated`);
    const full = await attempt("INVESTOR", MERGE, [U.INVESTOR, X]);
    await c.query(`rollback to savepoint ${n}`);
    ok(!full.ok && full.code === r.code, "...which is exactly the answer under a full UPDATE grant (production before 0061a)", `${full.code} vs ${r.code}`);
  }

  console.log("\n  NOBODY CAN CHANGE A FOLLOW");
  r = await attempt("COMPANY_B", `update public.company_follows set user_id = $1 where company_id = $2`, [U.COMPANY_B, X]);
  ok(r.ok && r.count === 0, "another user's UPDATE of it matches 0 rows (no non-admin UPDATE policy)", r.msg || `${r.count} rows`);
  r = await attempt("COMPANY_B", `insert into public.company_follows (id, user_id, company_id) values ($1, $2, $3) on conflict (id) do update set user_id = excluded.user_id, company_id = excluded.company_id`, [first.id, U.COMPANY_B, X]);
  ok(denied(r), "another user's upsert onto its id is refused by RLS (42501)", r.code);
  r = await attempt("INVESTOR", `update public.company_follows set company_id = company_id where user_id = $1`, [U.INVESTOR]);
  ok(r.ok && r.count === 0, "the follower's own UPDATE matches 0 rows too", r.msg || `${r.count} rows`);
  ok(JSON.stringify(await row(U.INVESTOR)) === JSON.stringify(first) && !(await row(U.COMPANY_B)), "the follow is unchanged and nothing was created for the other user");
  for (const [label, sql, args] of [["the installed follow", MERGE, [U.INVESTOR, X]], ["SELECT", `select * from public.company_follows limit 1`, []], ["UPDATE", `update public.company_follows set company_id = company_id`, []]]) {
    r = await attempt("anon", sql, args);
    ok(denied(r), `anon: ${label} → refused (42501)`, r.code);
  }
  r = await attempt("INVESTOR", `delete from public.company_follows where user_id = $1 and company_id = $2`, [U.INVESTOR, X]);
  ok(r.ok && r.count === 1 && !(await row(U.INVESTOR)), "unfollow (DELETE) still works", r.msg);

  console.log("\n  ROLLBACK");
  await c.query(strip(RB));
  ok((await grantState()) === S0, "the rollback restores 0061a's grants exactly");
  r = await attempt("INVESTOR", MERGE, [U.INVESTOR, X]);
  ok(denied(r), "...and the installed follow is refused again (42501)", r.code);
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  await c.query("rollback").catch(() => {});
}
await c.query("reset role").catch(() => {});
console.log("\n  AFTER ROLLBACK");
ok((await q(`select count(*)::int n from public.company_follows`))[0].n === followsBefore && !(await q(`select 1 from public.companies where slug like 'zz-0094-%'`)).length, "nothing persisted: no throwaway company, follows unchanged");
ok((await grantState()) === grantsBeforeRun, "staging's grants are exactly as before the run");
await c.end();
console.log(`\n  company-follows-0094-check (staging, rolled back): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
