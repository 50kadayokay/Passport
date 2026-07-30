// Checkpoint 1 — publish SPINE backend tests (service role, live Supabase).
//
// Proves the hardened spine: versioned publish/unpublish events, idempotency,
// publish-capable-role authorization, execute-locked RPCs, private outbox, and the
// LEASE-BASED dispatcher (claim → processing → succeeded / backoff / dead-letter /
// no-double-claim / reclaim-after-lease-expiry / stolen-lease rejection) plus
// listener subscription filtering. Tagged throwaway rows, deleted at the end.
// Requires migration 0008_publish_spine.sql applied.
//
//   SUPABASE_SERVICE_ROLE_KEY=… node scripts/spine-test.mjs

import { readFileSync } from "node:fs";

const SB = process.env.VITE_SUPABASE_URL || "https://rvptronniomlqumjhyrr.supabase.co";
const ANON = process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_NNxikHZSGZ0CYnzN7jckLg_vPvrRCTl";

function serviceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
  if (process.env.SUPABASE_SERVICE_KEY) return process.env.SUPABASE_SERVICE_KEY.trim();
  try {
    const raw = readFileSync(new URL("../.env.import", import.meta.url), "utf8");
    const m = /SUPABASE_SERVICE_(?:ROLE_)?KEY\s*=\s*(.+)/.exec(raw);
    if (m) return m[1].trim();
  } catch {}
  throw new Error("SUPABASE_SERVICE_ROLE_KEY not found (env or .env.import).");
}
const SERVICE = serviceKey();
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json" };
const anonHdr = { apikey: ANON, Authorization: `Bearer ${ANON}`, "content-type": "application/json" };
const userHdr = (tok) => ({ apikey: ANON, Authorization: `Bearer ${tok}`, "content-type": "application/json" });
const tag = "spine-" + Math.floor(Date.parse("2026-07-18") % 100000) + "-" + Math.floor(performance.now());

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`); } };
const j = async (r) => { try { return await r.json(); } catch { return null; } };
const rpc = (fn, body, headers = svc) => fetch(`${SB}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(body) });
const rest = (path, opts = {}) => fetch(`${SB}/rest/v1/${path}`, { headers: svc, ...opts });

async function mkUser(email, pw) {
  const r = await fetch(`${SB}/auth/v1/admin/users`, { method: "POST", headers: svc, body: JSON.stringify({ email, password: pw, email_confirm: true }) });
  const d = await j(r); if (!r.ok || !d?.id) throw new Error(`mkUser: ${JSON.stringify(d)}`); return d.id;
}
async function signIn(email, pw) {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: anonHdr, body: JSON.stringify({ email, password: pw }) });
  const d = await j(r); if (!r.ok || !d?.access_token) throw new Error(`signIn: ${JSON.stringify(d)}`); return d.access_token;
}
async function mkCompany(slug, name, owner) {
  const r = await rest("companies", { method: "POST", headers: { ...svc, Prefer: "return=representation" }, body: JSON.stringify({ slug, name, owner_id: owner, status: "draft" }) });
  const d = await j(r); if (!r.ok || !d?.[0]?.id) throw new Error(`mkCompany: ${JSON.stringify(d)}`); return d[0].id;
}
async function addMember(company, user, role) {
  const r = await rest("company_memberships", { method: "POST", headers: { ...svc, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ company_id: company, user_id: user, role, status: "active" }) });
  if (!r.ok) throw new Error(`addMember(${role}): ${r.status}`);
}
async function mkPub(company, headline) {
  const u = await j(await rest("updates", { method: "POST", headers: { ...svc, Prefer: "return=representation" }, body: JSON.stringify({ company_id: company, body: "b", status: "draft" }) }));
  const p = await j(await rest("publications", { method: "POST", headers: { ...svc, Prefer: "return=representation" }, body: JSON.stringify({ company_id: company, update_id: u[0].id, destination_id: "passport", status: "draft", content: { headline, body: "Body." } }) }));
  if (!p?.[0]?.id) throw new Error(`mkPub: ${JSON.stringify(p)}`); return p[0].id;
}
const seedSub = (listener, type) => rest("listener_subscriptions", { method: "POST", headers: { ...svc, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ listener, event_type: type }) });
const eventsFor = async (pubId, type) => j(await rest(`events?publication_id=eq.${pubId}${type ? `&event_type=eq.${type}` : ""}&select=id,event_type,event_version,idempotency_key`));
const delivery = async (eventId, listener) => j(await rest(`event_deliveries?event_id=eq.${eventId}&listener=eq.${listener}&select=status,attempts,locked_by,lease_expires_at,next_attempt_at`));

