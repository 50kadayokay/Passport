// Messaging against BOTH conversation schemas, on the real STAGING database,
// in ONE transaction that is always ROLLED BACK.
//   node scripts/messaging-schema-compat-check.mjs
//
// POST-0063 is staging as it is. PRE-0063 (production today: the full
// unique (investor_id, company_slug) constraint, no sender_company_id) is
// reconstructed inside the transaction by applying 0078's and 0076's rollback files and
// 0063's documented rollback, then dropping sender_company_id.
//
// On each schema it runs, as the service role, the exact database operations
// of the CURRENT messaging code (api/messages.js findOrCreateThread +
// insertMessageOnce + the company-start probe) and of the SHIPPED server code
// (prod-v1.3.2: an upsert on (investor_id, company_slug)). Expected:
//   current code  -> works on both schemas (deploy-first is safe);
//   shipped code  -> works before 0063, fails with 42P10 after it (so 0063 must
//                    never be applied before the current API is deployed).
import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";
import { runnerBody } from "./_db-egress.mjs";

const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the staging project."); process.exit(2); }
const RB76 = fs.readFileSync("supabase/rollbacks/0076_company_roles.rollback.sql", "utf8");
// Everything applied to staging AFTER 0076 unwinds first, newest first: later
// migrations (0078, 0086, ...) build on 0076's has_company_role, and dropping it
// under them fails. Taken from the migrations folder, so a new one is included.
const AFTER76 = fs.readdirSync("supabase/migrations").filter((f) => /^\d{4}[a-z]?_.*\.sql$/.test(f) && f > "0076_company_roles.sql" && !f.startsWith("0055"))
  .sort().reverse().map((f) => `supabase/rollbacks/${f.replace(/\.sql$/, ".rollback.sql")}`)
  .map((p) => { if (!fs.existsSync(p)) { console.error(`  missing rollback: ${p}`); process.exit(3); } return fs.readFileSync(p, "utf8"); });
const m63 = fs.readFileSync("supabase/migrations/0063_company_initiated_threads.sql", "utf8");
const RB63 = runnerBody("begin;\n" + m63.slice(m63.indexOf("-- ROLLBACK.")).split("\n").filter((l) => /^-- (?!--)/.test(l) && !/^-- (ROLLBACK|Restores|their sender|it is what|=+)/.test(l)).map((l) => l.slice(3)).filter((l) => !/^(begin|commit);/.test(l.trim())).join("\n") + "\ncommit;");

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, a) => (await c.query(s, a)).rows;
let sp = 0;
const tryq = async (sql, args) => { const n = `t${++sp}`; await c.query(`savepoint ${n}`); try { const r = await c.query(sql, args); await c.query(`release savepoint ${n}`); return { ok: true, rows: r.rows }; } catch (e) { await c.query(`rollback to savepoint ${n}`); return { ok: false, code: e.code, e: e.message }; } };
const asService = async () => { await c.query("reset role"); await c.query("set local role service_role"); };
const asPostgres = async () => { await c.query("reset role"); };

const investor = (await q(`select id from auth.users where email like 'iso-investor@%' limit 1`))[0].id;
const slug = (await q(`select slug from public.companies where status = 'published' order by created_at limit 1`))[0].slug;
const convsBefore = (await q(`select count(*)::int n from public.conversations`))[0].n;

// The CURRENT server code's database operations, in order.
async function currentCode(label, slugToUse) {
  const find = async () => (await q(`select * from public.conversations where investor_id = $1 and company_slug = $2 order by created_at asc`, [investor, slugToUse])).find((r) => r.sender_company_id == null) || null;
  const insert = () => tryq(`insert into public.conversations (investor_id, company_slug, company_name, ceo_email) values ($1, $2, 'Compat', null) returning *`, [investor, slugToUse]);
  // 1) first send: find (none) -> insert -> created
  let conv = await find();
  const created = !conv;
  if (!conv) { const r = await insert(); conv = r.ok ? r.rows[0] : await find(); }
  ok(created && conv && conv.id, `${label}: first send finds no thread and creates one`);
  // 2) second send: find -> reuse
  const again = await find();
  ok(again && again.id === conv.id, `${label}: second send reuses the same thread`);
  // 3) a concurrent sender's insert loses the race -> unique violation -> re-find returns the stored thread
  const lost = await insert();
  const recovered = await find();
  ok(!lost.ok && lost.code === "23505" && recovered.id === conv.id, `${label}: a racing insert hits the unique key (23505) and the code returns the stored thread`, `${lost.code}`);
  // 4) message stored once with a client idempotency key; a replay is refused and the prior row is found
  const key = `client:${conv.id}:${crypto.randomUUID()}`;
  const m1 = await tryq(`insert into public.messages (conversation_id, sender, body, email_id) values ($1, 'investor', 'compat', $2) returning id`, [conv.id, key]);
  const m2 = await tryq(`insert into public.messages (conversation_id, sender, body, email_id) values ($1, 'investor', 'compat', $2) returning id`, [conv.id, key]);
  const prior = await q(`select id from public.messages where email_id = $1`, [key]);
  ok(m1.ok && !m2.ok && m2.code === "23505" && prior.length === 1, `${label}: message stored once; a retry with the same key is refused and the stored one found`, `${m2.code}`);
  // 5) the company-start probe (select sender_company_id)
  const probe = await tryq(`select sender_company_id from public.conversations limit 0`);
  return probe;
}

