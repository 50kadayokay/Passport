// a04 / d28 / d29 live check -- profile drafts against the STAGING database
// (migration 0072 applied there), through the local staging server, signed in
// as the real fixture users, plus two separate database connections for truly
// simultaneous saves and publish locking.
//
//   node scripts/profile-draft-live-test.mjs
//
// Covers: every company role on load / save / publish / discard / go-live;
// drafts invisible to investors (anon) and leaving the live profile untouched;
// simultaneous saves (API and two connections) -- exactly one wins; publish
// atomic and exclusive (a save racing a publish waits, then is told the draft
// is gone); timeline written meanwhile preserved; snapshot + audit written;
// live_changed after a Company Memory rebuild (the D23 direct-to-live path,
// still working); discard; and the Mission Control concierge write (platform
// admin, direct-to-live, the approved exception).
//
// WRITES (staging only): company A's live profile (restored at the end,
// verified identical), drafts (removed), and the company_profile_versions /
// activity_log rows this test creates (removed). Prints no secrets.

import fs from "node:fs";
import pg from "pg";
import { spawn } from "node:child_process";

const readEnvFile = (f) => Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
const iso = readEnvFile("supabase/staging/.isolation-env"), apiEnv = readEnvFile("supabase/staging/.api-env");
const SB = (iso.ISOLATION_SUPABASE_URL || "").replace(/\/+$/, ""), ANON = iso.ISOLATION_ANON_KEY, SERVICE = apiEnv.STAGING_SUPABASE_SERVICE_ROLE_KEY;
const DSN = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (!SB || /rvptronniomlqumjhyrr/.test(SB + DSN) || !/jmljfovtfxcdhjmtlnva/.test(SB) || !/jmljfovtfxcdhjmtlnva/.test(DSN)) { console.error("  refusing: not the staging project"); process.exit(2); }
const A = iso.ISOLATION_COMPANY_A_ID, B = iso.ISOLATION_COMPANY_B_ID, MARK = "[0072-live]";

const PORT = 8787 + Math.floor(Math.random() * 500);
const server = spawn(process.execPath, ["scripts/staging-api-server.mjs", "--port", String(PORT)], { stdio: ["ignore", "pipe", "pipe"] });
process.on("exit", () => { try { server.kill(); } catch {} });
const API = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 40; i++) { if (await fetch(`${API}/__staging/egress`).then((r) => r.ok).catch(() => false)) break; await new Promise((r) => setTimeout(r, 250)); }
const egress = async () => ((await (await fetch(`${API}/__staging/egress`)).json()).log || []);

const db = async (path, init = {}) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json", ...(init.headers || {}) } });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: r.status, body: j };
};
const rows = async (p) => { const r = await db(p); if (r.status >= 300) throw new Error(`${p.split("?")[0]} ${r.status}`); return r.body; };
const signIn = async (k) => { const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: iso[`ISOLATION_${k}_EMAIL`], password: iso[`ISOLATION_${k}_PASS`] }) }); const j = r.ok ? await r.json() : null; return j ? { token: j.access_token, id: j.user.id } : null; };
const route = async (user, body, path = "profile-draft") => { const r = await fetch(`${API}/api/${path}`, { method: "POST", headers: { "content-type": "application/json", ...(user ? { authorization: `Bearer ${user.token}` } : {}) }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const asUserRest = async (user, path, init = {}) => { const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: ANON, Authorization: `Bearer ${user.token}`, "content-type": "application/json", ...(init.headers || {}) } }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: r.status, body: j }; };
const liveA = async () => (await rows(`companies?id=eq.${A}&select=profile,updated_at,status`))[0];

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

const who = {}; for (const k of ["COMPANY_A", "COADMIN", "EDITOR", "PUBLISHER", "ANALYST", "STAFF", "INVESTOR", "COMPANY_B", "ADMIN"]) who[k] = await signIn(k);
const missing = Object.entries(who).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) { console.error(`  could not sign in: ${missing.join(", ")}`); process.exit(4); }

