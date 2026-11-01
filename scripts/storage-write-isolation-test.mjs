// a24 · Storage WRITE / OVERWRITE / DELETE permissions, LIVE on STAGING, as real
// users through the Storage API (reads were proven earlier). Every bucket:
// company-media and company-logos (public), company-docs and
// company-media-private (private, company-keyed), message-attachments
// (conversation-keyed). Path conventions are the app's own:
//   company-media/-logos  <uid>/<file>                (src/lib/storage.js)
//   company-docs          <uid>/<companyId>/<file>    (src/lib/memory.js)
//   company-media-private <companyId>/<file>          (src/lib/mediaAssets.js)
//   message-attachments   <conversationId>/<file>     (0062)
//   node scripts/storage-write-isolation-test.mjs
//
// Each check is EXPECT (must hold; failure = defect) or FINDING (current
// behaviour that is a policy gap, recorded with its result so a fix can be
// verified by flipping it). Writes only tiny test objects named "a24-*" (plus a
// documents / media_assets row for each private one, so reads resolve as they do
// for real files), all removed at the end with the staging service key.
import fs from "node:fs";
import pg from "pg";

const rd = (f) => Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const iso = rd("supabase/staging/.isolation-env");
const SB = iso.ISOLATION_SUPABASE_URL.replace(/\/+$/, ""), ANON = iso.ISOLATION_ANON_KEY;
const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (!/jmljfovtfxcdhjmtlnva/.test(SB) || /rvptronniomlqumjhyrr/.test(SB) || !url.includes("jmljfovtfxcdhjmtlnva") || url.includes("rvptronniomlqumjhyrr")) { console.error("  REFUSING: not the staging project"); process.exit(2); }
const STRICT = process.argv.includes("--strict");
// CLEANUP ONLY: Storage refuses SQL deletes, and sent attachments cannot be
// deleted by any client, so test objects are removed with the STAGING service
// key (the staging API server's own env file). Checked to be staging's; never printed.
const SERVICE = (rd("supabase/staging/.api-env").STAGING_SUPABASE_SERVICE_ROLE_KEY || "").trim();
const svcRef = SERVICE.startsWith("eyJ") ? (() => { try { return JSON.parse(Buffer.from(SERVICE.split(".")[1], "base64url").toString()).ref; } catch { return null; } })() : "jmljfovtfxcdhjmtlnva";
if (!SERVICE || svcRef !== "jmljfovtfxcdhjmtlnva") { console.error("  REFUSING: no staging service key for cleanup"); process.exit(2); }   // treat FINDINGs as failures (after a policy fix)

let pass = 0, fail = 0; const findings = [];
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const finding = (secure, m) => { if (secure) { pass++; console.log(`  ✓ ${m}`); } else { findings.push(m); if (STRICT) { fail++; console.error(`  ✗ ${m}`); } else console.log(`  ⚠ FINDING: ${m}`); } };
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
for (const k of ["COMPANY_A", "COADMIN", "EDITOR", "ANALYST", "STAFF", "COMPANY_B", "INVESTOR", "INVESTOR_B"]) W[k] = await signIn(k);
if (Object.values(W).some((v) => !v)) { console.error("  fixture sign-in failed"); process.exit(3); }
const A = iso.ISOLATION_COMPANY_A_ID;
const B = (await q(`select company_id from public.company_memberships where user_id = $1 and role = 'owner' limit 1`, [W.COMPANY_B.id]))[0].company_id;
const CONV = (await q(`select id from public.conversations where investor_id = $1 and company_slug = (select slug from public.companies where id = $2) order by created_at limit 1`, [W.INVESTOR.id, A]))[0].id;

const RUN = Date.now().toString(36);
const made = new Set();   // "bucket/name"
const obj = async (u, method, bucket, name, { type = "image/png", body = "a24", upsert = false } = {}) => {
  const h = { apikey: ANON, Authorization: `Bearer ${u ? u.token : ANON}` };
  if (method !== "DELETE") { h["Content-Type"] = type; if (upsert) h["x-upsert"] = "true"; }
  const r = await fetch(`${SB}/storage/v1/object/${bucket}/${encodeURI(name)}`, { method, headers: h, body: method === "DELETE" ? undefined : body });
  if (r.ok && method !== "DELETE") made.add(`${bucket}/${name}`);
  return r.status;
};
const exists = async (bucket, name) => (await q(`select 1 from storage.objects where bucket_id = $1 and name = $2`, [bucket, name])).length === 1;
const content = async (bucket, name) => (await q(`select metadata->>'size' s from storage.objects where bucket_id = $1 and name = $2`, [bucket, name]))[0]?.s;
const n = (s) => `a24-${RUN}-${s}`;

