// Seed a STAGING database with the two companies and five identities the
// tenant-isolation suite attacks.
//
//   node scripts/seed-isolation-fixtures.mjs          # create (idempotent)
//   node scripts/seed-isolation-fixtures.mjs --env    # print the env block
//
// WHY IT WRITES auth.users DIRECTLY
// ---------------------------------
// Creating users through Supabase's Auth Admin API needs the service_role key,
// which this project does not hand out. auth.users requires only `id`, and
// pgcrypto is installed, so a bcrypt password written here authenticates
// through the normal /auth/v1/token endpoint exactly like any other user.
// That matters: the suite must hold REAL JWTs, not simulated ones.
//
// EVERY ROW IS DISPOSABLE and prefixed `iso-` so it can be identified and
// removed. This refuses to run anywhere but the allowlisted staging project.

import pg from "pg";
import fs from "node:fs";
import crypto from "node:crypto";
import { inspectDatabase, evaluate } from "./_db-egress.mjs";

const ALLOWED_REFS = ["jmljfovtfxcdhjmtlnva"];
const PRODUCTION_REFS = ["rvptronniomlqumjhyrr"];
const PASS = "iso-Staging-" + "Fixture-9471";     // disposable, staging only

const url = (process.env.STAGING_DATABASE_URL || fs.readFileSync("supabase/staging/.connection", "utf8")).trim();
if (PRODUCTION_REFS.some((r) => url.includes(r))) { console.error("\n  REFUSING: production.\n"); process.exit(2); }
if (!ALLOWED_REFS.some((r) => url.includes(r))) { console.error("\n  REFUSING: not the allowlisted staging project.\n"); process.exit(2); }

const IDENTITIES = [
  { key: "COMPANY_A", email: "iso-owner-a@staging.invalid", role: "company" },
  { key: "COMPANY_B", email: "iso-owner-b@staging.invalid", role: "company" },
  // A member of company A with role 'viewer' -- set EXPLICITLY below, because
  // company_memberships.role defaults to 'owner' (0006). The first version left
  // it to the default, so this "staff" identity was an owner-role member and
  // nothing ever tested a restricted role.
  { key: "STAFF",     email: "iso-staff-a@staging.invalid", role: "company" },
  // A member of company A with role 'publisher': the one non-owner role that
  // actor_can_publish admits. The positive control for publishing permission.
  { key: "PUBLISHER", email: "iso-publisher-a@staging.invalid", role: "company" },
  // Role 'editor' and role 'admin' (a COMPANY admin, not a platform admin) on
  // company A: the two roles billing (F2) must tell apart -- an editor may draft
  // but not pay; a company admin may manage billing.
  { key: "EDITOR",    email: "iso-editor-a@staging.invalid", role: "company" },
  { key: "COADMIN",   email: "iso-coadmin-a@staging.invalid", role: "company" },
  // Role 'analyst' on company A (D23): with the viewer, the second member role
  // that may read but not draft under the Batch C policy.
  { key: "ANALYST",   email: "iso-analyst-a@staging.invalid", role: "company" },
  { key: "INVESTOR",  email: "iso-investor@staging.invalid", role: "investor" },
  // A SECOND investor exists only to own company B's conversation. With one
  // investor on both sides, the suite's "investor SELECT other conversations"
  // probe read a thread that was legitimately theirs and scored it a leak.
  // The fixture, not the policy, was wrong.
  { key: "INVESTOR_B", email: "iso-investor-b@staging.invalid", role: "investor" },
  { key: "ADMIN",     email: "iso-admin@staging.invalid",    role: "admin" },
];
const COMPANIES = [
  { key: "A", slug: "iso-alpha-resources", name: "Iso Alpha Resources Ltd." },
  { key: "B", slug: "iso-beta-minerals",   name: "Iso Beta Minerals Corp." },
];

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const out = {};

