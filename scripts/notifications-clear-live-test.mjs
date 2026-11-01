// a11 · Company notifications and "Clear all" (migration 0064), LIVE on STAGING,
// through the real API with the requests src/lib/companyNotifications.js sends
// (rpc/company_notifications, rpc/mark_notifications_seen,
// rpc/mark_notifications_cleared, company_notification_reads) and the follow
// the investor app sends (company_follows insert / delete, as the investor).
//   node scripts/notifications-clear-live-test.mjs
//
// WHAT IT WRITES (staging only): one throwaway company "zz-a11-<run>" (owner =
// company A's owner; the five role fixtures as members), follows by the two
// investor fixtures, and its notification-reads row. All removed at the end
// with the company (it never publishes, so it can be deleted). Company A is
// never written. Prints no secrets.
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
  return j ? { token: j.access_token, id: j.user.id } : null;
};
const W = {};
for (const k of ["COMPANY_A", "COADMIN", "EDITOR", "ANALYST", "STAFF", "COMPANY_B", "INVESTOR", "INVESTOR_B"]) W[k] = await signIn(k);
if (Object.values(W).some((v) => !v)) { console.error("  fixture sign-in failed"); process.exit(3); }
const rest = async (u, path, init = {}) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: ANON, "content-type": "application/json", Authorization: `Bearer ${u ? u.token : ANON}`, ...(init.headers || {}) } });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b };
};
const rpc = (u, fn, body) => rest(u, `rpc/${fn}`, { method: "POST", body: JSON.stringify(body) });
const list = (u) => rpc(u, "company_notifications", { p_company: X, p_limit: 50 });
const follow = (u) => rest(u, "company_follows", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ user_id: u.id, company_id: X }) });
const unfollow = (u) => rest(u, `company_follows?user_id=eq.${u.id}&company_id=eq.${X}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
const follows = async () => (await one(`select count(*)::int n from public.company_follows where company_id = $1`, [X])).n;

const RUN = Date.now().toString(36);
let X = null;
try {
  console.log("\n  FIXTURE");
  await q(`select set_config('app.provisioning', 'on', false)`);
  X = (await one(`insert into public.companies (slug, name, owner_id, status, tier) values ($1, 'A11 Notifications', $2, 'published', 'pro') returning id`, [`zz-a11-${RUN}`, W.COMPANY_A.id])).id;
  for (const [k, role] of [["COADMIN", "admin"], ["EDITOR", "editor"], ["ANALYST", "analyst"], ["STAFF", "viewer"]]) await q(`insert into public.company_memberships (company_id, user_id, role, status) values ($1, $2, $3, 'active')`, [X, W[k].id, role]);
  ok(!!X, "throwaway published company with owner, admin, editor, analyst, viewer");

  console.log("\n  1. INVESTORS FOLLOW; THE COMPANY SEES IT");
  ok((await follow(W.INVESTOR)).status === 201 && (await follow(W.INVESTOR_B)).status === 201, "two investors follow (the app's own insert)");
  let r = await list(W.COMPANY_A);
  ok(r.status === 200 && Array.isArray(r.body) && r.body.filter((n) => n.kind === "follow").length === 2, "the owner's notifications list both follows", `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
  for (const who of ["COADMIN", "ANALYST", "STAFF"]) {
    r = await list(W[who]);
    ok(r.status === 200 && Array.isArray(r.body) && r.body.length === 2, `a company ${who === "STAFF" ? "viewer" : who.toLowerCase()} reads the same list (every member reads)`, `${r.status}`);
  }
  for (const who of ["COMPANY_B", "INVESTOR"]) {
    r = await list(W[who]);
    ok(r.status >= 400, `${who === "COMPANY_B" ? "another company" : "an investor"} cannot read this company's notifications`, `${r.status}`);
  }

  console.log("\n  2. CLEAR ALL");
  r = await rpc(W.COMPANY_B, "mark_notifications_cleared", { p_company: X });
  ok(r.status >= 400 && !(await one(`select cleared_at from public.company_notification_reads where company_id = $1`, [X]))?.cleared_at, "another company cannot clear them", `${r.status}`);
  r = await rpc(W.INVESTOR, "mark_notifications_cleared", { p_company: X });
  ok(r.status >= 400, "an investor cannot clear them", `${r.status}`);
  r = await rpc(W.COMPANY_A, "mark_notifications_cleared", { p_company: X });
  ok(r.status === 200 && typeof r.body === "string", "the owner clears all (returns the clear time)", `${r.status} ${JSON.stringify(r.body)}`);
  r = await list(W.COMPANY_A);
  ok(r.status === 200 && Array.isArray(r.body) && r.body.length === 0, "the list is empty after clearing");
  ok((await follows()) === 2, "clearing deleted NO follow (the investors' records are untouched)");
  r = await rest(W.INVESTOR, `company_follows?user_id=eq.${W.INVESTOR.id}&company_id=eq.${X}&select=id`);
  ok(Array.isArray(r.body) && r.body.length === 1, "the investor still sees themself as following");
  const reads = await one(`select seen_at, cleared_at from public.company_notification_reads where company_id = $1`, [X]);
  ok(reads && reads.seen_at && reads.cleared_at && String(reads.seen_at) === String(reads.cleared_at), "clearing also marks them seen (one unread badge state)");
  r = await rest(W.COMPANY_A, `company_notification_reads?company_id=eq.${X}&select=seen_at`);
  ok(Array.isArray(r.body) && r.body.length === 1 && r.body[0].seen_at, "companyLastSeenAt reads the seen time");

  console.log("\n  3. SOMETHING NEW AFTER CLEARING REAPPEARS (clearing is not muting)");
  await new Promise((s) => setTimeout(s, 1100));
  ok((await unfollow(W.INVESTOR_B)).status === 204 && (await follow(W.INVESTOR_B)).status === 201, "an investor unfollows and follows again");
  r = await list(W.COMPANY_A);
  ok(Array.isArray(r.body) && r.body.length === 1 && r.body[0].kind === "follow", "only the new follow is listed", JSON.stringify(r.body).slice(0, 160));

  console.log("\n  4. ONLY OWNERS AND ADMINS CLEAR (0090, through the app's own RPC call)");
  const clearedBefore = String((await one(`select cleared_at from public.company_notification_reads where company_id = $1`, [X])).cleared_at);
  for (const [who, label] of [["STAFF", "viewer"], ["ANALYST", "analyst"], ["EDITOR", "editor"]]) {
    r = await rpc(W[who], "mark_notifications_cleared", { p_company: X });
    const now = String((await one(`select cleared_at from public.company_notification_reads where company_id = $1`, [X])).cleared_at);
    ok(r.status === 403 && now === clearedBefore, `a company ${label} is refused (403) and cleared_at is unchanged`, `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
  }
  r = await list(W.STAFF);
  ok(Array.isArray(r.body) && r.body.length === 1, "...so the new follow is still listed for every member");
  r = await rpc(W.COADMIN, "mark_notifications_cleared", { p_company: X });
  ok(r.status === 200 && typeof r.body === "string", "a company admin clears all", `${r.status} ${JSON.stringify(r.body)}`);
  r = await list(W.STAFF);
  ok(Array.isArray(r.body) && r.body.length === 0, "the admin's clear empties the list for the viewer too");
  r = await rpc(W.COMPANY_A, "mark_notifications_seen", { p_company: X });
  ok(r.status === 200, "mark seen still works after a clear");
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  console.log("\n  CLEANUP");
  if (X) await q(`delete from public.companies where id = $1`, [X]).catch((e) => ok(false, "cleanup", e.message));
}
ok(!(await one(`select 1 x from public.companies where slug = $1`, [`zz-a11-${RUN}`])) && (await one(`select count(*)::int n from public.company_follows f left join public.companies c on c.id = f.company_id where c.id is null`)).n === 0, "throwaway company, its follows and reads removed");
await pgc.end();
console.log(`\n  notifications-clear-live (staging): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
