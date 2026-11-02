// a03 · migration 0076 LIVE on STAGING: every check through the real API
// (PostgREST, as each fixture user's own JWT), ground truth read from the
// database. Run AFTER 0076 is applied.
//   node scripts/company-roles-live-test.mjs
//
// WHAT IT WRITES (staging only): two throwaway companies, "zz-a03-live-<run>"
// (owner = company A's owner; the five role fixtures as members; an active
// subscription) and "zz-a03-prov-<run>" (no owner, for the first-owner
// handoff). Everything is deleted at the end; memberships, invitations,
// subscriptions, audit rows and content cascade. The handoff sets the
// invitee's profiles.role (0031 behaviour, by design); the original value is
// recorded and restored. Company A, its memberships and its 9 protected
// snapshots are never written. Prints no secrets.
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
if (!(await one(`select count(*)::int n from information_schema.columns where table_schema='public' and table_name='company_invitations' and column_name='kind'`)).n) { console.error("  0076 is not applied."); process.exit(4); }

const signIn = async (key) => {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email: iso[`ISOLATION_${key}_EMAIL`], password: iso[`ISOLATION_${key}_PASS`] }) });
  const j = r.ok ? await r.json() : null;
  return j ? { token: j.access_token, id: j.user.id, email: j.user.email } : null;
};
const W = {};
for (const k of ["COMPANY_A", "COADMIN", "EDITOR", "PUBLISHER", "ANALYST", "STAFF", "INVESTOR", "INVESTOR_B", "COMPANY_B", "ADMIN"]) W[k] = await signIn(k);
if (Object.values(W).some((v) => !v)) { console.error("  fixture sign-in failed"); process.exit(3); }
const rest = async (u, path, init = {}) => {
  const h = { apikey: ANON, "content-type": "application/json", ...(init.headers || {}) };
  if (u) h.Authorization = `Bearer ${u.token}`;
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: h });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b };
};
const rpc = async (u, fn, body) => (await rest(u, `rpc/${fn}`, { method: "POST", body: JSON.stringify(body) })).body;
const RUN = Date.now().toString(36);
const A = iso.ISOLATION_COMPANY_A_ID;

let X = null, P = null, invBRole = null;
const memVer = async (u) => (await one(`select updated_at::text v from public.company_memberships where company_id = $1 and user_id = $2`, [X, u.id]))?.v;
const memRow = async (u, c = X) => one(`select role, status from public.company_memberships where company_id = $1 and user_id = $2`, [c, u.id]);
const protectedA = async () => (await one(`select count(*)::int n from public.company_profile_versions where company_id = $1`, [A])).n;
const membersA0 = JSON.stringify(await q(`select user_id, role, status, updated_at::text from public.company_memberships where company_id = $1 order by user_id`, [A]));
const protected0 = await protectedA();