// GoTrue scans these varchar columns into non-nullable Go strings. A row
// inserted by hand leaves them NULL, and every sign-in then fails with
// "Database error querying schema" -- an error that names neither the column
// nor the table. The API sets them to '' on its own inserts; so must we.
const TOKEN_COLS = ["confirmation_token", "recovery_token", "email_change_token_new",
                    "email_change_token_current", "email_change", "phone_change",
                    "phone_change_token", "reauthentication_token"];
async function blankTokens(id) {
  const present = await c.query(`select column_name from information_schema.columns
     where table_schema='auth' and table_name='users' and column_name = any($1)`, [TOKEN_COLS]);
  const cols = present.rows.map((r) => r.column_name);
  if (!cols.length) return;
  await c.query(`update auth.users set ${cols.map((n) => `${n} = coalesce(${n}, '')`).join(", ")} where id = $1`, [id]);
}

async function user(email, role) {
  const existing = await c.query("select id from auth.users where email = $1", [email]);
  if (existing.rowCount) {
    // Reset the password so a re-seed is always usable.
    await c.query(
      "update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')) where id = $1",
      [existing.rows[0].id, PASS]);
    await blankTokens(existing.rows[0].id);
    await c.query("update public.profiles set role = $2 where id = $1", [existing.rows[0].id, role]);
    return existing.rows[0].id;
  }
  const r = await c.query(`
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            $1, extensions.crypt($2, extensions.gen_salt('bf')), now(), now(), now(),
            '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb)
    returning id`, [email, PASS]);
  const id = r.rows[0].id;
  await blankTokens(id);
  // 0059's trigger may have made the profile already; make the role explicit.
  await c.query(`insert into public.profiles (id, email, role) values ($1,$2,$3)
                 on conflict (id) do update set role = excluded.role, email = excluded.email`, [id, email, role]);
  return id;
}

console.log("\n  IDENTITIES");
for (const i of IDENTITIES) {
  out[`ISOLATION_${i.key}_EMAIL`] = i.email;
  out[`ISOLATION_${i.key}_PASS`] = PASS;
  const id = await user(i.email, i.role);
  out[`_uid_${i.key}`] = id;
  console.log(`    ${i.email.padEnd(32)} role=${i.role}`);
}

console.log("\n  COMPANIES");
for (const co of COMPANIES) {
  const owner = out[`_uid_COMPANY_${co.key}`];
  const r = await c.query(`
    insert into public.companies (slug, name, status, owner_id)
    values ($1,$2,'published',$3)
    on conflict (slug) do update set name = excluded.name, owner_id = excluded.owner_id
    returning id`, [co.slug, co.name, owner]);
  const id = r.rows[0].id;
  out[`ISOLATION_COMPANY_${co.key}_ID`] = id;
  out[`ISOLATION_COMPANY_${co.key}_SLUG`] = co.slug;
  await member(id, owner, "owner");
  // passport_profile unlocks the `passport` publish destination and
  // communications_center the comms route: without them the API positive
  // controls would be refused for entitlement, not proven allowed.
  for (const f of ["portal_access", "analytics", "company_memory", "conference_mode",
                   "passport_profile", "communications_center"])
    await c.query(`insert into public.company_features (company_id, feature_id)
                   values ($1,$2) on conflict do nothing`, [id, f]);
  // A CEO contact on a reserved domain, so the messages route has someone to
  // "email" -- the staging egress mock records the recipient; nothing is sent.
  await c.query(`update public.companies
                    set profile = coalesce(profile, '{}'::jsonb) || jsonb_build_object('pp', jsonb_build_object('CONTACT', jsonb_build_object('email', $2::text)))
                  where id = $1`, [id, `ceo@${co.slug}.invalid`]);
  console.log(`    ${co.slug.padEnd(24)} ${id}`);
}