try {
  await c.query("begin");

  // 0096 (right after 0063) brings the full constraint back for the old code.
  const post96 = (await q(`select count(*)::int n from information_schema.columns where table_schema='public' and table_name='conversations' and column_name='started_by'`))[0].n === 1;
  console.log(`\n  POST-${post96 ? "0096" : "0063"} (staging as it is)`);
  await asService();
  await q(`delete from public.conversations where investor_id = $1 and company_slug = $2 and sender_company_id is null`, [investor, slug]);   // inside the rolled-back txn: start from "no thread yet"
  let probe = await currentCode(`current code, post-${post96 ? "0096" : "0063"}`, slug);
  ok(probe.ok, "the company-start probe finds sender_company_id (company threads enabled)");
  let old = await tryq(`insert into public.conversations (investor_id, company_slug, company_name) values ($1, $2, 'Old API') on conflict (investor_id, company_slug) do update set company_name = excluded.company_name returning id`, [investor, `${slug}`]);
  if (post96) ok(old.ok, "SHIPPED server code (upsert on investor_id, company_slug) WORKS after 0096 (mineex.ca/app keeps messaging)", old.code);
  else ok(!old.ok && old.code === "42P10", "SHIPPED server code (upsert on investor_id, company_slug) FAILS on post-0063 with 42P10 -> 0096 must follow 0063", old.code);

  console.log("\n  PRE-0063 (production today; reconstructed in this transaction)");
  await asPostgres();
  for (const rb of AFTER76) await q(runnerBody(rb));
  await q(runnerBody(RB76));
  await q(RB63);
  await q(`alter table public.conversations drop column sender_company_id`);
  const hasCol = (await q(`select count(*)::int n from information_schema.columns where table_schema='public' and table_name='conversations' and column_name='sender_company_id'`))[0].n;
  const hasKey = (await q(`select count(*)::int n from pg_constraint where conname = 'conversations_investor_id_company_slug_key'`))[0].n;
  ok(hasCol === 0 && hasKey === 1, "schema reconstructed: no sender_company_id, full unique (investor_id, company_slug) constraint");
  await asService();
  const slug2 = (await q(`select slug from public.companies where status = 'published' order by created_at desc limit 1`))[0].slug;
  await q(`delete from public.conversations where investor_id = $1 and company_slug = $2`, [investor, slug2]);   // inside the rolled-back txn
  probe = await currentCode("current code, pre-0063", slug2);
  ok(!probe.ok && probe.code === "42703", "pre-0063: the company-start probe fails cleanly (column absent) -> the route answers 503 'company-threads-unavailable'", probe.code);
  old = await tryq(`insert into public.conversations (investor_id, company_slug, company_name) values ($1, $2, 'Old API') on conflict (investor_id, company_slug) do update set company_name = excluded.company_name returning id`, [investor, slug2]);
  ok(old.ok, "SHIPPED server code works on pre-0063 (so production messaging works today, and keeps working after the API deploy)");
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  await c.query("rollback").catch(() => {});
}
await c.query("reset role").catch(() => {});
console.log("\n  AFTER ROLLBACK");
const back = (await q(`select count(*)::int n from information_schema.columns where table_schema='public' and table_name='conversations' and column_name='sender_company_id'`))[0].n;
ok(back === 1 && (await q(`select count(*)::int n from public.conversations`))[0].n === convsBefore, "nothing persisted: staging is post-0063 again, conversation count unchanged");
await c.end();
console.log(`\n  messaging-schema-compat (staging, rolled back): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
