// a23 · Admin company creation and onboarding, end to end, LIVE on STAGING.
// Every step goes through the real API (PostgREST / RPCs) as the user who does
// it in the product, using the same requests the portal code sends
// (src/lib/supabase.js createCompany/updateCompany, src/lib/portal.js
// createInvitation/peekInvitation/acceptInvitation/myPortalCompanies/
// portalReadiness, AccountManagement admin_set_billing, the agreement and
// go-live RPCs, and the investor app's directory and profile requests in
// src/main.jsx). Ground truth is read from the database.
//   node scripts/admin-onboarding-live-test.mjs
//
// NOT covered: "Build from website" (/api/build-from-website) calls OpenAI and
// Jina, so it spends money; it needs separate approval. The profile here is
// written the way the review screen saves an operator edit.
//
// WHAT IT WRITES (staging only): one throwaway company "zz-a23-<run>", its
// subscription, invitation, membership and agreement rows (deleted at the end;
// they cascade). Accepting the invitation sets INVESTOR_B's profiles.role to
// 'company' (0031 behaviour); the original value is restored. Company A and
// its protected snapshots are never written. Prints no secrets.
import fs from "node:fs";
import pg from "pg";

const rd = (f) => Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const iso = rd("supabase/staging/.isolation-env");
const SB = iso.ISOLATION_SUPABASE_URL.replace(/\/+$/, ""), ANON = iso.ISOLATION_ANON_KEY;
const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (!/jmljfovtfxcdhjmtlnva/.test(SB) || /rvptronniomlqumjhyrr/.test(SB) || !url.includes("jmljfovtfxcdhjmtlnva") || url.includes("rvptronniomlqumjhyrr")) { console.error("  REFUSING: not the staging project"); process.exit(2); }

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const pgc = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await pgc.connect();
const q = async (s, a) => (await pgc.query(s, a)).rows;
const one = async (s, a) => (await q(s, a))[0];

const signIn = async (key) => {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email: iso[`ISOLATION_${key}_EMAIL`], password: iso[`ISOLATION_${key}_PASS`] }) });
  const j = r.ok ? await r.json() : null;
  return j ? { token: j.access_token, id: j.user.id, email: j.user.email } : null;
};
const W = {};
for (const k of ["ADMIN", "COMPANY_A", "COMPANY_B", "INVESTOR", "INVESTOR_B"]) W[k] = await signIn(k);
if (Object.values(W).some((v) => !v)) { console.error("  fixture sign-in failed"); process.exit(3); }
const rest = async (u, path, init = {}) => {
  const h = { apikey: ANON, "content-type": "application/json", Authorization: `Bearer ${u ? u.token : ANON}`, ...(init.headers || {}) };
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: h });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b, headers: r.headers };
};
const rpc = (u, fn, body) => rest(u, `rpc/${fn}`, { method: "POST", body: JSON.stringify(body) });
const ret = { Prefer: "return=representation" };

const RUN = Date.now().toString(36);
const SLUG = `zz-a23-${RUN}`;
const A = iso.ISOLATION_COMPANY_A_ID;
const protectedA = async () => (await one(`select count(*)::int n from public.company_profile_versions where company_id = $1`, [A])).n;
const protected0 = await protectedA();
const invBRole = (await one(`select role from public.profiles where id = $1`, [W.INVESTOR_B.id]))?.role ?? null;
// The investor app's directory request (src/main.jsx), first page.
const DIR = (extra = "") => `companies?status=eq.published&select=slug,name,ctier:tier&order=name,slug${extra}`;
let X = null, sub0 = null;

