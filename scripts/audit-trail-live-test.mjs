// a25 · Company audit trail, LIVE on STAGING: every consequential change made
// through the API is recorded in activity_log with WHO (the verified actor),
// WHEN, and WHAT CHANGED (old_value -> new_value); members can read it, nobody
// else can; nobody can rewrite or forge it.
//   node scripts/audit-trail-live-test.mjs [apiBase=http://127.0.0.1:8899]
// Needs the local staging API server (scripts/staging-api-server.mjs), started
// AFTER the api/ changes (it loads route code at start).
//
// WHAT IT WRITES (staging only): reuses the fixture company "zz-a25-fixture"
// (published with the role fixtures as members during the run; draft, memberless
// and cancelled after it -- a company that has published can never be deleted,
// release_revisions is append-only), its releases/media posts (kept as history,
// taken down) and tiny company-media PNGs (deleted). Prints no secrets.
import fs from "node:fs";
import pg from "pg";

const API = (process.argv[2] || "http://127.0.0.1:8899").replace(/\/+$/, "");
const rd = (f) => Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const iso = rd("supabase/staging/.isolation-env");
const SB = iso.ISOLATION_SUPABASE_URL.replace(/\/+$/, ""), ANON = iso.ISOLATION_ANON_KEY;
const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (!/jmljfovtfxcdhjmtlnva/.test(SB) || /rvptronniomlqumjhyrr/.test(SB) || !url.includes("jmljfovtfxcdhjmtlnva") || url.includes("rvptronniomlqumjhyrr")) { console.error("  REFUSING: not the staging project"); process.exit(2); }
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(API)) { console.error("  REFUSING: the API base must be the local staging API server"); process.exit(2); }

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
for (const k of ["COMPANY_A", "COADMIN", "PUBLISHER", "STAFF", "COMPANY_B", "INVESTOR"]) W[k] = await signIn(k);
if (Object.values(W).some((v) => !v)) { console.error("  fixture sign-in failed"); process.exit(3); }
const rest = async (u, path, init = {}) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: ANON, "content-type": "application/json", Authorization: `Bearer ${u ? u.token : ANON}`, ...(init.headers || {}) } });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b };
};
const api = async (u, route, body) => {
  const r = await fetch(`${API}/api/${route}`, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${u.token}` }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const uploaded = [];
const upload = async (u, name) => {
  const path = `${u.id}/${Date.now()}-${name}`;
  const r = await fetch(`${SB}/storage/v1/object/company-media/${encodeURI(path)}`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${u.token}`, "Content-Type": "image/png" }, body: PNG });
  if (r.ok) uploaded.push([u, path]);
  return `${SB}/storage/v1/object/public/company-media/${encodeURI(path)}`;
};
// A draft post as the portal creates it (publishMediaPost / the release composer).
const draft = async (u, content, detected) => {
  const up = await rest(u, "updates", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: X, body: content.body || content.headline, status: "review", ...(detected ? { detected } : {}) }) });
  const pr = await rest(u, "publications", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify([{ company_id: X, update_id: up.body[0].id, destination_id: "passport", content, status: "approved" }]) });
  return pr.body[0].id;
};
// The rows a member's Activity log page reads (src/lib/portal.js listActivity).
const trail = (u) => rest(u, `activity_log?company_id=eq.${X}&select=id,actor_id,actor_kind,action,entity,old_value,new_value,reason,source,created_at&order=created_at.desc&limit=50`);
const since = new Date(Date.now() - 1000).toISOString();
const rowsFor = async (action, pubId) => (await q(`select * from public.activity_log where company_id = $1 and action = $2 and created_at >= $3 and (new_value->>'publication_id' = $4 or old_value->>'publication_id' = $4) order by created_at`, [X, action, since, pubId]));

