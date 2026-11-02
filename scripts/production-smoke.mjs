// Post-launch verification (launch gate g11). READ-ONLY by design.
//
//   node scripts/production-smoke.mjs --app <web app URL> --supabase <project URL> [--production] [--api-only]
//
// Answers one question after a deploy: does the live app work for the people who
// use it, and does it still keep each of them to their own data?
//
//   ANON      the public feed and company cards load; private tables, another
//             company's notifications and the portal RPCs give a guest nothing
//   INVESTOR  signs in; the feed, a company profile and its posts load; Mine IQ
//             (the company's own knowledge) refuses an investor
//   OWNER     signs in; sees their company as owner with portal access; its
//             notifications and Mine IQ (search, conversations) load
//   VIEWER    (optional) sees the company as viewer; the server would refuse
//             "Clear all" (0090) and edits (0072 / 0076)
//   HEADERS   HSTS, nosniff, frame-ancestors + X-Frame-Options, Referrer-Policy on the page (as
//             vercel.json sets them, PAGE_HEADERS) and nosniff alone on
//             the API; no credentialed wildcard CORS
//   5xx       every response of the run; any 5xx fails it
//
// READ-ONLY. Every request goes through send() below, which allows GET and
// HEAD, the password sign-in and sign-out, and POST only to the read-only RPCs
// in READ_RPCS (all `stable`). Anything else throws before it leaves the
// process, and scripts/production-smoke-test.mjs proves it. The one write the
// run cannot avoid is GoTrue's own: signing in opens a session, and the run
// signs out at the end to close it. Viewer refusals are checked by asking the
// server's role function (has_company_role, exactly what 0090 and the RLS
// policies call) -- never by attempting the write, which would clear a real
// company's page if the check had regressed.
//
// TARGET. Nothing defaults: --app and --supabase are required, https only (http
// only on loopback, for the staging emulator). The production project also needs
// --production, and --production on any other project is refused, so a mistyped
// URL cannot be taken for the one you meant. --api-only is for a target that
// serves the API but not the web app (scripts/staging-api-server.mjs): the page
// and header checks are then SKIPPED and the run cannot PASS.
//
// ACCOUNTS (from the environment only; never printed):
//   SMOKE_INVESTOR_EMAIL / SMOKE_INVESTOR_PASSWORD   a test investor (g07)
//   SMOKE_OWNER_EMAIL / SMOKE_OWNER_PASSWORD         a test company owner (g07)
//   SMOKE_VIEWER_EMAIL / SMOKE_VIEWER_PASSWORD       optional: a viewer of that company
//   SMOKE_COMPANY_SLUG    optional: which of the owner's companies (default: the first owned)
//   SMOKE_ANON_KEY        optional: the publishable key (default: read from the app's bundle)
// A missing account SKIPS its section. Output is redacted: no token, key or
// password reaches stdout or stderr.
//
// EXIT: 0 PASS (nothing failed, nothing skipped) · 1 FAIL · 2 REFUSED · 3 INCOMPLETE.
import { pathToFileURL } from "node:url";
import { PRODUCTION_REFS } from "./_target-guard.mjs";

export const READ_RPCS = ["company_follower_count", "my_features", "company_notifications", "has_company_role", "mineiq_search"];
// What vercel.json sets on every page (not /api/, not /assets/); scripts/security-headers-test.mjs
// checks the two agree. Everything gets nosniff.
export const PAGE_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "content-security-policy": "frame-ancestors 'self' capacitor://localhost",
  "x-frame-options": "SAMEORIGIN",
};
const MANAGERS = ["owner", "admin"];                         // 0090: Clear all
const PROFILE_EDITORS = ["owner", "admin", "editor"];        // 0072 save_profile_draft
const DRAFTERS = ["owner", "admin", "editor", "publisher"];  // 0076 updates policies
// Tables a guest must get nothing from (0061a: anon reads no user-keyed table).
const PRIVATE_TABLES = ["profiles", "investor_profiles", "company_memberships", "company_subscriptions", "company_notification_reads", "mineiq_threads", "mineiq_messages", "facts", "conversations", "push_tokens"];