// Membership with an EXPLICIT role, corrected on every run (an earlier seed left
// staff at the 'owner' default; `on conflict do nothing` would never fix it).
async function member(companyId, userId, role) {
  await c.query(`insert into public.company_memberships (company_id, user_id, role, status)
                 values ($1,$2,$3,'active')
                 on conflict (company_id, user_id) do update set role = excluded.role, status = 'active'`,
                [companyId, userId, role]);
}
// Both belong to company A only.
await member(out.ISOLATION_COMPANY_A_ID, out._uid_STAFF, "viewer");
await member(out.ISOLATION_COMPANY_A_ID, out._uid_PUBLISHER, "publisher");
await member(out.ISOLATION_COMPANY_A_ID, out._uid_EDITOR, "editor");
await member(out.ISOLATION_COMPANY_A_ID, out._uid_COADMIN, "admin");
await member(out.ISOLATION_COMPANY_A_ID, out._uid_ANALYST, "analyst");
console.log("    memberships: owners=owner; company A: staff=viewer, publisher, editor, coadmin=admin, analyst");

console.log("\n  SENSITIVE ROWS (one per company, for cross-tenant reads to target)");
for (const k of ["A", "B"]) {
  const cid = out[`ISOLATION_COMPANY_${k}_ID`], slug = out[`ISOLATION_COMPANY_${k}_SLUG`];
  const owner = out[`_uid_COMPANY_${k}`];
  const made = [];
  // EVERY ROW IS FOUND-OR-MADE. The first version inserted unconditionally,
  // so a re-seed left three duplicates and then aborted on a unique index --
  // a rig that cannot be re-run is a rig nobody re-runs.
  const title = `iso-thread-${k}`;
  let t = await c.query(`select id from public.mineiq_threads where company_id=$1 and title=$2`, [cid, title]);
  if (!t.rowCount) t = await c.query(
    `insert into public.mineiq_threads (company_id, user_id, title) values ($1,$2,$3) returning id`, [cid, owner, title]);
  const tid = t.rows[0].id;
  const secret = `SECRET-${k}: unreleased assay 31.4 m @ 4.8 g/t`;
  const m = await c.query(`select 1 from public.mineiq_messages where thread_id=$1 and body=$2`, [tid, secret]);
  if (!m.rowCount) await c.query(
    `insert into public.mineiq_messages (thread_id, company_id, role, body) values ($1,$2,'user',$3)`, [tid, cid, secret]);
  made.push("mineiq thread+message");

  const label = `iso-cred-${k}`;
  const sc = await c.query(`select 1 from public.site_credentials where company_id=$1 and label=$2`, [cid, label]);
  if (!sc.rowCount) await c.query(
    `insert into public.site_credentials (company_id, kind, token_hash, label) values ($1,'site',$2,$3)`,
    [cid, `hash-secret-${k}-fixed`, label]);
  made.push("site credential");

  // a17/a21 (0085, 0086): one booth look and one service request per company.
  // Skipped where the migration is not applied, so the seeder runs on any staging.
  if ((await c.query(`select to_regclass('public.conference_booth_configs') is not null x`)).rows[0].x) {
    await c.query(`insert into public.conference_booth_configs (company_id, studio) values ($1, $2) on conflict (company_id) do nothing`,
      [cid, JSON.stringify({ template: "v3", theme: k === "A" ? "dark" : "light" })]);
    made.push("booth config");
  }
  if ((await c.query(`select to_regclass('public.service_requests') is not null x`)).rows[0].x) {
    const sr = await c.query(`select 1 from public.service_requests where company_id=$1 and details=$2`, [cid, `iso-request-${k}`]);
    if (!sr.rowCount) await c.query(`insert into public.service_requests (company_id, service, details) values ($1, 'brand', $2)`, [cid, `iso-request-${k}`]);
    made.push("service request");
  }

  const ma = await c.query(`select count(*)::int n from public.media_assets where company_id=$1`, [cid]);
  if (ma.rows[0].n === 0) await c.query(`insert into public.media_assets (company_id) values ($1)`, [cid]);
  made.push("media asset");

  // Company A's conversation belongs to INVESTOR; company B's to INVESTOR_B.
  const inv = k === "A" ? out._uid_INVESTOR : out._uid_INVESTOR_B;
  let conv = await c.query(`select id from public.conversations where company_slug=$1 and investor_id=$2`, [slug, inv]);
  if (!conv.rowCount) conv = await c.query(
    `insert into public.conversations (investor_id, company_slug) values ($1,$2) returning id`, [inv, slug]);
  const note = `private note to ${k}`;
  const ms = await c.query(`select 1 from public.messages where conversation_id=$1 and body=$2`, [conv.rows[0].id, note]);
  if (!ms.rowCount) await c.query(
    `insert into public.messages (conversation_id, sender, body) values ($1,'investor',$2)`, [conv.rows[0].id, note]);
  made.push(`conversation+message (investor ${k === "A" ? "1" : "2"})`);
  console.log(`    company ${k}: ${made.join(", ")}`);
}

