// Checkpoint 3–4 — dispatcher LISTENER tests (service role, live Supabase).
//
// Runs the real feed_projection_v1 and in_app_notifications_v1 handlers against
// live data and asserts: publish → one post (idempotent), unpublish → soft-remove,
// re-publish → visible again, notifications go ONLY to eligible followers (muted and
// below-threshold and non-followers excluded), notifications idempotent, and the
// projected post flows through Following/Latest. Requires 0009_feed_listeners.sql.
//
//   SUPABASE_SERVICE_ROLE_KEY=… node scripts/listener-test.mjs

import { readFileSync } from "node:fs";
import { feedProjectionV1, inAppNotificationsV1 } from "../api/_listeners.js";

const SB = process.env.VITE_SUPABASE_URL || "https://rvptronniomlqumjhyrr.supabase.co";
const ANON = process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_NNxikHZSGZ0CYnzN7jckLg_vPvrRCTl";
function serviceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
  if (process.env.SUPABASE_SERVICE_KEY) return process.env.SUPABASE_SERVICE_KEY.trim();
  try { const raw = readFileSync(new URL("../.env.import", import.meta.url), "utf8"); const m = /SUPABASE_SERVICE_(?:ROLE_)?KEY\s*=\s*(.+)/.exec(raw); if (m) return m[1].trim(); } catch {}
  throw new Error("service key not found");
}
const SERVICE = serviceKey();
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json" };
const anonHdr = { apikey: ANON, "content-type": "application/json" };
const userHdr = (t) => ({ apikey: ANON, Authorization: `Bearer ${t}`, "content-type": "application/json" });
const tag = "lstn-" + Math.floor(Date.parse("2026-07-18") % 100000) + "-" + Math.floor(performance.now());

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? `  — ${d}` : ""}`); } };
const j = async (r) => { try { return await r.json(); } catch { return null; } };

// service-role db injected into the handlers (mirrors api/_service serviceDb).
const db = {
  async getJson(path) { const r = await fetch(`${SB}/rest/v1/${path}`, { headers: svc }); if (!r.ok) return null; return j(r); },
  write(path, { method = "POST", body, prefer } = {}) { return fetch(`${SB}/rest/v1/${path}`, { method, headers: { ...svc, ...(prefer ? { Prefer: prefer } : {}) }, body: body ? JSON.stringify(body) : undefined }); },
};
const rest = (path, opts = {}) => fetch(`${SB}/rest/v1/${path}`, { headers: svc, ...opts });
const rpc = (fn, body, headers = svc) => fetch(`${SB}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(body) });

async function mkUser(email, pw) { const r = await fetch(`${SB}/auth/v1/admin/users`, { method: "POST", headers: svc, body: JSON.stringify({ email, password: pw, email_confirm: true }) }); const d = await j(r); if (!d?.id) throw new Error(`mkUser ${JSON.stringify(d)}`); return d.id; }
async function signIn(email, pw) { const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: anonHdr, body: JSON.stringify({ email, password: pw }) }); const d = await j(r); return d.access_token; }