const isLoopback = (u) => ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);

/** The target, or { refuse } -- decided before any request. */
export function parseTarget(argv) {
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null; };
  const flag = (k) => argv.includes(k);
  const appRaw = arg("--app"), sbRaw = arg("--supabase");
  if (!appRaw || !sbRaw) return { refuse: "pass the target explicitly: --app <web app URL> --supabase <project URL>. Nothing defaults." };
  let app, sb;
  try { app = new URL(appRaw); sb = new URL(sbRaw); } catch { return { refuse: "--app and --supabase must be URLs." }; }
  for (const [name, u] of [["--app", app], ["--supabase", sb]]) {
    if (u.protocol !== "https:" && !(u.protocol === "http:" && isLoopback(u))) return { refuse: `${name} must be https (http only on loopback).` };
    if (u.username || u.password) return { refuse: `${name} must not carry credentials.` };
  }
  const ref = isLoopback(sb) ? null : sb.hostname.split(".")[0];
  const production = !!ref && PRODUCTION_REFS.includes(ref);
  if (production && !flag("--production")) return { refuse: "that is the PRODUCTION project. Add --production to mean it." };
  if (!production && flag("--production")) return { refuse: "--production was passed but that is not the production project." };
  return { app: app.origin, supabase: sb.origin, ref, production, apiOnly: flag("--api-only") };
}

/** Why send() must not make this request, or null when it is one of the read-only kinds. */
export function refuseRequest(method, url, { app, supabase }) {
  const u = new URL(url);
  if (u.origin !== app && u.origin !== supabase) return `${u.origin} is not the target`;
  if (method === "GET" || method === "HEAD") return null;
  if (method === "POST" && u.origin === supabase) {
    if (u.pathname === "/auth/v1/token" && u.searchParams.get("grant_type") === "password" && [...u.searchParams.keys()].length === 1) return null;
    if (u.pathname === "/auth/v1/logout" && !u.search) return null;
    const rpc = u.pathname.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/);
    if (rpc && READ_RPCS.includes(rpc[1]) && !u.search) return null;
  }
  return `${method} ${u.pathname} is not one of the read-only requests`;
}

/** Removes every secret the run knows, and anything shaped like one. */
export function makeRedactor(secrets) {
  const known = secrets.filter((s) => s && String(s).length >= 6).map(String);
  return (text) => {
    let s = String(text);
    for (const k of known) s = s.split(k).join("[redacted]");
    return s.replace(/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, "[redacted-jwt]")
      .replace(/sb_(publishable|secret)_[\w-]{8,}/g, "[redacted-key]")
      .replace(/"(access_token|refresh_token|provider_token)"\s*:\s*"[^"]*"/g, '"$1":"[redacted]"');
  };
}

/** Finds the publishable key in the app's bundle (it ships there by design). */
export function anonKeyFromBundle(js, ref) {
  const pub = js.match(/sb_publishable_[\w-]{20,}/);
  if (pub) return pub[0];
  for (const m of js.matchAll(/eyJ[\w-]+\.([\w-]+)\.[\w-]+/g)) {
    try {
      const p = JSON.parse(Buffer.from(m[1], "base64url").toString("utf8"));
      if (p.role === "anon" && (!ref || p.ref === ref)) return m[0];
    } catch { /* not a JWT */ }
  }
  return null;
}