const RUN = Date.now().toString(36);
let X = null;
try {
  console.log("\n  FIXTURE");
  await q(`select set_config('app.provisioning', 'on', false)`);
  X = (await one(`select id from public.companies where slug = 'zz-a25-fixture'`))?.id
    || (await one(`insert into public.companies (slug, name, owner_id, status, tier) values ('zz-a25-fixture', 'A25 Audit (test fixture)', $1, 'published', 'pro') returning id`, [W.COMPANY_A.id])).id;
  await q(`update public.companies set status = 'published', owner_id = $2 where id = $1`, [X, W.COMPANY_A.id]);
  for (const [k, role] of [["COADMIN", "admin"], ["PUBLISHER", "publisher"], ["STAFF", "viewer"]])
    await q(`insert into public.company_memberships (company_id, user_id, role, status) values ($1, $2, $3, 'active') on conflict (company_id, user_id) do update set role = excluded.role, status = 'active'`, [X, W[k].id, role]);
  await q(`insert into public.company_subscriptions (company_id, plan_id, status) select $1, plan_id, 'active' from public.company_subscriptions where company_id = $2 on conflict (company_id) do update set status = 'active', plan_id = excluded.plan_id`, [X, iso.ISOLATION_COMPANY_A_ID]);
  ok(!!X, "fixture company with owner, admin, publisher, viewer and an active plan");

  console.log("\n  1. A RELEASE: published, corrected, taken down");
  const headline = `A25 release ${RUN}`, body1 = `Original text ${RUN}.`, body2 = `Corrected text ${RUN}.`;
  const rel = await draft(W.COADMIN, { headline, body: body1 }, null);
  let r = await api(W.COMPANY_A, "publish", { publicationId: rel });
  ok(r.status === 200, "the owner publishes the release", `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
  let rows = await rowsFor("release_published", rel);
  ok(rows.length === 1 && rows[0].actor_id === W.COMPANY_A.id && rows[0].actor_kind === "company" && rows[0].source === "api" && rows[0].new_value.status === "published" && rows[0].new_value.headline === headline && rows[0].old_value.status === "approved",
     "recorded: release_published, by the owner, status approved -> published, with the headline", JSON.stringify(rows[0] || null).slice(0, 220));
  r = await api(W.COMPANY_A, "publish", { publicationId: rel });
  ok(r.status === 200 && r.body.already && (await rowsFor("release_published", rel)).length === 1, "publishing again (idempotent) records nothing new");
  r = await api(W.PUBLISHER, "revise-release", { publicationId: rel, body: body2, reason: "typo in grade" });
  ok(r.status === 200, "a publisher corrects the release", `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
  rows = await rowsFor("release_corrected", rel);
  ok(rows.length === 1 && rows[0].actor_id === W.PUBLISHER.id && rows[0].old_value?.body === body1 && rows[0].new_value.body === body2 && rows[0].reason === "typo in grade",
     "recorded: release_corrected, by the publisher, before text -> after text, with the reason", JSON.stringify(rows[0] || null).slice(0, 260));
  r = await api(W.PUBLISHER, "unpublish", { publicationId: rel });
  ok(r.status === 200, "the publisher takes it down");
  rows = await rowsFor("release_unpublished", rel);
  ok(rows.length === 1 && rows[0].actor_id === W.PUBLISHER.id && rows[0].old_value.status === "published" && rows[0].new_value.status === "draft", "recorded: release_unpublished, by the publisher, published -> draft");

  console.log("\n  2. A MEDIA POST: posted, taken down, deleted permanently");
  const img = await upload(W.COADMIN, `a25-${RUN}.png`);
  const med = await draft(W.COADMIN, { post_type: "media", media_url: img, thumbnail_url: img, headline: `A25 photo ${RUN}` }, { post_type: "media" });
  r = await api(W.COADMIN, "publish", { publicationId: med });
  ok(r.status === 200 && (await rowsFor("media_published", med)).length === 1, "media_published recorded for the admin who posted it");
  r = await api(W.COADMIN, "unpublish", { publicationId: med });
  ok(r.status === 200 && (await rowsFor("media_unpublished", med))[0]?.actor_id === W.COADMIN.id, "media_unpublished recorded");
  r = await api(W.PUBLISHER, "media-delete", { publicationId: med });
  rows = await rowsFor("media_post_deleted", med);
  ok(r.status === 200 && rows.length === 1 && rows[0].actor_id === W.PUBLISHER.id && rows[0].new_value.files_deleted === 1, "media_post_deleted recorded, by the publisher, with the files deleted", JSON.stringify(rows[0] || null).slice(0, 200));

  console.log("\n  3. WHO CAN READ THE TRAIL");
  for (const who of ["COMPANY_A", "COADMIN", "STAFF"]) {
    r = await trail(W[who]);
    ok(Array.isArray(r.body) && r.body.filter((x) => x.source === "api" && x.created_at >= since).length >= 6, `a company ${who === "STAFF" ? "viewer" : who === "COADMIN" ? "admin" : "owner"} reads every recorded change`, `${r.status} ${Array.isArray(r.body) ? r.body.length : JSON.stringify(r.body).slice(0, 80)}`);
  }
  for (const who of ["COMPANY_B", "INVESTOR"]) {
    r = await trail(W[who]);
    ok(Array.isArray(r.body) && r.body.length === 0, `${who === "COMPANY_B" ? "another company" : "an investor"} reads none of it`);
  }

  console.log("\n  4. NOBODY CAN REWRITE OR FORGE IT");
  const victim = (await rowsFor("release_published", rel))[0];
  r = await rest(W.COMPANY_A, `activity_log?id=eq.${victim.id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ actor_id: W.STAFF.id }) });
  ok((await one(`select actor_id from public.activity_log where id = $1`, [victim.id])).actor_id === W.COMPANY_A.id, "the owner cannot edit an entry", `${r.status}`);
  r = await rest(W.COMPANY_A, `activity_log?id=eq.${victim.id}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
  ok(!!(await one(`select 1 x from public.activity_log where id = $1`, [victim.id])), "the owner cannot delete an entry", `${r.status}`);
  r = await rest(W.COADMIN, "activity_log", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ company_id: X, actor_id: W.COADMIN.id, actor_kind: "company", action: "release_published", source: "api" }) });
  ok(r.status >= 400, "a member cannot insert a server-style entry from the browser", `${r.status}`);
  r = await rest(W.COADMIN, "activity_log", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ company_id: X, actor_id: W.PUBLISHER.id, actor_kind: "company", action: "profile_updated", source: "ui" }) });
  ok(r.status >= 400, "a member cannot record an action in a colleague's name", `${r.status}`);
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  console.log("\n  CLEANUP");
  if (X) {
    await q(`update public.companies set status = 'draft' where id = $1`, [X]).catch((e) => ok(false, "archive fixture", e.message));
    await q(`delete from public.company_memberships where company_id = $1`, [X]).catch((e) => ok(false, "remove fixture members", e.message));
    await q(`update public.company_subscriptions set status = 'canceled' where company_id = $1`, [X]).catch(() => {});
  }
  for (const [u, path] of uploaded) await fetch(`${SB}/storage/v1/object/company-media/${encodeURI(path)}`, { method: "DELETE", headers: { apikey: ANON, Authorization: `Bearer ${u.token}` } }).catch(() => {});
}
const fx = X ? await one(`select status, (select count(*)::int from public.company_memberships where company_id = $1) m, (select count(*)::int from public.posts where company_id = $1 and removed_at is null) live from public.companies where id = $1`, [X]) : null;
ok(fx && fx.status === "draft" && fx.m === 0 && fx.live === 0, "fixture archived: off the directory, no members, no live posts");
await pgc.end();
console.log(`\n  audit-trail-live (staging): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
