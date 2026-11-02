// a09 · Media library lifecycle, LIVE on STAGING, through the real API:
// upload (storage, as the uploader) -> post (update + publication, as
// publishMediaPost does) -> /api/publish -> visible to the investor app ->
// /api/unpublish (take down; file kept) -> /api/media-delete (file deleted,
// post leaves the library). Plus every refusal and both safety rules
// (a file still in use is kept; another company's file is never deleted).
//   node scripts/media-library-live-test.mjs [apiBase=http://127.0.0.1:8899]
// Needs the local staging API server (scripts/staging-api-server.mjs).
//
// WHAT IT WRITES (staging only): one reusable fixture company "zz-a09-fixture"
// (published with the role fixtures as members and an active plan during the
// run; archived, memberless and cancelled after it -- a company that has
// published cannot be deleted, release_revisions is append-only), its
// updates/publications/posts (kept as history, taken down), and a few tiny
// PNGs in company-media under the fixture users' own folders (each deleted at
// the end by its uploader). Company A is never written. Prints no secrets.
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
for (const k of ["COMPANY_A", "COADMIN", "EDITOR", "PUBLISHER", "ANALYST", "COMPANY_B", "INVESTOR"]) W[k] = await signIn(k);
if (Object.values(W).some((v) => !v)) { console.error("  fixture sign-in failed"); process.exit(3); }
try { await fetch(`${API}/api/media-delete`, { method: "OPTIONS" }); } catch { console.error(`  staging API server not reachable at ${API}`); process.exit(3); }

