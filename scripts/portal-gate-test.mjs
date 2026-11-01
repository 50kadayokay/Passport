// a02 offline gate suite: who sees which screen at /portal, and which controls
// each company role gets. Runs the REAL PortalGate resolver (src/portal/
// PortalGate.jsx + src/lib/portalGate.js + lib/auth.js) against a stub that
// plays Supabase, then renders each resulting screen with react-dom/server.
//   node scripts/portal-gate-test.mjs
//
// OFFLINE. fetch answers only from the stub below; an unexpected request
// fails the test rather than leaving the machine. No credential, no database.
// Browser-only behaviour (effects, clicks) is covered by the /qa/s3 harness
// run, recorded in SESSION-STATUS.md.
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installBrowserGlobals, installFetch, signIn, signOutLocal, setLocation, loadBundle, json, reporter, STUB_SB } from "./_portal-offline.mjs";

const { ok, section, done } = reporter("portal-gate");
installBrowserGlobals();

const A = "aaaaaaaa-0000-4000-8000-00000000000a", B = "bbbbbbbb-0000-4000-8000-00000000000b";
const CO = {
  [A]: { id: A, slug: "alpha-gold", name: "Alpha Gold Corp.", status: "published" },
  [B]: { id: B, slug: "beta-copper", name: "Beta Copper Ltd.", status: "draft" },
};
// user id -> { platform role, memberships: [[companyId, role]] }
const USERS = {
  investor: { role: "investor", m: [] },
  owner:    { role: "company", m: [[A, "owner"]] },
  multi:    { role: "company", m: [[A, "editor"], [B, "viewer"]] },
  admin:    { role: "admin",   m: [] },
  odd:      { role: "company", m: [[A, "superuser"]] },          // malformed role
  ...Object.fromEntries(["admin_m", "editor", "publisher", "analyst", "viewer"].map((r) => [r, { role: "company", m: [[A, r === "admin_m" ? "admin" : r]] }])),
};
const ENTITLED = new Set([A]);                 // B has no portal_access
let mode = "normal";                           // normal | down | revoked | badjson
let refreshOk = true;
const accepted = [];

const calls = installFetch(async (req) => {
  const { url, method, token } = req;
  if (url.origin !== STUB_SB) return undefined;
  if (url.pathname === "/auth/v1/token") {
    return refreshOk ? json({ access_token: "tok-refreshed", refresh_token: "r2", expires_in: 3600, user: JSON.parse(localStorage.getItem("pp.session")).user })
                     : json({ error: "invalid_grant" }, 400);
  }
  if (mode === "down") throw new TypeError("fetch failed");
  if (mode === "revoked") return json({ message: "JWT expired" }, 401);
  if (mode === "server500") return json({ message: "boom" }, 500);
  const uid = token.replace(/^tok-/, "").replace(/^refreshed$/, "owner");
  const u = USERS[uid];
  if (!u) return json({ message: "no such token" }, 401);
  const p = url.pathname;
  if (p === "/rest/v1/company_memberships" && method === "GET") {
    if (mode === "badjson") return new Response("<html>gateway</html>", { status: 200 });
    return json(u.m.map(([cid, role]) => ({ role, joined_at: "2026-10-01", company: CO[cid] })));
  }
  if (p === "/rest/v1/profiles") return json([{ role: u.role }]);
  if (p === "/rest/v1/rpc/my_features") {
    const cid = JSON.parse(req.body).cid;
    const member = u.m.some(([c]) => c === cid);
    return json(u.role === "admin" || (member && ENTITLED.has(cid)) ? ["portal_access", "analytics"] : []);
  }
  if (p === "/rest/v1/companies") {
    const slug = (url.searchParams.get("slug") || "").replace(/^eq\./, "");
    return json(Object.values(CO).filter((c) => c.slug === slug));
  }
  if (p === "/rest/v1/rpc/accept_company_invitation") {
    const t = JSON.parse(req.body).p_token; accepted.push(t);
    return json(t === "good" ? { ok: true } : t === "mismatch" ? { ok: false, error: "email_mismatch" } : { ok: false, error: t });
  }
  if (p === "/rest/v1/company_subscriptions") return json([]);
  return undefined;
});

