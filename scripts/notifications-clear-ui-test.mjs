// Clear all by role (0090, 0091) offline: the portal sends the clear through the
// real src/lib/companyNotifications.js to a stub that applies 0091's check, and
// the Notifications page offers the action only to the roles that check accepts.
// 0091: a platform admin clears only with an owner/admin role of their own there.
//   node scripts/notifications-clear-ui-test.mjs
//
// OFFLINE. fetch answers only from the stub below. The real function is proven
// on staging by scripts/notifications-clear-0090-check.mjs (rolled back) and
// scripts/notifications-clear-live-test.mjs (S4); 0091 by
// scripts/notifications-clear-0091-check.mjs (rolled back). 0091's SQL is
// checked offline by scripts/notifications-clear-0091-test.mjs.
import fs from "node:fs";
import { installBrowserGlobals, installFetch, signIn, loadBundle, json, reporter, STUB_SB } from "./_portal-offline.mjs";

const { ok, section, done } = reporter("notifications-clear-ui");
installBrowserGlobals();

const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
// role of each token in A (0076 memberships); B is another company's owner
// tok-padmin*: platform admins (profiles.role 'admin') with no / an admin / an editor membership of A
const ROLE = { "tok-owner": "owner", "tok-admin": "admin", "tok-editor": "editor", "tok-publisher": "publisher", "tok-analyst": "analyst", "tok-viewer": "viewer", "tok-b": null,
  "tok-padmin": null, "tok-padmin-admin": "admin", "tok-padmin-editor": "editor" };
const CLEARERS = ["owner", "admin"];   // 0091: owner_id, or an active owner/admin membership -- held by the caller; platform admin adds nothing
let clearedAt = null, mode = "ok";
const calls = [];

installFetch(async (req) => {
  const { url, method, token } = req;
  if (url.origin !== STUB_SB) return undefined;
  if (url.pathname === "/auth/v1/token") return json({ error: "invalid_grant" }, 400);
  if (url.pathname === "/rest/v1/rpc/mark_notifications_cleared" && method === "POST") {
    calls.push(token);
    if (mode === "absent") return json({ code: "PGRST202", message: "Could not find the function" }, 404);
    if (mode === "500") return json({ message: "boom" }, 500);
    const { p_company } = JSON.parse(req.body);
    if (!(token in ROLE)) return json({ message: "JWT" }, 401);
    const role = p_company === A ? ROLE[token] : null;
    if (!CLEARERS.includes(role)) return json({ code: "42501", message: "not authorized to clear this company's notifications" }, 403);
    clearedAt = "2026-11-01T12:00:00Z";
    return json(clearedAt);
  }
  return undefined;
});

const N = await loadBundle("notifications-clear", `
  export * from "./src/lib/companyNotifications.js";
  export { can, canIn, OWN_ROLE_ONLY } from "./src/lib/companyRoles.js";
`);
const as = (tok) => signIn({ id: `u-${tok}`, email: `${tok}@stub.invalid` }, { token: tok });

section("SERVER CHECK (as 0091 answers)");
{
  for (const t of ["tok-viewer", "tok-analyst", "tok-editor", "tok-publisher"]) {
    as(t);
    const r = await N.clearCompanyNotifications(A);
    ok(r && r.failed && r.denied && clearedAt === null, `${t.slice(4)}: refused, reported as a role refusal, nothing cleared`);
  }
  as("tok-b");
  const rb = await N.clearCompanyNotifications(A);
  ok(rb && rb.denied && clearedAt === null, "another company's owner: refused");
  for (const t of ["tok-padmin", "tok-padmin-editor"]) {
    as(t);
    const r = await N.clearCompanyNotifications(A);
    ok(r && r.failed && r.denied && clearedAt === null, `platform admin ${t === "tok-padmin" ? "with no membership" : "with an editor membership"}: refused (0091)`);
  }
  for (const t of ["tok-owner", "tok-admin", "tok-padmin-admin"]) {
    as(t); clearedAt = null;
    const r = await N.clearCompanyNotifications(A);
    ok(r === "2026-11-01T12:00:00Z" && clearedAt, `${t === "tok-padmin-admin" ? "platform admin with an admin membership" : t.slice(4)}: clears (returns the clear time)`);
  }
  as("tok-owner");
  mode = "500";
  const f = await N.clearCompanyNotifications(A);
  ok(f && f.failed && !f.denied, "a server failure is 'failed', not a role refusal");
  mode = "absent";
  ok((await N.clearCompanyNotifications(A)) === null, "0064 not applied (404): null, the page falls back to dismissing the unread state");
  mode = "ok";
}

