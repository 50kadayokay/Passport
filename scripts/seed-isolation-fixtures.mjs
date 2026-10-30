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

const ALLOWED_REFS = ["jmljfovtfxcdhjmtlnva"];
const PRODUCTION_REFS = ["rvptronniomlqumjhyrr"];
const PASS = "iso-Staging-" + "Fixture-9471";     // disposable, staging only

const url = (process.env.STAGING_DATABASE_URL || fs.readFileSync("supabase/staging/.connection", "utf8")).trim();
if (PRODUCTION_REFS.some((r) => url.includes(r))) { console.error("\n  REFUSING: production.\n"); process.exit(2); }
if (!ALLOWED_REFS.some((r) => url.includes(r))) { console.error("\n  REFUSING: not the allowlisted staging project.\n"); process.exit(2); }

const IDENTITIES = [
  { key: "COMPANY_A", email: "iso-owner-a@staging.invalid", role: "company" },
  { key: "COMPANY_B", email: "iso-owner-b@staging.invalid", role: "company" },
  { key: "STAFF",     email: "iso-staff-a@staging.invalid", role: "company" },
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
  await c.query(`insert into public.company_memberships (company_id, user_id)
                 values ($1,$2) on conflict do nothing`, [id, owner]);
  for (const f of ["portal_access", "analytics", "company_memory", "conference_mode"])
    await c.query(`insert into public.company_features (company_id, feature_id)
                   values ($1,$2) on conflict do nothing`, [id, f]);
  console.log(`    ${co.slug.padEnd(24)} ${id}`);
}
// The staff member belongs to company A only -- the non-owner case.
await c.query(`insert into public.company_memberships (company_id, user_id)
               values ($1,$2) on conflict do nothing`,
              [out.ISOLATION_COMPANY_A_ID, out._uid_STAFF]);

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
await c.end();
console.log("\n  SEEDED.\n");