const testStart = new Date().toISOString();
const before = await liveA();
const beforeB = (await rows(`companies?id=eq.${B}&select=profile,updated_at`))[0];
const egressStart = (await egress()).length;
const draftWith = (base, name) => ({ projects: base.projects ?? [], pp: { ...(base.pp || {}), COMPANY: { ...((base.pp || {}).COMPANY || {}), name } } });
const c1 = new pg.Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } }), c2 = new pg.Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } });
await c1.connect(); await c2.connect();
for (const c of [c1, c2]) await c.query(`set role service_role`);
const sfn = async (c, sql, args) => (await c.query(sql, args)).rows[0].j;

console.log(`\n  staging ${new URL(SB).host.split(".")[0]} · profile drafts (0072 applied)`);
try {
  console.log("\n  ROLES ON LOAD");
  for (const [k, expectPublish] of [["COMPANY_A", true], ["COADMIN", true], ["EDITOR", false], ["ADMIN", true]]) {
    const r = await route(who[k], { action: "load", companyId: A });
    ok(r.status === 200 && r.body.can_publish === expectPublish && r.body.live && typeof r.body.live_fingerprint === "string", `${k}: load 200, can_publish=${expectPublish}`);
  }
  for (const k of ["PUBLISHER", "ANALYST", "STAFF", "INVESTOR", "COMPANY_B"]) {
    const r = await route(who[k], { action: "load", companyId: A });
    ok(r.status === 403 && !r.body.live, `${k}: load 403, no profile returned`);
  }
  ok((await route(null, { action: "load", companyId: A })).status === 401, "signed out: 401");

  console.log("\n  SAVE: a draft, apart from the live profile");
  let L = (await route(who.EDITOR, { action: "load", companyId: A })).body;
  for (const k of ["PUBLISHER", "ANALYST", "STAFF", "INVESTOR", "COMPANY_B"]) {
    const r = await route(who[k], { action: "save", companyId: A, draft: draftWith(L.live, `${MARK} ${k}`), baseFingerprint: L.live_fingerprint });
    ok(r.status === 403, `${k}: save 403`);
  }
  let r = await route(who.EDITOR, { action: "save", companyId: A, draft: draftWith(L.live, `${MARK} draft 1`), baseFingerprint: L.live_fingerprint });
  ok(r.status === 200 && r.body.version === 1, "editor: first save -> version 1");
  const afterSave = await liveA();
  ok(JSON.stringify(afterSave.profile) === JSON.stringify(before.profile) && afterSave.updated_at === before.updated_at, "the LIVE profile is untouched (content and updated_at)");
  const anonView = await fetch(`${SB}/rest/v1/companies?id=eq.${A}&select=profile`, { headers: { apikey: ANON } }).then((x) => x.json()).catch(() => []);
  ok(!JSON.stringify(anonView).includes(`${MARK} draft 1`), "anon (the investor app) does not see the draft");
  ok((await asUserRest(who.COMPANY_A, `company_profile_drafts?company_id=eq.${A}`)).status >= 400, "owner of A cannot read the drafts table directly");
  L = (await route(who.COADMIN, { action: "load", companyId: A })).body;
  ok(L.draft && L.draft.version === 1 && L.draft.draft.pp.COMPANY.name === `${MARK} draft 1`, "draft recovery: another member's load returns the saved draft");

  console.log("\n  SIMULTANEOUS SAVES THROUGH THE API (5 at once, all on version 1)");
  const shots = await Promise.all(["EDITOR", "COADMIN", "COMPANY_A", "EDITOR", "COADMIN"].map((k, i) => route(who[k], { action: "save", companyId: A, draft: draftWith(L.live, `${MARK} race ${i}`), expectedVersion: 1 })));
  ok(shots.filter((x) => x.status === 200).length === 1 && shots.filter((x) => x.status === 409 && x.body.error === "stale_draft").length === 4, `exactly one accepted (${shots.map((x) => x.status).join(",")})`);
  const winner = shots.findIndex((x) => x.status === 200);
  const stored = (await rows(`company_profile_drafts?company_id=eq.${A}&select=version,draft`))[0];
  ok(stored.version === 2 && stored.draft.pp.COMPANY.name === `${MARK} race ${winner}`, "the stored draft is the winner's, version 2 -- no lost-update mix");

  console.log("\n  PUBLISH: roles, staleness, exclusivity");
  for (const k of ["EDITOR", "PUBLISHER", "STAFF", "COMPANY_B"]) {
    r = await route(who[k], { action: "publish", companyId: A, expectedVersion: 2 });
    ok(r.status === 403, `${k}: publish 403`);
  }
  r = await route(who.COMPANY_A, { action: "publish", companyId: A, expectedVersion: 1 });
  ok(r.status === 409 && r.body.error === "stale_draft", "owner publishing a stale version -> 409 stale_draft");
  // A release is published meanwhile: the timeline service writes the live profile.
  await db("rpc/upsert_timeline_entry", { method: "POST", body: JSON.stringify({ p_company: A, p_entry: { key: "pub:0072-live", id: "0072-live", title: `${MARK} timeline entry written meanwhile`, date: "2026-10-31", source: "publication" } }) });
  const pubs = await Promise.all([route(who.COMPANY_A, { action: "publish", companyId: A, expectedVersion: 2 }), route(who.COADMIN, { action: "publish", companyId: A, expectedVersion: 2 }), route(who.ADMIN, { action: "publish", companyId: A, expectedVersion: 2 })]);
  ok(pubs.filter((x) => x.status === 200).length === 1 && pubs.filter((x) => x.status === 409).length === 2, `3 simultaneous publishes -> exactly one (${pubs.map((x) => `${x.status}${x.body.error ? ":" + x.body.error : ""}`).join(",")})`);
  const afterPub = await liveA();
  ok(afterPub.profile.pp.COMPANY.name === `${MARK} race ${winner}`, "live pp now has the published draft");
  ok((afterPub.profile.timeline || []).some((e) => e && e.key === "pub:0072-live"), "the timeline entry written meanwhile is PRESERVED");
  ok(Object.keys(before.profile || {}).every((k) => ["pp", "projects", "timeline"].includes(k) || JSON.stringify(afterPub.profile[k]) === JSON.stringify(before.profile[k])), "every other live key unchanged");
  const snaps = await rows(`company_profile_versions?company_id=eq.${A}&created_at=gte.${encodeURIComponent(testStart)}&select=note,profile`);
  ok(snaps.length === 1 && snaps[0].note === "before profile publish" && snaps[0].profile.pp?.COMPANY?.name !== `${MARK} race ${winner}`, "exactly one snapshot, of the PRE-publish profile");
  const acts = await rows(`activity_log?company_id=eq.${A}&created_at=gte.${encodeURIComponent(testStart)}&action=eq.profile_published&select=actor_id,new_value`);
  ok(acts.length === 1 && acts[0].new_value.draft_version === 2, "exactly one audit row (who, which version)");
  ok((await rows(`company_profile_drafts?company_id=eq.${A}&select=company_id`)).length === 0, "the draft is completed");

  console.log("\n  TWO DATABASE CONNECTIONS");
  let fp = (await route(who.EDITOR, { action: "load", companyId: A })).body.live_fingerprint;
  const live2 = (await liveA()).profile;
  const [s1, s2] = await Promise.all([
    sfn(c1, `select public.save_profile_draft($1, $2, $3::jsonb, null, $4) j`, [A, who.EDITOR.id, JSON.stringify(draftWith(live2, `${MARK} conn1`)), fp]),
    sfn(c2, `select public.save_profile_draft($1, $2, $3::jsonb, null, $4) j`, [A, who.COADMIN.id, JSON.stringify(draftWith(live2, `${MARK} conn2`)), fp]),
  ]);
  ok([s1, s2].filter((x) => x.ok).length === 1 && [s1, s2].filter((x) => x.error === "stale_draft").length === 1, `two connections, simultaneous FIRST saves -> one created, one stale_draft (${JSON.stringify([s1.ok || s1.error, s2.ok || s2.error])})`);
  // c1 holds a publish open; c2's save on the same draft must WAIT, then learn the draft is gone.
  await c1.query("begin");
  const p1 = await sfn(c1, `select public.publish_profile_draft($1, $2, 1) j`, [A, who.COMPANY_A.id]);
  const t0 = Date.now();
  const pending = sfn(c2, `select public.save_profile_draft($1, $2, $3::jsonb, 1, null) j`, [A, who.EDITOR.id, JSON.stringify(draftWith(live2, `${MARK} during publish`))]);
  await new Promise((res) => setTimeout(res, 1500));
  await c1.query("commit");
  const s3 = await pending; const waited = Date.now() - t0;
  ok(p1.ok, "connection 1: publish inside an open transaction");
  ok(waited >= 1300 && s3.ok === false && s3.error === "draft_missing", `connection 2's save WAITED ${waited} ms for the publish, then -> draft_missing (no draft resurrected, no lost publish)`);
  fp = (await route(who.EDITOR, { action: "load", companyId: A })).body.live_fingerprint;
  await sfn(c1, `select public.save_profile_draft($1, $2, $3::jsonb, null, $4) j`, [A, who.EDITOR.id, JSON.stringify(draftWith((await liveA()).profile, `${MARK} p-race`)), fp]);
  const [q1, q2] = await Promise.all([
    sfn(c1, `select public.publish_profile_draft($1, $2, 1) j`, [A, who.COMPANY_A.id]),
    sfn(c2, `select public.publish_profile_draft($1, $2, 1) j`, [A, who.COADMIN.id]),
  ]);
  ok([q1, q2].filter((x) => x.ok).length === 1 && [q1, q2].some((x) => x.error === "no_draft"), `two connections, simultaneous PUBLISH -> one publishes, the other no_draft (${JSON.stringify([q1.ok || q1.error, q2.ok || q2.error])})`);
  ok((await rows(`company_profile_versions?company_id=eq.${A}&created_at=gte.${encodeURIComponent(testStart)}&select=id`)).length === 3, "  ...one snapshot per successful publish (3 so far), none from the losers");

  console.log("\n  CONFLICT WITH A COMPANY MEMORY REBUILD (D23, still direct-to-live)");
  L = (await route(who.EDITOR, { action: "load", companyId: A })).body;
  r = await route(who.EDITOR, { action: "save", companyId: A, draft: draftWith(L.live, `${MARK} before rebuild`), baseFingerprint: L.live_fingerprint });
  ok(r.status === 200, "a new draft");
  const baseUpd = (await liveA()).updated_at;
  const mem = await route(who.COMPANY_A, { companyId: A, fields: { companyStatus: { statusHeadline: `${MARK} rebuild headline` } }, baseUpdatedAt: baseUpd }, "memory-save");
  ok(mem.status === 200 && mem.body.ok, `Company Memory rebuild saves straight to the live profile, as approved (${mem.status})`);
  ok((await liveA()).profile.companyStatus?.statusHeadline === `${MARK} rebuild headline`, "  ...the live profile has the rebuild");
  ok((await route(who.EDITOR, { action: "load", companyId: A })).body.draft.stale === true, "the draft is flagged stale on load");
  const liveBeforeConflict = JSON.stringify((await liveA()).profile);
  r = await route(who.COMPANY_A, { action: "publish", companyId: A, expectedVersion: r.body.version });
  ok(r.status === 409 && r.body.error === "live_changed" && JSON.stringify((await liveA()).profile) === liveBeforeConflict, "publish -> 409 live_changed; the rebuild is NOT overwritten");

  console.log("\n  DISCARD");
  for (const k of ["PUBLISHER", "STAFF"]) { r = await route(who[k], { action: "discard", companyId: A, expectedVersion: 1 }); ok(r.status === 403, `${k}: discard 403`); }
  r = await route(who.EDITOR, { action: "discard", companyId: A, expectedVersion: 9 });
  ok(r.status === 409 && r.body.error === "stale_draft", "discard on a stale version -> 409");
  r = await route(who.EDITOR, { action: "discard", companyId: A, expectedVersion: 1 });
  ok(r.status === 200 && (await rows(`company_profile_drafts?company_id=eq.${A}&select=company_id`)).length === 0, "editor discards; the live profile keeps the rebuild");

  console.log("\n  GO-LIVE (d29) AS EACH ROLE (company A is already live: no status change possible)");
  for (const k of ["EDITOR", "PUBLISHER", "ANALYST", "STAFF", "COMPANY_B", "INVESTOR"]) {
    const g = await asUserRest(who[k], "rpc/company_go_live", { method: "POST", body: JSON.stringify({ p_company_id: A, p_version: "v" }) });
    ok(g.status === 200 && g.body.ok === false && g.body.error === "forbidden", `${k}: forbidden`);
  }
  for (const k of ["COMPANY_A", "COADMIN", "ADMIN"]) {
    const g = await asUserRest(who[k], "rpc/company_go_live", { method: "POST", body: JSON.stringify({ p_company_id: A, p_version: "v" }) });
    ok(g.status === 200 && (g.body.ok === true || g.body.error !== "forbidden"), `${k}: admitted (${JSON.stringify(g.body)})`);
  }

  console.log("\n  MISSION CONTROL CONCIERGE EDITOR (platform admin, direct-to-live: approved exception)");
  const cur = (await liveA()).profile;
  const snap = await asUserRest(who.ADMIN, "company_profile_versions", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ company_id: A, slug: iso.ISOLATION_COMPANY_A_SLUG, profile: cur, note: `${MARK} concierge snapshot`, created_by: who.ADMIN.id }) });
  const patched = await asUserRest(who.ADMIN, `companies?slug=eq.${encodeURIComponent(iso.ISOLATION_COMPANY_A_SLUG)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ profile: { ...cur, pp: { ...cur.pp, COMPANY: { ...(cur.pp?.COMPANY || {}), name: `${MARK} concierge edit` } } } }) });
  ok(snap.status < 300 && patched.status === 200 && Array.isArray(patched.body) && patched.body.length === 1, "platform admin: snapshot + direct PATCH of the live profile still work (1 row)");
  ok((await liveA()).profile.pp.COMPANY.name === `${MARK} concierge edit`, "  ...and are live immediately");
  const coPatch = await asUserRest(who.COADMIN, `companies?id=eq.${A}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ profile: cur }) });
  ok(coPatch.status === 200 && Array.isArray(coPatch.body) && coPatch.body.length === 0, "a company admin's direct PATCH still matches 0 rows (RLS unchanged) -- the portal no longer uses that path");

  const eg = (await egress()).slice(egressStart);
  ok(eg.every((e) => e.action !== "block"), "no outbound call had to be blocked");
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  try { server.kill(); } catch {}
  await c1.query("rollback").catch(() => {});
  await c1.end().catch(() => {}); await c2.end().catch(() => {});
  await new Promise((res) => setTimeout(res, 1000));
  await db(`company_profile_drafts?company_id=in.(${A},${B})`, { method: "DELETE" });
  await db(`company_profile_versions?company_id=in.(${A},${B})&created_at=gte.${encodeURIComponent(testStart)}`, { method: "DELETE" });
  await db(`activity_log?company_id=in.(${A},${B})&created_at=gte.${encodeURIComponent(testStart)}`, { method: "DELETE" });
  await db(`companies?id=eq.${A}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ profile: before.profile }) });
  const after = await liveA();
  const afterB = (await rows(`companies?id=eq.${B}&select=profile,updated_at`))[0];
  const left = { drafts: (await rows(`company_profile_drafts?select=company_id`)).length, versions: (await rows(`company_profile_versions?created_at=gte.${encodeURIComponent(testStart)}&select=id`)).length, activity: (await rows(`activity_log?created_at=gte.${encodeURIComponent(testStart)}&select=id`)).length };
  const profOk = JSON.stringify(after.profile) === JSON.stringify(before.profile) && after.status === before.status;
  const bOk = JSON.stringify(afterB.profile) === JSON.stringify(beforeB.profile) && afterB.updated_at === beforeB.updated_at;
  console.log(`\n  cleanup: company A profile ${profOk ? "restored (content identical; updated_at moves on restore)" : "NOT identical"}; company B ${bOk ? "untouched" : "CHANGED"}; left: ${JSON.stringify(left)}`);
  if (!profOk || !bOk || left.drafts || left.versions || left.activity) fail++;
}
console.log(`  profile-draft-live (staging): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
