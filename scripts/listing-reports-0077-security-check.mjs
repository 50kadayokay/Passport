// 0077's anon door on listing_reports, probed for what it lets through, on
// STAGING in ONE transaction that is always ROLLED BACK.
//   node scripts/listing-reports-0077-security-check.mjs
//
// FOR S4 TO RUN (needs supabase/staging/.connection). Complements
// listing-reports-compat-check.mjs (does the installed app still work?) with
// the other question: what ELSE can a guest holding the anon key do?
//   - the installed build's insert (prod-v1.3.2 = store 1.3.1 build 17: anon key,
//     Prefer: return=minimal, six columns) is stored
//   - anon reads nothing back: no SELECT, no RETURNING (PostgREST
//     return=representation), no upsert-update, no UPDATE / DELETE
//   - an over-long value or a column that does not exist is refused
//   - the throttle (0057) lives in /api/submit only: anon cannot touch it, and
//     this path is not throttled -- reported as a FINDING with numbers
//   - FINDINGS (printed, not failures): what the table-level INSERT grant still
//     allows (id, created_at, any user_id, many rows per request)
//   - a candidate fix, tried inside the transaction: a column-level INSERT grant
//     on the six columns the app sends. The installed payload still works and
//     id / created_at are refused.
// Applies 0077 inside the transaction if staging does not have it. Nothing is
// committed; prints no secrets and no row contents.
import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";
import { runnerBody } from "./_db-egress.mjs";

const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the staging project."); process.exit(2); }
const MIG = fs.readFileSync("supabase/migrations/0077_listing_reports_installed_app_compat.sql", "utf8");

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const findings = [];
const finding = (m) => { findings.push(m); console.log(`  ! FINDING: ${m}`); };
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, a) => (await c.query(s, a)).rows;
const asAnon = async () => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: "anon" })]); await c.query("set local role anon"); };
const asPostgres = async () => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', '', true)`); };
// Runs one statement as anon in a savepoint. A success is KEPT (released) so the
// counts below can see it; the whole transaction is rolled back at the end.
let sp = 0;
const anon = async (sql, args) => {
  await asAnon();
  const n = `p${++sp}`; await c.query(`savepoint ${n}`);
  try { const r = await c.query(sql, args); await c.query(`release savepoint ${n}`); return { ok: true, count: r.rowCount, rows: r.rows }; }
  catch (e) { await c.query(`rollback to savepoint ${n}`); return { ok: false, code: e.code, msg: e.message }; }
  finally { await asPostgres(); }
};
const TAG = `zz-0077-${Date.now().toString(36)}`;     // every row this run writes carries it
const count = async () => (await q(`select count(*)::int n from public.listing_reports where company_slug like $1`, [`${TAG}%`]))[0].n;
const COLS = "company_slug, company_name, kind, message, contact, user_id";
// The installed build's body: { company_slug, company_name, kind, message, contact, user_id }.
const appRow = (o = {}) => [o.slug ?? TAG, o.name ?? "Zz 0077 Check", o.kind ?? "error", o.message ?? "0077 security check", o.contact ?? "", o.user ?? null];
const APP_INSERT = `insert into public.listing_reports (${COLS}) values ($1, $2, $3, $4, $5, $6)`;
const denied = (r) => !r.ok && r.code === "42501";

const rowsBefore = (await q(`select count(*)::int n from public.listing_reports`))[0].n;
const throttleBefore = (await q(`select count(*)::int n from public.submission_throttle`))[0].n;
const grantState = async () => JSON.stringify(await q(`select grantee, privilege_type, coalesce(column_name, '*') col from (
    select grantee, privilege_type, null::text column_name from information_schema.role_table_grants where table_schema = 'public' and table_name = 'listing_reports'
    union all select grantee, privilege_type, column_name from information_schema.column_privileges where table_schema = 'public' and table_name = 'listing_reports') g
  where grantee in ('anon', 'authenticated') order by 1, 2, 3`));