const rest = async (u, path, init = {}) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: ANON, "content-type": "application/json", Authorization: `Bearer ${u ? u.token : ANON}`, ...(init.headers || {}) } });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b };
};
const api = async (u, route, publicationId) => {
  const r = await fetch(`${API}/api/${route}`, { method: "POST", headers: { "content-type": "application/json", ...(u ? { Authorization: `Bearer ${u.token}` } : {}) }, body: JSON.stringify({ publicationId }) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
// 1x1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const uploaded = [];   // [user, path]
const upload = async (u, name) => {   // src/lib/storage.js uploadToBucket
  const path = `${u.id}/${Date.now()}-${name}`;
  const r = await fetch(`${SB}/storage/v1/object/company-media/${encodeURI(path)}`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${u.token}`, "Content-Type": "image/png", "x-upsert": "true" }, body: PNG });
  if (r.ok) uploaded.push([u, path]);
  return r.ok ? `${SB}/storage/v1/object/public/company-media/${encodeURI(path)}` : null;
};
const fileStatus = async (u) => (await fetch(u, { method: "GET" })).status;
const post = async (u, companyId, mediaUrl, caption) => {   // src/lib/mediaPosts.js publishMediaPost, minus the publish call
  const up = await rest(u, "updates", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: companyId, body: caption, status: "review", detected: { post_type: "media" } }) });
  if (up.status !== 201) return { error: `update ${up.status} ${JSON.stringify(up.body).slice(0, 120)}` };
  const content = { post_type: "media", media_url: mediaUrl, thumbnail_url: mediaUrl, headline: caption, body: caption };
  const pr = await rest(u, "publications", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify([{ company_id: companyId, update_id: up.body[0].id, destination_id: "passport", content, status: "approved" }]) });
  if (pr.status !== 201) return { error: `publication ${pr.status} ${JSON.stringify(pr.body).slice(0, 120)}` };
  return { updateId: up.body[0].id, pubId: pr.body[0].id };
};
const feed = async (companyId) => (await rest(null, `posts?company_id=eq.${companyId}&removed_at=is.null&select=title,media_url&order=published_at.desc&limit=60`)).body;
const library = async (u, companyId) => (await rest(u, `updates?company_id=eq.${companyId}&detected->>post_type=eq.media&status=neq.deleted&body=like.*${RUN}*&select=id`)).body;

const RUN = Date.now().toString(36);
const A = iso.ISOLATION_COMPANY_A_ID;
let X = null, pubs0 = 0;
try {
  console.log("\n  FIXTURE");
  await q(`select set_config('app.provisioning', 'on', false)`);
  // ONE reusable fixture company: a company that has published can never be
  // deleted (release_revisions is append-only), so it is archived between runs.
  X = (await one(`select id from public.companies where slug = 'zz-a09-fixture'`))?.id
    || (await one(`insert into public.companies (slug, name, owner_id, status, tier) values ('zz-a09-fixture', 'A09 Media (test fixture)', $1, 'published', 'pro') returning id`, [W.COMPANY_A.id])).id;
  await q(`update public.companies set status = 'published', owner_id = $2 where id = $1`, [X, W.COMPANY_A.id]);
  for (const [k, role] of [["COADMIN", "admin"], ["EDITOR", "editor"], ["PUBLISHER", "publisher"], ["ANALYST", "analyst"]])
    await q(`insert into public.company_memberships (company_id, user_id, role, status) values ($1, $2, $3, 'active') on conflict (company_id, user_id) do update set role = excluded.role, status = 'active'`, [X, W[k].id, role]);
  await q(`insert into public.company_subscriptions (company_id, plan_id, status) select $1, plan_id, 'active' from public.company_subscriptions where company_id = $2 on conflict (company_id) do update set status = 'active', plan_id = excluded.plan_id`, [X, A]);
  pubs0 = (await one(`select count(*)::int n from public.publications where company_id = $1`, [X])).n;
  ok(!!X, "fixture company with owner, admin, editor, publisher, analyst and an active plan");

  console.log("\n  1. UPLOAD AND POST (the company admin)");
  const url1 = await upload(W.COADMIN, "a09-one.png");
  ok(!!url1 && (await fileStatus(url1)) === 200, "the file uploads to company-media and its public URL serves it");
  const p1 = await post(W.COADMIN, X, url1, `A09 photo ${RUN}`);
  ok(!p1.error, "the media post (update + approved publication) is created", p1.error || "");
  let r = await api(W.ANALYST, "publish", p1.pubId);
  ok(r.status === 403, "an analyst cannot publish it", `${r.status}`);
  r = await api(W.COADMIN, "publish", p1.pubId);
  ok(r.status === 200, "the admin publishes it (/api/publish)", `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
  let f = [];
  for (let i = 0; i < 10 && !f.some((x) => x.media_url === url1); i++) { f = await feed(X); if (!f.some((x) => x.media_url === url1)) await new Promise((s) => setTimeout(s, 1500)); }
  ok(f.some((x) => x.media_url === url1), "INVESTOR APP: the anonymous feed query returns the post with its media_url");

  console.log("\n  2. DELETE IS REFUSED WHILE LIVE, AND TO THE WRONG PEOPLE");
  r = await api(W.COADMIN, "media-delete", p1.pubId);
  ok(r.status === 409 && r.body.code === "still_live", "deleting a live post is refused (take it down first)", `${r.status}`);
  r = await api(W.ANALYST, "unpublish", p1.pubId);
  ok(r.status === 403, "an analyst cannot take it down", `${r.status}`);
  r = await api(W.PUBLISHER, "unpublish", p1.pubId);
  ok(r.status === 200, "a publisher (not the uploader) takes it down", `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
  f = [];
  for (let i = 0; i < 10; i++) { f = await feed(X); if (!f.some((x) => x.media_url === url1)) break; await new Promise((s) => setTimeout(s, 1500)); }
  ok(!f.some((x) => x.media_url === url1), "INVESTOR APP: the post is gone from the feed");
  ok((await fileStatus(url1)) === 200, "taking down keeps the file (reversible step, as the page says)");
  for (const [who, code] of [["ANALYST", 403], ["EDITOR", 403], ["COMPANY_B", 404], ["INVESTOR", 404]]) {
    r = await api(W[who], "media-delete", p1.pubId);
    ok(r.status === code, `${who.toLowerCase()} cannot delete it (${code})`, `${r.status}`);
  }
  r = await api(null, "media-delete", p1.pubId);
  ok(r.status === 401, "signed out cannot delete it (401)", `${r.status}`);
  ok((await fileStatus(url1)) === 200 && (await library(W.COADMIN, X)).length === 1, "after all refusals: file and library entry unchanged");

  console.log("\n  3. A FILE STILL IN USE IS KEPT");
  const p2 = await post(W.COADMIN, X, url1, `A09 reuse ${RUN}`);   // a second post on the same file, not published
  ok(!p2.error, "a second (unpublished) post uses the same file", p2.error || "");
  r = await api(W.PUBLISHER, "media-delete", p1.pubId);
  ok(r.status === 200 && r.body.deleted === 0 && (r.body.kept || []).every((k) => k.reason === "still_in_use"), "deleting the first post keeps the file the second still uses", `${r.status} ${JSON.stringify(r.body)}`);
  ok((await fileStatus(url1)) === 200, "the shared file still serves");
  r = await api(W.PUBLISHER, "media-delete", p2.pubId);
  ok(r.status === 200 && r.body.deleted >= 1, "deleting the last post that uses it deletes the file", `${r.status} ${JSON.stringify(r.body)}`);
  const gone = url1.split("/company-media/")[1];
  ok(!(await one(`select 1 x from storage.objects where bucket_id = 'company-media' and name = $1`, [decodeURI(gone)])), "the object is deleted from storage");
  // The public URL can keep answering from Supabase's CDN for up to the upload's
  // cache max-age (default 3600 s) after deletion. A fresh, uncached path proves
  // the origin itself no longer has it.
  ok((await fileStatus(`${url1}?v=${Date.now()}`)) >= 400, "the origin no longer serves it (cache-bypassing request)", String(await fileStatus(`${url1}?v=${Date.now()}`)));
  ok((await library(W.COADMIN, X)).length === 0, "both posts have left the portal's media library");
  ok((await one(`select count(*)::int n from public.publications where company_id = $1`, [X])).n === pubs0 + 2, "publication history is kept (rows are not deleted)");

  console.log("\n  4. ANOTHER COMPANY'S FILE IS NEVER DELETED");
  const urlB = await upload(W.COMPANY_B, "a09-other.png");
  const p3 = await post(W.COADMIN, X, urlB, `A09 foreign ${RUN}`);
  ok(!p3.error && (await fileStatus(urlB)) === 200, "a post in this company points at a file company B uploaded", p3.error || "");
  r = await api(W.COADMIN, "media-delete", p3.pubId);
  ok(r.status === 200 && r.body.deleted === 0 && (r.body.kept || []).some((k) => k.reason === "not_uploaded_by_this_company"), "delete removes the post but keeps company B's file", `${r.status} ${JSON.stringify(r.body)}`);
  ok((await fileStatus(urlB)) === 200, "company B's file still serves");

  console.log("\n  5. A URL OUTSIDE company-media IS NEVER TOUCHED");
  const p4 = await post(W.COADMIN, X, "https://example.invalid/picture.png", `A09 external ${RUN}`);
  r = await api(W.COADMIN, "media-delete", p4.pubId);
  ok(r.status === 200 && r.body.deleted === 0 && (r.body.kept || []).every((k) => k.reason === "not_company_media"), "an external URL is reported, not deleted", `${r.status} ${JSON.stringify(r.body)}`);
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  console.log("\n  CLEANUP");
  // Archive the fixture: off the directory, no members, plan cancelled. Its
  // publications stay as history (retired: unpublished, posts removed).
  if (X) {
    await q(`update public.companies set status = 'draft' where id = $1`, [X]).catch((e) => ok(false, "archive fixture", e.message));   // draft = off the directory (status allows draft|published)
    await q(`delete from public.company_memberships where company_id = $1`, [X]).catch((e) => ok(false, "remove fixture members", e.message));
    await q(`update public.company_subscriptions set status = 'canceled' where company_id = $1`, [X]).catch(() => {});
  }
  for (const [u, path] of uploaded) await fetch(`${SB}/storage/v1/object/company-media/${encodeURI(path)}`, { method: "DELETE", headers: { apikey: ANON, Authorization: `Bearer ${u.token}` } }).catch(() => {});
}
const fx = X ? await one(`select status, (select count(*)::int from public.company_memberships where company_id = $1) m, (select count(*)::int from public.posts where company_id = $1 and removed_at is null) live from public.companies where id = $1`, [X]) : null;
ok(fx && fx.status === "draft" && fx.m === 0 && fx.live === 0, "fixture archived: off the directory, no members, no live posts");
const left = await q(`select count(*)::int n from storage.objects where bucket_id = 'company-media' and name like any($1)`, [uploaded.map(([, p]) => p)]);
ok(left[0].n === 0, "every test file removed from storage");
await pgc.end();
console.log(`\n  media-library-live (staging): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
