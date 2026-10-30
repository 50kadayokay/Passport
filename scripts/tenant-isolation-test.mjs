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

import { COMPANY_SCOPED, INDIRECTLY_SCOPED, PUBLIC_READABLE, ENDPOINTS,
         COMPANY_SCOPED_RPCS,
         BUCKETS_PRIVATE, BUCKETS_PUBLIC, SEEDED_OBJECT_ENV }
  from "./_isolation-targets.mjs";
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
  staff:    { email: process.env.ISOLATION_STAFF_EMAIL,     pass: process.env.ISOLATION_STAFF_PASS     },
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
  if (status === 401 || status === 403 || status === 404) verdict = "PASS";
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
  const declared = new Set([...COMPANY_SCOPED.map(([t]) => t),
                            ...INDIRECTLY_SCOPED.map(([t]) => t)]);
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

  // ===================== 1. POSITIVE CONTROLS ============================
  // Run FIRST and deliberately. If company A cannot read its own rows, every
  // denial below is meaningless -- a fully broken database passes a
  // denial-only suite perfectly.
  for (const [table, col] of COMPANY_SCOPED) {
    const val = col === "company_slug" ? SLUG_A : ID_A;
    const { status, body } = await rest(`${table}?${col}=eq.${val}&select=*&limit=1`, { token: tok.companyA });
    record("companyA", "SELECT own", table, "reachable (any row count)",
           `${status} ${summarise(body)}`,
           status >= 200 && status < 300 ? "PASS" : "FAIL",
           "control: proves the denials below are meaningful");
  }
  for (const [table, filter] of PUBLIC_READABLE) {
    const { status, body } = await rest(`${table}?${filter}${filter ? "&" : ""}select=*&limit=1`, { token: null });
    expectAllowed("anon", "SELECT public", table, status, body,
                  "control: public surface must not go dark");
  }

  // ===================== 2. CROSS-TENANT READ ============================
  for (const [table, col] of COMPANY_SCOPED) {
    const val = col === "company_slug" ? SLUG_B : ID_B;
    const { status, body } = await rest(`${table}?${col}=eq.${val}&select=*`, { token: tok.companyA });
    expectDenied("companyA", "SELECT other", table, status, body, `targeting B via ${col}`);
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

    const upd = await rest(`${table}?${col}=eq.${val}`, { token: tok.companyA, method: "PATCH",
      body: { updated_at: new Date().toISOString() }, prefer: "return=representation" });
    expectDenied("companyA", "UPDATE other", table, upd.status, upd.body, "");

    const del = await rest(`${table}?${col}=eq.${val}`, { token: tok.companyA, method: "DELETE",
      prefer: "return=representation" });
    expectDenied("companyA", "DELETE other", table, del.status, del.body, "");
  }

  // ===================== 4. INDIRECT (JOIN-SCOPED) =======================
  // The parent id is discovered as company B, then attacked as company A. If the
  // child's policy forgets the join, this is where it shows.
  for (const [child, fk, parent, pcol] of INDIRECTLY_SCOPED) {
    const pval = pcol === "company_slug" ? SLUG_B : ID_B;
    const look = await rest(`${parent}?${pcol}=eq.${pval}&select=id&limit=1`, { token: tok.companyB });
    const parentId = Array.isArray(look.body) && look.body[0]?.id;
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
  if (!API) {
    for (const [name] of ENDPOINTS) record("anon", "POST unauth", `/api/${name}`, "refused", "no API base", "SKIP", "set ISOLATION_API_BASE");
  } else {
    for (const [name, guard] of ENDPOINTS) {
      const r = await fetch(`${API}/api/${name}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: ID_B, company_slug: SLUG_B, publicationId: ID_B }),
      }).catch((e) => ({ status: 0, _err: String(e) }));
      const status = r.status || 0;
      if (guard === "open") {
        record("anon", "POST unauth", `/api/${name}`, "public (no cross-tenant write)",
               String(status), status === 0 ? "SKIP" : "PASS", "intentionally public — see §7");
      } else {
        record("anon", "POST unauth", `/api/${name}`, "401/403/405",
               String(status),
               status === 0 ? "SKIP" : (status === 401 || status === 403 || status === 405) ? "PASS" : "FAIL",
               `declared guard: ${guard}`);
      }
      // Same route, authenticated as A, aimed at B.
      if (tok.companyA) {
        const r2 = await fetch(`${API}/api/${name}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok.companyA}` },
          body: JSON.stringify({ companyId: ID_B, company_slug: SLUG_B, publicationId: ID_B }),
        }).catch(() => ({ status: 0 }));
        const s2 = r2.status || 0;
        record("companyA", "POST cross-tenant", `/api/${name}`, "403/404/400",
               String(s2),
               s2 === 0 ? "SKIP" : (s2 === 403 || s2 === 404 || s2 === 400 || s2 === 401) ? "PASS" : "FAIL",
               "authenticated as A, body names B");
      }
    }
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
