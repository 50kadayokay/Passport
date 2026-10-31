// Tenant-isolation proof for the Company Portal.
//   node scripts/tenant-isolation-test.mjs
//
// WHAT THIS IS FOR
// ----------------
// The portal is a paid, multi-tenant product whose tenants are competitors. Their
// rows are drill results, assays and unreleased releases. "The policies look
// right" is not a proof, and neither is a unit test over policy SQL -- the thing
// that has to hold is that a REAL authenticated session for company A, holding a
// real JWT, cannot reach company B's rows through PostgREST, through a serverless
// route, or through Storage.
//
// So this suite authenticates five identities for real -- the owner of company
// A, the owner of company B, a staff member of A, an investor and a platform
// admin -- plus the anon key, and then attacks.
//
// WHY IT PROBES INSTEAD OF READING THE SOURCE
// -------------------------------------------
// Every endpoint in api/ rolls its own guard: messages.js defines a local
// authUser(), dispatch.js checks x-dispatch-secret, publish.js imports verifyUser
// from _service.js, compose.js imports verifyBearer from _supabase.js. Grepping
// for an auth pattern produced false positives in BOTH directions when this
// inventory was first built by hand. The only trustworthy answer is the one the
// running server gives.
//
// SAFETY
// ------
// This suite creates and destroys rows. It refuses to run against the production
// project at all, and no flag overrides that -- see assertNotProduction(). Point
// it at a staging Supabase project or a local stack.
//
// HONESTY
// -------
// A test that could not be executed reports SKIP, never PASS. The summary counts
// them separately and a run with any SKIP is not a proof. Read `npm run
// check:isolation -- --matrix` for the full table.

import { COMPANY_SCOPED, INDIRECTLY_SCOPED, PUBLIC_READABLE,
         COMPANY_SCOPED_RPCS, WRITE_ONLY, USER_SCOPED,
         BUCKETS_PRIVATE, BUCKETS_PUBLIC, SEEDED_OBJECT_ENV, PUBLIC_BY_DESIGN }
  from "./_isolation-targets.mjs";
import { SERVICE_ONLY } from "./_isolation-targets.mjs";
import { API_ROUTES } from "./_api-routes.mjs";
import { runApiSuite } from "./api-authz-test.mjs";
import fs from "node:fs";

// ---------------------------------------------------------------- config ----
const SB   = (process.env.ISOLATION_SUPABASE_URL || "").replace(/\/+$/, "");
const ANON =  process.env.ISOLATION_ANON_KEY || "";
const API  = (process.env.ISOLATION_API_BASE  || "").replace(/\/+$/, "");

// Five identities. Passwords come from the environment; nothing is defaulted,
// because a default credential that silently works is a credential in the repo.
const IDS = {
  companyA: { email: process.env.ISOLATION_COMPANY_A_EMAIL, pass: process.env.ISOLATION_COMPANY_A_PASS },
  companyB: { email: process.env.ISOLATION_COMPANY_B_EMAIL, pass: process.env.ISOLATION_COMPANY_B_PASS },
  investor: { email: process.env.ISOLATION_INVESTOR_EMAIL,  pass: process.env.ISOLATION_INVESTOR_PASS  },
  // An active company_memberships row on company A, NOT its owner_id. The
  // second branch of owns_company() is the one a portal invitation creates, and
  // it was the only path into the analytics RPCs with no test behind it.
  // Role 'viewer' (explicit since 2026-10-30; the column default is 'owner').
  staff:    { email: process.env.ISOLATION_STAFF_EMAIL,     pass: process.env.ISOLATION_STAFF_PASS     },
  // Role 'publisher' on company A: the non-owner role actor_can_publish admits.
  publisher: { email: process.env.ISOLATION_PUBLISHER_EMAIL, pass: process.env.ISOLATION_PUBLISHER_PASS },
  // Role 'editor' and company role 'admin' on company A (billing, F2).
  editor:   { email: process.env.ISOLATION_EDITOR_EMAIL,    pass: process.env.ISOLATION_EDITOR_PASS    },
  coadmin:  { email: process.env.ISOLATION_COADMIN_EMAIL,   pass: process.env.ISOLATION_COADMIN_PASS   },
  admin:    { email: process.env.ISOLATION_ADMIN_EMAIL,     pass: process.env.ISOLATION_ADMIN_PASS     },
};
const SLUG_A = process.env.ISOLATION_COMPANY_A_SLUG || "";
const SLUG_B = process.env.ISOLATION_COMPANY_B_SLUG || "";
const ID_A   = process.env.ISOLATION_COMPANY_A_ID   || "";
const ID_B   = process.env.ISOLATION_COMPANY_B_ID   || "";

