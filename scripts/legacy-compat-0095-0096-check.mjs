// 0095 (legacy lead forms) and 0096 (legacy messaging upsert) on the real STAGING
// database, in ONE transaction that is always ROLLED BACK. Nothing is kept.
//   node scripts/legacy-compat-0095-0096-check.mjs
//
// Staging already has every pending migration (0058 ... 0094). Inside the
// transaction this script first proves the two breaks exist (the controls), then
// applies 0095 and 0096 exactly as the runner would, and replays the database
// statements mineex.ca's deployed code (9dfafd7) makes, as the role it makes them:
//   * anon POST /rest/v1/demo_bookings and /rest/v1/contact_submissions, with the
//     exact column sets of the homepage LeadForm, /site/legacy and the old
//     /api/contact anon fallback;
//   * the old /api/messages upsert: conversations ON CONFLICT (investor_id,
//     company_slug) DO UPDATE, as the service role, then its message insert.
// Then it checks that the protections hold (no unrestricted anon access), that the
// new portal's company-thread shape works, and that both rollback files restore
// the previous state exactly.
import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";
import { runnerBody } from "./_db-egress.mjs";

const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the staging project."); process.exit(2); }
const read = (p) => fs.readFileSync(p, "utf8");
const M95 = runnerBody(read("supabase/migrations/0095_public_lead_form_guard.sql"));
const R95 = runnerBody(read("supabase/rollbacks/0095_public_lead_form_guard.rollback.sql"));
const M96 = runnerBody(read("supabase/migrations/0096_conversations_legacy_upsert.sql"));
const R96 = runnerBody(read("supabase/rollbacks/0096_conversations_legacy_upsert.rollback.sql"));
const iso = Object.fromEntries(read("supabase/staging/.isolation-env").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const section = (t) => console.log(`\n  ${t}`);

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, a) => (await c.query(s, a)).rows;
const SNAP = async (qq) => JSON.stringify({
  cons: await qq(`select conname, pg_get_constraintdef(oid) d from pg_constraint where conrelid = 'public.conversations'::regclass order by 1`),
  idx: await qq(`select indexname, indexdef from pg_indexes where tablename = 'conversations' order by 1`),
  cols: await qq(`select column_name, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'conversations' order by 1`),
  leadGrants: await qq(`select table_name, column_name, privilege_type from information_schema.column_privileges where grantee = 'anon' and table_name in ('demo_bookings', 'contact_submissions') order by 1, 2, 3`),
  leadPol: await qq(`select tablename, policyname from pg_policies where tablename in ('demo_bookings', 'contact_submissions') order by 1, 2`),
  trg: await qq(`select tgname from pg_trigger where not tgisinternal and tgrelid::regclass::text in ('demo_bookings', 'contact_submissions') order by 1`),
  tbl: await qq(`select to_regclass('public.public_form_limits') t`),
});
const RUN = crypto.randomUUID().slice(0, 8);
const TAG = `zz-legacy-${RUN}`;

const asRole = async ({ role = "anon", uid = null, headers = {} } = {}) => {
  await c.query("reset role");
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid, role } : { role })]);
  await c.query(`select set_config('request.headers', $1, true)`, [JSON.stringify(headers)]);
  await c.query(`set local role ${role}`);
};
const asPostgres = async () => { await c.query("reset role"); await c.query(`select set_config('request.jwt.claims', '', true)`); await c.query(`select set_config('request.headers', '', true)`); };
let sp = 0;
const attempt = async (who, sql, args) => {
  if (who) await asRole(who);
  const n = `p${++sp}`; await c.query(`savepoint ${n}`);
  try { const r = await c.query(sql, args); await c.query(`release savepoint ${n}`); return { ok: true, rows: r.rows, count: r.rowCount }; }
  catch (e) { await c.query(`rollback to savepoint ${n}`); return { ok: false, code: e.code, msg: e.message }; }
  finally { await asPostgres(); }
};
// PostgREST turns a JSON body into INSERT (<the body's keys>) ... -- the column list is exactly the keys sent.
const post = (table, body) => {
  const cols = Object.keys(body);
  return [`insert into public.${table} (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})`, cols.map((k) => body[k])];
};
const anon = (n = 10, net = 113) => ({ role: "anon", headers: { "x-forwarded-for": `203.0.${net}.${n}` } });   // TEST-NET-3 and neighbours
const ipSeq = (() => { let i = 1; return () => anon(i++ % 250 + 1, 110 + Math.floor(i / 250)); })();
const count = async (table, col, val) => (await q(`select count(*)::int n from public.${table} where ${col} = $1`, [val]))[0].n;