// ---------------------------------------------------------------------------
// API FIXTURES -- what the application-layer suite (api-authz-test.mjs) needs
// for every route to have a POSITIVE control: something the owner may legally
// do, so that the cross-tenant refusal of the same request means something.
// ---------------------------------------------------------------------------
console.log("\n  API FIXTURES");
const ISO_ENV = "supabase/staging/.isolation-env";
const isoEnv = fs.existsSync(ISO_ENV) ? Object.fromEntries(fs.readFileSync(ISO_ENV, "utf8").split("\n").filter(Boolean)
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })) : {};
const SB = `https://${ALLOWED_REFS[0]}.supabase.co`;

const one = async (sql, args) => (await c.query(sql, args)).rows[0];
async function findOrMake(selectSql, selArgs, insertSql, insArgs) {
  const f = await c.query(selectSql, selArgs);
  return f.rowCount ? f.rows[0] : one(insertSql, insArgs);
}

for (const k of ["A", "B"]) {
  const cid = out[`ISOLATION_COMPANY_${k}_ID`], owner = out[`_uid_COMPANY_${k}`];

  // Two publications per company, each RESET to a known state on every run, so
  // a suite that publishes and unpublishes can be re-run: DRAFT (publish target)
  // and PUBLISHED (unpublish / revise target).
  // One update per publication: (update_id, destination_id) is unique.
  const updateFor = (tag) => findOrMake(
    `select id from public.updates where company_id=$1 and body=$2`, [cid, `iso-update-${tag}`],
    `insert into public.updates (company_id, author_id, body) values ($1,$2,$3) returning id`, [cid, owner, `iso-update-${tag}`]);
  const upd = await updateFor(`draft-${k}`);
  const pubFor = async (tag) => {
    const u = await updateFor(tag);
    const p = await findOrMake(
      `select id from public.publications where company_id=$1 and content->>'iso'=$2`, [cid, tag],
      `insert into public.publications (company_id, update_id, destination_id, content) values ($1,$2,'passport',jsonb_build_object('iso',$3::text)) returning id`,
      [cid, u.id, tag]);
    return p.id;
  };
  const draft = await pubFor(`draft-${k}`);
  const live = await pubFor(`published-${k}`);
  await c.query(`update public.publications set status='draft', published_at=null where id=$1`, [draft]);
  await c.query(`update public.publications set status='published', published_at=coalesce(published_at, now()), publish_seq=greatest(coalesce(publish_seq,0),1) where id=$1`, [live]);
  out[`ISOLATION_PUB_DRAFT_${k}`] = draft;
  out[`ISOLATION_PUB_LIVE_${k}`] = live;

  // A post on the published release (posts.publication_id is unique), and
  // engagement on it -- company B's rows are what make the analytics RPC
  // denials distinguishable from "nothing to return".
  const post = await findOrMake(
    `select id from public.posts where publication_id=$1`, [live],
    `insert into public.posts (publication_id, company_id, title, published_at) values ($1,$2,$3,now()) returning id`,
    [live, cid, `iso-post-${k}`]);
  const ev = await one(`select count(*)::int n from public.post_events where post_id=$1`, [post.id]);
  if (ev.n === 0) for (const kind of ["open", "impression", "dwell"])
    await c.query(`insert into public.post_events (post_id, user_id, kind, value) values ($1,$2,$3,$4)`,
      [post.id, out._uid_INVESTOR, kind, kind === "dwell" ? 4000 : 1]);

  // Parents for the four join-scoped children the database suite skipped.
  const asset = await one(`select id from public.media_assets where company_id=$1 order by created_at limit 1`, [cid]);
  await c.query(`insert into public.publication_media (publication_id, media_asset_id) values ($1,$2) on conflict do nothing`, [live, asset.id]);
  const doc = await findOrMake(
    `select id from public.documents where company_id=$1 and filename=$2`, [cid, `iso-doc-${k}.txt`],
    `insert into public.documents (company_id, filename, uploaded_by) values ($1,$2,$3) returning id`, [cid, `iso-doc-${k}.txt`, owner]);
  await c.query(`insert into public.update_documents (update_id, document_id) values ($1,$2) on conflict do nothing`, [upd.id, doc.id]);
  const evt = await findOrMake(
    `select id from public.events where idempotency_key=$1`, [`iso-event-${k}`],
    `insert into public.events (event_type, publication_id, company_id, actor_user_id, idempotency_key) values ('PUBLICATION_PUBLISHED',$1,$2,$3,$4) returning id`,
    [live, cid, owner, `iso-event-${k}`]);
  // Already 'succeeded', so a dispatcher run never re-processes the fixture.
  await findOrMake(`select id from public.event_deliveries where event_id=$1 and listener='iso_fixture'`, [evt.id],
    `insert into public.event_deliveries (event_id, listener, status, processed_at) values ($1,'iso_fixture','succeeded',now()) returning id`, [evt.id]);
  const proj = await findOrMake(
    `select id from public.story_projects where company_id=$1 and title=$2`, [cid, `iso-story-${k}`],
    `insert into public.story_projects (company_id, created_by, title) values ($1,$2,$3) returning id`, [cid, owner, `iso-story-${k}`]);
  await findOrMake(`select id from public.story_renders where project_id=$1`, [proj.id],
    `insert into public.story_renders (project_id, kind, created_by) values ($1,'png',$2) returning id`, [proj.id, owner]);

  // The investor conversation must name the CEO address, so the inbound
  // sender check is exercised rather than skipped (it is skipped when null).
  await c.query(`update public.conversations set ceo_email=$2 where company_slug=$1 and sender_company_id is null and ceo_email is distinct from $2`,
    [out[`ISOLATION_COMPANY_${k}_SLUG`], `ceo@${out[`ISOLATION_COMPANY_${k}_SLUG`]}.invalid`]);
  const conv = await one(`select id from public.conversations where company_slug=$1 order by created_at limit 1`, [out[`ISOLATION_COMPANY_${k}_SLUG`]]);
  out[`ISOLATION_CONVERSATION_${k}`] = conv.id;

  // REAL Site Contract tokens: plaintext kept only in the gitignored env file,
  // sha256 stored, exactly as _siteAuth.js mints them. Rotated every run.
  await c.query(`delete from public.site_credentials where company_id=$1 and label like 'iso-token-%'`, [cid]);
  const mint = async (kind, label, extra = "") => {
    const token = `${kind === "site" ? "mxs_" : "mxd_"}${crypto.randomBytes(24).toString("base64url")}`;
    const hash = crypto.createHash("sha256").update(token, "utf8").digest("hex");
    await c.query(`insert into public.site_credentials (company_id, kind, token_hash, label${extra ? ", " + extra.split("=")[0] : ""})
                   values ($1,$2,$3,$4${extra ? ", " + extra.split("=")[1] : ""})`, [cid, kind, hash, label]);
    return token;
  };
  out[`ISOLATION_SITE_TOKEN_${k}`] = await mint("site", `iso-token-site-${k}`);
  out[`ISOLATION_DRAFT_TOKEN_${k}`] = await mint("draft", `iso-token-draft-${k}`);
  if (k === "A") {
    out.ISOLATION_SITE_TOKEN_A_REVOKED = await mint("site", "iso-token-revoked-A", "revoked_at=now()");
    out.ISOLATION_SITE_TOKEN_A_EXPIRED = await mint("site", "iso-token-expired-A", "expires_at=now() - interval '1 day'");
  }
  // A REMOVED post: hidden by posts.public_read (removed_at is null). Posts are
  // public by design, so "A cannot read B's posts" is false and was only ever
  // passing because B had none. The real property is that the hidden subset
  // stays hidden -- this row is what lets the suite test it.
  // Its own publication, never touched by the suite's publish/unpublish probes.
  const hiddenPub = await pubFor(`hidden-${k}`);
  const hidden = await findOrMake(
    `select id from public.posts where publication_id=$1`, [hiddenPub],
    `insert into public.posts (publication_id, company_id, title, published_at, removed_at) values ($1,$2,$3,now(),now()) returning id`,
    [hiddenPub, cid, `iso-removed-post-${k}`]);
  await c.query(`update public.posts set removed_at=coalesce(removed_at, now()) where id=$1`, [hidden.id]);
  out[`ISOLATION_HIDDEN_POST_${k}`] = hidden.id;

  // Parents the join-scoped probes target. Company B cannot always READ its
  // own parent (events is admin-read only), so the suite takes the id from here.
  out[`ISOLATION_PARENT_PUBLICATIONS_${k}`] = live;
  out[`ISOLATION_PARENT_UPDATES_${k}`] = upd.id;
  out[`ISOLATION_PARENT_EVENTS_${k}`] = evt.id;
  out[`ISOLATION_PARENT_STORY_PROJECTS_${k}`] = proj.id;
  out[`ISOLATION_PARENT_CONVERSATIONS_${k}`] = conv.id;
  console.log(`    company ${k}: draft+published publication, post+events, removed post, 4 join parents, ceo_email, ${k === "A" ? 4 : 2} site tokens`);
}