const WANT_MATRIX = process.argv.includes("--matrix");

// --------------------------------------------------------- the prod guard ----
// The production project ref is already committed in scripts/api-auth-test.mjs,
// which pins it deliberately. Reusing it here means the guard cannot drift from
// the thing it guards.
const PRODUCTION_REFS = ["rvptronniomlqumjhyrr"];

function assertNotProduction() {
  if (!SB) return;
  let host = "";
  try { host = new URL(SB).host; } catch { host = SB; }
  for (const ref of PRODUCTION_REFS) {
    if (host.includes(ref)) {
      console.error("");
      console.error("  REFUSING TO RUN.");
      console.error(`  ISOLATION_SUPABASE_URL points at the production project (${ref}).`);
      console.error("  This suite creates and deletes rows. Point it at staging.");
      console.error("  There is no override flag, by design.");
      console.error("");
      process.exit(2);
    }
  }
}

// ------------------------------------------------------------- the ledger ----
const rows = [];
let pass = 0, fail = 0, skip = 0;

function record(identity, op, target, expected, actual, verdict, note) {
  rows.push({ identity, op, target, expected, actual, verdict, note: note || "" });
  if (verdict === "PASS") pass++;
  else if (verdict === "FAIL") fail++;
  else skip++;
}

// `expectDenied` is the shape of nearly every assertion here: the request went
// out, and what came back must be either an error or an empty result set. An
// empty 200 is a pass -- RLS denies by filtering, not by erroring.
function expectDenied(identity, op, target, status, body, note) {
  const denied = status === 401 || status === 403 || status === 404
    || (status >= 200 && status < 300 && Array.isArray(body) && body.length === 0);
  record(identity, op, target, "denied / empty", `${status} ${summarise(body)}`,
         denied ? "PASS" : "FAIL", note);
  return denied;
}

function expectAllowed(identity, op, target, status, body, note) {
  const allowed = status >= 200 && status < 300;
  record(identity, op, target, "allowed", `${status} ${summarise(body)}`,
         allowed ? "PASS" : "FAIL", note);
  return allowed;
}

const summarise = (b) =>
  Array.isArray(b) ? `[${b.length} row${b.length === 1 ? "" : "s"}]`
  : b && typeof b === "object" ? (b.message || b.error || b.code || "{}")
  : String(b ?? "").slice(0, 60);

// ------------------------------------------------------------- transport ----
async function rest(path, { token, method = "GET", body, prefer } = {}) {
  const headers = { apikey: ANON, "Content-Type": "application/json" };
  headers.Authorization = `Bearer ${token || ANON}`;
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text().catch(() => "");
  let parsed = text; try { parsed = text ? JSON.parse(text) : ""; } catch {}
  return { status: r.status, body: parsed };
}

async function rpc(name, args, token) {
  return rest(`rpc/${name}`, { token, method: "POST", body: args });
}

// A denial assertion for a SECURITY DEFINER function, where an empty 200 does
// NOT mean the same thing it means for a table. RLS denies by filtering, so an
// empty result is a pass for a table read. These functions deny by RAISING, so
// a 2xx of any shape means the body ran -- and an empty one is then ambiguous
// only in the single case where the target tenant genuinely has no rows to
// return. `bHasData` resolves that ambiguity from a probe rather than a guess;
// without it the verdict is SKIP, because an unseeded tenant would hand back a
// clean PASS that proves nothing.
function expectDeniedRpc(identity, op, target, status, body, bHasData, note) {
  let verdict, actual = `${status} ${summarise(body)}`;
  // A plpgsql `raise exception 'not authorized'` carries no SQLSTATE that
  // PostgREST maps to 403, so the guard firing arrives as 400 with that exact
  // message. Matching the message rather than the status keeps the assertion
  // strict: any OTHER 400 (a malformed call, a missing column) still fails.
  const guardRaised = status === 400 && /not authoris?zed|permission denied|insufficient/i.test(JSON.stringify(body || ""));
  if (status === 401 || status === 403 || status === 404 || guardRaised) verdict = "PASS";
  else if (status >= 200 && status < 300) {
    const empty = Array.isArray(body) && body.length === 0;
    if (!empty) verdict = "FAIL";
    else if (bHasData) verdict = "FAIL";
    else { verdict = "SKIP"; note = `${note} -- empty 200 on an unseeded tenant proves nothing`; }
  } else verdict = "FAIL";
  record(identity, op, target, "denied (the guard must raise)", actual, verdict, note);
  return verdict === "PASS";
}

