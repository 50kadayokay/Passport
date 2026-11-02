// a03 (F6): verify migration 0076 against the STAGING database inside ONE
// transaction that is always ROLLED BACK.
//   node scripts/company-roles-0076-check.mjs
//
// Every company role (owner, admin, editor, publisher, analyst, viewer) plus
// another company's owner, an investor and a platform admin, against every
// table 0076 re-policies -- by DIRECT database writes, as a client bypassing
// the UI would. Plus site_credentials read+revoke, audit-log forgery, member
// reads of an unpublished company, the member-invitation lifecycle (email-
// bound, single-use, expiring, revocable, no billing/ownership/account-type
// side effects, never overwriting a membership), the preserved first-owner
// handoff, member management (escalation, self, account owner, stale, removal
// revokes access), and the rollback file. Staging only. Prints no secrets.

import fs from "node:fs";
import pg from "pg";
import { runnerBody, scanMigrationSql } from "./_db-egress.mjs";

const url = (process.env.STAGING_DATABASE_URL || fs.readFileSync("supabase/staging/.connection", "utf8")).trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the allowlisted staging project."); process.exit(2); }
const env = Object.fromEntries(fs.readFileSync("supabase/staging/.isolation-env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const A = env.ISOLATION_COMPANY_A_ID, B = env.ISOLATION_COMPANY_B_ID;
const MIG = fs.readFileSync("supabase/migrations/0076_company_roles.sql", "utf8");
const RB = fs.readFileSync("supabase/rollbacks/0076_company_roles.rollback.sql", "utf8");
const TABLES = ["updates", "update_documents", "publications", "publication_media", "documents", "media_assets", "media_asset_sources", "facts", "brand_kits", "company_destinations", "company_blueprints", "story_projects", "site_credentials", "activity_log", "conversations", "messages", "companies", "company_invitations"];

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, a) => (await c.query(s, a)).rows;
const one = async (s, a) => (await q(s, a))[0];
let sp = 0;
const tryq = async (sql, args) => { const n = `s${++sp}`; await c.query(`savepoint ${n}`); try { const r = await c.query(sql, args); await c.query(`release savepoint ${n}`); return { ok: true, rows: r.rows, count: r.rowCount }; } catch (e) { await c.query(`rollback to savepoint ${n}`); return { ok: false, e: e.message, code: e.code }; } };
const asPostgres = async () => { await c.query(`reset role`); await c.query(`select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true)`); };
const asUser = async (uid, email = null) => { await c.query(`reset role`); await c.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [JSON.stringify({ sub: uid, role: "authenticated", ...(email ? { email } : {}) }), uid]); await c.query(`set local role authenticated`); };
const j = async (sql, args) => (await one(sql, args)).j;
const policyDigest = async () => (await q(`select tablename || '.' || policyname || ':' || md5(cmd || coalesce(qual,'') || '|' || coalesce(with_check,'') || roles::text) x from pg_policies where schemaname='public' and tablename = any($1) order by 1`, [TABLES])).map((r) => r.x).join("\n");
const fnDigest = async (name) => (await one(`select md5(pg_get_functiondef(p.oid)) d from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=$1`, [name]))?.d || null;
// Like tryq, but ALWAYS rolls back to the savepoint (a probe that must not
// change the state later probes see).
const probe = async (sql, args) => { const n = `s${++sp}`; await c.query(`savepoint ${n}`); try { const r = await c.query(sql, args); return { ok: true, rows: r.rows, count: r.rowCount }; } catch (e) { return { ok: false, e: e.message, code: e.code }; } finally { await c.query(`rollback to savepoint ${n}`); } };
const asAnon = async () => { await c.query(`reset role`); await c.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('request.jwt.claim.sub', '', true)`); await c.query(`set local role anon`); };
const asService = async () => { await c.query(`reset role`); await c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true), set_config('request.jwt.claim.sub', '', true)`); await c.query(`set local role service_role`); };
// Grants (table AND column ACLs, entries sorted so grant order does not matter),
// triggers, and every public function definition. Compared before 0076 and
// after its rollback, so "restores exactly" covers grants and functions, not
// only policies.
const ACL_TABLES = [...new Set([...TABLES, "company_memberships"])];
const aclDigest = async () => (await q(`
  select c.relname || ':' || coalesce((select string_agg(x::text, ',' order by x::text) from unnest(c.relacl) x), '') || '|' ||
         coalesce((select string_agg(a.attname || '=' || (select string_agg(y::text, ',' order by y::text) from unnest(a.attacl) y), ';' order by a.attname)
                     from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and a.attacl is not null and cardinality(a.attacl) > 0), '') x
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname = any($1) order by 1`, [ACL_TABLES])).map((r) => r.x).join("\n");
const trgDigest = async () => (await q(`select tgrelid::regclass::text || '.' || tgname || ':' || md5(pg_get_triggerdef(oid)) x from pg_trigger where not tgisinternal and tgrelid::regclass::text = any($1) order by 1`, [ACL_TABLES])).map((r) => r.x).join("\n");
const allFnDigest = async () => (await q(`select p.oid::regprocedure::text || ':' || md5(pg_get_functiondef(p.oid)) || ':' || coalesce(array_to_string(p.proacl, ','), '') x from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' order by 1`)).map((r) => r.x).join("\n");
const hasKind = async () => (await one(`select count(*)::int n from information_schema.columns where table_schema='public' and table_name='company_invitations' and column_name='kind'`)).n === 1;