const M = await loadBundle("gate", `
  export { resolvePortal, enterCompany, GateScreen } from "./src/portal/PortalGate.jsx";
  export { normaliseRole } from "./src/lib/portalGate.js";
  export { getMyRole, getSession } from "./src/lib/auth.js";
  export { can, ROLES } from "./src/lib/companyRoles.js";
  export { default as LoginScreen } from "./src/auth/LoginScreen.jsx";
`);
const html = (state, companies = [], extra = {}) => renderToStaticMarkup(React.createElement(M.GateScreen, { state, companies, onEnter() {}, onRetry() {}, onSignOut() {}, onSignInAgain() {}, ...extra }));
const as = (id, opts) => { signIn({ id, email: `${id}@stub.invalid` }, opts); };
const resolve = async (search = "") => { setLocation(search); return M.resolvePortal({ search, clearInvite: () => history.replaceState(null, "", "/portal") }); };
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

section("SIGNED OUT");
{
  signOutLocal();
  ok((await M.getSession()) === null, "no stored session -> getSession() null (AuthGate renders its sign-in screen)");
  const login = renderToStaticMarkup(React.createElement(M.LoginScreen, { title: "Sign in to your Company Portal", subtitle: "Manage your company on MineEx" }));
  ok(/Sign in to your Company Portal/.test(text(login)) && /type="password"/.test(login), "sign-in screen carries the portal's title and a password field");
  const r = await resolve();
  ok(r.state.phase === "expired", "gate reached with no session -> 'session expired' screen, never 'no company portal'", r.state.phase);
  ok(!calls.some((c) => c.url.pathname.startsWith("/rest/")), "no data request is made without a session");
}

section("INVESTOR (NO COMPANY)");
{
  as("investor");
  const r = await resolve();
  ok(r.state.phase === "denied", "investor -> denied", r.state.phase);
  const t = text(html(r.state));
  ok(/No company portal on this account/.test(t) && /href="\/app"/.test(html(r.state)), "denied screen: says so plainly and links to the investor app");
  ok(/Sign out/.test(t), "denied screen offers sign out");
}

section("ONE COMPANY, ENTITLED");
{
  as("owner");
  const r = await resolve();
  ok(r.state.phase === "ready" && r.state.company.id === A && r.state.company.role === "owner", "owner of an entitled company -> ready with role owner");
  ok(!r.state.adminMode, "not admin mode");
}

section("MULTI-COMPANY CHOOSER");
{
  as("multi");
  const r = await resolve();
  ok(r.state.phase === "switch" && r.companies.length === 2, "two memberships -> chooser");
  const h = html(r.state, r.companies), t = text(h);
  ok(/Choose a company/.test(t) && /Alpha Gold Corp\./.test(t) && /Beta Copper Ltd\./.test(t), "chooser lists both companies by name");
  ok(/editor · published/.test(t) && /viewer · draft/.test(t), "chooser shows the role and status for each");
  const inA = await M.enterCompany(r.companies[0]);
  ok(inA.phase === "ready" && inA.company.role === "editor", "choosing the entitled company -> ready as editor");
  const inB = await M.enterCompany(r.companies[1]);
  ok(inB.phase === "locked" && inB.company.id === B, "choosing the unentitled one -> subscription needed");
  ok(/Choose another company/.test(text(html(inB, r.companies, { switchCompany() {} }))), "locked screen from the chooser offers 'Choose another company'");
}

