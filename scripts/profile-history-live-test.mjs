// a05 live check -- profile revision history against the STAGING database
// (0072 + 0074 applied there), through the local staging server and PostgREST,
// signed in as the real fixture users.
//   node scripts/profile-history-live-test.mjs
//
// Runs on a THROWAWAY company ("zz-a05-live") with the same memberships as
// company A, because publish snapshots are retained by design while their
// company exists. The test ends by deleting that company through the platform
// admin's ordinary REST path -- which is also the company-deletion check.
//
// Covers: list / preview / restore for every role; restore changes only the
// draft; concurrent restores into an existing draft; editor cannot publish,
// owner can; restoring + publishing preserves timeline and other live fields;
// publish snapshots cannot be deleted, relabelled or forged through
// user-accessible paths (owner and platform admin, REST); the concierge
// snapshot + prune workflow prunes only manual snapshots; company deletion.

import fs from "node:fs";
import { spawn } from "node:child_process";

const readEnvFile = (f) => Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
const iso = readEnvFile("supabase/staging/.isolation-env"), apiEnv = readEnvFile("supabase/staging/.api-env");
const SB = (iso.ISOLATION_SUPABASE_URL || "").replace(/\/+$/, ""), ANON = iso.ISOLATION_ANON_KEY, SERVICE = apiEnv.STAGING_SUPABASE_SERVICE_ROLE_KEY;
if (!SB || /rvptronniomlqumjhyrr/.test(SB) || !/jmljfovtfxcdhjmtlnva/.test(SB)) { console.error("  refusing: not the staging project"); process.exit(2); }
const SLUG = "zz-a05-live";

const PORT = 8787 + Math.floor(Math.random() * 500);
const server = spawn(process.execPath, ["scripts/staging-api-server.mjs", "--port", String(PORT)], { stdio: ["ignore", "pipe", "pipe"] });
process.on("exit", () => { try { server.kill(); } catch {} });
const API = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 40; i++) { if (await fetch(`${API}/__staging/egress`).then((r) => r.ok).catch(() => false)) break; await new Promise((r) => setTimeout(r, 250)); }

const svc = async (path, init = {}) => { const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json", ...(init.headers || {}) } }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: r.status, body: j }; };
const rows = async (p) => (await svc(p)).body;
const signIn = async (k) => { const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: iso[`ISOLATION_${k}_EMAIL`], password: iso[`ISOLATION_${k}_PASS`] }) }); const j = r.ok ? await r.json() : null; return j ? { token: j.access_token, id: j.user.id } : null; };
const route = async (user, body) => { const r = await fetch(`${API}/api/profile-draft`, { method: "POST", headers: { "content-type": "application/json", ...(user ? { authorization: `Bearer ${user.token}` } : {}) }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const asUser = async (user, path, init = {}) => { const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: ANON, Authorization: `Bearer ${user.token}`, "content-type": "application/json", ...(init.headers || {}) } }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: r.status, body: j }; };

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

const who = {}; for (const k of ["COMPANY_A", "COADMIN", "EDITOR", "PUBLISHER", "ANALYST", "STAFF", "INVESTOR", "COMPANY_B", "ADMIN"]) who[k] = await signIn(k);
if (Object.values(who).some((v) => !v)) { console.error("  could not sign in all fixture users"); process.exit(4); }

