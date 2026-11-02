// a15 · Content fan-out, LIVE on STAGING: one release published through the
// real /api/publish is delivered by the real dispatcher to the investor feed,
// the website and Conference Mode, each with its own delivery state; the
// website (/api/site-content) and the booth (/api/conference-config and the
// anon booth read) serve it; an unpublish removes it everywhere.
//   node scripts/content-fanout-live-test.mjs
// FOR S4. Needs 0085 + 0088 applied to staging, supabase/staging/.api-env and
// .isolation-env; starts its own local staging API server (as publishing-live does).
//
// WHAT IT WRITES (staging only): one "[a15-live]" update/publication for
// company A (deleted at the end, or retired if it gained history), one site
// token (deleted), a temporary booth look for company A if it had none
// (deleted; an existing one is left untouched). Prints no secrets.

import fs from "node:fs";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

const readEnvFile = (f) => Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
const iso = readEnvFile("supabase/staging/.isolation-env");
const apiEnv = readEnvFile("supabase/staging/.api-env");
const SB = (iso.ISOLATION_SUPABASE_URL || "").replace(/\/+$/, ""), ANON = iso.ISOLATION_ANON_KEY, SERVICE = apiEnv.STAGING_SUPABASE_SERVICE_ROLE_KEY, DSECRET = apiEnv.DISPATCH_SECRET;
if (!SB || /rvptronniomlqumjhyrr/.test(SB) || !/jmljfovtfxcdhjmtlnva/.test(SB)) { console.error("  refusing: not the staging project"); process.exit(2); }
if (!SERVICE || !DSECRET) { console.error("  staging service key or DISPATCH_SECRET missing from .api-env"); process.exit(3); }
const A = iso.ISOLATION_COMPANY_A_ID;
const MARK = "[a15-live]";
const LISTENERS = ["feed_projection_v1", "site_content_v1", "conference_content_v1"];

const PORT = 8787 + Math.floor(Math.random() * 500);
const server = spawn(process.execPath, ["scripts/staging-api-server.mjs", "--port", String(PORT)], { stdio: ["ignore", "pipe", "pipe"] });
let serverLog = ""; server.stdout.on("data", (d) => { serverLog += d; }); server.stderr.on("data", (d) => { serverLog += d; });
process.on("exit", () => { try { server.kill(); } catch {} ; if (process.env.SHOW_SERVER_LOG) console.log(serverLog); });
const API = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 40; i++) { if (await fetch(`${API}/__staging/egress`).then((r) => r.ok).catch(() => false)) break; await new Promise((r) => setTimeout(r, 250)); }