try {
  // ------------------------------------------------------------- fixture --
  await q(`select set_config('app.provisioning', 'on', false)`);
  X = (await one(`insert into public.companies (slug, name, owner_id, status, tier) values ($1, 'A03 Live', $2, 'published', 'free') returning id`, [`zz-a03-live-${RUN}`, W.COMPANY_A.id])).id;
  for (const [k, role] of [["COADMIN", "admin"], ["EDITOR", "editor"], ["PUBLISHER", "publisher"], ["ANALYST", "analyst"], ["STAFF", "viewer"]]) {
    await q(`insert into public.company_memberships (company_id, user_id, role, status) values ($1, $2, $3, 'active')`, [X, W[k].id, role]);
  }
  await q(`insert into public.company_subscriptions (company_id, plan_id, status) select $1, plan_id, 'canceled' from public.company_subscriptions where company_id = $2 on conflict (company_id) do update set status = 'canceled'`, [X, A]);
  const sub0 = JSON.stringify(await one(`select plan_id, status from public.company_subscriptions where company_id = $1`, [X]));
  ok(!!X && (await memRow(W.COMPANY_A)).role === "owner", "throwaway company with owner + admin/editor/publisher/analyst/viewer");

  console.log("\n  TEAM DIRECTORY AND INVITATIONS (as each role, via the API)");
  for (const [k, role] of [["COMPANY_A", "owner"], ["COADMIN", "admin"], ["EDITOR", "editor"], ["PUBLISHER", "publisher"], ["ANALYST", "analyst"], ["STAFF", "viewer"]]) {
    const lm = await rpc(W[k], "list_members", { p_company: X });
    const li = await rpc(W[k], "list_invitations", { p_company: X });
    const mgr = role === "owner" || role === "admin";
    ok(lm.ok && lm.my_role === role && lm.members.length === 6 && (li.ok === mgr) && (mgr ? lm.grantable.length > 0 : lm.grantable.length === 0),
       `${role}: sees the 6-member directory; pending invitations ${mgr ? "visible" : "refused"}; grantable ${lm.grantable?.join("/") || "none"}`);
  }
  {
    const lm = await rpc(W.ADMIN, "list_members", { p_company: X });
    ok(lm.ok && lm.my_role === "platform_admin" && lm.grantable.includes("admin") && !lm.grantable.includes("owner"), "platform admin: directory + manages up to admin, never grants owner");
    for (const k of ["COMPANY_B", "INVESTOR"]) ok((await rpc(W[k], "list_members", { p_company: X })).error === "forbidden", `${k.toLowerCase()}: directory of another company refused`);
  }
  let r = await rpc(W.COADMIN, "invite_member", { p_company: X, p_email: "y@staging.invalid", p_role: "admin" });
  ok(r.error === "role_not_allowed", "admin cannot invite an admin");
  r = await rpc(W.COMPANY_A, "invite_member", { p_company: X, p_email: "x@staging.invalid", p_role: "owner" });
  ok(r.error === "role_not_allowed", "owner cannot invite an owner");
  for (const k of ["EDITOR", "PUBLISHER", "ANALYST", "STAFF"]) ok((await rpc(W[k], "invite_member", { p_company: X, p_email: "z@staging.invalid", p_role: "viewer" })).error === "forbidden", `${k.toLowerCase()} cannot invite`);
  const i1 = await rpc(W.COADMIN, "invite_member", { p_company: X, p_email: W.INVESTOR.email, p_role: "viewer" });
  const i2 = await rpc(W.COMPANY_A, "invite_member", { p_company: X, p_email: W.INVESTOR.email.toUpperCase(), p_role: "editor" });
  ok(i1.ok && i2.ok && i1.id === i2.id && i1.token !== i2.token && i2.role === "editor", "create, then REPLACE: one invitation, new token and role (email case-insensitive)");
  ok((await one(`select count(*)::int n from public.company_invitations where company_id = $1 and status = 'pending'`, [X])).n === 1, "  ...exactly one pending row");
  const li = await rpc(W.COADMIN, "list_invitations", { p_company: X });
  ok(li.ok && li.invitations.length === 1 && li.invitations[0].token === i2.token && li.invitations[0].can_revoke === true, "the pending invitation is listed with its current token (copy link)");
  ok((await rest(W.COADMIN, `company_invitations?company_id=eq.${X}&select=token`)).body?.length === 0, "the invitations TABLE is not readable by a company admin directly (tokens only via list_invitations)");

  console.log("\n  ACCEPTANCE: email-bound, single-use, concurrent, no side effects");
  const invRole0 = (await one(`select role from public.profiles where id = $1`, [W.INVESTOR.id]))?.role;
  ok((await rpc(W.INVESTOR, "accept_company_invitation", { p_token: i1.token })).error === "invalid", "the replaced token is dead");
  ok((await rpc(W.INVESTOR_B, "accept_company_invitation", { p_token: i2.token })).error === "email_mismatch", "another signed-in account -> email_mismatch");
  {
    const an = await rest(null, "rpc/accept_company_invitation", { method: "POST", body: JSON.stringify({ p_token: i2.token }) });
    ok(an.status >= 400 || (an.body && an.body.ok === false), "anonymous -> refused", `${an.status} ${JSON.stringify(an.body).slice(0, 120)}`);
  }
  const both = await Promise.all([rpc(W.INVESTOR, "accept_company_invitation", { p_token: i2.token }), rpc(W.INVESTOR, "accept_company_invitation", { p_token: i2.token })]);
  ok(both.filter((x) => x.ok).length === 1 && both.filter((x) => x.error === "used").length === 1, "TWO SIMULTANEOUS accepts of one invitation: exactly one succeeds, the other is 'used'", JSON.stringify(both));
  ok((await memRow(W.INVESTOR)).role === "editor" && (await one(`select count(*)::int n from public.company_memberships where company_id = $1 and user_id = $2`, [X, W.INVESTOR.id])).n === 1, "  ...one membership, at the invited role");
  ok(JSON.stringify(await one(`select plan_id, status from public.company_subscriptions where company_id = $1`, [X])) === sub0, "  ...subscription unchanged (a cancelled one stays cancelled, same plan)");
  ok((await one(`select owner_id from public.companies where id = $1`, [X])).owner_id === W.COMPANY_A.id, "  ...ownership unchanged");
  ok((await one(`select role from public.profiles where id = $1`, [W.INVESTOR.id]))?.role === invRole0, `  ...account type unchanged (${invRole0})`);
  ok((await rpc(W.INVESTOR, "accept_company_invitation", { p_token: i2.token })).error === "used", "accepting again later -> used");
  {
    const i3 = await rpc(W.COMPANY_A, "invite_member", { p_company: X, p_email: W.STAFF.email, p_role: "admin" });
    ok(i3.error === "already_member", "inviting a current member -> already_member");
    // an invitation that predates membership must not overwrite the role
    const i4 = await rpc(W.COMPANY_A, "invite_member", { p_company: X, p_email: W.INVESTOR_B.email, p_role: "admin" });
    await q(`insert into public.company_memberships (company_id, user_id, role, status) values ($1, $2, 'viewer', 'active')`, [X, W.INVESTOR_B.id]);
    const a4 = await rpc(W.INVESTOR_B, "accept_company_invitation", { p_token: i4.token });
    ok(a4.error === "already_member" && (await memRow(W.INVESTOR_B)).role === "viewer", "accepting an admin invitation while already a viewer -> already_member; role NOT raised to admin");
    await q(`delete from public.company_memberships where company_id = $1 and user_id = $2`, [X, W.INVESTOR_B.id]);
    const i5 = await rpc(W.COMPANY_A, "invite_member", { p_company: X, p_email: W.INVESTOR_B.email, p_role: "viewer" });
    await q(`update public.company_invitations set expires_at = now() - interval '1 minute' where id = $1`, [i5.id]);
    ok((await rpc(W.INVESTOR_B, "accept_company_invitation", { p_token: i5.token })).error === "expired" && !(await memRow(W.INVESTOR_B)), "expired -> refused, no membership");
    const i6 = await rpc(W.COMPANY_A, "invite_member", { p_company: X, p_email: W.INVESTOR_B.email, p_role: "analyst" });
    ok((await rpc(W.EDITOR, "revoke_invitation", { p_company: X, p_invitation: i6.id })).error === "forbidden", "an editor cannot revoke");
    ok((await rpc(W.COADMIN, "revoke_invitation", { p_company: X, p_invitation: i6.id })).ok, "admin revokes");
    ok((await rpc(W.INVESTOR_B, "accept_company_invitation", { p_token: i6.token })).error === "revoked" && !(await memRow(W.INVESTOR_B)), "revoked -> refused, no membership");
    const i7 = await rpc(W.COMPANY_A, "invite_member", { p_company: X, p_email: "admin-invite@staging.invalid", p_role: "admin" });
    ok((await rpc(W.COADMIN, "revoke_invitation", { p_company: X, p_invitation: i7.id })).error === "forbidden", "admin cannot revoke an ADMIN invitation");
  }

  console.log("\n  FIRST-OWNER HANDOFF (platform admin, kind 'provision')");
  invBRole = (await one(`select role from public.profiles where id = $1`, [W.INVESTOR_B.id]))?.role ?? null;
  P = (await one(`insert into public.companies (slug, name, status, tier) values ($1, 'A03 Prov', 'draft', 'free') returning id`, [`zz-a03-prov-${RUN}`])).id;
  const pv = await rpc(W.ADMIN, "create_company_invitation", { p_company_id: P, p_email: W.INVESTOR_B.email });
  ok(pv && pv.token && (await one(`select kind, role from public.company_invitations where id = $1`, [pv.id])).kind === "provision", "platform admin's handoff invitation is kind 'provision'");
  await rpc(W.COMPANY_A, "create_company_invitation", { p_company_id: P, p_email: "x@staging.invalid" });
  ok((await one(`select count(*)::int n from public.company_invitations where company_id = $1`, [P])).n === 1, "a company owner cannot create a provision invitation (platform-admin only, unchanged)");
  const pa = await rpc(W.INVESTOR_B, "accept_company_invitation", { p_token: pv.token });
  const pc = await one(`select owner_id from public.companies where id = $1`, [P]);
  const ps = await one(`select status from public.company_subscriptions where company_id = $1`, [P]);
  ok(pa.ok && pc.owner_id === W.INVESTOR_B.id && ps?.status === "active" && (await memRow(W.INVESTOR_B, P))?.role === "owner", "accepting it hands over ownership, an owner membership and an active subscription (0031 behaviour)");

  console.log("\n  ROLE CHANGES, ESCALATION, OWNER PROTECTION (via the API)");
  r = await rpc(W.COADMIN, "change_member_role", { p_company: X, p_user: W.COADMIN.id, p_role: "owner", p_expected_updated_at: await memVer(W.COADMIN) });
  ok(r.error === "self", "admin cannot promote itself");
  r = await rpc(W.EDITOR, "change_member_role", { p_company: X, p_user: W.EDITOR.id, p_role: "admin", p_expected_updated_at: await memVer(W.EDITOR) });
  ok(r.error === "forbidden", "editor cannot promote itself");
  r = await rpc(W.COADMIN, "change_member_role", { p_company: X, p_user: W.EDITOR.id, p_role: "admin", p_expected_updated_at: await memVer(W.EDITOR) });
  ok(r.error === "role_not_allowed", "admin cannot promote someone to admin");
  r = await rpc(W.COADMIN, "change_member_role", { p_company: X, p_user: W.COMPANY_A.id, p_role: "viewer", p_expected_updated_at: null });
  ok(r.error === "account_owner", "admin cannot demote the owner");
  r = await rpc(W.ADMIN, "remove_member", { p_company: X, p_user: W.COMPANY_A.id, p_expected_updated_at: null });
  ok(r.error === "account_owner", "even a platform admin cannot remove the account owner here");
  r = await rpc(W.COMPANY_A, "remove_member", { p_company: X, p_user: W.COMPANY_A.id, p_expected_updated_at: null });
  ok(r.error === "self", "the owner cannot remove itself");
  await q(`insert into public.company_memberships (company_id, user_id, role, status) values ($1, $2, 'owner', 'active')`, [X, W.COMPANY_B.id]);
  r = await rpc(W.COMPANY_A, "change_member_role", { p_company: X, p_user: W.COMPANY_B.id, p_role: "admin", p_expected_updated_at: await memVer(W.COMPANY_B) });
  const r2 = await rpc(W.ADMIN, "remove_member", { p_company: X, p_user: W.COMPANY_B.id, p_expected_updated_at: await memVer(W.COMPANY_B) });
  ok(r.error === "role_not_allowed" && r2.error === "role_not_allowed" && (await memRow(W.COMPANY_B)).role === "owner", "a co-owner can be neither demoted nor removed here (owners are managed only by MineEx)");
  await q(`delete from public.company_memberships where company_id = $1 and user_id = $2`, [X, W.COMPANY_B.id]);
  {
    const v = await memVer(W.EDITOR);
    const [a, b] = await Promise.all([
      rpc(W.COMPANY_A, "change_member_role", { p_company: X, p_user: W.EDITOR.id, p_role: "publisher", p_expected_updated_at: v }),
      rpc(W.COADMIN, "change_member_role", { p_company: X, p_user: W.EDITOR.id, p_role: "analyst", p_expected_updated_at: v }),
    ]);
    const winner = [a, b].find((x) => x.ok);
    ok([a, b].filter((x) => x.ok).length === 1 && [a, b].filter((x) => x.error === "stale").length === 1 && (await memRow(W.EDITOR)).role === winner?.role,
       `two simultaneous role changes over the API: one wins (${winner?.role}), the other is 'stale'; no silent overwrite`, JSON.stringify([a, b]));
    r = await rpc(W.COMPANY_A, "change_member_role", { p_company: X, p_user: W.EDITOR.id, p_role: "editor", p_expected_updated_at: winner?.updated_at });
    ok(r.ok, "the returned version works for the next change (restored to editor)");
  }

  console.log("\n  DIRECT WRITES BY READ-ONLY ROLES (bypassing the UI)");
  const updX = (await one(`insert into public.updates (company_id, body, status) values ($1, '[a03-live] seed', 'draft') returning id`, [X])).id;
  const pubX = (await one(`insert into public.publications (company_id, update_id, destination_id, status, content) values ($1, $2, 'linkedin', 'draft', '{}') returning id`, [X, updX])).id;
  const medX = (await one(`insert into public.media_assets (company_id, storage_path, visibility) values ($1, $2, 'private') returning id`, [X, `a03/${RUN}/seed`])).id;
  const siteX = (await one(`insert into public.site_credentials (company_id, kind, token_hash, label) values ($1, 'site', md5(random()::text), '[a03-live]') returning id`, [X])).id;
  await q(`insert into public.brand_kits (company_id) values ($1) on conflict do nothing`, [X]);
  const slugX = (await one(`select slug from public.companies where id = $1`, [X])).slug;
  const convX = (await one(`insert into public.conversations (investor_id, company_slug, company_name) values ($1, $2, 'A03 Live') returning id`, [W.INVESTOR.id, slugX])).id;
  const refused = (res) => res.status === 401 || res.status === 403 || (Array.isArray(res.body) && res.body.length === 0);
  for (const k of ["ANALYST", "STAFF"]) {
    const u = W[k], who = k === "ANALYST" ? "analyst" : "viewer";
    const res = {
      draftInsert: await rest(u, "updates", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: X, body: "x", status: "draft" }) }),
      draftEdit: await rest(u, `updates?id=eq.${updX}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ body: "hijack" }) }),
      pubEdit: await rest(u, `publications?id=eq.${pubX}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status: "approved" }) }),
      pubDelete: await rest(u, `publications?id=eq.${pubX}`, { method: "DELETE", headers: { Prefer: "return=representation" } }),
      mediaInsert: await rest(u, "media_assets", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: X, storage_path: `a03/${RUN}/${who}`, visibility: "private" }) }),
      mediaDelete: await rest(u, `media_assets?id=eq.${medX}`, { method: "DELETE", headers: { Prefer: "return=representation" } }),
      destination: await rest(u, "company_destinations", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: X, destination_id: "linkedin" }) }),
      brandKit: await rest(u, `brand_kits?company_id=eq.${X}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ updated_at: new Date().toISOString() }) }),
      blueprint: await rest(u, "company_blueprints", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: X, blueprint_type: "website", template_key: `a03-${who}`, template_version: "1" }) }),
      siteRead: await rest(u, `site_credentials?id=eq.${siteX}&select=id,label`),
      siteRevoke: await rest(u, `site_credentials?id=eq.${siteX}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ revoked_at: new Date().toISOString() }) }),
      sendMessage: await rest(u, "messages", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ conversation_id: convX, sender: "company", body: `[a03-live] ${who} reply` }) }),
    };
    const bad = Object.entries(res).filter(([, v]) => !refused(v)).map(([n, v]) => `${n}:${v.status}`);
    ok(bad.length === 0, `${who}: drafts, publications, media, destinations, brand kit, blueprints, website tokens, messages -> all refused (${Object.keys(res).length} calls)`, bad.join(" "));
  }
  {
    const st = await one(`select (select body from public.updates where id = $1) b, (select status from public.publications where id = $2) s, (select count(*) from public.media_assets where id = $3)::int m, (select revoked_at from public.site_credentials where id = $4) rv`, [updX, pubX, medX, siteX]);
    ok(st.b === "[a03-live] seed" && st.s === "draft" && st.m === 1 && st.rv === null, "database: nothing the read-only roles attempted actually changed");
  }

  console.log("\n  AUTHORISED ROLES STILL WORK");
  {
    const e = await rest(W.EDITOR, "updates", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: X, body: "[a03-live] editor draft", status: "draft" }) });
    ok(e.status === 201 && e.body[0]?.id, "editor creates a release draft");
    const p = await rest(W.PUBLISHER, `updates?id=eq.${e.body[0]?.id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ body: "[a03-live] publisher edit" }) });
    ok(p.status === 200 && p.body.length === 1, "publisher edits it");
    const m = await rest(W.EDITOR, "media_assets", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: X, storage_path: `a03/${RUN}/editor`, visibility: "private" }) });
    ok(m.status === 201, "editor registers an uploaded media asset");
    const d = await rest(W.EDITOR, `publications?id=eq.${pubX}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
    ok(Array.isArray(d.body) && d.body.length === 0, "editor cannot delete a publication (publish roles only)");
    const d2 = await rest(W.PUBLISHER, `publications?id=eq.${pubX}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
    ok(d2.status === 200 && d2.body.length === 1, "publisher deletes it");
    const dest = await rest(W.PUBLISHER, "company_destinations", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: X, destination_id: "x" }) });
    ok(dest.status === 201, "publisher adds a publishing destination");
    const msg = await rest(W.EDITOR, "messages", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ conversation_id: convX, sender: "company", body: "[a03-live] editor reply" }) });
    ok(msg.status === 201, "editor replies to an investor as the company");
    const inv = await rest(W.INVESTOR, `messages?conversation_id=eq.${convX}&select=body`);
    ok(inv.body.some((m) => m.body === "[a03-live] editor reply") && !inv.body.some((m) => /analyst reply|viewer reply/.test(m.body)), "the investor sees the editor's reply and nothing from the read-only roles");
    for (const k of ["ANALYST", "STAFF"]) {
      const a = await rest(W[k], "rpc/company_engagement_totals", { method: "POST", body: JSON.stringify({ p_company: X }) });
      ok(a.status === 200, `${k === "ANALYST" ? "analyst" : "viewer"}: analytics readable`);
    }
  }

  console.log("\n  WEBSITE TOKENS THROUGH THE API");
  {
    ok((await rest(W.COMPANY_A, `site_credentials?id=eq.${siteX}&select=token_hash`)).status >= 400, "owner: token_hash cannot be selected");
    ok((await rest(W.COMPANY_A, `site_credentials?id=eq.${siteX}&select=*`)).status >= 400, "owner: select=* refused (would include the hash)");
    const meta = await rest(W.COADMIN, `site_credentials?id=eq.${siteX}&select=id,label,kind,revoked_at,last_used_at`);
    ok(meta.status === 200 && meta.body.length === 1, "company admin: reads the metadata");
    for (const [col, val] of [["token_hash", "chosen"], ["expires_at", "2099-01-01T00:00:00Z"], ["label", "x"]]) {
      ok((await rest(W.COMPANY_A, `site_credentials?id=eq.${siteX}`, { method: "PATCH", body: JSON.stringify({ [col]: val }) })).status >= 400, `owner: cannot modify ${col}`);
    }
    ok((await rest(W.COMPANY_A, "site_credentials", { method: "POST", body: JSON.stringify({ company_id: X, kind: "site", token_hash: "mint" }) })).status >= 400, "owner: cannot mint a credential");
    ok((await rest(W.COMPANY_A, `site_credentials?id=eq.${siteX}`, { method: "DELETE" })).status >= 400, "owner: cannot delete a credential");
    const rv = await rest(W.COMPANY_A, `site_credentials?id=eq.${siteX}&select=id,revoked_at`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ revoked_at: "2001-01-01T00:00:00Z" }) });
    ok(rv.status === 200 && rv.body.length === 1 && new Date(rv.body[0].revoked_at).getFullYear() >= 2026, "owner: revokes (server clock, not the client's 2001)");
    ok((await rest(W.COMPANY_A, `site_credentials?id=eq.${siteX}`, { method: "PATCH", body: JSON.stringify({ revoked_at: null }) })).status >= 400, "owner: cannot un-revoke");
  }

  console.log("\n  AUDIT LOG THROUGH THE API");
  {
    const fake = "11111111-1111-4111-8111-111111111111";
    const c = await rest(W.EDITOR, "activity_log?select=id,created_at,source", { method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ id: fake, company_id: X, actor_id: W.EDITOR.id, actor_kind: "company", action: "media_uploaded", entity: "documents", source: "ui", created_at: "2001-01-01T00:00:00Z" }) });
    ok(c.status === 201 && c.body[0].id !== fake && new Date(c.body[0].created_at).getFullYear() >= 2026 && c.body[0].source === "ui", "client entry: id and created_at stamped by the server (no backdating), marked 'ui'", JSON.stringify(c.body));
    const forge = [
      ["system event name", { action: "profile_published", source: "ui" }],
      ["source 'api'", { action: "media_uploaded", source: "api" }],
      ["actor_kind 'admin'", { action: "media_uploaded", source: "ui", actor_kind: "admin" }],
      ["another user as actor", { action: "media_uploaded", source: "ui", actor_id: W.COADMIN.id }],
    ];
    for (const [name, o] of forge) {
      const f = await rest(W.EDITOR, "activity_log", { method: "POST", body: JSON.stringify({ company_id: X, actor_id: W.EDITOR.id, actor_kind: "company", entity: "x", ...o }) });
      ok(f.status >= 400, `forged as authoritative (${name}) -> refused`);
    }
    for (const k of ["EDITOR", "COMPANY_A", "ADMIN"]) {
      const up = await rest(W[k], `activity_log?company_id=eq.${X}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ reason: "rewritten" }) });
      const del = await rest(W[k], `activity_log?company_id=eq.${X}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
      ok(up.status >= 400 && del.status >= 400, `${k === "ADMIN" ? "platform admin" : k.toLowerCase()}: cannot rewrite or delete audit rows`);
    }
    ok((await rest(W.ADMIN, `activity_log?company_id=eq.${X}&select=id`)).body.length >= 1, "platform admin still reads the log");
    const sys = await one(`select count(*)::int n from public.activity_log where company_id = $1 and action in ('member_invited','member_joined','member_role_changed','invitation_revoked') and source = 'api'`, [X]);
    ok(sys.n >= 4, `membership events recorded by the server as source 'api' (${sys.n})`);
  }

  console.log("\n  DIRECT LIVE-PROFILE WRITES (the updateCompanyProfile path: Calendar, QR placard)");
  {
    const { savedProfileFromResponse } = await import("../src/lib/portal.js");
    const before = JSON.stringify((await one(`select profile from public.companies where id = $1`, [X])).profile);
    const patch = async (u, marker) => {
      const r = await fetch(`${SB}/rest/v1/companies?id=eq.${X}`, { method: "PATCH", headers: { apikey: ANON, Authorization: `Bearer ${u.token}`, "content-type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ profile: { catalysts: [{ id: marker, title: marker }] } }) });
      const rows = r.ok ? await r.json().catch(() => null) : null;
      return { status: r.status, rows, saved: savedProfileFromResponse(r.status, rows, { catalysts: [] }) };
    };
    for (const [k, label] of [["COADMIN", "company admin"], ["EDITOR", "editor"], ["ANALYST", "analyst"], ["STAFF", "viewer"]]) {
      const r = await patch(W[k], `a03-${k}`);
      ok(r.saved === null && JSON.stringify((await one(`select profile from public.companies where id = $1`, [X])).profile) === before,
         `${label}: direct live-profile PATCH refused (${r.status}, ${Array.isArray(r.rows) ? r.rows.length : "-"} rows) -> reported NOT saved; database unchanged`);
    }
    const o = await patch(W.COMPANY_A, "a03-owner");
    const stored = (await one(`select profile from public.companies where id = $1`, [X])).profile;
    ok(o.saved && o.saved.catalysts?.[0]?.id === "a03-owner" && stored.catalysts?.[0]?.id === "a03-owner", "account owner: the same PATCH saves, and the stored profile is returned");
  }

  console.log("\n  DEMOTION AND REMOVAL TAKE EFFECT IMMEDIATELY");
  {
    const u0 = (await one(`insert into public.updates (company_id, body, status) values ($1, '[a03-live] demote', 'draft') returning id`, [X])).id;
    r = await rpc(W.COMPANY_A, "change_member_role", { p_company: X, p_user: W.PUBLISHER.id, p_role: "viewer", p_expected_updated_at: await memVer(W.PUBLISHER) });
    const e = await rest(W.PUBLISHER, `updates?id=eq.${u0}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ body: "after demotion" }) });
    ok(r.ok && Array.isArray(e.body) && e.body.length === 0, "publisher demoted to viewer: the very next edit is refused");
    await rpc(W.COMPANY_A, "change_member_role", { p_company: X, p_user: W.PUBLISHER.id, p_role: "publisher", p_expected_updated_at: await memVer(W.PUBLISHER) });
    r = await rpc(W.COMPANY_A, "remove_member", { p_company: X, p_user: W.COADMIN.id, p_expected_updated_at: await memVer(W.COADMIN) });
    const after = {
      invite: (await rpc(W.COADMIN, "invite_member", { p_company: X, p_email: "late@staging.invalid", p_role: "viewer" })).error,
      list: (await rpc(W.COADMIN, "list_members", { p_company: X })).error,
      site: (await rest(W.COADMIN, `site_credentials?id=eq.${siteX}&select=id`)).body.length,
      content: (await rest(W.COADMIN, `updates?company_id=eq.${X}&select=id`)).body.length,
    };
    ok(r.ok && after.invite === "forbidden" && after.list === "forbidden" && after.site === 0 && after.content === 0, "admin removed: immediately loses team management, website tokens and all company content", JSON.stringify(after));
    ok((await memRow(W.COADMIN)).status === "removed", "  ...membership is 'removed' (kept for history), not deleted");
  }

  console.log("\n  UNPUBLISHED COMPANY AND ISOLATION");
  {
    await q(`select set_config('app.provisioning', 'on', false)`);
    await q(`update public.companies set status = 'draft' where id = $1`, [X]);
    ok((await rest(W.ANALYST, `companies?id=eq.${X}&select=id`)).body.length === 1, "analyst of an unpublished company reads its row");
    ok((await rest(W.COMPANY_B, `companies?id=eq.${X}&select=id`)).body.length === 0 && (await rest(W.INVESTOR_B, `companies?id=eq.${X}&select=id`)).body.length === 0, "another company's owner / an outsider cannot");
    ok((await rest(W.COMPANY_B, `updates?company_id=eq.${X}&select=id`)).body.length === 0 && (await rest(W.COMPANY_B, `company_memberships?company_id=eq.${X}&select=user_id`)).body.length === 0, "company B sees none of X's content or members");
    ok((await rest(W.ADMIN, `companies?id=eq.${X}&select=id`)).body.length === 1, "platform admin sees it");
  }
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  if (X) await q(`delete from public.conversations where company_slug = $1`, [`zz-a03-live-${RUN}`]).catch((e) => ok(false, "cleanup conversations", e.message));
  for (const id of [X, P]) if (id) await q(`delete from public.companies where id = $1`, [id]).catch((e) => ok(false, "cleanup", e.message));
  if (invBRole !== null) await q(`update public.profiles set role = $2 where id = $1`, [W.INVESTOR_B.id, invBRole]).catch((e) => ok(false, "restore profile role", e.message));
  const left = await one(`select (select count(*) from public.companies where slug like $1) + (select count(*) from public.company_invitations where company_id = any($2::uuid[])) + (select count(*) from public.company_memberships where company_id = any($2::uuid[])) + (select count(*) from public.activity_log where company_id = any($2::uuid[])) + (select count(*) from public.conversations where company_slug like $1) n`, [`zz-a03-%-${RUN}`, [X, P].filter(Boolean)]);
  ok(Number(left.n) === 0, "cleanup: both throwaway companies and everything under them are gone");
  if (invBRole !== null) ok((await one(`select role from public.profiles where id = $1`, [W.INVESTOR_B.id]))?.role === invBRole, `INVESTOR_B's account type restored (${invBRole})`);
  ok(JSON.stringify(await q(`select user_id, role, status, updated_at::text from public.company_memberships where company_id = $1 order by user_id`, [A])) === membersA0, "company A's memberships untouched");
  ok((await protectedA()) === protected0, `the ${protected0} protected snapshots untouched`);
  await pgc.end();
}
console.log(`\n  company-roles-live (staging, 0076 applied): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