// The exact payloads mineex.ca sends (9dfafd7).
const HOMEPAGE = { company: TAG, name: "Zz Legacy", email: "zz.legacy@example.com", notes: "homepage LeadForm (Close.jsx)" };
const SITE_DEMO = { company: TAG, name: "Zz Legacy", email: "zz.legacy@example.com", phone: "+1 555 0100", country: "Canada", preferred_date: "2026-11-10", preferred_time: "10:00", notes: "/site/legacy demo" };
const API_CONTACT = { name: "Zz Legacy", email: "zz.legacy@example.com", company: TAG, notes: "Company: x\n\nMessage:\nold /api/contact anon fallback" };
const SITE_CONTACT = { name: TAG, email: "zz.legacy@example.com", company: "Zz Co", message: "/site/legacy contact" };

try {
  await c.query("begin");

  // Actors: an investor with no company role, and company A's owner (who also invests).
  const userId = async (email) => (await q(`select id from auth.users where lower(email) = lower($1)`, [email]))[0]?.id;
  const INV = await userId(iso.ISOLATION_INVESTOR_EMAIL);
  const OWNER_A = await userId(iso.ISOLATION_COMPANY_A_EMAIL);
  const A = iso.ISOLATION_COMPANY_A_ID, B_SLUG = iso.ISOLATION_COMPANY_B_SLUG;
  if (!INV || !OWNER_A || !A || !B_SLUG) throw new Error("isolation fixtures missing (investor, company A owner, company A id, company B slug)");

  // =========================================================== CONTROLS ====
  section("CONTROLS: staging as it is (0058 and 0063 applied, no fixes)");
  {
    const r = await attempt(anon(), ...post("demo_bookings", HOMEPAGE));
    ok(!r.ok && r.code === "42501", "homepage lead form is refused after 0058 (the reported break)", `${r.code} ${r.msg}`);
    const u = await attempt({ role: "service_role" },
      `insert into public.conversations (investor_id, company_slug, company_name, ceo_email) values ($1, $2, 'Zz', null)
       on conflict (investor_id, company_slug) do update set investor_id = excluded.investor_id, company_slug = excluded.company_slug,
         company_name = excluded.company_name, ceo_email = excluded.ceo_email returning id`, [INV, TAG]);
    ok(!u.ok && u.code === "42P10", "old /api/messages upsert fails after 0063 (the reported break: 42P10)", `${u.code} ${u.msg}`);
  }

  // A company thread in 0063's shape, made BEFORE 0096, to prove 0096 migrates it.
  const pre = (await q(`insert into public.conversations (investor_id, sender_company_id, company_slug, company_name)
                         values ($1, $2, $3, 'Zz pre-0096') returning id`, [OWNER_A, A, `${TAG}-pre`]))[0].id;

  const base = await SNAP(q);   // staging without the fixes, read inside this transaction
  await c.query(M95);
  await c.query(M96);

  // ============================================================ 0095 =======
  section("0095: mineex.ca's lead forms, exactly as deployed");
  for (const [label, table, body] of [
    ["homepage LeadForm -> demo_bookings {company,name,email,notes}", "demo_bookings", HOMEPAGE],
    ["/site/legacy demo form -> demo_bookings (all 8 fields)", "demo_bookings", SITE_DEMO],
    ["old /api/contact anon fallback -> demo_bookings {name,email,company,notes}", "demo_bookings", API_CONTACT],
    ["/site/legacy contact form -> contact_submissions", "contact_submissions", SITE_CONTACT],
  ]) {
    const r = await attempt(ipSeq(), ...post(table, body));
    ok(r.ok && r.count === 1, label, `${r.code} ${r.msg}`);
  }
  {
    const r = await attempt(ipSeq(), ...post("demo_bookings", { company: TAG, name: "Zz", email: "zz@example.com" }));
    ok(r.ok, "homepage form with the optional notes left empty (the key is absent)", `${r.code} ${r.msg}`);
    const row = (await q(`select created_at from public.demo_bookings where company = $1 order by id desc limit 1`, [TAG]))[0];
    ok(row && Math.abs(new Date(row.created_at) - Date.now()) < 600000, "created_at is set by the server");
  }

  section("0095: protections (no unrestricted anonymous access)");
  {
    const viaId = await attempt(ipSeq(), ...post("demo_bookings", { ...HOMEPAGE, id: 999999999 }));
    const idPriv = (await q(`select has_column_privilege('anon', 'public.demo_bookings', 'id', 'INSERT') d, has_column_privilege('anon', 'public.contact_submissions', 'id', 'INSERT') c`))[0];
    ok(!viaId.ok && ["42501", "428C9"].includes(viaId.code) && !idPriv.d && !idPriv.c, "anon cannot choose id (no column privilege; the identity is GENERATED ALWAYS too)", `${viaId.code} ${viaId.msg}`);
    const viaTs = await attempt(ipSeq(), ...post("demo_bookings", { ...HOMEPAGE, created_at: "2020-01-01" }));
    ok(!viaTs.ok && viaTs.code === "42501", "anon cannot backdate created_at");
    for (const [verb, sql] of [["read", `select * from public.demo_bookings limit 1`], ["read contact", `select * from public.contact_submissions limit 1`],
      ["update", `update public.demo_bookings set notes = 'x' where company = '${TAG}'`], ["delete", `delete from public.demo_bookings where company = '${TAG}'`],
      ["truncate", `truncate public.contact_submissions`]]) {
      const r = await attempt(ipSeq(), sql);
      ok(!r.ok && r.code === "42501", `anon cannot ${verb}`, `${r.code} ${r.msg}`);
    }
    const bad = async (label, table, body) => { const r = await attempt(ipSeq(), ...post(table, body)); ok(!r.ok && r.code === "42501", label, `${r.code} ${r.msg}`); };
    await bad("refused: no email", "demo_bookings", { company: TAG, name: "Zz" });
    await bad("refused: malformed email", "demo_bookings", { ...HOMEPAGE, email: "not-an-email" });
    await bad("refused: blank name", "demo_bookings", { ...HOMEPAGE, name: "   " });
    await bad("refused: notes over 5000 characters", "demo_bookings", { ...HOMEPAGE, notes: "x".repeat(5001) });
    await bad("refused: company over 200 characters", "demo_bookings", { ...HOMEPAGE, company: "x".repeat(201) });
    await bad("refused: contact message empty", "contact_submissions", { ...SITE_CONTACT, message: "" });
    await bad("refused: contact message over 5000", "contact_submissions", { ...SITE_CONTACT, message: "x".repeat(5001) });
    const many = await attempt(ipSeq(), `insert into public.demo_bookings (company, name, email) values ($1, 'a', 'a@example.com'), ($1, 'b', 'b@example.com')`, [TAG]);
    ok(!many.ok && many.code === "PT400", "refused: two rows in one request", `${many.code} ${many.msg}`);
    const signedIn = await attempt({ role: "authenticated", uid: INV }, ...post("demo_bookings", HOMEPAGE));
    ok(!signedIn.ok, "a signed-in user's direct insert is still refused (no policy; the forms send the anon key)", `${signedIn.code}`);
    const svc = await attempt({ role: "service_role" }, ...post("demo_bookings", { ...HOMEPAGE, notes: "service role (/api/submit)" }));
    ok(svc.ok, "the service role (/api/submit) is unaffected");
  }

  section("0095: rate limit, keyed on the gateway's address");
  {
    const dev = { role: "anon", headers: { "x-forwarded-for": "203.0.113.200" } };
    const res = [];
    for (let i = 0; i < 6; i++) res.push(await attempt(dev, ...post("demo_bookings", HOMEPAGE)));
    ok(res.slice(0, 5).every((r) => r.ok) && !res[5].ok && res[5].code === "PT429", "one device: 5 per hour, the 6th is refused (PT429 -> HTTP 429)", res.map((r) => r.ok ? "ok" : r.code).join(","));
    const spoof = await attempt({ role: "anon", headers: { "x-forwarded-for": "198.18.0.1, 203.0.113.200" } }, ...post("demo_bookings", HOMEPAGE));
    ok(!spoof.ok && spoof.code === "PT429", "a forged first x-forwarded-for hop does not escape (only the gateway's last hop counts)");
    const cfh = await attempt({ role: "anon", headers: { "cf-connecting-ip": "203.0.113.200", "x-forwarded-for": "198.18.0.9" } }, ...post("contact_submissions", SITE_CONTACT));
    ok(!cfh.ok && cfh.code === "PT429", "cf-connecting-ip is used when present, and the per-device limit spans both forms", `${cfh.code}`);
    const other = await attempt({ role: "anon", headers: { "x-forwarded-for": "198.51.77.1" } }, ...post("demo_bookings", HOMEPAGE));
    ok(other.ok, "another network is not affected");
    // Network: 20 per /24 per hour across devices.
    const netRes = [];
    for (let i = 1; i <= 21; i++) netRes.push(await attempt({ role: "anon", headers: { "x-forwarded-for": `198.51.88.${i}` } }, ...post("demo_bookings", HOMEPAGE)));
    ok(netRes.slice(0, 20).every((r) => r.ok) && netRes[20].code === "PT429", "one /24 network: 20 per hour, the 21st device is refused", netRes.map((r) => r.ok ? "." : r.code).join(""));
    const none = [];
    for (let i = 0; i < 6; i++) none.push(await attempt({ role: "anon", headers: {} }, ...post("demo_bookings", HOMEPAGE)));
    ok(none.slice(0, 5).every((r) => r.ok) && none[5].code === "PT429", "no address at all shares one bucket (cannot dodge the limit)");
    const salted = await q(`select count(*)::int n from public.submission_throttle where form like 'lead_form_db_%' and ip_hash ~ '203\\.0\\.113'`);
    ok(salted[0].n === 0, "addresses are stored only as salted hashes");
    // Global: lower the cap inside the transaction and check it bites.
    await q(`update public.public_form_limits set global_per_window = (select max(count) from public.submission_throttle where form = 'lead_form_db_global')`);
    const g = await attempt({ role: "anon", headers: { "x-forwarded-for": "198.51.99.1" } }, ...post("demo_bookings", HOMEPAGE));
    ok(!g.ok && g.code === "PT429", "the overall cap refuses everyone once reached (raise it with one UPDATE)");
    await q(`update public.public_form_limits set global_per_window = 200`);
    const lim = await attempt({ role: "anon" }, `select * from public.public_form_limits`);
    ok(!lim.ok && lim.code === "42501", "anon cannot read or change the limits");
    const fn = await attempt({ role: "anon" }, `select public.public_form_client_ip()`);
    ok(!fn.ok && fn.code === "42501", "anon cannot call the guard's helper");
  }

  // ============================================================ 0096 =======
  section("0096: mineex.ca/app investor messaging, exactly as deployed");
  const LEGACY_UPSERT = `insert into public.conversations (investor_id, company_slug, company_name, ceo_email) values ($1, $2, $3, null)
     on conflict (investor_id, company_slug) do update set investor_id = excluded.investor_id, company_slug = excluded.company_slug,
       company_name = excluded.company_name, ceo_email = excluded.ceo_email returning *`;
  {
    const a = await attempt({ role: "service_role" }, LEGACY_UPSERT, [INV, TAG, "Zz Co"]);
    ok(a.ok && a.rows[0]?.id, "old /api/messages upsert creates the investor's thread", `${a.code} ${a.msg}`);
    const b = await attempt({ role: "service_role" }, LEGACY_UPSERT, [INV, TAG, "Zz Co renamed"]);
    ok(b.ok && b.rows[0]?.id === a.rows[0]?.id && b.rows[0].company_name === "Zz Co renamed", "a second send reuses the same thread (merge-duplicates), as before 0063");
    const m = await attempt({ role: "service_role" }, `insert into public.messages (conversation_id, sender, body) values ($1, 'investor', 'legacy send') returning id`, [a.rows[0]?.id]);
    ok(m.ok, "...and its message insert works");
    const seen = await attempt({ role: "authenticated", uid: INV }, `select id from public.conversations where id = $1`, [a.rows[0]?.id]);
    ok(seen.ok && seen.rows.length === 1, "the investor reads the thread in the old web app (conv_select)");
    const seenMsg = await attempt({ role: "authenticated", uid: INV }, `select id from public.messages where conversation_id = $1`, [a.rows[0]?.id]);
    ok(seenMsg.ok && seenMsg.rows.length === 1, "...and its messages (msg_select)");
  }

  section("0096: company-started threads (new portal) and their separation");
  {
    const migrated = (await q(`select investor_id, started_by from public.conversations where id = $1`, [pre]))[0];
    ok(migrated.investor_id === null && migrated.started_by === OWNER_A, "an existing 0063-shape company thread is migrated (starter moved to started_by)");
    const NEW = `insert into public.conversations (started_by, sender_company_id, company_slug, company_name) values ($1, $2, $3, 'Zz B') returning id`;
    const ct = await attempt({ role: "service_role" }, NEW, [OWNER_A, A, B_SLUG]);
    ok(ct.ok, "the new API's company-thread insert (started_by, sender_company_id) works", `${ct.code} ${ct.msg}`);
    const dup = await attempt({ role: "service_role" }, NEW, [OWNER_A, A, B_SLUG]);
    ok(!dup.ok && dup.code === "23505", "one thread per sending company and recipient (0063's uq_conv_company_thread kept)");
    const old = await attempt({ role: "service_role" }, `insert into public.conversations (investor_id, sender_company_id, company_slug) values ($1, $2, $3)`, [OWNER_A, A, `${TAG}-x`]);
    ok(!old.ok && old.code === "23514", "a company thread can no longer carry investor_id (check constraint)");
    // The owner of A ALSO messages company B personally, from the old web app.
    const mine = await attempt({ role: "service_role" }, LEGACY_UPSERT, [OWNER_A, B_SLUG, "Zz B"]);
    ok(mine.ok && mine.rows[0].id !== ct.rows?.[0]?.id && mine.rows[0].sender_company_id === null,
      "the same person messaging the same company as an investor gets their OWN thread; the old upsert never merges into the company thread");
    const inbox = await attempt({ role: "authenticated", uid: OWNER_A }, `select id from public.conversations where investor_id = auth.uid() and id = $1`, [ct.rows?.[0]?.id]);
    ok(inbox.ok && inbox.rows.length === 0, "the company thread is not in its starter's personal investor inbox");
    const viaCo = await attempt({ role: "authenticated", uid: OWNER_A }, `select id from public.conversations where id = $1`, [ct.rows?.[0]?.id]);
    ok(viaCo.ok && viaCo.rows.length === 1, "the sending company's member still reads it (conv_select_company)");
    const outsider = await attempt({ role: "authenticated", uid: INV }, `select id from public.conversations where id = $1`, [ct.rows?.[0]?.id]);
    ok(outsider.ok && outsider.rows.length === 0, "an unrelated investor cannot read it");
    const fk = (await q(`select confdeltype from pg_constraint where conrelid = 'public.conversations'::regclass and conname like '%started_by%' and contype = 'f'`))[0];
    ok(fk?.confdeltype === "n", "deleting the starter's account keeps the company's thread (started_by ON DELETE SET NULL; was: CASCADE via investor_id)");
    const OWNER_B = await userId(iso.ISOLATION_COMPANY_B_EMAIL);
    await q(`delete from public.conversations where id = $1`, [mine.rows?.[0]?.id]);   // leave only the company thread between them
    const senders = await attempt({ role: "authenticated", uid: OWNER_B }, `select investor_id from public.company_conversation_senders($1)`, [B_SLUG]);
    ok(senders.ok && !senders.rows.some((r) => r.investor_id === OWNER_A), "the recipient company no longer sees the starter's personal investor profile", `${senders.code} ${senders.msg}`);
    const browser = await attempt({ role: "authenticated", uid: OWNER_A }, `insert into public.conversations (started_by, sender_company_id, company_slug) values ($1, $2, $3)`, [OWNER_A, A, `${TAG}-br`]);
    ok(!browser.ok && browser.code === "42501", "browsers still cannot create conversations (SELECT-only grant unchanged)");
  }

  // ======================================================== ROLLBACKS ======
  section("rollback files restore the previous state exactly");
  {
    await c.query("savepoint before_rb");
    await c.query(R96); await c.query(R95);
    const after = await SNAP(q);
    await c.query("rollback to savepoint before_rb");
    ok(after === base, "0096 then 0095 rollbacks: schema, grants, policies and triggers identical to staging without the fixes", after === base ? "" : `after=${after.slice(0, 300)}\nbase=${base.slice(0, 300)}`);
    await c.query("savepoint rb2"); await c.query(R96);
    const back = (await q(`select investor_id from public.conversations where id = $1`, [pre]))[0];
    ok(back?.investor_id === OWNER_A, "0096 rollback moves a company thread's starter back to investor_id (0063 shape)");
    await c.query("rollback to savepoint rb2");
  }
} catch (e) {
  fail++; console.error(`  ✗ unexpected: ${e.code || ""} ${e.message}`);
} finally {
  await c.query("rollback").catch(() => {});
  await c.end();
}
console.log(`\n  legacy-compat 0095/0096 (staging, rolled back): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