try {
  for (const bucket of ["company-media", "company-logos"]) {
    console.log(`\n  ${bucket.toUpperCase()} (public bucket, uploader folder)`);
    const mine = `${W.COMPANY_A.id}/${n("owner.png")}`;
    ok((await obj(W.COMPANY_A, "POST", bucket, mine)) === 200 && (await exists(bucket, mine)), "EXPECT: the company owner uploads into their own folder");
    ok((await obj(null, "POST", bucket, `${W.COMPANY_A.id}/${n("anon.png")}`)) >= 400, "EXPECT: signed out cannot upload");
    ok((await obj(W.COMPANY_B, "POST", bucket, `${W.COMPANY_A.id}/${n("forged.png")}`)) >= 400 && !(await exists(bucket, `${W.COMPANY_A.id}/${n("forged.png")}`)), "EXPECT: another company cannot write into the owner's folder");
    const size0 = await content(bucket, mine);
    await obj(W.COMPANY_B, "PUT", bucket, mine, { body: "overwritten-by-b" });
    await obj(W.COMPANY_B, "POST", bucket, mine, { body: "overwritten-by-b", upsert: true });
    ok((await content(bucket, mine)) === size0, "EXPECT: another company cannot overwrite the owner's file (PUT or upsert)");
    await obj(W.COMPANY_B, "DELETE", bucket, mine);
    ok(await exists(bucket, mine), "EXPECT: another company cannot delete the owner's file");
    await obj(W.INVESTOR, "DELETE", bucket, mine);
    ok(await exists(bucket, mine), "EXPECT: an investor cannot delete it");
    const inv = `${W.INVESTOR.id}/${n("investor.png")}`;
    finding((await obj(W.INVESTOR, "POST", bucket, inv)) >= 400, `${bucket}: an INVESTOR (any free account) cannot upload into the PUBLIC bucket`);
    const html = `${W.INVESTOR.id}/${n("page.html")}`;
    const hs = await obj(W.INVESTOR, "POST", bucket, html, { type: "text/html", body: "<!doctype html><title>a24</title>" });
    if (hs === 200) {
      const served = await fetch(`${SB}/storage/v1/object/public/${bucket}/${encodeURI(html)}`);
      const ct = served.headers.get("content-type") || "";
      finding(!/text\/html/i.test(ct), `${bucket}: an uploaded .html is not served as a web page (content-type: ${ct || "none"})`);
    } else finding(true, `${bucket}: an uploaded .html is refused`);
    // A RECOMMENDATION, not an access rule (0078 does not set bucket limits), so
    // it is reported but never fails a --strict run.
    if ((await q(`select file_size_limit is null and allowed_mime_types is null x from storage.buckets where id = $1`, [bucket]))[0].x)
      console.log(`  note: ${bucket} has no server-side size or file-type limit (only the browser's 15 MB check)`);
  }

  console.log("\n  COMPANY-DOCS (private; <uid>/<companyId>/<file>)");
  const doc = `${W.COMPANY_A.id}/${A}/${n("doc.pdf")}`;
  ok((await obj(W.COMPANY_A, "POST", "company-docs", doc, { type: "application/pdf" })) === 200, "EXPECT: the owner uploads a company document");
  ok((await obj(W.COMPANY_B, "POST", "company-docs", `${W.COMPANY_A.id}/${A}/${n("forged.pdf")}`, { type: "application/pdf" })) >= 400, "EXPECT: another company cannot write into the owner's folder");
  const s0 = await content("company-docs", doc);
  await obj(W.COMPANY_B, "POST", "company-docs", doc, { body: "overwrite", upsert: true });
  ok((await content("company-docs", doc)) === s0, "EXPECT: another company cannot overwrite a company document");
  await obj(W.COMPANY_B, "DELETE", "company-docs", doc);
  ok(await exists("company-docs", doc), "EXPECT: another company cannot delete a company document");
  await obj(W.INVESTOR, "DELETE", "company-docs", doc);
  ok(await exists("company-docs", doc), "EXPECT: an investor cannot delete it");
  const planted = `${W.COMPANY_B.id}/${A}/${n("planted.pdf")}`;
  finding((await obj(W.COMPANY_B, "POST", "company-docs", planted, { type: "application/pdf" })) >= 400, "company-docs: another company cannot place a file under THIS company's id (path ends in company A)");
  finding((await obj(W.INVESTOR, "POST", "company-docs", `${W.INVESTOR.id}/${n("x.pdf")}`, { type: "application/pdf" })) >= 400, "company-docs: an investor cannot upload into the private documents bucket");
  // Storage deletes only what the caller can READ, and a company document is
  // readable through its documents row; so each object gets one, as memory.js does.
  const docRow = async (name) => { await q(`insert into public.documents (company_id, storage_path, filename, mime) values ($1, $2, $3, 'application/pdf')`, [A, `company-docs/${name}`, name.split("/").pop()]); };
  ok(await (async () => { const d = `${W.COMPANY_A.id}/${A}/${n("readable.pdf")}`; await obj(W.COMPANY_A, "POST", "company-docs", d, { type: "application/pdf" }); await docRow(d);
    const r = await fetch(`${SB}/storage/v1/object/authenticated/company-docs/${encodeURI(d)}`, { headers: { apikey: ANON, Authorization: `Bearer ${W.STAFF.token}` } }); return r.status === 200; })(),
    "EXPECT: with its documents row, a viewer of company A can read the document (so the delete checks below are real)");
  for (const who of ["ANALYST", "STAFF"]) {
    const d2 = `${W.COMPANY_A.id}/${A}/${n(`for-${who}.pdf`)}`;
    await obj(W.COMPANY_A, "POST", "company-docs", d2, { type: "application/pdf" });
    await docRow(d2);
    await obj(W[who], "DELETE", "company-docs", d2);
    finding(await exists("company-docs", d2), `company-docs: a read-only ${who === "STAFF" ? "viewer" : "analyst"} cannot delete company documents (a03: documents are draft-role only)`);
  }
  const d3 = `${W.COMPANY_A.id}/${A}/${n("for-coadmin.pdf")}`;
  await obj(W.COMPANY_A, "POST", "company-docs", d3, { type: "application/pdf" });
  await docRow(d3);
  await obj(W.COADMIN, "DELETE", "company-docs", d3);
  ok(!(await exists("company-docs", d3)), "EXPECT: a company admin can delete a document someone else uploaded (cleanup arm)");

  console.log("\n  COMPANY-MEDIA-PRIVATE (private; <companyId>/<file>)");
  const pm = `${A}/${n("asset.png")}`;
  ok((await obj(W.EDITOR, "POST", "company-media-private", pm)) === 200, "EXPECT: an editor writes a company media asset");
  await q(`insert into public.media_assets (company_id, storage_path) values ($1, $2)`, [A, `company-media-private/${pm}`]);   // as mediaAssets.js records it
  ok((await obj(W.COMPANY_B, "POST", "company-media-private", `${A}/${n("forged.png")}`)) >= 400, "EXPECT: another company cannot write under company A");
  const p0 = await content("company-media-private", pm);
  await obj(W.COMPANY_B, "POST", "company-media-private", pm, { body: "overwrite", upsert: true });
  ok((await content("company-media-private", pm)) === p0, "EXPECT: another company cannot overwrite it");
  await obj(W.COMPANY_B, "DELETE", "company-media-private", pm);
  ok(await exists("company-media-private", pm), "EXPECT: another company cannot delete it");
  finding((await obj(W.ANALYST, "POST", "company-media-private", `${A}/${n("analyst.png")}`)) >= 400, "company-media-private: a read-only analyst cannot write company media (a03: media is draft-role only)");
  await obj(W.STAFF, "DELETE", "company-media-private", pm);
  finding(await exists("company-media-private", pm), "company-media-private: a read-only viewer cannot delete company media");

  console.log("\n  MESSAGE-ATTACHMENTS (private; <conversationId>/<file>)");
  const at = `${CONV}/${n("att.png")}`;
  ok((await obj(W.INVESTOR, "POST", "message-attachments", at)) === 200, "EXPECT: the investor in the conversation uploads an attachment");
  ok((await obj(W.INVESTOR_B, "POST", "message-attachments", `${CONV}/${n("intruder.png")}`)) >= 400, "EXPECT: another investor cannot write into that conversation");
  ok((await obj(W.COMPANY_B, "POST", "message-attachments", `${CONV}/${n("intruder-b.png")}`)) >= 400, "EXPECT: another company cannot write into that conversation");
  ok((await obj(W.INVESTOR, "POST", "message-attachments", `${CONV}/${n("bad.html")}`, { type: "text/html", body: "<b>x</b>" })) >= 400, "EXPECT: a file type outside the allow-list is refused");
  for (const who of ["INVESTOR_B", "COMPANY_B", "INVESTOR"]) await obj(W[who], "DELETE", "message-attachments", at);
  ok(await exists("message-attachments", at), "EXPECT: nobody can delete a sent attachment from the client (append-only), its uploader included");
  await obj(W.INVESTOR_B, "POST", "message-attachments", at, { body: "overwrite", upsert: true });
  ok(await exists("message-attachments", at), "EXPECT: another investor cannot overwrite it");
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  console.log("\n  CLEANUP");
  await q(`delete from public.documents where company_id = $1 and storage_path like $2`, [A, `%a24-%`]).catch((e) => ok(false, "cleanup documents rows", e.message));
  await q(`delete from public.media_assets where company_id = $1 and storage_path like $2`, [A, `%a24-%`]).catch((e) => ok(false, "cleanup media_assets rows", e.message));
  // Every a24 object, this run's and any earlier run's leftovers.
  const all = await q(`select bucket_id, name from storage.objects where name like '%a24-%'`);
  const byBucket = {};
  for (const o of all) (byBucket[o.bucket_id] ||= []).push(o.name);
  for (const [bucket, prefixes] of Object.entries(byBucket)) {
    await fetch(`${SB}/storage/v1/object/${bucket}`, { method: "DELETE", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json" }, body: JSON.stringify({ prefixes }) }).catch(() => {});
  }
}
ok((await q(`select count(*)::int n from storage.objects where name like '%a24-%'`))[0].n === 0 && (await q(`select count(*)::int n from public.documents where storage_path like '%a24-%'`))[0].n === 0, "every a24 test object and row removed");
await pgc.end();
console.log(`\n  storage-write-isolation (staging): ${pass} passed, ${fail} failed, ${findings.length} finding(s)${STRICT ? " (strict)" : ""}\n`);
process.exit(fail ? 1 : 0);