// Storage objects, uploaded THROUGH the storage API as company B's owner, so the
// path convention and the policies are the real ones. A row-only fixture would
// 404 on fetch whatever the policy said -- a false PASS.
{
  const sign = async (email) => {
    const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST",
      headers: { apikey: isoEnv.ISOLATION_ANON_KEY, "content-type": "application/json" }, body: JSON.stringify({ email, password: PASS }) });
    return r.ok ? (await r.json()).access_token : null;
  };
  const tokB = isoEnv.ISOLATION_ANON_KEY ? await sign("iso-owner-b@staging.invalid") : null;
  if (!tokB) console.log("    storage: SKIPPED (no anon key, or company B could not sign in)");
  else {
    const cidB = out.ISOLATION_COMPANY_B_ID, uidB = out._uid_COMPANY_B;
    for (const [bucket, envName, table] of [["company-docs", "ISOLATION_COMPANY_B_DOC_PATH", "documents"],
                                           ["company-media-private", "ISOLATION_COMPANY_B_PRIVMEDIA_PATH", "media_assets"]]) {
      const name = `${uidB}/${cidB}/iso-object-B.txt`;
      const sp = `${bucket}/${name}`;
      // The table row FIRST. The storage API inserts with RETURNING, and the
      // bucket's SELECT policy (docs_company_read / privmedia_company_read)
      // joins on this row -- without it the owner's own upload is refused.
      if (table === "documents") {
        const d = await c.query(`select 1 from public.documents where storage_path=$1`, [sp]);
        if (!d.rowCount) await c.query(`insert into public.documents (company_id, storage_path, filename, uploaded_by) values ($1,$2,'iso-object-B.txt',$3)`, [cidB, sp, uidB]);
      } else {
        const m = await c.query(`select 1 from public.media_assets where storage_path=$1`, [sp]);
        if (!m.rowCount) await c.query(`insert into public.media_assets (company_id, storage_path, visibility) values ($1,$2,'private')`, [cidB, sp]);
      }
      const up = await fetch(`${SB}/storage/v1/object/${bucket}/${name}`, { method: "POST",
        headers: { apikey: isoEnv.ISOLATION_ANON_KEY, Authorization: `Bearer ${tokB}`, "content-type": "text/plain" },
        body: `iso fixture object for company B in ${bucket}` });
      const why = up.ok ? "" : (await up.text().catch(() => ""));
      if (!up.ok && !/Duplicate|already exists/i.test(why)) { console.log(`    storage ${bucket}: upload refused (${up.status}) ${why.slice(0, 160)}`); continue; }
      out[envName] = name;
      console.log(`    storage ${bucket}: object ${up.ok ? "uploaded" : "already present"} as company B, ${table} row linked`);
    }
  }
}