let X = null;
console.log(`\n  staging ${new URL(SB).host.split(".")[0]} · profile revision history (0074 applied)`);
try {
  // ---- throwaway company with A's role layout ------------------------------
  const baseProfile = { pp: { COMPANY: { name: "A05 Original" } }, projects: [], timeline: [{ key: "pub:seed", title: "Seed release", date: "2026-10-01" }], companyStatus: { statusHeadline: "unrelated field" } };
  X = (await svc("companies", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ slug: SLUG, name: "A05 Live", owner_id: who.COMPANY_A.id, status: "published", profile: baseProfile }) })).body[0].id;
  await svc("company_memberships", { method: "POST", headers: { Prefer: "return=minimal", "Content-Profile": "public" }, body: JSON.stringify([["COADMIN", "admin"], ["EDITOR", "editor"], ["PUBLISHER", "publisher"], ["ANALYST", "analyst"], ["STAFF", "viewer"]].map(([k, role]) => ({ company_id: X, user_id: who[k].id, role, status: "active" }))) });
  ok(!!X, "setup: throwaway company with owner, company admin, editor, publisher, analyst and viewer");

  const L = async (u = who.EDITOR) => (await route(u, { action: "load", companyId: X })).body;
  const draftWith = (live, name) => ({ projects: live.projects ?? [], pp: { ...(live.pp || {}), COMPANY: { ...((live.pp || {}).COMPANY || {}), name } } });
  // Two real publishes -> two publish snapshots.
  let l = await L(); let r = await route(who.EDITOR, { action: "save", companyId: X, draft: draftWith(l.live, "A05 V-one"), baseFingerprint: l.live_fingerprint });
  r = await route(who.COMPANY_A, { action: "publish", companyId: X, expectedVersion: 1 });
  ok(r.status === 200, "publish 1 (owner)");
  l = await L(); r = await route(who.EDITOR, { action: "save", companyId: X, draft: draftWith(l.live, "A05 V-two"), baseFingerprint: l.live_fingerprint });
  r = await route(who.COADMIN, { action: "publish", companyId: X, expectedVersion: 1 });
  ok(r.status === 200, "publish 2 (company admin)");
  const snaps = await rows(`company_profile_versions?company_id=eq.${X}&select=id,kind,created_by,created_at&order=created_at`);
  ok(snaps.length === 2 && snaps.every((s) => s.kind === "publish"), "DATABASE: 2 snapshots, both kind = 'publish'");

  console.log("\n  LIST / PREVIEW / RESTORE BY ROLE");
  for (const k of ["COMPANY_A", "COADMIN", "EDITOR", "ADMIN"]) {
    r = await route(who[k], { action: "history", companyId: X });
    ok(r.status === 200 && r.body.versions.length === 2, `${k}: history 200 (2 versions)`);
  }
  for (const k of ["PUBLISHER", "ANALYST", "STAFF", "INVESTOR", "COMPANY_B"]) {
    const h = await route(who[k], { action: "history", companyId: X });
    const v = await route(who[k], { action: "version", companyId: X, versionId: snaps[1].id });
    const rr = await route(who[k], { action: "restore", companyId: X, versionId: snaps[1].id });
    ok(h.status === 403 && v.status === 403 && rr.status === 403 && !h.body.versions && !v.body.fields, `${k}: history, preview and restore all 403, nothing returned`);
  }
  const v1 = snaps.find((s) => s.created_by === who.COADMIN.id);   // taken at publish 2 = the V-one state
  r = await route(who.EDITOR, { action: "version", companyId: X, versionId: v1.id });
  ok(r.status === 200 && r.body.fields.pp.COMPANY.name === "A05 V-one" && Object.keys(r.body.fields).sort().join(",") === "pp,projects", "editor previews V-one: only the editor-owned fields");

  console.log("\n  RESTORE CHANGES ONLY THE DRAFT");
  // A release lands on the timeline meanwhile (another service).
  await svc("rpc/upsert_timeline_entry", { method: "POST", body: JSON.stringify({ p_company: X, p_entry: { key: "pub:meanwhile", id: "meanwhile", title: "Written meanwhile", date: "2026-10-31", source: "publication" } }) });
  const liveBefore = (await rows(`companies?id=eq.${X}&select=profile,updated_at`))[0];
  r = await route(who.EDITOR, { action: "restore", companyId: X, versionId: v1.id });
  ok(r.status === 200 && r.body.version === 1, "editor restores V-one into a new draft (version 1)");
  const liveAfter = (await rows(`companies?id=eq.${X}&select=profile,updated_at`))[0];
  ok(JSON.stringify(liveAfter.profile) === JSON.stringify(liveBefore.profile) && liveAfter.updated_at === liveBefore.updated_at, "the LIVE profile is untouched (content and updated_at)");
  const anon = await fetch(`${SB}/rest/v1/companies?id=eq.${X}&select=profile`, { headers: { apikey: ANON } }).then((x) => x.json());
  ok(!JSON.stringify(anon).includes("A05 V-one"), "anon (the investor app) still sees V-two");

  console.log("\n  CONCURRENCY: restores into an existing draft");
  const older = snaps.find((s) => s.created_by === who.COMPANY_A.id);
  r = await route(who.COADMIN, { action: "restore", companyId: X, versionId: older.id });
  ok(r.status === 409 && r.body.error === "stale_draft", "a restore that does not know the existing draft -> 409 stale_draft");
  const shots = await Promise.all([who.EDITOR, who.COADMIN, who.COMPANY_A, who.EDITOR].map((u, i) => route(u, { action: "restore", companyId: X, versionId: i % 2 ? older.id : v1.id, expectedVersion: 1 })));
  ok(shots.filter((s) => s.status === 200).length === 1 && shots.filter((s) => s.status === 409).length === 3, `4 simultaneous restores on version 1 -> exactly one wins (${shots.map((s) => s.status).join(",")})`);
  const winner = shots.findIndex((s) => s.status === 200);
  const dNow = (await rows(`company_profile_drafts?company_id=eq.${X}&select=version,draft`))[0];
  ok(dNow.version === 2 && dNow.draft.pp.COMPANY.name === (winner % 2 ? "A05 Original" : "A05 V-one"), "the stored draft is exactly the winner's version (no mix)");
  r = await route(who.EDITOR, { action: "restore", companyId: X, versionId: v1.id, expectedVersion: 2 });
  ok(r.status === 200 && r.body.version === 3, "editor restores V-one again on version 2 -> version 3");

  console.log("\n  PUBLISH THE RESTORED DRAFT");
  r = await route(who.EDITOR, { action: "publish", companyId: X, expectedVersion: 3 });
  ok(r.status === 403, "editor cannot publish it (403)");
  r = await route(who.COMPANY_A, { action: "publish", companyId: X, expectedVersion: 3 });
  ok(r.status === 200, "owner publishes it");
  const live3 = (await rows(`companies?id=eq.${X}&select=profile`))[0].profile;
  ok(live3.pp.COMPANY.name === "A05 V-one", "live is V-one again");
  ok((live3.timeline || []).some((e) => e.key === "pub:meanwhile") && (live3.timeline || []).some((e) => e.key === "pub:seed") && live3.companyStatus?.statusHeadline === "unrelated field", "timeline (incl. the entry written meanwhile) and unrelated fields preserved");
  ok((await rows(`company_profile_versions?company_id=eq.${X}&kind=eq.publish&select=id`)).length === 3, "the replaced V-two is itself kept (3 publish snapshots)");
  const acts = (await rows(`activity_log?company_id=eq.${X}&select=action`)).map((a) => a.action);
  ok(acts.filter((a) => a === "profile_version_restored_to_draft").length === 3 && acts.filter((a) => a === "profile_published").length === 3, "audit: 3 restores, 3 publishes");
  // Platform admin: full rights.
  r = await route(who.ADMIN, { action: "restore", companyId: X, versionId: older.id });
  const r2 = await route(who.ADMIN, { action: "publish", companyId: X, expectedVersion: 1 });
  ok(r.status === 200 && r2.status === 200, "platform admin restores and publishes");

  console.log("\n  RETENTION THROUGH USER-ACCESSIBLE PATHS");
  const pubId = (await rows(`company_profile_versions?company_id=eq.${X}&kind=eq.publish&select=id&limit=1`))[0].id;
  for (const [k, u] of [["owner", who.COMPANY_A], ["platform admin", who.ADMIN]]) {
    const d = await asUser(u, `company_profile_versions?id=eq.${pubId}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
    ok(d.status >= 400 && (await rows(`company_profile_versions?id=eq.${pubId}&select=id`)).length === 1, `${k}: DELETE of a publish snapshot refused (${d.status}), still there`);
    const p = await asUser(u, `company_profile_versions?id=eq.${pubId}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ kind: "manual" }) });
    ok((p.status >= 400 || (Array.isArray(p.body) && p.body.length === 0)) && (await rows(`company_profile_versions?id=eq.${pubId}&select=kind`))[0].kind === "publish", `${k}: relabelling it 'manual' refused (${p.status}), still 'publish'`);
    const f = await asUser(u, "company_profile_versions", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ company_id: X, slug: SLUG, profile: {}, note: "forged", kind: "publish" }) });
    ok(f.status >= 400, `${k}: forging a 'publish' snapshot refused (${f.status})`);
  }
  for (const k of ["COADMIN", "EDITOR", "STAFF"]) {
    const g = await asUser(who[k], `company_profile_versions?company_id=eq.${X}&select=id`);
    ok(g.status === 200 && Array.isArray(g.body) && g.body.length === 0, `${k}: direct table read returns nothing (history only through the route)`);
  }

  console.log("\n  CONCIERGE SAVE + PRUNE (platform admin, as src/lib/profileSafety.js does)");
  const manualIds = [];
  for (let i = 0; i < 23; i++) {
    const s = await asUser(who.ADMIN, "company_profile_versions", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: X, slug: SLUG, profile: { pp: { n: i } }, note: `Account Management edit ${i}`, created_by: who.ADMIN.id }) });
    if (Array.isArray(s.body) && s.body[0]) manualIds.push(s.body[0].id);
  }
  ok(manualIds.length === 23, "23 concierge snapshots (kind defaults to 'manual')");
  const patched = await asUser(who.ADMIN, `companies?slug=eq.${SLUG}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ profile: { ...live3, companyStatus: { statusHeadline: "concierge edit" } } }) });
  ok(patched.status === 200 && patched.body.length === 1, "concierge direct-to-live save still works (approved exception)");
  // pruneVersions(), exactly: list manual newest-first, delete beyond 20.
  const list = await asUser(who.ADMIN, `company_profile_versions?company_id=eq.${X}&kind=eq.manual&select=id&order=created_at.desc&limit=200`);
  const stale = list.body.slice(20).map((x) => x.id);
  const del = await asUser(who.ADMIN, `company_profile_versions?id=in.(${stale.join(",")})`, { method: "DELETE" });
  const after = await rows(`company_profile_versions?company_id=eq.${X}&select=kind`);
  ok(del.status < 300 && after.filter((x) => x.kind === "manual").length === 20 && after.filter((x) => x.kind === "publish").length === 4, `prune: manual 23 -> 20; all 4 publish snapshots kept`);
  const oldStyle = await asUser(who.ADMIN, `company_profile_versions?company_id=eq.${X}&order=created_at.asc&limit=1`, { method: "DELETE" });
  ok(oldStyle.status >= 400 && (await rows(`company_profile_versions?company_id=eq.${X}&kind=eq.publish&select=id`)).length === 4, `the OLD prune (oldest of any kind) is refused when it reaches a publish snapshot (${oldStyle.status})`);
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  try { server.kill(); } catch {}
  if (X) {
    console.log("\n  COMPANY DELETION (platform admin, ordinary REST path)");
    const d = await asUser(who.ADMIN, `companies?id=eq.${X}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
    const left = { company: (await rows(`companies?id=eq.${X}&select=id`)).length, versions: (await rows(`company_profile_versions?company_id=eq.${X}&select=id`)).length, drafts: (await rows(`company_profile_drafts?company_id=eq.${X}&select=company_id`)).length, activity: (await rows(`activity_log?company_id=eq.${X}&select=id`)).length, memberships: (await rows(`company_memberships?company_id=eq.${X}&select=id`)).length };
    ok(d.status < 300 && Object.values(left).every((n) => n === 0), `deleting the company removes it and its history, draft, audit rows and memberships (${JSON.stringify(left)})`);
  }
}
console.log(`\n  profile-history-live (staging): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