async function signIn(name) {
  const { email, pass } = IDS[name] || {};
  if (!email || !pass) return null;
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: pass }),
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  return j?.access_token || null;
}

/** The `sub` claim of a JWT -- the user id -- read without a DB connection. */
const UID = {};
function subjectOf(jwt) {
  try { return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).sub || ""; }
  catch { return ""; }
}

// =============================================================== the suite ==
async function main() {
  assertNotProduction();

  // --- preflight: a missing environment must SKIP loudly, not quietly pass --
  const missing = [];
  if (!SB)   missing.push("ISOLATION_SUPABASE_URL");
  if (!ANON) missing.push("ISOLATION_ANON_KEY");
  if (!ID_A || !ID_B)     missing.push("ISOLATION_COMPANY_A_ID / _B_ID");
  if (!SLUG_A || !SLUG_B) missing.push("ISOLATION_COMPANY_A_SLUG / _B_SLUG");
  // The env name must match what IDS actually reads, or the error message sends
  // the reader to a variable that does nothing: companyA -> COMPANY_A.
  const envName = (k) => k.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
  for (const k of Object.keys(IDS)) {
    if (!IDS[k].email) missing.push(`ISOLATION_${envName(k)}_EMAIL`);
    if (!IDS[k].pass)  missing.push(`ISOLATION_${envName(k)}_PASS`);
  }

  if (missing.length) {
    console.error("\n  CANNOT RUN — the staging environment is not configured.\n");
    for (const m of missing) console.error(`     missing  ${m}`);
    console.error("\n  Every assertion below would report SKIP, which is not a proof.");
    console.error("  See docs/TENANT-ISOLATION-TESTING.md for the setup steps.\n");
    process.exit(3);
  }

  // --- completeness: the inventory must still match the migrations ---------
  // A new company-scoped table that nobody added here would otherwise be
  // silently untested, which is the exact failure this suite exists to prevent.
  const sql = fs.readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(`supabase/migrations/${f}`, "utf8")).join("\n");
  // USER_SCOPED belongs here too: those tables ARE covered, by the user-scoped
  // assertions rather than the company ones. Omitting them would report a table
  // as untested purely because its tenancy is keyed on the user.
  const declared = new Set([...COMPANY_SCOPED.map(([t]) => t),
                            ...INDIRECTLY_SCOPED.map(([t]) => t),
                            ...USER_SCOPED.map(([t]) => t),
                            ...SERVICE_ONLY.map(([t]) => t)]);
  const found = [...sql.matchAll(/create table if not exists public\.([a-z_]+)\s*\(([\s\S]*?)\n\);/gi)]
    .filter(([, , body]) => /^\s+(company_id|company_slug)\s/m.test(body))
    .map(([, t]) => t);
  const untested = found.filter((t) => !declared.has(t));
  record("suite", "inventory", "company-scoped tables", "all covered",
         untested.length ? `uncovered: ${untested.join(", ")}` : "all covered",
         untested.length ? "FAIL" : "PASS");

  // Same completeness rule for the functions. Any function taking a
  // caller-supplied `p_company uuid` is a tenant boundary; one that is not in
  // COMPANY_SCOPED_RPCS would be a boundary with nothing watching it.
  const declaredRpc = new Set(COMPANY_SCOPED_RPCS.map(([n]) => n));
  const foundRpc = [...new Set([...sql.matchAll(
    /create or replace function public\.([a-z_]+)\s*\(\s*p_company uuid/gi)].map((m) => m[1]))];
  const untestedRpc = foundRpc.filter((n) => !declaredRpc.has(n));
  record("suite", "inventory", "company-scoped RPCs", "all covered",
         untestedRpc.length ? `uncovered: ${untestedRpc.join(", ")}` : `all ${foundRpc.length} covered`,
         untestedRpc.length ? "FAIL" : "PASS");

  // --- authenticate ---------------------------------------------------------
  const tok = {};
  for (const name of Object.keys(IDS)) {
    tok[name] = await signIn(name);
    record(name, "sign-in", "auth/v1/token", "a session",
           tok[name] ? "token issued" : "sign-in failed",
           tok[name] ? "PASS" : "FAIL");
  }
  tok.anon = null; // the anon key alone
  // Record each identity's user id from its own token, so the user-scoped
  // assertions can tell "my row" from "someone else's" with no DB connection.
  for (const [k, v] of Object.entries(tok)) if (v) UID[k] = subjectOf(v);

  // ===================== 1. POSITIVE CONTROLS ============================
  // Run FIRST and deliberately. If company A cannot read its own rows, every
  // denial below is meaningless -- a fully broken database passes a
  // denial-only suite perfectly.
  for (const [table, col] of COMPANY_SCOPED) {
    if (WRITE_ONLY.has(table)) continue;        // insert-only by design; see _isolation-targets
    const val = col === "company_slug" ? SLUG_A : ID_A;
    const { status, body } = await rest(`${table}?${col}=eq.${val}&select=*&limit=1`, { token: tok.companyA });
    record("companyA", "SELECT own", table, "reachable (any row count)",
           `${status} ${summarise(body)}`,
           status >= 200 && status < 300 ? "PASS" : "FAIL",
           "control: proves the denials below are meaningful");
  }
  for (const [table, filter] of PUBLIC_READABLE) {
    // NAMED COLUMNS, not select=*. Where 0061b has replaced table-wide SELECT
    // with per-column grants, select=* FAILS outright instead of omitting what
    // the caller may not read -- so a star here tests 0061b, not the public
    // surface. `id` exists on every table in this list.
    // Where the filter names a column, select THAT -- it provably exists and is
    // readable, since the filter depends on it. Only `companies` needs this
    // (0061b's column grants make select=* fail outright); everywhere else the
    // star is correct, and assuming `id` was wrong -- news_item_companies has
    // no id column at all.
    const named = (filter.match(/^([a-z_]+)=/) || [])[1];
    const cols = named || "*";
    const { status, body } = await rest(`${table}?${filter}${filter ? "&" : ""}select=${cols}&limit=1`, { token: null });
    expectAllowed("anon", "SELECT public", table, status, body,
                  "control: public surface must not go dark (named columns)");
  }

  // ============ 1b. USER-SCOPED TABLES (tenancy is the USER, not the company) ===
  for (const [table, ucol, ctx] of USER_SCOPED) {
    // The row company A's owner filed. Company B's owner must not see it, and
    // neither must an investor -- the company it NAMES is irrelevant to who
    // may read it.
    const mine = await rest(`${table}?select=${ucol},${ctx}`, { token: tok.companyA });
    record("companyA", "SELECT own", table, "reachable (any row count)",
           `${mine.status} ${summarise(mine.body)}`,
           mine.status >= 200 && mine.status < 300 ? "PASS" : "FAIL",
           "control: a user reads their OWN claims");
    for (const who of ["companyB", "investor", "staff"]) {
      if (!tok[who]) continue;
      const r = await rest(`${table}?select=${ucol},${ctx}`, { token: tok[who] });
      const rows = Array.isArray(r.body) ? r.body : [];
      const foreign = rows.filter((x) => x && x[ucol] && x[ucol] !== UID[who]);
      record(who, "SELECT another user's", table, "denied / only their own",
             `${r.status} ${rows.length} row(s), ${foreign.length} belonging to someone else`,
             r.status >= 400 || foreign.length === 0 ? "PASS" : "FAIL",
             "user-scoped: company_slug names the company CLAIMED, not the owner");
    }
  }

  // ===================== 1b. SERVICE-ROLE ONLY ===========================
  for (const [table, col] of SERVICE_ONLY) {
    const probe = await rest(`${table}?select=${col}&limit=1`, { token: null });
    // PostgREST answers PGRST205 / 404 for a table that is not in its schema.
    const absent = probe.status === 404 || (probe.body && /PGRST205|Could not find the table/.test(JSON.stringify(probe.body)));
    if (absent) { record("suite", "SELECT (service-only)", table, "refused", "table not on this database", "SKIP", "migration not applied here yet"); continue; }
    for (const who of ["anon", "companyA", "investor", "staff"]) {
      const r = await rest(`${table}?${col}=eq.${ID_A}&select=*`, { token: who === "anon" ? null : tok[who] });
      expectDenied(who, "SELECT (service-only)", table, r.status, r.body, "no end user may read the ledger, even for their own company");
      const w = await rest(table, { token: who === "anon" ? null : tok[who], method: "POST", body: { id: `evt_iso_${who}`, type: "x", stripe_created: new Date().toISOString(), outcome: "x" } });
      expectDenied(who, "INSERT (service-only)", table, w.status, w.body, "nobody but the service role may write it");
    }
  }

  // ===================== 2. CROSS-TENANT READ ============================
  for (const [table, col] of COMPANY_SCOPED) {
    const val = col === "company_slug" ? SLUG_B : ID_B;
    if (PUBLIC_BY_DESIGN.has(table)) {
      // Public read by design: assert the HIDDEN subset stays hidden instead.
      const spec = PUBLIC_BY_DESIGN.get(table);
      const hidden = spec && process.env[spec.hiddenEnv];
      if (!spec) { console.log(`  note: ${table} read is public by design; no cross-tenant READ assertion (writes still tested)`); continue; }
      if (!hidden) { record("companyA", "SELECT hidden", table, "denied / empty", `no seeded hidden row (${spec.hiddenEnv})`, "SKIP", spec.why); continue; }
      for (const who of ["companyA", "anon", "investor"]) {
        const r = await rest(`${table}?id=eq.${hidden}&select=id`, { token: who === "anon" ? null : tok[who] });
        expectDenied(who, "SELECT hidden", table, r.status, r.body, `B's ${spec.why}`);
      }
      continue;
    }
    const { status, body } = await rest(`${table}?${col}=eq.${val}&select=*`, { token: tok.companyA });
    // Since 0063, conversations.company_slug names the RECIPIENT, so a thread
    // company A started with B carries B's slug -- and A is a party to it. Those
    // rows (sender_company_id = A) are A's own; every OTHER row is still a leak.
    const ownSent = table === "conversations" && Array.isArray(body) ? body.filter((r) => r && r.sender_company_id === ID_A) : [];
    const theirs = ownSent.length ? body.filter((r) => !ownSent.includes(r)) : body;
    expectDenied("companyA", "SELECT other", table, status, theirs,
                 `targeting B via ${col}${ownSent.length ? ` (${ownSent.length} thread(s) A started itself excluded)` : ""}`);
    const anonRes = await rest(`${table}?${col}=eq.${val}&select=*`, { token: null });
    expectDenied("anon", "SELECT other", table, anonRes.status, anonRes.body, "");
    const invRes = await rest(`${table}?${col}=eq.${val}&select=*`, { token: tok.investor });
    expectDenied("investor", "SELECT other", table, invRes.status, invRes.body, "");
  }

  // ===================== 3. CROSS-TENANT WRITE ===========================
  for (const [table, col] of COMPANY_SCOPED) {
    const val = col === "company_slug" ? SLUG_B : ID_B;
    const ins = await rest(table, { token: tok.companyA, method: "POST",
      body: { [col]: val }, prefer: "return=representation" });
    expectDenied("companyA", "INSERT other", table, ins.status, ins.body, "forged company id in payload");

    // THE PAYLOAD IS THE ATTACK. This used to send `updated_at`, which most of
    // these tables do not have: PostgREST answered 400 "could not find the
    // column" and the test could not tell a policy denial from a malformed
    // request, so thirty of them scored as failures that proved nothing.
    //
    // The scoping column is the one column every table here is guaranteed to
    // have -- it is what puts the table in this list -- and rewriting it is the
    // real threat: company A reassigning company B's row to itself. A success
    // is unambiguous theft, not a schema accident.
    const steal = col === "company_slug" ? SLUG_A : ID_A;
    const upd = await rest(`${table}?${col}=eq.${val}`, { token: tok.companyA, method: "PATCH",
      body: { [col]: steal }, prefer: "return=representation" });
    expectDenied("companyA", "UPDATE other (reassign to self)", table, upd.status, upd.body,
                 "rewriting the scoping column is row theft, not a no-op touch");

    const del = await rest(`${table}?${col}=eq.${val}`, { token: tok.companyA, method: "DELETE",
      prefer: "return=representation" });
    expectDenied("companyA", "DELETE other", table, del.status, del.body, "");
  }

  // ===================== 4. INDIRECT (JOIN-SCOPED) =======================
  // The parent id is discovered as company B, then attacked as company A. If the
  // child's policy forgets the join, this is where it shows.
  for (const [child, fk, parent, pcol] of INDIRECTLY_SCOPED) {
    const pval = pcol === "company_slug" ? SLUG_B : ID_B;
    // A conversation with B's slug that company A STARTED is A's own (0063), so
    // the parent must be one A is not a party to.
    const notA = parent === "conversations" ? `&or=(sender_company_id.is.null,sender_company_id.neq.${ID_A})` : "";
    const look = await rest(`${parent}?${pcol}=eq.${pval}${notA}&select=id&limit=1`, { token: tok.companyB });
    // Some parents are not readable even by their own company (events is
    // admin-read only), so the seeded id is the fallback, never a substitute
    // for a discovered one.
    const parentId = (Array.isArray(look.body) && look.body[0]?.id)
      || process.env[`ISOLATION_PARENT_${parent.toUpperCase()}_B`];
    if (!parentId) {
      record("companyA", "SELECT via join", child, "denied / empty", "no fixture parent row", "SKIP",
             `needs a seeded ${parent} row for company B`);
      continue;
    }
    const r = await rest(`${child}?${fk}=eq.${parentId}&select=*`, { token: tok.companyA });
    expectDenied("companyA", "SELECT via join", child, r.status, r.body, `via ${parent}.${pcol}`);
    const w = await rest(child, { token: tok.companyA, method: "POST", body: { [fk]: parentId } });
    expectDenied("companyA", "INSERT via join", child, w.status, w.body, "");
  }

  // ===================== 5. ADMIN RETAINS ACCESS =========================
  if (tok.admin) {
    for (const [table, col] of COMPANY_SCOPED.slice(0, 8)) {
      const val = col === "company_slug" ? SLUG_B : ID_B;
      const { status, body } = await rest(`${table}?${col}=eq.${val}&select=*&limit=1`, { token: tok.admin });
      expectAllowed("admin", "SELECT any", table, status, body, "staff access must survive remediation");
    }
  } else {
    record("admin", "SELECT any", "(all)", "allowed", "no admin session", "SKIP", "admin identity not configured");
  }

  // ===================== 6. COMPANY-SCOPED RPCs ==========================
  // Tables are guarded by RLS, which the database applies unasked. These
  // functions are SECURITY DEFINER -- RLS does not apply inside them at all --
  // so the guard is one line of plpgsql, the tenant is an argument the caller
  // chooses, and the whole boundary is that one line. Attack it from every
  // identity.
  //
  // First, find out whether company B actually has analytics rows. Without that
  // an empty 200 is indistinguishable from a denial, and this phase would hand
  // back a page of meaningless passes against an empty tenant.
  let bHasData = false;
  if (tok.companyB) {
    const probe = await rpc("company_engagement_totals", { p_company: ID_B }, tok.companyB);
    const r0 = Array.isArray(probe.body) ? probe.body[0] : null;
    bHasData = !!r0 && (Number(r0.reads) > 0 || Number(r0.followers) > 0 || Number(r0.posts) > 0);
    record("suite", "probe", "company B has engagement rows", "rows, so a breach would show",
           bHasData ? "seeded" : "EMPTY — denials below cannot be distinguished from nothing to return",
           bHasData ? "PASS" : "SKIP",
           bHasData ? "" : "seed company B in supabase/staging/seed.sql");
  }

  for (const [name, extra, cls] of COMPANY_SCOPED_RPCS) {
    const own   = { p_company: ID_A, ...extra };
    const other = { p_company: ID_B, ...extra };

    // Positive controls first, and for BOTH branches of owns_company(): the
    // owner's owner_id and a staff member's active membership. A guard that
    // denies everyone passes every assertion below and is still broken.
    if (cls === "company-read") {
      for (const who of ["companyA", "staff"]) {
        if (!tok[who]) { record(who, "RPC own", name, "allowed", "no session", "SKIP", "identity not configured"); continue; }
        const r = await rpc(name, own, tok[who]);
        record(who, "RPC own", name, "allowed", `${r.status} ${summarise(r.body)}`,
               r.status >= 200 && r.status < 300 ? "PASS" : "FAIL",
               "control: owns_company() admits owner AND active staff");
      }
    }

    // admin_set_billing and its kind invert the rule: is_admin() is the guard,
    // so the admin IS allowed for any company and everyone else is refused.
    // Checked here rather than skipped, because an admin-only write that a
    // company owner can reach is worse than one an investor can read.
    if (cls === "admin-only") {
      if (tok.admin) {
        const r = await rpc(name, own, tok.admin);
        record("admin", "RPC any", name, "allowed", `${r.status} ${summarise(r.body)}`,
               r.status >= 200 && r.status < 300 ? "PASS" : "FAIL", "control: is_admin() must admit support");
      }
      for (const who of ["companyA", "staff", "investor", "anon"]) {
        if (who !== "anon" && !tok[who]) continue;
        const r = await rpc(name, own, tok[who]);
        expectDeniedRpc(who, "RPC admin-only", name, r.status, r.body, true,
                        "is_admin() is the guard; this is their OWN company and must still be refused");
      }
      continue;
    }

    // The attack. `admin` is in here on purpose and must be DENIED: unlike the
    // tables above, where is_admin() grants platform support cross-tenant read,
    // owns_company() does not consult it -- so a platform admin cannot read a
    // company's analytics through these functions, by design. If that ever
    // becomes a support requirement it needs can_touch_company() and a
    // deliberate decision, not a surprise.
    for (const who of ["companyA", "staff", "investor", "admin", "anon"]) {
      if (who !== "anon" && !tok[who]) continue;
      const r = await rpc(name, other, tok[who]);
      expectDeniedRpc(who, "RPC other", name, r.status, r.body, bHasData,
        who === "admin" ? "owns_company() excludes platform admins by design"
                        : "p_company is chosen by the caller");
    }

    // service-role-only functions: even the legitimate owner must be refused,
    // because the grant -- not the guard -- is what keeps them off the wire.
    if (cls === "internal" && tok.companyA) {
      const r = await rpc(name, own, tok.companyA);
      expectDeniedRpc("companyA", "RPC internal", name, r.status, r.body, true,
                      "service-role only: EXECUTE must not reach an end-user JWT");
    }
  }

  // ===================== 7. SERVERLESS ROUTES ============================
  // Delegated to api-authz-test.mjs: one valid request per route, positive
  // controls first, 400/405/5xx never counted as a denial, and the staging
  // egress log as evidence of what each request reached. The secrets it needs
  // for the shared-secret routes come from supabase/staging/.api-env, which
  // only exists for a LOCAL staging server.
  if (!API) {
    for (const { name } of API_ROUTES) record("anon", "API", `/api/${name}`, "refused", "no API base", "SKIP",
      "set ISOLATION_API_BASE, or run: node scripts/api-authz-test.mjs --local");
  } else {
    const apiEnv = fs.existsSync("supabase/staging/.api-env")
      ? Object.fromEntries(fs.readFileSync("supabase/staging/.api-env", "utf8").split("\n")
          .filter((l) => l && !l.startsWith("#") && l.includes("="))
          .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }))
      : {};
    await runApiSuite({ api: API, tok, env: { ...process.env, ...apiEnv }, record,
      headers: process.env.ISOLATION_API_BYPASS ? { "x-vercel-protection-bypass": process.env.ISOLATION_API_BYPASS } : {} });
  }

  // ===================== 8. STORAGE ======================================
  // Private buckets: fetch a SEEDED object belonging to company B as company A.
  // A listing probe is not used as the assertion, because an empty list is
  // ambiguous between "denied" and "nothing there" -- and because the path
  // convention (<user_uuid>/.../<company_uuid>/file) means a company-id prefix
  // matches nothing regardless of policy.
  for (const [bucket, envName] of SEEDED_OBJECT_ENV) {
    const path = process.env[envName];
    if (!path) {
      record("companyA", "GET storage", bucket, "denied",
             `no seeded object (${envName} unset)`, "SKIP",
             "seed one of B's objects and set this, or the bucket is untested");
      continue;
    }
    // POSITIVE CONTROL first: the owner must be able to fetch this object, or a
    // refusal below could mean "it does not exist" -- a false PASS.
    const own = await fetch(`${SB}/storage/v1/object/${bucket}/${path}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${tok.companyB || ANON}` },
    }).catch(() => ({ status: 0 }));
    record("companyB", "GET storage own", bucket, "200",
           String(own.status || 0),
           (own.status || 0) === 0 ? "SKIP" : own.status === 200 ? "PASS" : "FAIL",
           "control: the object exists and its owner can read it");
    const r = await fetch(`${SB}/storage/v1/object/${bucket}/${path}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${tok.companyA || ANON}` },
    }).catch(() => ({ status: 0 }));
    record("companyA", "GET storage", bucket, "403/404",
           String(r.status || 0),
           (r.status || 0) === 0 ? "SKIP"
             : (r.status === 403 || r.status === 400 || r.status === 404) ? "PASS" : "FAIL",
           `B's object, as A — gated by ${bucket === "company-docs" ? "docs_company_read" : "privmedia_company_read"}`);

    // Same object, unauthenticated.
    const ra = await fetch(`${SB}/storage/v1/object/${bucket}/${path}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    }).catch(() => ({ status: 0 }));
    record("anon", "GET storage", bucket, "403/404",
           String(ra.status || 0),
           (ra.status || 0) === 0 ? "SKIP"
             : (ra.status === 403 || ra.status === 400 || ra.status === 404) ? "PASS" : "FAIL", "");
  }

  // Private buckets must also refuse a cross-tenant LISTING outright. This is a
  // weaker assertion than the fetch above, so it is recorded separately rather
  // than standing in for it.
  for (const [bucket] of BUCKETS_PRIVATE) {
    const r = await fetch(`${SB}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: "", limit: 100 }),
    }).catch(() => ({ status: 0 }));
    const body = r.json ? await r.json().catch(() => "") : "";
    record("anon", "LIST storage", bucket, "denied / empty",
           `${r.status || 0} ${summarise(body)}`,
           (r.status || 0) === 0 ? "SKIP"
             : (r.status === 400 || r.status === 403 || r.status === 404
                || (Array.isArray(body) && body.length === 0)) ? "PASS" : "FAIL",
           "private bucket, unauthenticated");
  }

  // PUBLIC buckets are positive controls: media_public_read grants anon SELECT
  // on these by design, so they must STAY readable. A failure here means a
  // privilege change broke every logo and image on the public site.
  for (const bucket of BUCKETS_PUBLIC) {
    const r = await fetch(`${SB}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: "", limit: 1 }),
    }).catch(() => ({ status: 0 }));
    record("anon", "LIST storage", bucket, "allowed (public by design)",
           String(r.status || 0),
           (r.status || 0) === 0 ? "SKIP" : (r.status >= 200 && r.status < 300) ? "PASS" : "FAIL",
           "control: public media must not go dark");
  }

  // ---------------------------------------------------------------- report --
  if (WANT_MATRIX) {
    console.log("\n  IDENTITY    OPERATION            TARGET                          EXPECTED              ACTUAL                VERDICT");
    console.log("  " + "-".repeat(118));
    for (const r of rows) {
      console.log("  " +
        r.identity.padEnd(11) + " " + r.op.padEnd(20) + " " + r.target.slice(0, 31).padEnd(31) + " " +
        r.expected.slice(0, 21).padEnd(21) + " " + r.actual.slice(0, 21).padEnd(21) + " " + r.verdict);
    }
  }
  for (const r of rows) if (r.verdict === "FAIL")
    console.error(`  ✗ ${r.identity} ${r.op} ${r.target} — expected ${r.expected}, got ${r.actual}${r.note ? ` (${r.note})` : ""}`);

  console.log(`\n  ${pass} passed, ${fail} failed, ${skip} skipped  (${rows.length} assertions)`);
  if (skip) console.log("  NOTE: a run with any SKIP is not a proof of isolation.");
  console.log(fail === 0 && skip === 0
    ? "  TENANT ISOLATION DEMONSTRATED for every target in _isolation-targets.mjs."
    : "  NOT a proof. Resolve failures and skips, then re-run.");
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("  suite crashed:", e); process.exit(1); });