// Billing state made by the suite's Stripe webhook test (note = 'stripe') is
// removed and the tier restored, so every run starts from the same billing
// state. The MANUAL subscription the admin-billing probe writes is left alone.
const subs = await c.query(`delete from public.company_subscriptions
                             where note = 'stripe' and company_id in (select id from public.companies where slug like 'iso-%')`);
// companies.tier is admin-managed (company_owner_guard, 0031). The guard admits
// provisioning sessions via app.provisioning -- the mechanism
// accept_company_invitation uses -- set LOCAL, so it ends with this transaction.
await c.query("begin");
try {
  await c.query("set local app.provisioning = 'on'");
  await c.query(`update public.companies set tier = 'listing' where slug like 'iso-%' and tier is distinct from 'listing'`);
  await c.query("commit");
} catch (e) { await c.query("rollback"); throw e; }
console.log(`    billing: ${subs.rowCount} Stripe-created subscription row(s) reset; tiers back to 'listing'`);

// Rate-limit counters (forms and the AI guard share submission_throttle) are
// reset, so every suite run starts from the same state -- otherwise a re-run
// inside the window meets limits the previous run used up, and a positive
// control reads 429 instead of the guard's real verdict.
const th = await c.query(`delete from public.submission_throttle`);
console.log(`    submission_throttle: ${th.rowCount} counter row(s) reset`);