async function main() {
  console.log(`\nListener test  (tag=${tag})\n`);
  const created = { users: [], companies: [] };
  const pw = "Test-" + tag + "-pw!";
  try {
    const owner = await mkUser(`${tag}-o@l.test`, pw); created.users.push(owner);
    const f1 = await mkUser(`${tag}-1@l.test`, pw); created.users.push(f1);
    const f2 = await mkUser(`${tag}-2@l.test`, pw); created.users.push(f2);
    const f3 = await mkUser(`${tag}-3@l.test`, pw); created.users.push(f3);
    const f4 = await mkUser(`${tag}-4@l.test`, pw); created.users.push(f4);

    const comp = (await j(await rest("companies", { method: "POST", headers: { ...svc, Prefer: "return=representation" }, body: JSON.stringify({ slug: `${tag}`, name: "Listener Co", owner_id: owner, status: "published" }) })))[0].id;
    created.companies.push(comp);
    const upd = (await j(await rest("updates", { method: "POST", headers: { ...svc, Prefer: "return=representation" }, body: JSON.stringify({ company_id: comp, body: "b", status: "draft", detected: { materiality: "High" } }) })))[0].id;
    const pub = (await j(await rest("publications", { method: "POST", headers: { ...svc, Prefer: "return=representation" }, body: JSON.stringify({ company_id: comp, update_id: upd, destination_id: "passport", status: "draft", content: { headline: "Drill results at LC-27", body: "Assays." } }) })))[0].id;

    // follows + prefs (F1 default, F2 muted, F4 high threshold, F3 not following)
    await rest("company_follows", { method: "POST", headers: { ...svc, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ user_id: f1, company_id: comp }, { user_id: f2, company_id: comp }, { user_id: f4, company_id: comp }]) });
    await rest("notification_prefs", { method: "POST", headers: { ...svc, Prefer: "return=minimal" }, body: JSON.stringify({ user_id: f2, company_id: comp, channel: "in_app", muted: true }) });
    await rest("notification_prefs", { method: "POST", headers: { ...svc, Prefer: "return=minimal" }, body: JSON.stringify({ user_id: f4, company_id: null, channel: "in_app", min_materiality: 90 }) });

    // publish → event
    const p = await j(await rpc("publish_publication", { p_publication_id: pub, p_actor: owner }));
    ok("publish emitted event", p?.ok === true, JSON.stringify(p));
    const evPub = { event_type: "PUBLICATION_PUBLISHED", publication_id: pub, company_id: comp };

    console.log("feed_projection_v1:");
    await feedProjectionV1(evPub, db);
    let posts = await j(await rest(`posts?publication_id=eq.${pub}&select=id,title,materiality_label,materiality_score,removed_at`));
    ok("publish → one post with mapped materiality", Array.isArray(posts) && posts.length === 1 && posts[0].title === "Drill results at LC-27" && posts[0].materiality_label === "High" && posts[0].materiality_score === 70, JSON.stringify(posts));
    const postId = posts[0].id;
    await feedProjectionV1(evPub, db);
    posts = await j(await rest(`posts?publication_id=eq.${pub}&select=id`));
    ok("re-run is idempotent (still one post)", posts.length === 1);

    console.log("\nin_app_notifications_v1 (eligibility + prefs):");
    await inAppNotificationsV1(evPub, db);
    const notifFor = async (u) => (await j(await rest(`notifications?user_id=eq.${u}&post_id=eq.${postId}&select=id,title,deep_link`))) || [];
    ok("follower with default prefs IS notified", (await notifFor(f1)).length === 1);
    ok("notification deep-links to the post", (await notifFor(f1))[0]?.deep_link === `/p/${postId}`);
    ok("muted follower is NOT notified", (await notifFor(f2)).length === 0);
    ok("below-threshold follower is NOT notified", (await notifFor(f4)).length === 0);
    ok("non-follower is NOT notified", (await notifFor(f3)).length === 0);
    await inAppNotificationsV1(evPub, db);
    ok("notifications are idempotent (no duplicate)", (await notifFor(f1)).length === 1);

    console.log("\nUnpublish → soft-remove → re-publish:");
    await j(await rpc("unpublish_publication", { p_publication_id: pub, p_actor: owner }));
    await feedProjectionV1({ event_type: "PUBLICATION_UNPUBLISHED", publication_id: pub, company_id: comp }, db);
    ok("unpublish soft-removes the post", (await j(await rest(`posts?publication_id=eq.${pub}&select=removed_at`)))[0]?.removed_at != null);
    await j(await rpc("publish_publication", { p_publication_id: pub, p_actor: owner }));
    await feedProjectionV1(evPub, db);
    ok("re-publish makes it visible again", (await j(await rest(`posts?publication_id=eq.${pub}&select=removed_at`)))[0]?.removed_at == null);

    console.log("\nFeeds round-trip:");
    const t1 = await signIn(`${tag}-1@l.test`, pw);
    const t3 = await signIn(`${tag}-3@l.test`, pw);
    const latest = await j(await rpc("feed_latest", { p_limit: 50 }, userHdr(t1)));
    ok("post appears in Latest", Array.isArray(latest) && latest.some((x) => x.id === postId));
    const foll1 = await j(await rpc("feed_following", { p_limit: 50 }, userHdr(t1)));
    ok("post appears in follower's Following", Array.isArray(foll1) && foll1.some((x) => x.id === postId));
    const foll3 = await j(await rpc("feed_following", { p_limit: 50 }, userHdr(t3)));
    ok("post absent from non-follower's Following", Array.isArray(foll3) && !foll3.some((x) => x.id === postId));

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
