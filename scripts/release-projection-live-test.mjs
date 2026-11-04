// D1 live verification on STAGING: a portal press release with a MineEx analysis
// and a picked image, published through the real /api/publish and the real
// dispatcher, reaches investors with the summary, the full text and the image.
//
//   node scripts/release-projection-live-test.mjs
//
// WHAT IT WRITES (staging only, all removed or retired at the end): one PNG in
// company A's private media folder and its public copy, one media_assets row,
// one draft + publication headed "[d22-live] D1 ..." (retired: revision history
// is append-only), its post and facts, and company A's profile (snapshotted and
// restored, verified identical). Refuses to run unless the target is staging.
import fs from "node:fs";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

const readEnvFile = (f) => Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
let iso = readEnvFile("supabase/staging/.isolation-env");
const apiEnv = readEnvFile("supabase/staging/.api-env");
const SB = (iso.ISOLATION_SUPABASE_URL || "").replace(/\/+$/, ""), ANON = iso.ISOLATION_ANON_KEY, SERVICE = apiEnv.STAGING_SUPABASE_SERVICE_ROLE_KEY, DSECRET = apiEnv.DISPATCH_SECRET;
if (!SB || /rvptronniomlqumjhyrr/.test(SB) || !/jmljfovtfxcdhjmtlnva/.test(SB)) { console.error("  refusing: not the staging project"); process.exit(2); }
if (!SERVICE || !DSECRET) { console.error("  staging service key or DISPATCH_SECRET missing from .api-env"); process.exit(3); }
{ const s = spawnSync(process.execPath, ["scripts/seed-isolation-fixtures.mjs"], { encoding: "utf8" }); if (s.status !== 0) { console.error("  seeding failed"); process.exit(1); } iso = readEnvFile("supabase/staging/.isolation-env"); }
const A = iso.ISOLATION_COMPANY_A_ID;

const PORT = 8787 + Math.floor(Math.random() * 500);
const server = spawn(process.execPath, ["scripts/staging-api-server.mjs", "--port", String(PORT)], { stdio: ["ignore", "pipe", "pipe"] });
let serverLog = ""; server.stdout.on("data", (d) => { serverLog += d; }); server.stderr.on("data", (d) => { serverLog += d; });
process.on("exit", () => { try { server.kill(); } catch {} ; if (process.env.SHOW_SERVER_LOG) console.log(serverLog); });
const API = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 40; i++) { if (await fetch(`${API}/__staging/egress`).then((r) => r.ok).catch(() => false)) break; await new Promise((r) => setTimeout(r, 250)); }

const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
const db = async (path, init = {}) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...svc, "content-type": "application/json", ...(init.headers || {}) } });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: r.status, body: j };
};
const rows = async (path) => { const r = await db(path); if (r.status !== 200) throw new Error(`db read ${r.status}: ${path.split("?")[0]}`); return r.body; };
const signIn = async (k) => { const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: iso[`ISOLATION_${k}_EMAIL`], password: iso[`ISOLATION_${k}_PASS`] }) }); const j = r.ok ? await r.json() : null; return j ? { token: j.access_token, id: j.user.id } : null; };
const owner = await signIn("COMPANY_A");
const callApi = async (route, user, body, headers = {}) => {
  const r = await fetch(`${API}/api/${route}`, { method: "POST", headers: { "content-type": "application/json", ...(user ? { authorization: `Bearer ${user.token}` } : {}), ...headers }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const dispatchNow = () => callApi("dispatch", null, { trigger: "test" }, { "x-dispatch-secret": DSECRET });
const delivery = async (pubId, listener, type) => {
  const ev = await rows(`events?publication_id=eq.${pubId}&event_type=eq.${type}&select=id&order=created_at.desc&limit=1`);
  if (!ev[0]) return null;
  return (await rows(`event_deliveries?event_id=eq.${ev[0].id}&listener=eq.${listener}&select=status,attempts,last_error`))[0] || null;
};
const settle = async (pubId, listeners, type) => {
  for (let i = 0; i < 8; i++) {
    const ds = await Promise.all(listeners.map((l) => delivery(pubId, l, type)));
    if (ds.every((d) => d && d.status === "succeeded")) return ds;
    const ev = await rows(`events?publication_id=eq.${pubId}&select=id`);
    if (ev.length) await db(`event_deliveries?event_id=in.(${ev.map((e) => e.id).join(",")})&status=eq.failed`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ next_attempt_at: new Date(Date.now() - 1000).toISOString() }) });
    await dispatchNow();
  }
  return Promise.all(listeners.map((l) => delivery(pubId, l, type)));
};

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