const grantsBefore = await grantState();
await c.query("begin");
try {
  const hasAnonPolicy = async () => (await q(`select 1 from pg_policies where schemaname = 'public' and tablename = 'listing_reports' and 'anon' = any(roles)`)).length > 0;
  if (!(await hasAnonPolicy())) { await q(runnerBody(MIG)); console.log("  (0077 is not on staging: applied inside the transaction)"); }
  else console.log("  (0077 is on staging)");

  console.log("\n  WHAT ANON HOLDS");
  const priv = async (role) => Object.fromEntries((await q(`select p, has_table_privilege($1, 'public.listing_reports', p) h from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p`, [role])).map((r) => [r.p, r.h]));
  for (const role of ["anon", "authenticated"]) {
    const p = await priv(role);
    // After 0092 the INSERT is per column (the six the app sends), so the table-level check is false.
    const colIns = (await q(`select has_column_privilege($1, 'public.listing_reports', 'company_slug', 'INSERT') h`, [role]))[0].h;
    ok((p.INSERT || colIns) && Object.entries(p).every(([k, v]) => k === "INSERT" || !v), `${role}: INSERT (table or 0092's columns) and nothing else on listing_reports`, JSON.stringify({ ...p, colIns }));
  }
  const pols = await q(`select policyname, cmd, roles::text r from pg_policies where schemaname = 'public' and tablename = 'listing_reports'`);
  ok(pols.length === 1 && pols[0].cmd === "INSERT", "one policy, INSERT only: no SELECT/UPDATE/DELETE policy exists", JSON.stringify(pols));
  ok((await q(`select 1 from pg_trigger where tgrelid = 'public.listing_reports'::regclass and not tgisinternal`)).length === 0, "no trigger on listing_reports (an insert sets nothing else in motion)");

  console.log("\n  THE INSTALLED BUILD'S REPORT");
  let r = await anon(APP_INSERT, appRow());
  ok(r.ok && r.count === 1 && (await count()) === 1, "signed out (user_id null), as 1.3.x sends it -> stored");
  r = await anon(APP_INSERT, appRow({ kind: "claim", user: crypto.randomUUID() }));
  ok(r.ok && (await count()) === 2, "a claim, signed in (anon key + user_id) -> stored");

  console.log("\n  NOTHING COMES BACK");
  const n0 = await count();
  r = await anon(`select * from public.listing_reports limit 1`);
  ok(denied(r), "SELECT -> refused (42501)", r.code);
  r = await anon(`select count(*) from public.listing_reports`);
  ok(denied(r), "count(*) -> refused (no row-count oracle)", r.code);
  r = await anon(`${APP_INSERT} returning *`, appRow());
  ok(denied(r) && (await count()) === n0, "INSERT ... RETURNING * (PostgREST return=representation) -> refused, nothing stored", r.code);
  r = await anon(`${APP_INSERT} returning id`, appRow());
  ok(denied(r) && (await count()) === n0, "INSERT ... RETURNING id -> refused, nothing stored", r.code);
  const [{ id: known }] = await q(`select id from public.listing_reports where company_slug = $1 limit 1`, [TAG]);
  r = await anon(`insert into public.listing_reports (id, ${COLS}) values ($1, $2, $3, $4, $5, $6, $7) on conflict (id) do update set message = excluded.message`, [known, ...appRow({ message: "overwritten" })]);
  ok(denied(r) && (await q(`select message from public.listing_reports where id = $1`, [known]))[0].message === "0077 security check", "upsert (on conflict do update, PostgREST merge-duplicates) -> refused, the row is unchanged", r.code);
  r = await anon(`update public.listing_reports set message = 'x' where company_slug = $1`, [TAG]);
  const d = await anon(`delete from public.listing_reports where company_slug = $1`, [TAG]);
  ok(denied(r) && denied(d) && (await count()) === n0, "UPDATE and DELETE -> refused", `${r.code}/${d.code}`);
  r = await anon(APP_INSERT, appRow({ kind: "spam" }));
  ok(denied(r) && /row-level security/.test(r.msg) && !r.msg.includes(TAG), "a refusal names the policy, never row data", r.msg);

  console.log("\n  OVER-LONG VALUES AND UNKNOWN COLUMNS ARE REFUSED");
  for (const [label, o, limit] of [["company_slug", { slug: TAG + "x".repeat(121 - TAG.length) }, 120], ["company_name", { name: "x".repeat(201) }, 200], ["message", { message: "x".repeat(4001) }, 4000], ["contact", { contact: "x".repeat(201) }, 200]]) {
    r = await anon(APP_INSERT, appRow(o));
    ok(denied(r), `${label} over ${limit} -> refused`, r.code);
  }
  r = await anon(APP_INSERT, appRow({ slug: TAG + "y".repeat(120 - TAG.length), name: "n".repeat(200), message: "m".repeat(4000), contact: "c".repeat(200) }));
  ok(r.ok, "every field exactly at its ceiling -> stored (the bounds are inclusive, as /api/submit's)");
  r = await anon(APP_INSERT, appRow({ slug: "" }));
  const r2 = await anon(`insert into public.listing_reports (company_name, kind) values ('x', 'error')`);
  ok(denied(r) && !r2.ok, "empty or missing company_slug -> refused", `${r.code}/${r2.code}`);
  r = await anon(`insert into public.listing_reports (${COLS}, status) values ($1, $2, $3, $4, $5, $6, 'approved')`, appRow());
  ok(!r.ok && r.code === "42703", "a column that does not exist (status) -> refused (42703)", r.code);

  console.log("\n  THE THROTTLE (0057)");
  const fn = await anon(`select public.bump_submission_throttle('x', 'listing_report', now())`);
  const tbl = await anon(`select * from public.submission_throttle limit 1`);
  const tins = await anon(`insert into public.submission_throttle (ip_hash, form, window_start) values ('x', 'listing_report', now())`);
  ok(denied(fn) && denied(tbl) && denied(tins), "anon cannot call bump_submission_throttle, read or write submission_throttle", `${fn.code}/${tbl.code}/${tins.code}`);
  const nb = await count();
  for (let i = 0; i < 20; i++) await anon(APP_INSERT, appRow({ message: `burst ${i}` }));
  const burst = (await count()) - nb;
  const throttled = (await q(`select count(*)::int n from public.submission_throttle`))[0].n;
  console.log(`  (burst: ${burst} of 20 back-to-back anon reports stored; throttle rows ${throttleBefore} -> ${throttled})`);
  if (burst === 20 && throttled === throttleBefore) finding("this path is NOT rate limited: 20 of 20 back-to-back anon reports were stored and submission_throttle did not move. 0057's throttle (5 per 10 min) runs only inside /api/submit. 0077 keeps the length and kind bounds, not the rate.");
  else ok(burst < 20, "the burst was throttled", `${burst} stored, throttle rows ${throttleBefore} -> ${throttled}`);

  console.log("\n  FINDINGS: what the table-level INSERT grant still allows");
  const nm = await count();
  r = await anon(`insert into public.listing_reports (${COLS}) select $1, 'Zz', 'error', 'bulk ' || g, '', null from generate_series(1, 200) g`, [TAG]);
  if (r.ok && (await count()) - nm === 200) finding("one request can store many rows: a 200-row insert went through (PostgREST accepts a JSON array body). Only the body size limits it.");
  const old = "2001-01-01T00:00:00Z", chosen = crypto.randomUUID();
  r = await anon(`insert into public.listing_reports (id, created_at, ${COLS}) values ($1, $2, $3, $4, $5, $6, $7, $8)`, [chosen, old, ...appRow({ message: "backdated" })]);
  const got = r.ok ? (await q(`select created_at from public.listing_reports where id = $1`, [chosen]))[0] : null;
  if (got && new Date(got.created_at).toISOString().startsWith("2001-01-01")) finding("anon can set id and created_at: a report was stored backdated to 2001 under an id the caller chose. 1.3.x never sends either column.");
  r = await anon(`insert into public.listing_reports (id, ${COLS}) values ($1, $2, $3, $4, $5, $6, $7)`, [known, ...appRow()]);
  if (!r.ok && r.code === "23505") finding("because id is settable, a duplicate id answers 23505 'already exists': an existence oracle for report ids (UUIDs, so guessing is impractical, but it is a read).");
  const victim = crypto.randomUUID();
  r = await anon(APP_INSERT, appRow({ user: victim, message: "attributed" }));
  if (r.ok) finding("user_id is whatever the caller sends: a guest can attribute a report to any user id. 0077 allows this on purpose (installed builds send the signed-in id with the anon key), so the operator must treat user_id on these rows as unverified.");

  console.log("\n  CANDIDATE FIX, tried in this transaction: INSERT on the app's six columns only");
  await q(`revoke insert on public.listing_reports from anon`);
  await q(`grant insert (${COLS}) on public.listing_reports to anon`);
  r = await anon(APP_INSERT, appRow());
  const r3 = await anon(APP_INSERT, appRow({ kind: "claim", user: crypto.randomUUID() }));
  ok(r.ok && r3.ok, "with a column grant, the installed build's report (both kinds) is still stored");
  r = await anon(`insert into public.listing_reports (id, created_at, ${COLS}) values ($1, $2, $3, $4, $5, $6, $7, $8)`, [crypto.randomUUID(), old, ...appRow()]);
  ok(denied(r), "...and id / created_at are refused (42501): no backdating, no id oracle", r.code);
  r = await anon(`${APP_INSERT} returning *`, appRow());
  ok(denied(r), "...RETURNING is still refused");
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  await c.query("rollback").catch(() => {});
}
await c.query("reset role").catch(() => {});
console.log("\n  AFTER ROLLBACK");
ok((await q(`select count(*)::int n from public.listing_reports`))[0].n === rowsBefore && (await q(`select count(*)::int n from public.submission_throttle`))[0].n === throttleBefore,
  "nothing persisted: listing_reports and submission_throttle row counts unchanged");
ok((await grantState()) === grantsBefore, "grants are exactly as before the run (0077 if applied in-transaction, and the candidate fix, were rolled back)");
await c.end();
console.log(`\n  listing-reports-0077-security (staging, rolled back): ${pass} passed, ${fail} failed, ${findings.length} findings\n`);
process.exit(fail ? 1 : 0);