section("ROLE POLICY IN THE UI");
{
  ok(["owner", "admin"].every((r) => N.can(r, "clearNotifications")) && !["editor", "publisher", "analyst", "viewer"].some((r) => N.can(r, "clearNotifications")), "clearNotifications: owner/admin yes; editor/publisher/analyst/viewer no");
  ok(!N.can(null, "clearNotifications") && !N.can("investor", "clearNotifications"), "no role / investor: no");
  const src = fs.readFileSync("src/portal/Notifications.jsx", "utf8");
  // A platform admin's portal (PortalGate ?company=) has role "admin", platformAdmin, and ownRole = what they hold there.
  const padmin = (ownRole) => ({ id: A, role: "admin", platformAdmin: true, ownRole });
  ok(!N.canIn(padmin(null), "clearNotifications") && !N.canIn(padmin("editor"), "clearNotifications") && !N.canIn(padmin("viewer"), "clearNotifications"), "platform admin without an owner/admin role of their own: no Clear all (0091)");
  ok(N.canIn(padmin("admin"), "clearNotifications") && N.canIn(padmin("owner"), "clearNotifications"), "platform admin who is owner/admin there themselves: Clear all");
  ok(N.canIn(padmin(null), "manageTeam") && N.canIn(padmin(null), "publishProfile") && N.OWN_ROLE_ONLY.join() === "clearNotifications", "only Clear all needs their own role; admin mode keeps every other action");
  ok(N.canIn({ role: "admin" }, "clearNotifications") && !N.canIn({ role: "viewer" }, "clearNotifications") && N.canIn(undefined, "clearNotifications"), "members: canIn = can(company.role) (missing role reads as owner, as before)");
  ok(/const canClear = canIn\(company, "clearNotifications"\)/.test(src) && !/\bcan\(company\?\.role/.test(src), "Notifications derives canClear through canIn (own role for platform admins)");
  const gate = fs.readFileSync("src/portal/PortalGate.jsx", "utf8");
  ok(/role: "admin", platformAdmin: true, ownRole \}/.test(gate) && /const ownRole = own\.ok \? own\.role : null;/.test(gate), "PortalGate's admin mode records the admin's own role (unknown = none)");
  ok(/\{canClear && items && items\.length > 0 && \(\s*<button onClick=\{\(\) => setConfirming\(true\)\}/.test(src), "the Clear all button is only rendered for roles that may clear");
  ok(/const confirmDialog = confirming && canClear \?/.test(src), "the confirm dialog cannot open without the role either");
  ok(/if \(at && at\.denied\) \{\s*setClearErr\("Only owners and admins can clear/.test(src), "a refusal from the server is shown as a role refusal, not 'try again'");
  ok(/<button onClick=\{refresh\}/.test(src), "Refresh stays for everyone (reading is unchanged)");
}

section("MIGRATION 0090 SHAPE");
{
  const mig = fs.readFileSync("supabase/migrations/0090_notification_clear_roles.sql", "utf8");
  const rb = fs.readFileSync("supabase/rollbacks/0090_notification_clear_roles.rollback.sql", "utf8");
  const m64 = fs.readFileSync("supabase/migrations/0064_notification_clearing.sql", "utf8");
  const body = (s) => s.match(/create or replace function public\.mark_notifications_cleared[\s\S]*?end \$\$;/)[0];
  ok(/has_company_role\(p_company, array\['owner','admin'\]\)/.test(mig) && !/owns_company\(/.test(body(mig).replace(/--.*$/gm, "")), "0090 checks has_company_role owner/admin (not owns_company)");
  ok(/using errcode = '42501'/.test(body(mig)), "0090 refuses with 42501 (PostgREST 403, which the lib reports as denied)");
  ok(body(mig).replace(/\s*-- THE ONLY CHANGE FROM 0064.*\n/, "\n").replace(/has_company_role\(p_company, array\['owner','admin'\]\)/, "owns_company(p_company)").replace(/'not authorized to clear this company''s notifications'/, "'not authorized for this company'") === body(m64), "0090's body is 0064's apart from the check");
  ok(body(rb) === body(m64), "the rollback restores 0064's function verbatim");
  ok(/revoke execute on function public\.mark_notifications_cleared\(uuid\) from public, anon;/.test(mig) && /grant\s+execute on function public\.mark_notifications_cleared\(uuid\) to authenticated;/.test(mig), "grants unchanged (authenticated only)");
  ok(!/company_notifications\(|mark_notifications_seen|alter table|drop /i.test(mig.replace(/^--.*$/gm, "")), "0090 touches nothing else: list, seen, tables");
}

ok(calls.length > 0, "every clear went through the stub");
done();