export async function runSmoke({ target, env = {}, fetchImpl = globalThis.fetch, out = console.log, err = console.error }) {
  const { app: APP, supabase: SB } = target;
  const accounts = {
    investor: env.SMOKE_INVESTOR_EMAIL && env.SMOKE_INVESTOR_PASSWORD ? { email: env.SMOKE_INVESTOR_EMAIL, password: env.SMOKE_INVESTOR_PASSWORD } : null,
    owner: env.SMOKE_OWNER_EMAIL && env.SMOKE_OWNER_PASSWORD ? { email: env.SMOKE_OWNER_EMAIL, password: env.SMOKE_OWNER_PASSWORD } : null,
    viewer: env.SMOKE_VIEWER_EMAIL && env.SMOKE_VIEWER_PASSWORD ? { email: env.SMOKE_VIEWER_EMAIL, password: env.SMOKE_VIEWER_PASSWORD } : null,
  };
  const secrets = [env.SMOKE_ANON_KEY, ...Object.values(accounts).flatMap((a) => (a ? [a.password] : []))];
  let redact = makeRedactor(secrets);
  const say = (m) => out(redact(m)), shout = (m) => err(redact(m));
  let pass = 0, fail = 0, skip = 0;
  const ok = (c, m, d = "") => { if (c) { pass++; say(`  ✓ ${m}`); } else { fail++; shout(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
  const skipped = (m, why) => { skip++; say(`  - SKIP ${m} (${why})`); };
  const responses = [];
  const tokens = [];

  // The only door out of this process.
  async function send(method, url, { headers = {}, body } = {}) {
    const why = refuseRequest(method, url, target);
    if (why) throw new Error(`read-only guard: ${why}`);
    const u = new URL(url);
    const r = await fetchImpl(u.href, { method, headers: { ...headers, ...(body !== undefined ? { "content-type": "application/json" } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: "manual" });
    const text = method === "HEAD" ? "" : await r.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    responses.push({ method, where: `${u.origin === SB ? "supabase" : "app"} ${u.pathname}`, status: r.status });
    return { status: r.status, headers: r.headers, text, body: json };
  }
  let ANON = env.SMOKE_ANON_KEY || null;
  const rest = (token, path) => send("GET", `${SB}/rest/v1/${path}`, { headers: { apikey: ANON, Authorization: `Bearer ${token || ANON}` } });
  const rpcCall = (token, fn, args) => send("POST", `${SB}/rest/v1/rpc/${fn}`, { headers: { apikey: ANON, Authorization: `Bearer ${token || ANON}` }, body: args });
  const nothingFor = (r) => r.status === 401 || r.status === 403 || (r.status === 200 && Array.isArray(r.body) && r.body.length === 0);
  const refused = (r) => r.status === 401 || r.status === 403;
  async function signIn(who) {
    const a = accounts[who];
    const r = await send("POST", `${SB}/auth/v1/token?grant_type=password`, { headers: { apikey: ANON }, body: { email: a.email, password: a.password } });
    const s = r.body || {};
    if (r.status !== 200 || !s.access_token || !s.user || !s.user.id) { ok(false, `${who}: signs in`, `${r.status}`); return null; }
    tokens.push(s.access_token, s.refresh_token);
    redact = makeRedactor([...secrets, ...tokens]);
    ok(true, `${who}: signs in`);
    return { token: s.access_token, uid: s.user.id };
  }
  const mode = target.production ? "PRODUCTION (read-only)" : target.ref ? `project ${target.ref}` : "loopback";
  say(`\n  production-smoke  ${APP}  ->  ${SB}  [${mode}${target.apiOnly ? ", API only" : ""}]`);

  const sessions = [];
  try {
    // ---------------------------------------------------------------- the page --
    say("\n  WEB APP");
    let html = null, mainJs = null;
    if (target.apiOnly) skipped("the page, its bundle and the page's headers", "--api-only: this target does not serve the web app");
    else {
      html = await send("GET", `${APP}/`);
      ok(html.status === 200 && /<div id="root"/.test(html.text), "the page loads (200, app root)", `${html.status}`);
      const src = (html.text.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/) || [])[1];
      if (src) {
        mainJs = await send("GET", new URL(src, APP).href);
        ok(mainJs.status === 200 && mainJs.text.length > 1000, "its bundle loads", `${mainJs.status}`);
        ok(mainJs.text.includes(SB), "the bundle names the Supabase project given", "the --supabase URL is not in the bundle");
        if (!ANON) ANON = anonKeyFromBundle(mainJs.text, target.ref);
      } else ok(false, "the page names its bundle");
    }
    if (!ANON) { ok(false, "a publishable key (SMOKE_ANON_KEY or the app's bundle)", "no key: nothing below can run"); throw new Error("stop"); }
    redact = makeRedactor([...secrets, ANON, ...tokens]);

    // ------------------------------------------------------------------ headers --
    say("\n  SECURITY HEADERS");
    const api = await send("GET", `${APP}/api/messages`);
    ok(api.status === 405, "the API answers (GET /api/messages -> 405, not a 5xx or the app page)", `${api.status}`);
    const checkHeaders = (label, h, { page }) => {
      const https = APP.startsWith("https:");
      if (https) ok(/max-age=\d{6,}/.test(h.get("strict-transport-security") || ""), `${label}: Strict-Transport-Security`, h.get("strict-transport-security") || "missing");
      ok((h.get("x-content-type-options") || "").toLowerCase() === "nosniff", `${label}: X-Content-Type-Options nosniff`, h.get("x-content-type-options") || "missing");
      if (page) {
        ok(h.get("content-security-policy") === PAGE_HEADERS["content-security-policy"], `${label}: CSP ${PAGE_HEADERS["content-security-policy"]}`, h.get("content-security-policy") || "missing");
        ok((h.get("x-frame-options") || "").toUpperCase() === PAGE_HEADERS["x-frame-options"], `${label}: X-Frame-Options SAMEORIGIN`, h.get("x-frame-options") || "missing");
        ok(/^default-src 'self';/.test(h.get("content-security-policy-report-only") || ""), `${label}: CSP Report-Only (script policy, observed not enforced)`, "missing");
        ok(h.get("referrer-policy") === PAGE_HEADERS["referrer-policy"], `${label}: Referrer-Policy ${PAGE_HEADERS["referrer-policy"]}`, h.get("referrer-policy") || "missing");
      } else {
        // The API is fetched cross-origin (company websites, the native apps): no framing or referrer rules there.
        ok(!h.get("x-frame-options") && !/frame-ancestors/.test(h.get("content-security-policy") || ""), `${label}: no page-only framing headers`);
      }
      ok(!(h.get("access-control-allow-origin") === "*" && h.get("access-control-allow-credentials") === "true"), `${label}: no credentialed wildcard CORS`);
      ok(!h.get("x-powered-by"), `${label}: no X-Powered-By`, h.get("x-powered-by") || "");
    };
    if (target.apiOnly) skipped("header checks", "--api-only: headers here come from the local emulator, not the host");
    else { checkHeaders("page", html.headers, { page: true }); checkHeaders("API", api.headers, { page: false }); }

    // --------------------------------------------------------------------- anon --
    say("\n  ANON (signed out)");
    const since = new Date(Date.now() - 90 * 864e5).toISOString();
    let r = await rest(null, `news_public?select=*&published_at=gte.${encodeURIComponent(since)}&order=published_at.desc&limit=20`);
    ok(r.status === 200 && Array.isArray(r.body), "the public news feed loads  [feed.js]", `${r.status}`);
    r = await rest(null, "companies?select=id,slug,name,primary_ticker,tier&limit=20");
    ok(r.status === 200 && Array.isArray(r.body), `public company cards load (${Array.isArray(r.body) ? r.body.length : "?"})  [feed.js]`, `${r.status}`);
    const publicCompanies = Array.isArray(r.body) ? r.body : [];
    r = await rest(null, "companies?select=owner_id&limit=1");
    ok(r.status !== 200 || (Array.isArray(r.body) && r.body.every((c) => !("owner_id" in c) || c.owner_id === null)), "a guest cannot read owner_id (0061b column grants)", `${r.status}`);
    for (const t of PRIVATE_TABLES) {
      r = await rest(null, `${t}?select=*&limit=1`);
      ok(nothingFor(r) || r.status === 404, `a guest reads nothing from ${t}`, `${r.status} ${Array.isArray(r.body) ? `${r.body.length} rows` : ""}`);
    }

    // ----------------------------------------------------------------- investor --
    // ------------------------------------------------------------------- owner --
    let company = null;   // the owner's company; the investor and viewer are checked against it
    let own = null;
    if (accounts.owner) {
      say("\n  OWNER");
      own = await signIn("owner");
      if (own) {
        sessions.push(own);
        r = await rest(own.token, `company_memberships?user_id=eq.${own.uid}&status=eq.active&select=role,company:companies(id,slug,name,status)&order=joined_at.desc`);
        const owned = (Array.isArray(r.body) ? r.body : []).filter((m) => m && m.role === "owner" && m.company);
        const pick = env.SMOKE_COMPANY_SLUG ? owned.find((m) => m.company.slug === env.SMOKE_COMPANY_SLUG) : owned[0];
        ok(r.status === 200 && !!pick, `sees their company as owner${pick ? ` (${pick.company.slug})` : ""}  [portalGate.loadMemberships]`, `${r.status}, ${owned.length} owned`);
        company = pick ? pick.company : null;
      }
    } else skipped("OWNER", "SMOKE_OWNER_EMAIL / SMOKE_OWNER_PASSWORD not set (g07)");
    if (own && company) {
      r = await rpcCall(own.token, "my_features", { cid: company.id });
      ok(r.status === 200 && Array.isArray(r.body) && r.body.includes("portal_access"), "has portal access  [portalGate.loadPortalAccess]", `${r.status}`);
      r = await rpcCall(own.token, "has_company_role", { p_company: company.id, p_roles: MANAGERS });
      ok(r.status === 200 && r.body === true, "the server counts them as a manager (may Clear all, 0090)", `${r.status} ${JSON.stringify(r.body)}`);
      r = await rpcCall(own.token, "company_notifications", { p_company: company.id, p_limit: 20 });
      ok(r.status === 200 && Array.isArray(r.body), `notifications load (${Array.isArray(r.body) ? r.body.length : "?"})  [companyNotifications.js]`, `${r.status}`);
      r = await rpcCall(own.token, "mineiq_search", { p_company: company.id, p_query: "project", p_limit: 5 });
      ok(r.status === 200 && Array.isArray(r.body), "Mine IQ search answers  [api/_mineiqSearch.js]", `${r.status}`);
      r = await rest(own.token, `mineiq_threads?company_id=eq.${company.id}&select=id,title,updated_at&order=updated_at.desc&limit=5`);
      ok(r.status === 200 && Array.isArray(r.body), "Mine IQ conversations load  [mineiqChat.listThreads]", `${r.status}`);
      r = await rest(own.token, `company_subscriptions?company_id=eq.${company.id}&select=status&limit=1`);
      ok(r.status === 200 && Array.isArray(r.body), "the billing page's subscription read answers  [billing.js]", `${r.status}`);
    }

    let inv = null;
    if (accounts.investor) {
      say("\n  INVESTOR");
      inv = await signIn("investor");
      if (inv) sessions.push(inv);
    }
    if (inv) {
      r = await rest(inv.token, `profiles?id=eq.${inv.uid}&select=role`);
      ok(r.status === 200 && Array.isArray(r.body) && r.body[0] && r.body[0].role === "investor", "their profile is an investor's  [portalGate.loadPlatformRole]", `${r.status} ${JSON.stringify(r.body)}`);
      r = await rest(inv.token, `news_public?select=*&published_at=gte.${encodeURIComponent(since)}&order=published_at.desc&limit=20`);
      ok(r.status === 200 && Array.isArray(r.body), "the feed loads  [feed.js]", `${r.status}`);
      const shown = (company && publicCompanies.find((c) => c.id === company.id)) || publicCompanies[0] || null;
      if (shown) {
        r = await rest(inv.token, `companies?id=eq.${shown.id}&select=id,slug,name,primary_ticker,tier,brand:profile->brand,commodity:profile->pp->COMPANY->>commodity,jurisdiction:profile->pp->COMPANY->>jurisdiction`);
        ok(r.status === 200 && Array.isArray(r.body) && r.body.length === 1, `a company profile loads (${shown.slug})  [feed.js:124]`, `${r.status}`);
        r = await rest(inv.token, `posts?company_id=eq.${shown.id}&removed_at=is.null&select=*&order=published_at.desc&limit=20`);
        ok(r.status === 200 && Array.isArray(r.body), `its posts load (${Array.isArray(r.body) ? r.body.length : "?"})  [feed.js]`, `${r.status}`);
        r = await rpcCall(inv.token, "company_follower_count", { cid: shown.id });
        ok(r.status === 200 && typeof r.body === "number", "its follower count loads  [feed.js:62]", `${r.status}`);
        r = await rpcCall(inv.token, "mineiq_search", { p_company: shown.id, p_query: "project", p_limit: 5 });
        ok(refused(r), "Mine IQ, the company's own knowledge, refuses an investor (42501)", `${r.status}`);
      } else skipped("company profile", "no public company to open");
      if (company) {
        r = await rest(inv.token, `company_memberships?company_id=eq.${company.id}&select=user_id,role`);
        ok(nothingFor(r), "an investor reads nobody's memberships", `${r.status}`);
        r = await rpcCall(inv.token, "company_notifications", { p_company: company.id, p_limit: 5 });
        ok(refused(r), "an investor cannot read a company's notifications", `${r.status}`);
      }
    } else if (!accounts.investor) skipped("INVESTOR", "SMOKE_INVESTOR_EMAIL / SMOKE_INVESTOR_PASSWORD not set (g07)");

    if (company) {
      r = await rpcCall(null, "company_notifications", { p_company: company.id, p_limit: 5 });
      ok(refused(r), "a guest cannot read the company's notifications", `${r.status}`);
      r = await rpcCall(null, "my_features", { cid: company.id });
      ok(r.status !== 200 || (Array.isArray(r.body) && !r.body.includes("portal_access")), "a guest gets no portal features", `${r.status}`);
    }

    // ------------------------------------------------------------------ viewer --
    if (!accounts.viewer) skipped("VIEWER", "SMOKE_VIEWER_EMAIL / SMOKE_VIEWER_PASSWORD not set (optional)");
    else if (!company) skipped("VIEWER", "no owner company to check against");
    else {
      say("\n  VIEWER");
      const vw = await signIn("viewer");
      if (vw) {
        sessions.push(vw);
        r = await rest(vw.token, `company_memberships?user_id=eq.${vw.uid}&company_id=eq.${company.id}&status=eq.active&select=role`);
        ok(r.status === 200 && Array.isArray(r.body) && r.body[0] && r.body[0].role === "viewer", "sees the company as viewer", `${r.status} ${JSON.stringify(r.body)}`);
        r = await rpcCall(vw.token, "company_notifications", { p_company: company.id, p_limit: 5 });
        ok(r.status === 200 && Array.isArray(r.body), "reads the notifications", `${r.status}`);
        for (const [roles, what] of [[MANAGERS, "Clear all (0090)"], [PROFILE_EDITORS, "profile edits (0072)"], [DRAFTERS, "release and media drafts (0076)"]]) {
          r = await rpcCall(vw.token, "has_company_role", { p_company: company.id, p_roles: roles });
          ok(r.status === 200 && r.body === false, `the server refuses a viewer ${what}`, `${r.status} ${JSON.stringify(r.body)}`);
        }
      }
    }
  } catch (e) {
    if (e.message !== "stop") ok(false, "the run completed", e.message);
  } finally {
    for (const s of sessions) { try { await send("POST", `${SB}/auth/v1/logout`, { headers: { apikey: ANON, Authorization: `Bearer ${s.token}` } }); } catch { /* best effort */ } }
  }

  say("\n  RESPONSES");
  const five = responses.filter((x) => x.status >= 500);
  ok(responses.length > 0 && five.length === 0, `no 5xx in ${responses.length} responses`, five.map((x) => `${x.status} ${x.method} ${x.where}`).join("; "));
  const verdict = fail ? "FAIL" : skip ? "INCOMPLETE" : "PASS";
  say(`\n  production-smoke: ${pass} passed, ${fail} failed, ${skip} skipped -> ${verdict}\n`);
  return { pass, fail, skip, verdict, responses };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const target = parseTarget(process.argv.slice(2));
  if (target.refuse) { console.error(`\n  production-smoke: REFUSING -- ${target.refuse}\n`); process.exit(2); }
  const res = await runSmoke({ target, env: process.env });
  process.exit(res.verdict === "PASS" ? 0 : res.verdict === "FAIL" ? 1 : 3);
}