section("SUBSCRIPTION NEEDED");
{
  const locked = (role) => ({ phase: "locked", company: { ...CO[B], role } });
  const ownerH = html(locked("owner")), editorH = html(locked("editor"));
  ok(/Subscription needed/.test(text(ownerH)) && /data-gate-billing/.test(ownerH), "owner: locked screen includes the billing panel (can pay / fix the card)");
  ok(/data-gate-billing/.test(html(locked("admin"))), "company admin: billing panel too");
  ok(!/data-gate-billing/.test(editorH) && /An owner or admin of Beta Copper Ltd\. can renew it/.test(text(editorH)), "editor: no billing panel; told who can renew");
  ok(["publisher", "analyst", "viewer"].every((r) => !/data-gate-billing/.test(html(locked(r)))), "publisher / analyst / viewer: no billing panel");
  ok(/Check again/.test(text(ownerH)), "locked screen can re-check without a reload");
  ok(/Payment received/.test(text(html(locked("owner"), [], { notice: "success" }))), "back from Stripe checkout (?checkout=success): says the payment is being confirmed, not 'subscription needed' copy");
}

section("PLATFORM ADMIN");
{
  as("admin");
  const r = await resolve("?company=beta-copper");
  ok(r.state.phase === "ready" && r.state.adminMode && r.state.company.role === "admin", "admin + ?company=<slug> -> that company's portal in admin mode (no entitlement needed)");
  const nf = await resolve("?company=no-such-co");
  ok(nf.state.phase === "notfound" && /Company not found/.test(text(html(nf.state))) && /no-such-co/.test(text(html(nf.state))), "admin + unknown slug -> 'Company not found', not a generic error");
  as("owner");
  const forged = await resolve("?company=beta-copper");
  ok(forged.state.phase === "ready" && forged.state.company.id === A && !forged.state.adminMode, "non-admin forging ?company= is ignored: resolves to their own company");
  as("admin");
  const none = await resolve();
  ok(none.state.phase === "denied", "admin with no membership and no ?company -> denied screen (Mission Control is at /admin)");
}

