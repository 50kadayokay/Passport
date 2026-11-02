// a14 · Website content management, LIVE on STAGING: what the portal's Website
// page writes is what /api/site-content serves, isolation holds, and a token
// revoked from the portal stops working.
//   node scripts/site-website-live-test.mjs [apiBase=http://127.0.0.1:8899]
// FOR S4. Needs the local staging API server (started after the api/ changes),
// supabase/staging/.connection and .isolation-env.
//
// WHAT IT WRITES (staging only): company A's website blueprint (the original
// row, if any, is restored exactly at the end; a row created here is deleted)
// and two site_credentials minted for the run (deleted at the end). Every write
// the portal would make goes through PostgREST as the fixture user, in the same
// shape as src/lib/siteAdmin.js. Prints no secrets or tokens.
import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";
import { snapshotForPublish } from "../src/lib/siteSelection.js";

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
const signIn = async (key) => {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email: iso[`ISOLATION_${key}_EMAIL`], password: iso[`ISOLATION_${key}_PASS`] }) });
  const j = r.ok ? await r.json() : null;
  return j ? { token: j.access_token, id: j.user.id } : null;
};
const W = {};
for (const k of ["COMPANY_A", "COADMIN", "EDITOR", "STAFF", "COMPANY_B"]) W[k] = await signIn(k);
if (Object.values(W).some((v) => !v)) { console.error("  fixture sign-in failed"); process.exit(3); }
const rest = async (u, path, init = {}) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: ANON, "content-type": "application/json", Authorization: `Bearer ${u.token}`, ...(init.headers || {}) } });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b };
};
const content = async (token, draft = false) => {
  const r = await fetch(`${API}/api/site-content${draft ? "?draft=1" : ""}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

const A = iso.ISOLATION_COMPANY_A_ID;
const RUN = Date.now().toString(36);
const original = (await q(`select * from public.company_blueprints where company_id = $1 and blueprint_type = 'website' order by updated_at desc limit 1`, [A]))[0] || null;
const minted = [];
let created = null;
const mint = async (kind) => {
  const token = `${kind === "site" ? "mxs_" : "mxd_"}${crypto.randomBytes(24).toString("base64url")}`;
  const hash = crypto.createHash("sha256").update(token, "utf8").digest("hex");
  const row = (await q(`insert into public.site_credentials (company_id, kind, token_hash, label, expires_at) values ($1, $2, $3, $4, $5) returning id`,
    [A, kind, hash, `a14-live-${RUN}-${kind}`, kind === "draft" ? new Date(Date.now() + 3600e3).toISOString() : null]))[0];
  minted.push(row.id);
  return { id: row.id, token };
};

try {
  const companyStatus = (await q(`select status from public.companies where id = $1`, [A]))[0].status;
  const WORKING = {
    pages: [{ key: "home", title: "Home", path: "/", sections: [`hero-${RUN}`, `geo-${RUN}`] }],
    sections: { [`hero-${RUN}`]: { type: "hero", values: { heading: "a14" } }, [`geo-${RUN}`]: { type: "geo-map", values: {} } },
  };
  if (original) {
    await q(`update public.company_blueprints set data = $2::jsonb, status = 'draft', updated_at = now() where id = $1`, [original.id, JSON.stringify(WORKING)]);
  } else {
    created = (await q(`insert into public.company_blueprints (company_id, blueprint_type, template_key, template_version, status, data) values ($1, 'website', 'a14-live', '0', 'draft', $2::jsonb) returning id`, [A, JSON.stringify(WORKING)]))[0].id;
  }
  const site = await mint("site"), draftTok = await mint("draft");

  console.log("\n  READ + ISOLATION (as the portal reads)");
  const SELBP = `company_blueprints?company_id=eq.${A}&blueprint_type=eq.website&select=id,status,data,updated_at&limit=1`;
  const mine = await rest(W.COMPANY_A, SELBP);
  ok(mine.status === 200 && mine.body.length === 1, "owner reads the website blueprint");
  ok((await rest(W.STAFF, SELBP)).body.length === 1, "viewer reads it too (read-only in the UI)");
  ok((await rest(W.COMPANY_B, SELBP)).body.length === 0, "another company reads nothing");
  const toksB = await rest(W.COMPANY_B, `site_credentials?company_id=eq.${A}&select=id`);
  ok(Array.isArray(toksB.body) && toksB.body.length === 0, "another company sees none of A's tokens");
  const toksV = await rest(W.STAFF, `site_credentials?company_id=eq.${A}&select=id`);
  ok(Array.isArray(toksV.body) && toksV.body.length === 0, "a viewer sees no tokens (owner/admin only)");
  const toksA = await rest(W.COMPANY_A, `site_credentials?company_id=eq.${A}&select=id,kind,label,expires_at,revoked_at,last_used_at,created_at`);
  ok(toksA.status === 200 && minted.every((id) => toksA.body.some((t) => t.id === id)), "owner lists the tokens");
  const hashRead = await rest(W.COMPANY_A, `site_credentials?company_id=eq.${A}&select=token_hash`);
  ok(hashRead.status >= 400, "token_hash is not readable from the portal", `${hashRead.status}`);

  console.log("\n  PUBLISH (portal) -> SERVED (site API)");
  let bp = mine.body[0];
  const hidden = { ...bp.data, sections: { ...bp.data.sections, [`geo-${RUN}`]: { ...bp.data.sections[`geo-${RUN}`], hidden: true } }, include: { posts: true, media: false } };
  const patch = (u, row, body) => rest(u, `company_blueprints?id=eq.${row.id}&updated_at=eq.${encodeURIComponent(row.updated_at)}&select=id,status,data,updated_at`,
    { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }) });
  const otherCo = await patch(W.COMPANY_B, bp, { data: {} });
  ok(otherCo.status === 200 && otherCo.body.length === 0, "another company cannot write A's website");
  const viewerW = await patch(W.STAFF, bp, { data: {} });
  ok(viewerW.body.length === 0 || viewerW.status >= 400, "a viewer cannot write it");
  const pub = await patch(W.COMPANY_A, bp, { data: snapshotForPublish(hidden), status: "approved" });
  ok(pub.status === 200 && pub.body.length === 1 && pub.body[0].status === "approved", "owner publishes (compare-and-set)");
  bp = pub.body[0];
  const stale = await patch(W.COADMIN, { ...bp, updated_at: "2000-01-01T00:00:00Z" }, { data: {} });
  ok(stale.status === 200 && stale.body.length === 0, "a write against a stale version changes nothing");

  if (companyStatus === "published") {
    const live = await content(site.token);
    ok(live.status === 200 && live.body.site.sections[`hero-${RUN}`] && !live.body.site.sections[`geo-${RUN}`], "site token: the hidden section is not served", JSON.stringify(live.body.site || live.body).slice(0, 200));
    ok(live.status === 200 && Array.isArray(live.body.content.media) && live.body.content.media.length === 0, "site token: media switched off -> none served");
    const edit = { ...bp.data, sections: { ...bp.data.sections, [`hero-${RUN}`]: { ...bp.data.sections[`hero-${RUN}`], hidden: true } } };
    const saved = await patch(W.COADMIN, bp, { data: edit });
    ok(saved.body.length === 1, "co-admin saves a draft change (not published)");
    bp = saved.body[0];
    const live2 = await content(site.token);
    ok(live2.status === 200 && live2.body.site.sections[`hero-${RUN}`], "site token: unpublished change does not reach the live site");
    const prev = await content(draftTok.token, true);
    ok(prev.status === 200 && !prev.body.site.sections[`hero-${RUN}`], "draft token: the preview shows it");
  } else {
    console.log(`  (company A is ${companyStatus}: published-mode assertions skipped; the API refuses published content for an unpublished profile)`);
    const prev = await content(draftTok.token, true);
    ok(prev.status === 200 && !prev.body.site.sections[`geo-${RUN}`], "draft token: the hidden section is not served");
  }

  console.log("\n  REVOKE (portal) -> REFUSED (site API)");
  const editorRevoke = await rest(W.EDITOR, `site_credentials?id=eq.${site.id}&select=id`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ revoked_at: new Date().toISOString() }) });
  ok(editorRevoke.status >= 400 || editorRevoke.body.length === 0, "an editor cannot revoke");
  const rv = await rest(W.COMPANY_A, `site_credentials?id=eq.${site.id}&select=id,revoked_at`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ revoked_at: "2000-01-01T00:00:00Z" }) });
  ok(rv.status === 200 && rv.body[0] && rv.body[0].revoked_at && !rv.body[0].revoked_at.startsWith("2000"), "owner revokes; the database stamps its own time");
  const unrev = await rest(W.COMPANY_A, `site_credentials?id=eq.${site.id}&select=id`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ revoked_at: null }) });
  ok(unrev.status >= 400, "revocation is one-way");
  const after = await content(site.token);
  ok(after.status === 401, "the revoked token is refused by /api/site-content", `${after.status}`);
} catch (e) {
  fail++; console.error(`  ✗ unexpected: ${e.message}`);
} finally {
  if (minted.length) await q(`delete from public.site_credentials where id = any($1::uuid[])`, [minted]);
  if (created) await q(`delete from public.company_blueprints where id = $1`, [created]);
  if (original) await q(`update public.company_blueprints set data = $2::jsonb, status = $3, updated_at = $4 where id = $1`, [original.id, JSON.stringify(original.data), original.status, original.updated_at]);
  await pgc.end();
}
console.log(`\n  ${pass} passed, ${fail} failed (company A's website and tokens restored)\n`);
process.exit(fail ? 1 : 0);