async function main() {
  console.log(`\nPublish spine test  (tag=${tag})\n`);
  const created = { users: [], companies: [], listeners: [] };
  const pw = "Test-" + tag + "-pw!";
  try {
    const owner = await mkUser(`${tag}-o@spine.test`, pw); created.users.push(owner);
    const publisher = await mkUser(`${tag}-p@spine.test`, pw); created.users.push(publisher);
    const editor = await mkUser(`${tag}-e@spine.test`, pw); created.users.push(editor);
    const stranger = await mkUser(`${tag}-x@spine.test`, pw); created.users.push(stranger);
    const compA = await mkCompany(`${tag}-a`, "Spine A", owner); created.companies.push(compA);
    await addMember(compA, publisher, "publisher");
    await addMember(compA, editor, "editor");

    console.log("Publish RPC + idempotency:");
    const pub1 = await mkPub(compA, "Hole LC-27 completed");
    const p1 = await j(await rpc("publish_publication", { p_publication_id: pub1, p_actor: owner }));
    ok("owner publish returns ok", p1 && p1.ok === true, JSON.stringify(p1));
    const ev1 = await eventsFor(pub1, "PUBLICATION_PUBLISHED");
    ok("emits exactly one PUBLICATION_PUBLISHED v1", Array.isArray(ev1) && ev1.length === 1 && ev1[0].event_version === 1, JSON.stringify(ev1));
    ok("idempotency key is publish:<id>:1", ev1?.[0]?.idempotency_key === `publish:${pub1}:1`, ev1?.[0]?.idempotency_key);
    const p1b = await j(await rpc("publish_publication", { p_publication_id: pub1, p_actor: owner }));
    ok("re-publish is idempotent (already)", p1b?.ok === true && p1b.already === true, JSON.stringify(p1b));
    ok("no duplicate event on re-publish", (await eventsFor(pub1, "PUBLICATION_PUBLISHED")).length === 1);

    console.log("\nAuthorization (publish-capable roles only):");
    const pubP = await mkPub(compA, "By publisher");
    ok("publisher role CAN publish", (await j(await rpc("publish_publication", { p_publication_id: pubP, p_actor: publisher })))?.ok === true);
    const pubE = await mkPub(compA, "By editor");
    const rE = await j(await rpc("publish_publication", { p_publication_id: pubE, p_actor: editor }));
    ok("editor role is REJECTED", rE?.ok === false && rE.error === "forbidden", JSON.stringify(rE));
    const pubX = await mkPub(compA, "By stranger");
    const rX = await j(await rpc("publish_publication", { p_publication_id: pubX, p_actor: stranger }));
    ok("non-member is REJECTED", rX?.ok === false && rX.error === "forbidden", JSON.stringify(rX));
    ok("rejected publishes emit no events", (await eventsFor(pubE)).length === 0 && (await eventsFor(pubX)).length === 0);

    console.log("\nProtected functions inaccessible to anon/authenticated:");
    const tokOwner = await signIn(`${tag}-o@spine.test`, pw);
    const FNS = [
      ["publish_publication", { p_publication_id: pubX, p_actor: owner }],
      ["unpublish_publication", { p_publication_id: pub1, p_actor: owner }],
      ["claim_deliveries", { p_listener: "x", p_worker: "w" }],
      ["complete_delivery", { p_event_id: "00000000-0000-0000-0000-000000000000", p_listener: "x", p_worker: "w", p_ok: true }],
      ["replay_delivery", { p_event_id: "00000000-0000-0000-0000-000000000000", p_listener: "x" }],
      ["actor_can_publish", { p_company: compA, p_actor: owner }],
    ];
    let anonBlocked = 0, authBlocked = 0;
    for (const [fn, body] of FNS) {
      if (!(await rpc(fn, body, anonHdr)).ok) anonBlocked++;
      if (!(await rpc(fn, body, userHdr(tokOwner))).ok) authBlocked++;
    }
    ok("all 6 spine RPCs blocked for anon", anonBlocked === 6, `${anonBlocked}/6`);
    ok("all 6 spine RPCs blocked for authenticated", authBlocked === 6, `${authBlocked}/6`);
    ok("client cannot read the outbox", (await j(await fetch(`${SB}/rest/v1/events?select=id&limit=1`, { headers: userHdr(tokOwner) })) || []).length === 0);

    console.log("\nUnpublish → outbox event:");
    const un = await j(await rpc("unpublish_publication", { p_publication_id: pub1, p_actor: owner }));
    ok("unpublish ok", un?.ok === true, JSON.stringify(un));
    const evUn = await eventsFor(pub1, "PUBLICATION_UNPUBLISHED");
    ok("emits PUBLICATION_UNPUBLISHED", Array.isArray(evUn) && evUn.length === 1);

    console.log("\nListener subscription filtering:");
    const Lpub = `${tag}_pubonly_v1`; created.listeners.push(Lpub);
    await seedSub(Lpub, "PUBLICATION_PUBLISHED");   // supports published only, NOT unpublished
    await rpc("claim_deliveries", { p_listener: Lpub, p_worker: "w0", p_limit: 50 });
    const unpubDelivery = await delivery(evUn[0].id, Lpub);
    ok("unsupported event type creates NO delivery", Array.isArray(unpubDelivery) && unpubDelivery.length === 0, JSON.stringify(unpubDelivery));
    const pubDelivery = await delivery(ev1[0].id, Lpub);
    ok("supported event type DOES create a delivery", Array.isArray(pubDelivery) && pubDelivery.length === 1, JSON.stringify(pubDelivery));

    console.log("\nDispatcher lease plumbing:");
    const L = `${tag}_lease_v1`; created.listeners.push(L);
    await seedSub(L, "PUBLICATION_PUBLISHED");
    const claimed = await j(await rpc("claim_deliveries", { p_listener: L, p_worker: "w1", p_limit: 50, p_lease_seconds: 120 }));
    ok("claim returns supported events + marks processing", Array.isArray(claimed) && claimed.length >= 2, `claimed ${claimed?.length}`);
    const reclaimSame = await j(await rpc("claim_deliveries", { p_listener: L, p_worker: "w2", p_limit: 50, p_lease_seconds: 120 }));
    ok("concurrent worker cannot claim an active lease", Array.isArray(reclaimSame) && reclaimSame.length === 0, `got ${reclaimSame?.length}`);
    // success (worker holds lease)
    const okComplete = await j(await rpc("complete_delivery", { p_event_id: claimed[0].id, p_listener: L, p_worker: "w1", p_ok: true }));
    ok("complete(ok) by lease holder → true", okComplete === true, JSON.stringify(okComplete));
    ok("delivery is succeeded", (await delivery(claimed[0].id, L))?.[0]?.status === "succeeded");
    // failure → backoff
    await rpc("complete_delivery", { p_event_id: claimed[1].id, p_listener: L, p_worker: "w1", p_ok: false, p_error: "boom" });
    const d2 = await delivery(claimed[1].id, L);
    ok("complete(fail) → failed with future backoff + lease cleared", d2?.[0]?.status === "failed" && d2[0].locked_by === null && Date.parse(d2[0].next_attempt_at) > Date.parse("2026-07-18T00:00:00Z"), JSON.stringify(d2));

    console.log("\nLease reclaim after expiry + stolen-lease rejection:");
    const R = `${tag}_reclaim_v1`; created.listeners.push(R);
    await seedSub(R, "PUBLICATION_PUBLISHED");
    // Claim ALL of R's deliveries first (valid leases), so the only reclaimable row
    // afterwards is the one whose lease we deliberately expire — making the test
    // observe reclaim in isolation.
    const rc = await j(await rpc("claim_deliveries", { p_listener: R, p_worker: "wA", p_limit: 100, p_lease_seconds: 120 }));
    const rcEvent = rc?.[0];
    ok("first worker claims deliveries", Array.isArray(rc) && rc.length >= 1, JSON.stringify(rc));
    // simulate crash: force this one delivery's lease to have already expired
    await rest(`event_deliveries?event_id=eq.${rcEvent.id}&listener=eq.${R}`, { method: "PATCH", headers: { ...svc, Prefer: "return=minimal" }, body: JSON.stringify({ lease_expires_at: "2020-01-01T00:00:00Z" }) });
    const rc2 = await j(await rpc("claim_deliveries", { p_listener: R, p_worker: "wB", p_limit: 100, p_lease_seconds: 120 }));
    ok("only the expired-lease delivery is reclaimed by a new worker", Array.isArray(rc2) && rc2.length === 1 && rc2[0].id === rcEvent.id, JSON.stringify(rc2));
    const rcDel = await delivery(rcEvent.id, R);
    ok("reclaimed delivery is now owned by the new worker", rcDel?.[0]?.locked_by === "wB", JSON.stringify(rcDel));
    const stale = await j(await rpc("complete_delivery", { p_event_id: rcEvent.id, p_listener: R, p_worker: "wA", p_ok: true }));
    ok("stale worker's completion is rejected (lease stolen)", stale === false, JSON.stringify(stale));
    ok("delivery remains owned by the reclaiming worker", (await delivery(rcEvent.id, R))?.[0]?.locked_by === "wB");

    console.log("\nDead-letter:");
    const Dl = `${tag}_dead_v1`; created.listeners.push(Dl);
    await seedSub(Dl, "PUBLICATION_PUBLISHED");
    const dc = await j(await rpc("claim_deliveries", { p_listener: Dl, p_worker: "wd", p_limit: 1 }));
    if (dc?.[0]) {
      await rpc("complete_delivery", { p_event_id: dc[0].id, p_listener: Dl, p_worker: "wd", p_ok: false, p_error: "boom", p_max_attempts: 1 });
      ok("dead-letter after attempt limit", (await delivery(dc[0].id, Dl))?.[0]?.status === "dead");
    } else ok("dead-letter after attempt limit", false, "no event to claim");

  } catch (e) {
    fail++; console.log(`\n  ✗ fatal: ${e.message}`);
  } finally {
    console.log("\nCleanup…");
    for (const l of created.listeners) await rest(`listener_subscriptions?listener=eq.${l}`, { method: "DELETE", headers: svc }).catch(() => {});
    for (const c of created.companies) await rest(`companies?id=eq.${c}`, { method: "DELETE", headers: svc }).catch(() => {});
    for (const u of created.users) await fetch(`${SB}/auth/v1/admin/users/${u}`, { method: "DELETE", headers: svc }).catch(() => {});
    console.log("  cleaned up.");
  }
  console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"}  —  ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}
main();