section("'ADMINS ONLY' AT /admin FOR A COMPANY USER");
{
  as("owner");
  ok((await M.getMyRole()) === "company", "company owner's platform role is 'company'");
  const ag = fs.readFileSync("src/auth/AuthGate.jsx", "utf8");
  ok(/if \(requireAdmin\) \{\s*if \(role === undefined\) return <Loader \/>;\s*if \(role === "error"\) \{[\s\S]*?\}\s*if \(role !== "admin"\)/.test(ag) && /Admins only/.test(ag), "AuthGate requireAdmin: any role other than 'admin' gets 'Admins only'; a failed check gets 'Couldn't check access' (browser-checked in /qa/s3)");
  ok(/<AuthGate requireAdmin title="Sign in to Admin"/.test(fs.readFileSync("src/main.jsx", "utf8")), "/admin is wrapped in AuthGate requireAdmin");
}

section("EXPIRED SESSION");
{
  as("owner", { expired: true }); refreshOk = false;
  const r = await resolve();
  ok(r.state.phase === "expired", "stored token past expiry + refresh refused -> 'session expired'", r.state.phase);
  ok(localStorage.getItem("pp.session") === null, "the dead session is cleared (AuthGate falls back to sign-in)");
  ok(/Your session has expired/.test(text(html(r.state))) && /Sign in again/.test(text(html(r.state))), "expired screen: says so and offers 'Sign in again'");
  refreshOk = true;
  as("owner", { expired: true });
  const r2 = await resolve();
  ok(r2.state.phase === "ready", "stored token past expiry + refresh OK -> straight in (invisible to the user)");
  as("owner"); mode = "revoked";
  const r3 = await resolve();
  ok(r3.state.phase === "expired", "token the server refuses (401) -> 'session expired' (was: 'No company portal on this account')", r3.state.phase);
  mode = "normal";
}

section("FAILURES ARE NEVER REPORTED AS 'NO COMPANY' OR 'NO SUBSCRIPTION'");
{
  as("owner");
  for (const m of ["down", "server500", "badjson"]) {
    mode = m;
    const r = await resolve();
    ok(r.state.phase === "error", `${m}: membership lookup failed -> 'Couldn't load', not denied`, r.state.phase);
  }
  mode = "normal";
  ok(/Couldn't load your portal/.test(text(html({ phase: "error" }))) && /Retry/.test(text(html({ phase: "error" }))), "error screen: says what happened, offers Retry");
  // features down after memberships succeed
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, i) => (String(u).includes("/rpc/my_features") ? new Response("", { status: 503 }) : realFetch(u, i));
  const r = await resolve();
  ok(r.state.phase === "error", "entitlement lookup failed -> 'Couldn't load' (was: 'Subscription needed')", r.state.phase);
  globalThis.fetch = realFetch;
  ok(html({ phase: "weird-unknown" }).includes("Couldn"), "an unrecognised phase renders the error screen, never a blank page");
}

section("INVITATION LINKS");
{
  as("owner");
  for (const [t, phase, msg] of [["expired", "badinvite", /has expired/], ["used", "badinvite", /already been used/], ["revoked", "badinvite", /withdrawn/], ["invalid", "badinvite", /isn't valid/], ["mismatch", "mismatch", /different email/]]) {
    history.replaced.length = 0;
    const r = await resolve(`?invite=${t}`);
    ok(r.state.phase === phase && msg.test(text(html(r.state))), `invite '${t}' -> ${phase} screen`);
    ok(history.replaced.length === 1, `  ...and the token is cleared from the URL`);
  }
  const r = await resolve("?invite=good");
  ok(r.state.phase === "ready" && accepted.includes("good"), "valid invite -> accepted, then into the portal");
}

section("ROLE ON ENTRY");
{
  ok(M.normaliseRole("superuser") === "viewer" && M.normaliseRole(undefined) === "viewer" && M.normaliseRole("owner") === "owner", "unknown or missing role -> viewer (least privilege), never the 'owner' fallback used elsewhere");
  as("odd");
  const r = await resolve();
  ok(r.state.phase === "ready" && r.state.company.role === "viewer", "malformed membership role enters as viewer");
}

section("EACH ROLE'S VISIBLE CONTROLS (shell)");
{
  // Shell gating reads the role table; these are the controls the portal shell
  // itself decides. The pages' own controls are covered by company-roles-ui-test
  // and, in the browser, by /qa/s3.
  const portal = fs.readFileSync("src/portal/Portal.jsx", "utf8");
  ok(/can\(role, "draftContent"\) && \{ id: "pr"/.test(portal) && /can\(role, "publishContent"\) && \{ id: "media"/.test(portal) && /can\(role, "draftContent"\) && \{ id: "draft"/.test(portal), "Home tiles: Publish/Draft Press Release need draftContent, Publish Media needs publishContent");
  ok(/canManage=\{can\(company\?\.role \|\| "owner", "manageBilling"\)\}/.test(portal), "Settings -> Billing: billing controls only for manageBilling");
  const expect = {
    owner:     { pr: true, media: true, draft: true, billing: true, send: true, team: true },
    admin:     { pr: true, media: true, draft: true, billing: true, send: true, team: true },
    editor:    { pr: true, media: false, draft: true, billing: false, send: true, team: false },
    publisher: { pr: true, media: true, draft: true, billing: false, send: true, team: false },
    analyst:   { pr: false, media: false, draft: false, billing: false, send: false, team: false },
    viewer:    { pr: false, media: false, draft: false, billing: false, send: false, team: false },
  };
  for (const [role, e] of Object.entries(expect)) {
    const got = { pr: M.can(role, "draftContent"), media: M.can(role, "publishContent"), draft: M.can(role, "draftContent"), billing: M.can(role, "manageBilling"), send: M.can(role, "sendMessages"), team: M.can(role, "manageTeam") };
    ok(JSON.stringify(got) === JSON.stringify(e), `${role}: home tiles ${["pr", "media", "draft"].filter((k) => got[k]).join("/") || "none"}, billing ${got.billing ? "yes" : "no"}, send ${got.send ? "yes" : "no"}, team admin ${got.team ? "yes" : "no"}`);
  }
}

done();
