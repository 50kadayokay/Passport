// 0078 (storage role hardening), verified on STAGING in ONE transaction that is
// always ROLLED BACK.   node scripts/storage-role-0078-check.mjs
//
// Each actor is emulated as Supabase does (set local role authenticated +
// request.jwt.claims). INSERT permission: a real insert into storage.objects,
// undone by a savepoint (WITH CHECK is the live policy). DELETE permission:
// Storage's protect_delete trigger cancels every SQL delete, so the LIVE delete
// policy expressions are read from pg_policies and evaluated as the actor,
// together with the actor's SELECT visibility -- the same two conditions Storage
// applies. Runs the matrix before 0078 (the a24 gaps must reproduce), after it
// (closed, legitimate writes still allowed), and after the rollback (policies
// and functions identical to the start).
import fs from "node:fs";
import pg from "pg";
import { runnerBody, scanMigrationSql } from "./_db-egress.mjs";

const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the staging project."); process.exit(2); }
const MIG = fs.readFileSync("supabase/migrations/0078_storage_role_hardening.sql", "utf8");
const RB = fs.readFileSync("supabase/rollbacks/0078_storage_role_hardening.rollback.sql", "utf8");
const rd = (f) => Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const iso = rd("supabase/staging/.isolation-env");

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, a) => (await c.query(s, a)).rows;
const uid = async (k) => (await q(`select id from auth.users where email = $1`, [iso[`ISOLATION_${k}_EMAIL`]]))[0].id;
const U = {};
for (const k of ["COMPANY_A", "COADMIN", "EDITOR", "PUBLISHER", "ANALYST", "STAFF", "COMPANY_B", "INVESTOR", "ADMIN"]) U[k] = await uid(k);
const A = iso.ISOLATION_COMPANY_A_ID;

const asUser = async (id) => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: id, role: "authenticated" })]); await c.query("set local role authenticated"); };
const asPostgres = async () => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', '', true)`); };
let sp = 0;
const canInsert = async (who, bucket, name) => {
  await asUser(U[who]); const n = `p${++sp}`; await c.query(`savepoint ${n}`);
  try { await c.query(`insert into storage.objects (bucket_id, name, owner, owner_id) values ($1, $2, $3::uuid, $3::text)`, [bucket, name, U[who]]); return true; }
  catch { return false; }
  finally { await c.query(`rollback to savepoint ${n}`); await asPostgres(); }
};
const canDelete = async (who, bucket, name) => {
  await asPostgres();
  const quals = (await q(`select qual from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd = 'DELETE' and 'authenticated' = any (roles)`)).map((r) => `(${r.qual})`);
  await asUser(U[who]);
  try { return (await q(`select count(*)::int n from storage.objects where bucket_id = $1 and name = $2 and (${quals.join(" or ") || "false"})`, [bucket, name]))[0].n === 1; }
  finally { await asPostgres(); }
};
const state = async () => JSON.stringify({
  pol: await q(`select policyname, cmd, roles::text r, md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) d from pg_policies where schemaname = 'storage' and tablename = 'objects' order by 1`),
  fn: await q(`select p.oid::regprocedure::text s, md5(pg_get_functiondef(p.oid)) d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'can_upload_company_assets'`),
});

const T = Date.now().toString(36);
const DOC = `${U.COMPANY_A}/${A}/a78-${T}.pdf`, PRIV = `${A}/a78-${T}.png`;
async function matrix(label) {
  const r = {};
  r.ownerPublic = await canInsert("COMPANY_A", "company-media", `${U.COMPANY_A}/a78-${T}.png`);
  r.editorLogo = await canInsert("EDITOR", "company-logos", `${U.EDITOR}/a78-${T}.png`);
  r.adminPublic = await canInsert("ADMIN", "company-media", `${U.ADMIN}/a78-${T}.png`);
  r.investorPublic = await canInsert("INVESTOR", "company-media", `${U.INVESTOR}/a78-${T}.png`);
  r.analystPublic = await canInsert("ANALYST", "company-media", `${U.ANALYST}/a78-${T}.png`);
  r.ownerDocUpload = await canInsert("COMPANY_A", "company-docs", `${U.COMPANY_A}/${A}/a78-${T}-u.pdf`);
  r.publisherDocUpload = await canInsert("PUBLISHER", "company-docs", `${U.PUBLISHER}/${A}/a78-${T}-u.pdf`);
  r.adminDocUpload = await canInsert("ADMIN", "company-docs", `${U.ADMIN}/${A}/a78-${T}-u.pdf`);
  r.investorDocUpload = await canInsert("INVESTOR", "company-docs", `${U.INVESTOR}/a78-${T}.pdf`);
  r.otherCompanyPlant = await canInsert("COMPANY_B", "company-docs", `${U.COMPANY_B}/${A}/a78-${T}.pdf`);
  r.coadminDocDelete = await canDelete("COADMIN", "company-docs", DOC);
  r.editorDocDelete = await canDelete("EDITOR", "company-docs", DOC);
  r.analystDocDelete = await canDelete("ANALYST", "company-docs", DOC);
  r.viewerDocDelete = await canDelete("STAFF", "company-docs", DOC);
  r.otherCompanyDocDelete = await canDelete("COMPANY_B", "company-docs", DOC);
  r.editorPrivWrite = await canInsert("EDITOR", "company-media-private", `${A}/a78-${T}-w.png`);
  r.analystPrivWrite = await canInsert("ANALYST", "company-media-private", `${A}/a78-${T}-w.png`);
  r.otherCompanyPrivWrite = await canInsert("COMPANY_B", "company-media-private", `${A}/a78-${T}-w.png`);
  r.publisherPrivDelete = await canDelete("PUBLISHER", "company-media-private", PRIV);
  r.viewerPrivDelete = await canDelete("STAFF", "company-media-private", PRIV);
  r.otherCompanyPrivDelete = await canDelete("COMPANY_B", "company-media-private", PRIV);
  console.log(`\n  ${label}`);
  return r;
}

