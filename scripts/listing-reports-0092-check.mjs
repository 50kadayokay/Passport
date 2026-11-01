// 0092 (listing_reports: INSERT on the app's six columns only), verified on
// STAGING in ONE transaction that is always ROLLED BACK.
//   node scripts/listing-reports-0092-check.mjs
//
// FOR S4 TO RUN (needs supabase/staging/.connection). Inside the transaction:
//   - before 0092 (0077 on staging): a guest CAN set created_at and id (baseline)
//   - 0092 applies: anon and authenticated hold INSERT on exactly
//     company_slug, company_name, kind, message, contact, user_id; nothing on
//     id / created_at; no table-level INSERT; still no SELECT/UPDATE/DELETE
//   - the installed build's report (prod-v1.3.2: anon key, six columns, both
//     kinds, signed out and in) is stored; id and created_at are refused
//   - 0077's policy is byte-for-byte unchanged and still bounds the values;
//     RETURNING is still refused; the service role (/api/submit) still writes
//   - FINDINGS (printed, not failures): bulk arrays and the missing rate limit,
//     which 0092 does not address
//   - the rollback restores the post-0077 grants exactly
// Nothing is committed; prints no secrets and no row contents.
import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";
import { runnerBody } from "./_db-egress.mjs";

const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the staging project."); process.exit(2); }
const MIG = fs.readFileSync("supabase/migrations/0092_listing_reports_column_insert.sql", "utf8");
const RB = fs.readFileSync("supabase/rollbacks/0092_listing_reports_column_insert.rollback.sql", "utf8");

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const findings = [];
const finding = (m) => { findings.push(m); console.log(`  ! FINDING: ${m}`); };
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, a) => (await c.query(s, a)).rows;
const asRole = async (role, uid = null) => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid, role } : { role })]); await c.query(`set local role ${role}`); };
const asPostgres = async () => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', '', true)`); };
// One statement as `role` in a savepoint; a success is kept (the transaction is rolled back at the end).
let sp = 0;
const as = async (role, sql, args, uid = null) => {
  await asRole(role, uid);
  const n = `p${++sp}`; await c.query(`savepoint ${n}`);
  try { const r = await c.query(sql, args); await c.query(`release savepoint ${n}`); return { ok: true, count: r.rowCount }; }
  catch (e) { await c.query(`rollback to savepoint ${n}`); return { ok: false, code: e.code, msg: e.message }; }
  finally { await asPostgres(); }
};
const TAG = `zz-0092-${Date.now().toString(36)}`;
const count = async () => (await q(`select count(*)::int n from public.listing_reports where company_slug like $1`, [`${TAG}%`]))[0].n;
const SIX = ["company_slug", "company_name", "kind", "message", "contact", "user_id"];
const COLS = SIX.join(", ");
const appRow = (o = {}) => [o.slug ?? TAG, o.name ?? "Zz 0092 Check", o.kind ?? "error", o.message ?? "0092 check", o.contact ?? "", o.user ?? null];
const APP_INSERT = `insert into public.listing_reports (${COLS}) values ($1, $2, $3, $4, $5, $6)`;
const WITH_ID = `insert into public.listing_reports (id, ${COLS}) values ($1, $2, $3, $4, $5, $6, $7)`;
const WITH_AT = `insert into public.listing_reports (created_at, ${COLS}) values ($1, $2, $3, $4, $5, $6, $7)`;
const denied = (r) => !r.ok && r.code === "42501";
const OLD = "2001-01-01T00:00:00Z";

const grantState = async () => JSON.stringify({
  table: await q(`select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'listing_reports' and grantee in ('anon', 'authenticated') order by 1, 2`),
  acl: await q(`select a.attname, a.attacl::text acl from pg_attribute a where a.attrelid = 'public.listing_reports'::regclass and a.attnum > 0 and not a.attisdropped and a.attacl is not null order by 1`),
});
const policy = async () => JSON.stringify(await q(`select policyname, cmd, roles::text r, coalesce(qual, '') q, coalesce(with_check, '') w from pg_policies where schemaname = 'public' and tablename = 'listing_reports' order by 1`));
const colPriv = async (role, col) => (await q(`select has_column_privilege($1, 'public.listing_reports', $2, 'INSERT') h`, [role, col]))[0].h;
const tablePriv = async (role, p) => (await q(`select has_table_privilege($1, 'public.listing_reports', $2) h`, [role, p]))[0].h;