const uidOf = async (k) => (await one(`select id, email from auth.users where email = $1`, [env[`ISOLATION_${k}_EMAIL`]]));
const ownerA = (await one(`select owner_id from public.companies where id = $1`, [A])).owner_id;
const ownerB = (await one(`select owner_id from public.companies where id = $1`, [B])).owner_id;
const R = { owner: { id: ownerA }, admin: await uidOf("COADMIN"), editor: await uidOf("EDITOR"), publisher: await uidOf("PUBLISHER"), analyst: await uidOf("ANALYST"), viewer: await uidOf("STAFF") };
const OTHER = { ownerB: { id: ownerB }, investor: await uidOf("INVESTOR"), padmin: await uidOf("ADMIN") };
const invB = await uidOf("INVESTOR_B");
if ([...Object.values(R), ...Object.values(OTHER), invB].some((v) => !v || !v.id)) { console.error("  fixture users missing"); process.exit(3); }
const slugA = (await one(`select slug from public.companies where id = $1`, [A])).slug, slugB = (await one(`select slug from public.companies where id = $1`, [B])).slug;

console.log("\n  STATIC");
ok(scanMigrationSql(MIG).length === 0 && scanMigrationSql(RB).length === 0, "0076 and its rollback contain no database egress");
let body = ""; try { body = runnerBody(MIG); ok(true, "the runner can govern 0076's transaction"); } catch (e) { ok(false, "runnerBody accepts 0076", e.message); }
if (await hasKind()) { console.error("  0076 is already applied; this check is for the unapplied migration."); process.exit(4); }
const P0 = await policyDigest(), ACC0 = await fnDigest("accept_company_invitation");
const ACL0 = await aclDigest(), TRG0 = await trgDigest(), FN0 = await allFnDigest();

