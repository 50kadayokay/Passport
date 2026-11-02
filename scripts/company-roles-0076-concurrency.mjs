// a03 · 0076 membership compare-and-set under GENUINELY SEPARATE, CONCURRENT
// transactions (STAGING only, BEFORE 0076 is applied).
//   node scripts/company-roles-0076-concurrency.mjs
//
// The rolled-back check runs every call inside one transaction, where now() is
// constant and nothing is concurrent. This one opens several connections and
// races real transactions against each other.
//
// HOW, without applying 0076: each connection loads 0076's OWN text of
// grantable_roles, change_member_role and remove_member -- extracted from the
// migration file, unchanged except the schema (pg_temp, so the functions exist
// only for that session and vanish at disconnect). They run against the real
// company_memberships table and its real 0006 touch trigger.
//
// WHAT IT WRITES: one throwaway company ("zz-a03-cas-<run>") with memberships
// for fixture users, committed so the other transactions can see each change;
// deleted at the end (memberships, invitations and audit rows cascade). No
// existing company, membership or snapshot is touched. Prints no secrets.
import fs from "node:fs";
import pg from "pg";

const url = (process.env.STAGING_DATABASE_URL || fs.readFileSync("supabase/staging/.connection", "utf8")).trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the allowlisted staging project."); process.exit(2); }
const env = Object.fromEntries(fs.readFileSync("supabase/staging/.isolation-env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const MIG = fs.readFileSync("supabase/migrations/0076_company_roles.sql", "utf8");

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

// 0076's own function text, retargeted to pg_temp.
const fnText = (name) => {
  const i = MIG.indexOf(`create or replace function public.${name}(`);
  if (i < 0) throw new Error(`${name} not found in 0076`);
  const end = MIG.indexOf("$$;", MIG.indexOf("$$", MIG.indexOf("as $$", i) + 5)) + 3;
  return MIG.slice(i, end).replaceAll("public.grantable_roles(", "pg_temp.grantable_roles(").replace(`public.${name}(`, `pg_temp.${name}(`);
};
const FNS = ["grantable_roles", "change_member_role", "remove_member"].map(fnText);

const connect = async () => {
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  if (!(await c.query(`select current_database()`)).rows[0]) throw new Error("no db");
  for (const f of FNS) await c.query(f);
  return c;
};
const as = (c, uid) => c.query(`select set_config('request.jwt.claims', $1, false), set_config('request.jwt.claim.sub', $2, false)`, [JSON.stringify({ sub: uid, role: "authenticated" }), uid]);

const main = await connect();
const q = async (s, a) => (await main.query(s, a)).rows;
const one = async (s, a) => (await q(s, a))[0];
if ((await one(`select count(*)::int n from information_schema.columns where table_schema='public' and table_name='company_invitations' and column_name='kind'`)).n) {
  console.error("  0076 is applied: test the real functions over the API instead."); process.exit(4);
}
const uid = async (k) => (await one(`select id from auth.users where email = $1`, [env[`ISOLATION_${k}_EMAIL`]])).id;
const U = { owner: await uid("COMPANY_A"), admin: await uid("COADMIN"), editor: await uid("EDITOR"), publisher: await uid("PUBLISHER"), analyst: await uid("ANALYST"), viewer: await uid("STAFF") };
const SLUG = `zz-a03-cas-${Date.now().toString(36)}`;
const versionsBefore = (await one(`select count(*)::int n from public.company_profile_versions where company_id = $1`, [env.ISOLATION_COMPANY_A_ID])).n;

let X = null;
const conns = [];
try {
  X = (await one(`insert into public.companies (slug, name, owner_id, status) values ($1, 'A03 CAS race', $2, 'draft') returning id`, [SLUG, U.owner])).id;
  for (const [k, role] of [["admin", "admin"], ["editor", "editor"], ["publisher", "publisher"], ["analyst", "analyst"], ["viewer", "viewer"]]) {
    await q(`insert into public.company_memberships (company_id, user_id, role, status) values ($1, $2, $3, 'active')`, [X, U[k], role]);
  }
  ok((await one(`select role from public.company_memberships where company_id = $1 and user_id = $2`, [X, U.owner]))?.role === "owner", `throwaway company ${SLUG} with an owner and five members (committed)`);
  const ver = async (u) => (await one(`select updated_at::text v from public.company_memberships where company_id = $1 and user_id = $2`, [X, u])).v;
  const role = async (u) => (await one(`select role, status from public.company_memberships where company_id = $1 and user_id = $2`, [X, u]));
  const settled = (p) => Promise.race([p.then(() => true, () => true), new Promise((r) => setTimeout(() => r(false), 700))]);

  for (let i = 0; i < 6; i++) conns.push(await connect());
  const [c1, c2] = conns;
  await as(c1, U.owner); await as(c2, U.admin);
  const call = (c, sql, args) => c.query(sql, args).then((r) => r.rows[0].j);
  const CHG = `select pg_temp.change_member_role($1, $2, $3, $4) j`, RM = `select pg_temp.remove_member($1, $2, $3) j`;

  console.log("\n  1. TWO MANAGERS, SAME VIEW, OVERLAPPING TRANSACTIONS (first commits)");
  {
    const v = await ver(U.editor);
    await c1.query("begin"); await c2.query("begin");
    const r1 = await call(c1, CHG, [X, U.editor, "publisher", v]);
    const p2 = call(c2, CHG, [X, U.editor, "analyst", v]);           // same row: must WAIT on c1's row lock
    const blocked = !(await settled(p2));
    await c1.query("commit");
    const r2 = await p2; await c2.query("commit");
    const now = await role(U.editor);
    ok(r1.ok && r1.role === "publisher", "owner's change succeeds in its transaction");
    ok(blocked, "the admin's concurrent change WAITED for the owner's transaction (row lock, FOR UPDATE)");
    ok(r2.ok === false && r2.error === "stale" && r2.role === "publisher", "...and once it commits, the admin's change is refused as STALE (sees the new role)", JSON.stringify(r2));
    ok(now.role === "publisher", "final role is the first writer's; nothing silently overwritten");
    ok(r1.updated_at && r1.updated_at !== v && (await ver(U.editor)) !== v, "the version moved, and the returned version is the stored one");
  }

  console.log("\n  2. SAME RACE, BUT THE FIRST TRANSACTION ROLLS BACK");
  {
    const v = await ver(U.editor);
    await c1.query("begin"); await c2.query("begin");
    const r1 = await call(c1, CHG, [X, U.editor, "viewer", v]);
    const p2 = call(c2, CHG, [X, U.editor, "analyst", v]);
    const blocked = !(await settled(p2));
    await c1.query("rollback");
    const r2 = await p2; await c2.query("commit");
    ok(r1.ok && blocked && r2.ok && r2.role === "analyst" && (await role(U.editor)).role === "analyst",
       "the waiter proceeds against the unchanged version and wins; the rolled-back change left no trace", JSON.stringify({ r1, r2 }));
  }

  console.log("\n  3. REMOVE vs CHANGE RACE");
  {
    const v = await ver(U.analyst);
    await c1.query("begin"); await c2.query("begin");
    const r1 = await call(c1, RM, [X, U.analyst, v]);
    const p2 = call(c2, CHG, [X, U.analyst, "editor", v]);
    const blocked = !(await settled(p2));
    await c1.query("commit");
    const r2 = await p2; await c2.query("commit");
    const now = await role(U.analyst);
    ok(r1.ok && blocked && r2.ok === false && r2.error === "not_found" && now.status === "removed" && now.role === "analyst",
       "removal wins; the concurrent role change cannot resurrect or re-role the removed member", JSON.stringify({ r2, now }));
  }

  console.log("\n  4. SIX CONCURRENT CHANGES FROM ONE VIEW (separate connections)");
  {
    const v = await ver(U.viewer);
    for (const c of conns) await as(c, U.owner);
    const targets = ["editor", "publisher", "analyst", "admin", "editor", "publisher"];
    await Promise.all(conns.map((c) => c.query("begin")));
    const rs = await Promise.all(conns.map((c, i) => call(c, CHG, [X, U.viewer, targets[i], v]).then(async (r) => { await c.query("commit"); return r; })));
    const winners = rs.filter((r) => r.ok), stale = rs.filter((r) => r.error === "stale");
    const now = await role(U.viewer);
    ok(winners.length === 1 && stale.length === 5, `exactly one of six concurrent changes wins, five are refused as stale (${winners.length} ok, ${stale.length} stale)`, JSON.stringify(rs));
    ok(winners[0] && now.role === winners[0].role, `the stored role is the winner's (${now.role}); no lost or interleaved update`);
    const audit = (await one(`select count(*)::int n from public.activity_log where company_id = $1 and action = 'member_role_changed' and old_value->>'user_id' = $2`, [X, U.viewer])).n;
    ok(audit === 1, "exactly one audit row for the one change that happened");
  }

  console.log("\n  5. LAST OWNER UNDER CONCURRENCY");
  {
    // Owners are never grantable, so both of these must be refused regardless
    // of interleaving; checked concurrently anyway.
    await as(c1, U.admin); await as(c2, U.admin);
    const vO = await ver(U.owner);
    const [a, b] = await Promise.all([call(c1, CHG, [X, U.owner, "viewer", vO]), call(c2, RM, [X, U.owner, vO])]);
    ok(a.error === "account_owner" && b.error === "account_owner" && (await role(U.owner)).role === "owner", "concurrent demote + remove of the owner: both refused, owner intact");
  }
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  for (const c of conns) { await c.query("rollback").catch(() => {}); await c.end().catch(() => {}); }
  if (X) await main.query(`delete from public.companies where id = $1`, [X]).catch((e) => ok(false, "cleanup", e.message));
  const left = X ? (await one(`select (select count(*) from public.companies where id = $1) + (select count(*) from public.company_memberships where company_id = $1) + (select count(*) from public.activity_log where company_id = $1) n`, [X])).n : 0;
  ok(Number(left) === 0, "cleanup: the throwaway company, its memberships and audit rows are gone");
  ok((await one(`select count(*)::int n from public.company_profile_versions where company_id = $1`, [env.ISOLATION_COMPANY_A_ID])).n === versionsBefore, `company A's protected snapshots untouched (${versionsBefore})`);
  ok((await one(`select count(*)::int n from pg_proc where proname in ('change_member_role','remove_member','grantable_roles') and pronamespace = 'public'::regnamespace`)).n === 0, "nothing of 0076 exists in public (pg_temp copies only; 0076 still unapplied)");
  await main.end();
}
console.log(`\n  company-roles-0076-concurrency (staging, separate transactions): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