// The live RSS feeds seeded by 0018/0024 must never be fetched from staging.
const ns = await c.query(`update public.news_sources set enabled=false where enabled returning key`);
console.log(`    news_sources: ${ns.rowCount} disabled (staging must never fetch live feeds); ${
  (await one(`select count(*)::int n from public.news_sources where enabled`)).n} enabled`);
const pt = await one(`select count(*)::int n from public.push_tokens`);
console.log(`    push_tokens: ${pt.n} (must stay 0 -- staging has no device to reach)`);

if (process.argv.includes("--env") || true) {
  // MERGE, do not clobber. The URL and anon key are written by
  // scripts/staging-anon-key.mjs and are not ours to drop; overwriting the file
  // wholesale silently removed them and every later sign-in failed.
  const ENV = "supabase/staging/.isolation-env";
  const mine = Object.fromEntries(Object.entries(out).filter(([k]) => k.startsWith("ISOLATION_")));
  const existing = fs.existsSync(ENV)
    ? Object.fromEntries(fs.readFileSync(ENV, "utf8").split("\n").filter(Boolean)
        .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }))
    : {};
  const merged = { ...existing, ...mine };
  fs.writeFileSync(ENV, Object.entries(merged).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 0o600 });
  const kept = ["ISOLATION_SUPABASE_URL", "ISOLATION_ANON_KEY"].filter((k) => merged[k]).length;
  console.log(`\n  wrote ${ENV} (${Object.keys(merged).length} vars, ${kept}/2 pre-existing keys preserved)`);
}
// DATABASE EGRESS (S1): a seeded staging database must not be able to reach the
// network on its own -- no active outbound pg_cron job, no HTTP-capable
// function, no webhook trigger, no foreign server, no recent pg_net traffic.
// Read-only; refuses to call the seed good otherwise.
const egress = evaluate(await inspectDatabase(c));
await c.end();
for (const v of egress.contained) console.log(`  contained (inactive): ${v}`);
if (egress.fail.length) {
  console.error("\n  SEEDED, BUT THE DATABASE CAN REACH THE NETWORK:");
  for (const v of egress.fail) console.error(`   ✗ ${v}`);
  process.exit(1);
}
console.log("\n  SEEDED. Database egress: none.\n");
