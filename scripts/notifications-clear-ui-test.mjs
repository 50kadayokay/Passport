// Clear all by role (0090) offline: the portal sends the clear through the real
// src/lib/companyNotifications.js to a stub that applies 0090's check, and the
// Notifications page offers the action only to the roles that check accepts.
//   node scripts/notifications-clear-ui-test.mjs
//
// OFFLINE. fetch answers only from the stub below. The real function is proven
// on staging by scripts/notifications-clear-0090-check.mjs (rolled back) and
// scripts/notifications-clear-live-test.mjs (S4).
import fs from "node:fs";
import { installBrowserGlobals, installFetch, signIn, loadBundle, json, reporter, STUB_SB } from "./_portal-offline.mjs";

const { ok, section, done } = reporter("notifications-clear-ui");
installBrowserGlobals();

const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
// role of each token in A (0076 memberships); B is another company's owner
const ROLE = { "tok-owner": "owner", "tok-admin": "admin", "tok-editor": "editor", "tok-publisher": "publisher", "tok-analyst": "analyst", "tok-viewer": "viewer", "tok-b": null };
const CLEARERS = ["owner", "admin"];   // 0090: has_company_role(p_company, array['owner','admin'])
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
  export { can } from "./src/lib/companyRoles.js";
`);
const as = (tok) => signIn({ id: `u-${tok}`, email: `${tok}@stub.invalid` }, { token: tok });

section("SERVER CHECK (as 0090 answers)");
{
  for (const t of ["tok-viewer", "tok-analyst", "tok-editor", "tok-publisher"]) {
    as(t);
    const r = await N.clearCompanyNotifications(A);
    ok(r && r.failed && r.denied && clearedAt === null, `${t.slice(4)}: refused, reported as a role refusal, nothing cleared`);
  }
  as("tok-b");
  const rb = await N.clearCompanyNotifications(A);
  ok(rb && rb.denied && clearedAt === null, "another company's owner: refused");
  for (const t of ["tok-owner", "tok-admin"]) {
    as(t); clearedAt = null;
    const r = await N.clearCompanyNotifications(A);
    ok(r === "2026-11-01T12:00:00Z" && clearedAt, `${t.slice(4)}: clears (returns the clear time)`);
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
  ok(/const canClear = can\(company\?\.role \|\| "owner", "clearNotifications"\)/.test(src), "Notifications derives canClear from the company role");
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