const db = async (path, init = {}) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json", ...(init.headers || {}) } });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: r.status, body: j };
};
const rows = async (path) => { const r = await db(path); if (r.status !== 200) throw new Error(`db read ${r.status}: ${path.split("?")[0]}`); return r.body; };
const signIn = async (k) => { const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: iso[`ISOLATION_${k}_EMAIL`], password: iso[`ISOLATION_${k}_PASS`] }) }); const j = r.ok ? await r.json() : null; return j ? { token: j.access_token, id: j.user.id } : null; };
const who = {}; for (const k of ["COMPANY_A", "COMPANY_B"]) who[k] = await signIn(k);
const callApi = async (route, user, body, headers = {}) => {
  const r = await fetch(`${API}/api/${route}`, { method: "POST", headers: { "content-type": "application/json", ...(user ? { authorization: `Bearer ${user.token}` } : {}), ...headers }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const userRpc = async (user, fn, body) => {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${user ? user.token : ANON}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const dispatchNow = () => callApi("dispatch", null, { trigger: "test" }, { "x-dispatch-secret": DSECRET });
const delivery = async (pubId, listener, type) => {
  const ev = await rows(`events?publication_id=eq.${pubId}&event_type=eq.${type}&select=id&order=created_at.desc&limit=1`);
  if (!ev[0]) return null;
  return (await rows(`event_deliveries?event_id=eq.${ev[0].id}&listener=eq.${listener}&select=status,attempts,last_error`))[0] || null;
};
const settle = async (pubId, type, tries = 8) => {
  for (let i = 0; i < tries; i++) {
    const ds = await Promise.all(LISTENERS.map((l) => delivery(pubId, l, type)));
    if (ds.every((d) => d && d.status === "succeeded")) return ds;
    await dispatchNow();
  }
  return Promise.all(LISTENERS.map((l) => delivery(pubId, l, type)));
};

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

const created = { pub: null, update: null, token: null, look: false };
try {
  const co = (await rows(`companies?id=eq.${A}&select=slug,status`))[0];
  if (co.status !== "published") { console.error(`  company A is ${co.status}; the website and booth only serve published companies`); process.exit(4); }
  const subs = await rows(`listener_subscriptions?listener=in.(site_content_v1,conference_content_v1)&select=listener,event_type`);
  if (subs.length !== 6) { console.error("  0088 is not applied to staging (subscriptions missing)"); process.exit(4); }

  // A release that needs no body text stays deletable (no revision history).
  const stamp = Date.now().toString(36);
  const u = await db("updates", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: A, body: "", status: "draft", detected: { headline: `${MARK} ${stamp}`, materiality: "High", category: "Drilling" } }) });
  created.update = u.body[0].id;
  const p = await db("publications", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: A, update_id: created.update, destination_id: "passport", status: "approved", content: { headline: `${MARK} fan-out ${stamp}`, body: "", category: "Drilling", post_type: "press_release" } }) });
  created.pub = p.body[0].id;

  console.log("\n  PUBLISH -> ONE RECORD, THREE DESTINATIONS");
  let r = await callApi("publish", who.COMPANY_A, { publicationId: created.pub });
  ok(r.status === 200 && r.body.ok !== false, "owner publishes through /api/publish", JSON.stringify(r.body).slice(0, 200));
  const ds = await settle(created.pub, "PUBLICATION_PUBLISHED");
  ok(ds.every((d) => d && d.status === "succeeded"), `delivered to every destination: ${LISTENERS.map((l, i) => `${l}=${ds[i] ? ds[i].status : "none"}`).join(", ")}`);
  const pubRow = (await rows(`publications?id=eq.${created.pub}&select=publish_seq`))[0];
  const dest = await rows(`destination_content?publication_id=eq.${created.pub}&select=destination,title,version,removed_at`);
  ok(dest.length === 2 && dest.every((d) => d.title.includes(stamp) && d.version === pubRow.publish_seq && !d.removed_at), "website and conference copies carry the record's title and publish_seq", JSON.stringify(dest));
  ok((await rows(`posts?publication_id=eq.${created.pub}&select=id,removed_at`)).length === 1, "the investor feed post exists (unchanged path)");

  const st = await userRpc(who.COMPANY_A, "publication_delivery_status", { p_publication: created.pub });
  const byL = Object.fromEntries((st.body || []).map((x) => [x.listener, x.state]));
  ok(LISTENERS.every((l) => byL[l] === "delivered"), "the owner sees per-destination state (publication_delivery_status)", JSON.stringify(byL));
  const stB = await userRpc(who.COMPANY_B, "publication_delivery_status", { p_publication: created.pub });
  ok(Array.isArray(stB.body) && stB.body.length === 0, "another company sees nothing");
  const rlsB = await fetch(`${SB}/rest/v1/destination_content?publication_id=eq.${created.pub}&select=id`, { headers: { apikey: ANON, Authorization: `Bearer ${who.COMPANY_B.token}` } }).then((x) => x.json());
  ok(Array.isArray(rlsB) && rlsB.length === 0, "another company cannot read A's delivered copies");

  console.log("\n  THE WEBSITE AND THE BOOTH READ IT");
  const token = `mxs_${crypto.randomBytes(24).toString("base64url")}`;
  const t = await db("site_credentials", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: A, kind: "site", token_hash: crypto.createHash("sha256").update(token).digest("hex"), label: `a15-live-${stamp}` }) });
  created.token = t.body[0].id;
  const site = async () => { const x = await fetch(`${API}/api/site-content`, { headers: { Authorization: `Bearer ${token}` } }); return { status: x.status, body: await x.json().catch(() => ({})) }; };
  let s = await site();
  ok(s.status === 200 && (s.body.content.releases || []).some((x) => x.id === created.pub), "/api/site-content: content.releases has it");
  let br = await userRpc(null, "conference_booth_releases", { p_slug: co.slug, p_limit: 20 });
  ok(br.status === 200 && br.body.some((x) => x.publication_id === created.pub), "anon booth read has it");
  if (!(await rows(`conference_booth_configs?company_id=eq.${A}&select=company_id`)).length) {
    await db("conference_booth_configs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ company_id: A, studio: { template: "monolith" } }) });
    created.look = true;
  }
  const cfg = await fetch(`${API}/api/conference-config?c=${encodeURIComponent(co.slug)}`).then((x) => x.json()).catch(() => ({}));
  ok((cfg.releases || []).some((x) => x.id === created.pub), "/api/conference-config: releases has it (cached by the booth with its look)");

  console.log("\n  UNPUBLISH -> REMOVED EVERYWHERE");
  r = await callApi("unpublish", who.COMPANY_A, { publicationId: created.pub });
  ok(r.status === 200, "owner unpublishes");
  const du = await settle(created.pub, "PUBLICATION_UNPUBLISHED");
  ok(du.every((d) => d && d.status === "succeeded"), "unpublish delivered to every destination");
  const dest2 = await rows(`destination_content?publication_id=eq.${created.pub}&select=destination,removed_at,version`);
  ok(dest2.length === 2 && dest2.every((d) => d.removed_at && d.version > pubRow.publish_seq), "both copies removed at the newer version");
  s = await site();
  ok(s.status === 200 && !(s.body.content.releases || []).some((x) => x.id === created.pub), "the website no longer serves it");
  br = await userRpc(null, "conference_booth_releases", { p_slug: co.slug, p_limit: 20 });
  ok(br.status === 200 && !br.body.some((x) => x.publication_id === created.pub), "the booth no longer serves it");
} catch (e) {
  fail++; console.error(`  ✗ unexpected: ${e.message}`);
} finally {
  if (created.token) await db(`site_credentials?id=eq.${created.token}`, { method: "DELETE" });
  if (created.look) await db(`conference_booth_configs?company_id=eq.${A}`, { method: "DELETE" });
  if (created.pub) {
    const d = await db(`publications?id=eq.${created.pub}`, { method: "DELETE" });
    if (d.status < 300 && created.update) await db(`updates?id=eq.${created.update}`, { method: "DELETE" });
    else spawnSync(process.execPath, ["scripts/retire-test-publications.mjs", "--apply"], { encoding: "utf8" });
  }
  const left = created.pub ? (await rows(`destination_content?publication_id=eq.${created.pub}&removed_at=is.null&select=id`)).length : 0;
  console.log(`\n  cleanup: test release ${created.pub ? "deleted or retired" : "never created"}, token deleted${created.look ? ", temporary booth look deleted" : ""}; live copies left: ${left}`);
  if (left) fail++;
}
console.log(`  content-fanout-live (staging): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