const DRAFT = ["owner", "admin", "editor", "publisher"], PUBLISH = ["owner", "admin", "publisher"], MANAGE = ["owner", "admin"];
try {
  await c.query("begin");
  await asPostgres();
  await q(body);
  ok(true, "0076 applies to the staging schema without error");

  // Seed rows each role will try to modify (as the table owner).
  const upd0 = (await one(`insert into public.updates (company_id, body, status) values ($1, '[0076] seed', 'draft') returning id`, [A])).id;
  const doc0 = (await one(`insert into public.documents (company_id, filename) values ($1, '[0076] seed') returning id`, [A])).id;
  const site0 = (await one(`insert into public.site_credentials (company_id, kind, token_hash, label) values ($1, 'site', md5(random()::text), '[0076] token') returning id`, [A])).id;
  const conv0 = (await one(`select id from public.conversations where investor_id = $1 and company_slug = $2 and sender_company_id is null limit 1`, [OTHER.investor.id, slugA]))?.id
    || (await one(`insert into public.conversations (investor_id, company_slug) values ($1, $2) returning id`, [OTHER.investor.id, slugA])).id;

  console.log("\n  EVERY ROLE x EVERY RE-POLICIED TABLE (direct writes, as a client bypassing the UI)");
  const allowed = (r) => r.ok || (r.code && r.code !== "42501");   // a non-RLS error (e.g. unique) means RLS let it through
  const matrix = [];
  for (const [role, u] of [...Object.entries(R), ["ownerB", OTHER.ownerB], ["investor", OTHER.investor]]) {
    await asUser(u.id);
    const k = `${role}-${Math.random().toString(36).slice(2, 7)}`;
    const res = {
      updates: allowed(await tryq(`insert into public.updates (company_id, body, status) values ($1, 'x', 'draft')`, [A])),
      publications: allowed(await tryq(`insert into public.publications (company_id, update_id, destination_id, status, content) values ($1, $2, 'passport', 'approved', '{}')`, [A, upd0])),
      documents: allowed(await tryq(`insert into public.documents (company_id, filename) values ($1, 'x')`, [A])),
      media_assets: allowed(await tryq(`insert into public.media_assets (company_id, storage_path, visibility) values ($1, $2, 'private')`, [A, `t/${k}`])),
      brand_kits: allowed(await tryq(`insert into public.brand_kits (company_id) values ($1)`, [A])),
      destinations: allowed(await tryq(`insert into public.company_destinations (company_id, destination_id) values ($1, $2)`, [A, `t-${k}`])),
      blueprints: allowed(await tryq(`insert into public.company_blueprints (company_id, blueprint_type, template_key, template_version) values ($1, 'website', $2, '1')`, [A, `t-${k}`])),
      story: allowed(await tryq(`insert into public.story_projects (company_id, created_by) values ($1, $2)`, [A, u.id])),
      facts: allowed(await tryq(`insert into public.facts (company_id, kind, data) values ($1, 'test', '{}')`, [A])),
      updDocs: allowed(await tryq(`insert into public.update_documents (update_id, document_id) values ($1, $2)`, [upd0, doc0])),
      updEdit: (await tryq(`update public.updates set body = body where id = $1`, [upd0])).count === 1,
      pubDelete: null,
      siteRead: (await tryq(`select id from public.site_credentials where id = $1`, [site0])).rows?.length === 1,
      siteRevoke: (await probe(`update public.site_credentials set revoked_at = now() where id = $1`, [site0])).count === 1,
      sendAsCompany: allowed(await tryq(`insert into public.messages (conversation_id, sender, body) values ($1, 'company', '[0076] reply')`, [conv0])),
      startThread: allowed(await tryq(`insert into public.conversations (investor_id, company_slug, sender_company_id) values ($1, $2, $3)`, [u.id, slugB, A])),
    };
    // A publication to delete, seeded fresh for each role.
    await asPostgres();
    const updP = (await one(`insert into public.updates (company_id, body, status) values ($1, '[0076] for delete', 'draft') returning id`, [A])).id;
    const p = (await one(`insert into public.publications (company_id, update_id, destination_id, status, content) values ($1, $2, 'linkedin', 'draft', '{}') returning id`, [A, updP])).id;
    await asUser(u.id);
    res.pubDelete = (await tryq(`delete from public.publications where id = $1`, [p])).count === 1;
    matrix.push([role, res]);
  }
  const expect = (role) => {
    const member = Object.keys(R).includes(role);
    return { updates: DRAFT.includes(role), publications: DRAFT.includes(role), documents: DRAFT.includes(role), media_assets: DRAFT.includes(role), brand_kits: DRAFT.includes(role),
      destinations: DRAFT.includes(role), blueprints: DRAFT.includes(role), story: DRAFT.includes(role), facts: false, updDocs: DRAFT.includes(role), updEdit: DRAFT.includes(role),
      pubDelete: PUBLISH.includes(role), siteRead: MANAGE.includes(role), siteRevoke: MANAGE.includes(role), sendAsCompany: DRAFT.includes(role),
      // Starting a company-initiated thread is NOT granted to clients at all
      // (0061a: no INSERT on conversations); only /api/messages (service role)
      // creates one, and that route enforces the messaging roles.
      startThread: false, _member: member };
  };
  for (const [role, res] of matrix) {
    const want = expect(role);
    const wrong = Object.keys(res).filter((k) => res[k] !== want[k]);
    ok(wrong.length === 0, `${role.padEnd(9)} ${Object.keys(res).map((k) => `${k}:${res[k] ? "Y" : "-"}`).join(" ")}`, wrong.length ? `unexpected: ${wrong.map((k) => `${k}=${res[k]} (want ${want[k]})`).join(", ")}` : "");
  }
  await asUser(OTHER.padmin.id);
  ok(allowed(await tryq(`insert into public.updates (company_id, body, status) values ($1, 'x', 'draft')`, [A])) && (await tryq(`select id from public.site_credentials where id = $1`, [site0])).rows.length === 1, "platform admin: writes content and reads website tokens");
  await asUser(R.viewer.id);
  ok((await tryq(`select id from public.updates where company_id = $1`, [A])).rows.length >= 1 && (await tryq(`select id from public.documents where company_id = $1`, [A])).rows.length >= 1, "viewer: still READS company content (reads unchanged)");

  console.log("\n  AUDIT LOG: members record UI actions as themselves; system events cannot be forged");
  await asUser(R.editor.id);
  const ins = (row) => tryq(`insert into public.activity_log (company_id, actor_id, actor_kind, action, entity, source) values ($1, $2, $3, $4, 'x', $5)`, [row.c || A, row.actor, row.kind || "company", row.action, row.source || "ui"]);
  ok((await ins({ actor: R.editor.id, action: "media_uploaded" })).ok, "editor: a legitimate UI action as themselves -> recorded");
  ok((await ins({ actor: R.viewer.id, action: "media_uploaded" })).code === "42501", "...in ANOTHER member's name -> refused");
  ok((await ins({ actor: R.editor.id, action: "profile_published" })).code === "42501", "...a system event (profile_published) -> refused");
  ok((await ins({ actor: R.editor.id, action: "member_role_changed" })).code === "42501", "...a membership event -> refused");
  ok((await ins({ actor: R.editor.id, action: "media_uploaded", kind: "admin" })).code === "42501", "...claiming actor_kind 'admin' -> refused");
  ok((await ins({ actor: R.editor.id, action: "media_uploaded", source: "api" })).code === "42501", "...claiming source 'api' -> refused");
  await asUser(OTHER.ownerB.id);
  ok((await ins({ actor: OTHER.ownerB.id, action: "media_uploaded" })).code === "42501", "another company's owner -> refused for A");
  await asUser(R.editor.id);
  {
    const fakeId = "11111111-1111-4111-8111-111111111111";
    const t = await tryq(`insert into public.activity_log (id, company_id, actor_id, actor_kind, action, entity, source, created_at) values ($1, $2, $3, 'company', 'media_uploaded', 'x', 'ui', '2001-01-01') returning id, created_at::text t, (created_at = now()) is_now`, [fakeId, A, R.editor.id]);
    ok(t.ok && t.rows[0].id !== fakeId && t.rows[0].is_now === true, "a client cannot BACKDATE an entry or choose its id (server stamps both)", JSON.stringify(t.rows || t.e));
  }
  ok((await probe(`insert into public.activity_log (company_id, actor_id, actor_kind, action, entity, source, reason) values ($1, $2, 'company', 'media_uploaded', 'x', 'ui', repeat('x', 600))`, [A, R.editor.id])).code === "22001", "oversized free text from a client -> refused");
  for (const [who, uid] of [["editor", R.editor.id], ["owner", R.owner.id], ["platform admin", OTHER.padmin.id]]) {
    await asUser(uid);
    const up = await probe(`update public.activity_log set reason = 'rewritten' where company_id = $1`, [A]);
    const del = await probe(`delete from public.activity_log where company_id = $1`, [A]);
    const tr = await probe(`truncate public.activity_log`);
    ok(up.code === "42501" && del.code === "42501" && tr.code === "42501", `${who}: UPDATE / DELETE / TRUNCATE of the audit log -> permission denied (append-only)`, JSON.stringify([up.code, del.code, tr.code]));
  }
  await asUser(OTHER.padmin.id);
  ok((await probe(`select id from public.activity_log where company_id = $1`, [A])).ok, "platform admin still READS the audit log");
  await asAnon();
  ok((await probe(`insert into public.activity_log (company_id, action, source) values ($1, 'media_uploaded', 'ui')`, [A])).code === "42501" && (await probe(`select 1 from public.activity_log limit 1`)).code === "42501", "anon: no read, no insert");
  await asPostgres();
  ok((await probe(`insert into public.activity_log (company_id, actor_kind, action, source) values ($1, 'system', 'profile_published', 'ui')`, [A])).code === "42501", "source 'ui' is RESERVED: a server-side writer cannot use it, so 'ui' always means client-reported");
  await asService();
  ok((await probe(`insert into public.activity_log (company_id, actor_kind, action, source) values ($1, 'system', 'profile_published', 'api') returning id`, [A])).ok, "the service role still writes authoritative events (source 'api')");

  console.log("\n  WEBSITE CREDENTIALS (site_credentials): read, modify, revoke");
  for (const role of ["editor", "publisher", "analyst", "viewer"]) {
    await asUser(R[role].id);
    const rd = await probe(`select id, label, revoked_at from public.site_credentials where id = $1`, [site0]);
    const rv = await probe(`update public.site_credentials set revoked_at = now() where id = $1`, [site0]);
    const hs = await probe(`select token_hash from public.site_credentials where id = $1`, [site0]);
    ok(rd.ok && rd.rows.length === 0 && rv.count === 0 && hs.code === "42501", `${role}: sees no credential rows, revokes nothing, token_hash column denied`, JSON.stringify([rd.rows?.length, rv.count ?? rv.code, hs.code]));
  }
  await asUser(R.owner.id);
  {
    const meta = await probe(`select id, label, kind, expires_at, revoked_at, last_used_at from public.site_credentials where id = $1`, [site0]);
    ok(meta.ok && meta.rows.length === 1, "owner: reads the credential's metadata (label, kind, expiry, last use)");
    ok((await probe(`select token_hash from public.site_credentials where id = $1`, [site0])).code === "42501" && (await probe(`select * from public.site_credentials where id = $1`, [site0])).code === "42501", "owner: token_hash is NOT readable (column privilege), select * refused");
    for (const [col, val] of [["token_hash", "md5('chosen')"], ["expires_at", "now() + interval '10 years'"], ["label", "'x'"], ["company_id", `'${B}'`], ["kind", "'draft'"]]) {
      ok((await probe(`update public.site_credentials set ${col} = ${val} where id = $1`, [site0])).code === "42501", `owner: cannot modify ${col}`);
    }
    ok((await probe(`insert into public.site_credentials (company_id, kind, token_hash) values ($1, 'site', md5('mint'))`, [A])).code === "42501", "owner: cannot mint a credential (insert)");
    ok((await probe(`delete from public.site_credentials where id = $1`, [site0])).code === "42501", "owner: cannot delete a credential");
    const rv = await tryq(`update public.site_credentials set revoked_at = '2001-01-01' where id = $1 returning (revoked_at = now()) is_now`, [site0]);
    ok(rv.ok && rv.count === 1 && rv.rows[0].is_now === true, "owner: REVOKES it (server clock, not the client's)");
    ok((await probe(`update public.site_credentials set revoked_at = null where id = $1`, [site0])).code === "42501", "owner: cannot UN-revoke");
    ok((await probe(`update public.site_credentials set revoked_at = now() where id = $1`, [site0])).code === "42501", "owner: cannot re-stamp a revoked credential");
  }
  await asUser(R.admin.id);
  ok((await probe(`select id from public.site_credentials where id = $1`, [site0])).rows?.length === 1, "company admin: reads credentials too");
  await asUser(OTHER.ownerB.id);
  ok((await probe(`select id from public.site_credentials where id = $1`, [site0])).rows?.length === 0, "another company's owner: sees nothing");
  await asAnon();
  ok((await probe(`select id from public.site_credentials limit 1`)).code === "42501", "anon: permission denied");
  await asService();
  {
    const t = await probe(`update public.site_credentials set last_used_at = now() where id = $1 returning token_hash`, [site0]);
    ok(t.ok && t.count === 1 && t.rows[0].token_hash, "service role (api/_siteAuth.js) still reads token_hash and records last use");
  }
  await asPostgres();
  await q(`update public.site_credentials set revoked_at = null where id = $1`, [site0]);   // table owner resets the fixture for later probes

  console.log("\n  UNPUBLISHED COMPANY: its members can read its row");
  await asPostgres();
  await q(`select set_config('app.provisioning', 'on', true)`);
  await q(`update public.companies set status = 'draft' where id = $1`, [A]);
  await asUser(R.editor.id);
  ok((await tryq(`select id from public.companies where id = $1`, [A])).rows.length === 1, "editor of an unpublished company reads its row (was invisible)");
  await asUser(OTHER.ownerB.id);
  ok((await tryq(`select id from public.companies where id = $1`, [A])).rows.length === 0, "another company's owner still cannot");
  await asPostgres();
  await q(`update public.companies set status = 'published' where id = $1`, [A]);

  console.log("\n  INVITATIONS: who may invite whom");
  const inv = async (u, email, role) => { await asUser(u.id); return j(`select public.invite_member($1, $2, $3) j`, [A, email, role]); };
  let r = await inv(R.owner, "new-admin@staging.invalid", "admin"); ok(r.ok && r.role === "admin", "owner invites an admin");
  r = await inv(R.owner, "x@staging.invalid", "owner"); ok(r.error === "role_not_allowed", "owner cannot invite another OWNER (ownership is platform-admin only)");
  r = await inv(R.admin, "y@staging.invalid", "admin"); ok(r.error === "role_not_allowed", "admin cannot invite an admin");
  r = await inv(R.admin, "y@staging.invalid", "editor"); ok(r.ok, "admin invites an editor");
  for (const role of ["editor", "publisher", "analyst", "viewer"]) { r = await inv(R[role], "z@staging.invalid", "viewer"); ok(r.error === "forbidden", `${role} cannot invite`); }
  await asUser(OTHER.ownerB.id); r = await j(`select public.invite_member($1, $2, $3) j`, [A, "z@staging.invalid", "viewer"]); ok(r.error === "forbidden", "another company's owner cannot invite to A");
  r = await inv(R.owner, R.editor.email, "viewer"); ok(r.error === "already_member", "inviting an existing member -> already_member (no silent change)");
  r = await inv(R.owner, "not-an-email", "viewer"); ok(r.error === "invalid_email", "a malformed email -> refused");
  const first = await inv(R.owner, OTHER.investor.email, "viewer");
  const again = await inv(R.owner, OTHER.investor.email, "analyst");
  ok(first.ok && again.ok && first.id === again.id && first.token !== again.token && again.role === "analyst", "a duplicate pending invitation is REFRESHED (same invitation, new token and role), not duplicated");
  await asPostgres();
  ok((await one(`select count(*)::int n from public.company_invitations where company_id = $1 and lower(email) = lower($2) and status = 'pending'`, [A, OTHER.investor.email])).n === 1, "  ...one pending row");
  await asUser(R.viewer.id); ok((await j(`select public.list_invitations($1) j`, [A])).error === "forbidden", "viewer cannot see pending invitations");
  await asUser(R.admin.id); const li = await j(`select public.list_invitations($1) j`, [A]);
  ok(li.ok && li.invitations.some((x) => x.email === "new-admin@staging.invalid" && x.can_revoke === false) && li.invitations.some((x) => x.email === "y@staging.invalid" && x.can_revoke === true), "admin sees pending invitations; can revoke only those for roles it may grant");
  await asUser(R.viewer.id); const lm = await j(`select public.list_members($1) j`, [A]);
  ok(lm.ok && lm.members.length >= 6 && lm.members.every((m) => m.manageable === false) && lm.grantable.length === 0, "viewer sees the team directory, can manage nobody");

  console.log("\n  ACCEPTING A MEMBER INVITATION");
  await asPostgres();
  const subBefore = JSON.stringify(await q(`select plan_id, status from public.company_subscriptions where company_id = $1`, [A]));
  const ownerBefore = (await one(`select owner_id from public.companies where id = $1`, [A])).owner_id;
  const profileBefore = (await one(`select role from public.profiles where id = $1`, [OTHER.investor.id]))?.role;
  await q(`update public.company_subscriptions set status = 'canceled' where company_id = $1`, [A]);   // a cancelled company...
  await asUser(OTHER.investor.id, OTHER.investor.email);
  r = await j(`select public.accept_company_invitation($1) j`, [first.token]);
  ok(r.ok === false && r.error === "invalid", "the REPLACED token no longer works");
  await asUser(invB.id, invB.email);
  r = await j(`select public.accept_company_invitation($1) j`, [again.token]);
  ok(r.error === "email_mismatch", "the wrong signed-in email -> email_mismatch");
  await asUser(OTHER.investor.id, OTHER.investor.email);
  r = await j(`select public.accept_company_invitation($1) j`, [again.token]);
  ok(r.ok && r.role === "analyst", "the invited investor accepts -> analyst member");
  await asPostgres();
  {
    const sub = await one(`select status, plan_id from public.company_subscriptions where company_id = $1`, [A]);
    ok(sub.status === "canceled" && sub.plan_id === (JSON.parse(subBefore)[0]?.plan_id ?? null), "...the cancelled subscription is NOT re-activated and the plan is unchanged (no billing side effect)");
  }
  await q(`update public.company_subscriptions set status = $2 where company_id = $1`, [A, JSON.parse(subBefore)[0]?.status || "active"]);
  ok((await one(`select owner_id from public.companies where id = $1`, [A])).owner_id === ownerBefore, "...ownership unchanged");
  ok((await one(`select role from public.profiles where id = $1`, [OTHER.investor.id]))?.role === profileBefore, `...account type unchanged (${profileBefore})`);
  await asUser(OTHER.investor.id, OTHER.investor.email);
  r = await j(`select public.accept_company_invitation($1) j`, [again.token]);
  ok(r.error === "used", "single use: accepting again -> used");
  // already a member: an invitation whose invitee became a member meanwhile.
  await asUser(R.owner.id); const i2 = await j(`select public.invite_member($1, $2, $3) j`, [A, invB.email, "viewer"]);
  await asPostgres(); await q(`insert into public.company_memberships (company_id, user_id, role, status) values ($1, $2, 'publisher', 'active')`, [A, invB.id]);
  await asUser(invB.id, invB.email); r = await j(`select public.accept_company_invitation($1) j`, [i2.token]);
  await asPostgres();
  ok(r.error === "already_member" && (await one(`select role from public.company_memberships where company_id = $1 and user_id = $2`, [A, invB.id])).role === "publisher", "accepting while already a member -> already_member; the existing role is NOT overwritten");
  await q(`delete from public.company_memberships where company_id = $1 and user_id = $2`, [A, invB.id]);
  // expired and revoked
  await asUser(R.owner.id); const i3 = await j(`select public.invite_member($1, $2, $3) j`, [A, invB.email, "viewer"]);
  await asPostgres(); await q(`update public.company_invitations set expires_at = now() - interval '1 minute' where id = $1`, [i3.id]);
  await asUser(invB.id, invB.email); r = await j(`select public.accept_company_invitation($1) j`, [i3.token]);
  ok(r.error === "expired", "an expired invitation -> expired");
  await asUser(R.owner.id); const i4 = await j(`select public.invite_member($1, $2, $3) j`, [A, invB.email, "viewer"]);
  await asUser(R.admin.id); ok((await j(`select public.revoke_invitation($1, $2) j`, [A, i4.id])).ok, "admin revokes a viewer invitation");
  await asUser(invB.id, invB.email); r = await j(`select public.accept_company_invitation($1) j`, [i4.token]);
  ok(r.error === "revoked", "a revoked invitation -> revoked");
  await asUser(R.admin.id); ok((await j(`select public.revoke_invitation($1, $2) j`, [A, li.invitations.find((x) => x.email === "new-admin@staging.invalid").id])).error === "forbidden", "admin cannot revoke an admin invitation");

  console.log("\n  FIRST-OWNER HANDOFF (kind 'provision') -- 0031 behaviour preserved");
  await asPostgres();
  const zc = (await one(`insert into public.companies (slug, name, status, tier) values ('zz-0076-prov', 'Prov', 'draft', 'free') returning id`)).id;
  await asUser(OTHER.padmin.id);
  const pv = await j(`select public.create_company_invitation($1, $2) j`, [zc, invB.email]);
  await asPostgres();
  ok((await one(`select kind, role from public.company_invitations where id = $1`, [pv.id])).kind === "provision", "a platform admin's invitation is kind 'provision' (role owner)");
  await asUser(invB.id, invB.email); r = await j(`select public.accept_company_invitation($1) j`, [pv.token]);
  await asPostgres();
  const zrow = await one(`select owner_id from public.companies where id = $1`, [zc]);
  const zsub = await one(`select status from public.company_subscriptions where company_id = $1`, [zc]);
  ok(r.ok && zrow.owner_id === invB.id && zsub && zsub.status === "active", "accepting it still hands over ownership and an active subscription");

  console.log("\n  MEMBER MANAGEMENT");
  const mem = async (u) => { await asUser(u); return (await j(`select public.list_members($1) j`, [A])).members; };
  // As TEXT: a JS Date would drop the microseconds and every compare-and-set would read as stale.
  const ver = async (target) => (await one(`select updated_at::text u from public.company_memberships where company_id = $1 and user_id = $2`, [A, target])).u;
  const chg = async (u, target, role, v) => { await asUser(u); return j(`select public.change_member_role($1, $2, $3, $4) j`, [A, target, role, v ?? (await (async () => { await asPostgres(); const x = await ver(target); await asUser(u); return x; })())]); };
  // Stale view: two managers loaded the Team page before this transaction's first
  // write to the editor's membership. (Every write inside one transaction gets
  // the same now() from the touch trigger, so the view must predate them all.)
  await asPostgres(); const vEd = await ver(R.editor.id);
  const vNow = (await one(`select now()::text n`)).n;
  ok(vEd !== vNow, "stale-view baseline predates this transaction's writes");
  r = await chg(R.owner.id, R.editor.id, "publisher", vEd); const r2 = await chg(R.admin.id, R.editor.id, "analyst", vEd);
  ok(r.ok && r.role === "publisher" && r2.error === "stale" && r2.role === "publisher", "owner: editor -> publisher; a second change from the same (now stale) view is refused, no lost update", JSON.stringify({ r, r2 }));
  ok(r.updated_at && (await (async () => { await asPostgres(); return (await one(`select (updated_at = $3::timestamptz) s from public.company_memberships where company_id = $1 and user_id = $2`, [A, R.editor.id, r.updated_at])).s; })()), "returned version equals the stored updated_at (usable for the next change)");
  r = await chg(R.owner.id, R.editor.id, "editor"); ok(r.ok, "owner: back to editor");
  r = await chg(R.admin.id, R.editor.id, "admin"); ok(r.error === "role_not_allowed", "admin cannot PROMOTE anyone to admin");
  r = await chg(R.admin.id, R.admin.id, "owner"); ok(r.error === "self", "admin cannot change its OWN role (self-promotion)");
  r = await chg(R.owner.id, R.owner.id, "admin"); ok(r.error === "self" || r.error === "account_owner", "owner cannot change its own role");
  r = await chg(R.admin.id, R.editor.id, "viewer"); ok(r.ok, "admin: editor -> viewer (allowed range)");
  r = await chg(R.admin.id, R.editor.id, "editor"); ok(r.ok, "admin: viewer -> editor");
  r = await chg(R.editor.id, R.viewer.id, "publisher"); ok(r.error === "forbidden", "editor cannot manage members");
  r = await chg(OTHER.padmin.id, ownerA, "admin"); ok(r.error === "account_owner", "nobody demotes the company's account owner here (ownership transfer is a platform-admin tool)");
  r = await chg(R.owner.id, R.admin.id, "editor"); ok(r.ok, "owner may demote an admin");
  await chg(R.owner.id, R.admin.id, "admin");
  // Owners: protected structurally. 'owner' is never grantable, so an owner
  // membership can be neither changed nor removed through these functions --
  // not even by a platform admin -- and the account owner is refused first.
  // The explicit last_owner branch is a second line behind that. Probe with a
  // SECOND owner membership (the investor), inside a savepoint.
  await asPostgres(); await q(`savepoint own2`);
  const owners0 = (await one(`select count(*)::int n from public.company_memberships where company_id = $1 and role = 'owner' and status = 'active'`, [A])).n;
  await q(`insert into public.company_memberships (company_id, user_id, role, status) values ($1, $2, 'owner', 'active')
           on conflict (company_id, user_id) do update set role = 'owner', status = 'active'`, [A, OTHER.investor.id]);
  const vO2 = await ver(OTHER.investor.id);
  r = await chg(R.owner.id, OTHER.investor.id, "admin", vO2); ok(r.error === "role_not_allowed", "owner cannot demote a co-owner (owners are never managed here)", JSON.stringify(r));
  r = await chg(R.admin.id, OTHER.investor.id, "viewer", vO2); ok(r.error === "role_not_allowed", "admin cannot demote an owner");
  r = await chg(OTHER.padmin.id, OTHER.investor.id, "admin", vO2); ok(r.error === "role_not_allowed", "even a platform admin cannot demote an owner through change_member_role");
  await asUser(OTHER.padmin.id); r = await j(`select public.remove_member($1, $2, $3) j`, [A, OTHER.investor.id, vO2]); ok(r.error === "role_not_allowed", "...nor remove one");
  r = await j(`select public.remove_member($1, $2, $3) j`, [A, ownerA, null]); ok(r.error === "account_owner", "platform admin cannot remove the account owner here");
  r = await chg(R.admin.id, ownerA, "viewer"); ok(r.error === "account_owner", "admin cannot demote the account owner");
  await asPostgres();
  ok((await one(`select count(*)::int n from public.company_memberships where company_id = $1 and role = 'owner' and status = 'active'`, [A])).n === owners0 + 1, "both owner memberships intact after every attempt");
  await q(`rollback to savepoint own2`);
  // removal revokes access
  await asUser(R.analyst.id); const beforeRm = (await tryq(`select id from public.updates where company_id = $1`, [A])).rows.length;
  await asPostgres(); const vAn = await ver(R.analyst.id);
  await asUser(R.editor.id); ok((await j(`select public.remove_member($1, $2, $3) j`, [A, R.analyst.id, vAn])).error === "forbidden", "editor cannot remove members");
  await asUser(R.admin.id); r = await j(`select public.remove_member($1, $2, $3) j`, [A, R.analyst.id, vAn]);
  ok(r.ok, "admin removes the analyst");
  await asUser(R.analyst.id);
  ok(beforeRm >= 1 && (await tryq(`select id from public.updates where company_id = $1`, [A])).rows.length === 0 && (await j(`select public.list_members($1) j`, [A])).error === "forbidden", "the removed analyst immediately loses access (content and team)");
  await asUser(R.admin.id); ok((await j(`select public.remove_member($1, $2, $3) j`, [A, R.admin.id, null])).error === "self", "admin cannot remove itself");
  await asUser(R.owner.id); ok((await j(`select public.remove_member($1, $2, $3) j`, [A, ownerA, null])).error === "self", "the owner cannot remove itself");
  // Demotion and removal take effect on the very next statement: there is no
  // cached role anywhere between the caller and the policies.
  {
    await asPostgres(); const updX = (await one(`insert into public.updates (company_id, body, status) values ($1, '[0076] demote probe', 'draft') returning id`, [A])).id;
    const pubX = (await one(`insert into public.publications (company_id, update_id, destination_id, status, content) values ($1, $2, 'linkedin', 'draft', '{}') returning id`, [A, updX])).id;
    await asUser(R.publisher.id);
    const before = (await probe(`delete from public.publications where id = $1`, [pubX])).count === 1;
    r = await chg(R.owner.id, R.publisher.id, "viewer"); ok(r.ok, "owner demotes the publisher to viewer");
    await asUser(R.publisher.id);
    const delAfter = await probe(`delete from public.publications where id = $1`, [pubX]);
    const insAfter = await probe(`insert into public.updates (company_id, body, status) values ($1, 'x', 'draft')`, [A]);
    ok(before && delAfter.count === 0 && insAfter.code === "42501", "...immediately: could delete a publication before, cannot now; cannot draft either", JSON.stringify([before, delAfter.count, insAfter.code]));
    r = await chg(R.owner.id, R.publisher.id, "publisher"); ok(r.ok, "...and restored to publisher");

    await asPostgres(); const vAd = await ver(R.admin.id);
    await asUser(R.owner.id); r = await j(`select public.remove_member($1, $2, $3) j`, [A, R.admin.id, vAd]); ok(r.ok, "owner removes the company admin");
    await asUser(R.admin.id);
    const invAfter = await j(`select public.invite_member($1, $2, $3) j`, [A, "after-removal@staging.invalid", "viewer"]);
    const liAfter = await j(`select public.list_invitations($1) j`, [A]);
    const siteAfter = await probe(`select id from public.site_credentials where id = $1`, [site0]);
    const updAfter = await probe(`insert into public.updates (company_id, body, status) values ($1, 'x', 'draft')`, [A]);
    const chgAfter = await j(`select public.change_member_role($1, $2, $3, $4) j`, [A, R.editor.id, "viewer", await (async () => { await asPostgres(); const v = await ver(R.editor.id); await asUser(R.admin.id); return v; })()]);
    ok(invAfter.error === "forbidden" && liAfter.error === "forbidden" && siteAfter.rows?.length === 0 && updAfter.code === "42501" && chgAfter.error === "forbidden",
       "...immediately: the removed admin can no longer invite, list invitations, read website credentials, draft content or change roles",
       JSON.stringify([invAfter.error, liAfter.error, siteAfter.rows?.length, updAfter.code, chgAfter.error]));
    await asPostgres(); await q(`update public.company_memberships set status = 'active', role = 'admin' where company_id = $1 and user_id = $2`, [A, R.admin.id]);
  }
  await asUser(R.owner.id); const acts = (await q(`select action from public.activity_log where company_id = $1 and (action like 'member_%' or action = 'invitation_revoked')`, [A])).map((x) => x.action);
  await asPostgres();
  ok((await one(`select count(*)::int n from public.activity_log where company_id = $1 and (action like 'member_%' or action = 'invitation_revoked') and source <> 'api'`, [A])).n === 0, "every membership event written by the functions carries source 'api' (never the client mark 'ui')");
  await asUser(R.owner.id);
  ok(acts.includes("member_invited") && acts.includes("member_joined") && acts.includes("member_role_changed") && acts.includes("member_removed") && acts.includes("invitation_revoked"), "every membership change is audited");

  console.log("\n  ROLLBACK FILE");
  await asPostgres();
  await q(`savepoint rb`);
  await q(runnerBody(RB));
  ok((await policyDigest()) === P0, "rollback restores every replaced policy exactly (and removes 0076's)");
  ok((await fnDigest("accept_company_invitation")) === ACC0 && !(await hasKind()) && (await fnDigest("has_company_role")) === null, "rollback restores 0031's accept_company_invitation and removes kind + the new functions");
  ok((await aclDigest()) === ACL0, "rollback restores table AND column grants exactly (activity_log, site_credentials, memberships, invitations, every re-policied table)");
  ok((await trgDigest()) === TRG0, "rollback removes 0076's guard triggers and leaves the others as they were");
  ok((await allFnDigest()) === FN0, "rollback leaves every public function (definition and EXECUTE grants) exactly as before 0076");
  await q(`rollback to savepoint rb`);
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  await c.query("rollback").catch(() => {});
}
await c.query("reset role").catch(() => {});
console.log("\n  AFTER ROLLBACK (fresh queries)");
ok((await policyDigest()) === P0 && (await fnDigest("accept_company_invitation")) === ACC0 && !(await hasKind()), "nothing persisted: policies, accept function and invitations table as before");
ok((await aclDigest()) === ACL0 && (await trgDigest()) === TRG0 && (await allFnDigest()) === FN0, "nothing persisted: grants, triggers and functions as before");
ok((await one(`select count(*)::int n from public.companies where slug = 'zz-0076-prov'`)).n === 0 && (await one(`select count(*)::int n from public.company_profile_versions where company_id = $1`, [A])).n === 9, "no test rows persisted; the 9 protected snapshots untouched");
await c.end();
console.log(`\n  company-roles-0076 (staging, rolled back): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