try {
  console.log("\n  1. CREATE (admin console: createCompany)");
  let r = await rest(W.INVESTOR, "companies", { method: "POST", headers: ret, body: JSON.stringify({ status: "draft", slug: `${SLUG}-inv`, name: "Nope" }) });
  ok(r.status >= 400 && !(await one(`select 1 x from public.companies where slug = $1`, [`${SLUG}-inv`])), "an investor cannot create a company", String(r.status));
  r = await rest(W.COMPANY_A, "companies", { method: "POST", headers: ret, body: JSON.stringify({ status: "draft", slug: `${SLUG}-own`, name: "Nope" }) });
  ok(r.status >= 400 && !(await one(`select 1 x from public.companies where slug = $1`, [`${SLUG}-own`])), "a company owner cannot create another company", String(r.status));
  r = await rest(W.ADMIN, "companies", { method: "POST", headers: ret, body: JSON.stringify({ status: "draft", name: "zz-a23.example", slug: SLUG, profile: { company: { website: "https://zz-a23.example" } } }) });
  X = Array.isArray(r.body) && r.body[0] ? r.body[0].id : null;
  ok(r.status === 201 && X, "a platform admin creates a draft company", `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
  if (!X) throw new Error("no company; stopping");
  const row0 = await one(`select status, owner_id from public.companies where id = $1`, [X]);
  ok(row0.status === "draft" && row0.owner_id === null, "it starts as a draft with no owner");
  r = await rest(null, DIR(`&slug=eq.${SLUG}`));
  ok(r.status === 200 && Array.isArray(r.body) && r.body.length === 0, "a draft is NOT in the investor app's directory");
  r = await rest(W.INVESTOR, `companies?slug=eq.${SLUG}&select=id`);
  ok(Array.isArray(r.body) && r.body.length === 0, "a signed-in investor cannot read the draft");
  r = await rest(W.COMPANY_B, `companies?slug=eq.${SLUG}&select=id`);
  ok(Array.isArray(r.body) && r.body.length === 0, "another company's owner cannot read the draft");

  console.log("\n  2. REVIEW AND EDIT (onboarding review: updateCompany with the profile)");
  const profile = { company: { name: "A23 Test Mining Corp", website: "https://zz-a23.example", listings: [{ ex: "TSXV", sym: "ZZA" }] },
    projects: [{ name: "North Zone", country: "Canada", commodity: "Gold" }, { name: "South Zone", country: "Canada", commodity: "Copper" }],
    importMeta: { curatedAt: new Date().toISOString() }, pp: { NAME: "A23 Test Mining Corp", TICKER: "ZZA" } };
  r = await rest(W.COMPANY_B, `companies?slug=eq.${SLUG}`, { method: "PATCH", headers: ret, body: JSON.stringify({ name: "Hijacked" }) });
  ok((await one(`select name from public.companies where id = $1`, [X])).name !== "Hijacked", "another company's owner cannot edit it");
  r = await rest(W.ADMIN, `companies?slug=eq.${SLUG}`, { method: "PATCH", headers: ret, body: JSON.stringify({ name: "A23 Test Mining Corp", primary_ticker: "ZZA", profile }) });
  ok(r.status === 200 && Array.isArray(r.body) && r.body.length === 1, "the admin saves the reviewed profile (row returned, as the screen requires)", String(r.status));
  ok((await one(`select profile->'company'->>'name' n from public.companies where id = $1`, [X])).n === "A23 Test Mining Corp", "the stored profile carries the edit");

  console.log("\n  3. PUBLISH (status -> published) and investor visibility");
  r = await rest(W.ADMIN, `companies?slug=eq.${SLUG}`, { method: "PATCH", headers: ret, body: JSON.stringify({ status: "published", profile: { ...profile, importMeta: { ...profile.importMeta, reviewedAt: new Date().toISOString() } } }) });
  ok(r.status === 200 && r.body[0]?.status === "published", "the admin publishes it");
  r = await rest(null, DIR(`&slug=eq.${SLUG}`));
  ok(r.body.length === 1 && r.body[0].name === "A23 Test Mining Corp", "now in the investor app's directory (anonymous request, as the app sends it)");
  r = await rest(null, `companies?slug=eq.${SLUG}&select=id,tier,pp:profile->pp`);
  ok(r.body.length === 1 && r.body[0].pp?.NAME === "A23 Test Mining Corp", "its profile loads for the investor app (?c=slug request)");
  r = await rest(W.INVESTOR, `companies?slug=eq.${SLUG}&select=id,name`);
  ok(r.body.length === 1, "a signed-in investor can now read it");

  console.log("\n  4. BILLING (AccountManagement: admin_set_billing)");
  r = await rpc(W.COMPANY_B, "admin_set_billing", { p_company: X, p_tier: "pro", p_status: "active", p_renews_at: null });
  ok(!(r.body && r.body.ok) && !(await one(`select 1 x from public.company_subscriptions where company_id = $1 and status = 'active'`, [X])), "a company owner cannot set billing", `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
  const paid = new Date(Date.now() + 365 * 864e5).toISOString();
  r = await rpc(W.ADMIN, "admin_set_billing", { p_company: X, p_tier: "pro", p_status: "active", p_renews_at: paid });
  ok(r.status === 200 && r.body?.ok, "the admin sets the plan (pro, active, paid through +1 year)", `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
  sub0 = await one(`select status, plan_id, renews_at from public.company_subscriptions where company_id = $1`, [X]);
  ok(sub0?.status === "active", "the subscription is active");
  r = await rpc(W.ADMIN, "portal_readiness", { cid: X });
  ok(r.body && r.body.ready === false && (r.body.missing || []).includes("owner") && !(r.body.missing || []).includes("entitlement"), "readiness: entitlement satisfied, owner still missing", JSON.stringify(r.body));

  console.log("\n  5. INVITE THE OWNER (createInvitation, peekInvitation)");
  r = await rpc(W.COMPANY_B, "create_company_invitation", { p_company_id: X, p_email: W.INVESTOR_B.email, p_role: "owner" });
  ok(!(r.body && r.body.token) && (await one(`select count(*)::int n from public.company_invitations where company_id = $1`, [X])).n === 0, "another company's owner cannot invite into it");
  r = await rpc(W.ADMIN, "create_company_invitation", { p_company_id: X, p_email: W.INVESTOR_B.email, p_role: "owner" });
  const inv = r.body;
  ok(r.status === 200 && inv && inv.token, "the admin creates the owner invitation (token returned for the link)", `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
  r = await rpc(null, "peek_company_invitation", { p_token: inv.token });
  const peekText = JSON.stringify(r.body || {});
  ok(r.status === 200 && r.body?.ok && /A23 Test Mining/.test(peekText), "the invite landing (signed out) shows the company", peekText.slice(0, 200));
  ok(!peekText.includes(inv.token), "the landing does not echo the token back");
  r = await rpc(null, "peek_company_invitation", { p_token: "not-a-real-token" });
  ok(!(r.body && r.body.ok), "a made-up token is refused");

  console.log("\n  6. ACCEPT (acceptInvitation as the invitee)");
  r = await rpc(W.INVESTOR, "accept_company_invitation", { p_token: inv.token });
  ok(!(r.body && r.body.ok) && !(await one(`select 1 x from public.company_memberships where company_id = $1 and user_id = $2`, [X, W.INVESTOR.id])), "a different signed-in user cannot accept it (email must match)", JSON.stringify(r.body).slice(0, 160));
  r = await rpc(W.INVESTOR_B, "accept_company_invitation", { p_token: inv.token });
  ok(r.status === 200 && r.body?.ok, "the invitee accepts", `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  const mem = await one(`select role, status from public.company_memberships where company_id = $1 and user_id = $2`, [X, W.INVESTOR_B.id]);
  ok(mem?.role === "owner" && mem?.status === "active", "they are the active owner", JSON.stringify(mem));
  ok((await one(`select owner_id from public.companies where id = $1`, [X])).owner_id === W.INVESTOR_B.id, "companies.owner_id points at them");
  const sub2 = await one(`select status, plan_id, renews_at from public.company_subscriptions where company_id = $1`, [X]);
  ok(sub2.status === "active" && sub2.plan_id === sub0.plan_id && String(sub2.renews_at) === String(sub0.renews_at), "accepting kept the admin's plan and paid-through date", JSON.stringify(sub2));
  r = await rpc(W.INVESTOR_B, "accept_company_invitation", { p_token: inv.token });
  ok(!(r.body && r.body.ok) || (await one(`select count(*)::int n from public.company_memberships where company_id = $1`, [X])).n === 1, "accepting twice creates nothing new");

  console.log("\n  7. THE NEW OWNER IN THE PORTAL");
  // Fresh token: role claims can change on accept.
  W.INVESTOR_B = await signIn("INVESTOR_B");
  r = await rest(W.INVESTOR_B, `company_memberships?user_id=eq.${W.INVESTOR_B.id}&status=eq.active&select=role,joined_at,company:companies(id,slug,name,status)&order=joined_at.desc`);
  ok(Array.isArray(r.body) && r.body.some((m) => m.company?.id === X && m.role === "owner"), "myPortalCompanies lists the company with role owner");
  r = await rest(W.INVESTOR_B, `companies?id=eq.${X}&select=id,slug,name,status,owner_id,tier,profile,updated_at&limit=1`);
  ok(r.body.length === 1 && r.body[0].profile?.company?.name === "A23 Test Mining Corp", "loadPortalCompany returns the full record to the owner");
  r = await rpc(W.INVESTOR_B, "portal_readiness", { cid: X });
  ok(r.body && r.body.ready === true, "readiness: ready (owner + entitlement)", JSON.stringify(r.body));
  r = await rpc(W.INVESTOR_B, "record_company_agreement", { p_company_id: X, p_version: "a23-test" });
  ok(r.status === 200 && r.body?.ok, "the owner accepts the company agreement", `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
  r = await rpc(W.INVESTOR_B, "company_has_agreement", { p_company_id: X, p_version: "a23-test" });
  ok(r.body === true || r.body?.ok === true || r.body?.accepted === true, "the agreement is on record", JSON.stringify(r.body).slice(0, 120));
  r = await rpc(W.COMPANY_B, "company_go_live", { p_company_id: X, p_version: "a23-test" });
  ok(!(r.body && r.body.ok), "another company's owner cannot take it live", JSON.stringify(r.body).slice(0, 120));
  r = await rpc(W.INVESTOR_B, "company_go_live", { p_company_id: X, p_version: "a23-test" });
  ok(r.status === 200 && r.body?.ok, "the owner takes it live", `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
  r = await rest(W.INVESTOR_B, `company_memberships?company_id=eq.${A}&select=user_id`);
  ok(Array.isArray(r.body) && r.body.length === 0, "the new owner cannot see company A's members");
  r = await rest(W.INVESTOR_B, `companies?id=eq.${A}`, { method: "PATCH", headers: ret, body: JSON.stringify({ name: "Hijacked" }) });
  ok(!(Array.isArray(r.body) && r.body.length), "the new owner cannot edit company A");
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  console.log("\n  CLEANUP");
  if (X) await q(`delete from public.companies where id = $1`, [X]).catch((e) => ok(false, "cleanup", e.message));
  await q(`delete from public.companies where slug in ($1, $2)`, [`${SLUG}-inv`, `${SLUG}-own`]).catch(() => {});
  if (invBRole !== null) await q(`update public.profiles set role = $2 where id = $1`, [W.INVESTOR_B.id, invBRole]).catch((e) => ok(false, "restore profile role", e.message));
}
ok(!(await one(`select 1 x from public.companies where slug like $1`, [`${SLUG}%`])), "throwaway company removed (memberships, invitations, subscription cascade)");
ok((await one(`select count(*)::int n from public.company_memberships m left join public.companies c on c.id = m.company_id where c.id is null`)).n === 0, "no orphaned memberships");
if (invBRole !== null) ok((await one(`select role from public.profiles where id = $1`, [W.INVESTOR_B.id]))?.role === invBRole, `INVESTOR_B's account type restored (${invBRole})`);
ok((await protectedA()) === protected0, "company A's protected snapshots untouched");
await pgc.end();
console.log(`\n  admin-onboarding-live (staging): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