console.log("\n  STATIC");
ok(scanMigrationSql(MIG).length === 0 && scanMigrationSql(RB).length === 0, "0078 and its rollback contain no database egress");
const LIVE = await state(); let S0;
try {
  await c.query("begin");
  await c.query("set local lock_timeout = '10s'");
  // 0078 is applied on staging (2026-10-31): unwind it inside this transaction so the
  // BEFORE / AFTER / rollback comparison still starts from the pre-0078 state.
  if ((await q(`select to_regprocedure('public.can_upload_company_assets()') is not null as on`))[0].on) {
    await q(runnerBody(RB));
    ok(true, "0078 already applied here: its rollback runs inside the transaction");
  }
  S0 = await state();
  // Fixture objects + the rows that make them readable (as memory.js / mediaAssets.js create them).
  await q(`insert into storage.objects (bucket_id, name, owner, owner_id) values ('company-docs', $1, $2::uuid, $2::text), ('company-media-private', $3, $4::uuid, $4::text)`, [DOC, U.COMPANY_A, PRIV, U.EDITOR]);
  await q(`insert into public.documents (company_id, storage_path, filename, mime) values ($1, $2, 'a78.pdf', 'application/pdf')`, [A, `company-docs/${DOC}`]);
  await q(`insert into public.media_assets (company_id, storage_path) values ($1, $2)`, [A, `company-media-private/${PRIV}`]);

  let r = await matrix("BEFORE 0078 (staging today): the a24 gaps reproduce");
  ok(r.investorPublic && r.analystPublic, "an investor and an analyst can upload into the PUBLIC bucket (gap)");
  ok(r.investorDocUpload && r.otherCompanyPlant, "an investor can upload to company-docs; company B can plant a file under company A's id (gap)");
  ok(r.analystDocDelete && r.viewerDocDelete, "a read-only analyst and viewer can delete company documents (gap)");
  ok(r.analystPrivWrite && r.viewerPrivDelete, "an analyst can write and a viewer can delete private media (gap)");
  ok(!r.otherCompanyDocDelete && !r.otherCompanyPrivWrite && !r.otherCompanyPrivDelete, "cross-company writes and deletes already refused");

  await q(runnerBody(MIG));
  r = await matrix("AFTER 0078");
  ok(r.ownerPublic && r.editorLogo && r.adminPublic, "owner, editor and platform admin still upload to the public buckets");
  ok(!r.investorPublic && !r.analystPublic, "investors and analysts can no longer upload to the public buckets");
  ok(r.ownerDocUpload && r.publisherDocUpload && r.adminDocUpload, "owner, publisher and platform admin still upload company documents");
  ok(!r.investorDocUpload && !r.otherCompanyPlant, "investors cannot upload documents; company B cannot plant under company A");
  ok(r.coadminDocDelete && r.editorDocDelete, "company admin and editor still delete company documents");
  ok(!r.analystDocDelete && !r.viewerDocDelete && !r.otherCompanyDocDelete, "analyst, viewer and company B cannot delete company documents");
  ok(r.editorPrivWrite && r.publisherPrivDelete, "editor writes and publisher deletes private media");
  ok(!r.analystPrivWrite && !r.viewerPrivDelete && !r.otherCompanyPrivWrite && !r.otherCompanyPrivDelete, "analyst cannot write, viewer cannot delete, company B neither");

  await q(runnerBody(RB));
  ok((await state()) === S0, "the rollback restores every storage policy and function exactly");
  r = await matrix("AFTER ROLLBACK");
  ok(r.investorPublic && r.analystDocDelete, "behaviour is back to the pre-0078 state");
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  await c.query("rollback").catch(() => {});
}
await asPostgres().catch(() => {});
ok((await state()) === LIVE && (await q(`select count(*)::int n from storage.objects where name like $1`, [`%a78-${T}%`]))[0].n === 0, "nothing persisted on staging");
await c.end();
console.log(`\n  storage-role-0078 (staging, rolled back): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