// A real 1x1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const ASSET = crypto.randomUUID();
const PRIV = `${A}/${ASSET}.png`;
const HEADLINE = `[d22-live] D1 release ${ASSET.slice(0, 8)}`;
const BODY = `${HEADLINE}\n\nVancouver, BC - Fixture company A reports a staging test result.\n\nThis is the full release text, paragraph two.`;
const card = { headline: HEADLINE, category: "Drilling", whatHappened: "Company A reported a staging test result.", whyItMatters: "It proves the full release reaches investors.", keyNumbers: [{ value: "1", label: "test" }] };

const profileBefore = (await rows(`companies?id=eq.${A}&select=profile`))[0].profile;
let pubId = null, updId = null;
console.log(`\n  staging ${new URL(SB).host.split(".")[0]}`);
try {
  // The company's own upload, in its private folder (as the portal stores it).
  const up = await fetch(`${SB}/storage/v1/object/company-media-private/${PRIV}`, { method: "POST", headers: { ...svc, "content-type": "image/png" }, body: PNG });
  ok(up.ok, "fixture image stored privately", String(up.status));
  const ma = await db("media_assets", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ id: ASSET, company_id: A, mime_type: "image/png", bytes: PNG.length, sha256: crypto.createHash("sha256").update(PNG).digest("hex"), storage_path: `company-media-private/${PRIV}` }) });
  ok(ma.status < 300, "media asset recorded", JSON.stringify(ma.body).slice(0, 200));
  const priv = await fetch(`${SB}/storage/v1/object/public/company-media-private/${PRIV}`);
  ok(!priv.ok, "the private original is not publicly readable");

  const u = await db("updates", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: A, body: BODY, status: "draft", published_on: "2026-11-02",
    detected: { headline: HEADLINE, analysis: { card, classification: { suggestedKey: false } }, selected_asset_ids: [ASSET] } }) });
  updId = u.body[0].id;
  const p = await db("publications", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: A, update_id: updId, destination_id: "passport", status: "approved", content: { post_type: "press_release", headline: HEADLINE, body: BODY, fullText: BODY } }) });
  pubId = p.body[0].id;

  const pr = await callApi("publish", owner, { publicationId: pubId });
  ok(pr.status === 200, "the owner publishes through /api/publish", `${pr.status} ${JSON.stringify(pr.body).slice(0, 200)}`);
  const ds = await settle(pubId, ["feed_projection_v1", "profile_timeline_v1"], "PUBLICATION_PUBLISHED");
  ok(ds.every((d) => d && d.status === "succeeded"), "feed and timeline deliveries succeed", JSON.stringify(ds));

  const post = (await rows(`posts?publication_id=eq.${pubId}&select=summary,thumbnail_url`))[0] || {};
  ok(post.summary === card.whatHappened, "feed post: the MineEx summary, not the release body", String(post.summary).slice(0, 100));
  ok(String(post.thumbnail_url || "").includes(`/company-media/releases/${A}/${ASSET}.png`), "feed post: the picked image's public copy", post.thumbnail_url);
  const img = await fetch(post.thumbnail_url || "about:blank").catch(() => null);
  ok(img && img.ok && /image\/png/.test(img.headers.get("content-type") || ""), "...which anyone can load as an image");
  const asset = (await rows(`media_assets?id=eq.${ASSET}&select=visibility,public_storage_path,published_at`))[0];
  ok(asset.visibility === "published" && asset.public_storage_path === `company-media/releases/${A}/${ASSET}.png`, "the asset records its public copy");

  const pp = (await rows(`companies?id=eq.${A}&select=profile`))[0].profile.pp;
  const item = (pp.PR_YEARS || []).flatMap((y) => y.items || []).find((x) => x.pubKey === `pub:${pubId}`);
  ok(item && item.whatHappened === card.whatHappened && item.key === false, "the compiled profile the apps read has the release with its MineEx summary", JSON.stringify(item || {}).slice(0, 200));
  const full = pp.FULL && pp.FULL["2026-11-02"];
  ok(full && full.text === BODY && Array.isArray(full.images) && full.images[0] === post.thumbnail_url, "'Read Full Press Release' opens the full text with the image");
  const guest = await fetch(`${SB}/rest/v1/companies?id=eq.${A}&select=pp:profile->pp`, { headers: { apikey: ANON } }).then((r) => r.json());
  ok(Array.isArray(guest) && guest[0] && guest[0].pp && guest[0].pp.FULL && guest[0].pp.FULL["2026-11-02"], "a guest reads it on the published company's profile");

  const un = await callApi("unpublish", owner, { publicationId: pubId });
  ok(un.status === 200, "the owner unpublishes", `${un.status}`);
  const dsU = await settle(pubId, ["profile_timeline_v1"], "PUBLICATION_UNPUBLISHED");
  ok(dsU.every((d) => d && d.status === "succeeded"), "the unpublish delivery succeeds", JSON.stringify(dsU));
  const pp2 = (await rows(`companies?id=eq.${A}&select=profile`))[0].profile.pp;
  ok(!(pp2.PR_YEARS || []).flatMap((y) => y.items || []).some((x) => x.pubKey === `pub:${pubId}`) && !(pp2.FULL && pp2.FULL["2026-11-02"] && pp2.FULL["2026-11-02"].pubKey === `pub:${pubId}`), "unpublishing removes it from the compiled profile");
} finally {
  try { server.kill(); } catch {}
  await new Promise((res) => setTimeout(res, 2500));
  if (pubId) {
    await db(`facts?publication_id=eq.${pubId}`, { method: "DELETE" });
    await db(`posts?publication_id=eq.${pubId}`, { method: "DELETE" });
    const d = await db(`publications?id=eq.${pubId}`, { method: "DELETE" });
    if (d.status < 300 && updId) await db(`updates?id=eq.${updId}`, { method: "DELETE" });
  }
  spawnSync(process.execPath, ["scripts/retire-test-publications.mjs", "--apply"], { encoding: "utf8" });
  await db(`media_assets?id=eq.${ASSET}`, { method: "DELETE" });
  await fetch(`${SB}/storage/v1/object/company-media-private/${PRIV}`, { method: "DELETE", headers: svc });
  await fetch(`${SB}/storage/v1/object/company-media/releases/${A}/${ASSET}.png`, { method: "DELETE", headers: svc });
  await db(`companies?id=eq.${A}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ profile: profileBefore }) });
  const back = JSON.stringify((await rows(`companies?id=eq.${A}&select=profile`))[0].profile) === JSON.stringify(profileBefore);
  // Checked in storage itself: the public URL can keep serving from the CDN cache for a while.
  const left = await fetch(`${SB}/storage/v1/object/list/company-media`, { method: "POST", headers: { ...svc, "content-type": "application/json" }, body: JSON.stringify({ prefix: `releases/${A}/`, limit: 100 }) }).then((r) => r.json()).catch(() => null);
  const pubGone = Array.isArray(left) && !left.some((o) => String(o.name).startsWith(ASSET));
  console.log(`\n  cleanup: profile ${back ? "restored (verified identical)" : "NOT restored"}, test image ${pubGone ? "removed" : "STILL PUBLIC"}, release deleted or retired`);
  if (!back || !pubGone) fail++;
}
console.log(`  release-projection-live (staging): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