const rowsBefore = (await q(`select count(*)::int n from public.listing_reports`))[0].n;
const grantsBeforeRun = await grantState();
await c.query("begin");
try {
  // If 0092 is ever on staging, unwind it inside the transaction first (nothing is committed).
  if (!(await colPriv("anon", "created_at")) && (await colPriv("anon", "company_slug"))) { await q(runnerBody(RB)); console.log("  (0092 was on staging: unwound inside the transaction)"); }
  const S0 = await grantState(), P0 = await policy();
  ok(await tablePriv("anon", "INSERT") && (await colPriv("anon", "created_at")), "before 0092 (0077 on staging): anon holds table-level INSERT");

  console.log("\n  BASELINE (0077)");
  let r = await as("anon", WITH_AT, [OLD, ...appRow({ message: "backdated" })]);
  const r2 = await as("anon", WITH_ID, [crypto.randomUUID(), ...appRow()]);
  ok(r.ok && r2.ok, "under 0077 a guest CAN set created_at (backdate) and id -- the defect", `${r.code || ""} ${r2.code || ""}`);
  await q(`delete from public.listing_reports where company_slug like $1`, [`${TAG}%`]);

  await q(runnerBody(MIG));
  console.log("\n  0092 APPLIED: WHAT EACH ROLE HOLDS");
  for (const role of ["anon", "authenticated"]) {
    const six = await Promise.all(SIX.map((col) => colPriv(role, col)));
    const other = [await colPriv(role, "id"), await colPriv(role, "created_at")];
    ok(six.every(Boolean) && !other.some(Boolean), `${role}: INSERT on the six columns, not on id or created_at`, `six ${six} id/created_at ${other}`);
    const t = await Promise.all(["INSERT", "SELECT", "UPDATE", "DELETE", "TRUNCATE"].map((p) => tablePriv(role, p)));
    ok(!t.some(Boolean), `${role}: no table-level INSERT, SELECT, UPDATE, DELETE or TRUNCATE`, JSON.stringify(t));
  }
  ok((await policy()) === P0, "0077's policy is byte-for-byte unchanged");

  console.log("\n  THE INSTALLED BUILD'S REPORT STILL WORKS");
  r = await as("anon", APP_INSERT, appRow());
  ok(r.ok && (await count()) === 1, "anon, signed out (user_id null), six columns -> stored", r.msg);
  r = await as("anon", APP_INSERT, appRow({ kind: "claim", user: crypto.randomUUID() }));
  ok(r.ok && (await count()) === 2, "anon key + user_id (signed in on 1.3.x), a claim -> stored", r.msg);
  const inv = crypto.randomUUID();
  r = await as("authenticated", APP_INSERT, appRow({ user: inv }), inv);
  ok(r.ok && (await count()) === 3, "authenticated, the same six columns -> stored", r.msg);
  const [{ id: anyId, created_at: at }] = await q(`select id, created_at from public.listing_reports where company_slug = $1 order by created_at limit 1`, [TAG]);
  ok(anyId && new Date(at).getUTCFullYear() >= 2026, "id and created_at take their defaults");
  r = await as("service_role", `insert into public.listing_reports (company_slug, company_name, kind, message, contact) values ($1, 'Zz', 'error', 'via /api/submit', '')`, [TAG]);
  ok(r.ok && (await count()) === 4, "the service role (/api/submit) still writes", r.msg);

  console.log("\n  REFUSED (nothing stored)");
  const n0 = await count();
  for (const role of ["anon", "authenticated"]) {
    const uid = role === "authenticated" ? inv : null;
    r = await as(role, WITH_AT, [OLD, ...appRow({ message: "backdated" })], uid);
    ok(denied(r) && (await count()) === n0, `${role}: created_at -> refused (42501): no backdating`, r.code);
    r = await as(role, WITH_ID, [crypto.randomUUID(), ...appRow()], uid);
    ok(denied(r) && (await count()) === n0, `${role}: id -> refused (42501)`, r.code);
  }
  r = await as("anon", WITH_ID, [anyId, ...appRow()]);
  ok(denied(r), "a duplicate id is refused for the privilege, not answered 23505: the id oracle is gone", r.code);
  r = await as("anon", `${APP_INSERT} returning *`, appRow());
  ok(denied(r) && (await count()) === n0, "RETURNING * -> still refused, nothing stored", r.code);
  r = await as("anon", APP_INSERT, appRow({ message: "x".repeat(4001) }));
  const r3 = await as("anon", APP_INSERT, appRow({ kind: "spam" }));
  ok(denied(r) && denied(r3) && (await count()) === n0, "0077's bounds still apply (message over 4000, an unknown kind)", `${r.code}/${r3.code}`);
  r = await as("anon", `select * from public.listing_reports limit 1`);
  ok(denied(r), "SELECT -> still refused", r.code);

  console.log("\n  FINDINGS: not addressed by 0092");
  const nb = await count();
  for (let i = 0; i < 20; i++) await as("anon", APP_INSERT, appRow({ message: `burst ${i}` }));
  const burst = (await count()) - nb;
  if (burst === 20) finding("still no rate limit on the direct path: 20 of 20 back-to-back anon reports were stored (0057's throttle runs in /api/submit only)");
  else ok(burst < 20, "the burst was throttled", `${burst} of 20 stored`);
  const nm = await count();
  r = await as("anon", `insert into public.listing_reports (${COLS}) select $1, 'Zz', 'error', 'bulk ' || g, '', null from generate_series(1, 200) g`, [TAG]);
  if (r.ok && (await count()) - nm === 200) finding("one request still stores many rows: a 200-row insert went through with only the six columns (a PostgREST JSON array body)");

  console.log("\n  ROLLBACK");
  await q(runnerBody(RB));
  ok((await grantState()) === S0, "the rollback restores the post-0077 grants exactly (table-level INSERT, no column grants)");
  ok((await policy()) === P0, "...and the policy is still 0077's");
  r = await as("anon", WITH_AT, [OLD, ...appRow({ message: "backdated again" })]);
  ok(r.ok, "after the rollback a guest can set created_at again (0077 behaviour)", r.msg);
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  await c.query("rollback").catch(() => {});
}
await c.query("reset role").catch(() => {});
console.log("\n  AFTER ROLLBACK");
ok((await q(`select count(*)::int n from public.listing_reports`))[0].n === rowsBefore && !(await q(`select 1 from public.listing_reports where company_slug like $1`, [`${TAG}%`])).length, "nothing persisted: listing_reports unchanged");
ok((await grantState()) === grantsBeforeRun, "staging's grants are exactly as before the run");
await c.end();
console.log(`\n  listing-reports-0092-check (staging, rolled back): ${pass} passed, ${fail} failed, ${findings.length} findings\n`);
process.exit(fail ? 1 : 0);
