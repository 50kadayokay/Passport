// Checkpoint 6 gate — PRODUCTION smoke test through the deployed /api/publish.
//
// Exercises the full chain in prod: /api/publish → RPC → outbox event → best-effort
// dispatch → feed_projection_v1 (post) + in_app_notifications_v1 (notification).
// Also verifies unauthorized publish is rejected and unpublish soft-removes.
// Uses the service role for setup/verification/cleanup; hits the real endpoint for
// the publish action with a genuine user token. MUST be green before applying the
// 0010 lockdown.
//
//   PROD_URL=https://passport-xi-five.vercel.app node scripts/publish-endpoint-test.mjs

import { readFileSync } from "node:fs";

const SB = process.env.VITE_SUPABASE_URL || "https://rvptronniomlqumjhyrr.supabase.co";
const ANON = process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_NNxikHZSGZ0CYnzN7jckLg_vPvrRCTl";
const PROD = process.env.PROD_URL || "https://passport-xi-five.vercel.app";
function serviceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
  if (process.env.SUPABASE_SERVICE_KEY) return process.env.SUPABASE_SERVICE_KEY.trim();
  try { const raw = readFileSync(new URL("../.env.import", import.meta.url), "utf8"); const m = /SUPABASE_SERVICE_(?:ROLE_)?KEY\s*=\s*(.+)/.exec(raw); if (m) return m[1].trim(); } catch {}
  throw new Error("service key not found");
}
const SERVICE = serviceKey();
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json" };
const anonHdr = { apikey: ANON, "content-type": "application/json" };
const tag = "endp-" + Math.floor(Date.parse("2026-07-18") % 100000) + "-" + Math.floor(performance.now());

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? `  — ${d}` : ""}`); } };
const j = async (r) => { try { return await r.json(); } catch { return null; } };
const rest = (path, opts = {}) => fetch(`${SB}/rest/v1/${path}`, { headers: svc, ...opts });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mkUser(email, pw) { const r = await fetch(`${SB}/auth/v1/admin/users`, { method: "POST", headers: svc, body: JSON.stringify({ email, password: pw, email_confirm: true }) }); return (await j(r)).id; }
async function signIn(email, pw) { const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: anonHdr, body: JSON.stringify({ email, password: pw }) }); return (await j(r)).access_token; }
async function mkPub(company, headline) {
  const u = (await j(await rest("updates", { method: "POST", headers: { ...svc, Prefer: "return=representation" }, body: JSON.stringify({ company_id: company, body: "b", status: "draft", detected: { materiality: "High" } }) })))[0].id;
  return (await j(await rest("publications", { method: "POST", headers: { ...svc, Prefer: "return=representation" }, body: JSON.stringify({ company_id: company, update_id: u, destination_id: "passport", status: "approved", content: { headline, body: "Body." } }) })))[0].id;
}
const apiPublish = (path, token, publicationId) => fetch(`${PROD}${path}`, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ publicationId }) });
async function pollPost(pubId, { removed = false, tries = 12 } = {}) {
  for (let i = 0; i < tries; i++) {
    const rows = await j(await rest(`posts?publication_id=eq.${pubId}&select=id,removed_at`));
    const p = rows && rows[0];
    if (p && (removed ? p.removed_at != null : p.removed_at == null)) return p;
    await sleep(1000);
  }
  return null;
}

async function main() {
  console.log(`\nProduction /api/publish smoke test  (tag=${tag})\n  endpoint: ${PROD}\n`);
  const created = { users: [], companies: [] };
  const pw = "Test-" + tag + "-pw!";
  try {
    const owner = await mkUser(`${tag}-o@e.test`, pw); created.users.push(owner);
    const follower = await mkUser(`${tag}-f@e.test`, pw); created.users.push(follower);
    const stranger = await mkUser(`${tag}-x@e.test`, pw); created.users.push(stranger);
    const comp = (await j(await rest("companies", { method: "POST", headers: { ...svc, Prefer: "return=representation" }, body: JSON.stringify({ slug: `${tag}`, name: "Endpoint Co", owner_id: owner, status: "published" }) })))[0].id;
    created.companies.push(comp);
    // A publishing company is a subscribed company — grant the base plan so the
    // endpoint's entitlement check (my_features) passes, exactly as in production.
    await rest("company_subscriptions", { method: "POST", headers: { ...svc, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ company_id: comp, plan_id: "passport", status: "active" }) });
    await rest("company_follows", { method: "POST", headers: { ...svc, Prefer: "return=minimal" }, body: JSON.stringify({ user_id: follower, company_id: comp }) });
    const pub1 = await mkPub(comp, "LC-27 assays returned");

    const tokenOwner = await signIn(`${tag}-o@e.test`, pw);
    console.log("Publish through the deployed endpoint:");
    const pubResp = await apiPublish("/api/publish", tokenOwner, pub1);
    const pubJson = await j(pubResp);
    ok("POST /api/publish → 200 ok", pubResp.status === 200 && pubJson?.ok === true, `${pubResp.status} ${JSON.stringify(pubJson)}`);
    const row = await j(await rest(`publications?id=eq.${pub1}&select=status`));
    ok("publication is now published", row?.[0]?.status === "published");
    const ev = await j(await rest(`events?publication_id=eq.${pub1}&event_type=eq.PUBLICATION_PUBLISHED&select=id`));
    ok("outbox event emitted", Array.isArray(ev) && ev.length === 1);

    console.log("\nDispatcher (best-effort + cron) projects the post:");
    const post = await pollPost(pub1);
    ok("post appears via the real dispatcher", !!post, "post did not project within timeout");
    if (post) {
      const notif = await j(await rest(`notifications?user_id=eq.${follower}&post_id=eq.${post.id}&select=id`));
      ok("follower received a notification", Array.isArray(notif) && notif.length === 1);
    }

    console.log("\nAuthorization at the endpoint:");
    const pub2 = await mkPub(comp, "Second");
    const tokenStranger = await signIn(`${tag}-x@e.test`, pw);
    const forb = await apiPublish("/api/publish", tokenStranger, pub2);
    ok("non-member publish is rejected", forb.status === 403 || forb.status === 404, `status ${forb.status}`);
    ok("that publication stays unpublished", (await j(await rest(`publications?id=eq.${pub2}&select=status`)))?.[0]?.status !== "published");

    console.log("\nUnpublish through the deployed endpoint:");
    const unResp = await apiPublish("/api/unpublish", tokenOwner, pub1);
    ok("POST /api/unpublish → 200 ok", unResp.status === 200);
    const removed = await pollPost(pub1, { removed: true });
    ok("post is soft-removed via dispatcher", !!removed);

    // Only meaningful AFTER the 0010 lockdown is applied.
    if (process.env.EXPECT_LOCKDOWN) {
      console.log("\nDirect-publish lockdown:");
      const pub3 = await mkPub(comp, "Direct attempt");
      await fetch(`${SB}/rest/v1/publications?id=eq.${pub3}`, { method: "PATCH", headers: { apikey: ANON, Authorization: `Bearer ${tokenOwner}`, "content-type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ status: "published" }) });
      const st = (await j(await rest(`publications?id=eq.${pub3}&select=status`)))?.[0]?.status;
      ok("direct client PATCH to status=published is BLOCKED", st !== "published", `ended at status=${st}`);
    }

  } catch (e) { fail++; console.log(`\n  ✗ fatal: ${e.message}`); }
  finally {
    console.log("\nCleanup…");
    for (const c of created.companies) await rest(`companies?id=eq.${c}`, { method: "DELETE", headers: svc }).catch(() => {});
    for (const u of created.users) await fetch(`${SB}/auth/v1/admin/users/${u}`, { method: "DELETE", headers: svc }).catch(() => {});
    console.log("  cleaned up.");
  }
  console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"}  —  ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}
main();
